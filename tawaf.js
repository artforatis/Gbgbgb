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
  // the app (APK) loads capacitor.js, which lets us reach the phone's own notification system
  let _ln = null;
  const LN = () => {
    if (_ln) return _ln;
    const C = window.Capacitor;
    if (!C || !(C.isNativePlatform ? C.isNativePlatform() : C.isNative)) return null;
    if (C.Plugins && C.Plugins.LocalNotifications) return (_ln = C.Plugins.LocalNotifications);
    if (typeof C.registerPlugin === "function") return (_ln = C.registerPlugin("LocalNotifications"));
    return null;
  };
  let opt = Object.assign({ crowd: false, prayer: false, before: 10 }, store.get("alerts", {}));
  let webTimers = [];
  async function permission() {
    const ln = LN();
    if (ln) {
      try {
        let r = await ln.checkPermissions();
        if (r.display !== "granted") r = await ln.requestPermissions();
        if (r.display === "granted") {
          try { await ln.createChannel({ id: "haram", name: "Haram Guide", importance: 4, vibration: true, visibility: 1 }); } catch (e) {}
          return true;
        }
        return false;
      } catch (e) { flash("নোটিফিকেশন চালু করা যায়নি: " + (e && e.message ? e.message : e)); return false; }
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
        if (list.length) await ln.schedule({ notifications: list.map(e => ({ id: e.id, title: e.title, body: e.body, channelId: "haram", schedule: { at: e.at, allowWhileIdle: true } })) });
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

/* ---------- 3D Mataf (shared scene from haram3d.js) ---------- */
function build3D(host) {
  const T = window.THREE, H3 = window.Haram3D;
  if (!T || !H3) { host.insertAdjacentHTML("beforeend", '<p class="loading">৩ডি দেখানো যাচ্ছে না।</p>'); return null; }
  const renderer = H3.setupRenderer(host);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x0d1726, 160, 320);
  const cam = new T.PerspectiveCamera(42, 1, 1, 1200);
  const hemi = new T.HemisphereLight(0xffffff, 0xb8b2a2, 1.0); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, .55); sun.position.set(30, 90, 40); scene.add(sun);
  const env = H3.matafEnv(scene);
  const crowd = H3.crowd(scene, 7000, env.rMin);
  let target = .5, cur = .5, prayer = null, hateemOpen = false;
  const view = { yaw: -.35, pitch: .92, dist: 88, min: 22, max: 200, idle: 0 };
  H3.orbit(renderer.domElement, view);
  const labels = H3.labels(host);
  labels.add("কাবা", new T.Vector3(0, 15.5, 0)); labels.add("হাতিম", new T.Vector3(0, 2.6, -11));
  labels.add("মাকামে ইবরাহিম", new T.Vector3(14, 3.6, 2.4)); labels.add("হাজরে আসওয়াদ", new T.Vector3(6.6, 5.4, 6.4));
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  let last = performance.now(), raf = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.1, (t - last) / 1000); last = t;
    if (!view.drag) { view.idle += dt; if (view.idle > 4) view.yaw += dt * .03; }
    cur += (target - cur) * Math.min(1, dt * .7);
    crowd.update(dt, t, cur, prayer, hateemOpen);
    cam.position.set(view.dist * Math.cos(view.pitch) * Math.cos(view.yaw), view.dist * Math.sin(view.pitch), view.dist * Math.cos(view.pitch) * Math.sin(view.yaw));
    cam.lookAt(0, 2, 0);
    renderer.render(scene, cam);
    labels.update(cam);
  }
  function setSky(min) {
    const h = min / 60;
    const day = h > 6.3 && h < 17.8, dusk = (h >= 5.2 && h <= 6.6) || (h >= 17.4 && h <= 18.6);
    const sky = day ? (dusk ? 0xe9c9a0 : 0xbfd6e8) : 0x0b1424;
    scene.background = new T.Color(sky); scene.fog.color.set(sky);
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
