// Appels à l'API Claude depuis le téléphone, avec la clé de l'utilisateur gardée sur l'appareil
import Anthropic from "../vendor/anthropic.mjs";

const KEY = "carnet-seche-key";
const MODEL = "carnet-seche-model";
export const MODELS = [
  { id: "claude-opus-5-5", n: "Claude Opus 5.5", d: "Le plus précis, environ 2 centimes par analyse" },
  { id: "claude-haiku-5-5", n: "Claude Haiku 5.5", d: "Économique, environ 0,1 centime par analyse" }
];

export function getKey() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
export function setKey(k) { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch (e) {} }
export function getModel() { try { return localStorage.getItem(MODEL) || MODELS[0].id; } catch (e) { return MODELS[0].id; } }
export function setModel(m) { try { localStorage.setItem(MODEL, m); } catch (e) {} }
export function hasKey() { return !!getKey(); }

function client() {
  return new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });
}

// Les modèles Opus ont un repli serveur en cas de refus ; Haiku n'en a pas
function baseParams(model) {
  return model.startsWith("claude-opus") ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}

export function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Ta clé API est refusée. Vérifie-la dans Réglages.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Ta clé n'a pas accès à ce modèle. Essaie l'autre modèle dans Réglages.";
  if (e instanceof Anthropic.RateLimitError) return "Trop de demandes d'un coup. Réessaie dans une minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Pas de connexion. Réessaie quand tu as du réseau.";
  if (e instanceof Anthropic.APIError) return "Claude n'a pas pu répondre (" + (e.status || "erreur") + "). Réessaie.";
  return e && e.message ? e.message : "L'analyse n'a pas abouti.";
}

export async function askJSON({ system, content, schema, maxTokens = 8000 }) {
  const model = getModel();
  const res = await client().beta.messages.create({
    model, max_tokens: maxTokens, system,
    messages: [{ role: "user", content }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    ...baseParams(model)
  });
  if (res.stop_reason === "refusal") throw new Error("Claude a refusé cette demande.");
  if (res.stop_reason === "max_tokens") throw new Error("Réponse trop longue, essaie en plusieurs fois.");
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(text);
}

export async function askText({ system, prompt, onText, maxTokens = 4000 }) {
  const model = getModel();
  const stream = client().beta.messages.stream({
    model, max_tokens: maxTokens, system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: "low" },
    ...baseParams(model)
  });
  let acc = "";
  stream.on("text", t => { acc += t; if (onText) onText(acc); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Claude a refusé cette demande.");
  return msg.content.filter(b => b.type === "text").map(b => b.text).join("");
}

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
