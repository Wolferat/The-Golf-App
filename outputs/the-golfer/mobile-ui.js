(() => {
  'use strict';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sheetStack = 0;

  function haptic(type) {
    try {
      const cap = window.Capacitor;
      if (cap?.isNativePlatform?.()) {
        cap.registerPlugin('Haptics')?.impact?.({ style: type === 'success' ? 'LIGHT' : 'MEDIUM' });
      }
    } catch {}
  }

  function trapFocus(root) {
    const focusable = () =>
      [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(
        (el) => !el.disabled && el.getClientRects().length
      );
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const close = () => {
      root.removeEventListener('keydown', onKey);
    };
    root.addEventListener('keydown', onKey);
    return close;
  }

  function mountOverlay(className, inner, { sheet = false } = {}) {
    const overlay = document.createElement('div');
    overlay.className = className + (sheet ? ' mobile-sheet-overlay' : '');
    overlay.innerHTML = inner;
    document.body.append(overlay);
    document.body.classList.add('mobile-dialog-open');
    sheetStack++;
    const panel = overlay.querySelector('.mobile-dialog, .mobile-sheet');
    const returnFocus = document.activeElement;
    const cleanupFocus = panel ? trapFocus(panel) : () => {};
    const dismiss = () => {
      cleanupFocus();
      overlay.remove();
      sheetStack = Math.max(0, sheetStack - 1);
      if (!sheetStack) document.body.classList.remove('mobile-dialog-open');
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) dismiss();
    });
    overlay.querySelectorAll('[data-mobile-dismiss]').forEach((button) => {
      button.onclick = () => dismiss();
    });
    (panel?.querySelector('button,input,select,textarea') || panel)?.focus?.({ preventScroll: true });
    return { overlay, dismiss };
  }

  window.golfolioUI = {
    alert(message, { title = 'Notice' } = {}) {
      return new Promise((resolve) => {
        haptic('light');
        const { dismiss } = mountOverlay(
          'mobile-dialog-overlay',
          `<div class="mobile-dialog" role="alertdialog" aria-modal="true"><h2>${escape(title)}</h2><p>${escape(message)}</p><div class="mobile-dialog-actions"><button class="button" type="button" data-mobile-ok>OK</button></div></div>`
        );
        const ok = () => {
          dismiss();
          resolve();
        };
        const overlay = document.querySelector('.mobile-dialog-overlay:last-of-type');
        overlay.querySelector('[data-mobile-ok]').onclick = ok;
        overlay.querySelector('[data-mobile-ok]').addEventListener('keydown', (event) => {
          if (event.key === 'Enter') ok();
        });
      });
    },

    confirm(message, { title = 'Confirm', confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false } = {}) {
      return new Promise((resolve) => {
        haptic('light');
        const { dismiss } = mountOverlay(
          'mobile-dialog-overlay',
          `<div class="mobile-dialog" role="alertdialog" aria-modal="true"><h2>${escape(title)}</h2><p>${escape(message)}</p><div class="mobile-dialog-actions"><button class="button ghost" type="button" data-mobile-cancel>${escape(cancelLabel)}</button><button class="button ${destructive ? 'destructive' : ''}" type="button" data-mobile-confirm>${escape(confirmLabel)}</button></div></div>`
        );
        const finish = (value) => {
          dismiss();
          resolve(value);
        };
        const overlay = document.querySelector('.mobile-dialog-overlay:last-of-type');
        overlay.querySelector('[data-mobile-cancel]').onclick = () => finish(false);
        overlay.querySelector('[data-mobile-confirm]').onclick = () => finish(true);
      });
    },

    prompt(message, { title = 'Input', defaultValue = '', label = 'Value', maxlength = 500 } = {}) {
      return new Promise((resolve) => {
        haptic('light');
        const { dismiss } = mountOverlay(
          'mobile-dialog-overlay',
          `<div class="mobile-dialog" role="dialog" aria-modal="true"><h2>${escape(title)}</h2><p>${escape(message)}</p><form class="form mobile-prompt-form"><label for="mobilePromptInput">${escape(label)}</label><input id="mobilePromptInput" maxlength="${Number(maxlength)}" value="${escape(defaultValue)}"><div class="mobile-dialog-actions"><button class="button ghost" type="button" data-mobile-cancel>Cancel</button><button class="button" type="submit">Continue</button></div></form></div>`
        );
        const overlay = document.querySelector('.mobile-dialog-overlay:last-of-type');
        const input = overlay.querySelector('#mobilePromptInput');
        const finish = (value) => {
          dismiss();
          resolve(value);
        };
        overlay.querySelector('[data-mobile-cancel]').onclick = () => finish(null);
        overlay.querySelector('form').onsubmit = (event) => {
          event.preventDefault();
          finish(input.value);
        };
        input.focus({ preventScroll: true });
        input.select?.();
      });
    },

    sheet(contentHtml, { title = '' } = {}) {
      return new Promise((resolve) => {
        const { dismiss } = mountOverlay(
          'mobile-sheet-overlay-wrap',
          `<div class="mobile-sheet" role="dialog" aria-modal="true">${title ? `<div class="mobile-sheet-head"><h2>${escape(title)}</h2><button type="button" class="mobile-sheet-close" data-mobile-dismiss aria-label="Close">×</button></div>` : ''}<div class="mobile-sheet-body">${contentHtml}</div></div>`,
          { sheet: true }
        );
        resolve({ dismiss });
      });
    },

    select(message, { title = 'Choose one', options = [], cancelLabel = 'Cancel' } = {}) {
      return new Promise((resolve) => {
        haptic('light');
        const buttons = options
          .map(
            (opt) =>
              `<button class="button ghost mobile-choice" type="button" data-mobile-choice="${escape(String(opt.value))}">${escape(opt.label || opt.value)}</button>`
          )
          .join('');
        const { dismiss } = mountOverlay(
          'mobile-dialog-overlay',
          `<div class="mobile-dialog" role="dialog" aria-modal="true"><h2>${escape(title)}</h2><p>${escape(message)}</p><div class="mobile-choice-list">${buttons}</div><div class="mobile-dialog-actions"><button class="button ghost" type="button" data-mobile-cancel>${escape(cancelLabel)}</button></div></div>`
        );
        const finish = (value) => {
          dismiss();
          resolve(value);
        };
        const overlay = document.querySelector('.mobile-dialog-overlay:last-of-type');
        overlay.querySelector('[data-mobile-cancel]').onclick = () => finish(null);
        overlay.querySelectorAll('[data-mobile-choice]').forEach((button) => {
          button.onclick = () => finish(button.dataset.mobileChoice);
        });
      });
    },

    hasOpenSheet() {
      return sheetStack > 0;
    }
  };

  function escape(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.golfolioAlert = (message, options) => window.golfolioUI.alert(message, options);
  window.golfolioConfirm = (message, options) => window.golfolioUI.confirm(message, options);
  window.golfolioPrompt = (message, options) => window.golfolioUI.prompt(message, options);

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest('a[href]');
      if (!link || !window.golfolioUI.hasOpenSheet()) return;
      event.preventDefault();
      window.golfolioUI.confirm('Leave this screen?', { title: 'Close sheet', confirmLabel: 'Continue' }).then((ok) => {
        if (ok) window.golfolioNavigate(link.href);
      });
    },
    true
  );
})();
