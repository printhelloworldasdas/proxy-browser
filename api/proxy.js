import fetch from 'node-fetch';
import { createHash } from 'crypto';

export default async function handler(req, res) {
  // Headers CORS más completos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,User-Agent,Cache-Control,Pragma');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let target = req.query.url;
  if (!target) return res.status(400).json({ error: 'No URL provided' });

  // Decodificar URL si está codificada múltiples veces
  try {
    while (target !== decodeURIComponent(target)) {
      target = decodeURIComponent(target);
    }
  } catch (e) {
    console.error('Error decoding URL:', e);
  }

  // Asegurar protocolo
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    if (target.startsWith('//')) {
      target = 'https:' + target;
    } else if (!target.startsWith('/')) {
      target = 'https://' + target;
    }
  }

  // Manejar URLs relativas mejorado
  if (target.startsWith('/')) {
    const referer = req.headers['referer'] || req.headers['origin'];
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const proxyParam = refererUrl.searchParams.get('url');
        if (proxyParam) {
          const baseUrl = new URL(proxyParam);
          target = new URL(target, baseUrl.origin).toString();
        } else {
          // Fallback al origen del referer
          target = new URL(target, refererUrl.origin).toString();
        }
      } catch (e) {
        console.error('Error parsing referer:', e);
        return res.status(400).json({ error: 'Invalid relative URL' });
      }
    } else {
      return res.status(400).json({ error: 'Relative URL without referer' });
    }
  }

  try {
    // Headers más completos y realistas
    const requestHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9,es;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    };

    // Preservar headers importantes del cliente
    const preserveHeaders = ['authorization', 'cookie', 'x-requested-with', 'content-type', 'content-length'];
    preserveHeaders.forEach(header => {
      if (req.headers[header]) {
        requestHeaders[header] = req.headers[header];
      }
    });

    // Obtener el body si es POST/PUT/PATCH
    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
      }
    }

    const response = await fetch(target, {
      method: req.method,
      headers: requestHeaders,
      body: body,
      redirect: 'manual',
      timeout: 30000,
      follow: 0
    });

    // Manejar redirecciones
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        let redirectUrl;
        if (location.startsWith('http')) {
          redirectUrl = location;
        } else if (location.startsWith('//')) {
          redirectUrl = 'https:' + location;
        } else {
          const baseUrl = new URL(target);
          redirectUrl = new URL(location, baseUrl.origin).toString();
        }
        return res.redirect(302, `/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
      }
    }

    // Copiar headers de respuesta (filtrados)
    const excludeHeaders = [
      'content-encoding', 'content-length', 'transfer-encoding',
      'connection', 'keep-alive', 'upgrade', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailers', 'server',
      'x-frame-options', 'content-security-policy', 'strict-transport-security'
    ];

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.includes(lowerKey)) {
        res.setHeader(key, value);
      }
    });

    // Permitir iframe embedding
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Content-Security-Policy');

    const contentType = response.headers.get('content-type') || '';
    
    // Procesar contenido HTML
    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = rewriteHTML(html, target);
      res.send(html);
    } 
    // Procesar CSS
    else if (contentType.includes('text/css')) {
      let css = await response.text();
      css = rewriteCSS(css, target);
      res.setHeader('Content-Type', 'text/css');
      res.send(css);
    } 
    // Procesar JavaScript
    else if (contentType.includes('javascript') || contentType.includes('application/json')) {
      let js = await response.text();
      // Reescribir URLs en JavaScript de forma básica
      js = rewriteJavaScript(js, target);
      res.setHeader('Content-Type', contentType);
      res.send(js);
    } 
    // Otros contenidos (imágenes, archivos, etc.)
    else {
      res.status(response.status);
      response.body.pipe(res);
    }

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ 
      error: 'Proxy error', 
      message: err.message,
      target: target
    });
  }
}

function rewriteHTML(html, baseUrl) {
  const base = new URL(baseUrl);
  
  // Reescribir atributos href, src, action, etc.
  html = html.replace(
    /(href|src|action|data-src|data-href|srcset)=["']([^"']*)["']/gi,
    (match, attr, url) => {
      const newUrl = rewriteUrl(url, baseUrl);
      return `${attr}="${newUrl}"`;
    }
  );

  // Reescribir URLs en atributos de estilo
  html = html.replace(
    /style=["']([^"']*url\([^)]*\)[^"']*)["']/gi,
    (match, styleContent) => {
      const newStyle = rewriteCSS(styleContent, baseUrl);
      return `style="${newStyle}"`;
    }
  );

  // Reescribir meta refresh
  html = html.replace(
    /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'](\d+);url=([^"']*)["']/gi,
    (match, seconds, url) => {
      const newUrl = rewriteUrl(url, baseUrl);
      return match.replace(url, newUrl);
    }
  );

  // Inyectar script para interceptar fetch y XMLHttpRequest
  const interceptScript = `
    <script>
      (function() {
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
          if (typeof url === 'string' && !url.startsWith('/api/proxy')) {
            url = '/api/proxy?url=' + encodeURIComponent(url);
          }
          return originalFetch.call(this, url, options);
        };
        
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          if (typeof url === 'string' && !url.startsWith('/api/proxy')) {
            url = '/api/proxy?url=' + encodeURIComponent(url);
          }
          return originalOpen.call(this, method, url, async, user, password);
        };
        
        // Interceptar window.open
        const originalWindowOpen = window.open;
        window.open = function(url, target, features) {
          if (url && !url.startsWith('/api/proxy')) {
            url = '/api/proxy?url=' + encodeURIComponent(url);
          }
          return originalWindowOpen.call(this, url, target, features);
        };
      })();
    </script>
  `;

  // Insertar el script antes del cierre de head o al inicio de body
  if (html.includes('</head>')) {
    html = html.replace('</head>', interceptScript + '</head>');
  } else if (html.includes('<body')) {
    html = html.replace('<body', interceptScript + '<body');
  } else {
    html = interceptScript + html;
  }

  return html;
}

function rewriteCSS(css, baseUrl) {
  // Reescribir url() en CSS
  css = css.replace(
    /url\(["']?([^"')]*)["']?\)/gi,
    (match, url) => {
      const newUrl = rewriteUrl(url, baseUrl);
      return `url("${newUrl}")`;
    }
  );

  // Reescribir @import
  css = css.replace(
    /@import\s+["']([^"']*)["']/gi,
    (match, url) => {
      const newUrl = rewriteUrl(url, baseUrl);
      return `@import "${newUrl}"`;
    }
  );

  return css;
}

function rewriteJavaScript(js, baseUrl) {
  // Reescribir URLs comunes en JavaScript (básico)
  js = js.replace(
    /(["'])(https?:\/\/[^"']*)(["'])/gi,
    (match, quote1, url, quote2) => {
      if (!url.includes('/api/proxy')) {
        const newUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        return `${quote1}${newUrl}${quote2}`;
      }
      return match;
    }
  );

  return js;
}

function rewriteUrl(url, baseUrl) {
  if (!url || url.startsWith('/api/proxy') || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) {
    return url;
  }

  try {
    let fullUrl;
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      fullUrl = url;
    } else if (url.startsWith('//')) {
      fullUrl = 'https:' + url;
    } else if (url.startsWith('/')) {
      const base = new URL(baseUrl);
      fullUrl = new URL(url, base.origin).toString();
    } else {
      fullUrl = new URL(url, baseUrl).toString();
    }

    return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
  } catch (e) {
    console.error('Error rewriting URL:', url, e);
    return url;
  }
}
