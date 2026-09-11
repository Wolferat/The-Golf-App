(() => {
  'use strict';

  const STORAGE_KEY = 'golfolio_saved_ids';
  const listeners = new Set();
  let cache = null;
  let loading = null;

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem('golfolio_session') || 'null');
    } catch {
      return null;
    }
  }

  function readLocalIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(ids) ? ids.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function writeLocalIds(ids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(window.golfolioSaved);
      } catch {}
    });
  }

  async function fetchSaved() {
    const session = readSession();
    if (!session?.access_token) {
      cache = { ids: new Set(readLocalIds()), rows: [] };
      return cache;
    }
    const response = await fetch('/api/saved-listings', {
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'Saved listings request failed.');
    const rows = data.saved || [];
    const ids = rows.map((row) => row.listing_id).filter(Boolean);
    writeLocalIds(ids);
    cache = { ids: new Set(ids), rows };
    return cache;
  }

  window.golfolioSaved = {
    async load(force = false) {
      if (!force && cache) return cache;
      if (loading) return loading;
      loading = fetchSaved()
        .catch((error) => {
          cache = { ids: new Set(readLocalIds()), rows: [], error: error.message };
          return cache;
        })
        .finally(() => {
          loading = null;
          notify();
        });
      return loading;
    },

    isSaved(listingId) {
      if (!listingId) return false;
      if (cache?.ids) return cache.ids.has(listingId);
      return readLocalIds().includes(listingId);
    },

    async toggle(listingId) {
      const session = readSession();
      if (!session?.access_token) {
        const err = Error('Sign in to save listings.');
        err.code = 'auth_required';
        throw err;
      }
      const saved = await this.load(true);
      const currentlySaved = saved.ids.has(listingId);
      const response = await fetch('/api/saved-listings', {
        method: currentlySaved ? 'DELETE' : 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || 'Could not update saved listing.');
      await this.load(true);
      return !currentlySaved;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    renderButton(listingId, { compact = false } = {}) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'save-listing-button' + (compact ? ' compact' : '');
      button.dataset.listingId = listingId;
      button.setAttribute('aria-pressed', this.isSaved(listingId) ? 'true' : 'false');
      button.textContent = this.isSaved(listingId) ? 'Saved' : 'Save';
      button.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        const prior = button.textContent;
        button.textContent = 'Saving…';
        try {
          const nowSaved = await window.golfolioSaved.toggle(listingId);
          button.textContent = nowSaved ? 'Saved' : 'Save';
          button.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
        } catch (error) {
          button.textContent = prior;
          if (error.code === 'auth_required') {
            window.golfolioNavigate('/?login=1&returnTo=' + encodeURIComponent(location.pathname + location.search));
          } else {
            window.golfolioUI?.alert(error.message, { title: 'Save listing' });
          }
        } finally {
          button.disabled = false;
        }
      };
      this.subscribe(() => {
        const saved = this.isSaved(listingId);
        button.textContent = saved ? 'Saved' : 'Save';
        button.setAttribute('aria-pressed', saved ? 'true' : 'false');
      });
      return button;
    }
  };

  window.golfolioSaved.load().catch(() => {});
})();
