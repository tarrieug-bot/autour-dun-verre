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
const STATIC_FILES = ['index.html', 'host.html', 'style.css', 'common.js', 'shared.js', 'guest.js', 'host.js',
  'logo.png', 'bodoni.woff2', 'bodoni-italic.woff2', 'josefin-300.woff2', 'josefin-400.woff2', 'josefin-600.woff2',
  'band-whisky.jpg', 'band-champagne.jpg', 'bg-whisky.jpg', 'bg-champagne.jpg'];
const { findForbidden } = require(path.join(PUB, 'shared.js'));

const PORT = process.env.PORT || 3000;
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'apero';
if (!process.env.HOST_PASSWORD) {
  console.warn('[!] HOST_PASSWORD non défini : mot de passe animateur par défaut = "apero"');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 12e6, pingInterval: 20000, pingTimeout: 25000 });

/* ------------------------------------------------------------------ */
/* Contenu                                                             */
/* ------------------------------------------------------------------ */
const PHASES = ['LOBBY', 'BODY_COUNT', 'CLASSEMENT', 'BOUTEILLE_1', 'BOUTEILLE_2', 'BOUTEILLE_3', 'CLOTURE', 'RECAP'];

// Jeu « Je n'ai jamais » : réponse « J'ai déjà » = 1 point
const DEFAULT_STATEMENTS = [
  "Je n'ai jamais acheté une bouteille juste parce que l'étiquette était belle.",
  "Je n'ai jamais confondu deux spiritueux au goût sans m'en rendre compte.",
  "Je n'ai jamais pensé qu'un rhum ou un vin vieux était forcément meilleur qu'un jeune.",
  "Je n'ai jamais laissé une bouteille prendre la poussière chez moi pendant plus d'un an.",
  "Je n'ai jamais fait, ni voulu faire, un rhum arrangé moi-même.",
  "Je n'ai jamais commandé exactement la même chose au bar trois fois de suite.",
  "Je n'ai jamais offert une bouteille sans vraiment savoir ce qu'il y avait dedans.",
  "Je n'ai jamais jugé la qualité d'un spiritueux à sa couleur.",
  "Je n'ai jamais fini un verre que je n'aimais pas, juste pour ne pas gâcher.",
  "Je n'ai jamais senti une bouteille avant même de la goûter.",
  "Je n'ai jamais fait semblant de sentir des arômes que je ne sentais pas du tout.",
  "Je n'ai jamais choisi un vin au restaurant uniquement d'après son prix.",
  "Je n'ai jamais grimacé en voyant quelqu'un mettre un glaçon dans un bon spiritueux.",
  "Je n'ai jamais gardé une bouteille « pour une grande occasion » qui n'est jamais arrivée.",
  "Je n'ai jamais goûté un spiritueux dont je ne saurais même pas prononcer le nom.",
  "Je n'ai jamais ramené une bouteille de voyage qui n'avait plus le même goût à la maison.",
  "Je n'ai jamais reconnu un rhum agricole les yeux fermés.",
  "Je n'ai jamais dit « il est très rond en bouche » sans trop savoir ce que ça voulait dire.",
  "Je n'ai jamais mélangé un très bon spiritueux avec du soda.",
  "Je n'ai jamais visité de distillerie, de cave ou de domaine.",
  "Je n'ai jamais eu de verre préféré pour déguster.",
  "Je n'ai jamais été la seule personne à table à aimer une bouteille.",
  "Je n'ai jamais noté un vin ou un spiritueux sur une appli.",
  "Je n'ai jamais ouvert de champagne en dehors d'une fête.",
  "Je n'ai jamais trinqué sans regarder les autres dans les yeux.",
];
// Anciennes formulations (« Lève la main si tu … » / « Tu … ») → nouvelles, pour les préparations déjà enregistrées
const LEGACY_STATEMENTS = new Map([
  ["Tu as déjà acheté une bouteille juste parce que l'étiquette était belle.", 0],
  ["Lève la main si tu as déjà acheté une bouteille juste parce que l'étiquette était belle.", 0],
  ["Tu as déjà confondu deux spiritueux au goût sans t'en rendre compte.", 1],
  ["Lève la main si tu as déjà confondu deux spiritueux au goût sans t'en rendre compte.", 1],
  ["Tu penses qu'un vin ou un rhum vieux est automatiquement meilleur qu'un jeune.", 2],
  ["Lève la main si tu penses qu'un vin ou un rhum vieux est automatiquement meilleur qu'un jeune.", 2],
  ["Tu as une bouteille qui prend la poussière chez toi depuis plus d'un an.", 3],
  ["Lève la main si tu as une bouteille qui prend la poussière chez toi depuis plus d'un an.", 3],
  ["Tu as déjà fait, ou voulu faire, un rhum arrangé toi-même.", 4],
  ["Lève la main si tu as déjà fait, ou voulu faire, un rhum arrangé toi-même.", 4],
  ["Tu commandes presque toujours la même chose au bar.", 5],
  ["Lève la main si tu commandes presque toujours la même chose au bar.", 5],
  ["Tu as déjà offert une bouteille sans vraiment savoir ce qu'il y avait dedans.", 6],
  ["Lève la main si tu as déjà offert une bouteille sans vraiment savoir ce qu'il y avait dedans.", 6],
  ["Tu crois que la couleur d'un spiritueux en dit long sur sa qualité.", 7],
  ["Lève la main si tu crois que la couleur d'un spiritueux en dit long sur sa qualité.", 7],
  ["Tu as déjà fini un verre que tu n'aimais pas, juste pour ne pas gâcher.", 8],
  ["Lève la main si tu as déjà fini un verre que tu n'aimais pas, juste pour ne pas gâcher.", 8],
  ["Tu es du genre à sentir une bouteille avant même de la goûter.", 9],
  ["Lève la main si tu es du genre à sentir une bouteille avant même de la goûter.", 9],
  ["Tu as déjà fait semblant de sentir des arômes que tu ne sentais pas du tout.", 10],
  ["Lève la main si tu as déjà fait semblant de sentir des arômes que tu ne sentais pas du tout.", 10],
  ["Tu as déjà choisi un vin au restaurant uniquement d'après son prix.", 11],
  ["Lève la main si tu as déjà choisi un vin au restaurant uniquement d'après son prix.", 11],
  ["Tu penses qu'un glaçon gâche forcément un bon spiritueux.", 12],
  ["Lève la main si tu penses qu'un glaçon gâche forcément un bon spiritueux.", 12],
  ["Tu gardes une bouteille « pour une grande occasion » qui n'est jamais arrivée.", 13],
  ["Lève la main si tu gardes une bouteille « pour une grande occasion » qui n'est jamais arrivée.", 13],
  ["Tu as déjà goûté un spiritueux dont tu ne saurais même pas prononcer le nom.", 14],
  ["Lève la main si tu as déjà goûté un spiritueux dont tu ne saurais même pas prononcer le nom.", 14],
  ["Tu as déjà ramené une bouteille de voyage qui n'avait plus le même goût à la maison.", 15],
  ["Lève la main si tu as déjà ramené une bouteille de voyage qui n'avait plus le même goût à la maison.", 15],
  ["Tu sais faire la différence entre un rhum agricole et un rhum de mélasse.", 16],
  ["Lève la main si tu sais faire la différence entre un rhum agricole et un rhum de mélasse.", 16],
  ["Tu as déjà dit « il est très rond en bouche » sans trop savoir ce que ça voulait dire.", 17],
  ["Lève la main si tu as déjà dit « il est très rond en bouche » sans trop savoir ce que ça voulait dire.", 17],
  ["Tu as déjà mélangé un très bon spiritueux avec du soda.", 18],
  ["Lève la main si tu as déjà mélangé un très bon spiritueux avec du soda.", 18],
  ["Tu as déjà visité une distillerie, une cave ou un domaine.", 19],
  ["Lève la main si tu as déjà visité une distillerie, une cave ou un domaine.", 19],
  ["Tu as un verre préféré pour déguster.", 20],
  ["Lève la main si tu as un verre préféré pour déguster.", 20],
  ["Tu as déjà été la seule personne à table à aimer une bouteille.", 21],
  ["Lève la main si tu as déjà été la seule personne à table à aimer une bouteille.", 21],
  ["Tu as déjà noté un vin ou un spiritueux sur une appli.", 22],
  ["Lève la main si tu as déjà noté un vin ou un spiritueux sur une appli.", 22],
  ["Tu penses que le champagne, c'est seulement pour les fêtes.", 23],
  ["Lève la main si tu penses que le champagne, c'est seulement pour les fêtes.", 23],
  ["Tu as déjà trinqué sans regarder les autres dans les yeux.", 24],
  ["Lève la main si tu as déjà trinqué sans regarder les autres dans les yeux.", 24],
]);

// Profils de dégustateur : résultat personnel du Body Count (tiers du classement)
const PROFILES = [
  { key: 'epicurieux', name: 'Les Épicurieux', color: 'var(--profile-1)' },
  { key: 'amateurs', name: 'Les Amateurs Éclairés', color: 'var(--profile-2)' },
  { key: 'sages', name: 'Les Sages du Bar', color: 'var(--profile-3)' },
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
const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
let state;
const images = new Map(); // id -> { mime, buf }  (paris improvisés)

/* Préparation de soirée : survit à « Nouvelle session ».
   Sauvegardée sur disque (si possible) et dans le navigateur de l'animateur. */
function defaultConfig() {
  return {
    updatedAt: 0,
    event: {
      title: "Autour d'un Verre",
      date: todayStamp(),
      theme: 'whisky',
      subtitle: 'De whisky avec Aikan',
      place: "Au CIS, Étang Z'Abricot",
      orga: 'So Greyg & le CIS Martinique',
    },
    bottles: [], // { id, name, image: dataUrl|null, rev }
    statements: DEFAULT_STATEMENTS.slice(),
    bodyCount: 0, // 0 = automatique (1 affirmation par invité)
    b1: { bottleId: null, forbidden: DEFAULT_FORBIDDEN.slice() },
    b2: { a: null, b: null },
    paris: [], // { id, bottleId, question, options[3], correct: 0|1|2|null }
  };
}

function freshState(config) {
  return {
    sessionId: crypto.randomUUID(),
    phase: 'LOBBY',
    config: config || defaultConfig(),
    players: new Map(),
    joinCounter: 0,
    body: { started: false, index: 0, readers: [], list: [] },
    ranking: null, // [{id, score, rank}]
    b2: { locked: false },
    b3: { rounds: [], currentId: null },
  };
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
function loadConfigFromDisk() {
  try { return sanitizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')), true); } catch (e) { return null; }
}
let saveTimer = null;
function saveConfigToDisk() {
  cloudSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(state.config)); } catch (e) { /* disque indisponible */ }
  }, 300);
}
function touchConfig() { state.config.updatedAt = Date.now(); saveConfigToDisk(); }

/* ------------------------------------------------------------------ */
/* Sauvegarde permanente : gist secret GitHub (si GITHUB_TOKEN défini)  */
/* ------------------------------------------------------------------ */
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_API = process.env.GITHUB_API || 'https://api.github.com';
const GIST_DESC = "Autour d'un Verre · préparation de soirée (sauvegarde automatique, ne pas supprimer)";
const GIST_FILE = 'preparation-autour-dun-verre.json';
const cloud = { enabled: !!GH_TOKEN, ok: null, savedAt: null, loadedAt: null, error: null, gistId: process.env.GIST_ID || null };

async function gh(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : GH_API + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + GH_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'autour-dun-verre',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('GitHub ' + res.status + (res.status === 401 ? ' (clé GITHUB_TOKEN invalide ou expirée)' : res.status === 403 || res.status === 404 ? ' (la clé doit avoir le droit « gist »)' : ''));
  return res.status === 204 ? null : res.json();
}

async function findGistId() {
  if (cloud.gistId) return cloud.gistId;
  for (let page = 1; page <= 5; page++) {
    const list = await gh('GET', '/gists?per_page=100&page=' + page);
    const hit = list.find((g) => g.description === GIST_DESC || (g.files && g.files[GIST_FILE]));
    if (hit) return (cloud.gistId = hit.id);
    if (list.length < 100) break;
  }
  return null;
}

async function cloudLoad() {
  if (!cloud.enabled) return;
  try {
    const id = await findGistId();
    if (!id) { cloud.ok = true; cloud.error = null; return; } // rien encore sauvegardé
    const g = await gh('GET', '/gists/' + id);
    const f = g.files && g.files[GIST_FILE];
    if (!f) { cloud.ok = true; return; }
    let text = f.content;
    if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { headers: { Authorization: 'Bearer ' + GH_TOKEN } })).text();
    const cfg = sanitizeConfig(JSON.parse(text), true);
    if (cfg.updatedAt > (state.config.updatedAt || 0)) {
      state.config = cfg;
      saveConfigToDisk();
      broadcast();
    }
    cloud.ok = true; cloud.error = null; cloud.loadedAt = Date.now();
    console.log('[sauvegarde] préparation rechargée depuis GitHub');
  } catch (e) {
    cloud.ok = false; cloud.error = e.message;
    console.error('[sauvegarde] chargement impossible :', e.message);
  }
}

let cloudTimer = null;
let cloudBusy = false;
let cloudAgain = false;
function cloudSave() {
  if (!cloud.enabled) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(async () => {
    if (cloudBusy) { cloudAgain = true; return; }
    cloudBusy = true;
    const snapshotAt = state.config.updatedAt;
    try {
      const files = { [GIST_FILE]: { content: JSON.stringify(state.config) } };
      const id = await findGistId();
      if (id) await gh('PATCH', '/gists/' + id, { description: GIST_DESC, files });
      else cloud.gistId = (await gh('POST', '/gists', { description: GIST_DESC, public: false, files })).id;
      cloud.ok = true; cloud.error = null; cloud.savedAt = Date.now(); cloud.savedVersion = snapshotAt;
    } catch (e) {
      cloud.ok = false; cloud.error = e.message;
      console.error('[sauvegarde] envoi impossible :', e.message);
    }
    cloudBusy = false;
    broadcast();
    if (cloudAgain) { cloudAgain = false; cloudSave(); }
  }, 1200);
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const shortId = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 40);

/* Migration : les anciennes affirmations par défaut sont remplacées par leur version « Je n'ai jamais ». */
function phoneWording(t) {
  const k = String(t || '').trim();
  return LEGACY_STATEMENTS.has(k) ? DEFAULT_STATEMENTS[LEGACY_STATEMENTS.get(k)] : k;
}

function sanitizeConfig(c, keepTime) {
  const d = defaultConfig();
  if (!c || typeof c !== 'object') return d;
  const ev = c.event || {};
  const out = {
    updatedAt: keepTime && Number(c.updatedAt) > 0 ? Number(c.updatedAt) : Date.now(),
    event: {
      title: clean(ev.title, 60) || d.event.title,
      date: clean(ev.date, 20) || d.event.date,
      theme: ev.theme === 'champagne' ? 'champagne' : 'whisky',
      subtitle: clean(ev.subtitle, 60),
      place: clean(ev.place, 80),
      orga: clean(ev.orga, 80),
    },
    bottles: [],
    statements: [],
    bodyCount: Math.max(0, Math.min(60, parseInt(c.bodyCount, 10) || 0)),
    b1: { bottleId: null, forbidden: d.b1.forbidden },
    b2: { a: null, b: null },
    paris: [],
  };
  const seen = new Set();
  (Array.isArray(c.bottles) ? c.bottles : []).slice(0, 20).forEach((b) => {
    const id = shortId(b && b.id) || crypto.randomUUID();
    if (seen.has(id)) return;
    seen.add(id);
    const img = typeof b.image === 'string' && DATA_URL_RE.test(b.image) && b.image.length < 3.5e6 ? b.image : null;
    out.bottles.push({ id, name: clean(b.name, 60) || 'Bouteille', image: img, rev: crypto.createHash('md5').update(img || '').digest('hex').slice(0, 8) });
  });
  const has = (id) => out.bottles.some((b) => b.id === id);
  const st = (Array.isArray(c.statements) ? c.statements : []).map((x) => phoneWording(clean(x, 240))).filter(Boolean).slice(0, 60);
  out.statements = st.length ? st : d.statements;
  if (c.b1) {
    out.b1.bottleId = has(c.b1.bottleId) ? c.b1.bottleId : null;
    const words = (Array.isArray(c.b1.forbidden) ? c.b1.forbidden : []).map((w) => clean(w, 30)).filter(Boolean);
    out.b1.forbidden = [...new Set(words)].slice(0, 30);
  }
  if (c.b2) {
    out.b2.a = has(c.b2.a) ? c.b2.a : null;
    out.b2.b = has(c.b2.b) ? c.b2.b : null;
  }
  (Array.isArray(c.paris) ? c.paris : []).slice(0, 20).forEach((p) => {
    const opts = (Array.isArray(p && p.options) ? p.options : []).slice(0, 3).map((o) => clean(o, 40));
    while (opts.length < 3) opts.push('');
    out.paris.push({
      id: shortId(p.id) || crypto.randomUUID(),
      bottleId: has(p.bottleId) ? p.bottleId : null,
      question: clean(p.question, 120) || DEFAULT_QUESTION,
      options: opts.map((o, i) => o || DEFAULT_OPTIONS[i]),
      correct: [0, 1, 2].includes(p.correct) ? p.correct : null,
    });
  });
  return out;
}

state = freshState(loadConfigFromDisk() || undefined);

const bottleById = (id) => state.config.bottles.find((b) => b.id === id) || null;
const bottleImg = (b) => (b && b.image ? '/bottle/' + b.id + '?v=' + b.rev : null);
const bottlePublic = (b) => (b ? { id: b.id, name: b.name, image: bottleImg(b) } : null);
const b1Bottle = () => bottleById(state.config.b1.bottleId);
function b2Sides() {
  const A = bottleById(state.config.b2.a);
  const B = bottleById(state.config.b2.b);
  return [
    { label: A ? A.name : 'Bouteille 1', image: bottleImg(A) },
    { label: B ? B.name : 'Bouteille 2', image: bottleImg(B) },
  ];
}
const b2Labels = () => b2Sides().map((x) => x.label);

function newPlayer(id, pseudo, word, isBot = false) {
  return {
    id, pseudo, word, isBot,
    order: ++state.joinCounter,
    joinedAt: Date.now(),
    body: {}, // index -> true/false
    profile: null,
    note1: null, // { text, ts }
    vote2: null, // 0 | 1
    closing: null, // { text, ts }
  };
}

const playersList = () => [...state.players.values()].sort((a, b) => a.order - b.order);
const scoreOf = (p) => Object.values(p.body).filter((v) => v === true).length;
const profileObj = (key) => PROFILES.find((t) => t.key === key) || null;

function connectedIds() {
  const set = new Set();
  for (const s of io.of('/').sockets.values()) if (s.data.pid) set.add(s.data.pid);
  return set;
}

/* ------------------------------------------------------------------ */
/* Logique de jeu                                                      */
/* ------------------------------------------------------------------ */
function startBody() {
  // Chaque invité lit une seule fois : autant d'affirmations que d'invités (sauf réglage manuel).
  // S'il y a plus d'affirmations que d'invités, les dernières sont lues par l'animateur.
  const list = playersList();
  const stock = state.config.statements;
  const n = Math.max(1, Math.min(stock.length, state.config.bodyCount || list.length || 1));
  state.body.list = stock.slice(0, n);
  state.body.readers = state.body.list.map((_, i) => (i < list.length ? list[i].id : null));
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
    const tier = idx < sizes[0] ? 0 : idx < sizes[0] + sizes[1] ? 1 : 2;
    state.players.get(r.id).profile = PROFILES[tier].key;
  });
  state.ranking = list.map(({ id, score, rank }) => ({ id, score, rank }));
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
    event: { ...state.config.event },
    playerCount: list.length,
    me: p
      ? { id: p.id, pseudo: p.pseudo, word: p.word, profile: profileObj(p.profile) }
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
        total: state.body.list.length,
        text: state.body.list[i],
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
        // Résultat strictement personnel : aucune information sur les autres invités
        v.ranking = { score: scoreOf(p), of: state.body.list.length, rank: rankOf(p.id), total: state.ranking.length };
      } else v.ranking = null;
      break;

    case 'BOUTEILLE_1':
      v.b1 = {
        bottle: b1Bottle() ? b1Bottle().name : '',
        image: bottleImg(b1Bottle()),
        forbidden: state.config.b1.forbidden.slice(),
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
        labels: b2Labels(),
        images: b2Sides().map((x) => x.image),
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
          .map((x) => ({ pseudo: x.pseudo, text: x.closing.text })),
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
      label: b2Labels()[p.vote2],
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
    profile: profileObj(p.profile),
    score: state.body.started ? scoreOf(p) : null,
    of: state.body.list.length,
    rank: rankOf(p.id),
    total: state.ranking ? state.ranking.length : null,
    note1: p.note1 ? p.note1.text : null,
    bottle1: b1Bottle() ? b1Bottle().name : '',
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
    event: { ...state.config.event },
    profiles: PROFILES,
    players: list.map((p) => ({
      id: p.id, pseudo: p.pseudo, word: p.word, isBot: p.isBot, online: p.isBot || online.has(p.id),
      score: scoreOf(p), profile: p.profile, rank: rankOf(p.id),
    })),
    body: {
      started: state.body.started,
      index: i,
      total: state.body.list.length,
      text: state.body.list[i],
      readerPseudo: state.body.readers[i] ? (byId(state.body.readers[i]) || {}).pseudo || '—' : 'Animateur',
      readers: state.body.readers.map((id) => (id && byId(id) ? byId(id).pseudo : 'Animateur')),
      answers: list.map((p) => ({ pseudo: p.pseudo, answer: p.body[i] === undefined ? null : p.body[i] })),
    },
    ranking: state.ranking
      ? state.ranking.filter((r) => byId(r.id)).map((r) => ({ ...r, pseudo: byId(r.id).pseudo, word: byId(r.id).word, profile: byId(r.id).profile, score: scoreOf(byId(r.id)) }))
      : null,
    config: {
      updatedAt: state.config.updatedAt,
      cloud: { enabled: cloud.enabled, ok: cloud.ok, error: cloud.error, savedAt: cloud.savedAt, synced: cloud.enabled && cloud.ok && cloud.savedVersion === state.config.updatedAt },
      bottles: state.config.bottles.map(bottlePublic),
      statementsCount: state.config.statements.length,
      bodyCount: state.config.bodyCount,
      b1: { ...state.config.b1 },
      b2: { ...state.config.b2 },
      paris: state.config.paris.map((p) => ({ ...p, played: state.b3.rounds.some((r) => r.planId === p.id) })),
    },
    b1: {
      bottle: b1Bottle() ? b1Bottle().name : '',
      bottleId: state.config.b1.bottleId,
      forbidden: state.config.b1.forbidden.slice(),
      wall: list.filter((p) => p.note1).sort((a, b) => b.note1.ts - a.note1.ts).map((p) => ({ pseudo: p.pseudo, text: p.note1.text })),
    },
    b2: {
      labels: b2Labels(),
      a: state.config.b2.a,
      b: state.config.b2.b,
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
          id: r.id, number: idx + 1, bottle: r.bottle, image: r.image, question: r.question, options: r.options, preset: r.preset,
          locked: r.locked, revealed: r.revealed, correct: r.correct, counts, pct: percents(counts),
          names: [0, 1, 2].map((o) => list.filter((p) => r.answers[p.id] === o).map((p) => p.pseudo)),
        };
      }),
    },
    closing: list.filter((p) => p.closing).sort((a, b) => a.closing.ts - b.closing.ts).map((p) => ({ pseudo: p.pseudo, text: p.closing.text })),
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
    const bad = findForbidden(text, state.config.b1.forbidden);
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

  socket.on('host:action', async (msg, ack) => {
    if (!socket.data.isHost) return fail(ack, 'Non autorisé.');
    try {
      const res = await hostAction(msg || {});
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

/* Télécharge une image depuis un lien (photo de bouteille), réservé à l'animateur. */
async function fetchImageAsDataUrl(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch (e) { return { error: 'Lien invalide.' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'Lien invalide.' };
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname)) return { error: 'Lien non autorisé.' };
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (autour-dun-verre)' }, redirect: 'follow' });
    if (!res.ok) return { error: 'Image introuvable (' + res.status + ').' };
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return { error: 'Ce lien ne mène pas à une image (jpg, png, webp).' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6e6) return { error: 'Image trop lourde.' };
    return { dataUrl: 'data:' + type + ';base64,' + buf.toString('base64') };
  } catch (e) {
    return { error: 'Téléchargement impossible.' };
  }
}

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
      if (n < 0 || n >= state.body.list.length) return;
      state.body.index = n;
      return;
    }
    case 'reassignReaders':
      startBody();
      return;
    case 'saveStatements': {
      const st = (Array.isArray(a.statements) ? a.statements : []).map((x) => phoneWording(clean(x, 240))).filter(Boolean).slice(0, 60);
      if (st.length) state.config.statements = st;
      state.config.bodyCount = Math.max(0, Math.min(60, parseInt(a.bodyCount, 10) || 0));
      touchConfig();
      return;
    }
    case 'showRanking':
      computeRanking();
      state.phase = 'CLASSEMENT';
      return;
    case 'getConfigFull':
      return { config: state.config };
    case 'fetchImage':
      return fetchImageAsDataUrl(a.url);
    case 'setConfig': {
      // keepTime : restauration depuis le navigateur (garde l'horodatage d'origine)
      state.config = sanitizeConfig(a.config, !!a.keepTime);
      saveConfigToDisk();
      return { updatedAt: state.config.updatedAt };
    }
    case 'configEvent':
      touchConfig();
      state.config.event.title = clean(a.title, 60) || "Autour d'un Verre";
      state.config.event.date = clean(a.date, 20) || todayStamp();
      state.config.event.theme = a.theme === 'champagne' ? 'champagne' : 'whisky';
      state.config.event.subtitle = clean(a.subtitle, 60);
      state.config.event.place = clean(a.place, 80);
      state.config.event.orga = clean(a.orga, 80);
      return;
    case 'configB1': {
      state.config.b1.bottleId = bottleById(a.bottleId) ? a.bottleId : null;
      const words = (Array.isArray(a.forbidden) ? a.forbidden : []).map((w) => clean(w, 30)).filter(Boolean);
      state.config.b1.forbidden = [...new Set(words)].slice(0, 30);
      touchConfig();
      return;
    }
    case 'configB2':
      state.config.b2.a = bottleById(a.a) ? a.a : null;
      state.config.b2.b = bottleById(a.b) ? a.b : null;
      touchConfig();
      return;
    case 'b2Lock':
      state.b2.locked = !!a.locked;
      return;
    case 'b2Reset':
      for (const p of state.players.values()) p.vote2 = null;
      state.b2.locked = false;
      return;
    case 'b3Launch': {
      if (a.planId) {
        const plan = state.config.paris.find((p) => p.id === a.planId);
        if (!plan) return { error: 'Pari préparé introuvable.' };
        const bt = bottleById(plan.bottleId);
        a = { bottle: bt ? bt.name : '', imageUrl: bottleImg(bt), question: plan.question, options: plan.options, preset: plan.correct, planId: plan.id };
      }
      const opts = (Array.isArray(a.options) ? a.options : []).map((o) => clean(o, 40));
      if (opts.length !== 3 || opts.some((o) => !o)) return { error: 'Il faut exactement 3 options.' };
      const r = {
        id: crypto.randomUUID(),
        bottle: clean(a.bottle, 60),
        image: a.imageUrl || (typeof a.image === 'string' && /^\/img\/[\w-]+$/.test(a.image) ? a.image : null),
        planId: a.planId || null,
        preset: [0, 1, 2].includes(a.preset) ? a.preset : null,
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
      state = freshState(state.config); // la préparation est conservée
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
app.get('/bottle/:id', (req, res) => {
  const b = bottleById(req.params.id);
  const m = b && b.image ? DATA_URL_RE.exec(b.image) : null;
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]).set('Cache-Control', 'public, max-age=604800').send(Buffer.from(m[2], 'base64'));
});
app.get('/qr.svg', async (req, res) => {
  const base = process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  const svg = await QRCode.toString(base + '/', { type: 'svg', margin: 1, color: { dark: '#120604', light: '#FDFCF1' } });
  res.set('Content-Type', 'image/svg+xml').send(svg);
});
app.get('/:file', (req, res, next) => {
  if (!STATIC_FILES.includes(req.params.file)) return next();
  res.set('Cache-Control', 'no-cache').sendFile(path.join(PUB, req.params.file));
});

cloudLoad();
server.listen(PORT, () => {
  console.log(`Autour d'un Verre — http://localhost:${PORT}  (animateur : /host)`);
});
