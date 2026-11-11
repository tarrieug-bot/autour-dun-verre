/* Console animateur */
(function () {
  const { esc, sprig, stamp, toast, store } = window.UI;
  const PW_KEY = 'adv_host_pw';
  const PHASE_LABELS = {
    LOBBY: 'Accueil', BODY_COUNT: 'Body Count', CLASSEMENT: 'Classement', BOUTEILLE_1: 'Mot Interdit',
    BOUTEILLE_2: 'Le Match', BOUTEILLE_3: 'Juste Prix', CLOTURE: 'Mur de mots', RECAP: 'Fiches récap',
  };

  const $ = (id) => document.getElementById(id);
  $('loginStamp').innerHTML = stamp('', 'animateur');

  const socket = io({ transports: ['websocket', 'polling'] });
  let authed = false;
  let H = null;
  let mountedKey = null;
  let panel = null;
  let lastPl = '';

  function auth(pw) {
    socket.emit('host:auth', { password: pw }, (res) => {
      if (res && res.ok) {
        authed = true;
        store.set(PW_KEY, pw);
        $('login').classList.add('hidden');
        $('app').classList.remove('hidden');
      } else {
        store.del(PW_KEY);
        $('loginErr').textContent = (res && res.error) || 'Erreur';
      }
    });
  }
  $('loginForm').addEventListener('submit', (e) => { e.preventDefault(); auth($('pw').value); });

  socket.on('connect', () => {
    $('offline').classList.add('hidden');
    const pw = store.get(PW_KEY);
    if (pw) auth(pw);
  });
  socket.on('disconnect', () => $('offline').classList.remove('hidden'));
  socket.on('host:state', (h) => { H = h; render(); });

  // Garde le serveur gratuit éveillé pendant que la console est ouverte
  setInterval(() => { fetch('/healthz', { cache: 'no-store' }).catch(() => {}); }, 4 * 60 * 1000);

  function act(type, data) {
    return new Promise((resolve) => {
      socket.timeout(10000).emit('host:action', Object.assign({ type }, data || {}), (err, res) => {
        if (err) { toast('Pas de réponse du serveur.'); return resolve({ ok: false }); }
        if (!res.ok) toast(res.error || 'Erreur');
        resolve(res);
      });
    });
  }

  /* Bouton à double clic de confirmation (sans boîte de dialogue) */
  function confirmBtn(btn, label, fn) {
    const orig = btn.textContent;
    let armed = false;
    let t;
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = label;
        t = setTimeout(() => { armed = false; btn.textContent = orig; }, 3500);
        return;
      }
      clearTimeout(t);
      armed = false;
      btn.textContent = orig;
      fn();
    });
  }

  confirmBtn($('resetBtn'), 'Confirmer : tout effacer ?', () => act('reset').then((r) => r.ok && toast('Session réinitialisée')));
  $('addBots').onclick = () => act('addBots', { n: 6 }).then((r) => r.ok && toast(r.added + ' invités fictifs ajoutés'));
  $('botsPlay').onclick = () => act('botsPlay');
  $('rmBots').onclick = () => act('removeBots');
  let testN = Number(store.get('adv_test_n') || 0);
  $('openTest').onclick = () => { testN++; store.set('adv_test_n', String(testN)); window.open('/?slot=test' + testN, '_blank'); };

  /* ---------------- Rendu ---------------- */
  function render() {
    if (!authed || !H) return;
    $('evTitle').textContent = H.event.title + ' · ' + H.event.date;
    document.title = 'Console · ' + H.event.title;

    $('stepper').innerHTML = H.phases.map((p, i) =>
      '<button data-p="' + p + '" class="' + (p === H.phase ? 'active' : '') + '"><span class="n">' + (i + 1) + '</span>' + PHASE_LABELS[p] + '</button>').join('');
    $('stepper').querySelectorAll('button').forEach((b) => { b.onclick = () => act('setPhase', { phase: b.dataset.p }); });

    const online = H.players.filter((p) => p.online).length;
    $('pcount').textContent = 'Inscrits : ' + H.players.length + ' · en ligne : ' + online;
    const teamColor = (k) => { const t = H.teams.find((x) => x.key === k); return t ? t.color : null; };
    const plHtml = H.players.length
      ? H.players.map((p) => '<li><span class="dot ' + (p.online ? 'on' : '') + '"></span>' +
        '<span class="grow"><strong>' + esc(p.pseudo) + '</strong> · <em>' + esc(p.word) + '</em>' + (p.isBot ? ' <span class="muted">(fictif)</span>' : '') + '</span>' +
        (p.team ? '<span class="dot" style="background:' + teamColor(p.team) + '"></span>' : '') +
        '<button class="x" title="Retirer (2 clics)" data-id="' + esc(p.id) + '">×</button></li>').join('')
      : '<li class="muted">Personne pour l’instant.</li>';
    if (plHtml !== lastPl) {
      lastPl = plHtml;
      $('plist').innerHTML = plHtml;
      $('plist').querySelectorAll('.x').forEach((b) => confirmBtn(b, '?', () => act('removePlayer', { id: b.dataset.id })));
    }

    const key = H.phase;
    if (key !== mountedKey) {
      mountedKey = key;
      $('main').innerHTML = '';
      panel = Panels[H.phase]($('main'), H) || {};
    }
    if (panel.update) panel.update(H);
  }

  const names = (arr, cls) => arr.length
    ? '<div class="names ' + (cls || '') + '">' + arr.map((n) => '<span>' + esc(n) + '</span>').join('') + '</div>'
    : '<div class="names empty">personne</div>';

  const Panels = {
    LOBBY(root, h) {
      const url = location.origin + '/';
      root.innerHTML =
        '<div class="grid2"><div class="card center"><div class="label">Les invités scannent</div>' +
        '<img class="qr" src="/qr.svg" alt="QR code" style="margin:12px auto;display:block">' +
        '<div class="url">' + esc(url.replace(/^https?:\/\//, '')) + '</div></div>' +
        '<div class="card"><div class="label">Arrivés</div><div class="bigstat" id="n"></div>' +
        '<p class="muted" style="font-size:.85rem">Les lecteurs des affirmations seront répartis entre les invités présents au démarrage.</p>' +
        '<button class="btn block red" id="start">Démarrer le Body Count</button></div></div>' +
        '<form class="card" id="ev"><div class="label gold">Événement</div><div class="grid2">' +
        '<label class="field"><span class="label">Titre</span><input class="input" id="title"></label>' +
        '<label class="field"><span class="label">Date (tampon)</span><input class="input" id="date"></label></div>' +
        '<button class="btn small" type="submit">Enregistrer</button></form>';
      const q = (id) => root.querySelector('#' + id);
      q('title').value = h.event.title;
      q('date').value = h.event.date;
      q('ev').onsubmit = (e) => { e.preventDefault(); act('configEvent', { title: q('title').value, date: q('date').value }).then((r) => r.ok && toast('Enregistré')); };
      q('start').onclick = () => act('startBody');
      return { update(h) { q('n').textContent = h.players.length; } };
    },

    BODY_COUNT(root) {
      root.innerHTML =
        '<div class="card"><div class="counter" id="ctr"></div><div class="progress"><div id="prog"></div></div>' +
        '<p class="statement" id="stmt"></p><div>Lecteur : <strong id="reader"></strong></div>' +
        '<div class="btn-row" style="margin-top:16px"><button class="btn ghost" id="prev">← Précédente</button><button class="btn" id="next">Affirmation suivante →</button></div>' +
        '<button class="btn block red" id="rank" style="margin-top:10px">Voir le classement</button></div>' +
        '<div class="grid2"><div class="card"><div class="label">Ont répondu « Oui »</div><div id="yes"></div><div class="label" style="margin-top:12px">« Non »</div><div id="no"></div><div class="label" style="margin-top:12px">En attente</div><div id="wait"></div></div>' +
        '<div class="card"><div class="label">Ordre des lecteurs</div><ol id="readers" style="margin:8px 0 0;padding-left:20px;font-size:.88rem"></ol>' +
        '<button class="btn small ghost" id="reassign" style="margin-top:10px">Redistribuer les lecteurs</button></div></div>';
      const q = (id) => root.querySelector('#' + id);
      q('prev').onclick = () => act('bodyNav', { delta: -1 });
      q('next').onclick = () => act('bodyNav', { delta: 1 });
      q('rank').onclick = () => act('showRanking');
      confirmBtn(q('reassign'), 'Confirmer (retour à la 1re) ?', () => act('reassignReaders'));
      return {
        update(h) {
          const b = h.body;
          q('ctr').textContent = 'Affirmation ' + (b.index + 1) + ' / ' + b.total;
          q('prog').style.width = ((b.index + 1) / b.total) * 100 + '%';
          q('stmt').textContent = b.text;
          q('reader').textContent = b.readerPseudo || '—';
          q('prev').disabled = b.index === 0;
          q('next').disabled = b.index === b.total - 1;
          q('rank').classList.toggle('ghost', b.index < b.total - 1);
          q('yes').innerHTML = names(b.answers.filter((a) => a.answer === true).map((a) => a.pseudo), 'yes');
          q('no').innerHTML = names(b.answers.filter((a) => a.answer === false).map((a) => a.pseudo));
          q('wait').innerHTML = names(b.answers.filter((a) => a.answer === null).map((a) => a.pseudo));
          q('readers').innerHTML = b.readers.map((r, i) => '<li' + (i === b.index ? ' style="color:var(--rouge);font-weight:700"' : '') + '>' + esc(r) + '</li>').join('');
        },
      };
    },

    CLASSEMENT(root) {
      root.innerHTML =
        '<div class="card"><div class="label gold">Classement du Body Count</div><table class="rank" id="tbl"></table>' +
        '<div class="btn-row" style="margin-top:14px"><button class="btn ghost small" id="recalc">Recalculer les équipes</button><button class="btn small" id="go">Passer à la Bouteille 1 →</button></div></div>' +
        '<div class="grid2" id="teams" style="grid-template-columns:repeat(3,1fr)"></div>';
      const q = (id) => root.querySelector('#' + id);
      q('recalc').onclick = () => act('setPhase', { phase: 'CLASSEMENT' });
      q('go').onclick = () => act('setPhase', { phase: 'BOUTEILLE_1' });
      return {
        update(h) {
          const tc = (k) => h.teams.find((t) => t.key === k) || { name: '—', color: '#999' };
          const rk = h.ranking || [];
          q('tbl').innerHTML = '<tr><th class="label">#</th><th class="label">Invité</th><th class="label">Score</th><th class="label">Équipe</th></tr>' +
            rk.map((r) => '<tr><td>' + r.rank + '</td><td><strong>' + esc(r.pseudo) + '</strong> · <em class="serif">' + esc(r.word) + '</em></td><td>' + r.score + '</td>' +
              '<td><span class="team-badge" style="background:' + tc(r.team).color + '">' + esc(tc(r.team).name) + '</span></td></tr>').join('');
          q('teams').innerHTML = h.teams.map((t) => {
            const m = h.players.filter((p) => p.team === t.key);
            return '<div class="card team-card" style="background:' + t.color + '"><div class="label">' + m.length + ' membres</div><h3 style="color:var(--ivoire)">' + esc(t.name) + '</h3>' +
              '<ul class="mates">' + m.map((p) => '<li>' + esc(p.pseudo) + '</li>').join('') + '</ul></div>';
          }).join('');
        },
      };
    },

    BOUTEILLE_1(root, h) {
      root.innerHTML =
        '<form class="card" id="cfg"><div class="label gold">Configuration · Le Mot Interdit</div>' +
        '<label class="field"><span class="label">Nom de la bouteille</span><input class="input" id="bottle" placeholder="ex. Rhum vieux 6 ans"></label>' +
        '<label class="field"><span class="label">Mots interdits (séparés par des virgules)</span><input class="input" id="words"></label>' +
        '<button class="btn small" type="submit">Enregistrer (mis à jour en direct)</button></form>' +
        '<div class="card"><div class="label" id="cnt"></div><div class="wall" id="wall"></div></div>';
      const q = (id) => root.querySelector('#' + id);
      q('bottle').value = h.b1.bottle;
      q('words').value = h.b1.forbidden.join(', ');
      q('cfg').onsubmit = (e) => {
        e.preventDefault();
        act('configB1', { bottle: q('bottle').value, forbidden: q('words').value.split(',') }).then((r) => r.ok && toast('Enregistré'));
      };
      return {
        update(h) {
          q('cnt').textContent = 'Mur des descriptions · ' + h.b1.wall.length + ' / ' + h.players.length;
          q('wall').innerHTML = h.b1.wall.map((n) => '<div class="note"><p>' + esc(n.text) + '</p><span class="by">— ' + esc(n.pseudo) + '</span></div>').join('') || '<p class="muted">Rien pour l’instant.</p>';
        },
      };
    },

    BOUTEILLE_2(root, h) {
      root.innerHTML =
        '<form class="card" id="cfg"><div class="label gold">Configuration · Le Match</div><div class="grid2">' +
        '<label class="field"><span class="label">Côté A</span><input class="input" id="la"></label>' +
        '<label class="field"><span class="label">Côté B</span><input class="input" id="lb"></label></div>' +
        '<button class="btn small" type="submit">Enregistrer les libellés</button></form>' +
        '<div class="card"><div class="label">Ce que voient les invités</div><div class="split" id="split"><div class="a" id="pa"></div><div class="b" id="pb"></div></div>' +
        '<p class="muted" id="none">Aucun vote pour l’instant.</p>' +
        '<div class="btn-row" style="margin-top:14px"><button class="btn red" id="lock"></button><button class="btn ghost small" id="reset">Effacer les votes</button></div></div>' +
        '<div class="card host-exclusive"><div class="label">Réservé à l’animateur · qui a voté quoi</div><div class="grid2" style="margin-top:8px">' +
        '<div><h3 id="na"></h3><div id="va"></div></div><div><h3 id="nb" style="color:var(--rouge)"></h3><div id="vb"></div></div></div>' +
        '<div class="label" style="margin-top:12px">Pas encore voté</div><div id="abs"></div></div>';
      const q = (id) => root.querySelector('#' + id);
      q('la').value = h.b2.labels[0];
      q('lb').value = h.b2.labels[1];
      q('cfg').onsubmit = (e) => { e.preventDefault(); act('configB2', { labels: [q('la').value, q('lb').value] }).then((r) => r.ok && toast('Enregistré')); };
      let locked = false;
      q('lock').onclick = () => act('b2Lock', { locked: !locked });
      confirmBtn(q('reset'), 'Confirmer ?', () => act('b2Reset'));
      return {
        update(h) {
          const b = h.b2;
          locked = b.locked;
          q('lock').textContent = b.locked ? 'Déverrouiller les votes' : 'Verrouiller les votes';
          q('lock').classList.toggle('ghost', b.locked);
          q('split').classList.toggle('hidden', !b.pct);
          q('none').classList.toggle('hidden', !!b.pct);
          if (b.pct) {
            q('pa').style.flexBasis = b.pct[0] + '%'; q('pb').style.flexBasis = b.pct[1] + '%';
            q('pa').textContent = b.pct[0] >= 10 ? b.pct[0] + '%' : '';
            q('pb').textContent = b.pct[1] >= 10 ? b.pct[1] + '%' : '';
          }
          q('na').textContent = b.labels[0] + ' · ' + b.counts[0];
          q('nb').textContent = b.labels[1] + ' · ' + b.counts[1];
          q('va').innerHTML = names(b.voters[0]);
          q('vb').innerHTML = names(b.voters[1], 'yes');
          q('abs').innerHTML = names(b.abstain);
        },
      };
    },

    BOUTEILLE_3(root, h) {
      root.innerHTML =
        '<div class="card" id="cur"></div>' +
        '<form class="card" id="cfg"><div class="label gold">Préparer un nouveau pari</div><div class="grid2">' +
        '<label class="field"><span class="label">Nom de la bouteille</span><input class="input" id="bottle"></label>' +
        '<label class="field"><span class="label">Visuel (photo, optionnel)</span><input class="input" type="file" accept="image/*" id="img"><img class="img-prev hidden" id="prev" alt=""></label></div>' +
        '<label class="field"><span class="label">Question</span><input class="input" id="question"></label>' +
        '<div class="grid2" style="grid-template-columns:repeat(3,1fr)">' +
        [0, 1, 2].map((i) => '<label class="field"><span class="label">Option ' + (i + 1) + '</span><input class="input opt" required></label>').join('') + '</div>' +
        '<button class="btn red" type="submit" id="launch">Lancer ce pari</button></form>' +
        '<div class="card"><div class="label">Paris joués</div><div class="round-hist" id="hist" style="margin-top:8px"></div></div>';
      const q = (id) => root.querySelector('#' + id);
      const opts = [...root.querySelectorAll('.opt')];
      q('question').value = h.b3.defaults.question;
      opts.forEach((o, i) => { o.value = h.b3.defaults.options[i]; });
      let imageUrl = null;

      q('img').onchange = async () => {
        const f = q('img').files[0];
        if (!f) { imageUrl = null; q('prev').classList.add('hidden'); return; }
        try {
          const dataUrl = await resizeImage(f, 900);
          const r = await act('uploadImage', { dataUrl });
          if (r.ok) { imageUrl = r.url; q('prev').src = r.url; q('prev').classList.remove('hidden'); }
        } catch (e) { toast('Image illisible'); }
      };
      q('cfg').onsubmit = async (e) => {
        e.preventDefault();
        const r = await act('b3Launch', { bottle: q('bottle').value, image: imageUrl, question: q('question').value, options: opts.map((o) => o.value) });
        if (r.ok) {
          toast('Pari lancé');
          q('bottle').value = ''; q('img').value = ''; imageUrl = null; q('prev').classList.add('hidden');
        }
      };

      let curKey = null;
      return {
        update(h) {
          const r = h.b3.rounds.find((x) => x.id === h.b3.currentId);
          q('hist').innerHTML = h.b3.rounds.length
            ? h.b3.rounds.map((x) => '<button class="btn small ' + (x.id === h.b3.currentId ? '' : 'ghost') + '" data-id="' + x.id + '">n°' + x.number + ' · ' + esc(x.bottle || 'sans nom') + (x.revealed ? ' ✓' : '') + '</button>').join('')
            : '<span class="muted">Aucun pour l’instant.</span>';
          q('hist').querySelectorAll('button').forEach((b) => { b.onclick = () => act('b3Select', { id: b.dataset.id }); });

          if (!r) { q('cur').innerHTML = '<div class="label">Pari en cours</div><p class="muted">Aucun pari lancé. Les invités voient un écran d’attente. Remplis le formulaire ci-dessous.</p>'; curKey = null; return; }
          const k = r.id;
          if (curKey !== k) {
            curKey = k;
            q('cur').innerHTML =
              '<div class="label gold">Pari en cours · n°' + r.number + '</div>' +
              '<div style="display:flex;gap:16px;align-items:center;margin-top:8px">' + (r.image ? '<img src="' + esc(r.image) + '" style="height:90px;border:1px solid var(--or)">' : '') +
              '<div><h3>' + esc(r.bottle || 'Bouteille') + '</h3><div class="serif" style="font-style:italic;font-size:1.15rem">' + esc(r.question) + '</div></div></div>' +
              '<div id="opts"></div>' +
              '<div class="btn-row" style="margin-top:14px"><button class="btn ghost" id="lock"></button><button class="btn red" id="reveal">Révéler</button><button class="btn small ghost" id="hide">Masquer la révélation</button></div>' +
              '<p class="muted" style="font-size:.8rem">Coche la bonne réponse, puis « Révéler ». La révélation verrouille automatiquement.</p>';
            q('lock').onclick = () => act('b3Lock', { locked: !(H.b3.rounds.find((x) => x.id === H.b3.currentId) || {}).locked });
            q('reveal').onclick = () => {
              const c = root.querySelector('input[name="correct"]:checked');
              if (!c) return toast('Coche d’abord la bonne réponse');
              act('b3Reveal', { correct: Number(c.value) });
            };
            q('hide').onclick = () => act('b3Hide');
            q('opts').innerHTML = r.options.map((o, i) =>
              '<label class="opt-radio"><input type="radio" name="correct" value="' + i + '"' + (r.correct === i ? ' checked' : '') + '>' +
              '<div style="flex:1"><div style="display:flex;justify-content:space-between"><strong>' + esc(o) + '</strong><span data-c="' + i + '"></span></div><div data-n="' + i + '"></div></div></label>').join('');
          }
          r.options.forEach((_, i) => {
            q('opts').querySelector('[data-c="' + i + '"]').textContent = r.counts[i] + ' · ' + r.pct[i] + '%';
            q('opts').querySelector('[data-n="' + i + '"]').innerHTML = names(r.names[i]);
          });
          q('lock').textContent = r.locked ? 'Déverrouiller' : 'Verrouiller les réponses';
          q('hide').classList.toggle('hidden', !r.revealed);
          q('reveal').textContent = r.revealed ? 'Révélé ✓ (re-révéler)' : 'Révéler';
        },
      };
    },

    CLOTURE(root) {
      root.innerHTML = '<div class="card"><div class="label gold" id="cnt"></div><div class="postcards" id="wall"></div></div>' +
        '<button class="btn red" id="go">Afficher les fiches récap →</button>';
      root.querySelector('#go').onclick = () => act('setPhase', { phase: 'RECAP' });
      return {
        update(h) {
          root.querySelector('#cnt').textContent = 'Mur de mots · ' + h.closing.length + ' / ' + h.players.length;
          root.querySelector('#wall').innerHTML = h.closing.map((w) => '<div class="pc"><p>' + esc(w.text) + '</p><span>' + esc(w.pseudo) + '</span></div>').join('') || '<p class="muted">En attente des premiers mots…</p>';
        },
      };
    },

    RECAP(root, h) {
      root.innerHTML = '<div class="card center"><div class="label gold">Fin de soirée</div><h2 style="margin:8px 0">Chaque invité voit sa fiche-souvenir</h2>' +
        '<p class="muted">Invite-les à faire une capture d’écran. Les fiches sont personnelles : chacun ne voit que la sienne.</p>' +
        '<div class="stamp-wrap">' + stamp(h.event.date, 'merci') + '</div>' + sprig() + '</div>';
    },
  };

  /* Redimensionne une photo côté navigateur avant envoi */
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
  }
})();
