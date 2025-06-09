import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

export default async function handler(req, res) {
  // Configuración CORS para permitir cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  let target = req.query.url;
  if (!target) {
    res.status(400).send('No URL provided');
    return;
  }

  // Manejo URLs relativas basado en referer y parámetro url
  if (target.startsWith('/')) {
    try {
      const referer = req.headers['referer'];
      if (referer) {
        const refererUrl = new URL(referer);
        const baseUrl = new URL(refererUrl.searchParams.get('url') || referer);
        target = new URL(target, baseUrl.origin).toString();
      }
    } catch {
      // ignorar error, dejar target como está
    }
  }

  // Validar URL segura
  try {
    new URL(target);
  } catch {
    res.status(400).send('Invalid URL');
    return;
  }

  // Construir cabeceras para la petición externa
  const outgoingHeaders = {};
  // Copiar cabeceras relevantes
  if (req.headers['user-agent']) outgoingHeaders['User-Agent'] = req.headers['user-agent'];
  if (req.headers['accept']) outgoingHeaders['Accept'] = req.headers['accept'];
  if (req.headers['accept-language']) outgoingHeaders['Accept-Language'] = req.headers['accept-language'];
  if (req.headers['cookie']) outgoingHeaders['Cookie'] = req.headers['cookie'];
  // Puedes agregar más cabeceras si quieres, con cuidado

  try {
    const fetchOptions = {
      method: req.method,
      headers: outgoingHeaders,
      redirect: 'manual',
    };

    // Pasar cuerpo en métodos que lo soportan
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = req;
    }

    const response = await fetch(target, fetchOptions);

    // Manejo de redirecciones manual
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      let location = response.headers.get('location');
      if (location) {
        if (!location.startsWith('http')) {
          const baseUrl = new URL(target);
          location = new URL(location, baseUrl.origin).toString();
        }
        res.writeHead(302, { Location: `/api/proxy?url=${encodeURIComponent(location)}` });
        res.end();
        return;
      }
    }

    // Filtrar cabeceras que no debemos copiar
    const excludedHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];
    response.headers.forEach((value, key) => {
      if (!excludedHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      // Parsear y reescribir URLs con jsdom
      const html = await response.text();
      const dom = new JSDOM(html, { url: target });
      const document = dom.window.document;

      // Función para reescribir URLs a proxy
      const rewriteUrl = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return `/api/proxy?url=${encodeURIComponent(url)}`;
        } else if (url.startsWith('//')) {
          return `/api/proxy?url=${encodeURIComponent('https:' + url)}`;
        } else if (url.startsWith('/')) {
          const baseUrl = new URL(target);
          return `/api/proxy?url=${encodeURIComponent(new URL(url, baseUrl.origin).toString())}`;
        }
        // URLs relativas simples
        const baseUrl = new URL(target);
        return `/api/proxy?url=${encodeURIComponent(new URL(url, baseUrl).toString())}`;
      };

      // Reescribir href, src, action en elementos
      ['a', 'link', 'img', 'script', 'form', 'iframe', 'source', 'video', 'audio'].forEach(tag => {
        const elements = document.querySelectorAll(tag);
        elements.forEach(el => {
          ['href', 'src', 'action', 'srcset'].forEach(attr => {
            if (el.hasAttribute(attr)) {
              const val = el.getAttribute(attr);
              if (val) {
                if (attr === 'srcset') {
                  // Reescribir múltiples URLs en srcset
                  const srcsetValues = val.split(',').map(part => {
                    const [urlPart, descriptor] = part.trim().split(/\s+/, 2);
                    return `${rewriteUrl(urlPart)}${descriptor ? ' ' + descriptor : ''}`;
                  });
                  el.setAttribute(attr, srcsetValues.join(', '));
                } else {
                  el.setAttribute(attr, rewriteUrl(val));
                }
              }
            }
          });
        });
      });

      // Reescribir URLs en estilos inline (style tags y atributos style)
      const styleElements = document.querySelectorAll('style');
      styleElements.forEach(styleEl => {
        styleEl.textContent = styleEl.textContent.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
          return `url(${rewriteUrl(url)})`;
        });
      });

      const allElements = document.querySelectorAll('[style]');
      allElements.forEach(el => {
        const style = el.getAttribute('style');
        if (style) {
          const newStyle = style.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
            return `url(${rewriteUrl(url)})`;
          });
          el.setAttribute('style', newStyle);
        }
      });

      res.status(response.status);
      res.send(dom.serialize());
    } else {
      // Para contenido no HTML, pasar el stream directo
      res.status(response.status);
      await streamPipeline(response.body, res);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error: ' + error.message);
  }
}
