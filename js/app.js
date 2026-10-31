import { ANATOMY } from "./anatomy.js";
import { cloudCfg, setCloudCfg, pushBackup, pullBackup, findBackup, cloudError } from "./cloud.js";
import { MODELS, getKey, setKey, getModel, setModel, hasKey, askJSON, askText, explain, blobToBase64 } from "./ai.js";

/* ---------- Dates & formats ---------- */
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const JOURS_L = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const today = () => iso(new Date());
const mondayOf = s => { let d = s; while (parseD(d).getDay() !== 1) d = addDays(d, -1); return d; };
const fmtD = (s, withDay) => { const d = parseD(s); return (withDay ? JOURS[d.getDay()] + " " : "") + d.getDate() + " " + MOIS[d.getMonth()]; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const f1 = v => (Math.round(v * 10) / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = v => Math.round(v).toLocaleString("fr-FR");
const fkg = v => (Math.round(v * 100) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const round50 = v => Math.round(v / 50) * 50;
const round5 = v => Math.round(v / 5) * 5;
const KCAL_PER_KG = 7700;

/* ---------- Aliments (Ciqual ANSES, USDA, emballages ; aliments cuits) ---------- */
const CATS = [
  ["fec", "Féculents", "🍝"], ["pro", "Viandes & poissons", "🍗"], ["leg", "Légumes", "🥦"], ["fru", "Fruits", "🍑"],
  ["dej", "Petit-déj & laitages", "🥣"], ["sna", "Sucré & grignotage", "🍪"], ["ext", "Sauces & extras", "🧈"], ["boi", "Boissons", "🥤"], ["plat", "Plats tout faits", "🍕"]
];
// u:"g" → portions en grammes (kc / pr pour 100 g), p = [petite, normale, grosse] ; u:"u" → à l'unité ; ck : la cuisson au beurre s'ajoute ; kw : mots reconnus à la voix sans Claude
const FOODS = [
  { k: "pates_cuit", c: "fec", e: "🍝", n: "Pâtes (poids cuit)", u: "g", kc: 150, pr: 5.5, p: [200, 300, 450], kw: ["pates", "spaghetti", "coquillettes", "penne", "tagliatelles"] },
  { k: "pates_cru", c: "fec", e: "🍝", n: "Pâtes (poids cru)", u: "g", kc: 355, pr: 12.5, p: [80, 110, 160] },
  { k: "riz", c: "fec", e: "🍚", n: "Riz (poids cuit)", u: "g", kc: 130, pr: 2.7, p: [150, 250, 350], kw: ["riz"] },
  { k: "pdt_air", c: "fec", e: "🥔", n: "Pommes de terre air fryer", u: "g", kc: 105, pr: 2, p: [150, 250, 350], kw: ["air fryer", "patates", "pommes de terre"] },
  { k: "pdt_creme", c: "fec", e: "🥔", n: "Pommes de terre à la crème / gratin", u: "g", kc: 140, pr: 3, p: [150, 250, 350], kw: ["gratin", "a la creme"] },
  { k: "pdt_eau", c: "fec", e: "🥔", n: "Pommes de terre vapeur / à l'eau", u: "g", kc: 80, pr: 2, p: [150, 250, 350] },
  { k: "puree", c: "fec", e: "🥔", n: "Purée maison", u: "g", kc: 110, pr: 2, p: [150, 250, 350], kw: ["puree"] },
  { k: "frites", c: "fec", e: "🍟", n: "Frites", u: "g", kc: 260, pr: 3.5, p: [100, 150, 250], kw: ["frites"] },
  { k: "semoule", c: "fec", e: "🌾", n: "Semoule (cuite)", u: "g", kc: 112, pr: 3.8, p: [150, 250, 350], kw: ["semoule"] },
  { k: "boulgour", c: "fec", e: "🌾", n: "Boulgour (cuit)", u: "g", kc: 83, pr: 3.1, p: [150, 250, 350], kw: ["boulgour"] },
  { k: "lentilles", c: "fec", e: "🫘", n: "Lentilles (cuites)", u: "g", kc: 116, pr: 9, p: [150, 250, 350], kw: ["lentilles"] },
  { k: "pois_chiches", c: "fec", e: "🫘", n: "Pois chiches (cuits)", u: "g", kc: 164, pr: 8.9, p: [100, 180, 260], kw: ["pois chiches"] },
  { k: "pain", c: "fec", e: "🥖", n: "Pain (baguette)", u: "u", kc: 110, pr: 3.5, un: "morceau (40 g)", kw: ["pain", "baguette"] },

  { k: "boeuf", c: "pro", e: "🥩", n: "Viande rouge cuite (steak, bœuf)", u: "g", kc: 200, pr: 27, p: [100, 150, 220], ck: 1, kw: ["steak", "boeuf", "viande rouge", "entrecote", "bavette"] },
  { k: "hache", c: "pro", e: "🥩", n: "Steak haché 5 %", u: "u", kc: 130, pr: 21, un: "steak (100 g cru)", ck: 1, kw: ["steak hache", "hache"] },
  { k: "poulet", c: "pro", e: "🍗", n: "Poulet (blanc ou cuisse sans peau)", u: "g", kc: 165, pr: 31, p: [100, 150, 220], ck: 1, kw: ["poulet"] },
  { k: "poulet_peau", c: "pro", e: "🍗", n: "Cuisse de poulet avec la peau", u: "g", kc: 230, pr: 24, p: [100, 150, 220], ck: 1 },
  { k: "poisson", c: "pro", e: "🐟", n: "Poisson blanc (cabillaud, colin…)", u: "g", kc: 100, pr: 22, p: [120, 170, 250], ck: 1, kw: ["poisson", "cabillaud", "colin", "merlu", "lieu"] },
  { k: "saumon", c: "pro", e: "🍣", n: "Saumon", u: "g", kc: 210, pr: 22, p: [100, 140, 200], ck: 1, kw: ["saumon"] },
  { k: "porc", c: "pro", e: "🍖", n: "Rôti de porc / filet mignon", u: "g", kc: 170, pr: 28, p: [100, 150, 220], ck: 1, kw: ["roti", "filet mignon", "porc"] },
  { k: "cote_porc", c: "pro", e: "🍖", n: "Côte / échine de porc", u: "g", kc: 240, pr: 25, p: [120, 170, 250], ck: 1, kw: ["echine", "cote de porc"] },
  { k: "merguez", c: "pro", e: "🌭", n: "Merguez", u: "u", kc: 160, pr: 9, un: "merguez", kw: ["merguez"] },
  { k: "saucisse", c: "pro", e: "🌭", n: "Saucisse de Toulouse", u: "u", kc: 270, pr: 14, un: "saucisse", kw: ["saucisse"] },
  { k: "oeuf", c: "pro", e: "🥚", n: "Œuf", u: "u", kc: 75, pr: 6.5, un: "œuf", ck: 1, kw: ["oeuf", "oeufs", "omelette"] },
  { k: "jambon", c: "pro", e: "🥓", n: "Jambon blanc", u: "u", kc: 50, pr: 8.5, un: "tranche", kw: ["jambon"] },
  { k: "thon", c: "pro", e: "🐟", n: "Thon au naturel", u: "g", kc: 115, pr: 26, p: [70, 100, 140], kw: ["thon"] },

  { k: "haricots", c: "leg", e: "🫛", n: "Haricots verts", u: "g", kc: 30, pr: 2, p: [100, 200, 300], ck: 1, kw: ["haricots"] },
  { k: "butternut", c: "leg", e: "🎃", n: "Butternut / courge", u: "g", kc: 45, pr: 1, p: [100, 200, 300], ck: 1, kw: ["butternut", "courge", "potiron"] },
  { k: "legumes", c: "leg", e: "🥕", n: "Autres légumes (carottes, courgettes, brocoli…)", u: "g", kc: 35, pr: 2, p: [100, 200, 300], ck: 1, kw: ["legumes", "carottes", "courgettes", "brocoli"] },
  { k: "salade", c: "leg", e: "🥗", n: "Salade / crudités sans sauce", u: "g", kc: 20, pr: 1, p: [50, 100, 150], kw: ["salade", "crudites"] },

  { k: "banane", c: "fru", e: "🍌", n: "Banane", u: "u", kc: 105, pr: 1.3, un: "banane", kw: ["banane"] },
  { k: "pomme", c: "fru", e: "🍎", n: "Pomme", u: "u", kc: 80, pr: 0.4, un: "pomme", kw: ["pomme"] },
  { k: "peche", c: "fru", e: "🍑", n: "Pêche / nectarine", u: "u", kc: 50, pr: 1, un: "fruit", kw: ["peche", "nectarine"] },
  { k: "clementine", c: "fru", e: "🍊", n: "Clémentine / mandarine", u: "u", kc: 35, pr: 0.6, un: "fruit", kw: ["clementine", "mandarine"] },
  { k: "orange", c: "fru", e: "🍊", n: "Orange", u: "u", kc: 70, pr: 1.2, un: "orange", kw: ["orange"] },
  { k: "raisin", c: "fru", e: "🍇", n: "Raisin", u: "u", kc: 70, pr: 0.7, un: "petite grappe (100 g)", kw: ["raisin"] },
  { k: "compote", c: "fru", e: "🍏", n: "Compote", u: "u", kc: 70, pr: 0.3, un: "pot ou gourde", kw: ["compote"] },

  { k: "cafe", c: "dej", e: "☕", n: "Café / thé sans sucre", u: "u", kc: 2, pr: 0, un: "tasse", kw: ["cafe", "the"] },
  { k: "cafe_lait", c: "dej", e: "☕", n: "Café au lait sucré", u: "u", kc: 70, pr: 3, un: "tasse", kw: ["cafe au lait"] },
  { k: "cereales", c: "dej", e: "🥣", n: "Céréales + lait", u: "u", kc: 260, pr: 9, un: "bol", kw: ["cereales"] },
  { k: "tartine", c: "dej", e: "🍞", n: "Tartine beurre + confiture", u: "u", kc: 210, pr: 3.5, un: "tartine", kw: ["tartine"] },
  { k: "pain_mie", c: "dej", e: "🍞", n: "Pain de mie", u: "u", kc: 70, pr: 2.5, un: "tranche", kw: ["pain de mie"] },
  { k: "skyr", c: "dej", e: "🥛", n: "Skyr nature", u: "u", kc: 90, pr: 15, un: "pot (150 g)", kw: ["skyr"] },
  { k: "fromage_blanc", c: "dej", e: "🥛", n: "Fromage blanc 0 %", u: "u", kc: 70, pr: 11, un: "pot (150 g)", kw: ["fromage blanc"] },
  { k: "yaourt", c: "dej", e: "🥛", n: "Yaourt nature", u: "u", kc: 60, pr: 4.5, un: "pot", kw: ["yaourt"] },
  { k: "yaourt_s", c: "dej", e: "🥛", n: "Yaourt sucré / aux fruits", u: "u", kc: 110, pr: 4, un: "pot" },
  { k: "lait", c: "dej", e: "🥛", n: "Lait demi-écrémé", u: "u", kc: 115, pr: 8, un: "verre (25 cl)", kw: ["verre de lait"] },
  { k: "croissant", c: "dej", e: "🥐", n: "Croissant", u: "u", kc: 230, pr: 4.5, un: "croissant", kw: ["croissant"] },
  { k: "pain_choc", c: "dej", e: "🥐", n: "Pain au chocolat", u: "u", kc: 280, pr: 5, un: "pièce", kw: ["pain au chocolat", "chocolatine"] },
  { k: "nutella", c: "dej", e: "🍫", n: "Pâte à tartiner", u: "u", kc: 80, pr: 1, un: "c. à soupe (15 g)", kw: ["nutella", "pate a tartiner"] },

  { k: "madeleine", c: "sna", e: "🧁", n: "Madeleine", u: "u", kc: 110, pr: 1.5, un: "madeleine (25 g)", kw: ["madeleine"] },
  { k: "kinder_joy", c: "sna", e: "🍫", n: "Kinder Joy / Kinder Surprise", u: "u", kc: 110, pr: 1.6, un: "œuf en chocolat (20 g)", kw: ["kinder joy", "kinder surprise"] },
  { k: "kinder_bueno", c: "sna", e: "🍫", n: "Kinder Bueno", u: "u", kc: 122, pr: 2, un: "barre (une des deux)", kw: ["bueno"] },
  { k: "pitch", c: "sna", e: "🍫", n: "Pitch / brioche fourrée", u: "u", kc: 145, pr: 3, un: "brioche", kw: ["pitch", "brioche"] },
  { k: "prince", c: "sna", e: "🍪", n: "Prince / biscuit fourré", u: "u", kc: 93, pr: 1.2, un: "biscuit double", kw: ["prince"] },
  { k: "biscuit", c: "sna", e: "🍪", n: "Petit biscuit sec (Petit Beurre)", u: "u", kc: 36, pr: 0.6, un: "biscuit", kw: ["biscuit", "petit beurre"] },
  { k: "cookie", c: "sna", e: "🍪", n: "Gros cookie", u: "u", kc: 200, pr: 2.5, un: "cookie", kw: ["cookie"] },
  { k: "choco", c: "sna", e: "🍫", n: "Chocolat", u: "u", kc: 27, pr: 0.4, un: "carré", kw: ["carre de chocolat", "chocolat"] },
  { k: "barre", c: "sna", e: "🍫", n: "Barre chocolatée (Mars, Twix, Snickers)", u: "u", kc: 230, pr: 3, un: "barre", kw: ["mars", "twix", "snickers", "barre"] },
  { k: "bonbons", c: "sna", e: "🍬", n: "Bonbons (Haribo…)", u: "u", kc: 140, pr: 2, un: "poignée (40 g)", kw: ["bonbons", "haribo"] },
  { k: "gateau", c: "sna", e: "🍰", n: "Gâteau / tarte", u: "u", kc: 330, pr: 4, un: "part", kw: ["gateau", "tarte"] },
  { k: "crepe", c: "sna", e: "🥞", n: "Crêpe sucrée", u: "u", kc: 150, pr: 4, un: "crêpe", kw: ["crepe"] },
  { k: "glace", c: "sna", e: "🍨", n: "Glace", u: "u", kc: 120, pr: 2, un: "boule", kw: ["glace"] },
  { k: "chips", c: "sna", e: "🥔", n: "Chips / apéro", u: "u", kc: 150, pr: 2, un: "poignée (30 g)", kw: ["chips", "apero"] },
  { k: "dessert", c: "sna", e: "🍮", n: "Dessert lacté (crème, flan)", u: "u", kc: 150, pr: 4, un: "pot", kw: ["flan", "creme dessert", "danette"] },

  { k: "soja", c: "ext", e: "🥢", n: "Sauce soja", u: "u", kc: 10, pr: 1, un: "c. à soupe", kw: ["soja"] },
  { k: "rape", c: "ext", e: "🧀", n: "Fromage râpé", u: "u", kc: 80, pr: 5.5, un: "poignée (20 g)", kw: ["rape", "gruyere"] },
  { k: "beurre", c: "ext", e: "🧈", n: "Beurre ajouté", u: "u", kc: 75, pr: 0, un: "noisette (10 g)", kw: ["beurre"] },
  { k: "huile", c: "ext", e: "🫒", n: "Huile", u: "u", kc: 120, pr: 0, un: "c. à soupe", kw: ["huile"] },
  { k: "vinaigrette", c: "ext", e: "🥗", n: "Vinaigrette", u: "u", kc: 70, pr: 0, un: "c. à soupe", kw: ["vinaigrette"] },
  { k: "mayo", c: "ext", e: "🥚", n: "Mayonnaise", u: "u", kc: 95, pr: 0, un: "c. à soupe", kw: ["mayo", "mayonnaise"] },
  { k: "ketchup", c: "ext", e: "🍅", n: "Ketchup", u: "u", kc: 20, pr: 0, un: "c. à soupe", kw: ["ketchup"] },
  { k: "creme", c: "ext", e: "🥛", n: "Crème fraîche", u: "u", kc: 60, pr: 0.5, un: "c. à soupe", kw: ["creme fraiche"] },
  { k: "sauce", c: "ext", e: "🫗", n: "Sauce (poivre, béarnaise…)", u: "u", kc: 120, pr: 1, un: "portion", kw: ["sauce"] },
  { k: "cancoillotte", c: "ext", e: "🧀", n: "Cancoillotte", u: "u", kc: 40, pr: 4.5, un: "c. à soupe (30 g)", kw: ["cancoillotte"] },
  { k: "fromage", c: "ext", e: "🧀", n: "Fromage (camembert, comté…)", u: "u", kc: 110, pr: 7, un: "part (30 g)", kw: ["fromage", "camembert", "comte"] },

  { k: "soda", c: "boi", e: "🥤", n: "Soda", u: "u", kc: 140, pr: 0, un: "canette 33 cl", kw: ["coca", "soda", "fanta", "ice tea"] },
  { k: "soda0", c: "boi", e: "🥤", n: "Soda zéro", u: "u", kc: 1, pr: 0, un: "canette", kw: ["zero", "light"] },
  { k: "biere", c: "boi", e: "🍺", n: "Bière", u: "u", kc: 105, pr: 1, un: "demi (25 cl)", kw: ["biere", "demi"] },
  { k: "vin", c: "boi", e: "🍷", n: "Vin", u: "u", kc: 100, pr: 0, un: "verre (12 cl)", kw: ["vin"] },
  { k: "fort", c: "boi", e: "🍸", n: "Alcool fort / cocktail", u: "u", kc: 160, pr: 0, un: "verre", kw: ["cocktail", "whisky", "rhum", "vodka"] },
  { k: "jus", c: "boi", e: "🧃", n: "Jus de fruits", u: "u", kc: 90, pr: 1, un: "verre (20 cl)", kw: ["jus"] },

  { k: "burger", c: "plat", e: "🍔", n: "Menu burger frites", u: "u", kc: 1100, pr: 35, un: "menu", kw: ["burger", "mcdo", "big mac"] },
  { k: "pizza", c: "plat", e: "🍕", n: "Pizza", u: "u", kc: 230, pr: 10, un: "quart de pizza", kw: ["pizza"] },
  { k: "kebab", c: "plat", e: "🥙", n: "Kebab frites", u: "u", kc: 1000, pr: 40, un: "kebab", kw: ["kebab", "tacos"] },
  { k: "sushi", c: "plat", e: "🍣", n: "Sushis / makis", u: "u", kc: 45, pr: 2, un: "pièce", kw: ["sushi", "maki"] },
  { k: "quiche", c: "plat", e: "🥧", n: "Quiche", u: "u", kc: 380, pr: 12, un: "part", kw: ["quiche"] },
  { k: "lasagnes", c: "plat", e: "🍲", n: "Lasagnes / plat en sauce", u: "u", kc: 550, pr: 28, un: "assiette", kw: ["lasagnes", "hachis", "bolognaise"] },
  { k: "sandwich", c: "plat", e: "🥪", n: "Sandwich jambon-beurre (demi-baguette)", u: "u", kc: 520, pr: 25, un: "sandwich", kw: ["sandwich"] },
  { k: "croque", c: "plat", e: "🥪", n: "Croque-monsieur", u: "u", kc: 350, pr: 18, un: "pièce", kw: ["croque"] }
];
const FOOD = Object.fromEntries(FOODS.map(f => [f.k, f]));
const OLD_KEYS = { fruit: "pomme", viennoiserie: "pain_choc" };
const PORTIONS = ["Petite", "Normale", "Grosse"];
const COOK = [{ n: "Sans gras", kc: 0 }, { n: "Un peu de beurre", kc: 45 }, { n: "Bien beurré / sauce", kc: 110 }];
const SLOTS = [
  { k: "matin", n: "Matin", share: 0.2, col: "b-sky" },
  { k: "midi", n: "Midi", share: 0.35, col: "b-sun" },
  { k: "gouter", n: "Goûter", share: 0.1, col: "b-pink" },
  { k: "soir", n: "Soir", share: 0.35, col: "b-lilac" }
];
const PRESETS = [
  { e: "🍝", n: "Pâtes sauce soja + steak", items: [{ k: "pates_cuit", por: 1 }, { k: "boeuf", por: 1, cook: 1 }, { k: "soja", cnt: 1 }] },
  { e: "🐟", n: "Poisson blanc + patates air fryer + haricots", items: [{ k: "poisson", por: 1, cook: 1 }, { k: "pdt_air", por: 1 }, { k: "haricots", por: 1 }] },
  { e: "🍗", n: "Poulet + riz", items: [{ k: "poulet", por: 1, cook: 1 }, { k: "riz", por: 1 }] },
  { e: "🍖", n: "Rôti de porc + patates à la crème", items: [{ k: "porc", por: 1, cook: 1 }, { k: "pdt_creme", por: 1 }] },
  { e: "🥩", n: "Steak + patates air fryer + butternut", items: [{ k: "boeuf", por: 1, cook: 1 }, { k: "pdt_air", por: 1 }, { k: "butternut", por: 1 }] },
  { e: "☕", n: "Café au lait + 2 tartines", items: [{ k: "cafe_lait", cnt: 1 }, { k: "tartine", cnt: 2 }] },
  { e: "🥛", n: "Skyr + banane", items: [{ k: "skyr", cnt: 1 }, { k: "banane", cnt: 1 }] }
];
const cleanE = e => String(e || "").replace(/[<>&"'`=\\/]/g, "").slice(0, 8) || "🍽️";
const emojiFor = it => cleanE((FOOD[OLD_KEYS[it.k] || it.k] || {}).e || it.e);

/* ---------- Recettes ---------- */
const GOALS = [["seche", "Sèche"], ["equilibre", "Équilibre"], ["masse", "Prise de masse"]];
const RECIPES = [
  { id: "bowl_poulet", e: "🍗", n: "Bowl poulet, riz et haricots verts", g: ["seche", "equilibre"], kcal: 500, prot: 53, min: 15, how: "Micro-ondes", ingr: ["150 g de poulet cuit (ou 2 filets à l'air fryer)", "150 g de riz cuit (sachet express)", "150 g de haricots verts surgelés", "1 c. à soupe de sauce soja"], steps: ["Fais cuire les haricots 5 min au micro-ondes et réchauffe le riz.", "Coupe le poulet en morceaux et dispose tout dans un bol.", "Arrose de sauce soja, ajoute du poivre ou du piment."] },
  { id: "skyr_bowl", e: "🥣", n: "Skyr bowl fruits rouges et avoine", g: ["seche", "equilibre"], kcal: 365, prot: 35, min: 3, how: "Sans cuisson", ingr: ["300 g de skyr nature", "100 g de fruits rouges (surgelés, c'est parfait)", "30 g de flocons d'avoine", "1 c. à café de miel"], steps: ["Verse le skyr dans un bol.", "Ajoute les fruits, l'avoine et le miel."] },
  { id: "wrap_thon", e: "🌯", n: "Wrap thon et fromage blanc", g: ["seche", "equilibre"], kcal: 340, prot: 35, min: 5, how: "Sans cuisson", ingr: ["1 grande tortilla complète", "1 boîte de thon au naturel (100 g égoutté)", "2 c. à soupe de fromage blanc 0 %", "Salade, tomate, concombre", "Citron, poivre"], steps: ["Mélange le thon, le fromage blanc, le citron et le poivre.", "Étale sur la tortilla avec les crudités et roule serré."] },
  { id: "omelette", e: "🍳", n: "Omelette 3 œufs aux légumes", g: ["seche", "equilibre"], kcal: 415, prot: 27, min: 10, how: "Poêle", ingr: ["3 œufs", "150 g de légumes (poivrons, champignons, épinards, surgelés OK)", "1 c. à café d'huile", "1 tranche de pain complet (40 g)"], steps: ["Fais revenir les légumes 4 min dans l'huile.", "Verse les œufs battus, salés et poivrés, et laisse prendre à feu moyen.", "Plie l'omelette et sers avec le pain."] },
  { id: "saumon_af", e: "🐟", n: "Saumon, patates et brocoli à l'air fryer", g: ["seche", "equilibre"], kcal: 520, prot: 37, min: 20, how: "Air fryer", ingr: ["1 pavé de saumon (130 g)", "200 g de pommes de terre en cubes", "150 g de brocoli", "1 c. à café d'huile, sel, paprika"], steps: ["Mélange les patates avec l'huile et le paprika : 12 min à 200 °C.", "Ajoute le saumon et le brocoli : encore 8 min.", "Un filet de citron avant de servir."] },
  { id: "papillote", e: "🐠", n: "Cabillaud en papillote, semoule et courgette", g: ["seche"], kcal: 410, prot: 39, min: 12, how: "Micro-ondes", ingr: ["1 dos de cabillaud (170 g)", "1 courgette en rondelles", "50 g de semoule crue", "1 c. à café d'huile d'olive, citron, herbes"], steps: ["Mets le poisson et la courgette dans un plat fermé avec le citron, les herbes et l'huile.", "6 à 7 min au micro-ondes à pleine puissance.", "Pendant ce temps, verse 60 ml d'eau bouillante sur la semoule et couvre 5 min."] },
  { id: "chili", e: "🌶️", n: "Chili con carne léger", g: ["seche", "equilibre"], kcal: 430, prot: 38, min: 25, how: "Poêle", ingr: ["125 g de bœuf haché 5 %", "100 g de haricots rouges en boîte", "150 g de tomates concassées", "100 g de riz cuit", "Oignon, cumin, paprika"], steps: ["Fais dorer la viande avec l'oignon, sans matière grasse.", "Ajoute les tomates, les haricots égouttés et les épices : 15 min à feu doux.", "Sers sur le riz."] },
  { id: "salade_pc", e: "🥗", n: "Salade poulet et pois chiches", g: ["seche", "equilibre"], kcal: 450, prot: 47, min: 10, how: "Sans cuisson", ingr: ["120 g de poulet cuit", "100 g de pois chiches en boîte, rincés", "Salade, tomates cerises, concombre", "1 c. à soupe de vinaigrette"], steps: ["Rince les pois chiches.", "Mélange tout et assaisonne au dernier moment."] },
  { id: "steak_pd", e: "🍠", n: "Steak haché, patate douce et haricots", g: ["seche", "equilibre"], kcal: 355, prot: 27, min: 15, how: "Micro-ondes", ingr: ["1 steak haché 5 %", "1 patate douce (200 g)", "150 g de haricots verts"], steps: ["Pique la patate douce et passe-la 8 min au micro-ondes.", "Cuis le steak à sec dans une poêle antiadhésive.", "Sers avec les haricots."] },
  { id: "cancoillotte", e: "🧀", n: "Pommes de terre, cancoillotte et jambon", g: ["seche", "equilibre"], kcal: 390, prot: 31, min: 12, how: "Micro-ondes", ingr: ["250 g de pommes de terre", "60 g de cancoillotte (2 c. à soupe)", "2 tranches de jambon blanc", "Salade verte"], steps: ["Cuis les pommes de terre 8 min au micro-ondes dans un plat couvert avec un fond d'eau.", "Fais tiédir la cancoillotte 20 s et nappe les patates.", "Sers avec le jambon et la salade."] },
  { id: "fb_pomme", e: "🍎", n: "Fromage blanc, pomme et cannelle", g: ["seche"], kcal: 195, prot: 19, min: 3, how: "Sans cuisson", ingr: ["250 g de fromage blanc 0 %", "1 pomme en dés", "Cannelle"], steps: ["Mélange et saupoudre de cannelle. Parfait contre l'envie de sucré."] },
  { id: "oats", e: "🥛", n: "Overnight oats protéinés", g: ["seche", "equilibre", "masse"], kcal: 400, prot: 27, min: 5, how: "Sans cuisson", ingr: ["50 g de flocons d'avoine", "150 g de skyr", "150 ml de lait demi-écrémé", "½ banane"], steps: ["Mélange tout dans un bocal le soir.", "Laisse au frigo pour la nuit : c'est prêt au réveil."] },
  { id: "bolo", e: "🍝", n: "Pâtes complètes bolognaise maison", g: ["equilibre", "masse"], kcal: 555, prot: 38, min: 20, how: "Poêle", ingr: ["100 g de pâtes complètes crues", "100 g de bœuf haché 5 %", "100 g de sauce tomate", "10 g de parmesan"], steps: ["Cuis les pâtes.", "Fais dorer la viande, ajoute la sauce : 5 min.", "Mélange et parsème de parmesan."] },
  { id: "poke", e: "🍣", n: "Poke bowl saumon", g: ["equilibre"], kcal: 635, prot: 35, min: 15, how: "Sans cuisson", ingr: ["150 g de riz cuit", "120 g de saumon frais ou fumé", "½ avocat", "50 g d'edamame", "Concombre, sauce soja, sésame"], steps: ["Dispose le riz au fond du bol.", "Ajoute le saumon en dés, l'avocat, l'edamame et le concombre.", "Sauce soja et sésame."] },
  { id: "curry", e: "🍛", n: "Curry de poulet au lait de coco léger", g: ["equilibre", "masse"], kcal: 570, prot: 53, min: 20, how: "Poêle", ingr: ["150 g de blanc de poulet", "100 ml de lait de coco léger", "150 g de légumes (poivron, oignon)", "150 g de riz cuit", "1 c. à café de curry"], steps: ["Fais dorer le poulet en morceaux.", "Ajoute les légumes, le curry et le lait de coco : 10 min à feu doux.", "Sers avec le riz."] },
  { id: "croque", e: "🥪", n: "Croque-monsieur maison et grosse salade", g: ["equilibre"], kcal: 340, prot: 29, min: 8, how: "Air fryer", ingr: ["2 tranches de pain de mie complet", "2 tranches de jambon", "20 g d'emmental", "Salade verte"], steps: ["Monte le croque.", "5 à 6 min à l'air fryer à 190 °C.", "Sers avec une grosse salade."] },
  { id: "tartines_avo", e: "🥑", n: "Tartines avocat et œufs", g: ["equilibre", "masse"], kcal: 470, prot: 22, min: 10, how: "Poêle", ingr: ["80 g de pain complet", "½ avocat", "2 œufs", "Sel, poivre, piment"], steps: ["Fais griller le pain et écrase l'avocat dessus.", "Cuis les œufs au plat ou mollets.", "Pose-les sur les tartines."] },
  { id: "bowl_boeuf", e: "🥩", n: "Gros bowl bœuf, riz, œuf et avocat", g: ["masse"], kcal: 820, prot: 55, min: 15, how: "Poêle", ingr: ["250 g de riz cuit", "150 g de bœuf en lamelles", "1 œuf", "½ avocat", "Sauce soja"], steps: ["Saisis le bœuf 2 min de chaque côté.", "Cuis l'œuf au plat.", "Dispose le tout sur le riz avec l'avocat."] },
  { id: "pates_thon", e: "🐟", n: "Pâtes au thon et à la tomate", g: ["masse"], kcal: 870, prot: 57, min: 15, how: "Poêle", ingr: ["150 g de pâtes crues", "1 grosse boîte de thon (140 g égoutté)", "150 g de sauce tomate", "1 c. à soupe d'huile d'olive"], steps: ["Cuis les pâtes.", "Réchauffe la sauce avec le thon et l'huile.", "Mélange."] },
  { id: "shake", e: "🥤", n: "Shake prise de masse", g: ["masse"], kcal: 755, prot: 50, min: 3, how: "Sans cuisson", ingr: ["400 ml de lait demi-écrémé", "1 banane", "60 g de flocons d'avoine", "20 g de beurre de cacahuète", "1 dose de whey (30 g)"], steps: ["Tout au blender, 30 secondes."] },
  { id: "pancakes", e: "🥞", n: "Pancakes protéinés", g: ["masse", "equilibre"], kcal: 665, prot: 40, min: 15, how: "Poêle", ingr: ["80 g de flocons d'avoine mixés", "2 œufs", "150 g de skyr", "1 banane", "1 c. à café de miel"], steps: ["Mixe tout sauf le miel.", "Cuis de petits pancakes 2 min par face dans une poêle antiadhésive.", "Un filet de miel dessus."] },
  { id: "wraps_poulet", e: "🌯", n: "2 wraps poulet, avocat et fromage", g: ["masse"], kcal: 840, prot: 64, min: 10, how: "Sans cuisson", ingr: ["2 tortillas", "150 g de poulet cuit", "½ avocat", "30 g de fromage râpé", "Salade, tomate"], steps: ["Garnis les tortillas.", "Roule-les et passe 2 min à la poêle pour faire fondre le fromage (facultatif)."] }
];
const GOAL_COL = { seche: "b-mint", equilibre: "b-sky", masse: "b-tomato" };

/* ---------- Musculation ---------- */
const GROUPS = {
  lats: "Grand dorsal", upper: "Haut du dos", traps: "Trapèzes (haut)", lower: "Lombaires",
  chest: "Pectoraux", fdelt: "Épaule avant", ldelt: "Épaule côté", rdelt: "Épaule arrière",
  bi: "Biceps", tri: "Triceps", fore: "Avant-bras", quads: "Quadriceps", hams: "Ischio-jambiers", glutes: "Fessiers", abs: "Abdos"
};
const GDESC = {
  lats: "Le grand muscle sur les côtés du dos, sous les bras. C'est lui qui dessine le V. Il travaille dès que tu ramènes les coudes vers les hanches.",
  upper: "Rhomboïdes, trapèzes moyens et muscles autour de l'omoplate. Ils rapprochent les omoplates et tiennent ta posture droite.",
  traps: "Le haut des trapèzes, entre le cou et les épaules. Ils haussent les épaules.",
  lower: "Les muscles le long de la colonne, en bas du dos. Ils la gardent droite quand tu te penches ou soulèves.",
  chest: "Les pectoraux. Ils rapprochent les bras devant toi et poussent vers l'avant.",
  fdelt: "L'avant de l'épaule. Il lève le bras devant toi et travaille sur tous les développés.",
  ldelt: "Le côté de l'épaule. C'est lui qui donne la largeur des épaules, il lève le bras sur le côté.",
  rdelt: "L'arrière de l'épaule. Il tire le bras vers l'arrière et équilibre l'épaule face aux pecs.",
  bi: "Le biceps, devant le bras. Il plie le coude et tourne la paume vers le haut.",
  tri: "Le triceps, derrière le bras : environ la moitié du volume du bras. Il tend le coude.",
  fore: "Les avant-bras. Ils serrent la poigne et plient le poignet.",
  quads: "Les quadriceps, devant la cuisse. Ils tendent le genou.",
  hams: "Les ischio-jambiers, derrière la cuisse. Ils plient le genou et aident à tendre la hanche.",
  glutes: "Les fessiers, les plus gros muscles du corps. Ils tendent la hanche en poussant le bassin vers l'avant.",
  abs: "Le grand droit et les obliques. Ils enroulent et tournent le buste, et gainent le tronc."
};
// Régions du dessin anatomique → groupes suivis, et sens des fibres (degrés, côté gauche)
const REGIONS = {
  chest: { g: ["chest"], a: 72 }, abs: { g: ["abs"], a: 0 }, obliques: { g: ["abs"], a: 38 }, biceps: { g: ["bi"], a: 4 },
  tri_f: { g: ["tri"], a: 4 }, trap_f: { g: ["traps"], a: 50 }, delt_f: { g: ["fdelt", "ldelt"], a: 12 }, fore_f: { g: ["fore"], a: 8 }, quads: { g: ["quads"], a: 6 },
  trap_b: { g: ["traps", "upper"], a: 55 }, delt_b: { g: ["rdelt", "ldelt"], a: 12 }, upper_b: { g: ["upper"], a: 80 }, lats: { g: ["lats"], a: 55 },
  tri_b: { g: ["tri"], a: 4 }, lower: { g: ["lower"], a: 0 }, fore_b: { g: ["fore"], a: 8 }, glutes: { g: ["glutes"], a: 62 }, hams: { g: ["hams"], a: 3 }
};
const TPLS = [
  { k: "dos", n: "Dos + triceps", d: "Tirages, trapèzes, lombaires, triceps", col: "b-lilac" },
  { k: "pecs", n: "Pecs + biceps", d: "Développés, pec deck, curls", col: "b-pink" },
  { k: "jambes", n: "Jambes + épaules", d: "Presse, cuisses, épaules, abdos", col: "b-sky" }
];
const EX = {
  rowing_large: { n: "Tirage horizontal assis, prise large", alias: "Assis, je tire la barre vers le torse, prise large", pri: ["upper", "rdelt"], sec: ["lats", "bi"], mus: "Rhomboïdes, trapèzes moyens et inférieurs, deltoïdes postérieurs", why: "La prise large avec les coudes écartés (environ 60 à 80° du buste) met l'accent sur le haut du dos : les muscles entre les omoplates et l'arrière des épaules. Avec une poignée serrée (triangle) et les coudes collés au corps, le grand dorsal travaille davantage. Les deux versions font travailler tout le dos, seule la répartition change.", cue: "Poitrine sortie, tire avec les coudes et pas avec les mains, serre les omoplates une seconde, puis laisse revenir lentement. Le buste ne bascule pas en arrière pour aider.", rr: [8, 12], inc: 5 },
  tirage_uni_assis: { n: "Tirage vertical unilatéral, assis au sol", alias: "Assis par terre, une poignée, poulie presque tout en haut, je ramène le coude le long du corps", pri: ["lats"], sec: ["upper", "bi"], mus: "Grand dorsal, grand rond, rhomboïdes, biceps", why: "La poulie haute et le coude qui descend le long du corps en font un tirage vertical : c'est le grand dorsal qui travaille, le muscle de la largeur du dos. Le faire à un bras permet d'aller plus loin dans l'étirement en haut et dans la contraction en bas.", cue: "Laisse le bras monter jusqu'à sentir l'étirement sous l'aisselle, puis tire le coude vers la hanche, près du corps. Le buste reste droit, sans tourner ni se pencher pour aider.", rr: [10, 15], inc: 2.5 },
  rowing_haltere: { n: "Rowing haltère un bras", alias: "À quatre pattes sur le banc, un haltère", pri: ["lats", "upper"], sec: ["rdelt", "bi"], mus: "Grand dorsal, rhomboïdes, trapèzes, biceps", why: "Un excellent exercice pour le grand dorsal sans machine. Tu travailles un côté à la fois, donc tu vois tout de suite si un côté est plus faible.", cue: "Ramène le coude vers la hanche (pas vers l'aisselle) : ce trajet sollicite davantage le grand dorsal. Dos plat, la main d'appui sous l'épaule.", rr: [8, 12], inc: 2.5 },
  shrugs: { n: "Shrugs haltères", alias: "Deux haltères, je remonte les épaules vers les oreilles", pri: ["traps"], sec: ["fore"], start: 30, mus: "Trapèzes supérieurs", why: "Le haut des trapèzes donne l'épaisseur entre le cou et les épaules. L'exercice charge aussi la poigne.", cue: "Monte droit vers les oreilles, tiens 1 à 2 secondes en haut, redescends lentement. Ne fais pas rouler les épaules.", rr: [10, 15], inc: 2.5 },
  hyperext: { n: "Extensions lombaires au banc à 45°", alias: "Banc en diagonale bloqué en haut des cuisses, un disque", pri: ["lower"], sec: ["glutes", "hams"], mus: "Érecteurs du rachis (lombaires), fessiers, ischio-jambiers", why: "Renforce le bas du dos et les fessiers, utiles sur tous les tirages et la presse.", cue: "Descends en contrôlant, remonte jusqu'à ce que le corps soit aligné, sans te cambrer au-delà. Disque serré contre la poitrine.", rr: [10, 15], inc: 5 },
  tri_corde: { n: "Extension triceps à la poulie haute (corde)", alias: "Triceps, exercice 1", pri: ["tri"], sec: [], mus: "Triceps, surtout le chef latéral (l'extérieur du bras)", why: "Le triceps représente environ la moitié du volume du bras. La corde permet d'écarter les mains en bas pour finir la contraction.", cue: "Coudes collés au buste et immobiles, écarte la corde en bas, remonte jusqu'à environ 90°.", rr: [10, 15], inc: 2.5 },
  tri_nuque: { n: "Extension triceps au-dessus de la tête", alias: "Triceps, exercice 2 (poulie ou haltère derrière la tête)", pri: ["tri"], sec: [], mus: "Triceps, surtout la longue portion (l'arrière du bras)", why: "Bras au-dessus de la tête, la longue portion du triceps est étirée, ce qui la fait mieux travailler. C'est la plus grosse partie du triceps.", cue: "Coudes qui pointent vers le haut, descends derrière la tête jusqu'à sentir l'étirement, remonte sans écarter les coudes.", rr: [10, 15], inc: 2.5 },
  dc_halteres: { n: "Développé couché haltères", alias: "Couché sur banc plat, deux haltères", pri: ["chest"], sec: ["fdelt", "tri"], start: 37.5, mus: "Grand pectoral, deltoïde antérieur, triceps", why: "L'exercice de base des pecs. Les haltères permettent de descendre plus bas qu'avec une barre et de corriger un côté plus faible.", cue: "Omoplates serrées et collées au banc, coudes à environ 45° du buste (pas à 90°), descends jusqu'à l'étirement des pecs.", rr: [6, 10], inc: 2.5 },
  pec_deck: { n: "Pec deck (papillon)", alias: "Machine papillon", pri: ["chest"], sec: [], start: 83, mus: "Grand pectoral, partie du milieu", why: "Isole les pecs sans les triceps. Le poids affiché dépend de la machine : compare-toi seulement sur la même machine.", cue: "Bras légèrement fléchis et fixes, rapproche les mains en serrant les pecs une seconde, puis retour lent jusqu'à l'étirement.", rr: [10, 15], inc: 5 },
  incline_smith: { n: "Développé incliné à la Smith", alias: "Banc incliné sous la barre guidée", pri: ["chest", "fdelt"], sec: ["tri"], mus: "Haut des pectoraux (faisceau claviculaire), deltoïde antérieur", why: "L'inclinaison met l'accent sur le haut des pecs, la partie qui remplit le torse sous les clavicules.", cue: "Banc à 30° environ : plus haut, ça devient un exercice d'épaules. La barre descend vers le haut de la poitrine.", rr: [8, 12], inc: 5 },
  curl_incline: { n: "Curl incliné haltères", alias: "Biceps sur banc incliné", pri: ["bi"], sec: ["fore"], mus: "Biceps, surtout la longue portion (le « pic »)", why: "Bras qui pendent derrière le buste, le biceps est étiré au départ : c'est la version qui travaille le mieux la longue portion.", cue: "Dos collé au banc, coudes fixes qui ne remontent pas vers l'avant, descente lente.", rr: [10, 15], inc: 2.5 },
  curl_marteau: { n: "Curl marteau", alias: "Prise neutre, pouces vers le haut", pri: ["fore", "bi"], sec: [], mus: "Brachial, brachio-radial (avant-bras), biceps", why: "La prise neutre fait travailler le brachial (sous le biceps, il pousse le biceps vers le haut) et le gros muscle de l'avant-bras.", cue: "Pouces vers le haut tout du long, coudes collés, pas d'élan avec le dos.", rr: [10, 15], inc: 2.5 },
  presse: { n: "Presse à cuisses", alias: "La presse", pri: ["quads", "glutes"], sec: ["hams"], mus: "Quadriceps, fessiers, ischio-jambiers", why: "Charge lourdement les jambes sans charger le dos. C'est l'exercice qui dépense le plus d'énergie de ta semaine.", cue: "Pieds plus hauts sur la plateforme = moins de contrainte sur le genou et plus de fessiers. Amplitude sans douleur, genoux jamais verrouillés en haut.", tendon: true, rr: [10, 15], inc: 10 },
  dev_militaire: { n: "Développé militaire assis", alias: "Machine ou haltères, assis sur banc", pri: ["fdelt", "ldelt"], sec: ["tri"], mus: "Deltoïdes antérieur et moyen, triceps", why: "L'exercice de force des épaules. Il travaille surtout l'avant, déjà bien sollicité par les développés pecs.", cue: "Dossier droit, abdos serrés, pousse au-dessus de la tête sans cambrer. Descends jusqu'au niveau du menton.", rr: [8, 12], inc: 2.5 },
  leg_ext: { n: "Leg extension", alias: "Assis, je pousse vers le haut avec les tibias", pri: ["quads"], sec: [], mus: "Quadriceps", why: "Il isole le devant de la cuisse. Il charge directement le tendon rotulien : bien dosé, il sert même en rééducation de ce tendon, mais la charge et l'amplitude se règlent avec ton kiné.", cue: "Tempo lent (2 s pour monter, 3 s pour descendre), charge modérée, amplitude sans douleur.", tendon: true, rr: [10, 15], inc: 5 },
  elev_lat: { n: "Élévation latérale à la poulie basse", alias: "Poulie tout en bas, bras tendu, je lève sur le côté", pri: ["ldelt"], sec: [], mus: "Deltoïde moyen (le côté de l'épaule)", why: "C'est le muscle qui élargit les épaules. Si tu lèves le bras devant toi plutôt que sur le côté, c'est une élévation frontale : elle travaille l'avant de l'épaule, déjà chargé par les développés.", cue: "Coude légèrement fléchi, mène le mouvement avec le coude, monte jusqu'à hauteur d'épaule. Charge légère : on progresse en reps, puis du plus petit cran possible.", rr: [12, 20], inc: 1.25 },
  leg_curl: { n: "Leg curl assis", alias: "Assis, je pousse vers le bas avec les talons", pri: ["hams"], sec: [], mus: "Ischio-jambiers (arrière de la cuisse)", why: "L'inverse du leg extension : il travaille l'arrière de la cuisse, qui équilibre le genou.", cue: "Ramène les talons sous le siège, pause d'une seconde, remontée lente.", tendon: true, rr: [10, 15], inc: 5 },
  oiseau_poulie: { n: "Oiseau à la poulie, un bras", alias: "Poulie à hauteur d'épaule, je tends le bras vers l'arrière", pri: ["rdelt"], sec: ["upper"], mus: "Deltoïde postérieur, trapèze moyen, rhomboïdes", why: "Isole l'arrière de l'épaule. Avec le tirage coude haut, ça fait deux exercices dessus par semaine.", cue: "Bras presque tendu, tire vers l'arrière à hauteur d'épaule, sans tourner le buste. Charge légère, mouvement propre.", rr: [12, 20], inc: 1.25 },
  tirage_vertical: { n: "Tirage vertical (lat pulldown)", alias: "Assis sous la poulie haute, barre vers le haut de la poitrine", pri: ["lats"], sec: ["bi", "upper"], sugg: "Il manque un tirage vertical dans ta séance dos. Il complète tes tirages horizontaux et cible bien le grand dorsal. À faire en premier.", mus: "Grand dorsal, grand rond, biceps", why: "Tes tirages actuels sont tous horizontaux. Le tirage vertical travaille le grand dorsal sous un autre angle.", cue: "Prise un peu plus large que les épaules, tire la barre vers le haut de la poitrine en descendant les coudes vers les hanches. Pas de balancier.", rr: [8, 12], inc: 5 },
  face_pull: { n: "Face pull à la corde", alias: "Poulie haute, je tire la corde vers le visage", pri: ["rdelt"], sec: ["upper"], sugg: "Aide à garder des épaules saines si tu fais beaucoup de développés.", mus: "Deltoïde postérieur, coiffe des rotateurs, trapèze moyen", why: "Renforce les petits muscles qui stabilisent l'épaule.", cue: "Tire la corde vers le front en écartant les mains, coudes hauts, pause d'une seconde.", rr: [12, 20], inc: 1.25 },
  hip_thrust: { n: "Hip thrust (machine ou barre)", alias: "Dos sur banc, je pousse le bassin vers le haut", pri: ["glutes"], sec: ["hams"], sugg: "Travaille les fessiers en pliant peu le genou. À valider avec ton chirurgien selon le tendon concerné.", mus: "Grand fessier, ischio-jambiers", why: "Un très bon exercice pour les fessiers, avec peu de mouvement au genou.", cue: "Menton rentré, pousse avec les talons, serre les fessiers 1 s en haut sans cambrer.", rr: [8, 12], inc: 10 },
  crunch_poulie: { n: "Crunch à la poulie", alias: "À genoux face à la poulie haute, corde derrière la tête", pri: ["abs"], sec: [], sugg: "Des abdos qu'on peut charger et faire progresser.", mus: "Grand droit de l'abdomen", why: "Les abdos se renforcent comme les autres muscles : avec une charge qui progresse.", cue: "Enroule la colonne en amenant les coudes vers les cuisses, les hanches ne bougent pas.", rr: [10, 15], inc: 5 },
  rdl: { n: "Soulevé de terre jambes tendues (haltères)", alias: "Debout, je descends les haltères le long des jambes", pri: ["hams", "glutes"], sec: ["lower"], sugg: "Ischios et fessiers avec le genou presque fixe.", mus: "Ischio-jambiers, fessiers, lombaires", why: "Travaille l'arrière des jambes en étirement, avec peu de flexion du genou.", cue: "Genoux légèrement fléchis et fixes, recule les fesses, dos plat, descends jusqu'à mi-tibia.", rr: [8, 12], inc: 2.5 },
  ecarte_poulie: { n: "Écarté à la poulie vis-à-vis", alias: "Debout entre deux poulies", pri: ["chest"], sec: [], sugg: "Alternative au pec deck.", mus: "Grand pectoral", why: "Tension constante sur les pecs tout le long du mouvement.", cue: "Léger pas en avant, bras légèrement fléchis, rapproche les mains devant la poitrine.", rr: [12, 20], inc: 1.25 },
  barre_front: { n: "Barre au front", alias: "Couché, barre EZ vers le front", pri: ["tri"], sec: [], sugg: "Triceps, alternative à la poulie.", mus: "Triceps (toutes les portions)", why: "Charge lourde possible sur les triceps.", cue: "Coudes fixes vers le plafond, descends la barre vers le front, remonte.", rr: [8, 12], inc: 2.5 }
};
// Démonstrations : photos de départ et d'arrivée (free-exercise-db, domaine public), alternées en fondu
const DEMO_KEYS = new Set(["rowing_large", "tirage_uni_assis", "rowing_haltere", "shrugs", "hyperext", "tri_corde", "tri_nuque", "dc_halteres", "pec_deck", "incline_smith", "curl_incline", "curl_marteau", "presse", "dev_militaire", "leg_ext", "elev_lat", "leg_curl", "oiseau_poulie", "tirage_vertical", "face_pull", "hip_thrust", "crunch_poulie", "rdl", "ecarte_poulie", "barre_front"]);
function demoKey(id) { const ex = XM()[id]; if (ex && ex.demo !== undefined) return ex.demo || null; return DEMO_KEYS.has(id) ? id : null; }
const demoHTML = (k, name) => k ? `<div class="demo" role="img" aria-label="Démonstration : ${esc(name)}, position de départ puis d'arrivée"><img src="img/ex/${k}-0.jpg" alt="" loading="lazy"><img src="img/ex/${k}-1.jpg" alt="" loading="lazy"><span class="demo-tag mono">départ → arrivée</span></div>` : "";
// Catalogue fusionné : exercices de base + exercices créés ou modifiés dans l'appli
function XM() {
  if (MEMO.ex) return MEMO.ex;
  const c = S.profile.customEx || {}, m = { ...EX };
  for (const [k, v] of Object.entries(c)) m[k] = { ...(EX[k] || {}), ...v };
  return (MEMO.ex = m);
}
const cleanTxt = v => String(v || "").replace(/[<>&"'`]/g, "").trim();
function applyTplNames() { const c = S.profile.tplNames || {}; TPLS.forEach(t => { if (!t.n0) t.n0 = t.n; t.n = cleanTxt(c[t.k]) || t.n0; }); }
const tplOf = k => TPLS.find(t => t.k === k) || { k, n: "Séance", d: "", col: "b-sky" };
const DEFAULT_PROGRAM = {
  dos: ["rowing_large", "tirage_uni_assis", "rowing_haltere", "shrugs", "hyperext", "tri_corde", "tri_nuque"],
  pecs: ["dc_halteres", "pec_deck", "incline_smith", "curl_incline", "curl_marteau"],
  jambes: ["presse", "dev_militaire", "leg_ext", "elev_lat", "leg_curl", "oiseau_poulie"]
};

/* ---------- État ---------- */
// Pots connus, valeurs d'étiquette pour une dose
const POWDER_PRESETS = [
  { n: "ESN Designer Whey", g: 30, kcal: 112, prot: 22 },
  { n: "Nutrimuscle Native Protein", g: 30, kcal: 110, prot: 22.5 }
];
const BLANK_PROFILE = {
  setup: false, sex: "h", heightCm: null, age: null, startKg: null, startDate: null, goalKg: null, goalDate: null,
  activity: 1.4, kcalManual: null, prot: null, auto: true, mode: "seche", program: null,
  wheys: [{ id: "w1", n: "Whey", g: 30, kcal: 115, prot: 23 }], creaG: 5, tendon: false, context: "", v: 5
};
let S = { profile: { ...BLANK_PROFILE }, days: {}, sessions: {} };
const UI = { tab: "jour", date: today(), month: today().slice(0, 7), activeSession: null, noResume: false, editProgram: false, region: null, goal: "seche", rfilter: "all", aiRecipes: [], aiBusy: false, aiErr: "", coach: "", coachBusy: false, lastToday: today() };
let MEMO = {};
const fresh = () => { MEMO = {}; };

const LS = "carnet-seche-v1";
function loadLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS) || "null");
    if (j && j.profile) S = { profile: { ...BLANK_PROFILE, v: 0, ...j.profile }, days: j.days || {}, sessions: j.sessions || {} };
  } catch (e) {}
}
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { toast("Stockage plein : exporte tes données dans Réglages"); } if (typeof scheduleCloud === "function" && S.profile.setup) scheduleCloud(); }
function migrate() {
  const p = S.profile;
  if ((p.v || 0) < 4) {
    // Données venues de la version claude.ai
    if (p.heightCm && p.startKg && p.startDate && p.goalDate) p.setup = true;
    if (p.activity === 1.45) p.activity = 1.4;
    if (p.creaG == null) p.creaG = 5;
    if (p.auto == null) p.auto = true;
    if (!p.mode) p.mode = "seche";
    if (!p.sex) p.sex = "h";
    if (p.tendon == null) p.tendon = Object.values(S.days).some(d => d.pain != null);
    if (p.context == null) p.context = "";
    delete p.v2; delete p.checked; delete p.u;
    p.v = 4;
  }
  if (p.v < 5) {
    // Une seule whey → liste de poudres ; doses du jour rangées par pot
    if (p.whey) p.wheys = [{ id: "w1", n: "Whey", g: 30, kcal: 115, prot: 23, ...p.whey }];
    else if (!p.wheys || !p.wheys.length) p.wheys = [{ id: "w1", n: "Whey", g: 30, kcal: 115, prot: 23 }];
    delete p.whey;
    const first = p.wheys[0].id;
    Object.values(S.days).forEach(D => { if (D.supp && D.supp.whey != null) { D.supp.p = { ...(D.supp.p || {}), [first]: ((D.supp.p || {})[first] || 0) + (+D.supp.whey || 0) }; delete D.supp.whey; } });
    p.v = 5;
    save();
  }
}
const saveDay = d => { if (!S.days[d]) S.days[d] = day(d); S.days[d].u = Date.now(); save(); };
const program = () => S.profile.program || DEFAULT_PROGRAM;
const day = d => S.days[d] || { meals: [], walk: 0, kg: null, pain: null, supp: null };
const conva = () => S.profile.mode === "conva";
const activity = () => conva() ? 1.25 : S.profile.activity;
const deficit = () => conva() ? 250 : 650;
const bmr = kg => { const p = S.profile; return 10 * kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "f" ? -161 : 5); };

/* Poids tendance : moyenne mobile exponentielle à 10 % */
function weightsList() {
  if (MEMO.wl) return MEMO.wl;
  const out = [];
  const p = S.profile;
  if (p.startKg && !(S.days[p.startDate] && S.days[p.startDate].kg)) out.push([p.startDate, p.startKg]);
  for (const [d, v] of Object.entries(S.days)) if (v.kg) out.push([d, v.kg]);
  return (MEMO.wl = out.sort((a, b) => a[0] < b[0] ? -1 : 1));
}
function trendSeries() {
  if (MEMO.ts) return MEMO.ts;
  const wl = weightsList(), m = new Map();
  if (wl.length) {
    const w = Object.fromEntries(wl);
    let T = null;
    for (let d = wl[0][0]; d <= today(); d = addDays(d, 1)) { if (w[d] != null) T = T == null ? w[d] : T + 0.1 * (w[d] - T); m.set(d, T); }
  }
  return (MEMO.ts = m);
}
function trendAt(d) {
  const m = trendSeries();
  if (m.has(d)) return m.get(d);
  const wl = weightsList();
  if (!wl.length) return S.profile.startKg;
  return d < wl[0][0] ? wl[0][1] : m.get(today());
}
const currentKg = () => trendAt(today()) || S.profile.startKg;
function trendPerWeek() {
  if (MEMO.tpw !== undefined) return MEMO.tpw;
  const w = weightsList().filter(([d]) => diffDays(d, today()) <= 21);
  if (w.length < 4 || diffDays(w[0][0], w[w.length - 1][0]) < 6) return (MEMO.tpw = null);
  const xs = w.map(([d]) => diffDays(w[0][0], d)), ys = w.map(x => x[1]);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return (MEMO.tpw = den ? (num / den) * 7 : null);
}
/* Dépense : formule au départ, puis mesurée sur 14 jours de poids et de repas */
const formulaMaintenance = () => bmr(currentKg()) * activity();
function adaptive() {
  if (MEMO.ad) return MEMO.ad;
  const N = 14, end = addDays(today(), -1), start = addDays(end, -(N - 1));
  const sinceStart = diffDays(S.profile.startDate, end) + 1;
  const mif = formulaMaintenance();
  const res = { ready: false, mif, days: Math.max(0, sinceStart), need: N };
  if (sinceStart < N) return (MEMO.ad = res);
  const logged = Array.from({ length: N }, (_, i) => addDays(start, i)).filter(hasFood);
  res.logged = logged.length;
  if (logged.length < 10) { res.reason = "saisie"; return (MEMO.ad = res); }
  const intake = logged.reduce((a, d) => a + dayTotals(d).kcal, 0) / logged.length;
  const dT = trendAt(end) - trendAt(addDays(start, -1));
  const raw = intake - dT * KCAL_PER_KG / N;
  const totalLogged = Object.keys(S.days).filter(d => d >= S.profile.startDate && d <= end && hasFood(d)).length;
  const w = clamp((totalLogged - 7) / 21, 0, 1);
  const tdee = clamp((1 - w) * mif + w * raw, mif * 0.75, mif * 1.25);
  return (MEMO.ad = { ready: true, mif, raw, tdee, w, intake, dT, logged: logged.length, days: sinceStart, need: N });
}
const maintenance = () => { const a = adaptive(); return S.profile.auto !== false && a.ready ? a.tdee : a.mif; };
function kcalTarget() {
  if (MEMO.tgt) return MEMO.tgt;
  if (S.profile.kcalManual) return (MEMO.tgt = S.profile.kcalManual);
  return (MEMO.tgt = Math.max(S.profile.sex === "f" ? 1300 : 1600, round50(maintenance() - deficit())));
}
const itemTotals = items => items.reduce((a, it) => ({ kcal: a.kcal + (+it.kcal || 0), prot: a.prot + (+it.prot || 0) }), { kcal: 0, prot: 0 });
const powders = () => S.profile.wheys || [];
const activePowders = () => powders().filter(w => !w.off);
const dosesOf = (D, id) => (D && D.supp && D.supp.p && D.supp.p[id]) || 0;
const totalDoses = D => powders().reduce((a, w) => a + dosesOf(D, w.id), 0);
const suppTotals = D => powders().reduce((a, w) => { const n = dosesOf(D, w.id); return { kcal: a.kcal + n * w.kcal, prot: a.prot + n * w.prot }; }, { kcal: 0, prot: 0 });
const sleepH = D => { const s2 = D && D.sleep; if (!s2 || !s2.bed || !s2.wake) return null; const m = t => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; }; let d = m(s2.wake) - m(s2.bed); if (d <= 0) d += 1440; return d / 60; };
const fmtH = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); };
const avgSleep = n => { const v = Array.from({ length: n }, (_, i) => sleepH(day(addDays(today(), -i)))).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const dayTotals = d => { const D = day(d), a = itemTotals(D.meals.flatMap(m => m.items)), b = suppTotals(D); return { kcal: a.kcal + b.kcal, prot: a.prot + b.prot }; };
const hasFood = d => { const D = S.days[d]; return !!D && D.meals.some(m => m.items.length); };
const lightFor = r => r <= 1.1 ? "ok" : r <= 1.4 ? "warn" : "over";
const dayLight = kcal => { const t = kcalTarget(); return kcal <= t + 100 ? "ok" : kcal <= t + 400 ? "warn" : "over"; };
function sessionsSorted() {
  if (MEMO.ss) return MEMO.ss;
  return (MEMO.ss = Object.entries(S.sessions).map(([id, s]) => ({ id, ...s })).sort((a, b) => (a.date + (a.t || "")) < (b.date + (b.t || "")) ? 1 : -1));
}
function sessionOn(d) {
  if (!MEMO.sod) { MEMO.sod = {}; sessionsSorted().forEach(s => { if (s.done && !MEMO.sod[s.date]) MEMO.sod[s.date] = s; }); }
  return MEMO.sod[d];
}
const walkGoal = d => conva() ? 15 : sessionOn(d) ? 20 : 30;
function streakInfo() {
  let d = today(), n = 0, joker = null;
  if (!hasFood(d)) d = addDays(d, -1);
  for (let g = 0; g < 400; g++) {
    if (hasFood(d)) { n++; d = addDays(d, -1); continue; }
    if ((joker == null || diffDays(d, joker) >= 7) && hasFood(addDays(d, -1))) { joker = d; d = addDays(d, -1); continue; }
    break;
  }
  return { n, jokerFree: joker == null || diffDays(joker, today()) >= 7 };
}
function painTrend() {
  const v = [];
  for (let i = 0; i < 10; i++) { const p = day(addDays(today(), -i)).pain; if (p != null) v.push(p); }
  if (v.length < 4) return null;
  return v.slice(0, 3).reduce((a, b) => a + b) / 3 - v.slice(3).reduce((a, b) => a + b) / (v.length - 3);
}

/* ---------- Rendu général ---------- */
const view = document.getElementById("view");
const $ = id => document.getElementById(id);
function render() {
  try { renderInner(); }
  catch (e) {
    view.innerHTML = `<section class="card"><h3>Un souci d'affichage</h3><p class="small">${esc(e && e.message)}</p><p class="small muted">Tes données sont intactes. Exporte-les par sécurité, puis envoie-moi ce message.</p><div class="row"><button class="btn sun" data-act="export">Exporter mes données</button><button class="btn" data-act="go" data-tab="jour">Revenir au jour</button></div></section>`;
  }
}
function renderInner() {
  fresh();
  applyTplNames();
  const setup = S.profile.setup;
  $("top").hidden = !setup; $("tabbar").hidden = !setup;
  if (!setup) { view.innerHTML = viewOnboarding(); return; }
  renderTop();
  document.querySelectorAll(".tabbar [data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab === UI.tab ? "page" : "false"));
  view.innerHTML = { jour: viewJour, journal: viewJournal, corps: viewCorps, progres: viewProgres, plan: viewPlan, recettes: viewRecettes }[UI.tab]();
}
function renderKeepFocus() {
  setTimeout(() => { const id = document.activeElement && document.activeElement.id; render(); const el = id && $(id); if (el) el.focus(); }, 0);
}
function renderTop() {
  const p = S.profile, d = parseD(UI.date), isT = UI.date === today();
  const titles = { jour: isT ? "Aujourd'hui" : cap(JOURS_L[d.getDay()]) + " " + d.getDate(), journal: cap(MOIS_L[parseD(UI.month).getMonth()]), corps: "Ton corps", progres: "Progrès", plan: "Réglages", recettes: "Recettes" };
  const left = Math.max(0, diffDays(today(), p.goalDate));
  $("when").innerHTML = `<h1>${titles[UI.tab]}</h1><span class="mono muted">J−${left} → ${f1(p.goalKg)} kg</span>`;
  const lost = p.startKg - currentKg();
  $("kgchip").innerHTML = `${f1(currentKg())}<small>${lost > 0.05 ? "−" + f1(lost) : "kg"}</small>`;
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.tm); toast.tm = setTimeout(() => { t.hidden = true; }, 2800);
}
const chartW = () => clamp(Math.round(view.clientWidth - 70), 280, 520);
const ICON_SEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const ICON_MIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`;

/* ---------- Première ouverture ---------- */
function viewOnboarding() {
  return `<div class="onb">
    <div class="big">Carnet<br>de sèche</div>
    <p class="small">Tes repas, ta muscu et ton poids, au même endroit. Tout reste sur ce téléphone.</p>
    <form class="card" id="onb-form">
      <h3>Pour calculer ta cible</h3>
      <div class="seg" role="group" aria-label="Sexe"><button type="button" data-act="onb-sex" data-v="h" aria-pressed="true" id="sex-h">Homme</button><button type="button" data-act="onb-sex" data-v="f" aria-pressed="false" id="sex-f">Femme</button></div>
      <div class="fields">
        <label class="field" for="o-h">Taille (cm)<input id="o-h" type="number" inputmode="numeric" required min="120" max="230"></label>
        <label class="field" for="o-a">Âge<input id="o-a" type="number" inputmode="numeric" required min="14" max="99"></label>
        <label class="field" for="o-w">Poids ce matin (kg)<input id="o-w" type="number" inputmode="decimal" step="0.1" required min="35" max="250"></label>
        <label class="field" for="o-g">Objectif (kg)<input id="o-g" type="number" inputmode="decimal" step="0.1" required min="35" max="250"></label>
        <label class="field" for="o-d">Pour le<input id="o-d" type="date" required value="${addDays(today(), 56)}"></label>
      </div>
      <label class="row small" for="o-t"><input id="o-t" type="checkbox"> J'ai une blessure à surveiller (tendon, articulation)</label>
      <label class="field" for="o-c">Ce que Claude doit savoir sur toi (facultatif)<textarea id="o-c" placeholder="Ex. : on cuisine pour moi, souvent au beurre. Je ne pèse pas, sauf les pâtes. 3 séances de muscu par semaine."></textarea></label>
      <button class="btn hot" type="submit">C'est parti</button>
    </form>
    <div class="card"><h3>Tu as déjà des données ?</h3><p class="small muted">Tu as utilisé l'app dans Safari ? Touche « Copier mes données » là-bas, puis « Coller » ici. Depuis l'ancienne version claude.ai : onglet Plan, « Copier mes données ».</p><button class="btn sun" data-act="transfer-paste">📋 Coller mes données de Safari</button><div class="row"><button class="btn" data-act="import">Importer un fichier</button><button class="btn" data-act="cloud-restore">☁️ Restaurer ma sauvegarde en ligne</button></div></div>
  </div>`;
}

/* ---------- Onglet Jour ---------- */
function viewJour() {
  const d = UI.date, D = day(d), tgt = kcalTarget(), tot = dayTotals(d), p = S.profile;
  const isToday = d === today();
  const left = tgt - tot.kcal, over = left < -100;
  const walk = D.walk || 0, wg = walkGoal(d);
  const st = streakInfo();
  const mon = mondayOf(d);
  let h = "";
  let noBanner = false; try { noBanner = localStorage.getItem(LS + "-nobanner") === "1"; } catch (e) {}
  if (IOS && !STANDALONE && !noBanner) h += `<section class="blk b-sky"><span class="mono">Tu es dans Safari</span>
    <p class="small">Pour avoir l'app sur ton écran d'accueil <b>avec tes données</b> :</p>
    <ol class="rlist" style="margin:0"><li>Touche <b>Copier mes données</b> ci-dessous.</li><li>••• → Partager → <b>Sur l'écran d'accueil</b> → Ajouter.</li><li>Ouvre l'app depuis l'icône et touche <b>Coller mes données de Safari</b>.</li></ol>
    <div class="row"><button class="btn ink" data-act="transfer-copy">📋 Copier mes données</button><button class="btn small flat" data-act="transfer-hide">Masquer</button></div></section>`;
  h += `<section><div class="row between"><button class="round" data-act="week" data-v="-7" aria-label="Semaine précédente">‹</button><span class="mono muted">Semaine du ${fmtD(mon)}</span><button class="round" data-act="week" data-v="7" aria-label="Semaine suivante" ${addDays(mon, 7) > today() ? "disabled" : ""}>›</button></div>
    <div class="week">${Array.from({ length: 7 }, (_, i) => {
      const dd = addDays(mon, i), fut = dd > today(), has = hasFood(dd), cls = has ? dayLight(dayTotals(dd).kcal) : "";
      return `<button class="wd ${cls}" data-act="pickday" data-d="${dd}" aria-pressed="${dd === d}" ${fut ? "disabled" : ""} aria-label="${JOURS_L[parseD(dd).getDay()]} ${parseD(dd).getDate()}${has ? ", " + f0(dayTotals(dd).kcal) + " kilocalories" : ""}"><span class="l">${"LMMJVSD"[i]}</span><span class="n">${parseD(dd).getDate()}</span><span class="s ${sessionOn(dd) ? "on" : ""}"></span></button>`;
    }).join("")}</div></section>`;

  const segs = 20, used = Math.min(segs, Math.round(tot.kcal / tgt * segs)), extra = over ? Math.min(segs, Math.round((tot.kcal - tgt) / tgt * segs)) : 0;
  h += `<section class="blk ${over ? "b-pink" : "b-tomato"} hero-kcal">
    <div class="row between"><span class="mono">${left >= 0 ? "Calories restantes" : "Au-dessus de la cible"}</span><button class="btn small flat" data-act="how">Comment c'est calculé ?</button></div>
    <div class="big">${f0(Math.abs(left))}</div>
    <div class="segbar" aria-hidden="true">${Array.from({ length: segs }, (_, i) => `<i class="${i < used ? "on" : ""} ${over && i < extra ? "over" : ""}"></i>`).join("")}</div>
    <span class="small"><b>${f0(tot.kcal)}</b> mangées sur ${f0(tgt)} kcal${!hasFood(d) ? " · rien de noté" : ""}</span>
  </section>
  <section class="grid2">
    <div class="blk b-cobalt"><span class="mono">Protéines</span><div class="big" style="font-size:40px">${f0(tot.prot)}<span style="font-size:18px"> / ${p.prot} g</span></div><div class="meter"><i style="width:${Math.min(100, tot.prot / p.prot * 100)}%"></i></div></div>
    <div class="blk b-sun"><span class="mono">Marche, vélo</span><div class="big" style="font-size:40px">${walk}<span style="font-size:18px"> / ${wg} min</span></div>
      <div class="stepper" style="justify-self:start"><button data-act="walk" data-v="-5" aria-label="Moins 5 minutes">−</button><span class="v">${walk}′</span><button data-act="walk" data-v="5" aria-label="Plus 5 minutes">+</button></div></div>
  </section>
  <section class="card" style="gap:10px"><div class="row between"><b>👟 Pas du jour</b><button class="btn small" data-act="health-paste">⌚ Importer de Santé</button></div>
    <div class="row"><input type="number" inputmode="numeric" id="steps-in" data-steps="1" value="${D.steps != null ? D.steps : ""}" placeholder="Ex. 8 500" aria-label="Nombre de pas du jour" style="width:150px;font-family:var(--f-display);font-weight:800;font-size:22px"><span class="small muted">${D.activeKcal ? f0(D.activeKcal) + " kcal actives (pour info)" : "Écris-les, ou importe-les avec ton raccourci."}</span></div></section>`;

  h += `<section>
    <form class="quick" id="quick-form" autocomplete="off">
      <button type="button" class="round" data-act="voice" aria-label="Dicter">${ICON_MIC}</button>
      <input type="text" id="quick-in" enterkeyhint="send" placeholder="J'ai mangé…" aria-label="Écris ce que tu as mangé ou fait">
      <button class="round" type="submit" aria-label="Analyser" style="background:var(--tomato);color:var(--block-ink)">${ICON_SEND}</button>
    </form>
    <div class="row"><button class="btn small" data-act="add-meal">🍽️ Plats et liste</button><button class="btn small" data-act="add-photo">📷 Photo</button><button class="btn small" data-act="go" data-tab="recettes">🍳 Idées recettes</button>${st.n > 1 ? `<span class="tag t-blue">🔥 ${st.n} jours${st.jokerFree ? " · joker dispo" : ""}</span>` : ""}</div>
  </section>`;

  const tips = [], hr = new Date().getHours(), missP = p.prot - tot.prot;
  if (isToday && hr >= 14 && missP > 20 && hasFood(d)) {
    const shaker = activePowders().length > 0 && totalDoses(D) < 2, wp = activePowders().length ? activePowders()[0].prot : 23;
    const plan = missP <= 45 ? (shaker ? `Un shaker (${wp} g) et un skyr (15 g) font l'essentiel.` : "Un skyr (15 g) et une portion de thon ou de jambon (25 g) font l'essentiel.") : `Prévois une grosse portion de viande ou de poisson au prochain repas (40 à 50 g)${shaker ? `, un shaker (${wp} g)` : ""} et un skyr (15 g).`;
    tips.push(`<div class="blk b-lilac"><span class="mono">Protéines</span><p>Il te manque <b>${f0(missP)} g</b>. ${plan}</p></div>`);
  }
  const pt = painTrend();
  if (isToday && p.tendon && (D.pain >= 5 || (pt != null && pt >= 1.5))) {
    tips.push(`<div class="note"><b>Ta blessure :</b> ${D.pain >= 5 ? "douleur à " + D.pain + "/10 aujourd'hui" : "la douleur monte depuis quelques jours"}. Remplace la marche par du vélo léger ou du repos, saute les exercices qui font mal et parles-en à ton médecin. Consulte vite en cas de claquement, de gonflement ou si tu ne peux plus pousser sur le pied ou tendre le genou.</div>`);
  }
  const sl3 = avgSleep(3);
  if (isToday && sl3 != null && sl3 < 6.5) tips.push(`<div class="blk b-sky"><span class="mono">Sommeil</span><p>Tu dors <b>${fmtH(sl3)}</b> en moyenne ces dernières nuits. Sous 7 h, la faim monte et tu perds plus de muscle : vise un coucher 30 min plus tôt ce soir.</p></div>`);
  const nDays = Object.keys(S.days).length, lastExp = p.lastExport;
  if (isToday && nDays >= 5 && (!lastExp || diffDays(lastExp, today()) >= 7)) tips.push(`<div class="card" style="gap:8px"><b>💾 Pense à ta sauvegarde</b><span class="small muted">Tes données sont sur ce téléphone. ${lastExp ? "Dernière sauvegarde le " + fmtD(lastExp) + "." : "Tu n'as encore jamais fait de sauvegarde."} Un fichier par semaine suffit.</span><button class="btn small sun" data-act="export">Sauvegarder maintenant</button></div>`);
  const wd = new Date().getDay();
  if (isToday && (wd === 0 || wd === 1) && !UI.coach && Object.keys(S.days).length >= 4) tips.push(`<button class="blk b-mint" data-act="go-coach" style="text-align:left"><span class="mono">Dimanche, jour de bilan</span><b style="font-family:var(--f-display);font-size:20px">Faire le bilan de la semaine →</b></button>`);
  if (tips.length) h += `<section>${tips.join("")}</section>`;

  const sp = D.supp || {};
  h += `<section class="grid2">
    ${activePowders().map(w => `<div class="card" style="gap:8px"><div class="row between" style="flex-wrap:nowrap"><b style="min-width:0">💪 ${esc(w.n)}</b><span class="mono muted">${fkg(w.g)} g</span></div><span class="small muted">${fkg(w.kcal)} kcal · ${fkg(w.prot)} g prot.</span><div class="stepper" style="justify-self:start"><button data-act="whey" data-w="${w.id}" data-v="-1" aria-label="Retirer une dose de ${esc(w.n)}">−</button><span class="v">${dosesOf(D, w.id)}</span><button data-act="whey" data-w="${w.id}" data-v="1" aria-label="Ajouter une dose de ${esc(w.n)}">+</button></div></div>`).join("")}
    <div class="card" style="gap:8px"><div class="row between"><b>⚡ Créatine</b><span class="mono muted">${fkg(p.creaG)} g</span></div><span class="small muted">0 kcal, tous les jours</span><button class="toggle" data-act="crea" aria-pressed="${!!sp.crea}" aria-label="Créatine prise"></button></div>
  </section>`;
  const sl = sleepH(D), sv = D.sleep || {};
  h += `<section class="card" style="gap:10px"><div class="row between"><b>😴 Sommeil de la nuit</b><span class="tag ${sl == null ? "t-none" : sl >= 7 ? "t-ok" : sl >= 6 ? "t-warn" : "t-over"}">${sl == null ? "à noter" : fmtH(sl)}</span></div>
    <div class="grid2"><label class="field" for="sl-bed">Couché à<input type="time" id="sl-bed" data-sleep="bed" value="${esc(sv.bed || "")}"></label><label class="field" for="sl-wake">Levé à<input type="time" id="sl-wake" data-sleep="wake" value="${esc(sv.wake || "")}"></label></div></section>`;

  h += `<section><h2>Journal du jour</h2>`;
  for (const s of SLOTS) {
    const ms = D.meals.filter(m => m.slot === s.k), stt = itemTotals(ms.flatMap(m => m.items));
    h += `<div class="slot"><div class="slot-head ${s.col}"><b>${s.n}</b>${ms.length ? `<span class="tag t-${lightFor(stt.kcal / (tgt * s.share))}">${f0(stt.kcal)} kcal</span>` : `<span class="mono">≈ ${f0(tgt * s.share)} kcal</span>`}</div><div class="slot-body">`;
    for (const m of ms) h += `<button class="meal" data-act="edit-meal" data-id="${m.id}"><span class="sr">Modifier : </span>${m.items.map(it => `<div class="item"><span class="emo" aria-hidden="true">${emojiFor(it)}</span><span>${esc(it.n)}${it.d ? `<small>${esc(it.d)}</small>` : ""}</span><span class="k">${f0(it.kcal)}</span></div>`).join("")}${m.tip ? `<span class="small muted">💡 ${esc(m.tip)}</span>` : ""}</button>`;
    h += `<button class="addline" data-act="add-meal" data-slot="${s.k}">+ ${ms.length ? "Ajouter" : "Noter le " + s.n.toLowerCase()}</button></div></div>`;
  }
  h += `</section>`;

  const sess = sessionOn(d);
  h += `<section class="card">
    <div class="row between"><div><b>Séance</b><div class="small muted">${sess ? tplOf(sess.tpl).n + " faite" : "Pas de séance notée ce jour-là"}</div></div>${sess ? `<span class="tag t-ok">✓ Faite</span>` : isToday ? `<button class="btn small sun" data-act="go-corps">Commencer</button>` : ""}</div>
    ${p.tendon ? `<div role="group" aria-labelledby="pain-l"><b id="pain-l">Douleur à la blessure</b><div class="small muted" style="margin-bottom:8px">0 = rien, 10 = insupportable. Note-la le matin.</div><div class="pain">${Array.from({ length: 11 }, (_, i) => `<button data-act="pain" data-v="${i}" aria-pressed="${D.pain === i}" aria-label="Douleur ${i} sur 10">${i}</button>`).join("")}</div></div>` : ""}
    ${D.kg ? `<div class="small muted">Pesée : <b>${f1(D.kg)} kg</b></div>` : isToday ? `<div class="row between"><span class="small muted">Pas encore pesé aujourd'hui</span><button class="btn small" data-act="go-weigh">Me peser</button></div>` : ""}
  </section>`;
  return h;
}

/* ---------- Onglet Journal ---------- */
function viewJournal() {
  const [y, m] = UI.month.split("-").map(Number);
  const nDays = new Date(y, m, 0).getDate(), lead = (parseD(UI.month + "-01").getDay() + 6) % 7;
  const days = Array.from({ length: nDays }, (_, i) => UI.month + "-" + String(i + 1).padStart(2, "0"));
  const logged = days.filter(hasFood);
  const inT = logged.filter(d => dayLight(dayTotals(d).kcal) === "ok").length;
  const avgK = logged.length ? logged.reduce((a, d) => a + dayTotals(d).kcal, 0) / logged.length : 0;
  const sess = days.filter(d => sessionOn(d)).length;
  let h = `<section><div class="row between"><button class="round" data-act="month" data-v="-1" aria-label="Mois précédent">‹</button><h2>${cap(MOIS_L[m - 1])} ${y}</h2><button class="round" data-act="month" data-v="1" aria-label="Mois suivant" ${UI.month < today().slice(0, 7) ? "" : "disabled"}>›</button></div>
    <div class="stats">
      <div class="blk b-mint stat"><span class="mono">Dans la cible</span><span class="big">${inT}<span style="font-size:18px"> / ${logged.length}</span></span></div>
      <div class="blk b-sun stat"><span class="mono">Moyenne</span><span class="big">${logged.length ? f0(avgK) : "—"}</span><span class="small">kcal par jour noté</span></div>
      <div class="blk b-lilac stat"><span class="mono">Séances</span><span class="big">${sess}</span></div>
      <div class="blk b-sky stat"><span class="mono">Marche</span><span class="big">${f1(days.reduce((a, d) => a + (day(d).walk || 0), 0) / 60)}<span style="font-size:18px"> h</span></span></div>
    </div>
    <div class="card"><div class="cal">${["L", "M", "M", "J", "V", "S", "D"].map(x => `<span class="dow" aria-hidden="true">${x}</span>`).join("")}${Array.from({ length: lead }, () => `<span class="cell out"></span>`).join("")}
      ${days.map(d => {
        const has = hasFood(d), t = dayTotals(d), D = day(d);
        const mk = (sessionOn(d) ? "<i></i>" : "") + ((D.walk || 0) >= walkGoal(d) ? "<i></i>" : "") + (D.kg ? "<i></i>" : "");
        return `<button class="cell ${has ? dayLight(t.kcal) : ""} ${d === today() ? "today" : ""}" data-act="openday" data-d="${d}" ${d > today() ? "disabled" : ""} aria-label="${parseD(d).getDate()} ${MOIS_L[m - 1]}${has ? ", " + f0(t.kcal) + " kilocalories" : ""}"><span class="dn">${parseD(d).getDate()}</span><span class="dk">${has ? f0(t.kcal) : ""}</span><span class="mk">${mk}</span></button>`;
      }).join("")}</div>
      <div class="row small muted" style="gap:14px"><span><span class="tag t-ok">vert</span> dans la cible</span><span><span class="tag t-warn">jaune</span> un peu au-dessus</span><span><span class="tag t-over">rose</span> bien au-dessus</span><span>● séance, marche, pesée</span></div>
    </div></section>`;
  const list = logged.slice().reverse();
  h += `<section><h2>Tes journées</h2>${list.length ? list.map(d => {
    const t = dayTotals(d), D = day(d), s = sessionOn(d);
    return `<button class="card dcard" data-act="openday" data-d="${d}">
      <div class="row between"><b style="font-family:var(--f-display);font-size:20px">${cap(JOURS_L[parseD(d).getDay()])} ${parseD(d).getDate()}</b><span class="tag t-${dayLight(t.kcal)}">${f0(t.kcal)} kcal</span></div>
      <div class="emrow" aria-hidden="true">${D.meals.flatMap(mm => mm.items).map(emojiFor).slice(0, 10).join("") || "💪"}</div>
      <span class="small muted">${f0(t.prot)} g prot.${s ? " · " + tplOf(s.tpl).n : ""}${D.walk ? " · " + D.walk + " min de marche" : ""}${D.steps ? " · " + f0(D.steps) + " pas" : ""}${D.kg ? " · " + f1(D.kg) + " kg" : ""}</span>
    </button>`;
  }).join("") : `<div class="empty">Chaque jour où tu notes un repas apparaîtra ici, avec sa couleur, ce que tu as mangé et ta séance.</div>`}</section>`;
  return h;
}

/* ---------- Corps anatomique ---------- */
const HEAT = ["#4A4060", "var(--h1)", "var(--h2)", "var(--h3)", "var(--h4)"];
const heatIdx = v => v <= 0 ? 0 : v < 4 ? 1 : v < 8 ? 2 : v < 15 ? 3 : 4;
const regionVal = (r, vals) => Math.max(...REGIONS[r].g.map(g => vals[g] || 0));
function figSVG(side, vals, ctx) {
  const parts = ANATOMY[side];
  const angles = new Set();
  Object.values(REGIONS).forEach(r => { angles.add(r.a); angles.add(-r.a); });
  // Fibres : trois traits d'épaisseur et d'opacité différentes par motif, pour un rendu organique ; modelé : dégradé clair au centre, sombre sur les bords
  const defs = [...angles].map(a => `<pattern id="${ctx}-${side}-f${a < 0 ? "m" + -a : a}" width="7" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(${a})"><line x1="1" y1="0" x2="1" y2="40" stroke="#000" stroke-opacity=".3" stroke-width="1.5"/><line x1="3.6" y1="0" x2="3.6" y2="40" stroke="#000" stroke-opacity=".12" stroke-width=".9"/><line x1="5.6" y1="0" x2="5.6" y2="40" stroke="#000" stroke-opacity=".22" stroke-width="1.1"/><line x1="3.6" y1="14" x2="3.6" y2="22" stroke="#fff" stroke-opacity=".18" stroke-width=".9"/></pattern>`).join("") +
    `<radialGradient id="${ctx}-${side}-sh" cx="42%" cy="34%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>`;
  const sh = `url(#${ctx}-${side}-sh)`;
  const byRegion = {}, neutral = [];
  parts.forEach(([r, s, d]) => { if (r && REGIONS[r]) (byRegion[r] = byRegion[r] || []).push([s, d]); else neutral.push(d); });
  let g = `<g stroke="#0B0910" stroke-width="3">${neutral.map(d => `<path d="${d}" fill="#2E2740"/><path d="${d}" fill="${sh}" stroke="none"/>`).join("")}</g>`;
  for (const [r, list] of Object.entries(byRegion)) {
    const v = regionVal(r, vals), sel = UI.region === r, a = REGIONS[r].a;
    const label = REGIONS[r].g.map(x => GROUPS[x]).join(" et ");
    g += `<g class="mu ${sel ? "sel" : ""}" id="mu-${ctx}-${r}" data-act="region" data-r="${r}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${label}, ${fkg(v)} séries">` +
      list.map(([s, d]) => { const ang = s === "r" ? -a : a; return `<path d="${d}" fill="${HEAT[heatIdx(v)]}" stroke="#0B0910" stroke-width="3"/><path d="${d}" fill="url(#${ctx}-${side}-f${ang < 0 ? "m" + -ang : ang})" pointer-events="none"/><path d="${d}" fill="${sh}" pointer-events="none"/>`; }).join("") + `</g>`;
  }
  return `<div class="fig"><svg viewBox="${side === "front" ? "40 70 644 1300" : "764 70 644 1300"}"><defs>${defs}</defs>${g}</svg><span>${side === "front" ? "FACE" : "DOS"}</span></div>`;
}
function bodyStage(vals, ctx, title) {
  return `<div class="stage">${title ? `<div class="row between" style="padding:0 6px"><b style="font-family:var(--f-display);font-size:20px">${title}</b><span class="mono" style="color:#A79FBC">séries / 7 j</span></div>` : ""}
    <div class="figs">${figSVG("front", vals, ctx)}${figSVG("back", vals, ctx)}</div>
    <div class="heat" aria-hidden="true">${["0", "1-3", "4-7", "8-14", "15+"].map((l, i) => `<span><i style="background:${HEAT[i]}"></i>${l}</span>`).join("")}</div>
    ${regionDetail(vals, ctx)}</div>`;
}
function regionDetail(vals, ctx) {
  const r = UI.region;
  if (!r || !REGIONS[r]) return `<p class="small" style="text-align:center;color:#A79FBC">Touche un muscle pour savoir à quoi il sert et ce qui le travaille.</p>`;
  const inProg = Object.values(program()).flat();
  return `<div class="mdetail">${REGIONS[r].g.map(g => {
    const v = vals[g] || 0;
    const tag = ctx === "week" ? (v === 0 ? `<span class="tag t-none">Pas travaillé</span>` : v < 8 ? `<span class="tag t-warn">${fkg(v)} séries · vise 8</span>` : v <= 15 ? `<span class="tag t-ok">${fkg(v)} séries · bonne zone</span>` : `<span class="tag t-blue">${fkg(v)} séries · largement</span>`) : `<span class="tag ${v ? "t-blue" : "t-none"}">${v ? fkg(v) + " séries aujourd'hui" : "Pas aujourd'hui"}</span>`;
    const rows = [];
    TPLS.forEach(t => program()[t.k].forEach(id => { const ex = XM()[id]; if (!ex) return; if (ex.pri.includes(g)) rows.push([ex.n, "principal", t.n, 0]); else if (ex.sec.includes(g)) rows.push([ex.n, "en aide", t.n, 1]); }));
    rows.sort((a, b) => a[3] - b[3]);
    const add = Object.keys(XM()).filter(k => !inProg.includes(k) && XM()[k].pri.includes(g)).slice(0, 2);
    return `<div style="display:grid;gap:6px"><div class="row between"><b style="font-family:var(--f-display);font-size:19px">${GROUPS[g]}</b>${tag}</div><p class="small">${esc(GDESC[g])}</p>
      ${rows.length ? `<div class="exl">${rows.map(x => `<div><span>${esc(x[0])}</span><span class="muted">${x[1]} · ${esc(x[2].split(" ")[0])}</span></div>`).join("")}</div>` : `<p class="small muted">Aucun exercice de ton programme ne le travaille directement.</p>`}
      ${add.length ? `<p class="small muted">Pour le cibler : ${add.map(k => esc(XM()[k].n)).join(", ")}.</p>` : ""}</div>`;
  }).join(`<hr style="border:0;border-top:2px solid var(--soft);margin:4px 0">`)}</div>`;
}
const emptyVol = () => Object.fromEntries(Object.keys(GROUPS).map(g => [g, 0]));
function addVolume(vol, exList, onlyDone) {
  exList.forEach(e => {
    const n = onlyDone ? e.sets.filter(isDone).length : e.sets.length, ex = XM()[e.id];
    if (!ex || !n) return;
    ex.pri.forEach(g => vol[g] += n); ex.sec.forEach(g => vol[g] += n * 0.5);
  });
  return vol;
}
function weekVolume() { const from = addDays(today(), -6), vol = emptyVol(); sessionsSorted().filter(s => s.done && s.date >= from).forEach(s => addVolume(vol, s.ex || [], true)); return vol; }

/* ---------- Onglet Corps (séances) ---------- */
function historyFor(exId, excludeId, max) {
  const out = [];
  for (const s of sessionsSorted()) {
    if (s.id === excludeId || !s.done) continue;
    const e = (s.ex || []).find(x => x.id === exId);
    if (e && e.sets.some(isDone)) out.push({ date: s.date, sets: e.sets.filter(isDone) });
    if (out.length >= (max || 5)) break;
  }
  return out;
}
const e1rm = st => (+st.kg || 0) * (1 + (+st.reps || 0) / 30);
const isDone = st => +st.reps > 0 && (st.ok === undefined || st.ok === true);
function bestE1RM(exId, excludeId) { let b = 0; historyFor(exId, excludeId, 999).forEach(h => h.sets.forEach(st => { b = Math.max(b, e1rm(st)); })); return b; }
function targetFor(exId, excludeId) {
  const ex = XM()[exId], last = historyFor(exId, excludeId, 1)[0];
  const first = ex.start ? { kg: ex.start, reps: ex.rr[0], msg: "Ta charge habituelle. Vise " + ex.rr[0] + " à " + ex.rr[1] + " reps." } : { kg: "", reps: ex.rr[0], msg: "Première fois : prends une charge qui te permet " + ex.rr[0] + " à " + ex.rr[1] + " reps propres." };
  if (!last || last.sets.every(s => s.kg === "" || s.kg == null)) return first;
  const kg = Math.max(...last.sets.map(s => +s.kg || 0)), atKg = last.sets.filter(s => (+s.kg || 0) === kg);
  if (atKg.length >= 3 && atKg.every(s => +s.reps >= ex.rr[1])) return { kg: kg + ex.inc, reps: ex.rr[0], msg: "Tu as fait " + ex.rr[1] + " reps partout la dernière fois : on monte de " + fkg(ex.inc) + " kg." };
  return { kg, reps: Math.min(ex.rr[1], Math.min(...atKg.map(s => +s.reps)) + 1), msg: "Même charge, une rep de plus. À " + ex.rr[1] + " reps sur les 3 séries, tu montes. En sèche, tenir tes charges est déjà une réussite." };
}
function nextTpl() { const done = sessionsSorted().filter(s => s.done); if (!done.length) return "dos"; const i = TPLS.findIndex(t => t.k === done[0].tpl); return TPLS[(i + 1) % TPLS.length].k; }
function startSession(tpl) {
  const id = uid();
  const ex = program()[tpl].map(exId => {
    const last = historyFor(exId, id, 1)[0], e = XM()[exId] || {};
    const n = Math.max(3, last ? last.sets.length : 3);
    const kgAt = i => last ? last.sets[Math.min(i, last.sets.length - 1)].kg : (e.start != null ? e.start : "");
    return { id: exId, sets: Array.from({ length: n }, (_, i) => ({ kg: kgAt(i), reps: "", ok: false })) };
  });
  S.sessions[id] = { date: today(), t: new Date().toTimeString().slice(0, 5), tpl, done: false, tapis: false, abdos: false, ex };
  UI.activeSession = id; UI.noResume = false; UI.region = null;
  save(); render(); window.scrollTo(0, 0);
}
const openSession = () => sessionsSorted().find(s => !s.done);
function viewCorps() {
  if (UI.activeSession && S.sessions[UI.activeSession]) return viewActiveSession(UI.activeSession);
  const pending = openSession();
  if (pending && !UI.noResume && pending.date === today()) { UI.activeSession = pending.id; return viewActiveSession(pending.id); }
  const nx = nextTpl(), lastBy = {};
  sessionsSorted().filter(s => s.done).forEach(s => { if (!lastBy[s.tpl]) lastBy[s.tpl] = s.date; });
  const vol = weekVolume();
  let h = "";
  if (pending) h += `<section class="blk b-sun"><div class="row between"><div><b style="font-family:var(--f-display);font-size:20px">${tplOf(pending.tpl).n}</b><br><span class="small">${pending.date === today() ? "En pause depuis " + (pending.t || "ce matin") : "Pas terminée, du " + fmtD(pending.date, true) + " : reprends-la pour la terminer"}</span></div><button class="btn ink" data-act="open-sess" data-id="${pending.id}">Reprendre</button></div></section>`;
  if (conva()) h += `<div class="note">Mode convalescence : reprends la muscu seulement avec l'accord de ton chirurgien, en commençant par le haut du corps.</div>`;
  h += `<section>${bodyStage(vol, "week", "Ta semaine")}</section>`;
  const low = Object.entries(vol).filter(([g, v]) => v > 0 && v < 8 && g !== "abs").map(([g]) => GROUPS[g].toLowerCase());
  if (low.length) h += `<p class="small muted">Chaque muscle n'est travaillé qu'une fois par semaine avec ta rotation. Sous 8 séries (${esc(low.slice(0, 4).join(", "))}), ajoute une 4e série sur le premier exercice du muscle.</p>`;
  h += `<section><h2>Séance du jour</h2><div class="tpls">${TPLS.map(t => `<button class="blk ${t.col} tpl" data-act="start" data-k="${t.k}"><div class="row between"><b>${t.n}</b>${t.k === nx ? `<span class="tag" style="background:#fff">Conseillée</span>` : ""}</div><span class="small">${t.d}</span><span class="mono">${lastBy[t.k] ? "Dernière : " + fmtD(lastBy[t.k], true) : "Pas encore faite"}</span></button>`).join("")}</div></section>`;
  h += `<section><div class="row between"><h2>Ton programme</h2><button class="btn small ${UI.editProgram ? "sun" : ""}" data-act="edit-prog">${UI.editProgram ? "Terminé" : "Modifier"}</button></div>
    ${UI.editProgram ? `<p class="small muted">Change l'ordre, retire, ajoute ou crée tes exercices. Touche ✎ pour modifier un exercice : nom, muscles, répétitions.</p>` : ""}`;
  for (const t of TPLS) {
    const list = program()[t.k];
    h += `<div class="card">${UI.editProgram ? `<label class="field" for="tpl-${t.k}">Nom de la séance<input type="text" id="tpl-${t.k}" data-tplname="${t.k}" value="${esc(t.n)}"></label>` : `<b style="font-family:var(--f-display);font-size:19px">${esc(t.n)}</b>`}
      ${list.map((exId, i) => { const ex = XM()[exId]; if (!ex) return ""; const dk = demoKey(exId); return `<div class="row between" style="flex-wrap:nowrap;align-items:flex-start">${dk ? `<button class="thumb" data-act="demo" data-id="${exId}" aria-label="Voir le mouvement : ${esc(ex.n)}"><img src="img/ex/${dk}-1.jpg" alt="" loading="lazy"><span aria-hidden="true">▶</span></button>` : ""}<div style="min-width:0;flex:1;display:grid;gap:4px"><span>${esc(ex.n)}${S.profile.customEx && S.profile.customEx[exId] ? ` <span class="tag t-blue">perso</span>` : ""}</span><div class="mus">${ex.pri.map(g => `<span>${GROUPS[g]}</span>`).join("")}${ex.sec.map(g => `<span class="sec">${GROUPS[g]}</span>`).join("")}</div></div>
        <div class="row" style="gap:4px;flex-wrap:nowrap">${UI.editProgram ? `<button class="round" style="width:36px;height:36px;box-shadow:none" data-act="mv" data-t="${t.k}" data-i="${i}" data-v="-1" aria-label="Monter ${esc(ex.n)}" ${i === 0 ? "disabled" : ""}>↑</button><button class="round" style="width:36px;height:36px;box-shadow:none" data-act="mv" data-t="${t.k}" data-i="${i}" data-v="1" aria-label="Descendre ${esc(ex.n)}" ${i === list.length - 1 ? "disabled" : ""}>↓</button>` : ""}<button class="round" style="width:36px;height:36px;box-shadow:none" data-act="ex-edit" data-id="${exId}" data-t="${t.k}" aria-label="Modifier ${esc(ex.n)}">✎</button></div></div>`; }).join("")}
      ${UI.editProgram ? `<label class="field" for="add-${t.k}">Ajouter un exercice existant<select id="add-${t.k}" data-addex="${t.k}"><option value="">Choisir…</option>${Object.entries(XM()).filter(([k]) => !list.includes(k)).map(([k, e]) => `<option value="${k}">${esc(e.n)}${e.sugg ? " (suggéré)" : ""}</option>`).join("")}</select></label>
      <button class="btn small sun" data-act="ex-new" data-t="${t.k}">+ Créer un exercice</button>` : ""}</div>`;
  }
  const inProg = Object.values(program()).flat();
  const sk = !inProg.includes("tirage_vertical") && !inProg.includes("tirage_uni_assis") ? "tirage_vertical" : Object.keys(XM()).find(k => XM()[k].sugg && !inProg.includes(k));
  if (sk) h += `<div class="note info"><b>Mon conseil :</b> ${esc(XM()[sk].sugg)}</div>`;
  h += `</section>`;
  const done = sessionsSorted().filter(s => s.done).slice(0, 8);
  h += `<section><h2>Historique</h2>${done.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Séance</th><th>Séries</th><th>Records</th><th>Tonnage</th><th></th></tr></thead><tbody>${done.map(s => {
    const sets = (s.ex || []).flatMap(e => e.sets.filter(isDone)), ton = sets.reduce((a, x) => a + (+x.kg || 0) * (+x.reps || 0), 0), prs = sets.filter(x => x.pr).length;
    return `<tr><td>${fmtD(s.date, true)}</td><td>${tplOf(s.tpl).n || ""}</td><td>${sets.length}</td><td>${prs ? "🏅 " + prs : "—"}</td><td>${f0(ton)} kg</td><td><button class="btn small flat" data-act="open-sess" data-id="${s.id}">Voir</button></td></tr>`;
  }).join("")}</tbody></table></div>` : `<div class="empty">Tes séances terminées apparaîtront ici, avec le tonnage soulevé et tes records.</div>`}</section>`;
  return h;
}
function viewActiveSession(id) {
  const s = S.sessions[id], tpl = tplOf(s.tpl);
  let h = `<section class="blk ${tpl.col}"><div class="row between"><div><span class="mono">${s.done ? "Séance du " + fmtD(s.date, true) : "En cours"}</span><h2>${tpl.n}</h2></div><button class="btn small" data-act="leave-sess">${s.done ? "Retour" : "Pause"}</button></div></section>
    <section>${bodyStage(addVolume(emptyVol(), s.ex, false), "sess", "Muscles du jour")}</section>`;
  s.ex.forEach((e, ei) => {
    const ex = XM()[e.id]; if (!ex) return;
    const hist = historyFor(e.id, id), prev = hist[0], best = bestE1RM(e.id, id);
    const topReached = prev && prev.sets.length && prev.sets.every(x => +x.reps >= ex.rr[1]);
    h += `<article class="card">
      <div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><div style="min-width:0"><h3>${esc(ex.n)}</h3><span class="small muted"><i>${esc(ex.alias)}</i></span></div><button class="round" style="width:36px;height:36px;box-shadow:none" data-act="ex-edit" data-id="${e.id}" data-t="${s.tpl}" aria-label="Modifier ${esc(ex.n)}">✎</button></div>
      <div class="mus">${ex.pri.map(g => `<span>${GROUPS[g]}</span>`).join("")}${ex.sec.map(g => `<span class="sec">${GROUPS[g]}</span>`).join("")}</div>
      ${demoKey(e.id) ? `<details class="learn"><summary>▶ Voir le mouvement</summary>${demoHTML(demoKey(e.id), ex.n)}</details>` : ""}
      ${prev ? `<div class="target"><span class="mono muted">Séance précédente · ${fmtD(prev.date, true)}</span><br><b>${prev.sets.map(x => fkg(x.kg) + " × " + x.reps).join("   ·   ")}</b>${topReached && !s.done ? `<br><span class="small">Tu avais fait ${ex.rr[1]} reps ou plus sur toutes les séries.</span>` : ""}</div>` : s.done ? "" : `<div class="target small">Première fois ici : note ta charge et tes reps, elles serviront de repère la prochaine fois.</div>`}
      ${ex.tendon && S.profile.tendon ? `<div class="note small">Blessure : reste sous 3/10 de douleur pendant l'exercice, et celle du lendemain matin ne doit pas monter d'une semaine à l'autre. Les jambes se font avec l'accord de ton chirurgien.</div>` : ""}
      <div class="sethead mono muted" aria-hidden="true"><span>#</span><span>kg</span><span>reps</span><span>avant</span><span></span></div>
      ${e.sets.map((st, si) => { const pv = prev ? prev.sets[si] : null; return `<div class="set"><span class="n">${si + 1}</span>
        <input type="number" inputmode="decimal" step="0.25" id="kg-${ei}-${si}" data-ei="${ei}" data-si="${si}" data-field="kg" value="${st.kg === "" || st.kg == null ? "" : st.kg}" aria-label="${esc(ex.n)}, charge série ${si + 1}">
        <input type="number" inputmode="numeric" id="rp-${ei}-${si}" data-ei="${ei}" data-si="${si}" data-field="reps" value="${st.reps}" placeholder="${pv ? pv.reps : ""}" aria-label="${esc(ex.n)}, répétitions série ${si + 1}">
        <span class="pv">${pv ? fkg(pv.kg) + "×" + pv.reps : "—"}</span>
        <button class="ok ${st.pr && isDone(st) ? "pr" : isDone(st) ? "done" : ""}" data-act="set-ok" data-ei="${ei}" data-si="${si}" aria-label="Série ${si + 1} faite">${st.pr ? "🏅" : "✓"}</button></div>`; }).join("")}
      <div class="row between"><button class="btn small flat" data-act="add-set" data-ei="${ei}">+ Série</button>${best ? `<span class="small muted">Record : ${f1(best)} kg (max estimé)</span>` : ""}</div>
      <details class="learn"><summary>Comprendre l'exercice</summary><p><b>Muscles :</b> ${esc(ex.mus)}</p><p>${esc(ex.why)}</p><p><b>Placement :</b> ${esc(ex.cue)}</p>${hist.length ? `<div class="hist"><b>Dernières fois</b>${hist.map(hh => `<span>${fmtD(hh.date)} · ${hh.sets.map(x => fkg(x.kg) + "×" + x.reps).join(", ")}</span>`).join("")}</div>` : ""}</details>
    </article>`;
  });
  h += `<section class="card"><b>Fin de séance</b>
    <label class="row" for="tapis"><input type="checkbox" id="tapis" data-flag="tapis" ${s.tapis ? "checked" : ""}> 10 min de marche sur tapis ou de vélo</label>
    ${s.tpl === "jambes" ? `<label class="row" for="abdos"><input type="checkbox" id="abdos" data-flag="abdos" ${s.abdos ? "checked" : ""}> Circuit abdos (5 à 10 min)</label>` : ""}
    <div class="row">${s.done ? `<button class="btn" data-act="del-sess">Supprimer la séance</button>` : `<button class="btn hot" data-act="finish">Terminer la séance</button><button class="btn" data-act="del-sess">Annuler</button>`}</div></section>`;
  return h;
}

/* ---------- Progression par exercice ---------- */
function exSeries(id) {
  return sessionsSorted().filter(x => x.done).slice().reverse().map(x => {
    const e = (x.ex || []).find(y => y.id === id); if (!e) return null;
    const sets = e.sets.filter(isDone); if (!sets.length) return null;
    return { date: x.date, sid: x.id, sets, top: Math.max(...sets.map(y => +y.kg || 0)), best: Math.max(...sets.map(e1rm)), vol: sets.reduce((acc, y) => acc + (+y.kg || 0) * (+y.reps || 0), 0), reps: sets.reduce((acc, y) => acc + (+y.reps || 0), 0) };
  }).filter(Boolean);
}
function sparkSVG(vals) {
  const W = 110, H = 34, P = 4;
  if (vals.length < 2) return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><circle cx="${W / 2}" cy="${H / 2}" r="4" fill="var(--sun)" stroke="var(--edge)" stroke-width="1.5"/></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => [P + i * (W - 2 * P) / (vals.length - 1), H - P - (v - lo) / r * (H - 2 * P)]);
  const last = pts[pts.length - 1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--sun)" stroke="var(--edge)" stroke-width="1.5"/></svg>`;
}
function deltaTag(d, unit) { if (!d) return `<span class="tag t-none">=</span>`; return `<span class="tag ${d > 0 ? "t-ok" : "t-warn"}">${d > 0 ? "+" : "−"}${fkg(Math.abs(d))}${unit}</span>`; }
function exercisesDashboard() {
  const ids = [...new Set([...Object.values(program()).flat(), ...sessionsSorted().filter(x => x.done).flatMap(x => (x.ex || []).map(e => e.id))])];
  const cards = ids.map(id => ({ id, ex: XM()[id], ser: exSeries(id) })).filter(o => o.ex && o.ser.length);
  return `<section><h2>Tes exercices</h2>${cards.length ? `<p class="small muted">La courbe suit ton max estimé (charge et reps combinées). Touche un exercice pour voir tout son historique.</p>` + cards.map(({ id, ex, ser }) => {
    const first = ser[0], last = ser[ser.length - 1], ls = last.sets.reduce((b, y) => e1rm(y) > e1rm(b) ? y : b, last.sets[0]);
    return `<button class="card" data-act="exstats" data-id="${id}" style="text-align:left;grid-template-columns:1fr auto;align-items:center;gap:6px 12px">
      <div style="display:grid;gap:4px;min-width:0"><b>${esc(ex.n)}</b><span class="small muted">Dernière : ${fkg(ls.kg)} kg × ${ls.reps} · ${fmtD(last.date)}</span>
      <div class="row" style="gap:5px"><span class="tag t-none">${ser.length} séance${ser.length > 1 ? "s" : ""}</span>${ser.length > 1 ? deltaTag(last.top - first.top, " kg") : ""}</div></div>${sparkSVG(ser.map(x => x.best))}</button>`;
  }).join("") : `<div class="empty">Termine ta première séance : chaque exercice aura ici sa courbe de progression.</div>`}</section>`;
}
function exChart(ser) {
  const W = Math.min(480, Math.max(280, (view.clientWidth || 360) - 40)), H = Math.round(W * 0.55), L = 34, R = 10, T = 12, B = 24;
  const vals = ser.flatMap(x => [x.top, x.best]), lo = Math.floor(Math.min(...vals) * 0.95), hi = Math.ceil(Math.max(...vals) * 1.05) || 1;
  const n = ser.length, x = i => n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1), y = v => T + (hi - v) / (hi - lo || 1) * (H - T - B);
  let g = "";
  const step = Math.max(1, Math.round((hi - lo) / 4));
  for (let v = lo; v <= hi; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--soft)" stroke-width="1.5"/><text x="${L - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const every = Math.max(1, Math.ceil(n / 5));
  ser.forEach((s2, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="${n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle"}">${fmtD(s2.date)}</text>`; });
  if (n > 1) {
    g += `<polyline points="${ser.map((s2, i) => x(i) + "," + y(s2.best)).join(" ")}" fill="none" stroke="var(--cobalt)" stroke-width="2" stroke-dasharray="5 4"/>`;
    g += `<polyline points="${ser.map((s2, i) => x(i) + "," + y(s2.top)).join(" ")}" fill="none" stroke="var(--text)" stroke-width="3" stroke-linejoin="round"/>`;
  }
  g += ser.map((s2, i) => `<circle cx="${x(i)}" cy="${y(s2.top)}" r="5" fill="var(--sun)" stroke="var(--edge)" stroke-width="2"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de la charge par séance">${g}</svg>`;
}
function openExStats(id) {
  const ex = XM()[id], ser = exSeries(id);
  if (!ex || !ser.length) return;
  const first = ser[0], last = ser[ser.length - 1];
  const recordKg = Math.max(...ser.map(x => x.top)), recordBest = Math.max(...ser.map(x => x.best));
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: esc(ex.n), id: "exs-title", enter: true, body: `
    <div class="stats">
      <div class="blk b-sun stat"><span class="mono">Charge max</span><span class="big" style="font-size:30px">${fkg(recordKg)} kg</span></div>
      <div class="blk b-cobalt stat"><span class="mono">Max estimé</span><span class="big" style="font-size:30px">${f1(recordBest)} kg</span></div>
      <div class="blk b-mint stat"><span class="mono">Depuis le début</span><span class="big" style="font-size:30px">${last.top - first.top >= 0 ? "+" : "−"}${fkg(Math.abs(last.top - first.top))} kg</span></div>
      <div class="blk b-lilac stat"><span class="mono">Séances</span><span class="big" style="font-size:30px">${ser.length}</span></div>
    </div>
    <div class="card">${exChart(ser)}<div class="row small muted" style="gap:12px"><span>● charge la plus lourde</span><span style="color:var(--cobalt)">- - max estimé</span></div></div>
    <h3>Historique</h3>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Séries</th><th>Volume</th></tr></thead><tbody>${ser.slice().reverse().map(x => `<tr><td>${fmtD(x.date, true)}</td><td style="text-align:left;white-space:normal">${x.sets.map(y => `${fkg(y.kg)}×${y.reps}${y.pr ? " 🏅" : ""}`).join(", ")}</td><td>${f0(x.vol)} kg</td></tr>`).join("")}</tbody></table></div>
    <p class="small muted">Le max estimé combine charge et répétitions (formule d'Epley) : il monte aussi quand tu fais plus de reps à la même charge.</p>`,
    foot: `<span></span><button class="btn hot" data-act="close-sheet">Fermer</button>` });
  $("sheet-close").focus();
}
function openSessionSummary(id) {
  const s = S.sessions[id]; if (!s) return;
  fresh();
  const tpl = tplOf(s.tpl);
  const prevSess = sessionsSorted().find(x => x.done && x.tpl === s.tpl && x.id !== id && (x.date + (x.t || "")) < (s.date + (s.t || "")));
  const ton = x => (x.ex || []).flatMap(e => e.sets.filter(isDone)).reduce((a, y) => a + (+y.kg || 0) * (+y.reps || 0), 0);
  const all = s.ex.flatMap(e => e.sets.filter(isDone)), prs = all.filter(y => y.pr).length;
  const rows = s.ex.map(e => {
    const ex = XM()[e.id], sets = e.sets.filter(isDone);
    if (!ex || !sets.length) return "";
    const prev = historyFor(e.id, id, 1)[0];
    const top = Math.max(...sets.map(y => +y.kg || 0)), reps = sets.reduce((a, y) => a + (+y.reps || 0), 0);
    let tag = `<span class="tag t-blue">Première fois</span>`;
    if (prev) {
      const pTop = Math.max(...prev.sets.map(y => +y.kg || 0)), pReps = prev.sets.reduce((a, y) => a + (+y.reps || 0), 0);
      tag = top !== pTop ? deltaTag(top - pTop, " kg") : deltaTag(reps - pReps, " rep" + (Math.abs(reps - pReps) > 1 ? "s" : ""));
    }
    return `<div class="row between" style="flex-wrap:nowrap;align-items:flex-start;gap:10px"><div style="min-width:0"><b>${esc(ex.n)}</b><div class="small muted">${sets.map(y => `${fkg(y.kg)}×${y.reps}${y.pr ? " 🏅" : ""}`).join(", ")}</div></div>${tag}</div>`;
  }).join("");
  const t1 = ton(s), t0 = prevSess ? ton(prevSess) : null;
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: "Séance terminée 💪", id: "sum-title", enter: true, body: `
    <div class="blk ${tpl.col}"><span class="mono">${esc(tpl.n)} · ${fmtD(s.date, true)}</span>
      <div class="row" style="gap:16px"><div><span class="big" style="font-size:40px">${all.length}</span><br><span class="small">séries</span></div><div><span class="big" style="font-size:40px">${f0(t1)}</span><br><span class="small">kg soulevés</span></div>${prs ? `<div><span class="big" style="font-size:40px">${prs}</span><br><span class="small">record${prs > 1 ? "s" : ""} 🏅</span></div>` : ""}</div>
      ${t0 != null ? `<span class="small">${t1 >= t0 ? "+" : "−"}${f0(Math.abs(t1 - t0))} kg de volume par rapport à ta dernière séance ${esc(tpl.n.toLowerCase())}.</span>` : `<span class="small">Première séance enregistrée de ce type : c'est ta référence.</span>`}</div>
    <h3>Par rapport à la dernière fois</h3>
    <div class="card" style="gap:12px">${rows || `<span class="small muted">Aucune série notée.</span>`}</div>
    <p class="small muted">Retrouve la courbe de chaque exercice dans l'onglet Progrès.</p>`,
    foot: `<button class="btn" data-act="go" data-tab="progres">Voir ma progression</button><button class="btn hot" data-act="close-sheet">Fermer</button>` });
  $("sheet-close").focus();
}

/* ---------- Démonstration d'un exercice ---------- */
function openDemo(id) {
  const ex = XM()[id], k = demoKey(id);
  if (!ex || !k) return;
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: esc(ex.n), id: "demo-title", enter: true, body: `${demoHTML(k, ex.n)}
    ${ex.alias ? `<p class="small muted"><i>${esc(ex.alias)}</i></p>` : ""}
    <div class="mus">${ex.pri.map(g => `<span>${GROUPS[g]}</span>`).join("")}${ex.sec.map(g => `<span class="sec">${GROUPS[g]}</span>`).join("")}</div>
    ${ex.why ? `<p>${esc(ex.why)}</p>` : ""}${ex.cue ? `<p><b>Placement :</b> ${esc(ex.cue)}</p>` : ""}
    <p class="small muted">La photo montre le principe du mouvement ; ta machine peut être un peu différente. Photos : free-exercise-db (domaine public).</p>`,
    foot: `<button class="btn" data-act="ex-edit" data-id="${id}" data-t="${(TPLS.find(t => program()[t.k].includes(id)) || {}).k || ""}">✎ Modifier</button><button class="btn hot" data-act="close-sheet">Fermer</button>` });
  $("sheet-close").focus();
}

/* ---------- Éditeur d'exercice ---------- */
let X = null;
function openExEditor(id, tpl) {
  const base = id ? XM()[id] : null;
  openShell();
  X = { id, tpl, isNew: !id, n: base ? base.n : "", alias: base ? base.alias || "" : "", pri: base ? [...base.pri] : [], sec: base ? [...base.sec] : [], rmin: base ? base.rr[0] : 10, rmax: base ? base.rr[1] : 15, inc: base ? base.inc : 2.5, start: base && base.start != null ? base.start : "", mus: base ? base.mus || "" : "", why: base ? base.why || "" : "", cue: base ? base.cue || "" : "", tendon: base ? !!base.tendon : false, demo: id ? demoKey(id) || "" : "", busy: false, err: "", fresh: true };
  renderExEditor();
}
function syncX() {
  const v = id => ($(id) || {}).value;
  if (!$("x-n")) return;
  X.n = v("x-n"); X.alias = v("x-alias"); X.rmin = +v("x-rmin") || X.rmin; X.rmax = +v("x-rmax") || X.rmax; X.inc = +String(v("x-inc")).replace(",", ".") || X.inc;
  const st = String(v("x-start")).replace(",", "."); X.start = st === "" ? "" : +st; X.mus = v("x-mus"); X.why = v("x-why"); X.cue = v("x-cue");
  if ($("x-demo")) X.demo = v("x-demo");
}
function renderExEditor() {
  const chips = (field) => `<div class="row" style="gap:6px">${Object.entries(GROUPS).map(([g, n]) => `<button class="chip" data-act="x-mus" data-f="${field}" data-g="${g}" aria-pressed="${X[field].includes(g)}">${n}</button>`).join("")}</div>`;
  const isBase = X.id && EX[X.id], isCustom = X.id && S.profile.customEx && S.profile.customEx[X.id];
  const body = `<label class="field" for="x-n">Nom de l'exercice<input type="text" id="x-n" value="${esc(X.n)}" placeholder="Ex. : Tirage vertical unilatéral"></label>
    <label class="field" for="x-alias">Comment tu le fais<textarea id="x-alias" placeholder="Ex. : assis par terre, poulie tout en haut, je ramène le coude près du corps">${esc(X.alias)}</textarea></label>
    <label class="field" for="x-demo">Démonstration animée<select id="x-demo"><option value="">Aucune</option>${[...DEMO_KEYS].map(k => `<option value="${k}" ${X.demo === k ? "selected" : ""}>${esc(EX[k].n)}</option>`).join("")}</select></label>
    ${demoHTML(X.demo, X.n)}
    <button class="btn hot" data-act="x-ai" ${X.busy ? "disabled" : ""}>${X.busy ? `<span class="spin"></span> Claude analyse…` : "✨ Compléter avec Claude"}</button>
    ${X.err ? `<div class="note">${esc(X.err)}</div>` : `<p class="small muted">Claude déduit les muscles, la fourchette de répétitions et les consignes à partir de ta description. Tu peux tout corriger ensuite.</p>`}
    <div><b>Muscles principaux</b>${chips("pri")}</div>
    <div><b>Muscles qui aident</b>${chips("sec")}</div>
    <div class="fields"><label class="field" for="x-rmin">Reps min<input type="number" id="x-rmin" inputmode="numeric" value="${X.rmin}"></label><label class="field" for="x-rmax">Reps max<input type="number" id="x-rmax" inputmode="numeric" value="${X.rmax}"></label>
      <label class="field" for="x-inc">Palier de charge (kg)<input type="number" id="x-inc" inputmode="decimal" step="0.25" value="${X.inc}"></label><label class="field" for="x-start">Charge habituelle (kg)<input type="number" id="x-start" inputmode="decimal" step="0.25" value="${X.start}"></label></div>
    <details class="learn" ${X.mus || X.why ? "open" : ""}><summary>Explications</summary>
      <label class="field" for="x-mus">Muscles en détail<input type="text" id="x-mus" value="${esc(X.mus)}"></label>
      <label class="field" for="x-why">Pourquoi cet exercice<textarea id="x-why">${esc(X.why)}</textarea></label>
      <label class="field" for="x-cue">Placement<textarea id="x-cue">${esc(X.cue)}</textarea></label></details>
    <div class="row">${!X.isNew && X.tpl ? `<button class="btn small" data-act="x-remove">Retirer de la séance</button>` : ""}${isBase && isCustom ? `<button class="btn small flat" data-act="x-reset">Revenir à l'original</button>` : ""}</div>`;
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: X.isNew ? "Nouvel exercice" : "Modifier l'exercice", id: "x-title", enter: X.fresh, body, foot: `<span class="small muted">${X.tpl ? "Séance : " + esc(tplOf(X.tpl).n || "") : ""}</span><button class="btn hot" data-act="x-save">Enregistrer</button>` });
  if (X.fresh) $("x-n").focus();
  X.fresh = false;
}
function saveExEditor() {
  syncX();
  if (!X.n.trim()) { toast("Donne un nom à l'exercice"); return; }
  if (!X.pri.length) { toast("Choisis au moins un muscle principal"); return; }
  const rmin = clamp(Math.round(X.rmin), 1, 50), rmax = clamp(Math.round(X.rmax), rmin, 60);
  const data = { n: X.n.trim(), alias: X.alias.trim(), pri: X.pri, sec: X.sec.filter(g => !X.pri.includes(g)), rr: [rmin, rmax], inc: X.inc > 0 ? X.inc : 2.5, mus: X.mus.trim() || X.pri.map(g => GROUPS[g]).join(", "), why: X.why.trim(), cue: X.cue.trim(), tendon: X.tendon };
  if (X.start !== "" && X.start > 0) data.start = X.start;
  data.demo = X.demo || "";
  const id = X.id || "c_" + uid();
  S.profile.customEx = { ...(S.profile.customEx || {}), [id]: data };
  if (X.isNew && X.tpl) { const pr = JSON.parse(JSON.stringify(program())); pr[X.tpl].push(id); S.profile.program = pr; }
  save(); closeSheet(); X = null; render();
  toast("Exercice enregistré");
}
async function exAI() {
  syncX();
  if (!X.n.trim() && !X.alias.trim()) { X.err = "Écris au moins le nom ou comment tu fais l'exercice."; renderExEditor(); return; }
  if (!hasKey()) { X.err = "Ajoute ta clé API dans Réglages pour que Claude complète l'exercice."; renderExEditor(); return; }
  const x = X; x.busy = true; x.err = ""; renderExEditor();
  const keys = Object.keys(GROUPS);
  const schema = { type: "object", additionalProperties: false, required: ["n", "pri", "sec", "rmin", "rmax", "inc", "mus", "why", "cue", "tendon"], properties: { n: { type: "string" }, pri: { type: "array", items: { type: "string", enum: keys } }, sec: { type: "array", items: { type: "string", enum: keys } }, rmin: { type: "integer" }, rmax: { type: "integer" }, inc: { type: "number" }, mus: { type: "string" }, why: { type: "string" }, cue: { type: "string" }, tendon: { type: "boolean" } } };
  try {
    const r = await askJSON({ system: systemPrompt().split("Règles :")[0] + "Tu es aussi son coach en musculation. Réponds en français.", content: `Exercice : ${x.n || "(sans nom)"}\nComment je le fais : ${x.alias || "(pas précisé)"}\nGroupes musculaires possibles (clé = nom) : ${keys.map(k => k + " = " + GROUPS[k]).join(", ")}.\nDonne : n = nom français clair et précis de l'exercice ; pri = 1 à 2 muscles principaux ; sec = muscles qui aident (sans répéter les principaux) ; rmin/rmax = fourchette de répétitions adaptée en sèche ; inc = plus petit palier de charge réaliste (haltères 2,5, poulie 1,25 à 2,5, machine 5, presse 10) ; mus = muscles en détail en une ligne ; why = à quoi sert l'exercice en 2 phrases ; cue = consignes de placement en 2 phrases ; tendon = true si l'exercice charge beaucoup les genoux ou les chevilles.`, schema });
    if (X !== x) return;
    x.n = x.n.trim() ? x.n : r.n; x.pri = r.pri.slice(0, 3); x.sec = r.sec.filter(g => !r.pri.includes(g)); x.rmin = r.rmin; x.rmax = r.rmax; x.inc = r.inc; x.mus = r.mus; x.why = r.why; x.cue = r.cue; x.tendon = r.tendon;
  } catch (e) { if (X !== x) return; x.err = explain(e); }
  x.busy = false; renderExEditor();
}

/* ---------- Onglet Progrès ---------- */
function fatBurned() {
  const m = maintenance(); let sum = 0;
  Object.keys(S.days).forEach(d => { if (d >= S.profile.startDate && d < today() && hasFood(d)) sum += m - dayTotals(d).kcal; });
  return Math.max(0, sum / KCAL_PER_KG);
}
function viewProgres() {
  const p = S.profile, w = weightsList(), cur = currentKg(), tr = trendPerWeek();
  const left = diffDays(today(), p.goalDate), todayKg = day(today()).kg;
  const proj = tr != null && left > 0 ? cur + tr / 7 * left : null;
  const total = Math.max(0.1, p.startKg - p.goalKg), fat = fatBurned();
  let h = `<section class="blk b-mint"><span class="mono">Pesée du matin</span>
    <div class="row"><input type="number" inputmode="decimal" step="0.1" id="weighin-input" value="${todayKg || ""}" placeholder="${f1(cur)}" aria-label="Poids du jour en kg" style="width:130px;font-family:var(--f-display);font-weight:800;font-size:28px"><b>kg</b><button class="btn ink" data-act="weigh">${todayKg ? "Corriger" : "Enregistrer"}</button></div>
    <span class="small">Après les toilettes, avant de manger. Le poids bouge de 1 à 2 kg d'un jour à l'autre : l'app en tire un poids tendance, plus fiable.</span></section>`;
  h += `<section class="blk b-lilac"><div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><div style="display:grid;gap:6px">
      <span class="mono">${left > 0 ? "À ce rythme, le " + fmtD(p.goalDate) : "Objectif"}</span><span class="big" style="font-size:64px">${f1(proj != null ? proj : cur)}<span style="font-size:22px"> kg</span></span>
      <span class="small">${proj == null ? (left > 0 ? "Il faut 4 pesées sur une semaine pour projeter ta courbe." : "Date d'objectif passée : règle-en une nouvelle.") : proj <= p.goalKg + 0.2 ? "<b>Tu es dans les temps</b> pour " + f1(p.goalKg) + " kg." : "Il manquerait <b>" + f1(proj - p.goalKg) + " kg</b>. Il faudrait −" + f1(Math.max(0, (cur - p.goalKg) / (left / 7))) + " kg par semaine."}</span>
      <span class="small">Gras fondu estimé : <b>${f1(fat)} kg</b> sur ${f1(total)}</span></div>${jarSVG(fat / total)}</div></section>`;
  h += `<section class="stats">
    <div class="card stat"><span class="mono muted">Poids tendance</span><span class="big">${f1(cur)}</span></div>
    <div class="card stat"><span class="mono muted">Depuis le départ</span><span class="big">${cur <= p.startKg ? "−" : "+"}${f1(Math.abs(p.startKg - cur))}</span></div>
    <div class="card stat"><span class="mono muted">Pas / jour (7 j)</span><span class="big">${(() => { const v = Array.from({ length: 7 }, (_, i) => day(addDays(today(), -i)).steps).filter(x => x != null); return v.length ? f0(v.reduce((a, b) => a + b, 0) / v.length) : "—"; })()}</span></div>
    <div class="card stat"><span class="mono muted">Sommeil (7 j)</span><span class="big">${avgSleep(7) != null ? fmtH(avgSleep(7)) : "—"}</span></div>
    <div class="card stat"><span class="mono muted">Rythme / sem.</span><span class="big">${tr == null ? "—" : (tr > 0 ? "+" : "") + f1(tr)}</span></div>
    <div class="card stat"><span class="mono muted">Dépense ${adaptive().ready ? "mesurée" : "estimée"}</span><span class="big">${f0(round50(maintenance()))}</span></div>
  </section>${tr != null && tr < -1 && diffDays(p.startDate, today()) > 14 ? `<div class="note">Tu perds plus de 1 kg par semaine depuis la 3e semaine : c'est trop rapide pour garder ton muscle. Ajoute 150 à 200 kcal par jour.</div>` : ""}`;
  h += `<section class="card"><h3>Couloir vers ${f1(p.goalKg)} kg</h3>${weightChart(w)}<div class="row small muted" style="gap:12px"><span>● tendance</span><span style="color:var(--mint)">● dans le couloir</span><span style="color:var(--tomato)">● au-dessus</span></div></section>`;
  h += `<section class="card"><h3>Calories, 14 jours</h3>${kcalChart()}<span class="small muted">Le trait marque ta cible de ${f0(kcalTarget())} kcal.</span></section>`;
  h += exercisesDashboard();
  h += weekTable();
  return h;
}
function jarSVG(ratio) {
  const v = clamp(ratio, 0, 1), top = 32, bottom = 116, hF = (bottom - top) * v;
  return `<svg class="jar" viewBox="0 0 96 124" role="img" aria-label="Gras fondu : ${Math.round(v * 100)} % de l'objectif">
    <defs><clipPath id="jar-in"><path d="M20 32 Q15 32 15 40 L15 108 Q15 116 23 116 L73 116 Q81 116 81 108 L81 40 Q81 32 76 32 Z"/></clipPath></defs>
    <rect x="28" y="10" width="40" height="14" rx="4" fill="#15111E"/>
    <path d="M20 32 Q15 32 15 40 L15 108 Q15 116 23 116 L73 116 Q81 116 81 108 L81 40 Q81 32 76 32 Z" fill="#fff" stroke="#15111E" stroke-width="3"/>
    <g clip-path="url(#jar-in)"><rect x="10" y="${(bottom - hF).toFixed(1)}" width="80" height="${hF.toFixed(1)}" fill="#FFC72C"/><path d="M10 ${(bottom - hF).toFixed(1)} q10 -5 20 0 t20 0 t20 0 t20 0 v6 h-80 z" fill="#FF5B37"/></g>
    <path d="M20 32 Q15 32 15 40 L15 108 Q15 116 23 116 L73 116 Q81 116 81 108 L81 40 Q81 32 76 32 Z" fill="none" stroke="#15111E" stroke-width="3"/>
    <text x="48" y="80" text-anchor="middle" fill="#15111E" style="font-family:var(--f-display);font-size:22px;font-weight:800">${Math.round(v * 100)}%</text></svg>`;
}
function weightChart(w) {
  const p = S.profile, W = chartW(), H = Math.round(W * 0.55), L = 34, R = 10, T = 12, B = 24;
  const start = w.length && w[0][0] < p.startDate ? w[0][0] : p.startDate;
  const lastD = w.length ? w[w.length - 1][0] : today();
  const end = p.goalDate > lastD ? p.goalDate : lastD;
  const span = Math.max(7, diffDays(start, end));
  const vals = w.map(x => x[1]).concat([p.goalKg - 0.6, p.startKg + 0.6]);
  const lo = Math.floor(Math.min(...vals) - 0.3), hi = Math.ceil(Math.max(...vals) + 0.3);
  const x = d => L + (diffDays(start, d) / span) * (W - L - R);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const lineAt = d => p.startKg + (p.goalKg - p.startKg) * clamp(diffDays(p.startDate, d) / Math.max(1, diffDays(p.startDate, p.goalDate)), 0, 1);
  const band = 0.6, step = hi - lo > 8 ? 2 : 1;
  let g = "";
  for (let v = lo; v <= hi; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--soft)" stroke-width="1.5"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let d = mondayOf(addDays(start, 6)); d <= end; d = addDays(d, 14)) g += `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${fmtD(d)}</text>`;
  g += `<path d="M${x(p.startDate)} ${y(p.startKg + band)} L${x(p.goalDate)} ${y(p.goalKg + band)} L${x(p.goalDate)} ${y(p.goalKg - band)} L${x(p.startDate)} ${y(p.startKg - band)} Z" fill="var(--mint)" opacity=".35"/>`;
  g += `<line x1="${x(p.startDate)}" y1="${y(p.startKg)}" x2="${x(p.goalDate)}" y2="${y(p.goalKg)}" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="4 5"/><circle cx="${x(p.goalDate)}" cy="${y(p.goalKg)}" r="6" fill="var(--mint)" stroke="var(--edge)" stroke-width="2"/>`;
  g += w.map(([d, v]) => `<circle cx="${x(d).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${v <= lineAt(d) + band ? "var(--mint)" : "var(--tomato)"}" stroke="var(--edge)" stroke-width="1"/>`).join("");
  const pts = [...trendSeries().entries()].filter(([, v]) => v != null);
  if (pts.length > 1) g += `<path d="${pts.map(([d, v], i) => (i ? "L" : "M") + x(d).toFixed(1) + " " + y(v).toFixed(1)).join(" ")}" fill="none" stroke="var(--text)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (pts.length) { const [d, v] = pts[pts.length - 1]; g += `<circle cx="${x(d)}" cy="${y(v)}" r="6" fill="var(--sun)" stroke="var(--edge)" stroke-width="2.5"/>`; }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids et couloir vers l'objectif">${g}</svg>`;
}
function kcalChart() {
  const W = chartW(), H = Math.round(W * 0.42), L = 30, R = 4, T = 10, B = 22, tgt = kcalTarget();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const totals = days.map(d => ({ d, k: dayTotals(d).kcal, n: hasFood(d) }));
  const max = Math.max(tgt * 1.4, ...totals.map(t => t.k)), bw = (W - L - R) / 14;
  const y = v => T + (1 - v / max) * (H - T - B);
  const col = { ok: "var(--mint)", warn: "var(--sun)", over: "var(--pink)" };
  let g = "";
  [0, 1000, 2000, 3000, 4000].filter(v => v <= max).forEach(v => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--soft)" stroke-width="1.5"/><text x="${L - 5}" y="${y(v) + 4}" text-anchor="end">${v ? v / 1000 + "k" : 0}</text>`; });
  totals.forEach((t, i) => {
    const cx = L + i * bw + bw * 0.14, w = bw * 0.72;
    g += t.n ? `<rect x="${cx}" y="${y(t.k)}" width="${w}" height="${Math.max(0, y(0) - y(t.k))}" rx="4" fill="${col[dayLight(t.k)]}" stroke="var(--edge)" stroke-width="2"/>` : `<rect x="${cx}" y="${y(0) - 6}" width="${w}" height="6" rx="2" fill="none" stroke="var(--muted)" stroke-dasharray="2 2"/>`;
    if (i % 2 === 1 || i === 13) g += `<text x="${cx + w / 2}" y="${H - 6}" text-anchor="middle">${parseD(t.d).getDate()}</text>`;
  });
  g += `<line x1="${L}" x2="${W - R}" y1="${y(tgt)}" y2="${y(tgt)}" stroke="var(--text)" stroke-width="2" stroke-dasharray="5 4"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories par jour sur 14 jours">${g}</svg>`;
}
function weekTable() {
  const rows = [], monday = mondayOf(today());
  for (let k = 0; k < 8; k++) {
    const ws = addDays(monday, -7 * k), we = addDays(ws, 6);
    if (we < S.profile.startDate) break;
    const ds = Array.from({ length: 7 }, (_, i) => addDays(ws, i)), logged = ds.filter(hasFood);
    const kcalAvg = logged.length ? logged.reduce((a, d) => a + dayTotals(d).kcal, 0) / logged.length : null;
    const inT = logged.filter(d => dayLight(dayTotals(d).kcal) === "ok").length;
    const tEnd = trendAt(we > today() ? today() : we);
    const sess = sessionsSorted().filter(s => s.done && s.date >= ws && s.date <= we).length;
    const walk = ds.reduce((a, d) => a + (day(d).walk || 0), 0);
    const st = ds.map(d => day(d).steps).filter(v => v != null), stAvg = st.length ? st.reduce((a, b) => a + b, 0) / st.length : null;
    const sls = ds.map(d => sleepH(day(d))).filter(v => v != null), slAvg = sls.length ? sls.reduce((a, b) => a + b, 0) / sls.length : null;
    rows.push(`<tr><td>${fmtD(ws)}</td><td>${tEnd ? f1(tEnd) : "—"}</td><td>${kcalAvg ? f0(kcalAvg) : "—"}</td><td>${logged.length ? inT + "/" + logged.length : "—"}</td><td>${sess}</td><td>${stAvg != null ? f0(stAvg) : "—"}</td><td>${slAvg != null ? fmtH(slAvg) : "—"}</td><td>${walk ? f1(walk / 60) + " h" : "—"}</td></tr>`);
  }
  return `<section><h2>Semaine par semaine</h2><div class="tablewrap"><table><thead><tr><th>Semaine</th><th>Tendance</th><th>kcal/j</th><th>Cible</th><th>Séances</th><th>Pas/j</th><th>Sommeil</th><th>Marche</th></tr></thead><tbody>${rows.join("")}</tbody></table></div></section>`;
}

/* ---------- Recettes ---------- */
function recipeCard(r, src, i) {
  const tags = [`${f0(r.kcal)} kcal`, `${f0(r.prot)} g prot.`, `${r.min} min`, r.how].filter(Boolean);
  return `<article class="card recipe">
    <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="emo big-emo" aria-hidden="true">${esc(r.e || "🍽️")}</span><div style="display:grid;gap:6px;min-width:0"><h3>${esc(r.n)}</h3><div class="row" style="gap:5px">${tags.map(t => `<span class="tag t-none">${esc(t)}</span>`).join("")}</div></div></div>
    <details class="learn"><summary>Voir la recette</summary>
      <p><b>Ingrédients</b></p><ul class="rlist">${(r.ingr || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <p><b>Étapes</b></p><ol class="rlist">${(r.steps || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol></details>
    <button class="btn small sun" data-act="eat-recipe" data-src="${src}" data-i="${i}">Je l'ai mangé</button></article>`;
}
function viewRecettes() {
  const tgt = kcalTarget(), tot = dayTotals(today()), left = tgt - tot.kcal, missP = S.profile.prot - tot.prot;
  const g = UI.goal, f = UI.rfilter;
  let list = RECIPES.map((r, i) => [r, i]).filter(([r]) => r.g.includes(g));
  if (f === "raw") list = list.filter(([r]) => r.how === "Sans cuisson");
  if (f === "quick") list = list.filter(([r]) => r.min <= 15);
  if (f === "fits") list = list.filter(([r]) => r.kcal <= left + 50);
  const goalTxt = { seche: "Assiettes rassasiantes et riches en protéines, pour rester sous ta cible.", equilibre: "Des repas complets pour tenir ton poids sans y penser.", masse: "Plus de féculents et de bons gras : vise environ 300 kcal au-dessus de ton maintien." }[g];
  let h = `<section class="blk ${GOAL_COL[g]}"><span class="mono">Ton objectif</span>
    <div class="seg" role="group" aria-label="Objectif">${GOALS.map(([k, n]) => `<button data-act="goal" data-k="${k}" aria-pressed="${g === k}">${n}</button>`).join("")}</div>
    <span class="small">${goalTxt}</span>
    <span class="small">Aujourd'hui : il te reste <b>${f0(Math.max(0, left))} kcal</b>${missP > 0 ? ` et <b>${f0(missP)} g</b> de protéines` : ""}.</span></section>`;
  h += `<section class="card"><h3>✨ Idées sur mesure</h3><p class="small muted">Claude te propose 3 recettes selon ton objectif, ce qu'il te reste aujourd'hui et ce que tu as sous la main.</p>
    <input type="text" id="r-have" placeholder="Ce que j'ai : œufs, riz, thon, courgettes…" aria-label="Ce que tu as sous la main" value="${esc(UI.rHave || "")}">
    <button class="btn hot" data-act="ai-recipes" ${UI.aiBusy ? "disabled" : ""}>${UI.aiBusy ? `<span class="spin"></span> Claude cuisine…` : "Proposer 3 recettes"}</button>
    ${!hasKey() ? `<p class="small muted">Ajoute ta clé API dans Réglages pour activer cette partie.</p>` : ""}${UI.aiErr ? `<div class="note">${esc(UI.aiErr)}</div>` : ""}</section>`;
  if (UI.aiRecipes.length) h += `<section><h2>Pour toi, maintenant</h2>${UI.aiRecipes.map((r, i) => recipeCard(r, "ai", i)).join("")}</section>`;
  h += `<section><div class="scroller">${[["all", "Toutes"], ["fits", "Rentre dans ma journée"], ["quick", "15 min max"], ["raw", "Sans cuisson"]].map(([k, n]) => `<button class="chip" data-act="rfilter" data-k="${k}" aria-pressed="${f === k}">${n}</button>`).join("")}</div>
    ${list.length ? list.map(([r, i]) => recipeCard(r, "base", i)).join("") : `<div class="empty">Aucune recette ne correspond à ce filtre. Essaie « Toutes ».</div>`}</section>`;
  return h;
}
const RECIPE_SCHEMA = { type: "object", additionalProperties: false, required: ["recipes"], properties: { recipes: { type: "array", items: { type: "object", additionalProperties: false, required: ["e", "n", "kcal", "prot", "min", "how", "ingr", "steps"], properties: { e: { type: "string" }, n: { type: "string" }, kcal: { type: "number" }, prot: { type: "number" }, min: { type: "integer" }, how: { type: "string" }, ingr: { type: "array", items: { type: "string" } }, steps: { type: "array", items: { type: "string" } } } } } } };
async function aiRecipes() {
  if (UI.aiBusy) return;
  if (!hasKey()) { UI.aiErr = "Ajoute ta clé API dans Réglages pour que Claude propose des recettes."; render(); return; }
  const have = ($("r-have") || {}).value || "";
  UI.rHave = have; UI.aiBusy = true; UI.aiErr = ""; render();
  const tot = dayTotals(today()), left = kcalTarget() - tot.kcal, missP = S.profile.prot - tot.prot;
  const goal = { seche: "sèche (perte de gras en gardant le muscle)", equilibre: "équilibre (maintien du poids)", masse: "prise de masse propre" }[UI.goal];
  try {
    const res = await askJSON({ system: systemPrompt().split("Règles :")[0] + "Tu proposes des recettes simples, rapides et healthy, faciles à faire même pour quelqu'un qui cuisine peu (micro-ondes, air fryer, une poêle). Valeurs nutritionnelles réalistes pour une portion.", content: `Objectif : ${goal}. Il me reste ${f0(Math.max(0, left))} kcal et ${f0(Math.max(0, missP))} g de protéines aujourd'hui. Heure : ${new Date().toTimeString().slice(0, 5)}.
${have.trim() ? "Ce que j'ai sous la main : " + have.trim() : "Pas de contrainte d'ingrédients."}
Propose 3 recettes variées en français, avec un emoji, des quantités précises, des étapes courtes (« how » = Sans cuisson, Micro-ondes, Air fryer, Poêle ou Four).`, schema: RECIPE_SCHEMA });
    UI.aiRecipes = (res.recipes || []).slice(0, 3);
    if (!UI.aiRecipes.length) UI.aiErr = "Claude n'a rien proposé, réessaie.";
  } catch (e) { UI.aiErr = explain(e); }
  UI.aiBusy = false; render();
}
function eatRecipe(src, i) {
  const r = src === "ai" ? UI.aiRecipes[i] : RECIPES[i];
  if (!r) return;
  const d = today();
  if (!S.days[d]) S.days[d] = day(d);
  S.days[d].meals.push({ id: uid(), slot: defaultSlot(), items: [{ e: r.e || "🍽️", n: r.n, d: "recette", kcal: Math.round(r.kcal), prot: Math.round(r.prot) }], tip: "" });
  saveDay(d); UI.date = d; render();
  toast(`Ajouté au journal · ${f0(r.kcal)} kcal`);
}

/* ---------- Onglet Plan / Réglages ---------- */
function viewPlan() {
  const p = S.profile, tgt = kcalTarget(), m = maintenance(), ad = adaptive();
  const total = p.startKg - p.goalKg, weeks = diffDays(p.startDate, p.goalDate) / 7;
  const key = getKey();
  let h = `<section class="stats">
      <div class="blk b-tomato stat"><span class="mono">Cible du jour</span><span class="big">${f0(tgt)}</span><span class="small">kcal</span></div>
      <div class="blk b-sun stat"><span class="mono">Dépense ${ad.ready && p.auto !== false ? "mesurée" : "estimée"}</span><span class="big">${f0(round50(m))}</span><span class="small">${ad.ready ? "sur tes 14 derniers jours" : "calibrage : jour " + Math.min(ad.days, 14) + "/14"}</span></div>
      <div class="blk b-cobalt stat"><span class="mono">Protéines</span><span class="big">${p.prot}</span><span class="small">g par jour, en 4 prises</span></div>
      <div class="blk b-mint stat"><span class="mono">Rythme visé</span><span class="big">${weeks > 0 && total > 0 ? "−" + f1(total / weeks) : "—"}</span><span class="small">kg par semaine</span></div>
    </section>
    <button class="btn" data-act="how">Comment c'est calculé ?</button>
    <section class="card"><h3>Claude</h3>
      <p class="small">Pour analyser ce que tu dis ou photographies, l'app appelle Claude avec ta propre clé API. Elle reste sur ce téléphone et ne part que vers Anthropic. Crée-la sur <b>console.anthropic.com</b>, rubrique API Keys.</p>
      <label class="field" for="api-key">Clé API<input id="api-key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${key ? esc(key) : ""}"></label>
      <div class="row"><button class="btn sun" data-act="save-key">Enregistrer la clé</button>${key ? `<button class="btn" data-act="test-key">Tester</button><button class="btn flat" data-act="del-key">Effacer</button>` : ""}</div>
      <div role="group" aria-label="Modèle" style="display:grid;gap:8px">${MODELS.map(mo => `<button class="card" style="text-align:left;gap:2px;padding:10px 12px;${getModel() === mo.id ? "background:var(--sky);color:var(--block-ink)" : ""}" data-act="model" data-v="${mo.id}" aria-pressed="${getModel() === mo.id}"><b>${mo.n}</b><span class="small">${mo.d}</span></button>`).join("")}</div>
    </section>
    <section class="card"><div class="row between"><div style="flex:1;min-width:0"><b>Cible qui s'ajuste toute seule</b><div class="small muted">Dès 14 jours, l'app mesure ta vraie dépense à partir de ton poids et de tes repas.</div></div><button class="toggle" data-act="auto" aria-pressed="${p.auto !== false}" aria-label="Ajustement automatique"></button></div>
      <div class="row between"><div style="flex:1;min-width:0"><b>Mode convalescence</b><div class="small muted">Après une opération : déficit léger (250 kcal), protéines maintenues.</div></div><button class="toggle" data-act="conva" aria-pressed="${conva()}" aria-label="Mode convalescence"></button></div>
      <div class="row between"><div style="flex:1;min-width:0"><b>Suivi d'une blessure</b><div class="small muted">Note de douleur chaque jour et alertes.</div></div><button class="toggle" data-act="tendon" aria-pressed="${!!p.tendon}" aria-label="Suivi d'une blessure"></button></div></section>
    <section class="card"><h3>Toi</h3><div class="fields">
      <label class="field" for="p-height">Taille (cm)<input type="number" id="p-height" data-prof="heightCm" value="${p.heightCm}"></label>
      <label class="field" for="p-age">Âge<input type="number" id="p-age" data-prof="age" value="${p.age}"></label>
      <label class="field" for="p-start">Poids de départ<input type="number" step="0.1" id="p-start" data-prof="startKg" value="${p.startKg}"></label>
      <label class="field" for="p-goal">Objectif (kg)<input type="number" step="0.1" id="p-goal" data-prof="goalKg" value="${p.goalKg}"></label>
      <label class="field" for="p-gdate">Pour le<input type="date" id="p-gdate" data-prof="goalDate" value="${p.goalDate}"></label>
      <label class="field" for="p-prot">Protéines (g/j)<input type="number" id="p-prot" data-prof="prot" value="${p.prot}"></label>
      <label class="field" for="p-act">Activité (1,3 à 1,6)<input type="number" step="0.05" id="p-act" data-prof="activity" value="${p.activity}"></label>
      <label class="field" for="p-kcal">Cible kcal (vide = auto)<input type="number" id="p-kcal" data-prof="kcalManual" value="${p.kcalManual || ""}" placeholder="${tgt}"></label></div>
      <label class="field" for="p-ctx">Ce que Claude doit savoir sur toi<textarea id="p-ctx" data-ctx="1" placeholder="Ex. : on cuisine pour moi, souvent au beurre. Je ne pèse pas, sauf les pâtes. Problème de tendon, opération prévue.">${esc(p.context || "")}</textarea></label></section>
    <section class="card"><h3>Tes poudres et ta créatine</h3><p class="small muted">Valeurs de l'étiquette, pour une dose. Chaque pot a son compteur sur l'écran du jour.</p>
      ${activePowders().map(w => `<div class="card" style="gap:8px;box-shadow:none;padding:12px"><div class="row between" style="flex-wrap:nowrap"><input type="text" id="pw-n-${w.id}" data-pw="${w.id}" data-f="n" value="${esc(w.n)}" aria-label="Nom du pot" style="flex:1;min-width:0;font-weight:700"><button class="x" data-act="pw-del" data-w="${w.id}" aria-label="Supprimer ${esc(w.n)}">×</button></div>
        <div class="fields"><label class="field" for="pw-g-${w.id}">Dose (g)<input type="number" step="0.5" id="pw-g-${w.id}" data-pw="${w.id}" data-f="g" value="${w.g}"></label><label class="field" for="pw-k-${w.id}">kcal / dose<input type="number" id="pw-k-${w.id}" data-pw="${w.id}" data-f="kcal" value="${w.kcal}"></label><label class="field" for="pw-p-${w.id}">Protéines / dose<input type="number" step="0.1" id="pw-p-${w.id}" data-pw="${w.id}" data-f="prot" value="${w.prot}"></label></div></div>`).join("")}
      ${activePowders().length < 4 ? `<div class="row">${POWDER_PRESETS.filter(x => !activePowders().some(w => w.n === x.n)).map((x, i) => `<button class="btn small" data-act="pw-add" data-i="${POWDER_PRESETS.indexOf(x)}">+ ${esc(x.n)}</button>`).join("")}<button class="btn small" data-act="pw-add" data-i="-1">+ Autre pot</button></div>` : ""}
      <label class="field" for="w-c">Créatine (g/jour)<input type="number" step="0.5" id="w-c" data-prof="creaG" value="${p.creaG}"></label></section>
    ${cloudHTML()}
    <section class="blk b-sun" id="bilan"><span class="mono">Bilan de la semaine</span><p class="small">Claude lit tes 7 derniers jours et te donne trois actions pour la semaine qui vient.</p>
      <button class="btn ink" data-act="coach" ${UI.coachBusy ? "disabled" : ""}>${UI.coachBusy ? `<span class="spin"></span> Analyse…` : "Faire le bilan"}</button>
      <div id="coach-out" style="white-space:pre-wrap;font-size:15px">${esc(UI.coach)}</div></section>`;
  h += guideHTML();
  h += healthHelpHTML();
  h += `<section class="card"><h3>Tes données</h3><p class="small muted">Tout est sur ce téléphone. Exporte régulièrement une sauvegarde.</p>
    <div class="row"><button class="btn" data-act="export">Exporter</button><button class="btn" data-act="import">Importer</button></div>
    <p class="small muted">Dessin anatomique adapté de react-body-highlighter (licence MIT). Photos d'exercices : free-exercise-db (domaine public).</p></section>`;
  return h;
}
function guideHTML() {
  const p = S.profile, w = activePowders()[0] || { prot: 23 };
  const art = (col, eyebrow, title, body) => `<article class="blk ${col}"><span class="mono">${eyebrow}</span><h3>${title}</h3>${body}</article>`;
  return `<section><h2>Ce qui fait la différence</h2>
    ${art("b-tomato", "Levier n° 1", "La portion de féculents", `<p>700 g de pâtes <b>cuites</b>, c'est environ 1 050 kcal, la moitié d'une journée. 700 g <b>crues</b>, c'est 2 500 kcal. Une portion de sportif, c'est 300 à 400 g cuits (125 à 170 g crus). Passer de 700 à 350 g cuits fait gagner environ 500 kcal à chaque fois, soit autour de 3 kg de gras en 7 semaines si c'est quotidien.</p><p>Pour ne pas avoir faim : un sachet de légumes surgelés (5 min au micro-ondes) et une vraie portion de viande ou de poisson.</p>`)}
    ${art("b-sun", "Levier n° 2", "Le beurre de cuisson", `<p>Une noisette de beurre (10 g), c'est 75 kcal. Une viande « bien beurrée » avec son jus en porte souvent 15 à 20 g, soit 110 à 150 kcal de plus. Si on cuisine pour toi : prends ta part avant la sauce, laisse le jus et le gras dans la poêle. Poulet, porc et poisson passent très bien à l'air fryer sans beurre.</p>`)}
    ${art("b-pink", "Le grignotage", "Madeleines, Kinder et compagnie", `<p>Une madeleine 110 kcal, un Kinder Joy 110, un Pitch 145. Trois dans l'après-midi, c'est 350 kcal, plus de la moitié du déficit du jour. Note-les quand même : c'est en les voyant s'additionner que tu les réduis. Pour le sucré, un skyr avec un fruit : 140 kcal et 15 g de protéines.</p>`)}
    ${art("b-sky", "Sans balance", "Doser à la main", `<p><b>Viande ou poisson :</b> 1 à 2 paumes, 120 à 200 g cuits.<br><b>Féculents :</b> 1 à 2 poings, 150 à 300 g cuits.<br><b>Légumes :</b> au moins 1 poing.<br><b>Gras ajouté :</b> un pouce maximum.</p>`)}
    ${art("b-cobalt", "Garder le muscle", `Protéines : ${p.prot} g par jour`, `<p>En sèche, ce sont les protéines et la muscu qui font que tu perds du gras et pas du muscle. Répartis-les en 4 prises de 35 à 45 g : viande 30 à 45 g la portion, whey ${w.prot} g, skyr 15 g, fromage blanc 0 % 11 g, deux œufs 13 g.</p>`)}
    ${art("b-mint", "Créatine", "Continue, sans regarder la balance", `<p>3 à 5 g par jour, tous les jours. Elle aide à garder ta force en déficit. Prise depuis longtemps, elle ne change plus rien au poids ; arrêtée, elle fait perdre environ 1 kg d'eau, pas du gras. <b>Avant une opération</b>, préviens l'anesthésiste : elle fait monter la créatinine dans la prise de sang.</p>`)}
    ${p.tendon ? art("b-lilac", "Ta blessure", "Bouger sans l'abîmer", `<p>Si la marche réveille la douleur, coupe en deux sorties de 15 minutes, ou passe au vélo (selle haute, résistance faible si c'est le genou). La douleur pendant l'effort reste sous 3/10, et celle du lendemain matin ne monte pas d'une semaine à l'autre. Les exercices de jambes se font avec l'accord de ton chirurgien. Consulte vite en cas de claquement, de gonflement ou de douleur la nuit.</p>`) : ""}
    ${art("b-sun", "Signaux d'alerte", "Quand lever le pied", `<p>Plus de 1 kg perdu par semaine après la 2e semaine : ajoute 150 à 200 kcal. Charges en baisse de plus de 10 % pendant 2 semaines, vertiges, sommeil perturbé, fatigue qui s'installe : remonte les calories et parles-en à un médecin.</p>`)}
    ${art("b-sky", "Le reste", "Les détails qui comptent", `<p><b>Sommeil</b> 7 à 9 h : en dormant 5 h 30, on perd moins de gras et plus de muscle. <b>Alcool</b> : 7 kcal par gramme et une récupération freinée. <b>Eau</b> : 2,5 L par jour ; un repas très salé ajoute 0,5 à 1 kg d'eau le lendemain. <b>Fibres</b> : 30 g par jour. <b>Après l'objectif</b> : 2 semaines au maintien pour stabiliser.</p>`)}
  </section>`;
}

/* ---------- Feuilles ---------- */
const SH = { opener: null, down: null };
function openShell() { SH.opener = document.activeElement; $("app").inert = true; document.body.classList.add("lock"); }
function closeSheet() {
  const s = $("sheet"); s.hidden = true; s.innerHTML = "";
  if (C && C.photoUrl) URL.revokeObjectURL(C.photoUrl);
  C = null; R = null; X = null;
  $("app").inert = false; document.body.classList.remove("lock");
  if (SH.opener && document.body.contains(SH.opener)) SH.opener.focus();
}
function sheetHTML({ title, head = "", body, foot, enter, id = "sheet-title" }) {
  return `<div class="back" data-act="sheet-back"><div class="sheet ${enter ? "enter" : ""}" role="dialog" aria-modal="true" aria-labelledby="${id}">
    <div class="sh-head"><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><h3 id="${id}" style="min-width:0">${title}</h3><button class="round" id="sheet-close" data-act="close-sheet" aria-label="Fermer">✕</button></div>${head}</div>
    <div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ""}</div></div>`;
}

/* Composition d'un repas */
let C = null;
const defaultSlot = () => { const hr = new Date().getHours(); return hr < 11 ? "matin" : hr < 15 ? "midi" : hr < 18 ? "gouter" : "soir"; };
function openComposer(opts) {
  const date = UI.date;
  if (!C) openShell();
  C = { id: opts.id || null, date, slot: opts.slot || (UI.date === today() ? defaultSlot() : "midi"), items: opts.items ? opts.items.map(i => ({ fixed: true, ...i })) : [], mode: opts.mode || "pick", cat: "fec", search: opts.search || "", desc: opts.desc || "", photo: null, photoUrl: null, busy: false, err: "", tip: opts.tip || "", fresh: true };
  renderComposer();
}
function calcItem(ci) {
  if (ci.fixed) return { n: ci.n, kcal: +ci.kcal || 0, prot: +ci.prot || 0, d: ci.d || "", e: emojiFor(ci), k: ci.k || "" };
  const f = FOOD[ci.k];
  let kcal, prot, d, factor;
  if (f.u === "g") { const g = ci.por === "g" ? (+ci.g || 0) : f.p[ci.por]; kcal = f.kc * g / 100; prot = f.pr * g / 100; factor = g / f.p[1]; d = (ci.por === "g" ? "" : PORTIONS[ci.por] + " · ") + "≈ " + g + " g"; }
  else { kcal = f.kc * ci.cnt; prot = f.pr * ci.cnt; factor = ci.cnt * 0.5; d = fkg(ci.cnt) + " " + f.un; }
  if (f.ck && ci.cook) { kcal += COOK[ci.cook].kc * factor; d += " · " + COOK[ci.cook].n.toLowerCase(); }
  return { n: f.n, kcal: Math.round(kcal), prot: Math.round(prot * 10) / 10, d, k: f.k, e: f.e };
}
const newItem = (k, o = {}) => { const f = FOOD[k]; return { k, por: o.por != null ? o.por : 1, g: "", cnt: o.cnt || 1, cook: o.cook != null ? o.cook : (f.ck && f.c === "pro" ? 1 : 0) }; };
const composerTotals = () => itemTotals(C.items.map(calcItem));
const foodBtn = f => `<button class="food" data-act="pick" data-k="${f.k}"><span class="emo" aria-hidden="true">${f.e}</span><b>${esc(f.n)}</b><span>${f.u === "g" ? "normale ≈ " + f.p[1] + " g · " + f0(f.kc * f.p[1] / 100) + " kcal" : f0(f.kc) + " kcal / " + f.un}</span></button>`;
function foodListHTML() {
  const q = norm(C.search.trim());
  if (!q) return FOODS.filter(f => f.c === C.cat).map(foodBtn).join("");
  const words = q.split(/\s+/), list = FOODS.filter(f => words.every(w => norm(f.n).includes(w)));
  return list.map(foodBtn).join("") + `<button class="food preset" data-act="ask-claude"><span class="emo">✨</span><b>${list.length ? "Pas ça ? " : ""}Demander à Claude</b><span>« ${esc(C.search.trim())} »</span></button>`;
}
function yesterdayMeal(slot) { const ms = day(addDays(UI.date, -1)).meals.filter(m => m.slot === slot && m.items.length); return ms.length ? ms.flatMap(m => m.items) : null; }
function frequentMeals() {
  const map = new Map();
  Object.keys(S.days).sort().reverse().forEach(d => (S.days[d].meals || []).forEach(m => {
    if (!m.items.length) return;
    const key = m.items.map(i => i.n + "|" + (i.d || "")).sort().join("+"), cur = map.get(key);
    if (cur) cur.count++; else map.set(key, { count: 1, items: m.items, kcal: itemTotals(m.items).kcal, label: m.items.slice(0, 2).map(i => i.n.split(" (")[0]).join(" + ") + (m.items.length > 2 ? "…" : "") });
  }));
  return [...map.values()].filter(m => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 5);
}
const presetKcal = p => itemTotals(p.items.map(i => calcItem(newItem(i.k, i)))).kcal;
function itemEditor(ci, i) {
  const r = calcItem(ci);
  if (ci.fixed) return `<div class="citem"><div class="head"><span class="emo" aria-hidden="true">${r.e}</span><div><b>${esc(ci.n)}</b>${ci.d ? `<div class="small muted">${esc(ci.d)}</div>` : ""}</div><input class="kcalin" type="number" inputmode="numeric" id="kc-${i}" data-i="${i}" data-field="kcal" value="${Math.round(ci.kcal)}" aria-label="Calories de ${esc(ci.n)}"><button class="x" data-act="rm-item" data-i="${i}" aria-label="Retirer ${esc(ci.n)}">×</button></div></div>`;
  const f = FOOD[ci.k];
  const ctl = f.u === "g"
    ? `<div class="seg">${PORTIONS.map((p, j) => `<button data-act="por" data-i="${i}" data-v="${j}" aria-pressed="${ci.por === j}">${p}</button>`).join("")}<button data-act="por" data-i="${i}" data-v="g" aria-pressed="${ci.por === "g"}">Pesé</button></div>${ci.por === "g" ? `<label class="row small" for="g-${i}"><input type="number" inputmode="numeric" id="g-${i}" data-i="${i}" data-field="g" value="${ci.g || ""}" placeholder="${f.p[1]}" style="width:100px"> grammes</label>` : ""}`
    : `<div class="row"><div class="stepper"><button data-act="cnt" data-i="${i}" data-v="-0.5" aria-label="Moins">−</button><span class="v">${fkg(ci.cnt)}</span><button data-act="cnt" data-i="${i}" data-v="0.5" aria-label="Plus">+</button></div><span class="small muted">${f.un}</span></div>`;
  return `<div class="citem"><div class="head"><span class="emo" aria-hidden="true">${f.e}</span><b>${esc(f.n)}</b><span class="big" style="font-size:22px">${f0(r.kcal)}</span><button class="x" data-act="rm-item" data-i="${i}" aria-label="Retirer ${esc(f.n)}">×</button></div>${ctl}${f.ck ? `<div class="seg">${COOK.map((c, j) => `<button data-act="cook" data-i="${i}" data-v="${j}" aria-pressed="${ci.cook === j}">${c.n}</button>`).join("")}</div>` : ""}</div>`;
}
function renderComposer() {
  const s = $("sheet"), prevBody = s.querySelector(".sh-body"), scroll = prevBody ? prevBody.scrollTop : 0;
  const focusId = document.activeElement && s.contains(document.activeElement) ? document.activeElement.id : null;
  s.hidden = false;
  const tot = composerTotals(), tgt = kcalTarget(), share = SLOTS.find(x => x.k === C.slot).share;
  let body = "";
  if (C.items.length) body += C.items.map((ci, i) => itemEditor(ci, i)).join("");
  if (C.tip) body += `<div class="note info">💡 ${esc(C.tip)}</div>`;
  if (C.mode === "pick") {
    if (!C.items.length && !C.id && !C.search.trim()) {
      const yest = yesterdayMeal(C.slot), freq = frequentMeals();
      body += `<div><span class="mono muted">Pas le temps de détailler ?</span><div class="express" style="margin-top:6px">${["Léger", "Normal", "Copieux"].map((n, i) => `<button data-act="express" data-v="${i}">${n}<span>≈ ${f0(round50(tgt * share * [0.7, 1, 1.4][i]))} kcal</span></button>`).join("")}</div></div>
        <div style="display:grid;gap:8px"><span class="mono muted">Plats de la maison</span>
        ${yest ? `<button class="food preset" data-act="copy-yest"><span class="emo">↺</span><b>Comme hier</b><span>${f0(itemTotals(yest).kcal)} kcal · ${esc(yest.map(i => i.n.split(" (")[0]).slice(0, 2).join(", "))}</span></button>` : ""}
        ${freq.map((m, i) => `<button class="food preset" data-act="freq" data-i="${i}"><span class="emo">${emojiFor(m.items[0])}</span><b>${esc(m.label)}</b><span>${f0(m.kcal)} kcal · noté ${m.count} fois</span></button>`).join("")}
        ${PRESETS.map((p, i) => `<button class="food" data-act="preset" data-i="${i}"><span class="emo" aria-hidden="true">${p.e}</span><b>${esc(p.n)}</b><span>≈ ${f0(presetKcal(p))} kcal, portions ajustables</span></button>`).join("")}</div>`;
    }
    body += `<input type="search" id="c-search" value="${esc(C.search)}" placeholder="Chercher : madeleine, poulet, pizza…" aria-label="Chercher un aliment">
      ${C.search.trim() ? "" : `<div class="scroller">${CATS.map(([k, n, e]) => `<button class="chip" data-act="cat" data-k="${k}" aria-pressed="${C.cat === k}">${e} ${n}</button>`).join("")}</div>`}
      <div class="foods" id="foodlist">${foodListHTML()}</div>`;
  } else {
    body += `<label class="field" for="c-desc">Écris ce que tu as mangé, comme tu le dirais<textarea id="c-desc" placeholder="Ex. : deux madeleines et un Kinder Joy. Ou : une grosse assiette de pâtes sauce soja et un steak au beurre">${esc(C.desc)}</textarea></label>
      <div class="row"><button class="btn small" data-act="pick-photo">📷 ${C.photo ? "Changer la photo" : "Ajouter une photo"}</button><input id="c-photo" type="file" accept="image/*" capture="environment" hidden>${C.photo ? `<button class="btn small flat" data-act="photo-del">Retirer</button>` : ""}</div>
      ${C.photoUrl ? `<img class="photo" src="${C.photoUrl}" alt="Photo du repas">` : ""}
      <button class="btn hot" data-act="estimate" ${C.busy ? "disabled" : ""}>${C.busy ? `<span class="spin"></span> Claude estime…` : "✨ Estimer avec Claude"}</button>
      ${!hasKey() ? `<p class="small muted">Ajoute ta clé API dans Réglages pour que Claude estime. Sans clé, je cherche dans la liste.</p>` : ""}
      ${C.err ? `<div class="note">${esc(C.err)}</div>` : ""}`;
  }
  const head = `<div class="scroller">${SLOTS.map(sl => `<button class="chip" data-act="slot" data-k="${sl.k}" aria-pressed="${C.slot === sl.k}">${sl.n}</button>`).join("")}</div>
    <div class="seg"><button data-act="mode" data-k="pick" aria-pressed="${C.mode === "pick"}">Plats et liste</button><button data-act="mode" data-k="ai" aria-pressed="${C.mode === "ai"}">Texte ou photo</button></div>`;
  const foot = `<div><div class="big" style="font-size:28px" id="c-total">${f0(tot.kcal)} kcal</div><div class="small muted" id="c-prot">${f0(tot.prot)} g de protéines</div></div>
    <div class="row">${C.id ? `<button class="btn flat" data-act="del-meal">Supprimer</button>` : ""}<button class="btn hot" data-act="save-meal" ${C.items.length ? "" : "disabled"}>Enregistrer</button></div>`;
  s.innerHTML = sheetHTML({ title: (C.id ? "Modifier le repas" : "Noter un repas") + (UI.date !== today() ? ` <span class="small muted">· ${fmtD(UI.date, true)}</span>` : ""), head, body, foot, enter: C.fresh });
  const nb = s.querySelector(".sh-body"); if (nb) nb.scrollTop = scroll;
  const fe = focusId && $(focusId);
  if (fe) fe.focus(); else if (C.fresh) $("sheet-close").focus();
  C.fresh = false;
}
function saveMeal() {
  const d = C.date || UI.date;
  if (!S.days[d]) S.days[d] = day(d);
  const items = C.items.map(calcItem).filter(i => i.kcal > 0 || i.prot > 0);
  const arr = S.days[d].meals, id = C.id || uid(), idx = arr.findIndex(m => m.id === id);
  if (!items.length) { if (idx >= 0) arr.splice(idx, 1); saveDay(d); closeSheet(); render(); toast("Repas vide, rien d'enregistré"); return; }
  const meal = { id, slot: C.slot, items, tip: C.tip || "" };
  if (idx >= 0) arr[idx] = meal; else arr.push(meal);
  saveDay(d); closeSheet(); render();
  toast("Repas enregistré · " + f0(itemTotals(items).kcal) + " kcal");
}
function saveExpress(level) {
  const s = SLOTS.find(x => x.k === C.slot), big = C.slot === "midi" || C.slot === "soir";
  C.items = [{ fixed: true, e: "🍽️", n: ["Repas léger", "Repas normal", "Repas copieux"][level] + " (sans détail)", d: "estimation rapide", kcal: round50(kcalTarget() * s.share * [0.7, 1, 1.4][level]), prot: big ? [25, 35, 45][level] : [6, 10, 14][level] }];
  saveMeal();
}
async function resizeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const sc = Math.min(1, 1280 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(b => res(b), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Analyse par Claude ---------- */
const ANALYSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["meals", "walk_min", "weight_kg", "whey_doses", "creatine", "pain", "conseil"],
  properties: {
    meals: { type: "array", items: { type: "object", additionalProperties: false, required: ["slot", "items"], properties: {
      slot: { type: "string", enum: ["matin", "midi", "gouter", "soir"] },
      items: { type: "array", items: { type: "object", additionalProperties: false, required: ["e", "n", "q", "kcal", "prot"], properties: {
        e: { type: "string" }, n: { type: "string" }, q: { type: "string" }, kcal: { type: "number" }, prot: { type: "number" } } } } } } },
    walk_min: { type: "integer" }, weight_kg: { type: "number" }, whey_doses: { type: "integer" }, creatine: { type: "boolean" }, pain: { type: "integer" }, conseil: { type: "string" }
  }
};
function systemPrompt() {
  const p = S.profile;
  return `Tu es le diététicien du sport de l'app Carnet de sèche. Tu transformes ce que l'utilisateur dit ou montre en données à enregistrer.
Profil : ${p.sex === "f" ? "femme" : "homme"}, ${p.age} ans, ${p.heightCm} cm, environ ${f0(currentKg())} kg, objectif ${f1(p.goalKg)} kg. Cible ${f0(kcalTarget())} kcal et ${p.prot} g de protéines par jour.
${p.context ? "Ce qu'il faut savoir sur lui : " + p.context : ""}
Règles :
- Repas : découpe en aliments, estime des portions françaises réalistes quand rien n'est pesé, valeurs pour des aliments cuits. Compte le beurre ou l'huile de cuisson quand c'est mentionné ou visible ; le gras caché est souvent sous-estimé, donc en cas de doute prends le haut de la fourchette. Pour un produit de marque (Kinder, Pitch, Prince, madeleine St Michel…), utilise les valeurs de l'emballage par unité.
- Créneau : "matin", "midi", "gouter" ou "soir". Déduis-le des mots (« ce matin », « au goûter », « ce soir ») ; sinon utilise le créneau par défaut donné.
- walk_min : minutes de marche ou de vélo mentionnées, sinon 0. weight_kg : poids mentionné, sinon 0. whey_doses : nombre de shakers de whey mentionnés, sinon 0 (ne les mets pas dans les repas). creatine : true seulement si la créatine est mentionnée. pain : douleur notée sur 10 si mentionnée, sinon -1.
- conseil : une phrase concrète et bienveillante en français pour faire mieux la prochaine fois, ou "" si tout va bien.
- Ne invente rien qui n'est pas dit ou visible.`;
}
async function analyse(text, photo, slot) {
  const content = [];
  if (photo) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await blobToBase64(photo) } });
  content.push({ type: "text", text: `Créneau par défaut : ${slot}. Heure : ${new Date().toTimeString().slice(0, 5)}.\nCe qu'il dit : ${text || "(rien, regarde la photo)"}` });
  return askJSON({ system: systemPrompt(), content, schema: ANALYSE_SCHEMA });
}
// Sans clé : reconnaissance simple des aliments de la liste
const NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, demi: 0.5 };
function localParse(text, slot) {
  const t = " " + norm(text).replace(/[,.;!?]/g, " ") + " ";
  const items = [];
  const taken = new Set();
  FOODS.filter(f => f.kw).flatMap(f => f.kw.map(k => [f, k])).sort((a, b) => b[1].length - a[1].length).forEach(([f, k]) => {
    if (taken.has(f.k)) return;
    const re = new RegExp("(?:(\\d+(?:[.,]\\d+)?|un|une|deux|trois|quatre|cinq|six|demi)\\s+(?:\\w+\\s+){0,2})?" + k.replace(/ /g, "\\s+") + "s?\\b");
    const m = t.match(re);
    if (!m) return;
    if (FOODS.some(o => taken.has(o.k) && o.kw && o.kw.some(kk => kk.includes(k) && kk !== k))) return;
    taken.add(f.k);
    const n = m[1] ? (NUM[m[1]] || parseFloat(m[1].replace(",", "."))) : 1;
    items.push(calcItem(f.u === "g" ? newItem(f.k) : newItem(f.k, { cnt: n })));
  });
  const walk = t.match(/(\d+)\s*(?:min|minutes)\s*(?:de\s+)?(?:marche|velo)/);
  const kg = t.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:kg|kilos)/);
  return { meals: items.length ? [{ slot, items: items.map(i => ({ e: i.e, n: i.n, q: i.d, kcal: i.kcal, prot: i.prot })) }] : [], walk_min: walk ? +walk[1] : 0, weight_kg: kg ? parseFloat(kg[1].replace(",", ".")) : 0, whey_doses: /whey|shaker|proteine en poudre/.test(t) ? 1 : 0, creatine: /creatine/.test(t), pain: -1, conseil: "", local: true };
}

/* Revue de ce qui a été compris */
let R = null;
async function runAnalysis(text, photo) {
  const slot = UI.date === today() ? defaultSlot() : "midi";
  openShell();
  R = { busy: true, text, data: null, err: "", fresh: true, date: UI.date };
  renderReview();
  const r = R;
  try {
    r.data = hasKey() ? await analyse(text, photo, slot) : localParse(text, slot);
  } catch (e) { r.err = explain(e); r.data = localParse(text || "", slot); r.data.local = true; }
  if (R !== r) return;
  r.busy = false;
  r.data.meals.forEach(m => m.items.forEach(it => { it.keep = true; }));
  r.keep = { walk: r.data.walk_min > 0, weight: r.data.weight_kg > 0, whey: r.data.whey_doses > 0, crea: !!r.data.creatine, pain: r.data.pain >= 0 };
  renderReview();
}
function renderReview() {
  const s = $("sheet"); s.hidden = false;
  let body = "", foot = "";
  if (R.busy) body = `<div style="display:grid;justify-items:center;gap:14px;padding:30px 0;text-align:center"><span class="spin" style="width:40px;height:40px"></span><p>« ${esc(R.text)} »</p><span class="mono muted">${hasKey() ? "Claude analyse" : "Recherche dans la liste"}</span></div>`;
  else {
    const d = R.data, k = R.keep;
    if (R.err) body += `<div class="note">${esc(R.err)} J'ai cherché dans la liste à la place.</div>`;
    else if (d.local && !hasKey()) body += `<div class="note info">Sans clé API, je reconnais seulement les aliments de la liste. Ajoute ta clé dans Réglages pour que Claude comprenne tout.</div>`;
    body += `<p class="small muted">« ${esc(R.text)} »</p>`;
    d.meals.forEach((m, mi) => {
      const sl = SLOTS.find(x => x.k === m.slot) || SLOTS[1];
      body += `<div class="slot"><div class="slot-head ${sl.col}"><b>${sl.n}</b><span class="tag t-none">${f0(m.items.filter(i => i.keep).reduce((a, i) => a + (+i.kcal || 0), 0))} kcal</span></div><div class="slot-body">${m.items.map((it, ii) => `<div class="item" style="${it.keep ? "" : "opacity:.4"}"><span class="emo">${esc(it.e || "🍽️")}</span><span>${esc(it.n)}<small>${esc(it.q)}</small></span><span class="row" style="gap:4px;flex-wrap:nowrap"><input class="kcalin" type="number" inputmode="numeric" id="rv-${mi}-${ii}" data-rm="${mi}" data-ri="${ii}" value="${Math.round(it.kcal)}" aria-label="Calories de ${esc(it.n)}" style="width:72px"><button class="x" data-act="rv-toggle" data-m="${mi}" data-i="${ii}" aria-label="${it.keep ? "Retirer" : "Remettre"} ${esc(it.n)}">${it.keep ? "×" : "↺"}</button></span></div>`).join("")}</div></div>`;
    });
    const extra = [];
    if (d.walk_min > 0) extra.push(["walk", `🚶 ${d.walk_min} min de marche ou vélo`]);
    if (d.weight_kg > 0) extra.push(["weight", `⚖️ Pesée : ${f1(d.weight_kg)} kg`]);
    if (d.whey_doses > 0 && activePowders().length) extra.push(["whey", `💪 ${esc(activePowders()[0].n)} × ${d.whey_doses}`]);
    if (d.creatine) extra.push(["crea", "⚡ Créatine prise"]);
    if (d.pain >= 0) extra.push(["pain", `🩹 Douleur ${d.pain}/10`]);
    if (extra.length) body += `<div class="card" style="gap:8px">${extra.map(([key, label]) => `<div class="row between"><span>${label}</span><button class="toggle" data-act="rv-extra" data-k="${key}" aria-pressed="${!!k[key]}" aria-label="Enregistrer : ${esc(label)}"></button></div>`).join("")}</div>`;
    if (!d.meals.length && !extra.length) body += `<div class="empty">Je n'ai rien reconnu. Réessaie en donnant les aliments, ou choisis dans la liste.</div><button class="btn" data-act="rv-list">Choisir dans la liste</button>`;
    if (d.conseil) body += `<div class="blk b-lilac"><span class="mono">Conseil</span><p>${esc(d.conseil)}</p></div>`;
    const tot = d.meals.flatMap(m => m.items).filter(i => i.keep).reduce((a, i) => a + (+i.kcal || 0), 0);
    foot = `<div><div class="big" style="font-size:28px">${f0(tot)} kcal</div><div class="small muted">${UI.date === today() ? "pour aujourd'hui" : "pour le " + fmtD(UI.date, true)}</div></div><button class="btn hot" data-act="rv-save">Tout enregistrer</button>`;
  }
  s.innerHTML = sheetHTML({ title: R.busy ? "J'écoute ce que tu as dit…" : "Voilà ce que j'ai compris", body, foot, enter: R.fresh, id: "rv-title" });
  if (R.fresh) $("sheet-close").focus();
  R.fresh = false;
}
function saveReview() {
  const d = R.data, k = R.keep, date = R.date || UI.date;
  if (!S.days[date]) S.days[date] = day(date);
  const D = S.days[date];
  let n = 0;
  d.meals.forEach(m => {
    const items = m.items.filter(i => i.keep && (+i.kcal > 0 || +i.prot > 0)).map(i => ({ e: i.e, n: i.n, d: i.q, kcal: Math.round(+i.kcal), prot: Math.round((+i.prot || 0) * 10) / 10 }));
    if (items.length) { D.meals.push({ id: uid(), slot: m.slot, items, tip: d.conseil || "" }); n += items.length; }
  });
  if (k.walk) D.walk = (D.walk || 0) + d.walk_min;
  if (k.weight) D.kg = d.weight_kg;
  if (k.whey || k.crea) D.supp = { ...(D.supp || {}) };
  if (k.whey && activePowders().length) { const id = activePowders()[0].id; D.supp.p = { ...(D.supp.p || {}), [id]: dosesOf(D, id) + d.whey_doses }; }
  if (k.crea) D.supp.crea = true;
  if (k.pain) D.pain = clamp(d.pain, 0, 10);
  saveDay(date); closeSheet(); UI.tab = "jour"; render();
  toast(n ? `${n} aliment${n > 1 ? "s" : ""} enregistré${n > 1 ? "s" : ""}` : "Enregistré");
}

/* ---------- Vocal ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const STANDALONE = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
let REC = null;
// Sur iPhone, une appli installée n'a souvent pas accès à la reconnaissance vocale du navigateur : on passe alors par la dictée du clavier
function openVoice() {
  const L = $("listen");
  L.hidden = false; L.className = "listen";
  document.body.classList.add("lock");
  const useSR = !!SR && !(IOS && STANDALONE);
  REC = { rec: null, on: false, useSR };
  L.innerHTML = `<div class="mid">
      <span class="mono" id="v-hint">${useSR ? "Je t'écoute…" : "Touche le 🎤 de ton clavier et parle"}</span>
      ${useSR ? `<button class="orb" data-act="voice-toggle" aria-label="Arrêter ou reprendre l'écoute">${ICON_MIC}</button>` : ""}
      <label class="sr" for="voice-text">Ce que tu as mangé ou fait</label>
      <textarea id="voice-text" class="said-box" placeholder="Ex. : ce soir, filet mignon au beurre avec deux coings poêlés"></textarea>
      <span class="small">Tu peux corriger le texte avant d'analyser.</span>
    </div>
    <div class="acts"><button class="btn" data-act="voice-cancel">Annuler</button><button class="btn ink" data-act="voice-done">Analyser</button></div>`;
  if (useSR) startRec(); else setTimeout(() => { const t = $("voice-text"); if (t) t.focus(); }, 60);
}
function voiceHint(t) { const h = $("v-hint"); if (h) h.textContent = t; }
function startRec() {
  const ta = $("voice-text"), L = $("listen");
  let rec;
  try { rec = new SR(); } catch (e) { REC.useSR = false; voiceHint("Touche le 🎤 de ton clavier et parle"); ta.focus(); return; }
  rec.lang = "fr-FR"; rec.interimResults = true; rec.continuous = true;
  const base = ta.value.trim() ? ta.value.trim() + " " : "";
  let fin = "", heard = false;
  rec.onresult = ev => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) fin += r[0].transcript + " "; else interim += r[0].transcript; }
    heard = true;
    ta.value = (base + fin + interim).trim();
  };
  rec.onerror = ev => {
    voiceHint(ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "Micro refusé ici : touche le 🎤 de ton clavier et parle" : ev.error === "no-speech" ? "Je n'ai rien entendu : touche le micro rouge pour réessayer" : "Le micro a coupé : touche le micro rouge, ou dicte au clavier");
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") ta.focus();
  };
  rec.onend = () => {
    if (!REC || REC.rec !== rec) return;
    REC.on = false; L.className = "listen";
    if (heard && ta.value.trim()) voiceHint("Vérifie le texte, puis touche Analyser");
    else if ($("v-hint").textContent === "Je t'écoute…") voiceHint("Touche le micro rouge pour parler, ou dicte au clavier");
  };
  REC.rec = rec;
  try { rec.start(); REC.on = true; L.className = "listen on"; voiceHint("Je t'écoute…"); }
  catch (e) { voiceHint("Touche le 🎤 de ton clavier et parle"); ta.focus(); }
}
function closeVoice() {
  if (REC && REC.rec) { REC.rec.onend = null; REC.rec.onerror = null; try { REC.rec.abort(); } catch (e) {} }
  REC = null; $("listen").hidden = true; $("listen").innerHTML = "";
  if ($("sheet").hidden) document.body.classList.remove("lock");
}
function voiceDone() {
  const text = (($("voice-text") || {}).value || "").trim();
  if (!text) { voiceHint("Rien à analyser : parle ou écris d'abord"); return; }
  closeVoice();
  runAnalysis(text, null);
}

/* ---------- Comment c'est calculé ---------- */
function openHow() {
  fresh(); openShell();
  const p = S.profile, kg = currentKg(), b = bmr(kg), ad = adaptive(), t = kcalTarget(), act = String(activity()).replace(".", ",");
  const adaptTxt = ad.ready
    ? `<p>Après ${ad.days} jours, l'app compare ce que tu as noté (${f0(ad.intake)} kcal par jour en moyenne sur 14 jours) à l'évolution de ton poids tendance (${ad.dT <= 0 ? "−" : "+"}${f1(Math.abs(ad.dT))} kg). Elle en déduit ta dépense réelle : <b>${f0(ad.raw)} kcal</b>, mélangée à la formule à ${Math.round(ad.w * 100)} % pour l'instant.</p><div class="eq">Dépense retenue ≈ ${f0(ad.tdee)} kcal</div>`
    : ad.reason === "saisie" ? `<p>Pour mesurer ta dépense réelle, il faut au moins 10 jours notés sur les 14 derniers (${ad.logged} pour l'instant). En attendant, l'app garde la formule.</p>`
    : `<p>À partir du 14e jour (jour ${ad.days} aujourd'hui), l'app compare ce que tu notes à l'évolution de ton poids pour mesurer ta vraie dépense. Même si tu sous-estimes un peu tes repas, ça se compense : il suffit de noter toujours de la même façon.</p>`;
  const st = (n, inner) => `<div class="step"><span class="n">${n}</span><div>${inner}</div></div>`;
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: "Comment c'est calculé", id: "how-title", enter: true, body: `<div class="calc" style="display:grid;gap:16px">
    ${st(1, `<p><b>Ce que ton corps brûle au repos.</b> Formule de Mifflin-St Jeor, la plus fiable sans mesure en labo (± 10 %) :</p><div class="eq">10 × ${f1(kg)} + 6,25 × ${p.heightCm} − 5 × ${p.age} ${p.sex === "f" ? "− 161" : "+ 5"} = ${f0(b)} kcal</div>`)}
    ${st(2, `<p><b>Ta dépense sur une journée.</b> On multiplie par ${act}${conva() ? " (convalescence)" : " : travail plutôt assis, 3 séances et de la marche"}.</p><div class="eq">${f0(b)} × ${act} = ${f0(ad.mif)} kcal</div>`)}
    ${st(3, `<p><b>Ta dépense mesurée.</b></p>${adaptTxt}`)}
    ${st(4, `<p><b>Le déficit.</b> On retire ${deficit()} kcal par jour. 1 kg de gras vaut environ 7 700 kcal, donc ${deficit()} × 7 = ${f0(deficit() * 7)} kcal par semaine, soit environ ${f1(deficit() * 7 / KCAL_PER_KG)} kg de gras.</p><div class="eq">${f0(maintenance())} − ${deficit()} ≈ ${f0(t)} kcal${p.kcalManual ? " (réglée à la main)" : ""}</div>`)}
    ${st(5, `<p><b>Ce que tu manges.</b> Chaque aliment de la liste a une valeur de référence (Ciqual de l'ANSES, emballages). Portion × valeur = calories, et le beurre de cuisson s'ajoute. À la voix, en texte ou en photo, Claude fait le même travail et te montre la quantité estimée : tu peux corriger avant d'enregistrer.</p><div class="eq">1 madeleine ≈ 110 · 1 Kinder Joy ≈ 110 · 1 pêche ≈ 50</div>`)}
    ${st(6, `<p><b>Tes compléments.</b> ${activePowders().length ? activePowders().map(w => `Une dose de ${esc(w.n)} (${fkg(w.g)} g) compte pour ${fkg(w.kcal)} kcal et ${fkg(w.prot)} g de protéines.`).join(" ") : "Aucune poudre réglée."} La créatine n'a pas de calories.</p>`)}
    ${st(7, `<p><b>La précision.</b> Un repas estimé à l'œil est juste à 15 ou 20 % près. Le juge, c'est ton poids tendance. Si la perte stagne deux semaines (hors première semaine), vérifie d'abord la saisie, puis retire 150 à 200 kcal ou ajoute 15 min de vélo.</p>`)}
  </div>`, foot: `<span class="small muted">Réglages dans l'onglet ⚙︎</span><button class="btn hot" data-act="close-sheet">Compris</button>` });
  $("sheet-close").focus();
}

/* ---------- Bilan ---------- */
async function coach() {
  if (UI.coachBusy) return;
  if (!hasKey()) { toast("Ajoute ta clé API pour le bilan"); $("api-key") && $("api-key").focus(); return; }
  UI.coachBusy = true; UI.coach = ""; render();
  fresh();
  const lines = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today(), -i), D = day(d), t = dayTotals(d), s = sessionOn(d);
    lines.push(`${d} : ${hasFood(d) ? f0(t.kcal) + " kcal, " + f0(t.prot) + " g prot. (" + D.meals.map(m => m.slot + ": " + m.items.map(it => it.n + " " + (it.d || "")).join(" + ")).join(" | ") + (totalDoses(D) ? " | protéine en poudre x" + totalDoses(D) : "") + ")" : "repas non notés"} ; marche/vélo ${D.walk || 0} min ; pas ${D.steps != null ? D.steps : "—"} ; sommeil ${sleepH(D) != null ? fmtH(sleepH(D)) : "—"} ; poids ${D.kg || "—"}${S.profile.tendon ? " ; douleur " + (D.pain == null ? "—" : D.pain + "/10") : ""} ; séance : ${s ? tplOf(s.tpl).n : "aucune"}`);
  }
  const tr = trendPerWeek(), ad = adaptive();
  const prompt = `Voici mes 7 derniers jours. Poids tendance ${f1(currentKg())} kg, rythme ${tr == null ? "inconnu" : f1(tr) + " kg/semaine"}${ad.ready ? ", dépense mesurée " + f0(ad.raw) + " kcal/jour" : ""}${conva() ? ", je suis en convalescence" : ""}.
${lines.join("\n")}
Réponds en français, texte simple sans markdown ni titres, 150 mots maximum : une phrase de constat honnête et encourageante, puis trois actions concrètes numérotées pour la semaine qui vient, adaptées à ma situation. Tutoie-moi.`;
  try {
    UI.coach = await askText({ system: systemPrompt().split("Règles :")[0] + "Tu es aussi son coach en musculation.", prompt, onText: txt => { UI.coach = txt; const el = $("coach-out"); if (el) el.textContent = txt; } });
  } catch (e) { UI.coach = explain(e); }
  UI.coachBusy = false; render();
}

/* ---------- Apple Santé (via un raccourci iOS) ---------- */
const SITE = location.origin + location.pathname;
const num = v => { if (v == null) return null; const n = parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
function parseHealth(text) {
  if (!text) return null;
  let t = String(text);
  try { t = decodeURIComponent(t); } catch (e) {}
  const i = t.indexOf("sante?");
  if (i >= 0) t = t.slice(i + 6);
  const q = {};
  t.split("&").forEach(kv => { const j = kv.indexOf("="); if (j > 0) q[kv.slice(0, j).trim().toLowerCase()] = kv.slice(j + 1); });
  const o = { pas: num(q.pas), ex: num(q.exercice != null ? q.exercice : q.marche), actif: num(q.actif), poids: num(q.poids), date: (q.date || "").trim() };
  return o.pas == null && o.ex == null && o.actif == null && o.poids == null ? null : o;
}
function applyHealth(o) {
  const d = o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && o.date <= today() ? o.date : today();
  if (!S.days[d]) S.days[d] = day(d);
  const D = S.days[d], done = [];
  if (o.pas != null) { D.steps = Math.round(o.pas); done.push(f0(D.steps) + " pas"); }
  if (o.ex != null) { D.walk = Math.max(D.walk || 0, Math.round(o.ex)); done.push(Math.round(o.ex) + " min"); }
  if (o.actif != null) { D.activeKcal = Math.round(o.actif); done.push(f0(D.activeKcal) + " kcal actives"); }
  if (o.poids != null && o.poids > 30 && o.poids < 300) { D.kg = Math.round(o.poids * 10) / 10; done.push(f1(D.kg) + " kg"); }
  saveDay(d); UI.date = d; UI.tab = "jour"; render();
  toast("⌚ Santé : " + done.join(", "));
}
function checkHealthHash() {
  if (!location.hash.startsWith("#sante")) return;
  const o = parseHealth(location.hash);
  history.replaceState(null, "", location.pathname);
  if (o && S.profile.setup) applyHealth(o);
}
async function healthPaste() {
  let txt = "";
  try { txt = await navigator.clipboard.readText(); } catch (e) {}
  const o = parseHealth(txt);
  if (o) { applyHealth(o); return; }
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: "Importer d'Apple Santé", id: "hp-title", enter: true, body: `<p class="small">Lance ton raccourci « Santé vers Sèche », puis colle ici ce qu'il a copié.</p><textarea id="hp-text" placeholder="pas=8123&exercice=34&actif=520&poids=91.2"></textarea>`, foot: `<span></span><button class="btn hot" data-act="health-apply">Importer</button>` });
  $("hp-text").focus();
}
function healthHelpHTML() {
  const url = SITE + "#sante?pas=[Pas]&exercice=[Minutes]&actif=[Énergie]&poids=[Poids]";
  return `<section class="card"><h3>⌚ Apple Santé</h3>
    <p class="small">Un raccourci iPhone lit tes pas, tes minutes d'exercice, tes calories actives et ta pesée dans Santé, puis les envoie ici. À créer une seule fois dans l'app <b>Raccourcis</b> :</p>
    <ol class="rlist">
      <li>Nouveau raccourci, nomme-le « Santé vers Sèche ».</li>
      <li>Action <b>Rechercher des échantillons de santé</b> : type <i>Pas</i>, date de début <i>aujourd'hui</i>. Puis <b>Calculer les statistiques</b> → <i>Somme</i>. Renomme le résultat « Pas ».</li>
      <li>Pareil avec le type <i>Minutes d'exercice</i> (résultat « Minutes ») et <i>Énergie active</i> (résultat « Énergie »).</li>
      <li><b>Rechercher des échantillons de santé</b> : type <i>Poids</i>, date de début <i>aujourd'hui</i>, limite <i>1</i>. Renomme-le « Poids » (vide si tu ne t'es pas pesé).</li>
      <li>Action <b>Texte</b> avec l'adresse ci-dessous, en remplaçant chaque mot entre crochets par la variable du même nom.</li>
      <li>Action <b>Copier dans le presse-papiers</b>.</li>
      <li>Dans l'appli, touche <b>⌚ Importer</b> sur l'écran du jour.</li>
    </ol>
    <div class="calc"><div class="eq" style="word-break:break-all">${esc(url)}</div></div>
    <button class="btn small" data-act="copy-health-url">Copier l'adresse</button>
    <p class="small muted">Si tu utilises l'appli dans Safari plutôt qu'installée, remplace l'étape 6 par <b>Ouvrir les URL</b> : l'import se fait tout seul. Les calories actives sont affichées pour info mais ne s'ajoutent pas à ton budget : la montre les surestime souvent, et ta cible tient déjà compte de ton activité.</p></section>`;
}

/* ---------- Sauvegarde en ligne (gist secret chiffré) ---------- */
let cloudTimer = null, cloudBusy = false;
function scheduleCloud() {
  const c = cloudCfg(); if (!c || !c.on) return;
  clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudPush(false), 20000);
}
async function cloudPush(manual) {
  const c = cloudCfg(); if (!c || !c.on || cloudBusy) return;
  clearTimeout(cloudTimer); cloudTimer = null; cloudBusy = true;
  try {
    const id = await pushBackup(c, S, { force: manual === "force" });
    setCloudCfg({ ...cloudCfg(), gistId: id, last: new Date().toISOString(), err: "" });
    if (manual) toast("☁️ Sauvegardé en ligne");
  } catch (e) {
    setCloudCfg({ ...cloudCfg(), err: cloudError(e), conflict: e && e.status === "conflict" });
    if (manual) toast(cloudError(e));
  }
  cloudBusy = false;
  if (UI.tab === "plan" && $("sheet").hidden) render();
}
function cloudHTML() {
  const c = cloudCfg();
  if (c && c.on) {
    const last = c.last ? new Date(c.last) : null;
    return `<section class="card"><h3>☁️ Sauvegarde en ligne</h3>
      <p class="small"><span class="tag t-ok">Activée</span> ${last ? "Dernière sauvegarde le " + fmtD(iso(last)) + " à " + last.toTimeString().slice(0, 5) + "." : "Première sauvegarde en cours."}</p>
      ${c.err ? `<div class="note">${esc(c.err)}${c.conflict ? `<div class="row" style="margin-top:8px"><button class="btn small" data-act="cloud-restore">Récupérer la plus récente</button><button class="btn small" data-act="cloud-force">Garder ce téléphone</button></div>` : ""}</div>` : ""}
      <p class="small muted">Tes données sont chiffrées sur ce téléphone puis rangées dans un gist secret de ton compte GitHub, quelques secondes après chaque modification.</p>
      <div class="row"><button class="btn small sun" data-act="cloud-now">Sauvegarder maintenant</button><button class="btn small" data-act="cloud-restore">Restaurer</button><button class="btn small flat" data-act="cloud-off">Désactiver</button></div></section>`;
  }
  return `<section class="card"><h3>☁️ Sauvegarde en ligne</h3>
    <p class="small">Pour ne rien perdre si tu changes ou casses ton téléphone. Tes données sont <b>chiffrées sur ce téléphone</b> avec un code que toi seul connais, puis rangées dans un gist secret de ton compte GitHub.</p>
    <details class="learn"><summary>Créer ton jeton GitHub (une fois, 2 min)</summary><ol class="rlist">
      <li>Sur github.com, ouvre <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b>, puis <b>Generate new token</b>.</li>
      <li>Nom : « Carnet de sèche ». Durée : 1 an.</li>
      <li>Dans <b>Account permissions</b>, mets <b>Gists</b> sur <b>Read and write</b>. Rien d'autre.</li>
      <li><b>Generate token</b>, copie-le (il commence par github_pat_) et colle-le ci-dessous.</li></ol></details>
    <label class="field" for="cl-token">Jeton GitHub<input id="cl-token" type="password" autocomplete="off" placeholder="github_pat_…"></label>
    <label class="field" for="cl-pass">Code de sauvegarde (8 caractères minimum)<input id="cl-pass" type="password" autocomplete="new-password" placeholder="Une phrase que tu retiendras"></label>
    <p class="small muted">Note ce code quelque part (Notes, gestionnaire de mots de passe) : sans lui, la sauvegarde est illisible, même pour toi.</p>
    <div class="row"><button class="btn sun" data-act="cloud-on">Activer la sauvegarde</button><button class="btn small" data-act="cloud-restore">J'ai déjà une sauvegarde</button></div></section>`;
}
async function cloudEnable() {
  const token = ($("cl-token") || {}).value.trim(), pass = ($("cl-pass") || {}).value;
  if (!token) { toast("Colle ton jeton GitHub"); return; }
  if (!pass || pass.length < 8) { toast("Choisis un code de 8 caractères minimum"); return; }
  toast("☁️ Vérification…");
  try {
    const found = await findBackup({ token });
    if (found) { setCloudCfg({ token, pass, gistId: found.id, last: null, on: false, err: "" }); openCloudRestore(found.at); return; }
  } catch (e) { toast(cloudError(e)); return; }
  setCloudCfg({ token, pass, gistId: null, last: null, on: true, err: "" });
  await cloudPush(true);
  render();
}
function openCloudRestore(foundAt) {
  const c = cloudCfg() || {};
  if (!$("sheet").hidden) closeSheet();
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: "Restaurer ma sauvegarde", id: "cr-title", enter: true, body: `<p class="small">Récupère tes données depuis ta sauvegarde en ligne. Ce qui est sur ce téléphone sera remplacé.</p>
    <label class="field" for="cr-token">Jeton GitHub<input id="cr-token" type="password" autocomplete="off" value="${esc(c.token || "")}" placeholder="github_pat_…"></label>
    <label class="field" for="cr-pass">Code de sauvegarde<input id="cr-pass" type="password" autocomplete="current-password" value="${esc(c.pass || "")}"></label>
    ${typeof foundAt === "string" ? `<div class="note info">Une sauvegarde du ${fmtD(iso(new Date(foundAt)), true)} à ${new Date(foundAt).toTimeString().slice(0, 5)} existe déjà sur ce compte. Restaure-la, ou remplace-la par les données de ce téléphone.</div>` : ""}
    <div id="cr-msg"></div>`, foot: `${typeof foundAt === "string" ? `<button class="btn" data-act="cloud-replace">Remplacer</button>` : `<span></span>`}<button class="btn hot" data-act="cloud-pull">Restaurer</button>` });
  $("cr-token").focus();
}
async function cloudRestore(btn) {
  const token = $("cr-token").value.trim(), pass = $("cr-pass").value, msg = $("cr-msg");
  if (!token || !pass) { msg.innerHTML = `<div class="note">Remplis le jeton et le code.</div>`; return; }
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
  try {
    const old = cloudCfg() || {};
    const r = await pullBackup({ token, pass, gistId: old.token === token ? old.gistId : null });
    if (!r) { msg.innerHTML = `<div class="note">Aucune sauvegarde trouvée sur ce compte GitHub.</div>`; btn.disabled = false; btn.textContent = "Restaurer"; return; }
    if (!r.data || !r.data.profile) throw new Error();
    S = { profile: { ...BLANK_PROFILE, v: 0, ...r.data.profile }, days: r.data.days || {}, sessions: r.data.sessions || {} };
    migrate(); save();
    setCloudCfg({ token, pass, gistId: r.id, last: r.at, on: true, err: "" });
    closeSheet(); UI.tab = "jour"; UI.date = today(); render();
    toast(`Restauré : ${Object.keys(S.days).length} jours, ${Object.keys(S.sessions).length} séances`);
  } catch (e) {
    msg.innerHTML = `<div class="note">${esc(cloudError(e))}</div>`;
    btn.disabled = false; btn.textContent = "Restaurer";
  }
}

/* ---------- Import / export ---------- */
function showCopyBox(txt) {
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: "Copier mes données", id: "cp-title", enter: true, body: `<p class="small">Sélectionne tout le texte ci-dessous et copie-le, puis colle-le dans l'app installée.</p><textarea id="cp-text" readonly style="min-height:200px;font-family:var(--f-mono);font-size:11px">${esc(txt)}</textarea>`, foot: `<span></span><button class="btn hot" data-act="close-sheet">Fermer</button>` });
  const t = $("cp-text"); t.focus(); t.select();
}
function openImport() {
  openShell();
  $("sheet").hidden = false;
  $("sheet").innerHTML = sheetHTML({ title: "Importer mes données", id: "imp-title", enter: true, body: `<p class="small">Colle le texte copié depuis l'ancienne version, ou choisis un fichier exporté. Une sauvegarde complète remplace ce qui est sur ce téléphone ; un fichier de profil seul le complète.</p>
    <textarea id="imp-text" placeholder='{"profile": …}' style="min-height:160px;font-family:var(--f-mono);font-size:12px"></textarea>
    <label class="btn" for="imp-file">Choisir un fichier</label><input id="imp-file" type="file" accept="application/json,.json,.txt" hidden>`, foot: `<span></span><button class="btn hot" data-act="do-import">Importer</button>` });
  $("imp-text").focus();
}
function doImport(txt) {
  try {
    const j = JSON.parse(txt);
    if (!j || !j.profile) throw new Error();
    if (!j.days) {
      // Fichier de profil seul : il complète ce qui est déjà là sans effacer les repas ni les séances
      const jp = { ...j.profile };
      if (S.profile.v >= 5 && powders().length) delete jp.whey;
      S.profile = { ...BLANK_PROFILE, ...S.profile, ...jp, v: 4 };
      S.profile.setup = !!(S.profile.heightCm && S.profile.age && S.profile.startKg && S.profile.startDate && S.profile.goalKg && S.profile.goalDate);
      migrate(); save();
      if (!S.profile.setup) toast("Profil importé : complète les infos qui manquent"); closeSheet(); UI.tab = "jour"; UI.date = today(); render();
      toast("Profil importé");
      return;
    }
    S = { profile: { ...BLANK_PROFILE, v: 0, ...j.profile }, days: j.days || {}, sessions: j.sessions || {} };
    migrate(); save(); closeSheet(); UI.tab = "jour"; UI.date = today(); render();
    toast(`Importé : ${Object.keys(S.days).length} jours, ${Object.keys(S.sessions).length} séances`);
  } catch (e) { toast("Ce texte n'est pas une sauvegarde valide"); }
}
function doExport() {
  S.profile.lastExport = today(); save();
  const txt = JSON.stringify(S, null, 1);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
  a.download = "carnet-de-seche-" + today() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (UI.tab === "jour") render();
  try { navigator.clipboard.writeText(txt).then(() => toast("Sauvegarde téléchargée et copiée")); } catch (e) { toast("Sauvegarde téléchargée"); }
}

/* ---------- Événements ---------- */
function goTab(t) { UI.tab = t; if (t !== "corps") UI.editProgram = false; render(); window.scrollTo(0, 0); }
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "quick-form") {
    const inp = $("quick-in"), v = inp.value.trim(); inp.value = ""; inp.blur();
    if (!v) { openComposer({}); return; }
    runAnalysis(v, null);
  }
  if (e.target.id === "onb-form") {
    const g = id => $(id).value;
    const sex = $("sex-f").getAttribute("aria-pressed") === "true" ? "f" : "h";
    const kg = parseFloat(g("o-w").replace(",", ".")), goal = parseFloat(g("o-g").replace(",", "."));
    if (!(goal < kg)) { toast("L'objectif doit être sous ton poids actuel"); return; }
    if (!(g("o-d") > today())) { toast("Choisis une date d'objectif dans le futur"); return; }
    const keep = S.profile;
    S.profile = { ...BLANK_PROFILE, ...keep, setup: true, sex, heightCm: +g("o-h"), age: +g("o-a"), startKg: kg, startDate: today(), goalKg: goal, goalDate: g("o-d"), prot: round5(2 * goal), tendon: $("o-t").checked || !!keep.tendon, context: g("o-c").trim() || keep.context || "" };
    S.days[today()] = { ...day(today()), kg, u: Date.now() };
    save(); render(); toast("C'est parti !");
  }
});
document.addEventListener("pointerdown", e => { SH.down = e.target; });
document.addEventListener("click", e => {
  const tb = e.target.closest(".tabbar [data-tab]");
  if (tb) { if (tb.dataset.tab === "jour" && UI.tab === "jour") UI.date = today(); if (tb.dataset.tab === "corps") UI.noResume = false; goTab(tb.dataset.tab); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act;
  if (act === "sheet-back" && (e.target !== a || SH.down !== a)) return;
  const D = () => { if (!S.days[UI.date]) S.days[UI.date] = day(UI.date); return S.days[UI.date]; };
  switch (act) {
    case "go": if (!$("sheet").hidden) closeSheet(); goTab(a.dataset.tab); break;
    case "onb-sex": ["h", "f"].forEach(x => $("sex-" + x).setAttribute("aria-pressed", String(x === a.dataset.v))); break;
    case "week": { const n = addDays(UI.date, +a.dataset.v); UI.date = n > today() ? today() : n; render(); break; }
    case "pickday": UI.date = a.dataset.d; render(); break;
    case "openday": UI.date = a.dataset.d; goTab("jour"); break;
    case "month": { const [y, m] = UI.month.split("-").map(Number); UI.month = iso(new Date(y, m - 1 + +a.dataset.v, 1)).slice(0, 7); render(); break; }
    case "how": openHow(); break;
    case "go-corps": UI.noResume = false; goTab("corps"); break;
    case "go-weigh": goTab("progres"); setTimeout(() => { const el = $("weighin-input"); if (el) el.focus(); }, 50); break;
    case "go-coach": goTab("plan"); setTimeout(() => { const el = $("bilan"); if (el) el.scrollIntoView({ behavior: "smooth" }); coach(); }, 50); break;
    case "voice": openVoice(); break;
    case "voice-toggle": if (REC && REC.useSR) { if (REC.on && REC.rec) { try { REC.rec.stop(); } catch (err) {} } else startRec(); } break;
    case "voice-cancel": closeVoice(); break;
    case "voice-done": voiceDone(); break;
    case "add-meal": openComposer({ slot: a.dataset.slot }); break;
    case "add-photo": openComposer({ mode: "ai" }); { const inp = $("c-photo"); if (inp) inp.click(); } break;
    case "pick-photo": { const inp = $("c-photo"); if (inp) inp.click(); break; }
    case "edit-meal": { const m = day(UI.date).meals.find(x => x.id === a.dataset.id); if (m) openComposer({ id: m.id, slot: m.slot, items: m.items, tip: m.tip }); break; }
    case "whey": { const d = D(), id = a.dataset.w; d.supp = { ...(d.supp || {}) }; d.supp.p = { ...(d.supp.p || {}), [id]: clamp(dosesOf(d, id) + +a.dataset.v, 0, 6) }; saveDay(UI.date); render(); break; }
    case "pw-add": { const pre = POWDER_PRESETS[+a.dataset.i] || { n: "Nouveau pot", g: 30, kcal: 115, prot: 23 }; S.profile.wheys = [...powders(), { id: "w" + uid(), ...pre }]; save(); render(); toast(pre.n + " ajouté"); break; }
    case "pw-del": if (a.dataset.confirm) { S.profile.wheys = powders().map(w => w.id === a.dataset.w ? { ...w, off: true } : w); save(); render(); toast("Pot retiré (les jours passés restent comptés)"); } else { a.dataset.confirm = "1"; a.textContent = "?"; a.setAttribute("aria-label", "Confirmer la suppression"); toast("Touche encore pour supprimer ce pot"); } break;
    case "cloud-on": cloudEnable(); break;
    case "cloud-now": cloudPush(true); break;
    case "cloud-off": setCloudCfg(null); render(); toast("Sauvegarde en ligne désactivée sur ce téléphone"); break;
    case "cloud-restore": openCloudRestore(); break;
    case "cloud-pull": cloudRestore(a); break;
    case "cloud-force": cloudPush("force"); break;
    case "cloud-replace": if (a.dataset.confirm) { setCloudCfg({ ...cloudCfg(), on: true }); closeSheet(); cloudPush("force"); } else { a.dataset.confirm = "1"; a.textContent = "Confirmer : remplacer"; } break;
    case "crea": { const d = D(); d.supp = { ...(d.supp || {}) }; d.supp.crea = !d.supp.crea; saveDay(UI.date); render(); break; }
    case "walk": { const d = D(); d.walk = clamp((d.walk || 0) + +a.dataset.v, 0, 300); saveDay(UI.date); render(); break; }
    case "pain": { const d = D(); const v = +a.dataset.v; d.pain = d.pain === v ? null : v; saveDay(UI.date); render(); break; }
    case "close-sheet": case "sheet-back": closeSheet(); break;
    case "slot": syncDesc(); C.slot = a.dataset.k; renderComposer(); break;
    case "mode": syncDesc(); C.mode = a.dataset.k; C.err = ""; renderComposer(); break;
    case "cat": C.cat = a.dataset.k; renderComposer(); break;
    case "pick": C.items.push(newItem(a.dataset.k)); C.search = ""; renderComposer(); { const b = $("sheet").querySelector(".sh-body"); if (b) b.scrollTop = 0; } break;
    case "preset": PRESETS[+a.dataset.i].items.forEach(i => C.items.push(newItem(i.k, i))); renderComposer(); break;
    case "freq": { const m = frequentMeals()[+a.dataset.i]; if (m) m.items.forEach(i => C.items.push({ fixed: true, ...i })); renderComposer(); break; }
    case "copy-yest": { const y = yesterdayMeal(C.slot); if (y) y.forEach(i => C.items.push({ fixed: true, ...i })); renderComposer(); break; }
    case "express": saveExpress(+a.dataset.v); break;
    case "ask-claude": { const q = C.search; closeSheet(); runAnalysis(q, null); break; }
    case "por": { const ci = C.items[+a.dataset.i]; ci.por = a.dataset.v === "g" ? "g" : +a.dataset.v; renderComposer(); break; }
    case "cnt": { const ci = C.items[+a.dataset.i]; ci.cnt = Math.max(0.5, ci.cnt + +a.dataset.v); renderComposer(); break; }
    case "cook": C.items[+a.dataset.i].cook = +a.dataset.v; renderComposer(); break;
    case "rm-item": C.items.splice(+a.dataset.i, 1); renderComposer(); break;
    case "photo-del": if (C.photoUrl) URL.revokeObjectURL(C.photoUrl); C.photo = null; C.photoUrl = null; syncDesc(); renderComposer(); break;
    case "estimate": estimateInComposer(); break;
    case "save-meal": saveMeal(); break;
    case "del-meal": if (a.dataset.confirm) { const dd = C.date || UI.date, d = S.days[dd] || day(dd); d.meals = d.meals.filter(m => m.id !== C.id); S.days[dd] = d; saveDay(dd); closeSheet(); render(); toast("Repas supprimé"); } else { a.dataset.confirm = "1"; a.textContent = "Confirmer"; } break;
    case "rv-toggle": { const it = R.data.meals[+a.dataset.m].items[+a.dataset.i]; it.keep = !it.keep; renderReview(); break; }
    case "rv-extra": R.keep[a.dataset.k] = !R.keep[a.dataset.k]; renderReview(); break;
    case "rv-save": saveReview(); break;
    case "rv-list": closeSheet(); openComposer({}); break;
    case "region": { const r = a.dataset.r, fid = a.id; UI.region = UI.region === r ? null : r; render(); if (e.detail === 0) { const el = $(fid); if (el) el.focus(); } break; }
    case "start": startSession(a.dataset.k); break;
    case "open-sess": UI.activeSession = a.dataset.id; UI.noResume = false; UI.region = null; render(); window.scrollTo(0, 0); break;
    case "leave-sess": UI.activeSession = null; UI.noResume = true; UI.region = null; render(); window.scrollTo(0, 0); break;
    case "set-ok": {
      const s = S.sessions[UI.activeSession], e2 = s.ex[+a.dataset.ei], st = e2.sets[+a.dataset.si];
      if (isDone(st)) { st.ok = false; st.pr = false; }
      else {
        const inp = $(`rp-${a.dataset.ei}-${a.dataset.si}`), kg = $(`kg-${a.dataset.ei}-${a.dataset.si}`);
        st.reps = +(inp.value || inp.placeholder) || ""; st.kg = kg.value === "" ? "" : +kg.value;
        if (!st.reps) { toast("Écris le nombre de répétitions"); inp.focus(); break; }
        st.ok = true;
        const prev = bestE1RM(e2.id, UI.activeSession), cur = e1rm(st), sessBest = Math.max(0, ...e2.sets.filter(x => x !== st && x.pr && isDone(x)).map(e1rm));
        st.pr = prev > 0 && cur > prev && cur > sessBest;
        if (st.pr) toast("🏅 Record : " + XM()[e2.id].n.split(" (")[0] + ", " + fkg(st.kg) + " kg × " + st.reps);
      }
      s.u = Date.now(); save(); render(); break;
    }
    case "add-set": { const e2 = S.sessions[UI.activeSession].ex[+a.dataset.ei], last = e2.sets[e2.sets.length - 1]; e2.sets.push({ kg: last ? last.kg : "", reps: "", ok: false }); save(); render(); break; }
    case "finish": { const fid = UI.activeSession, s = S.sessions[fid]; s.done = true; s.u = Date.now(); save(); UI.activeSession = null; UI.noResume = false; render(); window.scrollTo(0, 0); openSessionSummary(fid); break; }
    case "exstats": openExStats(a.dataset.id); break;
    case "del-sess": if (a.dataset.confirm) { delete S.sessions[UI.activeSession]; save(); UI.activeSession = null; UI.noResume = false; render(); toast("Séance supprimée"); } else { a.dataset.confirm = "1"; a.textContent = "Confirmer"; } break;
    case "edit-prog": UI.editProgram = !UI.editProgram; render(); break;
    case "rm-ex": { const pr = JSON.parse(JSON.stringify(program())); pr[a.dataset.t].splice(+a.dataset.i, 1); S.profile.program = pr; save(); render(); break; }
    case "mv": { const pr = JSON.parse(JSON.stringify(program())), arr = pr[a.dataset.t], i = +a.dataset.i, j = i + (+a.dataset.v || -1); if (j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; S.profile.program = pr; save(); render(); } break; }
    case "ex-edit": if (!$("sheet").hidden) closeSheet(); openExEditor(a.dataset.id, a.dataset.t || null); break;
    case "demo": openDemo(a.dataset.id); break;
    case "ex-new": openExEditor(null, a.dataset.t); break;
    case "x-mus": { syncX(); const f = a.dataset.f, g = a.dataset.g, other = f === "pri" ? "sec" : "pri"; X[f] = X[f].includes(g) ? X[f].filter(x => x !== g) : [...X[f], g]; X[other] = X[other].filter(x => x !== g); renderExEditor(); break; }
    case "x-ai": exAI(); break;
    case "x-save": saveExEditor(); break;
    case "x-reset": { const c = { ...(S.profile.customEx || {}) }; delete c[X.id]; S.profile.customEx = c; save(); closeSheet(); X = null; render(); toast("Exercice remis à l'original"); break; }
    case "x-remove": if (a.dataset.confirm) { const pr = JSON.parse(JSON.stringify(program())); pr[X.tpl] = pr[X.tpl].filter(k => k !== X.id); S.profile.program = pr; save(); closeSheet(); X = null; render(); toast("Retiré de la séance"); } else { a.dataset.confirm = "1"; a.textContent = "Confirmer le retrait"; } break;
    case "goal": UI.goal = a.dataset.k; render(); break;
    case "rfilter": UI.rfilter = a.dataset.k; render(); break;
    case "ai-recipes": aiRecipes(); break;
    case "eat-recipe": eatRecipe(a.dataset.src, +a.dataset.i); break;
    case "auto": S.profile.auto = S.profile.auto === false; save(); render(); break;
    case "conva": S.profile.mode = conva() ? "seche" : "conva"; save(); render(); toast(conva() ? "Mode convalescence activé" : "Retour au mode sèche"); break;
    case "tendon": S.profile.tendon = !S.profile.tendon; save(); render(); break;
    case "weigh": { const v = parseFloat(String($("weighin-input").value).replace(",", ".")); if (!(v > 30 && v < 300)) { toast("Entre un poids en kg, par exemple 91,2"); break; } const d = today(); if (!S.days[d]) S.days[d] = day(d); S.days[d].kg = v; saveDay(d); render(); toast("Pesée enregistrée"); break; }
    case "save-key": { const v = $("api-key").value.trim(); if (v && !v.startsWith("sk-ant-")) { toast("Une clé Anthropic commence par sk-ant-"); break; } setKey(v); render(); toast(v ? "Clé enregistrée sur ce téléphone" : "Clé effacée"); break; }
    case "del-key": setKey(""); render(); toast("Clé effacée"); break;
    case "test-key": testKey(a); break;
    case "model": setModel(a.dataset.v); render(); break;
    case "coach": coach(); break;
    case "export": doExport(); break;
    case "transfer-copy": { const txt = JSON.stringify(S); try { navigator.clipboard.writeText(txt).then(() => toast("✓ Copié. Installe l'app, puis touche « Coller mes données de Safari »"), () => showCopyBox(txt)); } catch (err) { showCopyBox(txt); } break; }
    case "transfer-hide": try { localStorage.setItem(LS + "-nobanner", "1"); } catch (err) {} render(); break;
    case "transfer-paste": (async () => { let txt = ""; try { txt = await navigator.clipboard.readText(); } catch (err) {} if (txt && txt.trim().startsWith("{")) doImport(txt); else { openImport(); toast("Colle le texte copié dans Safari, puis Importer"); } })(); break;
    case "health-paste": healthPaste(); break;
    case "health-apply": { const o = parseHealth($("hp-text").value); if (!o) { toast("Je ne trouve pas de données Santé dans ce texte"); break; } closeSheet(); applyHealth(o); break; }
    case "copy-health-url": { const u = SITE + "#sante?pas=[Pas]&exercice=[Minutes]&actif=[Énergie]&poids=[Poids]"; try { navigator.clipboard.writeText(u).then(() => toast("Adresse copiée"), () => toast("Sélectionne l'adresse pour la copier")); } catch (e) { toast("Sélectionne l'adresse pour la copier"); } break; }
    case "import": openImport(); break;
    case "do-import": doImport($("imp-text").value); break;
  }
});
async function testKey(btn) {
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
  try { await askJSON({ system: "Réponds au format demandé.", content: "Dis bonjour.", schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } }, maxTokens: 2000 }); toast("✓ Ta clé fonctionne"); }
  catch (e) { toast(explain(e)); }
  render();
}
async function estimateInComposer() {
  if (!C || C.busy) return;
  syncDesc();
  const c = C;
  if (!c.desc.trim() && !c.photo) { c.err = "Écris ce que tu as mangé ou ajoute une photo."; renderComposer(); return; }
  if (!hasKey()) { const p = localParse(c.desc, c.slot); p.meals.forEach(m => m.items.forEach(it => c.items.push({ fixed: true, e: it.e, n: it.n, d: it.q, kcal: it.kcal, prot: it.prot }))); c.mode = "pick"; c.desc = ""; if (!p.meals.length) c.err = "Je n'ai rien reconnu sans Claude. Ajoute ta clé API dans Réglages."; renderComposer(); return; }
  c.busy = true; c.err = ""; renderComposer();
  try {
    const res = await analyse(c.desc, c.photo, c.slot);
    if (C !== c) return;
    res.meals.forEach(m => m.items.forEach(it => c.items.push({ fixed: true, e: it.e, n: it.n, d: it.q, kcal: Math.round(it.kcal), prot: Math.round(it.prot * 10) / 10 })));
    if (!res.meals.length) c.err = "Claude n'a reconnu aucun aliment.";
    c.tip = res.conseil || ""; c.desc = ""; c.mode = "pick";
    if (c.photoUrl) URL.revokeObjectURL(c.photoUrl); c.photo = null; c.photoUrl = null;
  } catch (e) { if (C !== c) return; c.err = explain(e); }
  c.busy = false; renderComposer();
}
function syncDesc() { const el = $("c-desc"); if (el && C) C.desc = el.value; }
document.addEventListener("input", e => {
  const t = e.target;
  if (C && t.id === "c-search") {
    const had = !!C.search.trim(); C.search = t.value;
    if (had !== !!C.search.trim()) { renderComposer(); const s = $("c-search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    else $("foodlist").innerHTML = foodListHTML();
    return;
  }
  if (C && t.dataset.i != null && t.dataset.field) {
    const ci = C.items[+t.dataset.i]; if (!ci) return;
    if (t.dataset.field === "g") ci.g = t.value; else ci.kcal = t.value;
    const tot = composerTotals(); $("c-total").textContent = f0(tot.kcal) + " kcal"; $("c-prot").textContent = f0(tot.prot) + " g de protéines";
    return;
  }
  if (R && t.dataset.rm != null) { R.data.meals[+t.dataset.rm].items[+t.dataset.ri].kcal = +t.value || 0; }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.id === "c-photo" && t.files && t.files[0]) {
    syncDesc(); const c = C;
    try { const b = await resizeImage(t.files[0]); if (C !== c) return; if (c.photoUrl) URL.revokeObjectURL(c.photoUrl); c.photo = b; c.photoUrl = URL.createObjectURL(b); } catch (err) { if (C === c) c.err = "Impossible de lire cette photo."; }
    if (C === c) renderComposer();
    return;
  }
  if (t.id === "imp-file" && t.files && t.files[0]) { doImport(await t.files[0].text()); return; }
  if (C && t.dataset.i != null && t.dataset.field) { renderComposer(); return; }
  if (R && t.dataset.rm != null) { renderReview(); return; }
  if (t.dataset.ei != null && UI.activeSession) {
    const s = S.sessions[UI.activeSession], st = s.ex[+t.dataset.ei].sets[+t.dataset.si];
    const wasDone = isDone(st);
    st[t.dataset.field] = t.value === "" ? "" : +t.value; s.u = Date.now();
    st.ok = false; st.pr = false;
    save();
    if (wasDone) { const b = t.parentElement.querySelector(".ok"); if (b) { b.className = "ok"; b.textContent = "✓"; } toast("Série modifiée : touche ✓ pour la revalider"); }
    return;
  }
  if (t.dataset.flag && UI.activeSession) { S.sessions[UI.activeSession][t.dataset.flag] = t.checked; save(); return; }
  if (t.dataset.addex && t.value) { const pr = JSON.parse(JSON.stringify(program())); pr[t.dataset.addex].push(t.value); S.profile.program = pr; save(); render(); return; }
  if (t.dataset.pw) { const f = t.dataset.f, v = f === "n" ? t.value.trim() : +t.value; if (f === "n" ? v : t.value !== "" && v >= 0) { S.profile.wheys = powders().map(w => w.id === t.dataset.pw ? { ...w, [f]: v } : w); save(); renderKeepFocus(); } return; }
  if (t.dataset.sleep) { const d = UI.date; if (!S.days[d]) S.days[d] = day(d); S.days[d].sleep = { ...(S.days[d].sleep || {}), [t.dataset.sleep]: t.value }; saveDay(d); renderKeepFocus(); return; }
  if (t.id === "x-demo" && X) { syncX(); renderExEditor(); return; }
  if (t.dataset.steps) { const d = UI.date; if (!S.days[d]) S.days[d] = day(d); S.days[d].steps = t.value === "" ? null : Math.max(0, Math.round(+t.value)); saveDay(d); toast(t.value === "" ? "Pas effacés" : "Pas enregistrés"); return; }
  if (t.dataset.tplname) { S.profile.tplNames = { ...(S.profile.tplNames || {}), [t.dataset.tplname]: cleanTxt(t.value) }; save(); renderKeepFocus(); return; }
  if (t.dataset.ctx) { S.profile.context = t.value.trim(); save(); toast("Enregistré"); return; }
  if (t.dataset.prof) {
    const k = t.dataset.prof;
    if (k === "goalDate") { if (t.value && t.value > S.profile.startDate) S.profile.goalDate = t.value; else toast("La date d'objectif doit être après le départ"); }
    else if (k === "kcalManual") S.profile.kcalManual = t.value ? +t.value : null;
    else if (k === "activity") { if (t.value !== "") S.profile.activity = clamp(+t.value, 1.2, 1.8); }
    else if (t.value !== "" && +t.value > 0) S.profile[k] = +t.value;
    save(); renderKeepFocus();
  }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if ((e.key === "Enter" || e.key === " ") && t.classList && t.classList.contains("mu")) { e.preventDefault(); t.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
  if (!$("listen").hidden && e.key === "Escape") { closeVoice(); return; }
  if ($("sheet").hidden) return;
  if (e.key === "Escape") { closeSheet(); return; }
  if (e.key === "Tab") {
    const f = [...document.querySelectorAll("#sheet button:not([disabled]), #sheet input:not([hidden]), #sheet textarea")].filter(el => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") { if (cloudTimer) cloudPush(false); return; }
  const t = today();
  if (t !== UI.lastToday) { if (UI.date === UI.lastToday) UI.date = t; UI.lastToday = t; UI.month = t.slice(0, 7); if ($("sheet").hidden) render(); }
});
let resizeTm;
window.addEventListener("resize", () => { clearTimeout(resizeTm); resizeTm = setTimeout(() => { if (UI.tab === "progres" && $("sheet").hidden) render(); }, 200); });

/* ---------- Démarrage ---------- */
loadLocal();
migrate();
render();
checkHealthHash();
window.addEventListener("hashchange", checkHealthHash);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
