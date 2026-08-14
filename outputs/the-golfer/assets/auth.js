(function (global) {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="8" cy="16" r="2.4" fill="currentColor"/><path d="M9.7 14.5 17 4.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17 4.8c1.7-.15 3.2.85 3.4 2.35.25 1.7-1.25 2.65-2.9 2.25l-2.1-1.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function playerAvatar(p) {
    return escapeHtml((p && (p.avatar || (p.username || 'G')[0])) || 'G');
  }

  function displayName(p) {
    const first = (p?.first_name || '').trim();
    const last = (p?.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    return full || p?.username || 'Golfer';
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('golfolio_session') || 'null'); }
    catch { return null; }
  }

  function setSession(session) {
    if (session) localStorage.setItem('golfolio_session', JSON.stringify(session));
    else localStorage.removeItem('golfolio_session');
  }

  async function getConfig() {
    if (global.golfolioConfig) return global.golfolioConfig;
    const r = await fetch('/api/config');
    global.golfolioConfig = await r.json();
    return global.golfolioConfig;
  }

  async function api(path, options = {}) {
    const session = getSession();
    if (!session?.access_token) throw new Error('Please sign in.');
    const r = await fetch(path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.message || 'Request failed.');
    return d;
  }

  async function loadProfile() {
    const session = getSession();
    if (!session?.access_token) return null;
    const c = await getConfig();
    let r = await fetch(`${c.supabaseUrl}/rest/v1/profiles?select=id,username,role,created_at,first_name,last_name,phone,avatar,bio,city,state,home_course,handicap`, {
      headers: { apikey: c.supabaseAnonKey, Authorization: 'Bearer ' + session.access_token }
    });
    if (!r.ok) {
      r = await fetch(`${c.supabaseUrl}/rest/v1/profiles?select=id,username,role,created_at,first_name,last_name,phone,avatar,bio,city,home_course,handicap`, {
        headers: { apikey: c.supabaseAnonKey, Authorization: 'Bearer ' + session.access_token }
      });
    }
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  }

  async function signIn(email, password) {
    const c = await getConfig();
    const r = await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || 'Unable to sign in.');
    setSession(d);
    return d;
  }

  function signOut() {
    setSession(null);
    location.href = '/';
  }

  function openLoginModal() {
    const modal = $('#loginModal');
    if (modal) modal.classList.add('open');
    else location.href = '/?login=1';
  }

  function requireAuth(profileNeeded = true) {
    const session = getSession();
    if (!session?.access_token) {
      location.href = '/?login=1&next=' + encodeURIComponent(location.pathname + location.search);
      return null;
    }
    return session;
  }

  function renderBrand(el) {
    if (!el) return;
    el.innerHTML = `${BRAND_MARK}<span class="brand-word">Golfolio</span>`;
    el.setAttribute('aria-label', 'Golfolio');
    if (el.tagName === 'A') el.href = '/';
  }

  function renderAccountMenu(profile) {
    const menu = $('#accountMenu');
    if (!menu) return;
    const adminBlock = profile?.role === 'admin'
      ? `<div class="menu-divider" role="separator"></div><a class="menu-link menu-admin" href="/admin">Mission Control</a>`
      : '';
    menu.innerHTML = `
      <span class="menu-note">Signed in as ${escapeHtml(profile?.username || 'Player')}</span>
      <a class="menu-link" href="/hub">Player Hub</a>
      <a class="menu-link" href="/players">Find Players</a>
      <a class="menu-link" href="/profile">Profile &amp; Settings</a>
      ${adminBlock}
      <button type="button" id="menuSignOut">Sign Out</button>`;
    $('#menuSignOut', menu).onclick = signOut;
  }

  async function bindAppHeader(options = {}) {
    const brand = $('.brand');
    renderBrand(brand);
    const accountButton = $('#accountButton');
    const signupButton = $('#signupButton');
    const menu = $('#accountMenu');
    const session = getSession();
    let profile = null;

    if (!session) {
      if (signupButton) signupButton.classList.remove('hidden');
      if (menu) menu.classList.add('hidden');
      if (accountButton) {
        accountButton.textContent = 'Sign in';
        accountButton.onclick = () => openLoginModal();
      }
      if (signupButton) signupButton.onclick = () => {
        const m = $('#signupModal');
        if (m) m.classList.add('open');
        else location.href = '/?signup=1';
      };
      return { session: null, profile: null };
    }

    profile = await loadProfile();
    if (signupButton) signupButton.classList.add('hidden');
    if (accountButton) {
      accountButton.textContent = profile?.username || 'My profile';
      accountButton.onclick = () => {
        if (!menu) return;
        renderAccountMenu(profile);
        menu.classList.toggle('hidden');
      };
    }
    document.addEventListener('click', (e) => {
      if (!menu || menu.classList.contains('hidden')) return;
      if (e.target.closest('#accountButton') || e.target.closest('#accountMenu')) return;
      menu.classList.add('hidden');
    });

    if (options.requireAdmin && profile?.role !== 'admin') {
      location.href = '/hub';
      return { session, profile };
    }
    return { session, profile };
  }

  function bindLoginModal() {
    const modal = $('#loginModal');
    if (!modal) return;
    $('.close', modal)?.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    const form = $('#loginForm');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const status = $('#loginStatus');
      status.textContent = 'Signing in...';
      status.classList.remove('err');
      try {
        await signIn($('#loginEmail').value.trim(), $('#loginPassword').value);
        const next = new URLSearchParams(location.search).get('next') || '/hub';
        location.href = next;
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      }
    };
  }

  function ensureLoginModal() {
    if ($('#loginModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal" id="loginModal"><div class="dialog">
        <button class="close" aria-label="Close">x</button>
        <h2>Welcome back</h2>
        <p>Sign in to open your hub, find players, and manage your profile.</p>
        <form class="form" id="loginForm">
          <label for="loginEmail">Email address</label>
          <input id="loginEmail" type="email" required>
          <label for="loginPassword">Password</label>
          <input id="loginPassword" type="password" required>
          <button class="button" type="submit">Sign in</button>
          <p class="status" id="loginStatus"></p>
        </form>
      </div></div>`);
    bindLoginModal();
  }

  global.Golfolio = {
    $, $$, escapeHtml, playerAvatar, displayName, getSession, setSession, getConfig,
    api, loadProfile, signIn, signOut, requireAuth, bindAppHeader, ensureLoginModal,
    bindLoginModal, openLoginModal, BRAND_MARK, renderBrand
  };
})(window);
