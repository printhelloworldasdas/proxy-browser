function rewriteUrls(html, proxyBaseUrl) {
  // Igual que antes, pero ahora incluye enlaces y formularios

  // Reescribir href, src, action (form)
  html = html.replace(
    /(href|src|action)=["']([^"']+)["']/gi,
    (match, attr, url) => {
      if (
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        url.startsWith('javascript:') ||
        url.startsWith('#') ||
        url.startsWith('mailto:') ||
        url.startsWith('tel:')
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
      return `${attr}="${proxied}"`;
    }
  );

  // Reescribir url(...) en CSS
  html = html.replace(
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

  return html;
}
