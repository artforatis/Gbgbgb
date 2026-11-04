/* Tawaf crowd view: today's prayer times for Makkah, an estimated crowd level for every minute,
   and a moving 3D Mataf. The estimate follows the official busy / quiet hours and the prayer times;
   the exact live level is only published by the Grand Mosque authority (linked on the page). */
(function () {
"use strict";
const LAT = 21.4225, LNG = 39.8262, TZ = 3;
const BN = "০১২৩৪৫৬৭৮৯";
const bn = v => String(v).replace(/\d/g, d => BN[d]);
const $ = s => document.querySelector(s);

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
  // Julian day at local noon
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
  for (const k in t) t[k] = Math.round(t[k] * 60); // minutes after midnight
  return t;
}
// time to iqamah at the Haram and how long the congregation takes (approximate)
const IQAMA = { fajr: 25, dhuhr: 20, asr: 20, maghrib: 10, isha: 20 };
const LEN = { fajr: 12, dhuhr: 10, asr: 10, maghrib: 9, isha: 11 };
const PNAME = { fajr: "ফজর", sunrise: "সূর্যোদয়", dhuhr: "যোহর", asr: "আসর", maghrib: "মাগরিব", isha: "এশা" };

/* ---------- crowd estimate, 0..1 ---------- */
// official: busiest 5 pm–9 pm; quiet 10 pm–4 am and 9 am–4 pm; medium 5 am–8 am
const ANCH = [[0, .32], [3, .28], [4, .4], [5, .55], [8, .5], [9, .32], [12, .3], [16, .36], [17, .72], [19, .86], [21, .74], [22, .4], [24, .32]];
function baseAt(h) {
  for (let i = 1; i < ANCH.length; i++) if (h <= ANCH[i][0]) {
    const [h0, v0] = ANCH[i - 1], [h1, v1] = ANCH[i];
    return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return .32;
}
function makkahDate(now) { return new Date(now.getTime() + (now.getTimezoneOffset() + TZ * 60) * 60000); }
function state(min, ctx) {
  // min: minutes after midnight (Makkah); ctx: {pt, friday, hm, hd}
  let v = baseAt(min / 60), prayer = null;
  for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
    const a = ctx.pt[k], iq = a + IQAMA[k], end = iq + LEN[k];
    if (min >= a - 45 && min < iq) v += .18 * (1 - (iq - min) / (iq - a + 45));      // people arrive before the prayer
    if (min >= iq && min < end) prayer = k;                                            // congregation: tawaf stops
    if (min >= end && min < end + 35) v += .14 * (1 - (min - end) / 35);             // tawaf restarts, a rush
  }
  if (ctx.friday && min >= 600 && min < ctx.pt.dhuhr + 40) v += .25;
  if (ctx.hm === 9) { v = v * 1.25 + .08; if (ctx.hd >= 20 && (min >= 1260 || min < 240)) v += .3; }
  if (ctx.hm === 12 && ctx.hd >= 1 && ctx.hd <= 13) v = Math.max(v, .62) + .15;
  return { v: Math.max(.06, Math.min(1, v)), prayer };
}
function ctxFor(md) {
  const h = hijri(md);
  return { pt: prayerTimes(md.getFullYear(), md.getMonth() + 1, md.getDate()), friday: md.getDay() === 5, hm: h.m, hd: h.d };
}
const LEVELS = [[.35, "কম", "#1E9E62"], [.6, "মাঝারি", "#C9A24A"], [.8, "বেশি", "#D9822B"], [2, "খুব বেশি", "#C0392B"]];
const level = v => LEVELS.find(l => v < l[0]);
function fmtMin(m) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const part = h < 4 ? "রাত" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
  return `${part} ${bn(((h + 11) % 12) + 1)}:${bn(String(mm).padStart(2, "0"))}`;
}

/* ---------- page ---------- */
let ctx = null, viewMin = null, live = true, three = null, running = false, lastDay = -1;
function nowMin() { const md = makkahDate(new Date()); return md.getHours() * 60 + md.getMinutes() + md.getSeconds() / 60; }
function refreshCtx() {
  const md = makkahDate(new Date());
  if (md.getDate() !== lastDay) { ctx = ctxFor(md); lastDay = md.getDate(); drawChart(); drawPrayers(); }
}
function calmWindows() {
  const out = []; let start = null;
  const n = nowMin();
  for (let k = 0; k <= 1440; k += 5) {
    const m = (n + k) % 1440, s = state(m, ctx);
    const calm = s.v < .38 && !s.prayer;
    if (calm && start === null) start = n + k;
    if ((!calm || k === 1440) && start !== null) { if (n + k - start >= 30) out.push([start, n + k]); start = null; }
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
  $("#twTime").textContent = (live ? "এখন " : "") + fmtMin(m);
  $("#twNote").textContent = s.prayer
    ? `${PNAME[s.prayer]}ের জামাত চলছে। এ সময় তাওয়াফ থেমে থাকে, সবাই কাতারে দাঁড়ান।`
    : L[1] === "কম" ? "এখন তাওয়াফের জন্য ভালো সময়।" : L[1] === "মাঝারি" ? "ভিড় মাঝারি। ধীরে ধীরে তাওয়াফ করা যাবে।" : "এখন অনেক ভিড়। পারলে পরের কম ভিড়ের সময়ে যান।";
  const w = calmWindows();
  $("#twNext").innerHTML = w.length
    ? w.slice(0, 3).map(([a, b]) => `<li><b>${fmtMin(a)}</b> থেকে <b>${fmtMin(b)}</b></li>`).join("")
    : "<li>আজ আর দীর্ঘ কম ভিড়ের সময় নেই বলে ধারণা।</li>";
  $("#twSlider").value = Math.round(m);
  const nl = $("#twChartNow"); if (nl) nl.setAttribute("x", (m / 1440 * 1000).toFixed(1));
  if (three) three.setCrowd(s.v, s.prayer, m);
}
function drawChart() {
  const W = 1000, H = 160;
  let d = "M0," + H;
  for (let m = 0; m <= 1440; m += 10) d += ` L${(m / 1440 * W).toFixed(1)},${(H - state(m % 1440, ctx).v * (H - 30)).toFixed(1)}`;
  d += ` L${W},${H} Z`;
  const ks = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const lines = ks.map(k => { const x = (ctx.pt[k] + IQAMA[k]) / 1440 * W; return `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#0B6B50" stroke-width="3" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>`; }).join("");
  const tags = ks.map((k, i) => `<span class="tw-tag" style="left:${((ctx.pt[k] + IQAMA[k]) / 1440 * 100).toFixed(2)}%;top:${i % 2 ? 22 : 2}px">${PNAME[k]}</span>`).join("");
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

/* ---------- 3D Mataf ---------- */
function build3D(host) {
  const T = window.THREE;
  if (!T) { host.innerHTML = '<p class="loading">৩ডি দেখানো যাচ্ছে না।</p>'; return null; }
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(45, 1, 1, 2000);
  const hemi = new T.HemisphereLight(0xffffff, 0x8a8a80, .9); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, .8); sun.position.set(40, 80, 30); scene.add(sun);

  // marble floor with tile rings
  const fc = document.createElement("canvas"); fc.width = fc.height = 1024;
  const fx = fc.getContext("2d");
  fx.fillStyle = "#f3f2ee"; fx.fillRect(0, 0, 1024, 1024);
  fx.strokeStyle = "rgba(160,150,130,.35)"; fx.lineWidth = 2;
  for (let r = 40; r < 520; r += 26) { fx.beginPath(); fx.arc(512, 512, r, 0, Math.PI * 2); fx.stroke(); }
  for (let a = 0; a < 64; a++) { fx.beginPath(); fx.moveTo(512, 512); fx.lineTo(512 + 520 * Math.cos(a / 64 * Math.PI * 2), 512 + 520 * Math.sin(a / 64 * Math.PI * 2)); fx.stroke(); }
  const floor = new T.Mesh(new T.CircleGeometry(62, 96), new T.MeshLambertMaterial({ map: new T.CanvasTexture(fc) }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const outer = new T.Mesh(new T.RingGeometry(62, 140, 96), new T.MeshLambertMaterial({ color: 0xd9d6cc }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -.02; scene.add(outer);

  // Kaaba with kiswa and golden band
  const kc = document.createElement("canvas"); kc.width = 512; kc.height = 512;
  const kx = kc.getContext("2d");
  kx.fillStyle = "#050505"; kx.fillRect(0, 0, 512, 512);
  kx.strokeStyle = "rgba(255,255,255,.05)"; kx.lineWidth = 1;
  for (let i = 0; i < 512; i += 16) { kx.beginPath(); kx.moveTo(i, 0); kx.lineTo(i + 40, 512); kx.stroke(); }
  kx.fillStyle = "#b8923d"; kx.fillRect(0, 120, 512, 46);
  kx.fillStyle = "#e3c273";
  for (let i = 8; i < 512; i += 32) { kx.beginPath(); kx.ellipse(i + 8, 143, 10, 14, 0, 0, Math.PI * 2); kx.fill(); }
  kx.fillStyle = "#050505";
  for (let i = 8; i < 512; i += 32) { kx.beginPath(); kx.ellipse(i + 8, 143, 4, 7, 0, 0, Math.PI * 2); kx.fill(); }
  const kiswa = new T.MeshLambertMaterial({ map: new T.CanvasTexture(kc) });
  const top = new T.MeshLambertMaterial({ color: 0x1a1a1a });
  const kaaba = new T.Mesh(new T.BoxGeometry(12, 13.1, 11), [kiswa, kiswa, top, top, kiswa, kiswa]);
  kaaba.position.y = 6.55; scene.add(kaaba);
  const base = new T.Mesh(new T.BoxGeometry(12.8, .5, 11.8), new T.MeshLambertMaterial({ color: 0xcfc8b8 }));
  base.position.y = .25; scene.add(base);
  const door = new T.Mesh(new T.BoxGeometry(.2, 3.2, 1.8), new T.MeshLambertMaterial({ color: 0xd4af37, emissive: 0x332200 }));
  door.position.set(6.05, 3.8, 2.4); scene.add(door);
  // Black Stone corner (east)
  const stone = new T.Mesh(new T.CylinderGeometry(.45, .45, .6, 16), new T.MeshLambertMaterial({ color: 0xb0b0b0 }));
  stone.position.set(6.1, 1.5, 5.6); scene.add(stone);
  // Hateem (semicircle wall on the north-west side)
  const hm = new T.MeshLambertMaterial({ color: 0xf6f5f0 });
  const hateem = new T.Group();
  // facing the door (+x face) the Black Stone is on the left (+x/+z corner) and the Hateem on the right (-z face)
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * i / 40, seg = new T.Mesh(new T.BoxGeometry(1.4, 1.3, .9), hm);
    seg.position.set(7.8 * Math.cos(a), .65, -4.5 - 8.2 * Math.sin(a));
    seg.rotation.y = -a + Math.PI / 2; hateem.add(seg);
  }
  scene.add(hateem);
  // Maqam Ibrahim
  const maq = new T.Group();
  const mq1 = new T.Mesh(new T.CylinderGeometry(.9, 1.1, 2.2, 8), new T.MeshLambertMaterial({ color: 0xd4af37, emissive: 0x221500 }));
  mq1.position.y = 1.1; maq.add(mq1);
  const mq2 = new T.Mesh(new T.SphereGeometry(.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mq1.material);
  mq2.position.y = 2.2; maq.add(mq2);
  maq.position.set(14, 0, 2.4); scene.add(maq);
  // arcade around the Mataf
  const colM = new T.MeshLambertMaterial({ color: 0xe9e4d6 });
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, c = new T.Mesh(new T.CylinderGeometry(.7, .7, 11, 8), colM);
    c.position.set(66 * Math.cos(a), 5.5, 66 * Math.sin(a)); scene.add(c);
  }
  const roof = new T.Mesh(new T.TorusGeometry(68, 3.5, 4, 96), colM);
  roof.rotation.x = Math.PI / 2; roof.position.y = 11.5; scene.add(roof);
  const ring2 = new T.Mesh(new T.CylinderGeometry(78, 78, 22, 96, 1, true), new T.MeshLambertMaterial({ color: 0xded8c7, side: T.BackSide }));
  ring2.position.y = 11; scene.add(ring2);

  // pilgrims
  const MAX = 2600;
  const geo = new T.CylinderGeometry(.24, .3, 1.55, 6); geo.translate(0, .78, 0);
  const mat = new T.MeshLambertMaterial({ vertexColors: false });
  const crowd = new T.InstancedMesh(geo, mat, MAX);
  crowd.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const col = new T.Color(), PAL = [0xffffff, 0xffffff, 0xffffff, 0xf2f2f2, 0x222222, 0x1a1a2e, 0x6d4c41, 0x2e5e8c, 0xb0a99f];
  const ag = [];
  for (let i = 0; i < MAX; i++) {
    ag.push({ a: Math.random() * Math.PI * 2, u: Math.random(), sp: .75 + Math.random() * .5, ph: Math.random() * 6.28, r: 0, inH: false });
    crowd.setColorAt(i, col.set(PAL[(Math.random() * PAL.length) | 0]));
  }
  scene.add(crowd);
  const HATEEM_A = Math.PI / 2; // direction of the Hateem from the centre (-z)
  const rMin = a => 9.2 + 7.5 * Math.pow(Math.max(0, Math.cos(a - HATEEM_A)), 2);
  let target = .4, cur = .4, prayer = null, hateemOpen = false;
  const M = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3(1, 1, 1), UP = new T.Vector3(0, 1, 0);

  // camera orbit
  let yaw = -.5, pitch = .55, distc = 72, drag = null, idle = 0;
  const el = renderer.domElement;
  el.style.touchAction = "none";
  const pts = new Map();
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = true; idle = 0; });
  el.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    const [x0, y0] = pts.get(e.pointerId);
    if (pts.size === 1) { yaw -= (e.clientX - x0) * .006; pitch = Math.max(.15, Math.min(1.45, pitch + (e.clientY - y0) * .005)); }
    else if (pts.size === 2) {
      const o = [...pts.entries()].find(([k]) => k !== e.pointerId)[1];
      const d0 = Math.hypot(x0 - o[0], y0 - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
      distc = Math.max(30, Math.min(220, distc * d0 / (d1 || 1)));
    }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) drag = null; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", e => { e.preventDefault(); distc = Math.max(30, Math.min(220, distc * (1 + e.deltaY * .001))); }, { passive: false });

  const labels = [["কাবা", new T.Vector3(0, 15, 0)], ["হাতিম", new T.Vector3(0, 2.6, -11)], ["মাকামে ইবরাহিম", new T.Vector3(14, 3.4, 2.4)], ["হাজরে আসওয়াদ", new T.Vector3(6.6, 5.2, 6.4)]]
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
    if (!drag) { idle += dt; if (idle > 3) yaw += dt * .04; }
    cur += (target - cur) * Math.min(1, dt * .8);
    const n = Math.round(cur * MAX);
    crowd.count = n;
    const spread = 6 + cur * 46;
    for (let i = 0; i < n; i++) {
      const g = ag[i];
      const inside = hateemOpen && i < 40;
      let r, x, z, face;
      if (inside) {
        // a few people praying inside the Hateem
        z = -6.6 - g.u * 5.2;
        const half = Math.sqrt(Math.max(0, 7.8 * 7.8 - (z + 4.5) * (z + 4.5))) - 1.2;
        x = (g.sp - 1) * 2 * half; face = 0;
      } else {
        const want = rMin(g.a) + Math.pow(g.u, 1.6) * spread;
        if (prayer) {
          const row = Math.round(want / 1.25) * 1.25;
          g.r += (row - g.r) * Math.min(1, dt * 2);
        } else {
          g.r += (want - g.r) * Math.min(1, dt * .6);
          const v = g.sp * (1.25 - .85 * cur) * 2.2; // shown about twice real speed
          g.a += v / Math.max(8, g.r) * dt;
        }
        r = Math.max(g.r, rMin(g.a));
        x = r * Math.cos(g.a); z = -r * Math.sin(g.a);
        face = prayer ? Math.atan2(-x, -z) : Math.atan2(-Math.sin(g.a + Math.PI / 2) * -1, Math.cos(g.a + Math.PI / 2));
      }
      const bob = (!prayer && !inside) ? Math.abs(Math.sin(t / 260 * g.sp + g.ph)) * .08 : 0;
      P.set(x, bob, z); Q.setFromAxisAngle(UP, face);
      S.set(1, prayer && (Math.floor(t / 4000 + g.ph) % 3 === 1) ? .55 : 1, 1); // in prayer some are in ruku/sujud
      M.compose(P, Q, S); crowd.setMatrixAt(i, M);
    }
    crowd.instanceMatrix.needsUpdate = true;
    cam.position.set(distc * Math.cos(pitch) * Math.cos(yaw), distc * Math.sin(pitch), distc * Math.cos(pitch) * Math.sin(yaw));
    cam.lookAt(0, 3, 0);
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
    const day = h > 6 && h < 18.2, dusk = (h >= 5 && h <= 6.5) || (h >= 17.3 && h <= 18.8);
    scene.background = new T.Color(day ? (dusk ? 0xe8c9a0 : 0xbcd4e6) : 0x0d1726);
    hemi.intensity = day ? .95 : .55; sun.intensity = day ? .8 : .35;
  }
  return {
    start() { resize(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); },
    resize,
    setCrowd(v, pr, min) {
      target = pr ? Math.max(v, .7) : v; prayer = pr; setSky(min);
      const H = window.HATEEM;
      const inW = (w, m) => (w || []).some(([a, b]) => m >= a && m < b);
      hateemOpen = !!H && (inW(H.women.open, min) || inW(H.men.open, min));
    }
  };
}

let timer = 0;
function start() {
  refreshCtx();
  if (!three) { three = build3D($("#tw3d")); }
  if (three) three.start();
  drawStatus();
  running = true;
  clearInterval(timer);
  timer = setInterval(() => { refreshCtx(); if (live) drawStatus(); }, 15000);
}
function stop() { running = false; clearInterval(timer); if (three) three.stop(); }
function init() {
  $("#twSlider").addEventListener("input", e => { live = false; viewMin = +e.target.value; $("#twLive").hidden = false; drawStatus(); });
  $("#twLive").addEventListener("click", () => { live = true; $("#twLive").hidden = true; drawStatus(); });
  addEventListener("resize", () => { if (running && three) three.resize(); });
  const off = () => { $("#twOffline").hidden = navigator.onLine; };
  addEventListener("online", off); addEventListener("offline", off); off();
}
window.TawafView = { start, stop, init, prayerTimes, state };
})();
