import fetch from 'node-fetch';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const target = req.query.url;
  if (!target) return res.status(400).send('No URL provided');

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || '',
        'Accept': req.headers['accept'] || '*/*',
      },
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Reescribir HTML con cheerio
      const $ = cheerio.load(html);

      // Reescribir todos los enlaces <a>
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          const absoluteUrl = new URL(href, target).href;
          $(el).attr('href', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        }
      });

      // Reescribir formularios
      $('form[action]').each((i, el) => {
        const action = $(el).attr('action');
        if (action && !action.startsWith('javascript:')) {
          const absoluteUrl = new URL(action, target).href;
          $(el).attr('action', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        }
      });

      res.setHeader('content-type', 'text/html');
      res.status(200).send($.html());
      return;
    }

    // Para otros contenidos no HTML, se pasan las cabeceras (menos content-encoding)
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });

    res.status(response.status);
    response.body.pipe(res);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}
