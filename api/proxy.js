import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let target = req.query.url;
  if (!target) return res.status(400).send('No URL provided');

  // Manejar URLs relativas
  if (target.startsWith('/')) {
    const referer = req.headers['referer'];
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const proxyParam = new URL(referer).searchParams.get('url');
        if (proxyParam) {
          const baseUrl = new URL(proxyParam);
          target = new URL(target, baseUrl.origin).toString();
        }
      } catch (e) {
        console.error('Error parsing referer:', e);
      }
    }
  }

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      redirect: 'manual'
    });

    // Manejar redirecciones
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        let redirectUrl;
        if (location.startsWith('http')) {
          redirectUrl = location;
        } else {
          const baseUrl = new URL(target);
          redirectUrl = new URL(location, baseUrl.origin).toString();
        }
        return res.redirect(`/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
      }
    }

    // Copiar cabeceras
    const headers = {};
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(lowerKey)) {
        headers[key] = value;
      }
    });

    // Modificar contenido HTML para reescribir URLs
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Reescribir URLs en el HTML
      html = html.replace(
        /(href|src|action)=["']([^"']*)["']/gi,
        (match, attr, url) => {
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
            const fullUrl = url.startsWith('//') ? `https:${url}` : url;
            return `${attr}="/api/proxy?url=${encodeURIComponent(fullUrl)}"`;
          } else if (url.startsWith('/')) {
            const baseUrl = new URL(target);
            const fullUrl = new URL(url, baseUrl.origin).toString();
            return `${attr}="/api/proxy?url=${encodeURIComponent(fullUrl)}"`;
          }
          return match;
        }
      );

      // Reescribir URLs en scripts y estilos
      html = html.replace(
        /url\(["']?([^"')]*)["']?\)/gi,
        (match, url) => {
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
            const fullUrl = url.startsWith('//') ? `https:${url}` : url;
            return `url("/api/proxy?url=${encodeURIComponent(fullUrl)}")`;
          } else if (url.startsWith('/')) {
            const baseUrl = new URL(target);
            const fullUrl = new URL(url, baseUrl.origin).toString();
            return `url("/api/proxy?url=${encodeURIComponent(fullUrl)}")`;
          }
          return match;
        }
      );

      res.set(headers);
      res.send(html);
    } else {
      res.set(headers);
      response.body.pipe(res);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error: ' + err.message);
  }
}
