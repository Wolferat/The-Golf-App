(() => {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform()) return;
  const local = new URL(location.href);
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.protocol === local.protocol && url.host === local.host && url.pathname.startsWith('/api/')) {
      const target = window.golfolioMobileOrigin + url.pathname + url.search;
      return originalFetch(input instanceof Request ? new Request(target, input) : target, options);
    }
    return originalFetch(input, options);
  };
  const geolocation = cap.registerPlugin('Geolocation');
  const browser = cap.registerPlugin('Browser');
  // Existing screens keep their callback API; native permissions are requested on use.
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(success, failure, options = {}) {
      geolocation.getCurrentPosition(options).then(success, error => failure?.({ code: 2, message: error.message }));
    }
  }});
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin && url.protocol === 'https:') {
      event.preventDefault();
      browser.open({ url: url.href }).catch(() => { location.href = url.href; });
    }
  });
})();
