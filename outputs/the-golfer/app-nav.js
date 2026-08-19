(() => {
  const nav = document.querySelector('.mobile-nav');
  if (!nav) return;

  const page = document.body.dataset.page || 'home';
  const activeKey =
    page === 'game' ? 'game' : page === 'players' ? 'players' : 'home';

  const icons = {
    home:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M9 20v-6h6v6"/></svg>',
    game:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"/><path d="M6 6c4-2 7 1 12-1v6c-5 2-8-1-12 1"/><path d="M3 20h5"/></svg>',
    players:
      '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 15c2.7.2 4.4 1.8 5 5"/></svg>'
  };

  const items = [
    ['home', 'Explore', '/'],
    ['game', 'My Game', '/hub'],
    ['players', 'Players', '/players']
  ];

  nav.innerHTML = items
    .map(
      ([key, label, href]) =>
        `<a href="${href}" class="${activeKey === key ? 'active' : ''}">${icons[key]}<span class="nav-label">${label}</span></a>`
    )
    .join('');
})();
