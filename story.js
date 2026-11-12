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
      img.onload = () => {
        // SVG sans taille intrinsèque : on lui en donne une pour le canvas
        if (!img.naturalWidth || !img.naturalHeight) { img.width = 600; img.height = 1000; }
        resolve(img);
      };
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
    // Écriture inclusive : le point médian de Bodoni est placé trop haut et touche l'italique.
    // On dessine un point rond centré sur la hauteur d'x, avec un peu d'air de chaque côté.
    function midDots(str, x, base, font) {
      ctx.font = font;
      const fs = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]);
      const parts = str.split('·');
      const dw = fs * 0.24;
      const total = parts.reduce((w, p) => w + ctx.measureText(p).width, 0) + dw * (parts.length - 1);
      const align = ctx.textAlign;
      ctx.textAlign = 'left';
      let cx = x - total / 2;
      parts.forEach((p, i) => {
        ctx.fillText(p, cx, base); cx += ctx.measureText(p).width;
        if (i < parts.length - 1) {
          ctx.beginPath(); ctx.arc(cx + dw * 0.55, base - fs * 0.24, fs * 0.05, 0, Math.PI * 2); ctx.fill();
          cx += dw;
        }
      });
      ctx.textAlign = align;
    }
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
        else if (o.dots && l.includes('·')) midDots(l, o.x, base, font);
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
      space(38, kh); // (date et lieu retirés : la date reste en pied de fiche)
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
      text([r.profile.name], 'italic 500 ' + ph(62) + 'px ' + SERIF, { tight: true, dots: true });
      ctx.fillText = ctxFill;
      const h = y - y0 + ph(30);
      ctx.restore();
      ctx.fillStyle = pc; ctx.fillRect(FRAME, y0, W - 2 * FRAME, h);
      y = yStart;
      text(['PROFIL DE DÉGUSTATEUR'], '400 ' + ph(24, 22) + 'px ' + SANS, { spacing: 6, color: 'rgba(253,252,241,.88)', tight: true });
      space(18, kh);
      text([r.profile.name], 'italic 500 ' + ph(62) + 'px ' + SERIF, { tight: true, dots: true });
      y = y0 + h;
    }

    // ---------- Sections ----------
    const L = { x: M, align: 'left' };
    const label = (t) => { text([t.toUpperCase()], '400 ' + px(24, 22) + 'px ' + SANS, Object.assign({ spacing: 5, color: 'rgba(253,252,241,.6)' }, L)); space(16); };
    const rule = () => { space(26); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); space(30); };
    space(48);

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

  /* ---------- Fiche 2 : les bouteilles de la soirée ---------- */
  async function drawBottles(s, r) {
    await document.fonts.load('italic 500 60px "Bodoni Moda"').catch(() => {});
    const theme = s.event.theme === 'champagne' ? 'champagne' : 'whisky';
    const bottles = (r.bottles || []).filter(Boolean).slice(0, 8);
    const [band, logo, ...photos] = await Promise.all([loadImg('/band-' + theme + '.jpg'), loadImg('/logo.png'), ...bottles.map((b) => (b.image ? loadImg(b.image) : Promise.resolve(null)))]);
    const C = {
      bg: cssVar('--bg') || '#120604', bg2: cssVar('--bg-2') || '#2A0C06', accent: cssVar('--accent') || '#E8592A',
      accent2: cssVar('--accent-2') || '#F59A45', gold: cssVar('--gold') || '#EDB867', cream: '#FDFCF1', soft: 'rgba(253,252,241,.66)',
    };
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const maxW = W - 2 * M;
    const asc = (font, t) => { ctx.font = font; return ctx.measureText(t || 'ÉHg').actualBoundingBoxAscent; };

    // Fond : verre sur toute la page, très atténué
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (band) {
      ctx.save(); ctx.globalAlpha = 0.5; cover(ctx, band, FRAME, FRAME, W - 2 * FRAME, 700); ctx.restore();
      const v = ctx.createLinearGradient(0, FRAME, 0, FRAME + 700);
      v.addColorStop(0, 'rgba(18,6,4,.55)'); v.addColorStop(0.6, 'rgba(18,6,4,.72)'); v.addColorStop(1, C.bg);
      ctx.fillStyle = v; ctx.fillRect(FRAME, FRAME, W - 2 * FRAME, 700);
    }
    ctx.textAlign = 'center';
    let y = FRAME + 90;
    if (s.event.orga) {
      ctx.fillStyle = C.cream; ctx.font = '400 30px ' + SANS;
      let fs = 30; while (spacedWidth(ctx, s.event.orga.toUpperCase(), 6) > maxW && fs > 18) { fs--; ctx.font = '400 ' + fs + 'px ' + SANS; }
      spaced(ctx, s.event.orga.toUpperCase(), W / 2, y, 6, 'center');
      y += 30 + asc('italic 500 46px ' + SERIF, 'vous');
      ctx.fillText('vous font Vivre', W / 2, y);
      y += 50;
    }
    if (logo) {
      const lw = 560, lh = (logo.height / logo.width) * lw;
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 26;
      ctx.drawImage(logo, (W - lw) / 2, y, lw, lh); ctx.shadowBlur = 0;
      y += lh + 40;
    }
    if (s.event.subtitle) {
      const sub = s.event.subtitle.toUpperCase();
      let fs = 32, sp = 7; ctx.font = '600 ' + fs + 'px ' + SANS;
      while (spacedWidth(ctx, sub, sp) > maxW && fs > 18) { fs--; sp = Math.max(3, sp - 0.3); ctx.font = '600 ' + fs + 'px ' + SANS; }
      y += asc(ctx.font, sub);
      ctx.fillStyle = C.accent2; ctx.shadowColor = C.accent; ctx.shadowBlur = 22;
      spaced(ctx, sub, W / 2, y, sp, 'center'); ctx.shadowBlur = 0;
      y += 70;
    }

    // Titre
    ctx.fillStyle = C.cream; ctx.font = 'italic 500 70px ' + SERIF;
    y += asc(ctx.font, 'Les');
    ctx.fillText('Les bouteilles', W / 2, y);
    y += 22 + asc(ctx.font, 'de');
    ctx.fillText('de la soirée', W / 2, y);
    y += 34;
    ctx.strokeStyle = 'rgba(237,184,103,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - 40, y); ctx.lineTo(W / 2 + 40, y); ctx.stroke();
    y += 60;

    // Les bouteilles côte à côte
    const n = Math.max(1, bottles.length);
    const rows = n <= 4 ? 1 : 2;               // au-delà de 4 bouteilles : 2 rangées
    const cols = Math.ceil(n / rows);
    const gap = 30, rowGap = 40;
    const cw = Math.floor((maxW - gap * (cols - 1)) / cols);
    const nameFont = 'italic 500 ' + (cols >= 4 ? 30 : 38) + 'px ' + SERIF;
    // hauteur des noms (3 lignes max) puis cartes aussi hautes que possible, bloc centré verticalement
    ctx.font = nameFont;
    const nameA = asc(nameFont, 'É');
    const maxLines = Math.max(1, ...bottles.map((b) => wrap(ctx, b.name, cw - 6, 3).length));
    const namesH = 46 + nameA + (maxLines - 1) * nameA * 1.35 + 20;
    const avail = (H - 300) - y;
    const ch = Math.max(rows > 1 ? 240 : 360, Math.min(Math.round(cw * 2.4), Math.floor((avail - rows * namesH - (rows - 1) * rowGap) / rows)));
    const blockH = rows * (ch + namesH) + (rows - 1) * rowGap;
    const y0 = y + Math.max(0, Math.round((avail - blockH) / 2));
    bottles.forEach((b, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;   // dernière rangée centrée
      const x = M + (maxW - (inRow * cw + (inRow - 1) * gap)) / 2 + col * (cw + gap);
      const y = y0 + row * (ch + namesH + rowGap);
      // carte claire pour les photos sur fond blanc
      roundRect(ctx, x, y, cw, ch, 10);
      ctx.fillStyle = '#FBF8F1'; ctx.fill();
      ctx.strokeStyle = 'rgba(237,184,103,.6)'; ctx.lineWidth = 2; ctx.stroke();
      const img = photos[i];
      if (img && img.width > 0 && img.height > 0) {
        const pad = 16;
        const sc = Math.min((cw - 2 * pad) / img.width, (ch - 2 * pad) / img.height);
        const iw = img.width * sc, ih = img.height * sc;
        ctx.save(); roundRect(ctx, x + 2, y + 2, cw - 4, ch - 4, 8); ctx.clip();
        ctx.drawImage(img, x + (cw - iw) / 2, y + (ch - ih) / 2, iw, ih);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(18,6,4,.5)'; ctx.font = 'italic 500 90px ' + SERIF;
        ctx.fillText(String(i + 1), x + cw / 2, y + ch / 2 + 30);
      }
      // numéro d'ordre de dégustation
      ctx.font = '600 22px ' + SANS;
      const tag = 'N° ' + (i + 1);
      const tw = spacedWidth(ctx, tag, 3) + 26;
      roundRect(ctx, x + cw / 2 - tw / 2, y + ch - 18, tw, 36, 18);
      ctx.fillStyle = C.accent2; ctx.fill();
      ctx.fillStyle = C.bg; spaced(ctx, tag, x + cw / 2, y + ch + 8, 3, 'center');
      // nom
      ctx.fillStyle = C.cream; ctx.font = nameFont;
      const lines = wrap(ctx, b.name, cw - 6, 3);
      const a = asc(nameFont, 'É'), lh = a * 1.35;
      lines.forEach((l, k) => ctx.fillText(l, x + cw / 2, y + ch + 46 + a + k * lh));
    });
    if (!bottles.length) { ctx.fillStyle = C.soft; ctx.font = 'italic 500 40px ' + SERIF; ctx.fillText('—', W / 2, y + 60); }

    // Signature personnelle
    const yb = H - 210;
    ctx.fillStyle = C.soft; ctx.font = '400 26px ' + SANS;
    spaced(ctx, 'DÉGUSTÉES PAR', W / 2, yb, 6, 'center');
    ctx.fillStyle = C.cream; ctx.font = 'italic 500 56px ' + SERIF;
    ctx.fillText(r.pseudo, W / 2, yb + 16 + asc(ctx.font, r.pseudo));

    ctx.strokeStyle = 'rgba(237,184,103,.45)'; ctx.lineWidth = 2;
    ctx.strokeRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME);
    ctx.fillStyle = C.gold; ctx.font = '400 24px ' + SANS;
    spaced(ctx, ('Martinique · ' + (s.event.date || '')).toUpperCase(), W / 2, H - 82, 7, 'center');
    return cv;
  }

  const toFile = async (cv, name) => new File([await new Promise((res) => cv.toBlob(res, 'image/png'))], name, { type: 'image/png' });
  async function makeFiles(s, r) {
    const safe = String(r.pseudo || 'fiche').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'fiche';
    const [c1, c2] = await Promise.all([draw(s, r), drawBottles(s, r)]);
    return [await toFile(c1, 'autour-dun-verre-' + safe + '-1-ma-fiche.png'), await toFile(c2, 'autour-dun-verre-' + safe + '-2-les-bouteilles.png')];
  }

  /* Partage (menu natif du téléphone) ou téléchargement classique */
  async function deliver(files) {
    files = [].concat(files);
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: 'Mes fiches · Autour d’un Verre' }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
    }
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      await new Promise((res) => setTimeout(res, 400));
    }
    return 'downloaded';
  }

  window.Story = { draw, drawBottles, makeFiles, deliver };
})();
