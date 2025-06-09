import fetch from 'node-fetch';

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
        // Copiar solo algunos headers seguros
        'User-Agent': req.headers['user-agent'] || '',
        'Accept': req.headers['accept'] || '*/*',
        // Evitar pasar Host para no causar problemas
      },
      // Para simplificar: solo proxy GET por ahora
    });

    // Copiar cabeceras menos problemáticas
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
