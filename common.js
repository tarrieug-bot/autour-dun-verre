/* Helpers partagés (vue invité + console animateur). */
(function () {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* Motif : ligne de rebord de verre + bulles */
  function sprig(cls) {
    return '<svg class="sprig ' + (cls || '') + '" viewBox="0 0 140 48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M4 16 C40 30 100 30 136 16"/>' +
      '<path d="M10 22 C44 34 96 34 130 22" opacity=".45"/>' +
      '<circle cx="52" cy="40" r="1.6"/><circle cx="64" cy="44" r="1.1"/><circle cx="76" cy="39" r="2"/><circle cx="88" cy="44" r="1"/>' +
      '</svg>';
  }

  /* Sceau circulaire fin : MARTINIQUE · date · AUTOUR D'UN VERRE */
  let stampN = 0;
  function stamp(date, center) {
    const id = 'stp' + (++stampN) + Math.random().toString(36).slice(2, 6);
    const ring = 'MARTINIQUE · ' + (date || '') + ' · AUTOUR D\u2019UN VERRE · ';
    return '<svg class="stamp" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><path id="' + id + '" d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0"/></defs>' +
      '<circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width=".8"/>' +
      '<circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width=".8"/>' +
      '<text><textPath href="#' + id + '" textLength="266" lengthAdjust="spacing">' + esc(ring) + '</textPath></text>' +
      '<g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">' +
      '<path d="M50 44 L52 62 C53 68 67 68 68 62 L70 44 Z"/><path d="M52 53 L68 53" opacity=".6"/></g>' +
      '<text class="stamp-center" x="60" y="82" text-anchor="middle">' + esc(center || 'santé') + '</text>' +
      '</svg>';
  }

  /* Thème (whisky / champagne) */
  function applyTheme(ev) {
    const t = ev && ev.theme === 'champagne' ? 'champagne' : 'whisky';
    if (document.body.dataset.theme !== t) document.body.dataset.theme = t;
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } },
  };

  window.UI = { esc, sprig, stamp, toast, uuid, store, applyTheme };
})();
