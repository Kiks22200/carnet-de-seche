// Sauvegarde en ligne dans un gist secret du compte GitHub de l'utilisateur, chiffrée sur le téléphone (AES-GCM, clé dérivée du code de sauvegarde)
const KEY = "carnet-seche-cloud";
const DESC = "Carnet de sèche — sauvegarde chiffrée";
const FILE = "carnet-de-seche.enc.json";
const GH = "https://api.github.com";
const enc = new TextEncoder(), dec = new TextDecoder();

export function cloudCfg() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
export function setCloudCfg(c) { try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); } catch (e) {} }

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encrypt(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ app: "carnet-de-seche", v: 1, at: new Date().toISOString(), salt: b64(salt), iv: b64(iv), data: b64(ct) });
}
export async function decrypt(text, pass) {
  const o = JSON.parse(text);
  const k = await deriveKey(pass, unb64(o.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, k, unb64(o.data));
  return JSON.parse(dec.decode(pt));
}

async function gh(path, token, opts = {}) {
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (opts.body) headers["Content-Type"] = "application/json";
  const r = await fetch(GH + path, { ...opts, headers });
  if (!r.ok) { const e = new Error("GitHub " + r.status); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
}
async function findGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, token);
    const g = list.find(x => x.description === DESC && x.files && x.files[FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  return null;
}
// Refuse d'écraser une sauvegarde plus récente faite depuis un autre appareil (sauf envoi forcé)
export async function pushBackup(cfg, obj, opts = {}) {
  if (cfg.gistId && cfg.last && !opts.force) {
    try {
      const g = await gh(`/gists/${cfg.gistId}`, cfg.token), f = g.files && g.files[FILE];
      const at = f && !f.truncated ? JSON.parse(f.content).at : null;
      if (at && new Date(at) - new Date(cfg.last) > 5000) { const e = new Error("conflict"); e.status = "conflict"; throw e; }
    } catch (e) { if (e.status === "conflict" || e.status === 401) throw e; }
  }
  const content = await encrypt(obj, cfg.pass);
  if (cfg.gistId) {
    try { await gh(`/gists/${cfg.gistId}`, cfg.token, { method: "PATCH", body: JSON.stringify({ description: DESC, files: { [FILE]: { content } } }) }); return cfg.gistId; }
    catch (e) { if (e.status !== 404) throw e; }
  }
  const existing = await findGist(cfg.token);
  if (existing) { await gh(`/gists/${existing}`, cfg.token, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content } } }) }); return existing; }
  const g = await gh("/gists", cfg.token, { method: "POST", body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content } } }) });
  return g.id;
}
export async function findBackup(cfg) {
  const id = await findGist(cfg.token);
  if (!id) return null;
  const g = await gh(`/gists/${id}`, cfg.token), f = g.files[FILE];
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return { id, at: JSON.parse(text).at };
}
export async function pullBackup(cfg) {
  const id = cfg.gistId || await findGist(cfg.token);
  if (!id) return null;
  const g = await gh(`/gists/${id}`, cfg.token);
  const f = g.files[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return { id, at: JSON.parse(text).at, data: await decrypt(text, cfg.pass) };
}
export function cloudError(e) {
  if (e && e.status === "conflict") return "Une sauvegarde plus récente a été faite depuis un autre appareil (Safari ou un autre téléphone).";
  if (e && e.status === 401) return "Ton jeton GitHub est refusé ou expiré. Crée-en un nouveau.";
  if (e && (e.status === 403 || e.status === 404)) return "Ce jeton n'a pas la permission « Gists : lecture et écriture ».";
  if (e && e.name === "OperationError") return "Code de sauvegarde incorrect.";
  if (e instanceof TypeError) return "Pas de connexion pour l'instant.";
  return "La sauvegarde en ligne n'a pas abouti.";
}
