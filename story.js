/* Fiche-souvenir au format story (1080 × 1920), dessinée dans un canvas. */
(function () {
  const W = 1080, H = 1920, M = 90;

  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }
  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  /* Texte avec espacement des lettres (compatible tous navigateurs) */
  function spaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
    ctx.textAlign = prev;
    return total;
  }
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
      kept[maxLines - 1] = last.replace(/[\s,;.]+$/, '') + '…';
      return kept;
    }
    return lines;
  }
  function cover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  const SERIF = '"Bodoni Moda", Didot, Georgia, serif';
  const SANS = '"Josefin Sans", Futura, sans-serif';

  async function draw(s, r) {
    for (const k of [1, 0.92, 0.84, 0.76, 0.68, 0.6]) {
      const res = await drawOnce(s, r, k);
      if (res.bottom <= H - 130) return res.canvas;
      if (k === 0.6) return res.canvas;
    }
  }

  async function drawOnce(s, r, k) {
    await Promise.all([
      document.fonts.load('500 60px "Bodoni Moda"'),
      document.fonts.load('italic 500 60px "Bodoni Moda"'),
      document.fonts.load('400 30px "Josefin Sans"'),
      document.fonts.load('600 30px "Josefin Sans"'),
    ]).catch(() => {});
    const theme = s.event.theme === 'champagne' ? 'champagne' : 'whisky';
    const [band, bg, logo] = await Promise.all([loadImg('/band-' + theme + '.jpg'), loadImg('/bg-' + theme + '.jpg'), loadImg('/logo.png')]);
    const C = {
      bg: cssVar('--bg') || '#120604', bg2: cssVar('--bg-2') || '#2A0C06', accent: cssVar('--accent') || '#E8592A',
      accent2: cssVar('--accent-2') || '#F59A45', gold: cssVar('--gold') || '#EDB867', cream: '#FDFCF1',
    };
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.textBaseline = 'alphabetic';

    // Fond
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg2); g.addColorStop(0.5, C.bg); g.addColorStop(1, C.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (bg) { ctx.globalAlpha = 0.35; cover(ctx, bg, 0, 0, W, H); ctx.globalAlpha = 1; }
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(0,0,0,.25)'); veil.addColorStop(0.45, 'rgba(0,0,0,.55)'); veil.addColorStop(1, 'rgba(0,0,0,.7)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);

    // Cadre fin
    ctx.strokeStyle = 'rgba(237,184,103,.45)'; ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    ctx.textAlign = 'center';
    let y = 120;
    // Signature organisateurs
    if (s.event.orga) {
      ctx.fillStyle = C.cream; ctx.font = '400 30px ' + SANS;
      spaced(ctx, s.event.orga.toUpperCase(), W / 2, y, 6, 'center');
      ctx.font = 'italic 500 44px ' + SERIF;
      ctx.fillText('vous font Vivre', W / 2, y + 54);
      y += Math.max(84, Math.round(90 * k));
    }
    // Bandeau visuel + logo
    const bandY = y, bandH = Math.round(360 * k);
    if (band) {
      ctx.save(); ctx.beginPath(); ctx.rect(38, bandY, W - 76, bandH); ctx.clip();
      cover(ctx, band, 0, bandY, W, bandH);
      const fade = ctx.createLinearGradient(0, bandY + bandH * 0.35, 0, bandY + bandH);
      fade.addColorStop(0, 'rgba(18,6,4,0)'); fade.addColorStop(1, C.bg);
      ctx.fillStyle = fade; ctx.fillRect(0, bandY, W, bandH);
      ctx.restore();
    }
    if (logo) {
      const lw = Math.round(560 * Math.max(k, 0.8)), lh = (logo.height / logo.width) * lw;
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24;
      ctx.drawImage(logo, (W - lw) / 2, bandY + bandH - lh * 0.62, lw, lh);
      ctx.shadowBlur = 0;
      y = bandY + bandH - lh * 0.62 + lh + Math.round(58 * k);
    } else y = bandY + bandH + 40;

    if (s.event.subtitle) {
      const sub = s.event.subtitle.toUpperCase();
      let fs = 32, sp = 7;
      ctx.font = '600 ' + fs + 'px ' + SANS;
      while (spacedWidth(ctx, sub, sp) > W - 2 * M && fs > 18) { fs -= 1; sp = Math.max(3, sp - 0.3); ctx.font = '600 ' + fs + 'px ' + SANS; }
      ctx.fillStyle = C.accent2;
      ctx.shadowColor = C.accent; ctx.shadowBlur = 22;
      spaced(ctx, sub, W / 2, y, sp, 'center');
      ctx.shadowBlur = 0;
      y += Math.max(44, Math.round(50 * k));
    }
    ctx.font = '400 26px ' + SANS; ctx.fillStyle = 'rgba(253,252,241,.72)';
    const meta = [s.event.date, s.event.place].filter(Boolean).join(' · ').toUpperCase();
    let mfs = 26;
    while (spacedWidth(ctx, meta, 5) > W - 2 * M && mfs > 16) { mfs -= 1; ctx.font = '400 ' + mfs + 'px ' + SANS; }
    spaced(ctx, meta, W / 2, y, 5, 'center');
    y += Math.max(100, Math.round(118 * k));

    // Pseudo + mot
    ctx.fillStyle = C.cream; ctx.font = 'italic 500 ' + Math.round(104 * Math.max(k, 0.8)) + 'px ' + SERIF;
    ctx.fillText(r.pseudo, W / 2, y);
    y += Math.max(58, Math.round(62 * k));
    ctx.fillStyle = C.accent2; ctx.font = 'italic 500 44px ' + SERIF;
    ctx.fillText('« ' + r.word + ' »', W / 2, y);
    y += Math.max(36, Math.round(46 * k));

    // Profil
    if (r.profile) {
      const pc = getComputedStyle(document.body).getPropertyValue(r.profile.color.replace(/^var\((--[^)]+)\)$/, '$1')).trim() || C.accent;
      ctx.fillStyle = pc; ctx.fillRect(38, y, W - 76, 140);
      ctx.fillStyle = 'rgba(253,252,241,.85)'; ctx.font = '400 24px ' + SANS;
      spaced(ctx, 'PROFIL DE DÉGUSTATEUR', W / 2, y + 48, 6, 'center');
      ctx.fillStyle = C.cream; ctx.font = 'italic 500 60px ' + SERIF;
      ctx.fillText(r.profile.name, W / 2, y + 112);
      y += 140;
    }

    // Sections
    ctx.textAlign = 'left';
    const maxW = W - 2 * M;
    const label = (t) => { ctx.fillStyle = 'rgba(253,252,241,.6)'; ctx.font = '400 24px ' + SANS; spaced(ctx, t.toUpperCase(), M, y, 5, 'left'); };
    const rule = () => { ctx.strokeStyle = 'rgba(237,184,103,.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); };
    const gap = Math.round(30 * k);
    const L = Math.max(48, Math.round(52 * k));
    y += Math.round(70 * k);

    // Je n'ai jamais
    label('Je n’ai jamais');
    y += L;
    ctx.fillStyle = C.cream; ctx.font = '500 44px ' + SERIF;
    const sc = r.score === null ? '—' : r.score + ' « j’ai déjà »';
    ctx.fillText(sc, M, y);
    if (r.score !== null) {
      const w0 = ctx.measureText(sc).width;
      ctx.font = '400 26px ' + SANS; ctx.fillStyle = 'rgba(253,252,241,.6)';
      ctx.fillText('  sur ' + r.of + (r.rank ? ' · ' + r.rank + (r.rank === 1 ? 'er' : 'e') + ' sur ' + r.total : ''), M + w0, y);
    }
    y += gap; rule(); y += L;

    // Mon analyse de pro
    label('Mon analyse de pro' + (r.bottle1 ? ' · ' + r.bottle1 : ''));
    y += L;
    ctx.fillStyle = C.cream; ctx.font = 'italic 500 38px ' + SERIF;
    const nl = wrap(ctx, r.note1 ? '« ' + r.note1 + ' »' : '—', maxW, 3);
    nl.forEach((l, i) => ctx.fillText(l, M, y + i * 48));
    y += (nl.length - 1) * 48 + gap; rule(); y += 52;

    // La différence
    label('La différence');
    y += L;
    if (!r.paris.length) { ctx.fillStyle = C.cream; ctx.font = '500 38px ' + SERIF; ctx.fillText('—', M, y); y += 10; }
    r.paris.slice(0, 3).forEach((p, i) => {
      ctx.fillStyle = C.cream; ctx.font = '400 30px ' + SANS;
      const name = wrap(ctx, p.bottle, maxW - 190, 1)[0];
      ctx.fillText(name, M, y);
      // pastille
      const txt = p.won === null ? '—' : p.won ? 'TROUVÉ' : 'RATÉ';
      ctx.font = '600 22px ' + SANS;
      const tw = spacedWidth(ctx, txt, 4) + 36;
      const px = W - M - tw, py = y - 30;
      roundRect(ctx, px, py, tw, 42, 21);
      if (p.won) { ctx.fillStyle = C.accent2; ctx.fill(); ctx.fillStyle = C.bg; } else { ctx.strokeStyle = 'rgba(253,252,241,.35)'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(253,252,241,.65)'; }
      spaced(ctx, txt, px + tw / 2, y - 1, 4, 'center');
      if (p.explanation) {
        ctx.fillStyle = 'rgba(253,252,241,.6)'; ctx.font = '400 24px ' + SANS;
        const el = wrap(ctx, p.explanation, maxW - 190, 1)[0];
        ctx.fillText(el, M, y + 36);
        y += 36;
      }
      y += i < Math.min(3, r.paris.length) - 1 ? Math.round(58 * k) : 0;
    });
    y += gap; rule(); y += L;

    // Ma dégustation préférée
    label('Ma dégustation préférée');
    y += L;
    ctx.fillStyle = C.cream; ctx.font = '500 40px ' + SERIF;
    if (r.vote) {
      const vl = wrap(ctx, r.vote.label, maxW, 1)[0];
      ctx.fillText(vl, M, y);
      y += 38;
      ctx.font = '400 24px ' + SANS; ctx.fillStyle = 'rgba(253,252,241,.6)';
      ctx.fillText(r.vote.side === 'majorite' ? 'comme la majorité' : r.vote.side === 'minorite' ? 'un choix singulier' : 'à égalité en tête', M, y);
    } else ctx.fillText('—', M, y);
    y += gap; rule(); y += L;

    // Mon mot
    label('Mon mot de la soirée');
    y += L;
    ctx.fillStyle = C.cream; ctx.font = 'italic 500 40px ' + SERIF;
    const ml = wrap(ctx, r.closing ? '« ' + r.closing + ' »' : '—', maxW, 2);
    ml.forEach((l, i) => ctx.fillText(l, M, y + i * 50));
    const bottom = y + (ml.length - 1) * 50;

    // Pied
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold; ctx.font = '400 24px ' + SANS;
    spaced(ctx, ('Martinique · ' + (s.event.date || '')).toUpperCase(), W / 2, H - 80, 7, 'center');

    return { canvas: cv, bottom };
  }
  function spacedWidth(ctx, text, spacing) {
    return [...text].reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * Math.max(0, [...text].length - 1);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  async function makeFile(s, r) {
    const cv = await draw(s, r);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const safe = String(r.pseudo || 'fiche').normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'fiche';
    return new File([blob], 'autour-dun-verre-' + safe + '.png', { type: 'image/png' });
  }

  /* Partage (menu natif du téléphone) ou téléchargement classique */
  async function deliver(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Ma fiche · Autour d’un Verre' }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  }

  window.Story = { draw, makeFile, deliver };
})();
