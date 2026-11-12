/* Fiche-souvenir au format story (1080 × 1920), dessinée dans un canvas.
   Mise en page « au curseur » : chaque ligne est mesurée, avec toujours un écart entre deux lignes. */
(function () {
  const W = 1080, H = 1920, M = 90, FRAME = 36;
  const SERIF = '"Bodoni Moda", Didot, Georgia, serif';
  const SANS = '"Josefin Sans", Futura, sans-serif';

  const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function cover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  function spacedWidth(ctx, text, spacing) {
    const chars = [...text];
    return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
  }
  function spaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const total = spacedWidth(ctx, text, spacing);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
    ctx.textAlign = prev;
  }
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
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
    return lines.length ? lines : [''];
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  async function draw(s, r) {
    await Promise.all([
      document.fonts.load('500 60px "Bodoni Moda"'),
      document.fonts.load('italic 500 60px "Bodoni Moda"'),
      document.fonts.load('400 30px "Josefin Sans"'),
      document.fonts.load('600 30px "Josefin Sans"'),
    ]).catch(() => {});
    const theme = s.event.theme === 'champagne' ? 'champagne' : 'whisky';
    const imgs = await Promise.all([loadImg('/band-' + theme + '.jpg'), loadImg('/logo.png')]);
    // Plus grande taille de texte qui tient dans l'image (recherche par dichotomie)
    // 1) on réduit d'abord l'en-tête (jusqu'à 70 %), 2) puis seulement le texte des rubriques
    const LIMIT = H - 130;
    let best = drawOnce(s, r, 1, imgs, 1);
    if (best.bottom <= LIMIT) return best.canvas;
    const HMIN = 0.7;
    let res = drawOnce(s, r, 1, imgs, HMIN);
    if (res.bottom <= LIMIT) {
      let lo = HMIN, hi = 1; best = res;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        const t = drawOnce(s, r, 1, imgs, mid);
        if (t.bottom <= LIMIT) { lo = mid; best = t; } else hi = mid;
      }
      return best.canvas;
    }
    let lo = 0.55, hi = 1;
    best = drawOnce(s, r, lo, imgs, HMIN);
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const t = drawOnce(s, r, mid, imgs, HMIN);
      if (t.bottom <= LIMIT) { lo = mid; best = t; } else hi = mid;
    }
    return best.canvas;
  }

  function drawOnce(s, r, k, [band, logo], kh) {
    const C = {
      bg: cssVar('--bg') || '#120604', bg2: cssVar('--bg-2') || '#2A0C06', accent: cssVar('--accent') || '#E8592A',
      accent2: cssVar('--accent-2') || '#F59A45', gold: cssVar('--gold') || '#EDB867', cream: '#FDFCF1',
      soft: 'rgba(253,252,241,.66)', line: 'rgba(237,184,103,.32)',
    };
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    const px = (n, min) => Math.max(min || 0, Math.round(n * k));
    const ph = (n, min) => Math.max(min || 0, Math.round(n * kh)); // en-tête
    const maxW = W - 2 * M;

    // Mesures de ligne (ascendante / descendante réelles de la police)
    function metrics(font) {
      ctx.font = font;
      const m = ctx.measureText('ÉÀHgjpq«»');
      const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 0;
      const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 0;
      return { asc, desc };
    }
    let y = 0;
    /* Écrit une ou plusieurs lignes à partir du curseur y (haut du bloc), puis avance le curseur. */
    function text(lines, font, opt) {
      const o = Object.assign({ align: 'center', x: W / 2, color: C.cream, spacing: 0, lead: 0.08, glow: null, tight: false }, opt || {});
      let { asc, desc } = metrics(font);
      if (o.tight) { // hauteur réelle des lettres (lignes uniques du haut)
        ctx.font = font;
        const m = ctx.measureText(lines.join(' ') + 'É');
        asc = m.actualBoundingBoxAscent; desc = Math.max(m.actualBoundingBoxDescent, asc * 0.22);
      }
      const lh = asc + desc;
      const gapLine = Math.max(8, lh * o.lead);
      ctx.fillStyle = o.color;
      ctx.textAlign = o.align === 'center' ? 'center' : 'left';
      if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 22; }
      lines.forEach((l, i) => {
        const base = y + asc + i * (lh + gapLine);
        if (o.spacing) spaced(ctx, l, o.x, base, o.spacing, o.align);
        else ctx.fillText(l, o.x, base);
      });
      ctx.shadowBlur = 0;
      y += lines.length * lh + (lines.length - 1) * gapLine;
    }
    const space = (n, scale) => { y += Math.max(12, Math.round(n * (scale || k))); };
    const fitSpaced = (str, weight, size, spacing, max) => {
      let fs = size, sp = spacing;
      ctx.font = weight + ' ' + fs + 'px ' + SANS;
      while (spacedWidth(ctx, str, sp) > max && fs > 16) { fs -= 1; sp = Math.max(2, sp - 0.3); ctx.font = weight + ' ' + fs + 'px ' + SANS; }
      return { font: weight + ' ' + fs + 'px ' + SANS, spacing: sp };
    };

    // ---------- Fond général ----------
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg2); g.addColorStop(0.45, C.bg); g.addColorStop(1, C.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // ---------- Bloc du haut (le visuel du verre en fond est posé une fois sa hauteur connue) ----------
    // On mesure d'abord le bloc à vide pour connaître sa hauteur, puis on dessine le fond et le texte.
    const top = () => {
      y = FRAME + ph(70);
      if (s.event.orga) {
        const f = fitSpaced(s.event.orga.toUpperCase(), '400', ph(30), 6, maxW);
        text([s.event.orga.toUpperCase()], f.font, { spacing: f.spacing, tight: true });
        space(14, kh);
        text(['vous font Vivre'], 'italic 500 ' + ph(46) + 'px ' + SERIF, { tight: true });
        space(46, kh);
      }
      if (logo) {
        const lw = ph(600), lh = (logo.height / logo.width) * lw;
        if (drawing) {
          ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 26;
          ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
          ctx.shadowBlur = 0;
        }
        y += lh;
        space(40, kh);
      }
      if (s.event.subtitle) {
        const f = fitSpaced(s.event.subtitle.toUpperCase(), '600', ph(32), 7, maxW);
        if (drawing) text([s.event.subtitle.toUpperCase()], f.font, { spacing: f.spacing, color: C.accent2, glow: C.accent, tight: true });
        else text([s.event.subtitle.toUpperCase()], f.font, { tight: true });
        space(18, kh);
      }
      const meta = [s.event.date, s.event.place].filter(Boolean).join(' · ').toUpperCase();
      if (meta) {
        const f = fitSpaced(meta, '400', ph(26), 5, maxW);
        if (drawing) text([meta], f.font, { spacing: f.spacing, color: C.soft, tight: true }); else text([meta], f.font, { tight: true });
        space(56, kh);
      }
      text([r.pseudo], 'italic 500 ' + ph(104) + 'px ' + SERIF, { tight: true });
      space(26, kh);
      text(['« ' + r.word + ' »'], 'italic 500 ' + ph(44) + 'px ' + SERIF, { color: C.accent2, tight: true });
      space(56, kh);
      return y;
    };
    let drawing = false;
    const ctxFill = ctx.fillText; // mesure à vide : on neutralise l'écriture
    ctx.fillText = () => {};
    const topEnd = top();
    ctx.fillText = ctxFill;

    // Visuel du verre en fond du bloc du haut, opacité réduite + voile pour la lisibilité
    if (band) {
      ctx.save();
      ctx.beginPath(); ctx.rect(FRAME, FRAME, W - 2 * FRAME, topEnd - FRAME); ctx.clip();
      ctx.globalAlpha = 0.55;
      cover(ctx, band, FRAME, FRAME, W - 2 * FRAME, topEnd - FRAME);
      ctx.globalAlpha = 1;
      const veil = ctx.createLinearGradient(0, FRAME, 0, topEnd);
      veil.addColorStop(0, 'rgba(18,6,4,.55)'); veil.addColorStop(0.5, 'rgba(18,6,4,.62)'); veil.addColorStop(1, 'rgba(18,6,4,.78)');
      ctx.fillStyle = veil; ctx.fillRect(FRAME, FRAME, W - 2 * FRAME, topEnd - FRAME);
      ctx.restore();
    }
    drawing = true;
    top();

    // ---------- Profil ----------
    if (r.profile) {
      const varName = (r.profile.color.match(/var\((--[^)]+)\)/) || [])[1];
      const pc = (varName && cssVar(varName)) || C.accent;
      const y0 = y;
      y += ph(30);
      ctx.save();
      const yStart = y;
      // mesure puis fond
      ctx.fillText = () => {};
      text(['PROFIL DE DÉGUSTATEUR'], '400 ' + ph(24, 22) + 'px ' + SANS, { spacing: 6, tight: true });
      space(18, kh);
      text([r.profile.name], 'italic 500 ' + ph(62) + 'px ' + SERIF, { tight: true });
      ctx.fillText = ctxFill;
      const h = y - y0 + ph(30);
      ctx.restore();
      ctx.fillStyle = pc; ctx.fillRect(FRAME, y0, W - 2 * FRAME, h);
      y = yStart;
      text(['PROFIL DE DÉGUSTATEUR'], '400 ' + ph(24, 22) + 'px ' + SANS, { spacing: 6, color: 'rgba(253,252,241,.88)', tight: true });
      space(18, kh);
      text([r.profile.name], 'italic 500 ' + ph(62) + 'px ' + SERIF, { tight: true });
      y = y0 + h;
    }

    // ---------- Sections ----------
    const L = { x: M, align: 'left' };
    const label = (t) => { text([t.toUpperCase()], '400 ' + px(24, 22) + 'px ' + SANS, Object.assign({ spacing: 5, color: 'rgba(253,252,241,.6)' }, L)); space(16); };
    const rule = () => { space(26); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); space(30); };
    space(48);

    // Je n'ai jamais
    label('Je n’ai jamais');
    {
      const main = r.score === null ? '—' : r.score + ' « j’ai déjà »';
      const fMain = '500 ' + px(46) + 'px ' + SERIF;
      const { asc } = metrics(fMain);
      ctx.font = fMain; ctx.fillStyle = C.cream; ctx.textAlign = 'left';
      ctx.fillText(main, M, y + asc);
      if (r.score !== null) {
        const w0 = ctx.measureText(main + '  ').width;
        ctx.font = '400 ' + px(28, 25) + 'px ' + SANS; ctx.fillStyle = C.soft;
        ctx.fillText('sur ' + r.of + (r.rank ? ' · ' + r.rank + (r.rank === 1 ? 'er' : 'e') + ' sur ' + r.total : ''), M + w0, y + asc);
      }
      text(['X'], fMain, { color: 'transparent' }); // avance le curseur
    }
    rule();

    // Mon analyse de pro
    label('Mon analyse de pro' + (r.bottle1 ? ' · ' + r.bottle1 : ''));
    {
      const f = 'italic 500 ' + px(40) + 'px ' + SERIF;
      ctx.font = f;
      text(wrap(ctx, r.note1 ? '« ' + r.note1 + ' »' : '—', maxW, 3), f, Object.assign({ lead: 0.1 }, L));
    }
    rule();

    // La différence (un seul rhum : la dernière question révélée)
    label('La différence');
    {
      const d = r.paris.length ? r.paris[r.paris.length - 1] : null;
      if (!d) text(['—'], '500 ' + px(40) + 'px ' + SERIF, L);
      else {
        const fName = '500 ' + px(40) + 'px ' + SERIF;
        const pill = d.won === null ? '—' : d.won ? 'TROUVÉ' : 'RATÉ';
        ctx.font = '600 ' + px(22, 20) + 'px ' + SANS;
        const pw = spacedWidth(ctx, pill, 4) + 40, ph = px(44);
        ctx.font = fName;
        const nameLines = wrap(ctx, d.bottle, maxW - pw - 30, 2);
        const yName = y;
        text(nameLines, fName, Object.assign({ lead: 0.08 }, L));
        // pastille alignée sur la 1re ligne
        const { asc, desc } = metrics(fName);
        const cy = yName + (asc + desc) / 2;
        roundRect(ctx, W - M - pw, cy - ph / 2, pw, ph, ph / 2);
        if (d.won) { ctx.fillStyle = C.accent2; ctx.fill(); } else { ctx.strokeStyle = 'rgba(253,252,241,.4)'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.font = '600 ' + px(22, 20) + 'px ' + SANS; ctx.fillStyle = d.won ? C.bg : 'rgba(253,252,241,.7)';
        const pm = ctx.measureText('T');
        spaced(ctx, pill, W - M - pw / 2, cy + (pm.actualBoundingBoxAscent || px(16)) / 2, 4, 'center');
        if (d.explanation) {
          space(16);
          const fE = 'italic 500 ' + px(34, 28) + 'px ' + SERIF;
          ctx.font = fE;
          text(wrap(ctx, d.explanation, maxW, 3), fE, Object.assign({ color: 'rgba(253,252,241,.8)', lead: 0.1 }, L));
        }
      }
    }
    rule();

    // Ma dégustation préférée
    label('Ma dégustation préférée');
    if (r.vote) {
      const f = '500 ' + px(42) + 'px ' + SERIF;
      ctx.font = f;
      text(wrap(ctx, r.vote.label, maxW, 2), f, Object.assign({ lead: 0.08 }, L));
      space(12);
      text([r.vote.side === 'majorite' ? 'comme la majorité' : r.vote.side === 'minorite' ? 'un choix singulier' : 'à égalité en tête'], '400 ' + px(28, 25) + 'px ' + SANS, Object.assign({ color: C.soft }, L));
    } else text(['—'], '500 ' + px(42) + 'px ' + SERIF, L);
    rule();

    // Mon mot de la soirée
    label('Mon mot de la soirée');
    {
      const f = 'italic 500 ' + px(42) + 'px ' + SERIF;
      ctx.font = f;
      text(wrap(ctx, r.closing ? '« ' + r.closing + ' »' : '—', maxW, 2), f, Object.assign({ lead: 0.1 }, L));
    }
    const bottom = y;

    // ---------- Cadre + pied ----------
    ctx.strokeStyle = 'rgba(237,184,103,.45)'; ctx.lineWidth = 2;
    ctx.strokeRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold; ctx.font = '400 24px ' + SANS;
    spaced(ctx, ('Martinique · ' + (s.event.date || '')).toUpperCase(), W / 2, H - 82, 7, 'center');

    return { canvas: cv, bottom };
  }

  async function makeFile(s, r) {
    const cv = await draw(s, r);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const safe = String(r.pseudo || 'fiche').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'fiche';
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
