/* Console animateur */
(function () {
  const { esc, sprig, stamp, toast, store, applyTheme } = window.UI;
  const PW_KEY = 'adv_host_pw';
  const PHASE_LABELS = {
    LOBBY: 'Accueil', BODY_COUNT: 'Je n’ai jamais', CLASSEMENT: 'Classement', BOUTEILLE_1: 'Mot Interdit',
    BOUTEILLE_2: 'Perfect Match', BOUTEILLE_3: 'La différence', CLOTURE: 'Mur de mots', RECAP: 'Fiches récap',
  };

  const $ = (id) => document.getElementById(id);
  $('loginStamp').innerHTML = stamp('', 'animateur');

  const socket = io({ transports: ['websocket', 'polling'] });
  let authed = false;
  let H = null;
  let mountedKey = null;
  let panel = null;
  let lastPl = '';
  let prepMode = false;
  let mirroredAt = null;
  const PREP_KEY = 'adv_prep_v1';

  function auth(pw) {
    socket.emit('host:auth', { password: pw }, (res) => {
      if (res && res.ok) {
        authed = true;
        store.set(PW_KEY, pw);
        $('login').classList.add('hidden');
        $('app').classList.remove('hidden');
        syncPrepOnLogin();
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
    applyTheme(H.event);
    $('evTitle').textContent = [H.event.subtitle, H.event.date].filter(Boolean).join(' · ');
    document.title = 'Console · ' + H.event.title;

    $('stepper').innerHTML = '<button data-prep="1" class="' + (prepMode ? 'active' : '') + '" style="margin-right:10px"><span class="n">✦</span>Préparation</button>' +
      H.phases.map((p, i) =>
      '<button data-p="' + p + '" class="' + (!prepMode && p === H.phase ? 'active' : '') + '"><span class="n">' + (i + 1) + '</span>' + PHASE_LABELS[p] + '</button>').join('');
    $('stepper').querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.prep) { prepMode = true; mountedKey = null; render(); return; }
        prepMode = false; mountedKey = null;
        act('setPhase', { phase: b.dataset.p });
        render();
      };
    });
    if (H.config.updatedAt && H.config.updatedAt !== mirroredAt) mirrorPrep();

    const online = H.players.filter((p) => p.online).length;
    $('pcount').textContent = 'Inscrits : ' + H.players.length + ' · en ligne : ' + online;
    const profileColor = (k) => { const t = H.profiles.find((x) => x.key === k); return t ? t.color : null; };
    const plHtml = H.players.length
      ? H.players.map((p) => '<li><span class="dot ' + (p.online ? 'on' : '') + '"></span>' +
        '<span class="grow"><strong>' + esc(p.pseudo) + '</strong> · <em>' + esc(p.word) + '</em>' + (p.isBot ? ' <span class="muted">(fictif)</span>' : '') + '</span>' +
        (p.profile ? '<span class="dot" title="' + esc((H.profiles.find((x) => x.key === p.profile) || {}).name || '') + '" style="background:' + profileColor(p.profile) + '"></span>' : '') +
        '<button class="x" title="Retirer (2 clics)" data-id="' + esc(p.id) + '">×</button></li>').join('')
      : '<li class="muted">Personne pour l’instant.</li>';
    if (plHtml !== lastPl) {
      lastPl = plHtml;
      $('plist').innerHTML = plHtml;
      $('plist').querySelectorAll('.x').forEach((b) => confirmBtn(b, '?', () => act('removePlayer', { id: b.dataset.id })));
    }

    const key = prepMode ? 'PREP' : H.phase;
    if (key !== mountedKey) {
      mountedKey = key;
      $('main').innerHTML = '';
      panel = (prepMode ? Panels.PREP : Panels[H.phase])($('main'), H) || {};
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
        '<p class="muted" style="font-size:.85rem">Chaque invité présent au démarrage lira une affirmation, une seule fois.</p>' +
        '<button class="btn block red" id="start">Lancer « Je n’ai jamais »</button></div></div>' +
        '<div class="card" id="prepSum"></div>';
      const q = (id) => root.querySelector('#' + id);
      q('start').onclick = () => act('startBody');
      return {
        update(h) {
          q('n').textContent = h.players.length;
          const c = h.config;
          const nb = h.config.bodyCount || Math.min(h.players.length, c.statementsCount) || 0;
          q('prepSum').innerHTML = '<div class="label gold">Préparation</div>' +
            '<p style="margin:8px 0 4px">' + esc(h.event.subtitle || '') + ' · ' + esc(h.event.date) + ' · thème ' + (h.event.theme === 'champagne' ? 'Champagne' : 'Whisky') + '</p>' +
            '<p class="muted" style="margin:0 0 12px">' + c.bottles.length + ' bouteille(s) · ' + c.paris.length + ' question(s) « La différence » · Je n’ai jamais : ' + nb + ' affirmation(s) (' + (h.config.bodyCount ? 'réglage manuel' : '1 par invité') + ')</p>' +
            '<div style="margin:-4px 0 12px;font-size:.82rem">' + cloudLine(h) + '</div>' +
            '<button class="btn small ghost" id="goPrep">Ouvrir la préparation</button>';
          q('goPrep').onclick = () => { prepMode = true; mountedKey = null; render(); };
        },
      };
    },

    BODY_COUNT(root) {
      root.innerHTML =
        '<div class="card"><div class="counter" id="ctr"></div><div class="progress"><div id="prog"></div></div>' +
        '<p class="statement" id="stmt"></p><div>Lecteur : <strong id="reader"></strong></div>' +
        '<div class="btn-row" style="margin-top:16px"><button class="btn ghost" id="prev">← Précédente</button><button class="btn" id="next">Affirmation suivante →</button></div>' +
        '<button class="btn block red" id="rank" style="margin-top:10px">Voir le classement</button></div>' +
        '<div class="grid2"><div class="card"><div class="label">« J’ai déjà »</div><div id="yes"></div><div class="label" style="margin-top:12px">« Je n’ai jamais »</div><div id="no"></div><div class="label" style="margin-top:12px">En attente</div><div id="wait"></div></div>' +
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
        '<div class="card"><div class="label gold">Classement · Je n’ai jamais</div><table class="rank" id="tbl"></table>' +
        '<div class="btn-row" style="margin-top:14px"><button class="btn ghost small" id="recalc">Recalculer les profils</button><button class="btn small" id="go">Passer à la Bouteille 1 →</button></div></div>' +
        '';
      const q = (id) => root.querySelector('#' + id);
      q('recalc').onclick = () => act('setPhase', { phase: 'CLASSEMENT' });
      q('go').onclick = () => act('setPhase', { phase: 'BOUTEILLE_1' });
      return {
        update(h) {
          const tc = (k) => h.profiles.find((t) => t.key === k) || { name: '—', color: 'transparent' };
          const rk = h.ranking || [];
          q('tbl').innerHTML = '<tr><th class="label">#</th><th class="label">Invité</th><th class="label">« J’ai déjà »</th><th class="label">Profil de dégustateur</th></tr>' +
            rk.map((r) => '<tr><td>' + r.rank + '</td><td><strong>' + esc(r.pseudo) + '</strong> · <em class="serif">' + esc(r.word) + '</em></td><td>' + r.score + '</td>' +
              '<td><span class="profile-badge" style="background:' + tc(r.profile).color + '">' + esc(tc(r.profile).name) + '</span></td></tr>').join('');
        },
      };
    },

    BOUTEILLE_1(root, h) {
      root.innerHTML =
        '<form class="card" id="cfg"><div class="label gold">Configuration · Le Mot Interdit</div>' +
        '<label class="field"><span class="label">Bouteille</span><select class="input" id="bottle"></select></label>' +
        '<label class="field"><span class="label">Mots interdits (séparés par des virgules)</span><input class="input" id="words"></label>' +
        '<button class="btn small" type="submit">Enregistrer (mis à jour en direct)</button></form>' +
        '<div class="card"><div class="label" id="cnt"></div><div class="wall" id="wall"></div></div>';
      const q = (id) => root.querySelector('#' + id);
      q('bottle').innerHTML = bottleOptions(h, h.b1.bottleId);
      q('words').value = h.b1.forbidden.join(', ');
      q('cfg').onsubmit = (e) => {
        e.preventDefault();
        act('configB1', { bottleId: q('bottle').value || null, forbidden: q('words').value.split(',') }).then((r) => r.ok && toast('Enregistré'));
      };
      return {
        update(h) {
          q('cnt').textContent = 'Mur des descriptions · ' + h.b1.wall.length + ' / ' + h.players.length;
          q('wall').innerHTML = h.b1.wall.map((n) => '<div class="note"><p>' + esc(n.text) + '</p><span class="by">— ' + esc(n.pseudo) + '</span></div>').join('') || '<p class="muted">Rien pour l’instant.</p>';
        },
      };
    },

    BOUTEILLE_2(root) {
      root.innerHTML =
        '<div class="card"><div class="label gold">Perfect Match · ce que voient les invités</div>' +
        '<p class="muted" style="font-size:.85rem;margin:6px 0 8px">Chaque invité choisit sa bouteille préférée parmi toutes les bouteilles de la soirée (définies dans « Préparation »). Ils ne voient que les pourcentages.</p>' +
        '<div class="pm-list" id="list"></div>' +
        '<div class="btn-row" style="margin-top:14px"><button class="btn red" id="lock"></button><button class="btn ghost small" id="reset">Effacer les votes</button></div></div>' +
        '<div class="card host-exclusive"><div class="label">Réservé à l’animateur · qui a voté quoi</div><div id="who" style="margin-top:8px"></div>' +
        '<div class="label" style="margin-top:12px">Pas encore voté</div><div id="abs"></div></div>';
      const q = (id) => root.querySelector('#' + id);
      let locked = false;
      q('lock').onclick = () => act('b2Lock', { locked: !locked });
      confirmBtn(q('reset'), 'Confirmer ?', () => act('b2Reset'));
      return {
        update(h) {
          const b = h.b2;
          locked = b.locked;
          q('lock').textContent = b.locked ? 'Déverrouiller les votes' : 'Verrouiller les votes';
          q('lock').classList.toggle('ghost', b.locked);
          q('list').innerHTML = b.choices.map((c, i) =>
            '<div class="pm-choice" style="cursor:default">' +
            (c.image ? '<img src="' + esc(c.image) + '" alt="">' : '<span class="pm-noimg">' + (i + 1) + '</span>') +
            '<span class="pm-body"><span class="pm-name">' + esc(c.label) + '</span><span class="pm-bar"><span class="pm-fill" style="width:' + b.pct[i] + '%"></span></span></span>' +
            '<span class="pm-pct">' + (b.total ? b.pct[i] + '%' : '') + '</span></div>').join('');
          q('who').innerHTML = b.choices.map((c, i) =>
            '<div style="margin-bottom:10px"><strong>' + esc(c.label) + ' · ' + b.counts[i] + '</strong>' + names(b.voters[i], i === 0 ? 'yes' : '') + '</div>').join('');
          q('abs').innerHTML = names(b.abstain);
        },
      };
    },

    BOUTEILLE_3(root, h) {
      root.innerHTML =
        '<div class="card" id="cur"></div>' +
        '<div class="card"><div class="label gold">Questions préparées · La différence</div><div id="plans" style="margin-top:8px"></div></div>' +
        '<details class="card"><summary class="label" style="cursor:pointer">Question improvisée (hors préparation)</summary>' +
        '<form id="cfg" style="margin-top:8px"><div class="grid2">' +
        '<label class="field"><span class="label">Nom de la bouteille</span><input class="input" id="bottle"></label>' +
        '<label class="field"><span class="label">Visuel (photo, optionnel)</span><input class="input" type="file" accept="image/*" id="img"><img class="img-prev hidden" id="prev" alt=""></label></div>' +
        '<label class="field"><span class="label">Question</span><input class="input" id="question"></label>' +
        '<div class="grid2" style="grid-template-columns:repeat(3,1fr)">' +
        [0, 1, 2].map((i) => '<label class="field"><span class="label">Option ' + (i + 1) + '</span><input class="input opt" required></label>').join('') + '</div>' +
        '<label class="field"><span class="label">Explication (affichée à la révélation)</span><input class="input" id="expl0" maxlength="300"></label>' +
        '<button class="btn red" type="submit" id="launch">Lancer cette question</button></form></details>' +
        '<div class="card"><div class="label">Questions jouées</div><div class="round-hist" id="hist" style="margin-top:8px"></div></div>';
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
        const r = await act('b3Launch', { bottle: q('bottle').value, image: imageUrl, question: q('question').value, options: opts.map((o) => o.value), explanation: q('expl0').value });
        if (r.ok) {
          toast('Question lancée');
          q('bottle').value = ''; q('expl0').value = ''; q('img').value = ''; imageUrl = null; q('prev').classList.add('hidden');
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

          const bt = (id) => h.config.bottles.find((b) => b.id === id);
          const plansHtml = h.config.paris.length
            ? h.config.paris.map((p, i) => {
              const b = bt(p.bottleId);
              return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(253,252,241,.08)">' +
                (b && b.image ? '<img src="' + esc(b.image) + '" style="height:44px;width:44px;object-fit:cover;border:1px solid var(--line)">' : '') +
                '<div style="flex:1"><strong>' + (i + 1) + '. ' + esc(b ? b.name : 'Bouteille ?') + '</strong><br><span class="muted" style="font-size:.82rem">' + esc(p.options.join(' / ')) + (p.correct !== null ? ' · bonne réponse : ' + esc(p.options[p.correct]) : '') + '</span></div>' +
                '<button class="btn small ' + (p.played ? 'ghost' : '') + '" data-plan="' + esc(p.id) + '">' + (p.played ? 'Relancer' : 'Lancer') + '</button></div>';
            }).join('')
            : '<p class="muted" style="margin:0">Aucune question préparée. Ajoute-les dans « Préparation ».</p>';
          if (q('plans').dataset.html !== plansHtml) {
            q('plans').dataset.html = plansHtml;
            q('plans').innerHTML = plansHtml;
            q('plans').querySelectorAll('[data-plan]').forEach((b) => { b.onclick = () => act('b3Launch', { planId: b.dataset.plan }).then((x) => x.ok && toast('Question lancée')); });
          }
          if (!r) { q('cur').innerHTML = '<div class="label">Question en cours</div><p class="muted">Aucune question lancée : les invités voient un écran d’attente. Lance une question préparée ci-dessous.</p>'; curKey = null; return; }
          const k = r.id;
          if (curKey !== k) {
            curKey = k;
            q('cur').innerHTML =
              '<div class="label gold">La différence · question n°' + r.number + '</div>' +
              '<div style="display:flex;gap:16px;align-items:center;margin-top:8px">' + (r.image ? '<img src="' + esc(r.image) + '" style="height:90px;border:1px solid var(--or)">' : '') +
              '<div><h3>' + esc(r.bottle || 'Bouteille') + '</h3><div class="serif" style="font-style:italic;font-size:1.15rem">' + esc(r.question) + '</div></div></div>' +
              '<div id="opts"></div>' +
              '<label class="field" style="margin:12px 0 0"><span class="label">Explication révélée aux invités (et reprise sur leur fiche)</span><input class="input" id="expl" maxlength="300" placeholder="ex. Son passage en fût de rhum lui donne des notes tropicales"></label>' +
              '<div class="btn-row" style="margin-top:14px"><button class="btn ghost" id="lock"></button><button class="btn red" id="reveal">Révéler</button><button class="btn small ghost" id="hide">Masquer la révélation</button></div>' +
              '<p class="muted" style="font-size:.8rem">Coche la bonne réponse, puis « Révéler ». La révélation verrouille automatiquement.</p>';
            q('lock').onclick = () => act('b3Lock', { locked: !(H.b3.rounds.find((x) => x.id === H.b3.currentId) || {}).locked });
            q('reveal').onclick = () => {
              const c = root.querySelector('input[name="correct"]:checked');
              if (!c) return toast('Coche d’abord la bonne réponse');
              act('b3Reveal', { correct: Number(c.value), explanation: q('expl').value });
            };
            q('hide').onclick = () => act('b3Hide');
            q('expl').value = r.explanation || '';
            q('opts').innerHTML = r.options.map((o, i) =>
              '<label class="opt-radio"><input type="radio" name="correct" value="' + i + '"' + ((r.correct !== null ? r.correct : r.preset) === i ? ' checked' : '') + '>' +
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


  /* ---------------- Préparation : sauvegarde navigateur ---------------- */
  function bottleOptions(h, selected) {
    return '<option value="">— choisir —</option>' + h.config.bottles.map((b) =>
      '<option value="' + esc(b.id) + '"' + (b.id === selected ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
  }
  function readLocalPrep() { try { return JSON.parse(store.get(PREP_KEY) || 'null'); } catch (e) { return null; } }
  function writeLocalPrep(cfg) {
    try { localStorage.setItem(PREP_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
  }
  async function mirrorPrep() {
    mirroredAt = H.config.updatedAt;
    const r = await act('getConfigFull');
    if (r.ok && !writeLocalPrep(r.config)) toast('Photos trop lourdes pour la sauvegarde navigateur : pense à « Exporter ».');
  }
  async function syncPrepOnLogin() {
    const local = readLocalPrep();
    const r = await act('getConfigFull');
    if (!r.ok) return;
    if (local && local.updatedAt > (r.config.updatedAt || 0)) {
      const w = await act('setConfig', { config: local, keepTime: true });
      if (w.ok) toast('Préparation restaurée depuis ce navigateur ✓');
    } else if (r.config.updatedAt) {
      writeLocalPrep(r.config);
    }
  }

  /* ---------------- Panneau Préparation ---------------- */
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  Panels.PREP = function (root) {
    let draft = null;
    let dirty = false;
    root.innerHTML = '<p class="muted">Chargement de la préparation…</p>';
    act('getConfigFull').then((r) => { if (r.ok) { draft = JSON.parse(JSON.stringify(r.config)); draw(); } });

    const markDirty = () => { dirty = true; const st = root.querySelector('#saveState'); if (st) st.textContent = 'Modifications non enregistrées'; };
    const bOpts = (sel) => '<option value="">— choisir —</option>' + draft.bottles.map((b) =>
      '<option value="' + esc(b.id) + '"' + (b.id === sel ? ' selected' : '') + '>' + esc(b.name || 'Sans nom') + '</option>').join('');

    function draw() {
      const ev = draft.event;
      root.innerHTML =
        '<div class="card"><div class="label gold">1 · Événement</div><div class="grid2">' +
        '<label class="field"><span class="label">Thème visuel</span><select class="input" data-ev="theme"><option value="whisky">Whisky · ambre rouge</option><option value="champagne">Champagne · or</option></select></label>' +
        '<label class="field"><span class="label">Sous-titre</span><input class="input" data-ev="subtitle" placeholder="De whisky avec Aikan"></label>' +
        '<label class="field"><span class="label">Date</span><input class="input" data-ev="date" placeholder="26.11.2026"></label>' +
        '<label class="field"><span class="label">Lieu</span><input class="input" data-ev="place"></label>' +
        '<label class="field"><span class="label">Organisateurs</span><input class="input" data-ev="orga"></label>' +
        '<label class="field"><span class="label">Nom (onglet du navigateur)</span><input class="input" data-ev="title"></label></div></div>' +

        '<div class="card"><div class="label gold">2 · Bouteilles de la soirée</div>' +
        '<p class="muted" style="font-size:.85rem;margin:6px 0 4px">Nom + photo (optionnelle). Elles servent ensuite dans les jeux ci-dessous.</p>' +
        '<div id="bottles"></div><button class="btn small ghost" id="addBottle" style="margin-top:12px">+ Ajouter une bouteille</button></div>' +

        '<div class="card"><div class="label gold">3 · Je n’ai jamais</div><div class="grid2">' +
        '<label class="field"><span class="label">Nombre d’affirmations</span><select class="input" id="bodyCount"><option value="0">Automatique · 1 par invité</option>' +
        Array.from({ length: 30 }, (_, i) => '<option value="' + (i + 1) + '">' + (i + 1) + '</option>').join('') + '</select></label>' +
        '<div class="muted" style="font-size:.82rem;align-self:center">Chaque invité ne lit qu’une fois. S’il y a plus d’affirmations que d’invités, les dernières sont lues par toi.</div></div>' +
        '<label class="field"><span class="label" id="stLabel">Réserve d’affirmations (une par ligne, dans l’ordre)</span><textarea class="input" id="statements" style="min-height:220px;font-size:.92rem"></textarea></label></div>' +

        '<div class="card"><div class="label gold">4 · Le Mot Interdit</div><div class="grid2">' +
        '<label class="field"><span class="label">Bouteille</span><select class="input" id="b1b">' + bOpts(draft.b1.bottleId) + '</select></label>' +
        '<label class="field"><span class="label">Mots interdits (virgules)</span><input class="input" id="b1w"></label></div></div>' +


        '<div class="card"><div class="label gold">5 · La différence — une question par bouteille</div>' +
        '<p class="muted" style="font-size:.85rem;margin:6px 0 4px">Pour chaque bouteille : qu’a-t-elle de différent de la précédente ? 3 réponses possibles, dont la bonne.</p>' +
        '<div id="paris"></div><button class="btn small ghost" id="addPari" style="margin-top:12px">+ Ajouter une question</button></div>' +
        '<div class="card"><div class="label gold">6 · Perfect Match (dernier jeu)</div>' +
        '<p class="muted" style="font-size:.85rem;margin:6px 0 0">Rien à régler : les invités votent pour leur bouteille préférée parmi toutes les bouteilles de la section 2.</p></div>' +

        '<div class="card" style="position:sticky;bottom:10px;z-index:5;background:var(--bg-2);display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<button class="btn" id="save">Enregistrer la préparation</button>' +
        '<span class="muted" id="saveState" style="flex:1;font-size:.85rem">' + (draft.updatedAt ? 'Dernier enregistrement : ' + new Date(draft.updatedAt).toLocaleString('fr-FR') : 'Pas encore enregistrée') + '</span>' +
        '<span id="cloudState" style="font-size:.8rem;width:100%;order:9"></span>' +
        '<button class="btn small ghost" id="exp">Exporter</button><label class="btn small ghost" style="cursor:pointer">Importer<input type="file" accept="application/json,.json" id="imp" hidden></label></div>';

      const q = (sel) => root.querySelector(sel);
      root.querySelectorAll('[data-ev]').forEach((el) => {
        el.value = ev[el.dataset.ev] || '';
        el.addEventListener('input', () => { ev[el.dataset.ev] = el.value; markDirty(); });
      });
      q('[data-ev="theme"]').addEventListener('change', (e) => applyTheme({ theme: e.target.value }));

      // Bouteilles
      q('#bottles').innerHTML = draft.bottles.length ? draft.bottles.map((b, i) =>
        '<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(253,252,241,.08)">' +
        '<div style="width:64px;height:64px;flex:none;border:1px solid var(--line);border-radius:3px;background:rgba(0,0,0,.3) center/cover no-repeat' + (b.image ? ';background-image:url(' + b.image + ')' : '') + '"></div>' +
        '<input class="input" data-bn="' + i + '" placeholder="Nom de la bouteille" style="flex:1">' +
        '<label class="btn small ghost" style="cursor:pointer">' + (b.image ? 'Changer la photo' : 'Photo') + '<input type="file" accept="image/*" data-bi="' + i + '" hidden></label>' +
        (b.image ? '<button class="btn small ghost" data-bx="' + i + '" title="Retirer la photo">Sans photo</button>' : '') +
        '<input class="input" data-bu="' + i + '" placeholder="…ou colle le lien d’une photo" style="flex:0 1 230px;font-size:.85rem;padding:9px 10px">' +
        '<button class="x" data-bd="' + i + '" title="Supprimer" style="border:0;background:none;color:var(--encre-soft);font-size:1.2rem;cursor:pointer">×</button></div>').join('')
        : '<p class="muted" style="margin:6px 0 0">Aucune bouteille pour l’instant.</p>';
      root.querySelectorAll('[data-bn]').forEach((el) => {
        el.value = draft.bottles[el.dataset.bn].name || '';
        el.addEventListener('input', () => { draft.bottles[el.dataset.bn].name = el.value; markDirty(); });
        el.addEventListener('change', () => refreshSelects());
      });
      root.querySelectorAll('[data-bi]').forEach((el) => {
        el.addEventListener('change', async () => {
          const f = el.files[0];
          if (!f) return;
          try { draft.bottles[el.dataset.bi].image = await resizeImage(f, 800, 0.8); markDirty(); redraw(); } catch (e) { toast('Image illisible'); }
        });
      });
      root.querySelectorAll('[data-bu]').forEach((el) => {
        el.addEventListener('change', async () => {
          const url = el.value.trim();
          if (!url) return;
          el.disabled = true;
          const r = await act('fetchImage', { url });
          el.disabled = false;
          if (!r.ok) return;
          try {
            const blob = await (await fetch(r.dataUrl)).blob();
            draft.bottles[el.dataset.bu].image = await resizeImage(blob, 800, 0.8);
            markDirty(); redraw(); toast('Photo récupérée ✓');
          } catch (e) { toast('Image illisible'); }
        });
      });
      root.querySelectorAll('[data-bx]').forEach((el) => { el.onclick = () => { draft.bottles[el.dataset.bx].image = null; markDirty(); redraw(); }; });
      root.querySelectorAll('[data-bd]').forEach((el) => confirmBtn(el, '?', () => { draft.bottles.splice(Number(el.dataset.bd), 1); markDirty(); redraw(); }));
      q('#addBottle').onclick = () => { draft.bottles.push({ id: uid(), name: '', image: null }); markDirty(); redraw(); setTimeout(() => { const all = root.querySelectorAll('[data-bn]'); if (all.length) all[all.length - 1].focus(); }, 0); };

      // Body count
      q('#bodyCount').value = String(draft.bodyCount || 0);
      q('#bodyCount').onchange = () => { draft.bodyCount = Number(q('#bodyCount').value); markDirty(); };
      q('#statements').value = draft.statements.join('\n');
      const stCount = () => { q('#stLabel').textContent = 'Réserve d’affirmations · ' + q('#statements').value.split('\n').filter((x) => x.trim()).length + ' (une par ligne, dans l’ordre)'; };
      stCount();
      q('#statements').addEventListener('input', () => { draft.statements = q('#statements').value.split('\n').map((x) => x.trim()).filter(Boolean); stCount(); markDirty(); });

      // Jeux
      q('#b1w').value = draft.b1.forbidden.join(', ');
      q('#b1w').addEventListener('input', () => { draft.b1.forbidden = q('#b1w').value.split(',').map((x) => x.trim()).filter(Boolean); markDirty(); });
      q('#b1b').onchange = () => { draft.b1.bottleId = q('#b1b').value || null; markDirty(); };

      // Paris
      q('#paris').innerHTML = draft.paris.length ? draft.paris.map((p, i) =>
        '<div style="padding:12px 0;border-bottom:1px solid rgba(253,252,241,.08)"><div class="grid2">' +
        '<label class="field" style="margin:6px 0"><span class="label">Question ' + (i + 1) + ' · bouteille dégustée</span><select class="input" data-pb="' + i + '">' + bOpts(p.bottleId) + '</select></label>' +
        '<label class="field" style="margin:6px 0"><span class="label">Question</span><input class="input" data-pq="' + i + '"></label></div>' +
        '<div class="grid2" style="grid-template-columns:repeat(3,1fr)">' + [0, 1, 2].map((k) => '<label class="field" style="margin:6px 0"><span class="label">Option ' + (k + 1) + '</span><input class="input" data-po="' + i + ':' + k + '"></label>').join('') + '</div>' +
        '<label class="field" style="margin:6px 0"><span class="label">Explication (affichée à la révélation et sur la fiche-souvenir)</span><input class="input" data-pe="' + i + '" maxlength="300" placeholder="ex. Son passage en fût de rhum lui donne des notes de fruits tropicaux"></label>' +
        '<div style="display:flex;gap:10px;align-items:end"><label class="field" style="margin:6px 0;flex:1"><span class="label">Bonne réponse (pré-cochée au moment de révéler)</span><select class="input" data-pc="' + i + '"><option value="">— je choisirai en direct —</option>' +
        [0, 1, 2].map((k) => '<option value="' + k + '"' + (p.correct === k ? ' selected' : '') + '>Option ' + (k + 1) + '</option>').join('') + '</select></label>' +
        '<button class="btn small ghost" data-pd="' + i + '" style="margin-bottom:6px">Supprimer</button></div></div>').join('')
        : '<p class="muted" style="margin:6px 0 0">Aucune question préparée.</p>';
      root.querySelectorAll('[data-pq]').forEach((el) => { el.value = draft.paris[el.dataset.pq].question; el.addEventListener('input', () => { draft.paris[el.dataset.pq].question = el.value; markDirty(); }); });
      root.querySelectorAll('[data-po]').forEach((el) => {
        const [i, k] = el.dataset.po.split(':').map(Number);
        el.value = draft.paris[i].options[k];
        el.addEventListener('input', () => { draft.paris[i].options[k] = el.value; markDirty(); });
      });
      root.querySelectorAll('[data-pe]').forEach((el) => { el.value = draft.paris[el.dataset.pe].explanation || ''; el.addEventListener('input', () => { draft.paris[el.dataset.pe].explanation = el.value; markDirty(); }); });
      root.querySelectorAll('[data-pb]').forEach((el) => { el.onchange = () => { draft.paris[el.dataset.pb].bottleId = el.value || null; markDirty(); }; });
      root.querySelectorAll('[data-pc]').forEach((el) => { el.onchange = () => { draft.paris[el.dataset.pc].correct = el.value === '' ? null : Number(el.value); markDirty(); }; });
      root.querySelectorAll('[data-pd]').forEach((el) => confirmBtn(el, 'Confirmer ?', () => { draft.paris.splice(Number(el.dataset.pd), 1); markDirty(); redraw(); }));
      q('#addPari').onclick = () => {
        const d = (H && H.b3 && H.b3.defaults) || { question: 'Quel est le prix de cette bouteille ?', options: ['Moins de 30€', 'Entre 30 et 60€', 'Plus de 60€'] };
        draft.paris.push({ id: uid(), bottleId: null, question: d.question, options: d.options.slice(), correct: null, explanation: '' });
        markDirty(); redraw();
      };

      // Sauvegarde / export / import
      q('#save').onclick = save;
      q('#exp').onclick = () => {
        const blob = new Blob([JSON.stringify(draft)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'preparation-autour-dun-verre.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      q('#imp').onchange = async () => {
        const f = q('#imp').files[0];
        if (!f) return;
        try { draft = JSON.parse(await f.text()); draft.bottles = draft.bottles || []; draft.paris = draft.paris || []; markDirty(); redraw(); toast('Importé — pense à enregistrer'); } catch (e) { toast('Fichier illisible'); }
      };
      if (dirty) markDirty();
    }
    function refreshSelects() {
      [['#b1b', draft.b1.bottleId]].forEach(([sel, v]) => { const el = root.querySelector(sel); if (el) el.innerHTML = bOpts(v); });
      root.querySelectorAll('[data-pb]').forEach((el) => { el.innerHTML = bOpts(draft.paris[el.dataset.pb].bottleId); });
    }
    function redraw() { const y = window.scrollY; draw(); window.scrollTo(0, y); }
    async function save() {
      const btn = root.querySelector('#save');
      btn.disabled = true;
      const r = await act('setConfig', { config: draft });
      btn.disabled = false;
      if (!r.ok) return;
      const full = await act('getConfigFull');
      if (full.ok) {
        draft = JSON.parse(JSON.stringify(full.config));
        mirroredAt = full.config.updatedAt;
        const okLocal = writeLocalPrep(full.config);
        dirty = false;
        redraw();
        root.querySelector('#saveState').textContent = 'Enregistré ✓ sur le serveur' + (okLocal ? ' et dans ce navigateur' : ' (trop lourd pour ce navigateur : exporte une copie)');
        toast('Préparation enregistrée ✓');
      }
    }
    return { update(h) { const el = root.querySelector('#cloudState'); if (el) el.innerHTML = cloudLine(h); } };
  };

  function cloudLine(h) {
    const c = h.config.cloud || {};
    if (!c.enabled) return '<span style="color:var(--danger)">Sauvegarde permanente non activée</span> <span class="muted">— la préparation n’est gardée que sur ce serveur et dans ce navigateur.</span>';
    if (c.ok === false) return '<span style="color:var(--danger)">Sauvegarde permanente en erreur : ' + esc(c.error || '') + '</span>';
    if (c.synced) return '<span style="color:#8FD18B">● Sauvegarde permanente à jour (GitHub)</span>' + (c.savedAt ? ' <span class="muted">· ' + new Date(c.savedAt).toLocaleTimeString('fr-FR') + '</span>' : '');
    return '<span class="muted">● Sauvegarde permanente activée (GitHub) — envoi en cours ou en attente du prochain enregistrement…</span>';
  }

  /* Redimensionne une photo côté navigateur avant envoi */
  function resizeImage(file, max, quality) {
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
        resolve(c.toDataURL('image/jpeg', quality || 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
  }
})();
