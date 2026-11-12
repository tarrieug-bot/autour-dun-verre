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

  /* Taille du mot central : il doit tenir dans le cercle intérieur (r = 33) avec une marge. */
  function centerSize(word) {
    const n = Math.max(1, String(word).length);
    return Math.max(8, Math.min(17, Math.round((52 / (n * 0.5)) * 10) / 10));
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
      '<text class="stamp-center" x="60" y="60" text-anchor="middle" dominant-baseline="central" style="font-size:' + centerSize(center || 'santé') + 'px">' + esc(center || 'santé') + '</text>' +
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

  // ---------- Photos de bouteilles : marge blanche rognée partout (même cadrage pour toutes) ----------
  const trimCache = new Map();
  function trimUrl(src) {
    if (trimCache.has(src)) return trimCache.get(src);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const W0 = img.naturalWidth, H0 = img.naturalHeight;
          if (!W0 || !H0) return resolve(src);
          const sc = Math.min(1, 400 / Math.max(W0, H0));
          const w = Math.max(1, Math.round(W0 * sc)), h = Math.max(1, Math.round(H0 * sc));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0, w, h);
          const d = x.getImageData(0, 0, w, h).data;
          let x0 = w, y0 = h, x1 = -1, y1 = -1;
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const i = (yy * w + xx) * 4;
            if (d[i + 3] < 24 || (d[i] > 236 && d[i + 1] > 236 && d[i + 2] > 236)) continue;
            if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
          }
          if (x1 < 0) return resolve(src);
          x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);
          const sx = x0 / sc, sy = y0 / sc, sw = (x1 - x0 + 1) / sc, sh = (y1 - y0 + 1) / sc;
          const out = document.createElement('canvas'); out.width = Math.round(sw); out.height = Math.round(sh);
          const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
          o.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
          resolve(out.toDataURL('image/jpeg', 0.9));
        } catch (e) { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
    trimCache.set(src, p);
    return p;
  }
  function trimBottles(root) {
    (root.querySelectorAll ? root.querySelectorAll('img[src^="/bottle/"]:not([data-trim])') : []).forEach((im) => {
      const src = im.getAttribute('src');
      im.setAttribute('data-trim', '1');
      im.classList.add('bottle-photo');
      trimUrl(src).then((u) => { if (im.getAttribute('src') === src) im.src = u; });
    });
  }
  if (typeof MutationObserver !== 'undefined') {
    const go = () => { trimBottles(document); new MutationObserver(() => trimBottles(document)).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  window.UI = { esc, sprig, stamp, toast, uuid, store, applyTheme, trimUrl };
})();
