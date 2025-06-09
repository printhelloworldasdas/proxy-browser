import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { JSDOM } from 'jsdom';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

export default async function handler(req, res) {
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

  target = normalizeUrl(target);

  try {
    const isGoogle = new URL(target).hostname.includes('google.com');
    const isYouTube = new URL(target).hostname.includes('youtube.com');
    const siteConfig = isGoogle ? config.google : isYouTube ? config.youtube : config.default;

    if (isGoogle || isYouTube) {
      const delay = Math.random() * (siteConfig.maxDelay - siteConfig.minDelay) + siteConfig.minDelay;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
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

    if (siteConfig.cookies) {
      const cookies = Object.entries(siteConfig.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      headers['Cookie'] = cookies;
    }

    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual'
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (req.body) {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
      }
    }

    const response = await fetch(target, fetchOptions);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, target).toString();
        return res.redirect(302, `/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    let content;

    if (contentType.includes('text/html')) {
      content = await processHtmlResponse(response, target);
    } else if (contentType.includes('text/css')) {
      content = await processCssResponse(response, target);
    } else if (contentType.includes('javascript') || contentType.includes('json')) {
      content = await processJsResponse(response, target);
    } else {
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      return response.body.pipe(res);
    }

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

function normalizeUrl(url) {
  if (!/^https?:\/\//i.test(url)) {
    return 'https://' + url;
  }
  return url;
}

async function processHtmlResponse(response, target) {
  const html = await response.text();
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const elements = [...document.querySelectorAll('a[href], link[href], script[src], img[src], iframe[src], source[src], video[src], audio[src]')];
  elements.forEach(el => {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    const original = el.getAttribute(attr);
    if (original && !original.startsWith('data:') && !original.startsWith('blob:') && !original.startsWith('javascript:')) {
      try {
        const absolute = new URL(original, target).toString();
        el.setAttribute(attr, `/api/proxy?url=${encodeURIComponent(absolute)}`);
      } catch {}
    }
  });

  return dom.serialize();
}

async function processCssResponse(response, target) {
  const css = await response.text();
  return css.replace(/url\((['"]?)(?!data:)([^'")]+)\1\)/g, (match, quote, path) => {
    try {
      const absolute = new URL(path, target).toString();
      return `url(${quote}/api/proxy?url=${encodeURIComponent(absolute)}${quote})`;
    } catch {
      return match;
    }
  });
}

async function processJsResponse(response) {
  return await response.text(); // Optionally you could modify JS here
}
