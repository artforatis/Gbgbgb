/* Tawaf page: today's prayer times for Makkah, an estimated crowd level for every minute,
   a moving 3D Mataf, alerts (low crowd and prayer times) and a way to correct the estimate
   from what you see in the live video. The exact live sensor level is only published by
   the Grand Mosque authority (linked on the page). */
(function () {
"use strict";
const LAT = 21.4225, LNG = 39.8262, TZ = 3;
const BN = "০১২৩৪৫৬৭৮৯";
const bn = v => String(v).replace(/\d/g, d => BN[d]);
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- prayer times (Umm al-Qura: Fajr 18.5°, Isha 90 min after Maghrib, 120 in Ramadan) ---------- */
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const fixH = h => ((h % 24) + 24) % 24;
function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = rad((357.529 + 0.98560028 * D) % 360), q = (280.459 + 0.98564736 * D) % 360;
  const L = rad((q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360);
  const e = rad(23.439 - 0.00000036 * D);
  const RA = deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))) / 15;
  return { dec: Math.asin(Math.sin(e) * Math.sin(L)), eqt: q / 15 - fixH(RA) };
}
function hijri(date) {
  try {
    const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", timeZone: "Asia/Riyadh" });
    const parts = f.formatToParts(date);
    return { m: +parts.find(p => p.type === "month").value, d: +parts.find(p => p.type === "day").value };
  } catch (e) { return { m: 0, d: 0 }; }
}
function prayerTimes(y, m, d) {
  const jd = (Date.UTC(y, m - 1, d, 12 - TZ) / 86400000) + 2440587.5;
  const { dec, eqt } = sunPos(jd);
  const noon = 12 + TZ - LNG / 15 - eqt;
  const lat = rad(LAT);
  const T = a => deg(Math.acos((-Math.sin(rad(a)) - Math.sin(dec) * Math.sin(lat)) / (Math.cos(dec) * Math.cos(lat)))) / 15;
  const asrAlt = Math.atan(1 / (1 + Math.tan(Math.abs(lat - dec))));
  const A = deg(Math.acos((Math.sin(asrAlt) - Math.sin(dec) * Math.sin(lat)) / (Math.cos(dec) * Math.cos(lat)))) / 15;
  const ramadan = hijri(new Date(Date.UTC(y, m - 1, d, 9))).m === 9;
  const maghrib = noon + T(0.833);
  const t = { fajr: noon - T(18.5), sunrise: noon - T(0.833), dhuhr: noon + 2 / 60, asr: noon + A, maghrib, isha: maghrib + (ramadan ? 2 : 1.5) };
  for (const k in t) t[k] = Math.round(t[k] * 60); // minutes after midnight, Makkah time
  return t;
}
const IQAMA = { fajr: 25, dhuhr: 20, asr: 20, maghrib: 10, isha: 20 };
const LEN = { fajr: 12, dhuhr: 10, asr: 10, maghrib: 9, isha: 11 };
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const PNAME = { fajr: "ফজর", sunrise: "সূর্যোদয়", dhuhr: "যোহর", asr: "আসর", maghrib: "মাগরিব", isha: "এশা" };

/* ---------- crowd estimate, 0..1 ----------
   In the Umrah season the Mataf stays busy almost all night (people prefer the cool hours),
   is fullest from Maghrib to around midnight and before Fajr, and is lightest in the late morning
   (about 9–11:30) and early afternoon. Prayer times add a rush before and after each prayer. */
const ANCH = [[0, .84], [2, .8], [3.5, .78], [4.6, .86], [6, .72], [7, .62], [8, .52], [9.3, .4], [11, .42], [12, .52], [13.5, .5], [15, .5], [16.5, .62], [17.8, .8], [20, .9], [22, .88], [24, .84]];
function baseAt(h) {
  for (let i = 1; i < ANCH.length; i++) if (h <= ANCH[i][0]) {
    const [h0, v0] = ANCH[i - 1], [h1, v1] = ANCH[i];
    return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return ANCH[0][1];
}
function seasonFactor(hm, hd) {
  if (hm === 9) return 1.18;                               // Ramadan
  if (hm === 12 && hd <= 13) return 1.2;                   // Hajj days
  if (hm === 7 || hm === 8) return 1.06;                   // Rajab, Sha'ban
  if (hm === 1 || hm === 12) return .9;                    // just after Hajj: quieter
  return 1;
}
function makkahDate(now) { return new Date(now.getTime() + (now.getTimezoneOffset() + TZ * 60) * 60000); }
function rawState(min, ctx) {
  min = ((min % 1440) + 1440) % 1440;
  let v = baseAt(min / 60), prayer = null;
  for (const k of PRAYERS) {
    const a = ctx.pt[k], iq = a + IQAMA[k], end = iq + LEN[k];
    if (min >= a - 40 && min < iq) v += .1 * (1 - (iq - min) / (iq - a + 40));
    if (min >= iq && min < end) prayer = k;
    if (min >= end && min < end + 35) v += .1 * (1 - (min - end) / 35);
  }
  if (ctx.friday && min >= 600 && min < ctx.pt.dhuhr + 40) v += .15;
  if (ctx.hm === 9 && ctx.hd >= 20 && (min >= 1260 || min < 240)) v += .15;
  v *= seasonFactor(ctx.hm, ctx.hd);
  return { v, prayer };
}
function state(min, ctx) {
  const s = rawState(min, ctx);
  // your own correction from the live video fades out over 3 hours
  const c = ctx.cal;
  if (c) {
    const w = Math.max(0, 1 - Math.abs(min - c.min) / 180); // min may run past midnight (> 1440)
    s.v += c.delta * w;
  }
  s.v = Math.max(.08, Math.min(1, s.v));
  return s;
}
function ctxFor(md) {
  const h = hijri(md);
  return { pt: prayerTimes(md.getFullYear(), md.getMonth() + 1, md.getDate()), friday: md.getDay() === 5, hm: h.m, hd: h.d, cal: null };
}
const LEVELS = [[.45, "কম", "#1E9E62"], [.65, "মাঝারি", "#C9A24A"], [.82, "বেশি", "#D9822B"], [2, "খুব বেশি", "#C0392B"]];
const level = v => LEVELS.find(l => v < l[0]);
function fmtMin(m) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const part = h < 4 ? "রাত" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
  return `${part} ${bn(((h + 11) % 12) + 1)}:${bn(String(mm).padStart(2, "0"))}`;
}
// a moment in Makkah (day offset + minutes) as a real Date
function makkahToDate(dayOffset, min) {
  const md = makkahDate(new Date());
  return new Date(Date.UTC(md.getFullYear(), md.getMonth(), md.getDate() + dayOffset, 0, Math.round(min) - TZ * 60));
}

/* ---------- page ---------- */
let ctx = null, viewMin = null, live = true, three = null, running = false, lastDay = -1;
function nowMin() { const md = makkahDate(new Date()); return md.getHours() * 60 + md.getMinutes() + md.getSeconds() / 60; }
function loadCal() {
  const c = store.get("crowdCal", null);
  if (c && Date.now() - c.at < 3 * 3600e3) ctx.cal = c; else ctx.cal = null;
}
function refreshCtx() {
  const md = makkahDate(new Date());
  if (md.getDate() !== lastDay) { ctx = ctxFor(md); lastDay = md.getDate(); }
  loadCal();
}
function calmWindows(fromMin, span) {
  const out = []; let start = null;
  for (let k = 0; k <= span; k += 5) {
    const s = state(fromMin + k, ctx);
    const calm = s.v < .45 && !s.prayer;
    if (calm && start === null) start = fromMin + k;
    if ((!calm || k === span) && start !== null) { if (fromMin + k - start >= 30) out.push([start, fromMin + k]); start = null; }
  }
  return out;
}
function drawStatus() {
  const m = live ? nowMin() : viewMin;
  const s = state(m, ctx), L = level(s.v);
  $("#twLevel").textContent = s.prayer ? "জামাতের নামাজ চলছে" : L[1];
  $("#twLevel").style.background = s.prayer ? "#0B6B50" : L[2];
  $("#twPct").style.width = Math.round(s.v * 100) + "%";
  $("#twPct").style.background = L[2];
  $("#twTime").textContent = (live ? "এখন " : "") + fmtMin(m) + (ctx.cal && live ? " · আপনার দেখা অনুযায়ী ঠিক করা" : "");
  $("#twNote").textContent = s.prayer
    ? `${PNAME[s.prayer]}ের জামাত চলছে। এ সময় তাওয়াফ থেমে থাকে, সবাই কাতারে দাঁড়ান।`
    : L[1] === "কম" ? "এখন তাওয়াফের জন্য ভালো সময়।" : L[1] === "মাঝারি" ? "ভিড় মাঝারি। ধীরে ধীরে তাওয়াফ করা যাবে।" : "এখন অনেক ভিড়। পারলে পরের কম ভিড়ের সময়ে যান।";
  const w = calmWindows(Math.round(nowMin()), 1440);
  $("#twNext").innerHTML = w.length
    ? w.slice(0, 3).map(([a, b]) => `<li><b>${fmtMin(a)}</b> থেকে <b>${fmtMin(b)}</b></li>`).join("")
    : "<li>আজ আর লম্বা কম ভিড়ের সময় দেখা যাচ্ছে না।</li>";
  $("#twSlider").value = Math.round(m);
  const nl = $("#twChartNow"); if (nl) nl.setAttribute("x", (m / 1440 * 1000).toFixed(1));
  if (three) three.setCrowd(s.v, s.prayer, m);
}
function drawChart() {
  const W = 1000, H = 160;
  let d = "M0," + H;
  for (let m = 0; m <= 1440; m += 10) d += ` L${(m / 1440 * W).toFixed(1)},${(H - state(m % 1440, ctx).v * (H - 30)).toFixed(1)}`;
  d += ` L${W},${H} Z`;
  const lines = PRAYERS.map(k => { const x = (ctx.pt[k] + IQAMA[k]) / 1440 * W; return `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#0B6B50" stroke-width="3" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>`; }).join("");
  const tags = PRAYERS.map((k, i) => `<span class="tw-tag" style="left:${((ctx.pt[k] + IQAMA[k]) / 1440 * 100).toFixed(2)}%;top:${i % 2 ? 22 : 2}px">${PNAME[k]}</span>`).join("");
  $("#twChart").innerHTML = `<div class="tw-cv"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="সারাদিনের আনুমানিক ভিড়">
    <defs><linearGradient id="twg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C0392B" stop-opacity=".75"/><stop offset=".45" stop-color="#C9A24A" stop-opacity=".6"/><stop offset="1" stop-color="#1E9E62" stop-opacity=".45"/></linearGradient></defs>
    <path d="${d}" fill="url(#twg)"/>${lines}
    <rect id="twChartNow" x="0" y="0" width="5" height="${H}" fill="currentColor"/></svg>${tags}</div>
    <div class="day-ticks"><span>রাত ১২</span><span>সকাল ৬</span><span>দুপুর ১২</span><span>সন্ধ্যা ৬</span><span>রাত ১২</span></div>`;
}
function drawPrayers() {
  $("#twPrayers").innerHTML = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].map(k =>
    `<div><span>${PNAME[k]}</span><b>${fmtMin(ctx.pt[k])}</b></div>`).join("");
}
function redrawAll() { drawChart(); drawPrayers(); drawStatus(); }

/* ---------- your correction from the live video ---------- */
const CAL_V = { low: .32, mid: .55, high: .74, max: .93 };
function calibrate(key) {
  const m = nowMin();
  const raw = rawState(m, ctx).v;
  const c = { at: Date.now(), min: m, delta: Math.max(-.6, Math.min(.6, CAL_V[key] - raw)), key };
  store.set("crowdCal", c); ctx.cal = c;
  live = true; $("#twLive").hidden = true;
  redrawAll(); Alerts.reschedule();
  flash("ধন্যবাদ। পরের ৩ ঘণ্টার হিসাব আপনার দেখা অনুযায়ী ঠিক করা হলো।");
}
function flash(msg) { const t = $("#twFlash"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => t.hidden = true, 5000); }

/* ---------- alerts: low crowd + prayer times ---------- */
const Alerts = (function () {
  const LN = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  let opt = Object.assign({ crowd: false, prayer: false, before: 10 }, store.get("alerts", {}));
  let webTimers = [];
  async function permission() {
    const ln = LN();
    if (ln) {
      try { const r = await ln.requestPermissions(); return r.display === "granted"; } catch (e) { return false; }
    }
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    try { return (await Notification.requestPermission()) === "granted"; } catch (e) { return false; }
  }
  function events() {
    const list = [];
    const nowD = Date.now();
    if (opt.prayer) {
      for (let day = 0; day < 4; day++) {
        const md = makkahDate(new Date(nowD + day * 86400e3));
        const pt = prayerTimes(md.getFullYear(), md.getMonth() + 1, md.getDate());
        PRAYERS.forEach((k, i) => {
          const at = makkahToDate(day, pt[k] - (opt.before || 0));
          if (at.getTime() > nowD + 30e3) list.push({ id: 1000 + day * 10 + i, at,
            title: opt.before ? `${bn(opt.before)} মিনিট পর ${PNAME[k]}ের আজান` : `${PNAME[k]}ের সময় হয়েছে`,
            body: `মক্কার সময় ${fmtMin(pt[k])}। জামাত সাধারণত আজানের ${bn(IQAMA[k])} মিনিট পরে।` });
        });
      }
    }
    if (opt.crowd && ctx) {
      const n = Math.round(nowMin());
      calmWindows(n, 1440).slice(0, 4).forEach(([a, b], i) => {
        const dayOff = Math.floor(a / 1440), at = makkahToDate(dayOff, a % 1440);
        if (at.getTime() > nowD + 30e3) list.push({ id: 2000 + i, at, title: "তাওয়াফে ভিড় কমেছে (আনুমানিক)",
          body: `${fmtMin(a)} থেকে ${fmtMin(b)} পর্যন্ত ভিড় কম থাকার কথা। যাওয়ার আগে সরকারি লাইভ পাতাটা দেখে নিন।` });
      });
    }
    return list;
  }
  async function reschedule() {
    const ln = LN();
    const list = events();
    if (ln) {
      try {
        const pend = await ln.getPending();
        const old = (pend.notifications || []).filter(n => n.id >= 1000 && n.id < 3000).map(n => ({ id: n.id }));
        if (old.length) await ln.cancel({ notifications: old });
        if (list.length) await ln.schedule({ notifications: list.map(e => ({ id: e.id, title: e.title, body: e.body, schedule: { at: e.at, allowWhileIdle: true } })) });
      } catch (e) {}
    } else {
      webTimers.forEach(clearTimeout); webTimers = [];
      list.filter(e => e.at - Date.now() < 24 * 3600e3).forEach(e => webTimers.push(setTimeout(() => notify(e.title, e.body), e.at - Date.now())));
    }
    drawUI();
  }
  async function notify(title, body) {
    if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
    flash(title + " " + body);
    try {
      if ("serviceWorker" in navigator) { const reg = await navigator.serviceWorker.getRegistration(); if (reg) { reg.showNotification(title, { body, icon: "icon-192.png" }); return; } }
      if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "icon-192.png" });
    } catch (e) {}
  }
  function drawUI() {
    $("#alCrowd").checked = opt.crowd; $("#alPrayer").checked = opt.prayer; $("#alBefore").value = String(opt.before);
    const n = events().length;
    $("#alState").textContent = (opt.crowd || opt.prayer)
      ? (LN() ? `অ্যাপ বন্ধ থাকলেও নোটিফিকেশন আসবে। সামনের ${bn(n)}টি অ্যালার্ট ঠিক করা আছে।`
              : "ওয়েবসাইটে অ্যালার্ট আসবে শুধু এই পাতা খোলা থাকলে। অ্যাপে বন্ধ থাকলেও আসে।")
      : "অ্যালার্ট বন্ধ আছে।";
  }
  async function set(k, v) {
    if (v === true && !(await permission())) { flash("নোটিফিকেশনের অনুমতি পাওয়া যায়নি। ফোনের সেটিংস থেকে অনুমতি দিন।"); v = false; }
    opt[k] = v; store.set("alerts", opt); reschedule();
  }
  function init() {
    $("#alCrowd").addEventListener("change", e => set("crowd", e.target.checked));
    $("#alPrayer").addEventListener("change", e => set("prayer", e.target.checked));
    $("#alBefore").addEventListener("change", e => { opt.before = +e.target.value; store.set("alerts", opt); reschedule(); });
    drawUI();
  }
  return { init, reschedule };
})();

/* ---------- 3D Mataf ---------- */
function build3D(host) {
  const T = window.THREE;
  if (!T) { host.innerHTML = '<p class="loading">৩ডি দেখানো যাচ্ছে না।</p>'; return null; }
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x0d1726, 160, 320);
  const cam = new T.PerspectiveCamera(42, 1, 1, 1200);
  const hemi = new T.HemisphereLight(0xffffff, 0xb8b2a2, 1.0); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, .55); sun.position.set(30, 90, 40); scene.add(sun);
  const canvasTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.anisotropy = 4; return t; };

  /* floor: white marble with seams */
  const floorTex = canvasTex(1024, 1024, (x, w) => {
    x.fillStyle = "#f7f7f4"; x.fillRect(0, 0, w, w);
    x.strokeStyle = "rgba(150,145,130,.22)"; x.lineWidth = 2;
    for (let r = 30; r < 520; r += 22) { x.beginPath(); x.arc(512, 512, r, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 96; a++) { x.beginPath(); x.moveTo(512 + 30 * Math.cos(a / 96 * 6.283), 512 + 30 * Math.sin(a / 96 * 6.283)); x.lineTo(512 + 520 * Math.cos(a / 96 * 6.283), 512 + 520 * Math.sin(a / 96 * 6.283)); x.stroke(); }
  });
  const floor = new T.Mesh(new T.CircleGeometry(95, 128), new T.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  /* Kaaba */
  const kiswaTex = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = "#060606"; x.fillRect(0, 0, w, h);
    // woven text pattern
    x.strokeStyle = "rgba(255,255,255,.045)"; x.lineWidth = 3;
    for (let y = 30; y < h; y += 46) for (let i = 0; i < w; i += 60) { x.beginPath(); x.moveTo(i, y); x.bezierCurveTo(i + 15, y - 18, i + 35, y + 18, i + 52, y); x.stroke(); }
    // golden belt (hizam) in the upper third
    const by = 250, bh = 110;
    const gg = x.createLinearGradient(0, by, 0, by + bh); gg.addColorStop(0, "#8a6a26"); gg.addColorStop(.5, "#e7c66f"); gg.addColorStop(1, "#8a6a26");
    x.fillStyle = gg; x.fillRect(0, by, w, bh);
    x.fillStyle = "#060606"; x.fillRect(0, by + 10, w, bh - 20);
    x.strokeStyle = "#e2bf63"; x.lineWidth = 5;
    for (let i = 0; i < w; i += 14) { x.beginPath(); x.moveTo(i, by + 22 + (i * 37 % 40)); x.quadraticCurveTo(i + 7, by + 30, i + 12, by + bh - 24 - (i * 13 % 30)); x.stroke(); }
    // gold medallions under the belt
    for (let i = 70; i < w; i += 220) {
      x.fillStyle = "#c9a24a"; x.fillRect(i, by + bh + 40, 70, 90);
      x.fillStyle = "#060606"; x.fillRect(i + 8, by + bh + 48, 54, 74);
      x.strokeStyle = "#e2bf63"; x.lineWidth = 3; for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(i + 14, by + bh + 58 + k * 13); x.lineTo(i + 56, by + bh + 58 + k * 13); x.stroke(); }
    }
  });
  const kiswa = new T.MeshLambertMaterial({ map: kiswaTex });
  const roofM = new T.MeshLambertMaterial({ color: 0x2a2a2a });
  const kaaba = new T.Mesh(new T.BoxGeometry(12, 13.1, 11), [kiswa, kiswa, roofM, roofM, kiswa, kiswa]);
  kaaba.position.y = 6.75; scene.add(kaaba);
  const shadh = new T.Mesh(new T.CylinderGeometry(9.0, 9.4, .6, 4, 1), new T.MeshLambertMaterial({ color: 0xd8d2c2 }));
  shadh.rotation.y = Math.PI / 4; shadh.scale.set(1, 1, 11.8 / 12.8); shadh.position.y = .3; scene.add(shadh);
  const doorTex = canvasTex(256, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#f3dc94"); g.addColorStop(.5, "#c9a24a"); g.addColorStop(1, "#8a6a26");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#6b4f17"; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 28); x.beginPath(); x.moveTo(w / 2, 14); x.lineTo(w / 2, h - 14); x.stroke();
    for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(w / 4, 60 + k * 72, 18, 0, 6.28); x.arc(3 * w / 4, 60 + k * 72, 18, 0, 6.28); x.stroke(); }
  });
  const door = new T.Mesh(new T.PlaneGeometry(1.9, 3.3), new T.MeshLambertMaterial({ map: doorTex, emissive: 0x2a1a00 }));
  door.position.set(6.02, 4.0, 2.4); door.rotation.y = Math.PI / 2; scene.add(door);
  const stone = new T.Mesh(new T.TorusGeometry(.45, .14, 8, 20), new T.MeshLambertMaterial({ color: 0xc0c0c0, emissive: 0x222222 }));
  stone.position.set(6.05, 1.6, 5.55); stone.rotation.y = Math.PI / 4; scene.add(stone);
  // Hateem: low white marble semicircle on the side next to the door
  const hm = new T.MeshLambertMaterial({ color: 0xfafaf6 });
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI * i / 48, seg = new T.Mesh(new T.BoxGeometry(1.2, 1.3, .9), hm);
    seg.position.set(7.8 * Math.cos(a), .65, -4.5 - 8.2 * Math.sin(a)); seg.rotation.y = -a + Math.PI / 2; scene.add(seg);
  }
  // Maqam Ibrahim: golden cage with a small dome
  const gold = new T.MeshLambertMaterial({ color: 0xd4af37, emissive: 0x2a1a00 });
  const mq = new T.Group();
  const m1 = new T.Mesh(new T.CylinderGeometry(.8, .95, 2.0, 8), new T.MeshLambertMaterial({ color: 0xf0e2b0, emissive: 0x302000, transparent: true, opacity: .9 }));
  m1.position.y = 1.0; mq.add(m1);
  const m2 = new T.Mesh(new T.SphereGeometry(.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold); m2.position.y = 2.0; mq.add(m2);
  const m3 = new T.Mesh(new T.CylinderGeometry(.06, .06, .6, 6), gold); m3.position.y = 3.0; mq.add(m3);
  mq.position.set(14, 0, 2.4); scene.add(mq);

  /* Ottoman portico: a ring of arches with small domes, around the Mataf (as in the live video) */
  const sx = 58, sz = 50, nP = 4.2;
  const ringPt = t => { const c = Math.cos(t), s = Math.sin(t); return [sx * Math.sign(c) * Math.pow(Math.abs(c), 2 / nP), sz * Math.sign(s) * Math.pow(Math.abs(s), 2 / nP)]; };
  const pts = []; let prev = ringPt(0), acc = 0; pts.push(prev);
  for (let t = 0; t < Math.PI * 2; t += .002) { const p = ringPt(t); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); if (acc >= 4.6) { pts.push(p); acc = 0; } prev = p; }
  const stoneM = new T.MeshLambertMaterial({ color: 0xe9e1cf });
  const pillar = new T.InstancedMesh(new T.CylinderGeometry(.45, .5, 7, 8), stoneM, pts.length);
  const dome = new T.InstancedMesh(new T.SphereGeometry(2.1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshLambertMaterial({ color: 0xf2efe6 }), pts.length);
  const arch = new T.InstancedMesh(new T.TorusGeometry(2.3, .32, 6, 16, Math.PI), new T.MeshLambertMaterial({ color: 0xc8a96a }), pts.length);
  const beam = new T.InstancedMesh(new T.BoxGeometry(4.8, 1.2, 5), stoneM, pts.length);
  const MM = new T.Matrix4(), QQ = new T.Quaternion(), PP = new T.Vector3(), SS = new T.Vector3(1, 1, 1), YUP = new T.Vector3(0, 1, 0);
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    QQ.setFromAxisAngle(YUP, -ang);
    PP.set(p[0], 3.5, p[1]); MM.compose(PP, QQ, SS); pillar.setMatrixAt(i, MM);
    PP.set(mid[0], 7, mid[1]); MM.compose(PP, QQ, SS); arch.setMatrixAt(i, MM);
    PP.set(mid[0], 8.6, mid[1]); MM.compose(PP, QQ, SS); beam.setMatrixAt(i, MM);
    PP.set(mid[0], 9.2, mid[1]); MM.compose(PP, QQ, SS); dome.setMatrixAt(i, MM);
  });
  scene.add(pillar, arch, beam, dome);
  // tall floors of the mosque behind the portico, lit at night
  const facadeTex = canvasTex(2048, 256, (x, w, h) => {
    x.fillStyle = "#d9d2c0"; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 3; row++) for (let i = 0; i < w; i += 64) {
      const y = 20 + row * 80;
      x.fillStyle = "#fff6d8"; x.beginPath(); x.moveTo(i + 12, y + 60); x.lineTo(i + 12, y + 22); x.arc(i + 32, y + 22, 20, Math.PI, 0); x.lineTo(i + 52, y + 60); x.fill();
      x.fillStyle = "rgba(120,100,60,.35)"; x.fillRect(i + 12, y + 62, 40, 4);
    }
  });
  facadeTex.wrapS = T.RepeatWrapping; facadeTex.repeat.set(3, 1);
  const facade = new T.Mesh(new T.CylinderGeometry(92, 92, 34, 96, 1, true), new T.MeshLambertMaterial({ map: facadeTex, side: T.BackSide, emissive: 0x3a3426 }));
  facade.position.y = 17; scene.add(facade);
  // lamp posts like the floodlights in the Mataf
  const lampM = new T.MeshBasicMaterial({ color: 0xfffbe8 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, x = 44 * Math.cos(a), z = 40 * Math.sin(a);
    const pole = new T.Mesh(new T.CylinderGeometry(.12, .15, 9, 6), new T.MeshLambertMaterial({ color: 0x777777 })); pole.position.set(x, 4.5, z); scene.add(pole);
    const lamp = new T.Mesh(new T.SphereGeometry(.45, 8, 6), lampM); lamp.position.set(x, 9.2, z); scene.add(lamp);
  }

  /* pilgrims: body + head, mostly white ihram and black abaya, like in the video */
  const MAX = 7000;
  const bodyG = new T.CylinderGeometry(.19, .27, 1.3, 7); bodyG.translate(0, .65, 0);
  const headG = new T.SphereGeometry(.13, 8, 6); headG.translate(0, 1.45, 0);
  const body = new T.InstancedMesh(bodyG, new T.MeshLambertMaterial(), MAX);
  const head = new T.InstancedMesh(headG, new T.MeshLambertMaterial(), MAX);
  body.instanceMatrix.setUsage(T.DynamicDrawUsage); head.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const col = new T.Color();
  const ag = [];
  for (let i = 0; i < MAX; i++) {
    const r = Math.random();
    const kind = r < .56 ? "ihram" : r < .84 ? "abaya" : "other";
    const c = kind === "ihram" ? [0xffffff, 0xf4f4f0, 0xeceae4][(Math.random() * 3) | 0]
      : kind === "abaya" ? [0x111111, 0x1b1b1f, 0x262626][(Math.random() * 3) | 0]
      : [0x4a6fa5, 0x8c6d4f, 0xa8a8a8, 0x2e7d5b, 0x7a3e3e, 0xd8c9a8][(Math.random() * 6) | 0];
    body.setColorAt(i, col.set(c));
    head.setColorAt(i, col.set(kind === "abaya" ? 0x111111 : [0x3b2a20, 0x5a4030, 0x2a2420, 0xf0f0f0][(Math.random() * 4) | 0]));
    ag.push({ a: Math.random() * Math.PI * 2, u: Math.random(), sp: .7 + Math.random() * .6, ph: Math.random() * 6.28, r: 0, s: .9 + Math.random() * .22 });
  }
  scene.add(body, head);
  const HATEEM_A = Math.PI / 2;
  const rMin = a => 9.6 + 8 * Math.pow(Math.max(0, Math.cos(a - HATEEM_A)), 2);
  let target = .5, cur = .5, prayer = null, hateemOpen = false;
  const M = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3(1, 1, 1), UP = new T.Vector3(0, 1, 0);

  /* camera: high angle like the live broadcast; drag to turn, pinch or wheel to zoom */
  let yaw = -.35, pitch = .92, distc = 88, drag = null, idle = 0;
  const el = renderer.domElement;
  el.style.touchAction = "none";
  const ptr = new Map();
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); drag = true; idle = 0; });
  el.addEventListener("pointermove", e => {
    if (!ptr.has(e.pointerId)) return;
    const [x0, y0] = ptr.get(e.pointerId);
    if (ptr.size === 1) { yaw -= (e.clientX - x0) * .006; pitch = Math.max(.18, Math.min(1.5, pitch + (e.clientY - y0) * .005)); }
    else if (ptr.size === 2) {
      const o = [...ptr.entries()].find(([k]) => k !== e.pointerId)[1];
      const d0 = Math.hypot(x0 - o[0], y0 - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
      distc = Math.max(22, Math.min(200, distc * d0 / (d1 || 1)));
    }
    ptr.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const up = e => { ptr.delete(e.pointerId); if (!ptr.size) drag = null; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", e => { e.preventDefault(); distc = Math.max(22, Math.min(200, distc * (1 + e.deltaY * .001))); }, { passive: false });

  const labels = [["কাবা", new T.Vector3(0, 15.5, 0)], ["হাতিম", new T.Vector3(0, 2.6, -11)], ["মাকামে ইবরাহিম", new T.Vector3(14, 3.6, 2.4)], ["হাজরে আসওয়াদ", new T.Vector3(6.6, 5.4, 6.4)]]
    .map(([t, v]) => { const d = document.createElement("div"); d.className = "tw-label"; d.textContent = t; host.appendChild(d); return { d, v }; });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); el.style.width = w + "px"; el.style.height = h + "px";
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  let last = performance.now(), raf = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.1, (t - last) / 1000); last = t;
    if (!drag) { idle += dt; if (idle > 4) yaw += dt * .03; }
    cur += (target - cur) * Math.min(1, dt * .7);
    // people spread from the Kaaba outwards; more people fill wider rings
    const n = Math.round(Math.pow(cur, 1.15) * MAX);
    const outer = 15 + cur * 30;
    body.count = head.count = n;
    for (let i = 0; i < n; i++) {
      const g = ag[i];
      const inside = hateemOpen && i < 60;
      let x, z, face;
      if (inside) {
        z = -6.4 - g.u * 5.6;
        const half = Math.sqrt(Math.max(0, 7.8 * 7.8 - (z + 4.5) * (z + 4.5))) - 1.1;
        x = (g.sp - 1) * 2 * half; face = 0;
      } else {
        const lo = rMin(g.a), want = Math.sqrt(lo * lo + g.u * (outer * outer - lo * lo)); // even spread over the area
        if (!g.r) g.r = want;
        if (prayer) {
          const row = Math.round(want / 1.15) * 1.15;
          g.r += (row - g.r) * Math.min(1, dt * 2);
        } else {
          g.r += (want - g.r) * Math.min(1, dt * .5);
          const v = g.sp * (1.15 - .8 * cur) * 1.6;
          g.a += v / Math.max(9, g.r) * dt;
        }
        const r = Math.max(g.r, rMin(g.a));
        x = r * Math.cos(g.a); z = -r * Math.sin(g.a);
        face = prayer ? Math.atan2(-x, -z) : -g.a;
      }
      const moving = !prayer && !inside;
      const bob = moving ? Math.abs(Math.sin(t / 250 * g.sp + g.ph)) * .07 : 0;
      P.set(x, bob, z); Q.setFromAxisAngle(UP, face);
      const bow = prayer && (Math.floor(t / 4500 + g.ph) % 3 === 1);
      S.set(g.s, bow ? .55 : g.s, g.s);
      M.compose(P, Q, S); body.setMatrixAt(i, M); head.setMatrixAt(i, M);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
    cam.position.set(distc * Math.cos(pitch) * Math.cos(yaw), distc * Math.sin(pitch), distc * Math.cos(pitch) * Math.sin(yaw));
    cam.lookAt(0, 2, 0);
    renderer.render(scene, cam);
    const w = host.clientWidth, h = host.clientHeight;
    for (const L of labels) {
      const p = L.v.clone().project(cam);
      L.d.style.transform = `translate(${(p.x * .5 + .5) * w}px, ${(-p.y * .5 + .5) * h}px) translate(-50%,-100%)`;
      L.d.style.opacity = p.z < 1 ? 1 : 0;
    }
  }
  function setSky(min) {
    const h = min / 60;
    const day = h > 6.3 && h < 17.8, dusk = (h >= 5.2 && h <= 6.6) || (h >= 17.4 && h <= 18.6);
    const sky = day ? (dusk ? 0xe9c9a0 : 0xbfd6e8) : 0x0b1424;
    scene.background = new T.Color(sky); scene.fog.color.set(sky);
    // the Haram is floodlit at night, so the floor stays bright
    hemi.intensity = day ? .95 : .8; sun.intensity = day ? .55 : .25;
  }
  return {
    start() { resize(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); },
    resize,
    setCrowd(v, pr, min) {
      target = pr ? Math.max(v, .8) : v; prayer = pr; setSky(min);
      const H = window.HATEEM;
      const inW = (w, m) => (w || []).some(([a, b]) => m >= a && m < b);
      hateemOpen = !!H && (inW(H.women.open, min) || inW(H.men.open, min));
    }
  };
}

let timer = 0, booted = false;
function boot() {
  if (booted) return; booted = true;
  refreshCtx(); redrawAll(); Alerts.reschedule();
}
function start() {
  boot(); refreshCtx();
  if (!three) three = build3D($("#tw3d"));
  if (three) three.start();
  redrawAll();
  running = true;
  clearInterval(timer);
  timer = setInterval(() => { const d = lastDay; refreshCtx(); if (d !== lastDay) { redrawAll(); Alerts.reschedule(); } else if (live) drawStatus(); }, 15000);
}
function stop() { running = false; clearInterval(timer); if (three) three.stop(); }
function init() {
  $("#twSlider").addEventListener("input", e => { live = false; viewMin = +e.target.value; $("#twLive").hidden = false; drawStatus(); });
  $("#twLive").addEventListener("click", () => { live = true; $("#twLive").hidden = true; drawStatus(); });
  document.querySelectorAll("[data-cal]").forEach(b => b.addEventListener("click", () => { refreshCtx(); calibrate(b.dataset.cal); }));
  addEventListener("resize", () => { if (running && three) three.resize(); });
  const off = () => { $("#twOffline").hidden = navigator.onLine; };
  addEventListener("online", off); addEventListener("offline", off); off();
  Alerts.init();
  // alerts are set up when the app opens, not only when this page is shown
  setTimeout(boot, 1500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && booted) { refreshCtx(); Alerts.reschedule(); } });
}
window.TawafView = { start, stop, init, prayerTimes, state: (m) => state(m, ctx) };
})();
