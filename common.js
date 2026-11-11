/* Helpers partagés (vue invité + console animateur). */
(function () {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* Brin botanique en ligne fine */
  function sprig(cls) {
    return '<svg class="sprig ' + (cls || '') + '" viewBox="0 0 140 48" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M4 40 C40 36 78 28 136 8"/>' +
      '<path d="M26 37 C22 28 28 21 36 20 C37 28 33 34 26 37Z"/>' +
      '<path d="M44 34 C46 42 54 46 61 43 C58 36 52 33 44 34Z"/>' +
      '<path d="M62 29 C58 19 64 12 73 11 C74 20 70 26 62 29Z"/>' +
      '<path d="M82 23 C86 31 94 34 101 30 C97 23 90 21 82 23Z"/>' +
      '<path d="M98 17 C96 9 102 3 110 3 C110 10 105 15 98 17Z"/>' +
      '<path d="M116 12 C120 17 127 18 131 14"/>' +
      '<circle cx="136" cy="8" r="1.6" fill="currentColor"/>' +
      '</svg>';
  }

  /* Cachet circulaire pointillé façon tampon postal */
  let stampN = 0;
  function stamp(date, center) {
    const id = 'stp' + (++stampN) + Math.random().toString(36).slice(2, 6);
    const ring = 'MARTINIQUE · ' + (date || '') + ' · AUTOUR D’UN VERRE · ';
    return '<svg class="stamp" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><path id="' + id + '" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0"/></defs>' +
      '<circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="1.5 3.5"/>' +
      '<circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<text><textPath href="#' + id + '" textLength="254" lengthAdjust="spacing">' + esc(ring) + '</textPath></text>' +
      '<g transform="translate(37 52) scale(.33)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">' +
      '<path d="M4 40 C40 36 78 28 136 8"/><path d="M26 37 C22 28 28 21 36 20 C37 28 33 34 26 37Z"/><path d="M62 29 C58 19 64 12 73 11 C74 20 70 26 62 29Z"/><path d="M98 17 C96 9 102 3 110 3 C110 10 105 15 98 17Z"/></g>' +
      '<text class="stamp-center" x="60" y="77" text-anchor="middle">' + esc(center || 'dégustation') + '</text>' +
      '</svg>';
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

  window.UI = { esc, sprig, stamp, toast, uuid, store };
})();
