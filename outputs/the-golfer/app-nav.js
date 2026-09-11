(() => {
  const nav = document.querySelector('.mobile-nav');
  if (!nav) return;

  const page = document.body.dataset.page || 'home';
  const activeKey =
    page === 'saved'
      ? 'saved'
      : page === 'game'
        ? 'game'
        : page === 'players'
          ? 'crew'
          : ['settings', 'profile'].includes(page)
            ? 'profile'
            : ['company', 'listings', 'listing-edit', 'admin'].includes(page)
              ? 'profile'
              : 'home';

  const icons = {
    home:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M9 20v-6h6v6"/></svg>',
    saved:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5 4 4 0 0 1 7 2.5c0 5.5-7 10-7 10Z"/></svg>',
    game:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"/><path d="M6 6c4-2 7 1 12-1v6c-5 2-8-1-12 1"/><path d="M3 20h5"/></svg>',
    crew:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 15c2.7.2 4.4 1.8 5 5"/></svg>',
    profile:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>'
  };

  const items = [
    ['home', 'Explore', '/'],
    ['saved', 'Saved', '/saved'],
    ['game', 'My Game', '/hub'],
    ['crew', 'Crew', '/players'],
    ['profile', 'Profile', '/settings']
  ];

  nav.innerHTML = items
    .map(
      ([key, label, href]) =>
        `<a href="${href}" ${activeKey === key ? 'aria-current="page"' : ''} class="${activeKey === key ? 'active' : ''}">${icons[key]}<span class="nav-label">${label}</span></a>`
    )
    .join('');

  const scrollKey = 'golfolio_scroll_' + page + location.pathname;
  try {
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(saved) || 0);
      });
    }
  } catch {}

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try {
          sessionStorage.setItem(scrollKey, String(window.scrollY || 0));
        } catch {}
      });
    },
    { passive: true }
  );

  document.addEventListener('click', (event) => {
    const link = event.target.closest('.mobile-nav a[href]');
    if (!link) return;
    if (window.golfolioUI?.hasOpenSheet?.()) {
      event.preventDefault();
      window.golfolioUI.confirm('Leave this screen?', { title: 'Close sheet', confirmLabel: 'Continue' }).then((ok) => {
        if (ok) window.golfolioNavigate(link.getAttribute('href'));
      });
    }
  });
})();
