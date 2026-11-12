/* Vue invité */
(function () {
  const { esc, sprig, stamp, toast, uuid, store, applyTheme } = window.UI;

  // ?slot=2 permet d'ouvrir plusieurs invités de test dans le même navigateur
  const slot = new URLSearchParams(location.search).get('slot');
  const KEY = 'adv_id' + (slot ? '_' + slot.replace(/\W/g, '') : '');
  let myId = store.get(KEY);
  if (!myId) { myId = uuid(); store.set(KEY, myId); }

  const $screen = document.getElementById('screen');
  const $who = document.getElementById('who');

  const socket = io({ transports: ['websocket', 'polling'] });
  let S = null; // dernier état reçu
  let mountedKey = null;
  let screen = null; // { update(s) }

  socket.on('connect', () => {
    document.getElementById('offline').classList.add('hidden');
    socket.emit('guest:hello', { id: myId });
    updateWho();
  });
  socket.on('disconnect', () => {
    document.getElementById('offline').classList.remove('hidden');
    updateWho();
  });
  socket.on('session:reset', () => {
    toast('Nouvelle session : rejoins à nouveau la table.');
    socket.emit('guest:hello', { id: myId });
  });
  socket.on('state', (s) => { S = s; render(); });

  function send(evt, payload) {
    return new Promise((resolve) => {
      if (!socket.connected) { toast('Hors ligne… réessaie dans un instant.'); return resolve({ ok: false }); }
      socket.timeout(8000).emit(evt, payload, (err, res) => {
        if (err) { toast('Pas de réponse du serveur, réessaie.'); return resolve({ ok: false }); }
        if (!res.ok && res.error) toast(res.error);
        resolve(res);
      });
    });
  }

  function updateWho() {
    if (!S || !S.me) { $who.innerHTML = '<span class="conn ' + (socket.connected ? 'on' : '') + '"></span>'; return; }
    const t = S.me.profile;
    $who.innerHTML = '<strong>' + esc(S.me.pseudo) + '</strong><span class="conn ' + (socket.connected ? 'on' : '') + '"></span>' +
      (t ? '<br><span class="profile-badge" style="background:' + t.color + '">' + esc(t.name) + '</span>' : '<br><span class="muted">' + esc(S.me.word) + '</span>');
  }

  function render() {
    document.title = S.event.title;
    applyTheme(S.event);
    updateWho();
    let key;
    if (!S.me) key = 'JOIN';
    else if (S.phase === 'BOUTEILLE_3') key = 'B3:' + (S.b3 ? S.b3.id : 'none');
    else if (S.phase === 'CLASSEMENT') key = 'CLASSEMENT:' + (S.me.profile ? S.me.profile.key : '');
    else key = S.phase;
    if (key !== mountedKey) {
      mountedKey = key;
      document.body.classList.toggle('has-hero', key === 'JOIN' || key === 'LOBBY');
      const t = document.querySelector('.toast');
      if (t) t.classList.remove('show');
      const factory = key === 'JOIN' ? Screens.JOIN : Screens[S.phase];
      $screen.innerHTML = '';
      screen = factory($screen, S) || {};
      window.scrollTo(0, 0);
    }
    if (screen.update) screen.update(S);
  }

  const hero = (s) =>
    '<section class="hero"><div class="hero-band"></div>' +
    '<img class="hero-logo" src="/logo.png" alt="' + esc(s.event.title) + '">' +
    (s.event.subtitle ? '<div class="sub glow">' + esc(s.event.subtitle) + '</div>' : '') +
    '<div class="meta">' + [s.event.date, s.event.place].filter(Boolean).map(esc).join(' · ') + '</div>' +
    (s.event.orga ? '<div class="orga" style="margin-top:14px">' + esc(s.event.orga) + ' <em>vous font vivre</em></div>' : '') +
    '</section>';

  const head = (label, title, sub) =>
    '<div class="phase-head"><span class="label gold">' + label + '</span><h2>' + title + '</h2>' + (sub ? '<div class="muted" style="margin-top:6px">' + sub + '</div>' : '') + '</div>';

  const Screens = {
    /* ---------------- Rejoindre ---------------- */
    JOIN(root, s) {
      root.innerHTML =
        hero(s) +
        '<form class="card" id="joinForm" autocomplete="off" style="margin-top:26px">' +
        '<div class="label gold center" style="margin-bottom:4px">Rejoins la table</div>' +
        '<label class="field"><span class="label">Ton pseudo</span><input class="input" id="pseudo" maxlength="24" required placeholder="ex. Doudou"></label>' +
        '<label class="field"><span class="label">Un mot qui te décrit</span><input class="input" id="word" maxlength="24" required placeholder="ex. curieuse"></label>' +
        '<button class="btn block" type="submit">Rejoindre la table</button>' +
        '<div class="error" id="joinErr"></div></form>' +
        '<p class="center muted" style="font-size:.8rem">Aucun compte nécessaire. Garde cette page ouverte pendant la soirée.</p>';
      const f = root.querySelector('#joinForm');
      const ps = root.querySelector('#pseudo');
      const wd = root.querySelector('#word');
      ps.value = store.get('adv_last_pseudo') || '';
      wd.value = store.get('adv_last_word') || '';
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = f.querySelector('button');
        btn.disabled = true;
        const res = await send('guest:join', { id: myId, pseudo: ps.value, word: wd.value });
        btn.disabled = false;
        if (res.ok) { store.set('adv_last_pseudo', ps.value.trim()); store.set('adv_last_word', wd.value.trim()); }
        else root.querySelector('#joinErr').textContent = res.error || '';
      });
    },

    /* ---------------- Lobby ---------------- */
    LOBBY(root, s) {
      root.innerHTML =
        hero(s) +
        '<div class="center" style="margin-top:28px"><span class="label">Bienvenue à la table</span>' +
        '<h1 style="margin-top:8px;font-style:italic">' + esc(s.me.pseudo) + '</h1>' +
        '<div class="serif" style="font-style:italic;font-size:1.25rem;color:var(--accent-2)">« ' + esc(s.me.word) + ' »</div></div>' +
        '<div class="ornament">' + sprig() + '</div>' +
        '<div class="waiting">L’animateur va bientôt lancer la soirée<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>' +
        '<div class="ornament">' + sprig() + '</div>' +
        '<div class="label" id="count"></div><div class="chips" id="guests" style="margin-top:10px"></div>';
      const $g = root.querySelector('#guests');
      const $c = root.querySelector('#count');
      return {
        update(s) {
          $c.textContent = s.lobby.guests.length + ' invité' + (s.lobby.guests.length > 1 ? 's' : '') + ' autour de la table';
          $g.innerHTML = s.lobby.guests.map((g) => '<span class="chip">' + esc(g.pseudo) + ' · <em>' + esc(g.word) + '</em></span>').join('');
        },
      };
    },

    /* ---------------- Je n'ai jamais ---------------- */
    BODY_COUNT(root) {
      root.innerHTML =
        head('Brise-glace', 'Je n’ai <em>jamais</em>') +
        '<div class="card"><div class="counter" id="ctr"></div><div class="progress"><div id="prog"></div></div>' +
        '<p class="statement" id="stmt"></p><div class="muted" id="readby" style="font-size:.8rem"></div></div>' +
        '<div id="reader"></div>' +
        '<div class="answer-row">' +
        '<button class="btn" id="yes"><span class="big">J’ai déjà</span>c’est vrai pour moi</button>' +
        '<button class="btn ghost" id="no"><span class="big">Je n’ai jamais</span>jamais de la vie</button></div>' +
        '<div class="answered" id="answered"></div>';
      const $ = (id) => root.querySelector('#' + id);
      let idx = -1;
      let sending = false;
      async function answer(yes) {
        if (sending) return;
        sending = true;
        await send('guest:bodyAnswer', { index: idx, yes });
        sending = false;
      }
      $('yes').onclick = () => answer(true);
      $('no').onclick = () => answer(false);
      return {
        update(s) {
          const b = s.body;
          idx = b.index;
          $('ctr').textContent = 'Affirmation ' + (b.index + 1) + ' / ' + b.total;
          $('prog').style.width = ((b.index + 1) / b.total) * 100 + '%';
          $('stmt').textContent = b.text;
          $('readby').textContent = b.isReader ? '' : b.readerPseudo ? 'Lue à voix haute par ' + (b.readerPseudo === 'Animateur' ? 'l’animateur' : b.readerPseudo) : 'Lue par l’animateur';
          $('reader').innerHTML = b.isReader
            ? '<div class="reader-box"><span class="serif">C’est à toi de la lire à voix haute !</span>Lis-la à toute la table, puis réponds.</div>'
            : '';
          const done = b.myAnswer !== null;
          $('yes').disabled = $('no').disabled = done;
          $('yes').classList.toggle('chosen', b.myAnswer === true);
          $('no').classList.toggle('chosen', b.myAnswer === false);
          $('yes').style.opacity = done && b.myAnswer !== true ? '.35' : '';
          $('no').style.opacity = done && b.myAnswer !== false ? '.35' : '';
          $('answered').innerHTML = (done ? '<strong>Réponse enregistrée.</strong> ' : '') + b.answered + ' / ' + b.of + ' ont répondu';
        },
      };
    },

    /* ---------------- Classement ---------------- */
    CLASSEMENT(root, s) {
      const r = s.ranking;
      if (!r) { root.innerHTML = head('Je n’ai jamais', 'Classement') + '<p class="muted">Le classement arrive…</p>'; return; }
      const t = s.me.profile;
      root.innerHTML =
        head('Je n’ai jamais · résultats', 'Ton classement') +
        '<div class="card stats"><div><div class="label">Rang</div><div class="big-num">' + r.rank + '<sup style="font-size:1.4rem">' + (r.rank === 1 ? 'er' : 'e') + '</sup></div><div class="muted" style="font-size:.8rem">sur ' + r.total + '</div></div>' +
        '<div><div class="label">Score</div><div class="big-num">' + r.score + '</div><div class="muted" style="font-size:.8rem">« j’ai déjà » sur ' + (r.of || 10) + '</div></div></div>' +
        (t
          ? '<div class="card profile-card" style="background:' + t.color + '"><div class="label">Ton profil de dégustateur</div><h2>' + esc(t.name) + '</h2>' + sprig() + '</div>'
          : '');
    },

    /* ---------------- Bouteille 1 : Mot interdit ---------------- */
    BOUTEILLE_1(root, s) {
      root.innerHTML =
        head('Bouteille n°1', 'Le Mot Interdit', s.b1.bottle ? 'Dans ton verre : <strong>' + esc(s.b1.bottle) + '</strong>' : '') +
        (s.b1.image ? '<div class="bottle-visual"><img src="' + esc(s.b1.image) + '" alt=""></div>' : '') +
        '<div class="card"><div class="label">Mots interdits</div><div class="forbidden" id="fw"></div>' +
        '<label class="field"><span class="label">Décris ce que tu ressens en goûtant</span>' +
        '<textarea class="input" id="txt" maxlength="280" placeholder="Arômes, texture, souvenir…"></textarea></label>' +
        '<div id="warn"></div>' +
        '<button class="btn block red" id="send" style="margin-top:12px">Épingler sur le mur</button></div>' +
        '<div class="ornament">' + sprig() + '</div>' +
        '<div class="label">Le mur des descriptions</div><div class="wall" id="wall"></div>';
      const $ = (id) => root.querySelector('#' + id);
      const txt = $('txt');
      let forbidden = s.b1.forbidden;
      if (s.b1.myNote) txt.value = s.b1.myNote;
      function check() {
        const hits = Shared.findForbidden(txt.value, forbidden);
        $('fw').innerHTML = forbidden.map((w) => '<span class="' + (hits.includes(w) ? 'hit' : '') + '">' + esc(w) + '</span>').join('');
        txt.classList.toggle('invalid', hits.length > 0);
        $('warn').innerHTML = hits.length
          ? '<div class="warn">Interdit ! Retire « ' + hits.map(esc).join(' », « ') + ' » pour pouvoir valider.</div>'
          : '';
        $('send').disabled = hits.length > 0 || !txt.value.trim();
        return hits.length === 0;
      }
      txt.addEventListener('input', check);
      $('send').onclick = async () => {
        if (!check()) return;
        $('send').disabled = true;
        const res = await send('guest:note1', { text: txt.value });
        if (res.ok) toast('Épinglé sur le mur ✓');
        check();
      };
      return {
        update(s) {
          forbidden = s.b1.forbidden;
          check();
          $('send').textContent = s.b1.myNote ? 'Mettre à jour ma note' : 'Épingler sur le mur';
          $('wall').innerHTML = s.b1.wall.length
            ? s.b1.wall.map((n) => '<div class="note' + (n.mine ? ' mine' : '') + '"><p>' + esc(n.text) + '</p><span class="by">— ' + esc(n.pseudo) + '</span></div>').join('')
            : '<p class="muted center">Le mur attend sa première note…</p>';
        },
      };
    },

    /* ---------------- Bouteille 2 : Le Match ---------------- */
    BOUTEILLE_2(root) {
      root.innerHTML =
        head('Bouteille n°2', 'Le Match', 'Laquelle préfères-tu ? Tu peux changer d’avis jusqu’au verrouillage.') +
        '<div class="match"><button class="btn ghost" id="a"></button><button class="btn ghost side-b" id="b"></button></div>' +
        '<div class="split" id="split"><div class="a" id="pa"></div><div class="b" id="pb"></div></div>' +
        '<p class="center muted" id="status" style="margin-top:14px"></p>';
      const $ = (id) => root.querySelector('#' + id);
      const vote = (side) => send('guest:vote2', { side });
      $('a').onclick = () => vote(0);
      $('b').onclick = () => vote(1);
      return {
        update(s) {
          const b = s.b2;
          const im = (i) => (b.images && b.images[i] ? '<img src="' + esc(b.images[i]) + '" alt="" class="match-img">' : '');
          const ha = im(0) + '<span class="label" style="color:inherit">côté A</span><span class="big">' + esc(b.labels[0]) + '</span>';
          const hb = im(1) + '<span class="label" style="color:inherit">côté B</span><span class="big">' + esc(b.labels[1]) + '</span>';
          if ($('a').dataset.h !== ha) { $('a').dataset.h = ha; $('a').innerHTML = ha; }
          if ($('b').dataset.h !== hb) { $('b').dataset.h = hb; $('b').innerHTML = hb; }
          $('a').classList.toggle('ghost', b.myVote !== 0);
          $('b').classList.toggle('ghost', b.myVote !== 1);
          $('a').disabled = $('b').disabled = b.locked;
          if (b.pct) {
            $('split').classList.remove('hidden');
            $('pa').style.flexBasis = b.pct[0] + '%';
            $('pb').style.flexBasis = b.pct[1] + '%';
            $('pa').textContent = b.pct[0] >= 12 ? b.pct[0] + '%' : '';
            $('pb').textContent = b.pct[1] >= 12 ? b.pct[1] + '%' : '';
          } else $('split').classList.add('hidden');
          $('status').textContent = b.locked
            ? 'Votes verrouillés.' + (b.myVote === null ? ' Tu n’as pas voté.' : '')
            : b.myVote === null ? 'Touche une bouteille pour voter.' : 'Vote enregistré — tu peux encore changer.';
        },
      };
    },

    /* ---------------- Bouteille 3 : Le Pari ---------------- */
    BOUTEILLE_3(root, s) {
      const r = s.b3;
      if (!r) {
        root.innerHTML = head('Le Pari Final', 'Le Juste Prix') +
          '<div class="stamp-wrap">' + stamp(s.event.date, 'patience') + '</div><div class="waiting">L’animateur prépare la bouteille<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>';
        return;
      }
      root.innerHTML =
        head('Le Pari · n°' + r.number, 'Le Juste Prix') +
        '<div class="card center">' +
        (r.image ? '<div class="bottle-visual"><img src="' + esc(r.image) + '" alt=""></div>' : '') +
        (r.bottle ? '<h3>' + esc(r.bottle) + '</h3>' : '') +
        '<p class="serif" style="font-size:1.35rem;font-style:italic;margin:8px 0 0">' + esc(r.question) + '</p></div>' +
        '<div id="zone"></div><p class="center muted" id="status"></p>';
      const $ = (id) => root.querySelector('#' + id);
      let lastMode = null;
      return {
        update(s) {
          const r = s.b3;
          const mode = r.revealed ? 'reveal' : 'play';
          if (mode === 'play') {
            if (lastMode !== 'play') {
              $('zone').innerHTML = '<div class="options">' + r.options.map((o, i) => '<button class="btn ghost" data-i="' + i + '">' + esc(o) + '</button>').join('') + '</div>';
              $('zone').querySelectorAll('button').forEach((b) => {
                b.onclick = () => send('guest:b3answer', { roundId: r.id, option: Number(b.dataset.i) });
              });
            }
            $('zone').querySelectorAll('button').forEach((b) => {
              const i = Number(b.dataset.i);
              b.classList.toggle('ghost', r.myAnswer !== i);
              b.classList.toggle('chosen', r.myAnswer === i);
              b.disabled = r.locked;
            });
            $('status').textContent = r.locked ? 'Réponses verrouillées — suspense…' : r.myAnswer === null ? 'Un seul choix, modifiable jusqu’au verrouillage.' : 'Choix enregistré.';
          } else {
            const verdict = r.won === null
              ? '<div class="verdict"><div class="big" style="color:var(--encre-soft)">Pas de pari</div></div>'
              : r.won
                ? '<div class="verdict won"><div class="big">Gagné !</div><span class="label">bien vu</span></div>'
                : '<div class="verdict lost"><div class="big">Perdu…</div><span class="label">ce sera pour la prochaine</span></div>';
            $('zone').innerHTML = verdict + '<div class="bars">' + r.options.map((o, i) =>
              '<div class="bar' + (i === r.correct ? ' correct' : '') + '"><div class="fill" style="width:' + r.pct[i] + '%"></div>' +
              '<div class="row"><span>' + esc(o) + (r.myAnswer === i ? ' <span class="muted">(toi)</span>' : '') + '</span>' +
              '<span>' + r.pct[i] + '%</span></div>' + (i === r.correct ? '<span class="tag tag-line">✓ bonne réponse</span>' : '') + '</div>').join('') + '</div>';
            $('status').textContent = '';
          }
          lastMode = mode;
        },
      };
    },

    /* ---------------- Clôture ---------------- */
    CLOTURE(root, s) {
      root.innerHTML =
        head('Clôture', 'Le Mur de mots', 'Un mot ou une phrase pour résumer ta soirée.') +
        '<div class="card"><input class="input" id="txt" maxlength="120" placeholder="Ta carte postale en quelques mots">' +
        '<button class="btn block red" id="send" style="margin-top:12px">Poster</button></div>' +
        '<div class="ornament">' + sprig() + '</div><div class="postcards" id="wall"></div>';
      const $ = (id) => root.querySelector('#' + id);
      if (s.closing.myText) $('txt').value = s.closing.myText;
      const post = async () => {
        if (!$('txt').value.trim()) return;
        const res = await send('guest:closing', { text: $('txt').value });
        if (res.ok) toast('Posté ✓');
      };
      $('send').onclick = post;
      $('txt').addEventListener('keydown', (e) => { if (e.key === 'Enter') post(); });
      return {
        update(s) {
          $('send').textContent = s.closing.myText ? 'Modifier mon mot' : 'Poster';
          $('wall').innerHTML = s.closing.wall.length
            ? s.closing.wall.map((w) => '<div class="pc"><p>' + esc(w.text) + '</p><span>' + esc(w.pseudo) + '</span></div>').join('')
            : '<p class="muted">Les premiers mots arrivent…</p>';
        },
      };
    },

    /* ---------------- Fiche récap ---------------- */
    RECAP(root, s) {
      const r = s.recap;
      if (!r) { root.innerHTML = '<p class="muted">Fiche indisponible.</p>'; return; }
      const t = r.profile;
      const sec = (label, val) => '<div class="recap-sec"><div class="label">' + label + '</div><div class="val">' + val + '</div></div>';
      const none = '<small>—</small>';
      const voteTxt = r.vote
        ? esc(r.vote.label) + ' <small>· ' + (r.vote.side === 'majorite' ? 'dans la majorité' : r.vote.side === 'minorite' ? 'dans la minorité' : 'à égalité parfaite') + '</small>'
        : none;
      const paris = r.paris.length
        ? r.paris.map((p) => '<div class="pari-line"><span>' + esc(p.bottle) + '<br><small>' + (p.myOption ? 'ton choix : ' + esc(p.myOption) : 'pas de réponse') + '</small></span>' +
          (p.won === null ? '<span class="pill lost">—</span>' : '<span class="pill ' + (p.won ? 'won' : 'lost') + '">' + (p.won ? 'gagné' : 'perdu') + '</span>') + '</div>').join('')
        : none;
      root.innerHTML =
        '<p class="center label" style="margin-bottom:10px">Ta fiche-souvenir · fais une capture d’écran</p>' +
        '<article class="recap">' +
        '<div class="recap-head"><div class="band"></div><img class="logo" src="/logo.png" alt="">' +
        (s.event.subtitle ? '<span class="label gold">' + esc(s.event.subtitle) + '</span>' : '') +
        '<span class="label" style="margin-top:4px">' + esc(s.event.date) + '</span>' +
        '<h1>' + esc(r.pseudo) + '</h1><div class="word">« ' + esc(r.word) + ' »</div>' + stamp(s.event.date, 'souvenir') + '</div>' +
        (t ? '<div class="recap-profile" style="background:' + t.color + '"><span class="label">Profil de dégustateur</span><span>' + esc(t.name) + '</span></div>' : '') +
        sec('Je n’ai jamais', r.score === null ? none : r.score + ' « j’ai déjà » <small>sur ' + r.of + ' ' + (r.rank ? '· ' + r.rank + (r.rank === 1 ? 'er' : 'e') + ' sur ' + r.total : '') + '</small>') +
        sec('Le Mot Interdit' + (r.bottle1 ? ' · ' + esc(r.bottle1) : ''), r.note1 ? '« ' + esc(r.note1) + ' »' : none) +
        sec('Le Match', voteTxt) +
        '<div class="recap-sec"><div class="label">Le Juste Prix</div><div style="margin-top:4px">' + paris + '</div></div>' +
        sec('Mon mot de la soirée', r.closing ? '« ' + esc(r.closing) + ' »' : none) +
        '<div class="recap-foot">' + sprig() + '<span class="label">' + (s.event.place ? esc(s.event.place.split('·')[0].trim()) + '<br>' : '') + 'Martinique</span></div>' +
        '</article>';
    },
  };
})();
