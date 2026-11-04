// Builds the offline data for Haram Guide. Run by GitHub Actions (see .github/workflows/build.yml).
// Needs: npm packages in .build/node_modules (quran-cloud, leaflet, @fontsource/*).
// Writes: data/quran/1..114.json, data/surahs.json, data/osm.json, vendor/leaflet/*, vendor/fonts/*
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const NM = path.join(ROOT, ".build", "node_modules");
const require = createRequire(import.meta.url);
const { translitVerse, translitWord } = require(path.join(ROOT, "translit.js"));

const mk = d => fs.mkdirSync(d, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log("[build-data]", ...a);

async function getJSON(url, opts = {}, tries = 4) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "User-Agent": "HaramGuideBuild/1.0", ...(opts.headers || {}) } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (t === tries) throw e;
      await sleep(1500 * t);
    }
  }
}

/* ---------- 1. vendor files: leaflet + fonts ---------- */
function copyVendor() {
  const lf = path.join(NM, "leaflet", "dist");
  const out = path.join(ROOT, "vendor", "leaflet");
  mk(path.join(out, "images"));
  for (const f of ["leaflet.js", "leaflet.css"]) fs.copyFileSync(path.join(lf, f), path.join(out, f));
  for (const f of fs.readdirSync(path.join(lf, "images"))) fs.copyFileSync(path.join(lf, "images", f), path.join(out, "images", f));

  const fonts = [
    ["anek-bangla", "Anek Bangla", [400, 500, 600, 700, 800], ["bengali", "latin"]],
    ["noto-serif-bengali", "Noto Serif Bengali", [400, 600], ["bengali", "latin"]],
    ["amiri-quran", "Amiri Quran", [400], ["arabic", "latin"]],
  ];
  const fo = path.join(ROOT, "vendor", "fonts");
  mk(fo);
  const ranges = {
    bengali: "U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1",
    arabic: "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
    latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  };
  let css = "";
  for (const [pkg, family, weights, subsets] of fonts) {
    for (const w of weights) for (const sub of subsets) {
      const file = `${pkg}-${sub}-${w}-normal.woff2`;
      const src = path.join(NM, "@fontsource", pkg, "files", file);
      if (!fs.existsSync(src)) { log("missing font", file); continue; }
      fs.copyFileSync(src, path.join(fo, file));
      css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format("woff2");unicode-range:${ranges[sub]}}\n`;
    }
  }
  fs.writeFileSync(path.join(fo, "fonts.css"), css);
  log("vendor files copied");
}

/* ---------- 2. word by word (Bangla) from Quran.com ---------- */
async function fetchWbw(n) {
  const hosts = [
    p => `https://api.quran.com/api/v4/verses/by_chapter/${n}?language=bn&words=true&word_fields=text_uthmani&word_translation_language=bn&per_page=50&page=${p}`,
    p => `https://api.qurancdn.com/api/qdc/verses/by_chapter/${n}?words=true&word_fields=text_uthmani&word_translation_language=bn&per_page=50&page=${p}`,
  ];
  for (const h of hosts) {
    try {
      const map = {};
      let page = 1, total = 1, bangla = 0, all = 0;
      do {
        const j = await getJSON(h(page));
        total = (j.pagination && j.pagination.total_pages) || 1;
        for (const v of j.verses || []) {
          map[v.verse_number] = (v.words || []).filter(w => w.char_type_name === "word").map(w => {
            const t = (w.translation && w.translation.text) || "";
            all++; if (/[ঀ-৿]/.test(t)) bangla++;
            return [w.text_uthmani || w.text || "", t];
          });
        }
        page++;
        await sleep(250);
      } while (page <= total);
      if (all && bangla / all > 0.5) return map;
      log(`chapter ${n}: word meanings not in Bangla from this source`);
    } catch (e) {
      log(`chapter ${n}: word source failed (${e.message})`);
    }
  }
  return null;
}

/* ---------- 3. Quran ---------- */
async function buildQuran() {
  const QC = path.join(NM, "quran-cloud", "dist", "chapters", "bn");
  const out = path.join(ROOT, "data", "quran");
  mk(out);
  const index = JSON.parse(fs.readFileSync(path.join(QC, "index.json"), "utf8"));
  let wbwOk = 0, fails = 0;
  for (let n = 1; n <= 114; n++) {
    const d = JSON.parse(fs.readFileSync(path.join(QC, n + ".json"), "utf8"));
    const wbw = (process.env.SKIP_WBW || fails >= 3) ? null : await fetchWbw(n);
    if (wbw) { wbwOk++; fails = 0; } else fails++;
    const verses = d.verses.map(v => {
      const words = v.text.split(/\s+/).filter(w => /[ء-يٱ]/.test(w));
      const wt = words.map(w => translitWord(w));
      const row = { a: v.text, t: translitVerse(v.text), b: v.translation };
      const ww = wbw && wbw[v.id];
      if (ww && ww.length === words.length) row.w = words.map((w, i) => [w, ww[i][1], wt[i]]);
      else if (ww) row.w = ww.map((x, i) => [x[0], x[1], wt[i] || ""]);
      else row.w = words.map((w, i) => [w, "", wt[i]]);
      return row;
    });
    fs.writeFileSync(path.join(out, n + ".json"), JSON.stringify({ n, type: d.type, count: d.total_verses, wbw: !!wbw, verses }));
    if (n % 10 === 0) log("surah", n, "done");
  }
  fs.writeFileSync(path.join(ROOT, "data", "surahs.json"), JSON.stringify(index.map(s => ({ n: s.id, ar: s.name, en: s.transliteration, bn: s.translation, type: s.type, count: s.total_verses }))));
  log("quran built, word meanings for", wbwOk, "of 114 surahs");
}

/* ---------- 4. offline vector map of central Makkah (OpenStreetMap) ---------- */
async function buildOsm() {
  const bbox = "21.408,39.812,21.442,39.842";
  const q = `[out:json][timeout:120];(way["building"](${bbox});way["highway"](${bbox});way["amenity"="place_of_worship"](${bbox});way["landuse"="cemetery"](${bbox});way["natural"~"peak|ridge|cliff"](${bbox}););out geom;`;
  const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (const h of hosts) {
    try {
      const j = await getJSON(h, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 2);
      const r5 = x => Math.round(x * 1e5) / 1e5;
      const out = { b: [], m: [], c: [], main: [], foot: [] };
      for (const e of j.elements || []) {
        if (!e.geometry || e.geometry.length < 2) continue;
        const flat = [];
        for (const g of e.geometry) flat.push(r5(g.lat), r5(g.lon));
        const t = e.tags || {};
        if (t.amenity === "place_of_worship") out.m.push(flat);
        else if (t.landuse === "cemetery") out.c.push(flat);
        else if (t.building) out.b.push(flat);
        else if (t.highway) {
          if (/footway|pedestrian|steps|path|corridor|living_street/.test(t.highway)) out.foot.push(flat);
          else out.main.push(flat);
        }
      }
      fs.writeFileSync(path.join(ROOT, "data", "osm.json"), JSON.stringify(out));
      log("offline map:", out.b.length, "buildings,", out.main.length + out.foot.length, "streets");
      return;
    } catch (e) { log("overpass failed at", h, e.message); }
  }
  log("offline map skipped");
}

mk(path.join(ROOT, "data"));
copyVendor();
await buildQuran();
if (!process.env.SKIP_OSM) await buildOsm();
log("done");
