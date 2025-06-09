import fetch from 'node-fetch';

function rewriteUrls(html, proxyBaseUrl) {
  // Reescribe URLs absolutas y relativas para que pasen por el proxy
  // proxyBaseUrl = la URL base de tu proxy, ej: 'https://proxy-browser.vercel.app/api/proxy?url='

  // Regex básico para encontrar src, href y url() en CSS
  // Este es un ejemplo simple, para casos complejos podrías usar un parser HTML real.

  return html.replace(
    /(src|href)=["']([^"']+)["']/gi,
    (match, attr, url) => {
      // Ignorar URLs absolutas que no son http(s)
      if (
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        url.startsWith('javascript:') ||
        url.startsWith('#')
      ) {
        return match;
      }

      // Si es relativa, convertir a absoluta con base en YouTube
      let absoluteUrl = url;
      if (url.startsWith('//')) {
        absoluteUrl = 'https:' + url;
      } else if (url.startsWith('/')) {
        absoluteUrl = 'https://www.youtube.com' + url;
      } else if (!url.startsWith('http')) {
        absoluteUrl = 'https://www.youtube.com/' + url;
      }

      const proxied = proxyBaseUrl + encodeURIComponent(absoluteUrl);
      return `${attr}="${proxied}"`;
    }
  ).replace(
    /url\(["']?([^"')]+)["']?\)/gi,
    (match, url) => {
      if (
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        url.startsWith('javascript:')
      ) {
        return match;
      }

      let absoluteUrl = url;
      if (url.startsWith('//')) {
        absoluteUrl = 'https:' + url;
      } else if (url.startsWith('/')) {
        absoluteUrl = 'https://www.youtube.com' + url;
      } else if (!url.startsWith('http')) {
        absoluteUrl = 'https://www.youtube.com/' + url;
      }

      const proxied = proxyBaseUrl + encodeURIComponent(absoluteUrl);
      return `url("${proxied}")`;
    }
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const target = req.query.url;
  if (!target) {
    res.status(400).send('No URL provided');
    return;
  }

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || '',
        'Accept': req.headers['accept'] || '*/*',
        'Cookie': req.headers['cookie'] || '',
        'Referer': req.headers['referer'] || '',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || '';

    // Copiar headers menos problemáticos
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });

    res.status(response.status);

    if (contentType.includes('text/html')) {
      const text = await response.text();
      // Reescribir URLs en el HTML para que pasen por el proxy
      // Cambia esta URL base a la URL real donde está tu proxy desplegado:
      const proxyBaseUrl = 'https://proxy-browser.vercel.app/api/proxy?url=';

      const modifiedHtml = rewriteUrls(text, proxyBaseUrl);
      res.send(modifiedHtml);
    } else {
      // Si no es HTML, enviar el cuerpo directamente
      response.body.pipe(res);
    }
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}
