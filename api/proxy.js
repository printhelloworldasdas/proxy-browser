import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  let target = req.query.url;
  if (!target) {
    res.statusCode = 400;
    res.end('No URL provided');
    return;
  }

  // Manejar URLs relativas
  if (target.startsWith('/')) {
    const referer = req.headers['referer'];
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const proxyParam = refererUrl.searchParams.get('url');
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
    // Opciones para fetch
    const fetchOptions = {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      redirect: 'manual',
    };

    // Si método con body
    if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      fetchOptions.body = req.body;
      if (req.headers['content-type']) {
        fetchOptions.headers['Content-Type'] = req.headers['content-type'];
      }
    }

    const response = await fetch(target, fetchOptions);

    // Manejar redirecciones
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        let redirectUrl = location.startsWith('http')
          ? location
          : new URL(location, new URL(target).origin).toString();

        // Redirigir al proxy con la nueva URL
        res.statusCode = 302;
        res.setHeader('Location', `/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end();
        return;
      }
    }

    // Copiar headers excepto algunos problemáticos
    const headers = {};
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
        headers[key] = value;
      }
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Reescribir URLs (href, src, action)
      html = html.replace(/(href|src|action)=["']([^"']*)["']/gi, (match, attr, url) => {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
          const fullUrl = url.startsWith('//') ? `https:${url}` : url;
          return `${attr}="/api/proxy?url=${encodeURIComponent(fullUrl)}"`;
        } else if (url.startsWith('/')) {
          const baseUrl = new URL(target);
          const fullUrl = new URL(url, baseUrl.origin).toString();
          return `${attr}="/api/proxy?url=${encodeURIComponent(fullUrl)}"`;
        }
        return match;
      });

      // Reescribir URLs en CSS url()
      html = html.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
          const fullUrl = url.startsWith('//') ? `https:${url}` : url;
          return `url("/api/proxy?url=${encodeURIComponent(fullUrl)}")`;
        } else if (url.startsWith('/')) {
          const baseUrl = new URL(target);
          const fullUrl = new URL(url, baseUrl.origin).toString();
          return `url("/api/proxy?url=${encodeURIComponent(fullUrl)}")`;
        }
        return match;
      });

      // Set headers
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
      res.statusCode = response.status;
      res.end(html);
    } else {
      // Para otros tipos de contenido (imágenes, JS, etc) hacemos pipe
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
      res.statusCode = response.status;
      response.body.pipe(res);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.statusCode = 500;
    res.end('Proxy error: ' + error.message);
  }
}
