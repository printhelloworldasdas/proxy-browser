import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { JSDOM } from 'jsdom';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Configuración avanzada
const config = {
  google: {
    minDelay: 800,
    maxDelay: 2000,
    cookies: {
      NID: '511=random_value_' + Math.random().toString(36).substring(2),
      CONSENT: 'YES+cb',
      SOCS: 'CAESEwgDEgk0NzU4NzQ1MjQaAmVuIAEaBgiA_LyaBg'
    },
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    }
  },
  youtube: {
    cookies: {
      VISITOR_INFO1_LIVE: 'random_value_' + Math.random().toString(36).substring(2),
      YSC: 'random_value_' + Math.random().toString(36).substring(2)
    },
    headers: {
      'Referer': 'https://www.youtube.com/',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  },
  default: {
    minDelay: 300,
    maxDelay: 1000
  }
};

// Pool de User-Agents realistas
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

// Pool de proxies (opcional, descomentar si se usan)
/*
const proxyList = [
  'http://proxy1.example.com:8080',
  'http://proxy2.example.com:8080',
  'http://proxy3.example.com:8080'
];
*/

export default async function handler(req, res) {
  // Configuración CORS optimizada
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let target = req.query.url;
  if (!target) return res.status(400).json({ error: 'No URL provided' });

  // Normalización de la URL
  target = normalizeUrl(target);

  try {
    // Detectar si es Google
    const isGoogle = new URL(target).hostname.includes('google.com');
    const isYouTube = new URL(target).hostname.includes('youtube.com');

    // Configuración específica del sitio
    const siteConfig = isGoogle ? config.google : isYouTube ? config.youtube : config.default;

    // Delay aleatorio para simular comportamiento humano
    if (isGoogle || isYouTube) {
      const delay = Math.random() * (siteConfig.maxDelay - siteConfig.minDelay) + siteConfig.minDelay;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Seleccionar User-Agent aleatorio
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Configurar headers
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-User': '?1',
      ...siteConfig.headers
    };

    // Añadir cookies si existen
    if (siteConfig.cookies) {
      const cookies = Object.entries(siteConfig.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      headers['Cookie'] = cookies;
    }

    // Opciones de fetch avanzadas
    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual',
      // Descomentar si se usan proxies
      // agent: new HttpsProxyAgent(proxyList[Math.floor(Math.random() * proxyList.length)])
    };

    // Manejo especial para POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) {
      if (req.body) {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
      }
    }

    const response = await fetch(target, fetchOptions);

    // Manejar redirecciones
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, target).toString();
        return res.redirect(302, `/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
      }
    }

    // Procesar la respuesta
    const contentType = response.headers.get('content-type') || '';
    let content;

    if (contentType.includes('text/html')) {
      content = await processHtmlResponse(response, target);
    } else if (contentType.includes('text/css')) {
      content = await processCssResponse(response, target);
    } else if (contentType.includes('javascript') || contentType.includes('json')) {
      content = await processJsResponse(response, target);
    } else {
      // Para otros tipos de contenido (imágenes, archivos, etc.)
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      return response.body.pipe(res);
    }

    // Configurar headers de respuesta
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Proxy-Type', 'advanced');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Content-Security-Policy');
    res.removeHeader('X-Frame-Options');

    return res.status(response.status).send(content);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message,
      target: target
    });
  }
}

// Funciones auxiliares

function normalizeUrl(url) {
  try {
    // Decodificar URL si está codificada múltiples veces
    while (url !== decodeURIComponent(url)) {
      url = decodeURIComponent(url);
    }

    // Asegurar protocolo
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        url = 'https://' + new URL(url, 'https://example.com').hostname + url;
      } else {
        url = 'https://' + url;
      }
    }

    return url;
  } catch (error) {
    console.error('Error normalizing URL:', error);
    return url;
  }
}

async function processHtmlResponse(response, baseUrl) {
  const html = await response.text();
  const dom = new JSDOM(html);
  const { document } = dom.window;

  // Reescribir todos los atributos que puedan contener URLs
  const urlAttributes = ['href', 'src', 'action', 'data-src', 'data-href', 'srcset', 'poster', 'background'];
  urlAttributes.forEach(attr => {
    document.querySelectorAll(`[${attr}]`).forEach(el => {
      const value = el.getAttribute(attr);
      if (value && !value.startsWith('data:') && !value.startsWith('#')) {
        el.setAttribute(attr, rewriteUrl(value, baseUrl));
      }
    });
  });

  // Reescribir estilos en línea
  document.querySelectorAll('[style]').forEach(el => {
    const style = el.getAttribute('style');
    el.setAttribute('style', rewriteCssUrls(style, baseUrl));
  });

  // Reescribir scripts que contengan URLs
  document.querySelectorAll('script').forEach(script => {
    if (script.textContent) {
      script.textContent = rewriteJsUrls(script.textContent, baseUrl);
    }
  });

  // Inyectar nuestro script de interceptación
  const interceptScript = document.createElement('script');
  interceptScript.textContent = getInterceptionScript();
  document.head.appendChild(interceptScript);

  return dom.serialize();
}

async function processCssResponse(response, baseUrl) {
  let css = await response.text();
  return rewriteCssUrls(css, baseUrl);
}

async function processJsResponse(response, baseUrl) {
  let js = await response.text();
  return rewriteJsUrls(js, baseUrl);
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

function rewriteCssUrls(css, baseUrl) {
  return css.replace(
    /(url\(["']?|@import\s+["'])([^"')]*)(["']?\)|["'])/gi,
    (match, prefix, url, suffix) => {
      const newUrl = rewriteUrl(url, baseUrl);
      return `${prefix}${newUrl}${suffix}`;
    }
  );
}

function rewriteJsUrls(js, baseUrl) {
  // Reescribir URLs en strings
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

  // Reescribir fetch y XMLHttpRequest
  js = js.replace(
    /(fetch|window\.open|XMLHttpRequest\.prototype\.open)\((["'])(https?:\/\/[^"']+)(["'])/gi,
    (match, method, quote1, url, quote2) => {
      const newUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      return `${method}(${quote1}${newUrl}${quote2}`;
    }
  );

  return js;
}

function getInterceptionScript() {
  return
    (function() {
      // Interceptar fetch
      const originalFetch = window.fetch;
      window.fetch = function(url, options) {
        if (typeof url === 'string' && !url.startsWith('/api/proxy') && 
            (url.startsWith('http://') || url.startsWith('https://'))) {
          url = '/api/proxy?url=' + encodeURIComponent(url);
        }
        return originalFetch.call(this, url, options);
      };
      
      // Interceptar XMLHttpRequest
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        if (typeof url === 'string' && !url.startsWith('/api/proxy') && 
            (url.startsWith('http://') || url.startsWith('https://'))) {
          url = '/api/proxy?url=' + encodeURIComponent(url);
        }
        return originalOpen.call(this, method, url, async, user, password);
      };
      
      // Interceptar window.open
      const originalWindowOpen = window.open;
      window.open = function(url, target, features) {
        if (url && typeof url === 'string' && !url.startsWith('/api/proxy') && 
            (url.startsWith('http://') || url.startsWith('https://'))) {
          url = '/api/proxy?url=' + encodeURIComponent(url);
        }
        return originalWindowOpen.call(this, url, target, features);
      };
      
      // Interceptar formularios
      document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form.action && !form.action.startsWith('/api/proxy') && 
            (form.action.startsWith('http://') || form.action.startsWith('https://'))) {
          form.action = '/api/proxy?url=' + encodeURIComponent(form.action);
        }
      });
    })();
  ;
}
