import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Headers CORS mejorados
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,User-Agent,Cache-Control');
  res.setHeader('Access-Control-Expose-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let target = req.query.url;
  if (!target) return res.status(400).send('No URL provided');

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
    // User Agents rotativos más realistas
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    const targetDomain = new URL(target).hostname;

    // Headers más realistas y específicos por dominio
    const headers = {
      'User-Agent': req.headers['user-agent'] || randomUA,
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9,es;q=0.8,de;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    };

    // Headers específicos por dominio para evitar detección
    if (targetDomain.includes('google.com')) {
      headers['Referer'] = 'https://www.google.com/';
      headers['Origin'] = 'https://www.google.com';
      // Simular cookies básicas de Google
      headers['Cookie'] = 'CONSENT=YES+cb.20210720-07-p0.en+FX+410; NID=511=example; SOCS=CAESEwgDEgk0NzU4NzQ1MjQaAmVuIAEaBgiA_LyaBg';
      headers['Sec-Fetch-Site'] = 'same-origin';
    } else if (targetDomain.includes('youtube.com')) {
      headers['Referer'] = 'https://www.youtube.com/';
      headers['Origin'] = 'https://www.youtube.com';
    } else if (targetDomain.includes('facebook.com') || targetDomain.includes('instagram.com')) {
      headers['Referer'] = `https://${targetDomain}/`;
      headers['Origin'] = `https://${targetDomain}`;
    } else {
      headers['Referer'] = `https://${targetDomain}/`;
    }

    // Preservar headers importantes del cliente
    const preserveHeaders = ['authorization', 'cookie', 'x-requested-with', 'content-type'];
    preserveHeaders.forEach(header => {
      if (req.headers[header] && !headers[header]) {
        headers[header] = req.headers[header];
      }
    });

    // Delay aleatorio para sitios sensibles
    if (targetDomain.includes('google.com') || targetDomain.includes('facebook.com')) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 200));
    }

    const response = await fetch(target, {
      method: req.method,
      headers: headers,
      redirect: 'manual',
      compress: true
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
        return res.redirect(`/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
      }
    }

    // Copiar cabeceras (filtradas)
    const responseHeaders = {};
    const excludeHeaders = [
      'content-encoding', 'content-length', 'transfer-encoding',
      'connection', 'keep-alive', 'upgrade', 'server',
      'x-frame-options', 'content-security-policy', 'strict-transport-security'
    ];

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!excludeHeaders.includes(lowerKey)) {
        responseHeaders[key] = value;
      }
    });

    // Permitir iframe embedding y eliminar restricciones
    responseHeaders['X-Frame-Options'] = 'ALLOWALL';
    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['X-Content-Security-Policy'];

    // Modificar contenido HTML para reescribir URLs
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      let html = await response.text();
      
      // Reescribir URLs en atributos HTML
      html = html.replace(
        /(href|src|action|data-src|data-href|srcset)=["']([^"']*)["']/gi,
        (match, attr, url) => {
          const newUrl = rewriteUrl(url, target);
          return `${attr}="${newUrl}"`;
        }
      );

      // Reescribir URLs en CSS
      html = html.replace(
        /url\(["']?([^"')]*)["']?\)/gi,
        (match, url) => {
          const newUrl = rewriteUrl(url, target);
          return `url("${newUrl}")`;
        }
      );

      // Reescribir meta refresh
      html = html.replace(
        /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'](\d+);url=([^"']*)["']/gi,
        (match, seconds, url) => {
          const newUrl = rewriteUrl(url, target);
          return match.replace(url, newUrl);
        }
      );

      // Inyectar script para interceptar JavaScript
      const interceptScript = `
        <script>
          (function() {
            // Interceptar fetch
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
              if (typeof url === 'string' && !url.startsWith('/api/proxy') && !url.startsWith('data:') && !url.startsWith('blob:')) {
                if (url.startsWith('http') || url.startsWith('//')) {
                  url = '/api/proxy?url=' + encodeURIComponent(url);
                } else if (url.startsWith('/')) {
                  const base = new URL('${target}');
                  const fullUrl = new URL(url, base.origin).toString();
                  url = '/api/proxy?url=' + encodeURIComponent(fullUrl);
                }
              }
              return originalFetch.call(this, url, options);
            };
            
            // Interceptar XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
              if (typeof url === 'string' && !url.startsWith('/api/proxy') && !url.startsWith('data:') && !url.startsWith('blob:')) {
                if (url.startsWith('http') || url.startsWith('//')) {
                  url = '/api/proxy?url=' + encodeURIComponent(url);
                } else if (url.startsWith('/')) {
                  const base = new URL('${target}');
                  const fullUrl = new URL(url, base.origin).toString();
                  url = '/api/proxy?url=' + encodeURIComponent(fullUrl);
                }
              }
              return originalOpen.call(this, method, url, async, user, password);
            };
            
            // Interceptar window.open
            const originalWindowOpen = window.open;
            window.open = function(url, target, features) {
              if (url && !url.startsWith('/api/proxy')) {
                if (url.startsWith('http') || url.startsWith('//')) {
                  url = '/api/proxy?url=' + encodeURIComponent(url);
                }
              }
              return originalWindowOpen.call(this, url, target, features);
            };
          })();
        </script>
      `;

      // Insertar script antes del cierre de head o al inicio de body
      if (html.includes('</head>')) {
        html = html.replace('</head>', interceptScript + '</head>');
      } else if (html.includes('<body')) {
        html = html.replace('<body', interceptScript + '<body');
      } else {
        html = interceptScript + html;
      }

      res.set(responseHeaders);
      res.send(html);
    } 
    // Procesar CSS
    else if (contentType.includes('text/css')) {
      let css = await response.text();
      
      // Reescribir URLs en CSS
      css = css.replace(
        /url\(["']?([^"')]*)["']?\)/gi,
        (match, url) => {
          const newUrl = rewriteUrl(url, target);
          return `url("${newUrl}")`;
        }
      );

      // Reescribir @import
      css = css.replace(
        /@import\s+["']([^"']*)["']/gi,
        (match, url) => {
          const newUrl = rewriteUrl(url, target);
          return `@import "${newUrl}"`;
        }
      );

      res.set(responseHeaders);
      res.send(css);
    } 
    // Otros contenidos
    else {
      res.set(responseHeaders);
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

// Función auxiliar para reescribir URLs
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
