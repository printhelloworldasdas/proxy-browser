import fetch from 'node-fetch';
import { createHash } from 'crypto';

export default async function handler(req, res) {
  // Headers CORS más completos (optimizado para Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,User-Agent,Cache-Control,Pragma');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');

  // Headers específicos para Vercel
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

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

  // Manejo de URLs relativas
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
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    const targetDomain = new URL(target).hostname;

    const requestHeaders = {
      'User-Agent': req.headers['user-agent'] || randomUA,
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9,es;q=0.8',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="124", "Google Chrome";v="124"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    };

    // Headers adicionales según el dominio
    if (targetDomain.includes('google.com')) {
      requestHeaders['Referer'] = 'https://www.google.com/';
      requestHeaders['Cookie'] = 'NID=511=example_cookie_value; CONSENT=YES+cb; SOCS=CAESEwgDEgk0NzU4NzQ1MjQaAmVuIAEaBgiA_LyaBg';
    } else if (targetDomain.includes('youtube.com')) {
      requestHeaders['Referer'] = 'https://www.youtube.com/';
    } else {
      requestHeaders['Referer'] = `https://${targetDomain}/`;
    }

    // Headers a preservar del cliente
    const preserveHeaders = ['authorization', 'cookie', 'x-requested-with', 'content-type', 'content-length'];
    preserveHeaders.forEach(header => {
      if (req.headers[header]) {
        requestHeaders[header] = req.headers[header];
      }
    });

    // Cuerpo si aplica
    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const fetchOptions = {
      method: req.method,
      headers: requestHeaders,
      body: body,
      redirect: 'manual',
      follow: 0,
      compress: true,
    };

    // Delay aleatorio si es Google
    if (targetDomain.includes('google.com')) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }

    const response = await fetch(target, fetchOptions);

    // Redirección
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const redirectUrl = location.startsWith('http') ? location :
                            location.startsWith('//') ? 'https:' + location :
                            new URL(location, new URL(target).origin).toString();
        return res.redirect(302, `/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
      }
    }

    // Headers permitidos
    const excludeHeaders = [
      'content-encoding', 'content-length', 'transfer-encoding',
      'connection', 'keep-alive', 'upgrade', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailers', 'server',
      'x-frame-options', 'content-security-policy', 'strict-transport-security'
    ];

    response.headers.forEach((value, key) => {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.removeHeader('Content-Security-Policy');

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = rewriteHTML(html, target);
      res.send(html);
    } else if (contentType.includes('text/css')) {
      let css = await response.text();
      css = rewriteCSS(css, target);
      res.setHeader('Content-Type', 'text/css');
      res.send(css);
    } else if (contentType.includes('javascript') || contentType.includes('application/json')) {
      let js = await response.text();
      js = rewriteJavaScript(js, target);
      res.setHeader('Content-Type', contentType);
      res.send(js);
    } else {
      res.status(response.status);
      response.body.pipe(res);
    }

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message, target: target });
  }
}

// Helpers

function rewriteHTML(html, baseUrl) {
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

  const base = new URL(baseUrl);

  html = html.replace(/(href|src|action|data-src|data-href|srcset)=["']([^"']*)["']/gi,
    (match, attr, url) => `${attr}="${rewriteUrl(url, baseUrl)}"`);

  html = html.replace(/style=["']([^"']*url\([^)]*\)[^"']*)["']/gi,
    (match, styleContent) => `style="${rewriteCSS(styleContent, baseUrl)}"`);

  html = html.replace(
    /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'](\d+);url=([^"']*)["']/gi,
    (match, seconds, url) => match.replace(url, rewriteUrl(url, baseUrl))
  );

  if (html.includes('</head>')) {
    html = html.replace('</head>', interceptScript + '</head>');
  } else {
    html = interceptScript + html;
  }

  return html;
}

function rewriteCSS(css, baseUrl) {
  css = css.replace(/url\(["']?([^"')]+)["']?\)/gi,
    (match, url) => `url("${rewriteUrl(url, baseUrl)}")`);
  css = css.replace(/@import\s+["']([^"']*)["']/gi,
    (match, url) => `@import "${rewriteUrl(url, baseUrl)}"`);
  return css;
}

function rewriteJavaScript(js, baseUrl) {
  return js.replace(/(["'])(https?:\/\/[^"']*)(["'])/gi,
    (match, quote1, url, quote2) => {
      if (!url.includes('/api/proxy')) {
        return `${quote1}/api/proxy?url=${encodeURIComponent(url)}${quote2}`;
      }
      return match;
    });
}

function rewriteUrl(url, baseUrl) {
  if (!url || url.startsWith('/api/proxy') || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) {
    return url;
  }

  try {
    const fullUrl = url.startsWith('http') ? url :
                    url.startsWith('//') ? 'https:' + url :
                    url.startsWith('/') ? new URL(url, new URL(baseUrl).origin).toString() :
                    new URL(url, baseUrl).toString();
    return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
  } catch (e) {
    console.error('Error rewriting URL:', url, e);
    return url;
  }
}
