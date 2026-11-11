/* Autour d'un Verre — serveur temps réel (état en mémoire, un seul événement). */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
// Les fichiers du site peuvent être dans ./public ou à la racine (dépôt « à plat »)
const PUB = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const STATIC_FILES = ['index.html', 'host.html', 'style.css', 'common.js', 'shared.js', 'guest.js', 'host.js'];
const { findForbidden } = require(path.join(PUB, 'shared.js'));

const PORT = process.env.PORT || 3000;
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'apero';
if (!process.env.HOST_PASSWORD) {
  console.warn('[!] HOST_PASSWORD non défini : mot de passe animateur par défaut = "apero"');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6, pingInterval: 20000, pingTimeout: 25000 });

/* ------------------------------------------------------------------ */
/* Contenu                                                             */
/* ------------------------------------------------------------------ */
const PHASES = ['LOBBY', 'BODY_COUNT', 'CLASSEMENT', 'BOUTEILLE_1', 'BOUTEILLE_2', 'BOUTEILLE_3', 'CLOTURE', 'RECAP'];

const STATEMENTS = [
  "Lève la main si tu as déjà acheté une bouteille juste parce que l'étiquette était belle.",
  "Lève la main si tu as déjà confondu deux spiritueux au goût sans t'en rendre compte.",
  "Lève la main si tu penses qu'un vin ou un rhum vieux est automatiquement meilleur qu'un jeune.",
  "Lève la main si tu as une bouteille qui prend la poussière chez toi depuis plus d'un an.",
  "Lève la main si tu as déjà fait, ou voulu faire, un rhum arrangé toi-même.",
  "Lève la main si tu commandes presque toujours la même chose au bar.",
  "Lève la main si tu as déjà offert une bouteille sans vraiment savoir ce qu'il y avait dedans.",
  "Lève la main si tu crois que la couleur d'un spiritueux en dit long sur sa qualité.",
  "Lève la main si tu as déjà fini un verre que tu n'aimais pas, juste pour ne pas gâcher.",
  "Lève la main si tu es du genre à sentir une bouteille avant même de la goûter.",
];

const TEAMS = [
  { key: 'epicurieux', name: 'Les Épicurieux', color: '#9A3B34' },
  { key: 'amateurs', name: 'Les Amateurs Éclairés', color: '#B8923E' },
  { key: 'sages', name: 'Les Sages du Bar', color: '#2B3A67' },
];

const DEFAULT_FORBIDDEN = ['bon', 'fort', 'sucré', 'sympa', 'bien'];
const DEFAULT_QUESTION = 'Quel est le prix de cette bouteille ?';
const DEFAULT_OPTIONS = ['Moins de 30€', 'Entre 30 et 60€', 'Plus de 60€'];

function todayStamp() {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'America/Martinique', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date());
  return parts.replace(/\//g, '.');
}

/* ------------------------------------------------------------------ */
/* État                                                                */
/* ------------------------------------------------------------------ */
let state;
const images = new Map(); // id -> { mime, buf }

function freshState() {
  return {
    sessionId: crypto.randomUUID(),
    phase: 'LOBBY',
    event: { title: "Autour d'un Verre", date: todayStamp() },
    players: new Map(),
    joinCounter: 0,
    body: { started: false, index: 0, readers: [] },
    ranking: null, // [{id, score, rank}]
    b1: { bottle: '', forbidden: DEFAULT_FORBIDDEN.slice() },
    b2: { labels: ['Bouteille 1', 'Bouteille 2'], locked: false },
    b3: { rounds: [], currentId: null },
  };
}
state = freshState();

function newPlayer(id, pseudo, word, isBot = false) {
  return {
    id, pseudo, word, isBot,
    order: ++state.joinCounter,
    joinedAt: Date.now(),
    body: {}, // index -> true/false
    team: null,
    note1: null, // { text, ts }
    vote2: null, // 0 | 1
    closing: null, // { text, ts }
  };
}

const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const playersList = () => [...state.players.values()].sort((a, b) => a.order - b.order);
const scoreOf = (p) => Object.values(p.body).filter((v) => v === true).length;
const teamObj = (key) => TEAMS.find((t) => t.key === key) || null;

function connectedIds() {
  const set = new Set();
  for (const s of io.of('/').sockets.values()) if (s.data.pid) set.add(s.data.pid);
  return set;
}

/* ------------------------------------------------------------------ */
/* Logique de jeu                                                      */
/* ------------------------------------------------------------------ */
function startBody() {
  const list = playersList();
  state.body.readers = STATEMENTS.map((_, i) => (list.length ? list[i % list.length].id : null));
  state.body.index = 0;
  state.body.started = true;
  state.phase = 'BODY_COUNT';
}

function computeRanking() {
  const list = playersList()
    .map((p) => ({ id: p.id, score: scoreOf(p), order: p.order }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const n = list.length;
  const base = Math.floor(n / 3);
  const rem = n % 3;
  const sizes = [base + (rem >= 1 ? 1 : 0), base + (rem === 2 ? 1 : 0), base];
  list.forEach((r, idx) => {
    r.rank = idx + 1;
    const teamIdx = idx < sizes[0] ? 0 : idx < sizes[0] + sizes[1] ? 1 : 2;
    state.players.get(r.id).team = TEAMS[teamIdx].key;
  });
  state.ranking = list.map(({ id, score, rank }) => ({ id, score, rank }));
}

function smallestTeam() {
  const counts = TEAMS.map((t) => ({ key: t.key, n: playersList().filter((p) => p.team === t.key).length }));
  counts.sort((a, b) => a.n - b.n);
  return counts[0].key;
}

function rankOf(pid) {
  if (!state.ranking) return null;
  const r = state.ranking.find((x) => x.id === pid);
  return r ? r.rank : null;
}

function pctPair(a, b) {
  const t = a + b;
  if (!t) return null;
  const pa = Math.round((a / t) * 100);
  return [pa, 100 - pa];
}

function b2Counts() {
  const c = [0, 0];
  for (const p of state.players.values()) if (p.vote2 === 0 || p.vote2 === 1) c[p.vote2]++;
  return c;
}

function currentRound() {
  return state.b3.rounds.find((r) => r.id === state.b3.currentId) || null;
}

function roundCounts(r) {
  const c = [0, 0, 0];
  for (const v of Object.values(r.answers)) if (c[v] !== undefined) c[v]++;
  return c;
}

function percents(counts) {
  const t = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => (t ? Math.round((c / t) * 100) : 0));
}

/* ------------------------------------------------------------------ */
/* Vues : le payload invité est construit champ par champ, jamais      */
/* à partir de l'état brut — aucune donnée nominative du Match ici.    */
/* ------------------------------------------------------------------ */
function guestView(pid) {
  const p = pid ? state.players.get(pid) : null;
  const list = playersList();
  const v = {
    role: 'guest',
    sessionId: state.sessionId,
    phase: state.phase,
    event: { ...state.event },
    playerCount: list.length,
    me: p
      ? { id: p.id, pseudo: p.pseudo, word: p.word, team: teamObj(p.team) }
      : null,
  };

  switch (state.phase) {
    case 'LOBBY':
      v.lobby = { guests: list.map((x) => ({ pseudo: x.pseudo, word: x.word })) };
      break;

    case 'BODY_COUNT': {
      const i = state.body.index;
      const readerId = state.body.readers[i];
      const reader = readerId ? state.players.get(readerId) : null;
      v.body = {
        index: i,
        total: STATEMENTS.length,
        text: STATEMENTS[i],
        isReader: !!p && readerId === p.id,
        readerPseudo: reader ? reader.pseudo : null,
        myAnswer: p && p.body[i] !== undefined ? p.body[i] : null,
        answered: list.filter((x) => x.body[i] !== undefined).length,
        of: list.length,
      };
      break;
    }

    case 'CLASSEMENT':
      if (p && state.ranking) {
        const mates = list.filter((x) => x.team === p.team && x.id !== p.id).map((x) => ({ pseudo: x.pseudo, word: x.word }));
        v.ranking = { score: scoreOf(p), rank: rankOf(p.id), total: state.ranking.length, teammates: mates };
      } else v.ranking = null;
      break;

    case 'BOUTEILLE_1':
      v.b1 = {
        bottle: state.b1.bottle,
        forbidden: state.b1.forbidden.slice(),
        myNote: p && p.note1 ? p.note1.text : null,
        wall: list
          .filter((x) => x.note1)
          .sort((a, b) => b.note1.ts - a.note1.ts)
          .map((x) => ({ pseudo: x.pseudo, text: x.note1.text, mine: !!p && x.id === p.id })),
      };
      break;

    case 'BOUTEILLE_2': {
      const c = b2Counts();
      v.b2 = {
        labels: state.b2.labels.slice(),
        locked: state.b2.locked,
        myVote: p ? p.vote2 : null,
        pct: pctPair(c[0], c[1]), // pourcentages uniquement
      };
      break;
    }

    case 'BOUTEILLE_3': {
      const r = currentRound();
      if (!r) { v.b3 = null; break; }
      const my = p && r.answers[p.id] !== undefined ? r.answers[p.id] : null;
      v.b3 = {
        id: r.id,
        number: state.b3.rounds.indexOf(r) + 1,
        bottle: r.bottle,
        image: r.image,
        question: r.question,
        options: r.options.slice(),
        locked: r.locked,
        revealed: r.revealed,
        myAnswer: my,
      };
      if (r.revealed) {
        const counts = roundCounts(r);
        v.b3.correct = r.correct;
        v.b3.counts = counts;
        v.b3.pct = percents(counts);
        v.b3.won = my === null ? null : my === r.correct;
      }
      break;
    }

    case 'CLOTURE':
      v.closing = {
        myText: p && p.closing ? p.closing.text : null,
        wall: list
          .filter((x) => x.closing)
          .sort((a, b) => a.closing.ts - b.closing.ts)
          .map((x) => ({ pseudo: x.pseudo, text: x.closing.text, team: x.team })),
      };
      break;

    case 'RECAP':
      v.recap = p ? recapFor(p) : null;
      break;
  }
  return v;
}

function recapFor(p) {
  const c = b2Counts();
  let vote = null;
  if (p.vote2 === 0 || p.vote2 === 1) {
    const mine = c[p.vote2];
    const other = c[1 - p.vote2];
    vote = {
      label: state.b2.labels[p.vote2],
      side: mine > other ? 'majorite' : mine < other ? 'minorite' : 'egalite',
    };
  }
  const paris = state.b3.rounds
    .filter((r) => r.revealed)
    .map((r) => {
      const a = r.answers[p.id];
      return {
        bottle: r.bottle || 'Bouteille',
        question: r.question,
        myOption: a !== undefined ? r.options[a] : null,
        correctOption: r.options[r.correct],
        won: a === undefined ? null : a === r.correct,
      };
    });
  return {
    pseudo: p.pseudo,
    word: p.word,
    team: teamObj(p.team),
    score: state.body.started ? scoreOf(p) : null,
    rank: rankOf(p.id),
    total: state.ranking ? state.ranking.length : null,
    note1: p.note1 ? p.note1.text : null,
    bottle1: state.b1.bottle,
    vote,
    paris,
    closing: p.closing ? p.closing.text : null,
  };
}

function hostView() {
  const list = playersList();
  const online = connectedIds();
  const byId = (id) => state.players.get(id);
  const c2 = b2Counts();
  const i = state.body.index;
  return {
    role: 'host',
    sessionId: state.sessionId,
    phase: state.phase,
    phases: PHASES,
    event: { ...state.event },
    teams: TEAMS,
    players: list.map((p) => ({
      id: p.id, pseudo: p.pseudo, word: p.word, isBot: p.isBot, online: p.isBot || online.has(p.id),
      score: scoreOf(p), team: p.team, rank: rankOf(p.id),
    })),
    body: {
      started: state.body.started,
      index: i,
      total: STATEMENTS.length,
      text: STATEMENTS[i],
      readerPseudo: state.body.readers[i] ? (byId(state.body.readers[i]) || {}).pseudo || '—' : null,
      readers: state.body.readers.map((id) => (id && byId(id) ? byId(id).pseudo : '—')),
      answers: list.map((p) => ({ pseudo: p.pseudo, answer: p.body[i] === undefined ? null : p.body[i] })),
    },
    ranking: state.ranking
      ? state.ranking.filter((r) => byId(r.id)).map((r) => ({ ...r, pseudo: byId(r.id).pseudo, word: byId(r.id).word, team: byId(r.id).team, score: scoreOf(byId(r.id)) }))
      : null,
    b1: {
      bottle: state.b1.bottle,
      forbidden: state.b1.forbidden.slice(),
      wall: list.filter((p) => p.note1).sort((a, b) => b.note1.ts - a.note1.ts).map((p) => ({ pseudo: p.pseudo, text: p.note1.text })),
    },
    b2: {
      labels: state.b2.labels.slice(),
      locked: state.b2.locked,
      counts: c2,
      pct: pctPair(c2[0], c2[1]),
      voters: [0, 1].map((side) => list.filter((p) => p.vote2 === side).map((p) => p.pseudo)),
      abstain: list.filter((p) => p.vote2 !== 0 && p.vote2 !== 1).map((p) => p.pseudo),
    },
    b3: {
      currentId: state.b3.currentId,
      defaults: { question: DEFAULT_QUESTION, options: DEFAULT_OPTIONS },
      rounds: state.b3.rounds.map((r, idx) => {
        const counts = roundCounts(r);
        return {
          id: r.id, number: idx + 1, bottle: r.bottle, image: r.image, question: r.question, options: r.options,
          locked: r.locked, revealed: r.revealed, correct: r.correct, counts, pct: percents(counts),
          names: [0, 1, 2].map((o) => list.filter((p) => r.answers[p.id] === o).map((p) => p.pseudo)),
        };
      }),
    },
    closing: list.filter((p) => p.closing).sort((a, b) => a.closing.ts - b.closing.ts).map((p) => ({ pseudo: p.pseudo, text: p.closing.text, team: p.team })),
  };
}

/* ------------------------------------------------------------------ */
/* Diffusion (regroupée pour limiter le trafic)                        */
/* ------------------------------------------------------------------ */
let pending = false;
function broadcast() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    const hv = hostView();
    for (const s of io.of('/').sockets.values()) {
      if (s.data.isHost) s.emit('host:state', hv); // canal host
      else s.emit('state', guestView(s.data.pid)); // canal invité
    }
  }, 30);
}

/* ------------------------------------------------------------------ */
/* Démo : invités fictifs                                              */
/* ------------------------------------------------------------------ */
const BOT_NAMES = [
  ['Ti-Punch', 'curieux'], ['Doudou', 'gourmande'], ['Zouk', 'festif'], ['Colombo', 'épicé'],
  ['Planteur', 'rêveur'], ['Shrubb', 'patiente'], ['Accras', 'croustillant'], ['Bokit', 'généreux'],
  ['Madras', 'colorée'], ['Lambi', 'discret'], ['Christophine', 'pétillante'], ['Chatou', 'joueur'],
];
const BOT_NOTES = [
  'Vanille et cuir, une longueur qui chatouille la gorge', 'Notes de canne fraîche, presque herbacé',
  'Un nez de bois brûlé et de fruits secs', 'Ça pique puis ça s’arrondit, comme une banane flambée',
  'Épices douces, cannelle, un peu de poivre', 'Rond en bouche, finale sur le cacao',
];
const BOT_CLOSING = ['Une soirée qui a du nez', 'Découverte !', 'On remet ça', 'Merci pour le voyage', 'Santé et bonne humeur', 'J’ai appris à goûter'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function addBots(n) {
  const used = new Set(playersList().map((p) => p.pseudo));
  let added = 0;
  for (const [name, word] of BOT_NAMES) {
    if (added >= n) break;
    if (used.has(name)) continue;
    const id = 'bot-' + crypto.randomUUID();
    const p = newPlayer(id, name, word, true);
    if (state.ranking) p.team = smallestTeam();
    state.players.set(id, p);
    added++;
  }
  return added;
}

function botsPlay() {
  const bots = playersList().filter((p) => p.isBot);
  const now = Date.now();
  bots.forEach((b, k) => {
    switch (state.phase) {
      case 'BODY_COUNT':
        if (b.body[state.body.index] === undefined) b.body[state.body.index] = Math.random() < 0.5;
        break;
      case 'BOUTEILLE_1':
        if (!b.note1) b.note1 = { text: pick(BOT_NOTES), ts: now + k };
        break;
      case 'BOUTEILLE_2':
        if (!state.b2.locked) b.vote2 = Math.random() < 0.6 ? 0 : 1;
        break;
      case 'BOUTEILLE_3': {
        const r = currentRound();
        if (r && !r.locked) r.answers[b.id] = Math.floor(Math.random() * 3);
        break;
      }
      case 'CLOTURE':
        if (!b.closing) b.closing = { text: pick(BOT_CLOSING), ts: now + k };
        break;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Sockets                                                             */
/* ------------------------------------------------------------------ */
const ok = (ack, data = {}) => typeof ack === 'function' && ack({ ok: true, ...data });
const fail = (ack, error) => typeof ack === 'function' && ack({ ok: false, error });

io.on('connection', (socket) => {
  socket.data.pid = null;
  socket.data.isHost = false;

  /* ---------- Invité ---------- */
  socket.on('guest:hello', (msg, ack) => {
    const id = msg && typeof msg.id === 'string' ? msg.id.slice(0, 64) : null;
    if (id && state.players.has(id)) socket.data.pid = id;
    else socket.data.pid = null;
    ok(ack, { known: !!socket.data.pid });
    socket.emit('state', guestView(socket.data.pid));
    broadcast();
  });

  socket.on('guest:join', (msg, ack) => {
    const id = msg && typeof msg.id === 'string' ? msg.id.slice(0, 64) : null;
    const pseudo = clean(msg && msg.pseudo, 24);
    const word = clean(msg && msg.word, 24);
    if (!id || id.startsWith('bot-')) return fail(ack, 'Identifiant invalide, recharge la page.');
    if (!pseudo) return fail(ack, 'Choisis un pseudo.');
    if (!word) return fail(ack, 'Ajoute un mot qui te décrit.');
    const existing = state.players.get(id);
    const taken = playersList().some((p) => p.id !== id && p.pseudo.toLocaleLowerCase('fr') === pseudo.toLocaleLowerCase('fr'));
    if (taken) return fail(ack, 'Ce pseudo est déjà pris, choisis-en un autre.');
    if (existing) { existing.pseudo = pseudo; existing.word = word; }
    else {
      const p = newPlayer(id, pseudo, word);
      if (state.ranking) p.team = smallestTeam(); // arrivée tardive
      state.players.set(id, p);
    }
    socket.data.pid = id;
    ok(ack);
    broadcast();
  });

  const me = () => (socket.data.pid ? state.players.get(socket.data.pid) : null);

  socket.on('guest:bodyAnswer', (msg, ack) => {
    const p = me();
    if (!p) return fail(ack, 'Rejoins d’abord la partie.');
    if (state.phase !== 'BODY_COUNT') return fail(ack, 'Ce n’est plus le moment.');
    const i = state.body.index;
    if (msg.index !== i) return fail(ack, 'Affirmation déjà passée.');
    if (p.body[i] !== undefined) return fail(ack, 'Tu as déjà répondu.');
    p.body[i] = msg.yes === true;
    ok(ack);
    broadcast();
  });

  socket.on('guest:note1', (msg, ack) => {
    const p = me();
    if (!p) return fail(ack, 'Rejoins d’abord la partie.');
    if (state.phase !== 'BOUTEILLE_1') return fail(ack, 'Ce n’est plus le moment.');
    const text = clean(msg && msg.text, 280);
    if (!text) return fail(ack, 'Écris quelque chose !');
    const bad = findForbidden(text, state.b1.forbidden);
    if (bad.length) return fail(ack, 'Mot interdit : ' + bad.join(', '));
    p.note1 = { text, ts: Date.now() };
    ok(ack);
    broadcast();
  });

  socket.on('guest:vote2', (msg, ack) => {
    const p = me();
    if (!p) return fail(ack, 'Rejoins d’abord la partie.');
    if (state.phase !== 'BOUTEILLE_2') return fail(ack, 'Ce n’est plus le moment.');
    if (state.b2.locked) return fail(ack, 'Les votes sont verrouillés.');
    if (msg.side !== 0 && msg.side !== 1) return fail(ack, 'Vote invalide.');
    p.vote2 = msg.side;
    ok(ack);
    broadcast();
  });

  socket.on('guest:b3answer', (msg, ack) => {
    const p = me();
    if (!p) return fail(ack, 'Rejoins d’abord la partie.');
    const r = currentRound();
    if (state.phase !== 'BOUTEILLE_3' || !r || r.id !== msg.roundId) return fail(ack, 'Ce pari est terminé.');
    if (r.locked) return fail(ack, 'Les réponses sont verrouillées.');
    if (![0, 1, 2].includes(msg.option)) return fail(ack, 'Choix invalide.');
    r.answers[p.id] = msg.option;
    ok(ack);
    broadcast();
  });

  socket.on('guest:closing', (msg, ack) => {
    const p = me();
    if (!p) return fail(ack, 'Rejoins d’abord la partie.');
    if (state.phase !== 'CLOTURE') return fail(ack, 'Ce n’est plus le moment.');
    const text = clean(msg && msg.text, 120);
    if (!text) return fail(ack, 'Un mot, au moins !');
    p.closing = { text, ts: p.closing ? p.closing.ts : Date.now() };
    ok(ack);
    broadcast();
  });

  /* ---------- Animateur ---------- */
  socket.on('host:auth', (msg, ack) => {
    const pw = String((msg && msg.password) || '');
    const a = Buffer.from(pw);
    const b = Buffer.from(HOST_PASSWORD);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(ack, 'Mot de passe incorrect.');
    socket.data.isHost = true;
    socket.data.pid = null;
    ok(ack);
    socket.emit('host:state', hostView());
  });

  socket.on('host:action', (msg, ack) => {
    if (!socket.data.isHost) return fail(ack, 'Non autorisé.');
    try {
      const res = hostAction(msg || {});
      if (res && res.error) return fail(ack, res.error);
      ok(ack, res || {});
      broadcast();
    } catch (e) {
      console.error(e);
      fail(ack, 'Erreur serveur.');
    }
  });

  socket.on('disconnect', () => broadcast());
});

function hostAction(a) {
  switch (a.type) {
    case 'setPhase': {
      if (!PHASES.includes(a.phase)) return { error: 'Phase inconnue.' };
      if (a.phase === 'BODY_COUNT' && !state.body.started) { startBody(); return; }
      if (a.phase === 'CLASSEMENT') computeRanking();
      state.phase = a.phase;
      return;
    }
    case 'startBody':
      if (!state.players.size) return { error: 'Personne n’a encore rejoint.' };
      startBody();
      return;
    case 'bodyNav': {
      const n = state.body.index + (a.delta > 0 ? 1 : -1);
      if (n < 0 || n >= STATEMENTS.length) return;
      state.body.index = n;
      return;
    }
    case 'reassignReaders':
      startBody();
      return;
    case 'showRanking':
      computeRanking();
      state.phase = 'CLASSEMENT';
      return;
    case 'configEvent':
      state.event.title = clean(a.title, 60) || "Autour d'un Verre";
      state.event.date = clean(a.date, 20) || todayStamp();
      return;
    case 'configB1': {
      state.b1.bottle = clean(a.bottle, 60);
      const words = (Array.isArray(a.forbidden) ? a.forbidden : []).map((w) => clean(w, 30)).filter(Boolean);
      state.b1.forbidden = [...new Set(words)].slice(0, 30);
      return;
    }
    case 'configB2':
      state.b2.labels = [clean(a.labels && a.labels[0], 40) || 'Bouteille 1', clean(a.labels && a.labels[1], 40) || 'Bouteille 2'];
      return;
    case 'b2Lock':
      state.b2.locked = !!a.locked;
      return;
    case 'b2Reset':
      for (const p of state.players.values()) p.vote2 = null;
      state.b2.locked = false;
      return;
    case 'b3Launch': {
      const opts = (Array.isArray(a.options) ? a.options : []).map((o) => clean(o, 40));
      if (opts.length !== 3 || opts.some((o) => !o)) return { error: 'Il faut exactement 3 options.' };
      const r = {
        id: crypto.randomUUID(),
        bottle: clean(a.bottle, 60),
        image: typeof a.image === 'string' && /^\/img\/[\w-]+$/.test(a.image) ? a.image : null,
        question: clean(a.question, 120) || DEFAULT_QUESTION,
        options: opts,
        answers: {},
        locked: false,
        revealed: false,
        correct: null,
      };
      state.b3.rounds.push(r);
      state.b3.currentId = r.id;
      state.phase = 'BOUTEILLE_3';
      return { id: r.id };
    }
    case 'b3Select': {
      if (!state.b3.rounds.some((r) => r.id === a.id)) return { error: 'Pari introuvable.' };
      state.b3.currentId = a.id;
      return;
    }
    case 'b3Lock': {
      const r = currentRound();
      if (!r) return { error: 'Aucun pari en cours.' };
      r.locked = !!a.locked;
      if (!r.locked) { r.revealed = false; }
      return;
    }
    case 'b3Reveal': {
      const r = currentRound();
      if (!r) return { error: 'Aucun pari en cours.' };
      if (![0, 1, 2].includes(a.correct)) return { error: 'Choisis la bonne réponse.' };
      r.locked = true;
      r.correct = a.correct;
      r.revealed = true;
      return;
    }
    case 'b3Hide': {
      const r = currentRound();
      if (r) r.revealed = false;
      return;
    }
    case 'uploadImage': {
      const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(a.dataUrl || ''));
      if (!m) return { error: 'Image invalide.' };
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3e6) return { error: 'Image trop lourde.' };
      const id = crypto.randomUUID();
      images.set(id, { mime: m[1], buf });
      return { url: '/img/' + id };
    }
    case 'removePlayer':
      state.players.delete(a.id);
      for (const s of io.of('/').sockets.values()) if (s.data.pid === a.id) s.data.pid = null;
      if (state.ranking) state.ranking = state.ranking.filter((r) => r.id !== a.id);
      for (const r of state.b3.rounds) delete r.answers[a.id];
      return;
    case 'addBots':
      return { added: addBots(Math.max(1, Math.min(12, a.n | 0 || 6))) };
    case 'botsPlay':
      botsPlay();
      return;
    case 'removeBots':
      for (const p of playersList()) if (p.isBot) hostAction({ type: 'removePlayer', id: p.id });
      return;
    case 'reset':
      state = freshState();
      images.clear();
      for (const s of io.of('/').sockets.values()) if (!s.data.isHost) { s.data.pid = null; s.emit('session:reset'); }
      return;
    default:
      return { error: 'Action inconnue.' };
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
app.disable('x-powered-by');
app.get('/host', (req, res) => res.sendFile(path.join(PUB, 'host.html')));
app.get('/', (req, res) => res.sendFile(path.join(PUB, 'index.html')));
app.get('/healthz', (req, res) => res.json({ ok: true, players: state.players.size, phase: state.phase }));
app.get('/img/:id', (req, res) => {
  const img = images.get(req.params.id);
  if (!img) return res.status(404).end();
  res.set('Content-Type', img.mime).set('Cache-Control', 'public, max-age=86400').send(img.buf);
});
app.get('/qr.svg', async (req, res) => {
  const base = process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  const svg = await QRCode.toString(base + '/', { type: 'svg', margin: 1, color: { dark: '#2B3A67', light: '#F4F1E8' } });
  res.set('Content-Type', 'image/svg+xml').send(svg);
});
app.get('/:file', (req, res, next) => {
  if (!STATIC_FILES.includes(req.params.file)) return next();
  res.set('Cache-Control', 'no-cache').sendFile(path.join(PUB, req.params.file));
});

server.listen(PORT, () => {
  console.log(`Autour d'un Verre — http://localhost:${PORT}  (animateur : /host)`);
});
