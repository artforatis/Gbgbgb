// Builds the offline data for Haram Guide. Run by GitHub Actions (see .github/workflows/build.yml).
// Needs: npm packages in .build/node_modules (quran-cloud, leaflet, @fontsource/*).
// Writes: data/quran/1..114.json, data/surahs.json, data/osm.json (offline map), data/walk.json (walking network),
//         data/photos.json + data/img/* (place photos), vendor/leaflet/*, vendor/fonts/*, vendor/three/*
// Each part is skipped when its inputs have not changed (see data/version.json).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import vm from "node:vm";

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
  const th = path.join(NM, "three", "build", "three.min.js");
  if (fs.existsSync(th)) { mk(path.join(ROOT, "vendor", "three")); fs.copyFileSync(th, path.join(ROOT, "vendor", "three", "three.min.js")); }
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
const CITIES = {
  makkah: { osm: "21.408,39.812,21.442,39.842", walk: "21.400,39.800,21.452,39.858", suffix: "", center: [21.42251, 39.82618] },
  madinah: { osm: "24.455,39.595,24.480,39.625", walk: "24.435,39.590,24.505,39.640", suffix: "-madinah", center: [24.46722, 39.61111] }
};
async function buildOsm(city = "makkah") {
  const C = CITIES[city], bbox = C.osm;
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
      fs.writeFileSync(path.join(ROOT, "data", "osm" + C.suffix + ".json"), JSON.stringify(out));
      log("offline map", city + ":", out.b.length, "buildings,", out.main.length + out.foot.length, "streets");
      return;
    } catch (e) { log("overpass failed at", h, e.message); }
  }
  log("offline map skipped");
}

/* ---------- 5. walking network (streets, alleys, footpaths, plazas) for offline routing ---------- */
const WALK_V = "walk-2";
const R_EARTH = 6371000;
const toRad = d => d * Math.PI / 180;
function metres(a, b, c, d) {
  const x = toRad(d - b) * Math.cos(toRad((a + c) / 2)), y = toRad(c - a);
  return Math.sqrt(x * x + y * y) * R_EARTH;
}
function segCross(p1, p2, p3, p4) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function inPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
const NO_WALK = /^(motorway|motorway_link|construction|proposed|raceway|bus_guideway|escape|abandoned|razed|elevator|emergency_bay)$/;
const BIG_ROAD = /^(trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$/;
function walkable(t) {
  const h = t.highway; if (!h) return false;
  if (NO_WALK.test(h)) return false;
  const foot = t.foot || "";
  if (/^(no|private|use_sidepath|discouraged)$/.test(foot)) return false;
  if (/^(no|private)$/.test(t.access || "") && !/yes|designated|permissive/.test(foot)) return false;
  // vehicle tunnels in Makkah are not for walking
  if (t.tunnel && t.tunnel !== "no" && t.tunnel !== "building_passage" && BIG_ROAD.test(h) && !/yes|designated/.test(foot) && !(t.sidewalk && t.sidewalk !== "no")) return false;
  return true;
}
function isWalkArea(t) {
  return (t.area === "yes" && /^(pedestrian|footway|living_street|service|platform)$/.test(t.highway || "")) ||
         /^(pedestrian|footway)$/.test(t["area:highway"] || "") || t.place === "square";
}
async function buildWalk(city = "makkah") {
  const C = CITIES[city], bbox = C.walk;
  const q = `[out:json][timeout:180];(way["highway"](${bbox});way["area:highway"](${bbox});way["place"="square"](${bbox}););out body geom;`;
  const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  let j = null;
  for (const h of hosts) {
    try { j = await getJSON(h, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 2); break; }
    catch (e) { log("overpass (walk) failed at", h, e.message); }
  }
  if (!j) { log("walking network skipped"); return false; }
  const g = graphFromWays(j.elements || []);
  if (!g) { log("walking network empty"); return false; }
  fs.writeFileSync(path.join(ROOT, "data", "walk" + C.suffix + ".json"), JSON.stringify(g));
  log("walking network", city + ":", g.n.length / 2, "points,", g.e.length / 2, "links");
  return true;
}
export function graphFromWays(elements) {
  const idx = new Map(), lat = [], lng = [];
  const node = (id, la, lo) => { let k = idx.get(id); if (k === undefined) { k = lat.length; idx.set(id, k); lat.push(la); lng.push(lo); } return k; };
  const adj = [];
  const link = (a, b) => { if (a === b) return; (adj[a] = adj[a] || new Set()).add(b); (adj[b] = adj[b] || new Set()).add(a); };
  const areas = [];
  for (const e of elements) {
    if (e.type !== "way" || !e.geometry || !e.nodes) continue;
    const t = e.tags || {};
    const area = isWalkArea(t);
    if (!area && !walkable(t)) continue;
    const ids = e.nodes.map((nid, i) => node(nid, e.geometry[i].lat, e.geometry[i].lon));
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]);
    if (area && e.nodes[0] === e.nodes[e.nodes.length - 1] && ids.length > 3) areas.push(ids);
  }
  if (!lat.length) return null;
  // plazas: you can walk straight across them, so connect points that see each other inside the area
  for (const ring of areas) {
    const poly = ring.map(k => [lat[k], lng[k]]);
    let minA = 90, maxA = -90, minO = 180, maxO = -180;
    for (const [a, o] of poly) { minA = Math.min(minA, a); maxA = Math.max(maxA, a); minO = Math.min(minO, o); maxO = Math.max(maxO, o); }
    const cand = new Set();
    let last = null;
    for (const k of ring) { if (!last || metres(lat[k], lng[k], lat[last], lng[last]) > 8) { cand.add(k); last = k; } }
    for (let k = 0; k < lat.length; k++) {
      if (lat[k] < minA || lat[k] > maxA || lng[k] < minO || lng[k] > maxO) continue;
      if (inPoly([lat[k], lng[k]], poly)) cand.add(k);
    }
    let C = [...cand];
    if (C.length > 450) C = C.filter((_, i) => i % Math.ceil(C.length / 450) === 0);
    for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) {
      const p = [lat[C[a]], lng[C[a]]], q2 = [lat[C[b]], lng[C[b]]];
      if (metres(p[0], p[1], q2[0], q2[1]) > 350) continue;
      const mid = [(p[0] + q2[0]) / 2, (p[1] + q2[1]) / 2];
      if (!inPoly(mid, poly)) continue;
      let ok = true;
      for (let i = 0, jj = poly.length - 1; i < poly.length; jj = i++) { if (segCross(p, q2, poly[jj], poly[i])) { ok = false; break; } }
      if (ok) link(C[a], C[b]);
    }
  }
  // keep the largest connected part so every route can be found
  const comp = new Int32Array(lat.length).fill(-1);
  let best = -1, bestSize = 0, c = 0;
  for (let s0 = 0; s0 < lat.length; s0++) {
    if (comp[s0] !== -1) continue;
    let size = 0; const st = [s0]; comp[s0] = c;
    while (st.length) { const k = st.pop(); size++; for (const m of adj[k] || []) if (comp[m] === -1) { comp[m] = c; st.push(m); } }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  const map = new Int32Array(lat.length).fill(-1), n = [], ed = [];
  for (let k = 0; k < lat.length; k++) if (comp[k] === best) { map[k] = n.length / 2; n.push(Math.round(lat[k] * 1e5) - 2140000, Math.round(lng[k] * 1e5) - 3980000); }
  for (let k = 0; k < lat.length; k++) {
    if (map[k] < 0) continue;
    for (const m of adj[k] || []) if (m > k && map[m] >= 0) ed.push(map[k], map[m]);
  }
  return { v: 1, base: [21.4, 39.8], n, e: ed };
}

/* ---------- 6. place photos (free photos from Wikipedia / Wikimedia Commons) ---------- */
export function readPlaces() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "places.js"), "utf8"), ctx);
  try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, "madinah-places.js"), "utf8"), ctx); } catch (e) {}
  return (ctx.window.PLACES || []).concat((ctx.window.MADINAH_PLACES || []).map(p => Object.assign({}, p, { id: "md-" + p.id })));
}
const strip = h => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function buildPhotos() {
  const places = readPlaces();
  const out = {}, dir = path.join(ROOT, "data", "img");
  mk(dir);
  const done = {};
  for (const p of places) {
    if (!p.wiki) continue;
    try {
      let info = done[p.wiki];
      if (!info) {
        const q = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=thumbnail|name&pithumbsize=900&titles=${encodeURIComponent(p.wiki)}`, {}, 2);
        const pg = q.query && q.query.pages && q.query.pages[0];
        if (!pg || !pg.thumbnail || !pg.pageimage) { log("no photo for", p.wiki); continue; }
        const meta = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent("File:" + pg.pageimage)}`, {}, 2).catch(() => null);
        const em = meta && meta.query && meta.query.pages && meta.query.pages[0] && meta.query.pages[0].imageinfo ? meta.query.pages[0].imageinfo[0].extmetadata : {};
        const lic = strip(em.LicenseShortName && em.LicenseShortName.value);
        if (lic && !/CC|public domain|PD|GFDL|free/i.test(lic)) { log("skipping non-free photo", p.wiki, lic); continue; }
        const r = await fetch(pg.thumbnail.source, { headers: { "User-Agent": "HaramGuideBuild/1.0 (GitHub Actions)" } });
        if (!r.ok) { log("photo download failed", p.wiki); continue; }
        const file = "data/img/" + p.wiki.replace(/[^A-Za-z0-9]+/g, "_") + ".jpg";
        fs.writeFileSync(path.join(ROOT, file), Buffer.from(await r.arrayBuffer()));
        info = done[p.wiki] = { src: file, credit: strip(em.Artist && em.Artist.value).slice(0, 120), license: lic || "Wikimedia Commons", page: "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(pg.pageimage) };
        await sleep(300);
      }
      out[p.id] = info;
    } catch (e) { log("photo error", p.wiki, e.message); }
  }
  fs.writeFileSync(path.join(ROOT, "data", "photos.json"), JSON.stringify(out));
  log("photos:", Object.keys(out).length);
  return true;
}

/* ---------- run, skipping parts that are already up to date ---------- */
const hashOf = (...files) => crypto.createHash("sha1").update(files.map(f => { try { return fs.readFileSync(path.join(ROOT, f)); } catch (e) { return ""; } }).join("|")).digest("hex").slice(0, 12);
async function main() {
  mk(path.join(ROOT, "data"));
  const vf = path.join(ROOT, "data", "version.json");
  let ver = {}; try { ver = JSON.parse(fs.readFileSync(vf, "utf8")); } catch (e) {}
  const want = {
    vendor: "v3",
    quran: hashOf("translit.js") + "-q1",
    osm: "osm-1",
    walk: WALK_V,
    osmMd: "osm-1",
    walkMd: WALK_V,
    photos: hashOf("places.js", "madinah-places.js") + "-p1",
  };
  const fresh = k => ver[k] === want[k] && !process.env.FORCE;
  if (!fresh("vendor") || !fs.existsSync(path.join(ROOT, "vendor", "three", "three.min.js"))) { copyVendor(); ver.vendor = want.vendor; }
  if (!fresh("quran") || !fs.existsSync(path.join(ROOT, "data", "quran", "114.json"))) { await buildQuran(); ver.quran = want.quran; }
  if (!process.env.SKIP_OSM) {
    if (!fresh("osm") || !fs.existsSync(path.join(ROOT, "data", "osm.json"))) { await buildOsm(); if (fs.existsSync(path.join(ROOT, "data", "osm.json"))) ver.osm = want.osm; }
    if (!fresh("walk") || !fs.existsSync(path.join(ROOT, "data", "walk.json"))) { if (await buildWalk()) ver.walk = want.walk; }
    if (!fresh("osmMd") || !fs.existsSync(path.join(ROOT, "data", "osm-madinah.json"))) { await buildOsm("madinah"); if (fs.existsSync(path.join(ROOT, "data", "osm-madinah.json"))) ver.osmMd = want.osmMd; }
    if (!fresh("walkMd") || !fs.existsSync(path.join(ROOT, "data", "walk-madinah.json"))) { if (await buildWalk("madinah")) ver.walkMd = want.walkMd; }
  }
  if (!process.env.SKIP_PHOTOS && !fresh("photos")) { if (await buildPhotos()) ver.photos = want.photos; }
  fs.writeFileSync(vf, JSON.stringify(ver, null, 1));
  log("done");
}
if (!process.env.NO_RUN) await main();
