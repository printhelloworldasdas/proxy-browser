// api/proxy.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send('No URL provided');

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(target).host,
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    });

    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    response.body.pipe(res);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}
