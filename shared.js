/* Code partagé navigateur + serveur : détection des mots interdits. */
(function (root) {
  function norm(s) {
    return String(s || '').toLocaleLowerCase('fr').normalize('NFC');
  }
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  /** Renvoie la liste des mots interdits présents (mot entier, insensible à la casse). */
  function findForbidden(text, words) {
    const t = norm(text);
    const found = [];
    (words || []).forEach(function (w) {
      const ww = norm(w).trim();
      if (!ww) return;
      const re = new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRe(ww) + '(?=$|[^\\p{L}\\p{N}_])', 'u');
      if (re.test(t) && found.indexOf(w.trim()) === -1) found.push(w.trim());
    });
    return found;
  }
  const api = { findForbidden: findForbidden };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(this);
