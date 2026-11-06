/* Haram Guide online part: admin panel, kafela profiles, live notices and content changes.
   Talks to Firebase (Authentication + Realtime Database) over its REST API, so no extra library is needed.
   Loaded before the main script: cached admin changes are applied to the content right away (works offline). */
(function () {
"use strict";
const CFG = window.HG_CLOUD || {};
const READY = !!(CFG.apiKey && CFG.databaseURL && !/PASTE_/.test(CFG.apiKey + CFG.databaseURL));
const ADMIN_EMAIL = CFG.adminEmail || "admin@haramguide.app";
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const q = (s, r = document) => r.querySelector(s), qq = (s, r = document) => [...r.querySelectorAll(s)];
const E = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const B = v => String(v).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const lines = s => String(s || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
const paras = s => String(s || "").split(/\n\s*\n+/).map(x => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rid = n => { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => ALPH[x % ALPH.length]).join(""); };
const fmtCode = c => c.slice(0, 5) + "-" + c.slice(5);
const ago = t => { if (!t) return "কখনো না"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "এইমাত্র" : m < 60 ? B(m) + " মিনিট আগে" : m < 1440 ? B(Math.round(m / 60)) + " ঘণ্টা আগে" : B(Math.round(m / 1440)) + " দিন আগে"; };
const toastMsg = m => { if (typeof toast === "function") toast(m); };

/* ---------------- Firebase REST ---------------- */
async function authCall(path, body) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || "AUTH_FAILED"); e.code = e.message; throw e; }
  return j;
}
function Session(key) {
  let s = ls.get(key, null);
  return {
    get on() { return !!s; }, get uid() { return s && s.uid; },
    set(j) { s = { idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, exp: Date.now() + ((+j.expiresIn || 3600) - 120) * 1000 }; ls.set(key, s); },
    async token() {
      if (!s) return null;
      if (Date.now() > s.exp) {
        const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(s.refreshToken) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { if (r.status === 400) { this.clear(); } throw new Error("REFRESH_FAILED"); }
        s.idToken = j.id_token; s.refreshToken = j.refresh_token; s.uid = j.user_id; s.exp = Date.now() + ((+j.expires_in || 3600) - 120) * 1000; ls.set(key, s);
      }
      return s.idToken;
    },
    clear() { s = null; ls.del(key); }
  };
}
const adm = Session("hgAdm"), mem = Session("hgMem");
async function db(method, path, data, sess) {
  let url = `${CFG.databaseURL.replace(/\/+$/, "")}/${path}.json`;
  const t = sess ? await sess.token() : null;
  if (t) url += "?auth=" + encodeURIComponent(t);
  const o = { method, cache: "no-store" };
  if (data !== undefined) { o.headers = { "Content-Type": "application/json" }; o.body = JSON.stringify(data); }
  const r = await fetch(url, o);
  if (!r.ok) { const e = new Error("DB_" + r.status); e.status = r.status; throw e; }
  return r.json();
}
const NOW = { ".sv": "timestamp" };

/* ---------------- admin changes to the content ---------------- */
function parseWins(s) {
  const out = [];
  String(s || "").split(/[,،;]+/).forEach(part => {
    const m = part.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/); if (!m) return;
    const a = (+m[1]) * 60 + (+m[2]), b = (+m[3]) * 60 + (+m[4]);
    if (b > a) out.push([a, b]); else { out.push([a, 1440]); if (b > 0) out.push([0, b]); }
  });
  return out;
}
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
function winsText(w) {
  const arr = (w || []).slice().sort((x, y) => x[0] - y[0]);
  // join a window that runs past midnight back into one piece
  const end = arr.find(x => x[1] === 1440), start = arr.find(x => x[0] === 0);
  const parts = [];
  arr.forEach(x => { if (x === start && end) return; if (x === end && start) parts.push(hhmm(x[0]) + "-" + hhmm(start[1])); else parts.push(hhmm(x[0]) + "-" + hhmm(x[1] % 1440)); });
  return parts.join(", ");
}
function applyContent(c) {
  if (!c) return;
  const H = window.HATEEM;
  if (c.hateem && H) {
    const h = c.hateem;
    for (const k of ["women", "men"]) if (h[k] && H[k]) {
      const g = h[k], o = H[k];
      ["title", "time", "gateTag", "gateText", "goto", "fieldNote"].forEach(f => { if (g[f] !== undefined && g[f] !== "") o[f] = g[f]; });
      if (g.fieldNote === "") o.fieldNote = "";
      if (g.openTxt) { const w = parseWins(g.openTxt); if (w.length) o.open = w; }
      if (g.waitTxt !== undefined) o.wait = parseWins(g.waitTxt);
      if (g.steps && g.steps.length) o.steps = g.steps;
    }
    if (h.warn) H.warn = h.warn;
    if (h.updated) H.updated = h.updated;
    if (h.crowd && h.crowd.length) H.crowd = h.crowd;
  }
  const items = c.items ? Object.entries(c.items).sort((a, b) => (a[1].t || 0) - (b[1].t || 0)) : [];
  for (const [id, it] of items) {
    try {
      if (it.type === "dua" && window.DUAS) window.DUAS.push({ g: it.g || "নতুন দোয়া", t: it.title, ref: it.ref || "", note: it.note || "", w: String(it.ar || "").trim().split(/\s+/).filter(Boolean).map(a => [a, ""]), pron: it.pron || "", mean: it.mean || "", _cloud: id });
      else if (it.type === "sunnah" && window.SUNNAH) {
        let grp = window.SUNNAH.find(x => x[0] === it.g); if (!grp) { grp = [it.g || "নতুন সুন্নত", []]; window.SUNNAH.push(grp); }
        grp[1].push([it.title, it.text || "", it.ref || ""]);
      }
      else if (it.type === "seerah" && window.SEERAH) window.SEERAH.push({ era: it.g || "আরও অধ্যায়", age: it.age || "", yr: "", t: it.title, ar: it.ar || "", arMean: it.arMean || "", body: paras(it.text), lesson: it.lesson || "", src: it.ref || "" });
      else if (it.type === "guide" && window.GUIDE && window.GUIDE[it.guide]) window.GUIDE[it.guide].sections.push({ id: "x-" + id, title: it.title, when: it.when || "", body: paras(it.text), todo: lines(it.todo), avoid: lines(it.avoid), women: lines(it.women), duas: [], src: it.ref || "" });
    } catch (e) {}
  }
}
let content = ls.get("hgContent", null);
applyContent(content);
// map places are applied by the main script once it has built its list
function applyPlaces(P) {
  if (!content) return;
  const del = content.placesDel || {};
  for (let i = P.length - 1; i >= 0; i--) if (del[P[i].id]) P.splice(i, 1);
  for (const [id, p] of Object.entries(content.places || {})) {
    if (!p || typeof p.lat !== "number") continue;
    const i = P.findIndex(x => x.id === id);
    const obj = Object.assign(i >= 0 ? Object.assign({}, P[i]) : { kind: "history", label: "•", tips: [] }, p, { id });
    if (!obj.city) obj.city = obj.lat > 23 ? "madinah" : "makkah";
    if (i >= 0) P[i] = obj; else P.push(obj);
  }
}

/* ---------------- notifications (app and website) ---------------- */
let _ln = null;
const LN = () => {
  if (_ln) return _ln;
  const C = window.Capacitor;
  if (!C || !(C.isNativePlatform ? C.isNativePlatform() : C.isNative)) return null;
  if (C.Plugins && C.Plugins.LocalNotifications) return (_ln = C.Plugins.LocalNotifications);
  if (typeof C.registerPlugin === "function") return (_ln = C.registerPlugin("LocalNotifications"));
  return null;
};
async function notify(title, body) {
  try {
    const ln = LN();
    if (ln) { await ln.schedule({ notifications: [{ id: 3000 + Math.floor(Math.random() * 900), title, body, channelId: "haram", smallIcon: "ic_stat_haram", iconColor: "#0B6B50", schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true } }] }); return; }
    if ("Notification" in window && Notification.permission === "granted") {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) reg.showNotification(title, { body, icon: "icon-192.png" }); else new Notification(title, { body, icon: "icon-192.png" });
    }
  } catch (e) {}
}

/* ---------------- styles ---------------- */
const css = `
.cl-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}
.cl-card h3{font-size:18px;margin-bottom:6px}
.cl-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.cl-in{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:12px 14px;font:inherit;font-size:16px;background:var(--surface);color:var(--ink);min-height:48px}
textarea.cl-in{min-height:110px;line-height:1.6}
.cl-f{display:block;margin:10px 0}
.cl-f>span{display:block;font-weight:700;margin-bottom:4px;font-size:15px}
.cl-f>small{display:block;color:var(--muted);margin-top:3px}
.cl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 14px}
.cl-notice{border-left:5px solid var(--gold);background:var(--gold-soft);color:#2b2108;border-radius:0 14px 14px 0;padding:10px 14px;margin:10px 0}
.cl-notice b{display:block;font-size:16px}
.cl-notice small{color:#6b5a2a}
.cl-me{display:flex;gap:14px;align-items:center}
.cl-ph{width:64px;height:64px;border-radius:50%;object-fit:cover;background:var(--green-soft);flex:0 0 auto;display:grid;place-items:center;font-weight:800;color:var(--green);font-size:24px;overflow:hidden}
.cl-ph img{width:100%;height:100%;object-fit:cover}
.cl-list{list-style:none;padding:0;margin:8px 0}
.cl-item{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:8px 0;background:var(--surface)}
.cl-item .cl-ph{width:52px;height:52px;font-size:20px}
.cl-item .grow{flex:1;min-width:0}
.cl-item b{display:block}
.cl-item small{color:var(--muted);display:block}
.cl-acts{display:flex;gap:6px;flex-wrap:wrap}
.cl-acts button,.cl-acts a{border:1.5px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:7px 11px;font-weight:700;font-size:14px;text-decoration:none}
.cl-acts .danger{color:#b3261e;border-color:#e2b4ae}
.cl-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;background:#9aa5a0}
.cl-dot.live{background:#1fa463}.cl-dot.mid{background:#e39a1c}
.cl-code{font-family:ui-monospace,monospace;font-weight:800;letter-spacing:1px;background:var(--marble);border-radius:8px;padding:2px 8px}
#admMap{height:min(55vh,460px);border-radius:16px;border:1px solid var(--line);margin:10px 0}
.adm-pin{width:40px;height:40px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);overflow:hidden;background:#0B6B50;color:#fff;display:grid;place-items:center;font-weight:800}
.adm-pin img{width:100%;height:100%;object-fit:cover}
.adm-pin.old{filter:grayscale(1) opacity(.75)}
.adm-name{background:rgba(0,0,0,.72);color:#fff;border-radius:6px;padding:1px 6px;font-size:12px;white-space:nowrap;position:absolute;top:42px;left:50%;transform:translateX(-50%)}
.adm-hotel{width:34px;height:34px;border-radius:9px;background:#C9A24A;color:#000;display:grid;place-items:center;font-weight:800;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)}
.cl-pre{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12.5px;background:var(--marble);border:1px solid var(--line);border-radius:12px;padding:10px;max-height:260px;overflow:auto;direction:ltr;text-align:left}
.cl-tabs{display:flex;gap:6px;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none}
.cl-tabs button{flex:0 0 auto;border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:9px 15px;font-weight:700}
.cl-tabs button[aria-pressed="true"]{background:var(--green);color:#fff;border-color:var(--green)}
.cl-lock{max-width:420px;margin:30px auto;text-align:center}
.cl-err{color:#b3261e;font-weight:700;min-height:24px;margin:8px 0}
.cl-ok{color:var(--green);font-weight:700}
`;

/* ---------------- shared UI bits ---------------- */
const fld = (label, id, val, opt = {}) => `<label class="cl-f"><span>${label}</span>${opt.area
  ? `<textarea class="cl-in" id="${id}" ${opt.ph ? `placeholder="${E(opt.ph)}"` : ""}>${E(val)}</textarea>`
  : opt.sel ? `<select class="cl-in" id="${id}">${opt.sel.map(([v, t]) => `<option value="${E(v)}"${String(v) === String(val) ? " selected" : ""}>${E(t)}</option>`).join("")}</select>`
  : `<input class="cl-in" id="${id}" type="${opt.type || "text"}" value="${E(val)}" ${opt.ph ? `placeholder="${E(opt.ph)}"` : ""} ${opt.attr || ""}>`}${opt.help ? `<small>${opt.help}</small>` : ""}</label>`;
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
const avatar = (m, cls = "cl-ph") => `<span class="${cls}">${m && m.photo ? `<img src="${E(m.photo)}" alt="">` : E(((m && m.name) || "?").trim().slice(0, 1))}</span>`;
function photoToData(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const S = 240, k = Math.min(1, S / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", .72));
    };
    img.onerror = rej; img.src = url;
  });
}
function errText(e) {
  if (!navigator.onLine) return "ইন্টারনেট নেই। সংযোগ চালু করে আবার চেষ্টা করুন।";
  if (e && e.status === 401) return "অনুমতি নেই। সেটআপের নিরাপত্তা নিয়ম ঠিকমতো বসানো হয়েছে কিনা দেখুন।";
  return "কাজটি হয়নি। একটু পরে আবার চেষ্টা করুন।";
}

/* ======================================================================
   MEMBER SIDE: notices + "my kafela"
   ====================================================================== */
let my = ls.get("hgMy", null);           // { kid, code, m, info, share }
let lead = ls.get("hgLead", null);
let seen = ls.get("hgSeenNotices", {});
function hotelPlace() {
  if (!my || !my.info || typeof my.info.lat !== "number") return null;
  return { id: "my-hotel", kind: "service", label: "হো", name: my.info.hotel || "আমার হোটেল", lat: my.info.lat, lng: my.info.lng,
    about: `আপনার কাফেলার (${my.info.name || ""}) হোটেল।${my.m && my.m.room ? " আপনার রুম: " + my.m.room + "।" : ""}`, why: "পথ হারিয়ে গেলে “নিয়ে চলো” চাপুন, রাস্তা ধরে হোটেলে ফেরার পথ দেখাবে।", tips: my.info.phone ? ["অ্যাডমিনের নম্বর: " + my.info.phone] : [] };
}
function leadPlace() {
  if (!lead || typeof lead.lat !== "number") return null;
  return { id: "my-lead", kind: "gate", label: "অ", name: "অ্যাডমিন / মুআল্লিম", lat: lead.lat, lng: lead.lng, about: "অ্যাডমিন সর্বশেষ এখানে ছিলেন: " + ago(lead.t) + "।", why: "", tips: [] };
}
function renderNotices() {
  const box = q("#noticeBox"); if (!box) return;
  const N = Object.entries((content && content.notices) || {}).map(([id, n]) => Object.assign({ id }, n)).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 5);
  box.innerHTML = N.map(n => `<div class="cl-notice"><b>${E(n.title)}</b>${n.body ? `<div>${E(n.body)}</div>` : ""}<small>${ago(n.t)}</small></div>`).join("");
}
function renderMy() {
  const box = q("#kafelaBox"); if (!box) return;
  if (!READY) { box.innerHTML = ""; return; }
  if (!my) {
    box.innerHTML = `<div class="cl-card"><h3>আমার কাফেলা</h3>
      <p class="lead" style="margin:0 0 6px">কাফেলার অ্যাডমিন আপনাকে যে কোড দিয়েছেন, সেটা এখানে লিখুন। তাহলে হোটেলে ফেরার পথ আর অ্যাডমিনের নম্বর এখানে থাকবে।</p>
      <div class="cl-row"><input class="cl-in" id="myCode" placeholder="যেমন: K7Q2M-X9P4T" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:200px;text-transform:uppercase">
      <button class="btn" id="myJoin">যুক্ত হোন</button></div><div class="cl-err" id="myErr"></div></div>`;
    q("#myJoin").onclick = join;
    return;
  }
  const m = my.m || {}, info = my.info || {};
  box.innerHTML = `<div class="cl-card"><h3>আমার কাফেলা: ${E(info.name || "")}</h3>
    <div class="cl-me">${avatar(m)}<div><b style="font-size:18px">${E(m.name || "")}</b><div class="lead">${E(m.hotel || info.hotel || "")}${m.room ? " · রুম " + E(m.room) : ""}</div></div></div>
    <div class="btn-row" style="margin-top:10px">
      ${typeof (info.lat) === "number" ? '<button class="btn gold" id="myHotel">হোটেলে ফেরার পথ</button>' : ""}
      ${info.phone ? `<a class="btn" href="tel:${E(info.phone)}">অ্যাডমিনকে ফোন</a>` : ""}
      ${lead ? '<button class="btn ghost" id="myLead">অ্যাডমিন কোথায়</button>' : ""}
    </div>
    <p class="src" id="myShareTxt" style="margin-top:8px"></p>
    <div class="cl-row"><label class="cl-row" style="gap:8px"><input type="checkbox" id="myShare" ${my.share !== false ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--green)"> আমার লোকেশন অ্যাডমিনকে দেখাও</label>
    <button class="btn ghost small" id="myLeave">কাফেলা ছাড়ুন</button></div></div>`;
  const h = q("#myHotel"); if (h) h.onclick = () => { if (window.addPlace) addPlace(hotelPlace()); startNav("my-hotel"); };
  const l = q("#myLead"); if (l) l.onclick = () => { if (window.addPlace) addPlace(leadPlace()); show("map"); setTimeout(() => { initMap(); openSheet("my-lead"); }, 120); };
  q("#myShare").onchange = e => { my.share = e.target.checked; ls.set("hgMy", my); shareLoop(); renderShareTxt(); };
  q("#myLeave").onclick = () => { if (!confirm("এই ফোন থেকে কাফেলার তথ্য মুছে যাবে। নিশ্চিত?")) return; my = null; ls.del("hgMy"); stopShare(); renderMy(); };
  renderShareTxt();
}
function renderShareTxt() {
  const el = q("#myShareTxt"); if (!el || !my) return;
  el.textContent = my.share === false ? "লোকেশন পাঠানো বন্ধ।" : shareState.last ? "অ্যাপ খোলা থাকলে আপনার লোকেশন শুধু অ্যাডমিন দেখতে পান। শেষবার পাঠানো হয়েছে " + ago(shareState.last) + "।" : "অ্যাপ খোলা থাকলে আপনার লোকেশন শুধু অ্যাডমিন দেখতে পান।";
}
async function ensureMember() { if (!mem.on) mem.set(await authCall("accounts:signUp", { returnSecureToken: true })); }
async function join() {
  const err = q("#myErr"), btn = q("#myJoin");
  const code = val("myCode").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 10) { err.textContent = "কোডটি সঠিক নয়। আবার দেখে লিখুন।"; return; }
  btn.disabled = true; err.textContent = "";
  try {
    await ensureMember();
    const kid = await db("GET", "codes/" + code, undefined, mem);
    if (!kid) { err.textContent = "কোডটি সঠিক নয়। আবার দেখে লিখুন।"; return; }
    const m = await db("GET", `k/${kid}/m/${code}`, undefined, mem);
    if (!m) { err.textContent = "কোডটি সঠিক নয়। আবার দেখে লিখুন।"; return; }
    if (m.uid && m.uid !== mem.uid) { err.textContent = "এই কোড আগে অন্য একটি ফোনে ব্যবহার হয়েছে। অ্যাডমিনকে বলুন ‘ফোন রিসেট’ করে দিতে।"; return; }
    if (!m.uid) await db("PUT", `k/${kid}/m/${code}/uid`, mem.uid, mem);
    const info = await db("GET", `k/${kid}/info`, undefined, mem);
    delete m.uid;
    my = { kid, code, m, info: info || {}, share: true }; ls.set("hgMy", my);
    if (window.addPlace && hotelPlace()) addPlace(hotelPlace());
    renderMy(); shareLoop(); refreshMy();
    toastMsg("কাফেলায় যুক্ত হয়েছেন");
  } catch (e) { err.textContent = errText(e); }
  finally { if (btn) btn.disabled = false; }
}
async function refreshMy() {
  if (!READY || !my || !navigator.onLine) return;
  try {
    await ensureMember();
    const m = await db("GET", `k/${my.kid}/m/${my.code}`, undefined, mem);
    if (!m) { my = null; ls.del("hgMy"); stopShare(); renderMy(); toastMsg("আপনার কাফেলার প্রোফাইল মুছে ফেলা হয়েছে"); return; }
    if (m.uid && m.uid !== mem.uid) { my = null; ls.del("hgMy"); stopShare(); renderMy(); return; }
    const info = await db("GET", `k/${my.kid}/info`, undefined, mem);
    delete m.uid; my.m = m; my.info = info || my.info; ls.set("hgMy", my);
    const l = await db("GET", "lead", undefined, mem).catch(() => null);
    if (l) { lead = l; ls.set("hgLead", lead); }
    if (window.addPlace) { const h = hotelPlace(); if (h) addPlace(h); const lp = leadPlace(); if (lp) addPlace(lp); }
    renderMy();
  } catch (e) {}
}
// location sharing while the app is open
const shareState = { watch: null, lastSent: null, last: ls.get("hgLastSent", 0) };
function stopShare() { if (shareState.watch != null) { navigator.geolocation.clearWatch(shareState.watch); shareState.watch = null; } }
function shareLoop() {
  stopShare();
  if (!READY || !my || my.share === false || !("geolocation" in navigator)) return;
  shareState.watch = navigator.geolocation.watchPosition(async pos => {
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
    const p = shareState.lastSent, now = Date.now();
    const moved = p ? Math.hypot((lat - p.lat) * 110540, (lng - p.lng) * 103000) : 1e9;
    if (p && now - p.t < 25000 && moved < 25) return;
    if (p && now - p.t < 8000) return;
    shareState.lastSent = { lat, lng, t: now };
    try {
      await ensureMember();
      await db("PUT", `loc/${my.kid}/${my.code}`, { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(acc || 0), t: NOW }, mem);
      shareState.last = Date.now(); ls.set("hgLastSent", shareState.last); renderShareTxt();
    } catch (e) {}
  }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

/* fresh content from the server */
async function pullContent(first) {
  if (!READY || !navigator.onLine) return;
  try {
    const c = (await db("GET", "content")) || {};
    const strip = x => JSON.stringify(Object.assign({}, x || {}, { notices: null }));
    const changed = strip(c) !== strip(content);
    const quiet = !ls.get("hgSeenInit", false);     // first run on this phone: show old notices, no alert
    content = c; ls.set("hgContent", content);
    renderNotices();
    for (const [id, n] of Object.entries(c.notices || {})) {
      if (seen[id]) continue;
      seen[id] = 1;
      if (!quiet && Date.now() - (n.t || 0) < 3 * 864e5) notify(n.title || "নতুন নোটিশ", n.body || "");
    }
    ls.set("hgSeenNotices", seen); ls.set("hgSeenInit", true);
    if (changed) {
      if (first && !q("#v-admin.active")) setTimeout(() => location.reload(), 200);
      else if (!q("#v-admin.active")) toastMsg("নতুন তথ্য এসেছে। অ্যাপ আবার খুললে দেখা যাবে।");
    }
  } catch (e) {}
}

/* ======================================================================
   ADMIN PANEL
   ====================================================================== */
const LOCK_KEY = "hgAdmLock", FAIL_KEY = "hgAdmFail";
const locked = () => ls.get(LOCK_KEY, 0) === 1;
let admTab = "kafela", admMap = null, admLayer = null, pickCb = null, kafelas = {}, curKid = ls.get("hgAdmKid", null), members = {}, locs = {}, admPoll = null, leadWatch = null;
function adminEntry() {
  if (locked()) return;                       // after three wrong codes this device never shows the page again
  if (!READY) { show("admin"); renderAdminSetupOnly(); return; }
  show("admin");
  if (adm.on) renderAdmin(); else renderLogin();
}
function renderLogin() {
  q("#admBody").innerHTML = `<div class="cl-lock cl-card"><h3>অ্যাডমিন</h3>
    <p class="lead" style="margin:0 auto 8px">শুধু অ্যাডমিনের জন্য। গোপন কোডটি লিখুন।</p>
    <input class="cl-in" id="admCode" type="password" autocomplete="off" style="text-align:center">
    <div class="cl-err" id="admErr"></div>
    <button class="btn" id="admGo" style="width:100%;justify-content:center">ঢুকুন</button></div>`;
  q("#admHeadBtns").innerHTML = "";
  q("#admGo").onclick = login;
  q("#admCode").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
}
async function login() {
  const code = q("#admCode").value, err = q("#admErr"), btn = q("#admGo");
  if (!code) return;
  btn.disabled = true; err.textContent = "";
  try {
    const j = await authCall("accounts:signInWithPassword", { email: ADMIN_EMAIL, password: code, returnSecureToken: true });
    adm.set(j); ls.del(FAIL_KEY); renderAdmin();
  } catch (e) {
    if (!navigator.onLine || e.message === "Failed to fetch") { err.textContent = "ইন্টারনেট নেই। সংযোগ চালু করে আবার চেষ্টা করুন।"; return; }
    if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND|API_KEY|PROJECT_NOT_FOUND/.test(e.code)) { err.textContent = "সার্ভার এখনো ঠিকমতো সেটআপ হয়নি।"; return; }
    const n = ls.get(FAIL_KEY, 0) + 1; ls.set(FAIL_KEY, n);
    if (n >= 3) { ls.set(LOCK_KEY, 1); q("#admBody").innerHTML = '<div class="cl-lock cl-card"><h3>এটি আপনার ব্যবহারের না</h3></div>'; setTimeout(() => show("home"), 2500); return; }
    err.textContent = "এটি আপনার ব্যবহারের না";
  } finally { if (btn) btn.disabled = false; }
}
function logout() { adm.clear(); stopAdminLive(); renderLogin(); }

function renderAdmin() {
  q("#admHeadBtns").innerHTML = '<button class="btn ghost small" id="admOut">লগ আউট</button>';
  q("#admOut").onclick = logout;
  const tabs = [["kafela", "কাফেলা ও প্রোফাইল"], ["notice", "নোটিশ"], ["hateem", "হাতিমের সময়"], ["places", "ম্যাপের জায়গা"], ["items", "দোয়া, সুন্নত ও অন্যান্য"], ["setup", "সেটআপ"]];
  q("#admBody").innerHTML = `<div class="cl-tabs" id="admTabs">${tabs.map(([k, t]) => `<button data-at="${k}" aria-pressed="${k === admTab}">${t}</button>`).join("")}</div>
    <div id="admMapWrap" hidden><div id="admMap"></div><p class="src" id="admMapNote"></p></div><div id="admPane"></div>`;
  q("#admTabs").onclick = e => { const b = e.target.closest("[data-at]"); if (!b) return; admTab = b.dataset.at; qq("#admTabs button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderTab(); };
  admMap = null; renderTab();
}
function needMap(on) {
  q("#admMapWrap").hidden = !on;
  if (!on) { pickCb = null; return; }
  if (!admMap && window.L) {
    admMap = L.map("admMap", { zoomControl: true }).setView([21.4226, 39.8262], 15);
    (typeof cachedTiles === "function" ? cachedTiles : L.tileLayer)("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, maxNativeZoom: 19, attribution: "ছবি © Esri" }).addTo(admMap);
    admLayer = L.layerGroup().addTo(admMap);
    admMap.on("click", e => { if (pickCb) { const cb = pickCb; pickCb = null; q("#admMapNote").textContent = ""; cb(e.latlng.lat, e.latlng.lng); } });
  }
  setTimeout(() => admMap && admMap.invalidateSize(), 60);
}
function pickOnMap(cb) { pickCb = cb; q("#admMapNote").textContent = "এখন ম্যাপে জায়গাটির ওপর চাপুন।"; q("#admMapWrap").scrollIntoView({ behavior: "smooth", block: "center" }); }
let lastFix = null;
function hereNow(cb) {
  if (lastFix && Date.now() - lastFix.t < 60000) return cb(lastFix.lat, lastFix.lng);
  if (!("geolocation" in navigator)) return toastMsg("লোকেশন পাওয়া যাচ্ছে না");
  toastMsg("লোকেশন খোঁজা হচ্ছে…");
  navigator.geolocation.getCurrentPosition(p => { lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() }; cb(lastFix.lat, lastFix.lng); }, () => toastMsg("লোকেশন পাওয়া যায়নি। লোকেশন চালু আছে কিনা দেখুন।"), { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
}
function renderTab() {
  stopAdminLive();
  const P = q("#admPane");
  needMap(admTab === "kafela" || admTab === "places");
  ({ kafela: tabKafela, notice: tabNotice, hateem: tabHateem, places: tabPlaces, items: tabItems, setup: tabSetup })[admTab](P);
}
async function admGet(path) { try { return await db("GET", path, undefined, adm); } catch (e) { if (e.status === 401) { toastMsg(errText(e)); } throw e; } }
async function admPut(path, data) { return db("PUT", path, data, adm); }
async function admDel(path) { return db("DELETE", path, undefined, adm); }
async function admPost(path, data) { return db("POST", path, data, adm); }
const saveBtn = (id, label = "সংরক্ষণ করুন") => `<button class="btn" id="${id}">${label}</button>`;
async function guard(btn, fn, okMsg) {
  if (btn) btn.disabled = true;
  try { await fn(); if (okMsg) toastMsg(okMsg); }
  catch (e) { if (e && e.message === "x") return; console.warn("admin", e); toastMsg(errText(e)); if (!adm.on) renderLogin(); }
  finally { if (btn) btn.disabled = false; }
}

/* ----- kafela ----- */
async function tabKafela(P) {
  P.innerHTML = '<p class="loading">কাফেলার তালিকা আনা হচ্ছে…</p>';
  try { kafelas = (await admGet("kidx")) || {}; } catch (e) { kafelas = {}; if (!adm.on) return renderLogin(); }
  if (!Object.keys(kafelas).length) {
    // the index is rebuilt from the kafela list if it is missing
    try { const sh = await fetchShallowK(); for (const kid of sh) { const inf = await admGet(`k/${kid}/info`); if (inf) kafelas[kid] = { name: inf.name || kid }; } } catch (e) {}
  }
  const ids = Object.keys(kafelas);
  if (curKid && !kafelas[curKid]) curKid = null;
  if (!curKid && ids.length) curKid = ids[0];
  P.innerHTML = `<div class="cl-card"><div class="cl-row" style="justify-content:space-between"><h3 style="margin:0">কাফেলা</h3><button class="btn small gold" id="kNew">নতুন কাফেলা</button></div>
    ${ids.length ? `<div class="cl-tabs" id="kList" style="margin-top:8px">${ids.map(id => `<button data-k="${id}" aria-pressed="${id === curKid}">${E(kafelas[id].name)}</button>`).join("")}</div>` : '<p class="lead">এখনো কোনো কাফেলা নেই। “নতুন কাফেলা” চাপুন।</p>'}</div>
    <div id="kPane"></div>`;
  q("#kNew").onclick = () => kafelaForm(null);
  const kl = q("#kList"); if (kl) kl.onclick = e => { const b = e.target.closest("[data-k]"); if (!b) return; curKid = b.dataset.k; ls.set("hgAdmKid", curKid); qq("#kList button").forEach(x => x.setAttribute("aria-pressed", x === b)); openKafela(); };
  if (curKid) openKafela(); else drawAdmMap();
  startLead();
}
async function fetchShallowK() {
  const t = await adm.token();
  const r = await fetch(`${CFG.databaseURL.replace(/\/+$/, "")}/k.json?shallow=true&auth=${encodeURIComponent(t)}`, { cache: "no-store" });
  if (!r.ok) return [];
  return Object.keys((await r.json()) || {});
}
function kafelaForm(kid) {
  const info = kid ? (kafelas[kid] && kafelas[kid].info) || {} : {};
  const box = q("#kPane");
  box.innerHTML = `<div class="cl-card"><h3>${kid ? "কাফেলার তথ্য বদলান" : "নতুন কাফেলা"}</h3><div class="cl-grid">
    ${fld("কাফেলার নাম", "kfName", info.name || "", { ph: "যেমন: ঢাকা কাফেলা ১" })}
    ${fld("অ্যাডমিন / মুআল্লিমের মোবাইল নম্বর", "kfPhone", info.phone || "", { type: "tel", ph: "+9665…" })}
    ${fld("হোটেলের নাম", "kfHotel", info.hotel || "", { ph: "যেমন: হিলটন সুইটস" })}
    ${fld("হোটেলের লোকেশন", "kfLL", typeof info.lat === "number" ? info.lat.toFixed(6) + ", " + info.lng.toFixed(6) : "", { ph: "২১.৪২১০, ৩৯.৮২৫০", help: "নিচের বোতাম দিয়ে বসান, বা Google Maps থেকে কপি করে এখানে দিন।" })}
    </div><div class="btn-row"><button class="btn ghost small" id="kfHere">আমার এখনকার লোকেশন</button><button class="btn ghost small" id="kfPick">ম্যাপে চাপ দিয়ে বসান</button></div>
    <div class="btn-row">${saveBtn("kfSave")}${kid ? '<button class="btn ghost" id="kfCancel">বাতিল</button>' : ""}</div></div>`;
  const setLL = (a, b) => { q("#kfLL").value = a.toFixed(6) + ", " + b.toFixed(6); };
  q("#kfHere").onclick = () => hereNow(setLL);
  q("#kfPick").onclick = () => pickOnMap(setLL);
  const c = q("#kfCancel"); if (c) c.onclick = openKafela;
  q("#kfSave").onclick = e => guard(e.target, async () => {
    const name = val("kfName"); if (!name) { toastMsg("কাফেলার নাম দিন"); throw new Error("x"); }
    const ll = val("kfLL").replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d)).match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    const data = { name, phone: val("kfPhone"), hotel: val("kfHotel") };
    if (ll) { data.lat = +ll[1]; data.lng = +ll[2]; }
    const id = kid || rid(12);
    await admPut(`k/${id}/info`, data);
    await admPut(`kidx/${id}`, { name });
    curKid = id; ls.set("hgAdmKid", id);
    tabKafela(q("#admPane"));
  }, "সংরক্ষণ হয়েছে");
}
async function openKafela() {
  const kid = curKid, box = q("#kPane"); if (!kid || !box) return;
  box.innerHTML = '<p class="loading">সদস্যদের তালিকা আনা হচ্ছে…</p>';
  let info = {}, mm = {};
  try { info = (await admGet(`k/${kid}/info`)) || {}; mm = (await admGet(`k/${kid}/m`)) || {}; locs = (await admGet(`loc/${kid}`)) || {}; } catch (e) { box.innerHTML = `<p class="cl-err">${errText(e)}</p>`; return; }
  kafelas[kid] = Object.assign(kafelas[kid] || {}, { name: info.name || kid, info });
  members = mm;
  const list = Object.entries(mm).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  box.innerHTML = `<div class="cl-card"><div class="cl-row" style="justify-content:space-between"><div><h3 style="margin:0">${E(info.name)}</h3>
      <div class="lead">${E(info.hotel || "হোটেল দেওয়া নেই")}${info.phone ? " · " + E(info.phone) : ""} · ${B(list.length)} জন সদস্য</div></div>
      <div class="cl-acts"><button id="kEdit">তথ্য বদলান</button><button class="danger" id="kDel">কাফেলা মুছুন</button></div></div>
      <label class="cl-row" style="gap:8px;margin-top:10px"><input type="checkbox" id="leadOn" ${ls.get("hgLeadOn", true) ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--green)"> আমার লোকেশন সদস্যদের দেখাও (তারা “অ্যাডমিন কোথায়” চাপলে দেখবে)</label></div>
    <div class="cl-card"><div class="cl-row" style="justify-content:space-between"><h3 style="margin:0">সদস্য</h3><button class="btn small gold" id="mNew">নতুন সদস্য</button></div>
      <div id="mForm"></div>
      <ul class="cl-list" id="mList">${list.map(([code, m]) => memberRow(code, m)).join("") || '<li class="lead">এখনো কোনো সদস্য নেই।</li>'}</ul></div>`;
  q("#kEdit").onclick = () => kafelaForm(kid);
  q("#kDel").onclick = e => { if (!confirm(`“${info.name}” কাফেলা আর এর সব সদস্য মুছে যাবে। নিশ্চিত?`)) return; guard(e.target, async () => {
    for (const code of Object.keys(mm)) await admDel("codes/" + code);
    await admDel("loc/" + kid); await admDel("k/" + kid); await admDel("kidx/" + kid);
    curKid = null; ls.del("hgAdmKid"); tabKafela(q("#admPane"));
  }, "কাফেলা মুছে ফেলা হয়েছে"); };
  q("#leadOn").onchange = e => { ls.set("hgLeadOn", e.target.checked); startLead(); };
  q("#mNew").onclick = () => memberForm(null);
  q("#mList").onclick = memberAction;
  drawAdmMap();
  admPoll = setInterval(async () => { try { locs = (await admGet(`loc/${kid}`)) || {}; drawAdmMap(true); qq("[data-seen]").forEach(el => { const l = locs[el.dataset.seen]; el.innerHTML = seenHtml(l); }); } catch (e) {} }, 12000);
}
const seenHtml = l => { const t = l && l.t, m = t ? (Date.now() - t) / 60000 : 1e9; return `<span class="cl-dot ${m < 5 ? "live" : m < 30 ? "mid" : ""}"></span>${t ? "শেষ লোকেশন " + ago(t) : "লোকেশন আসেনি"}`; };
function memberRow(code, m) {
  return `<li class="cl-item">${avatar(m)}<div class="grow"><b>${E(m.name)}</b>
    <small>${m.room ? "রুম " + E(m.room) + " · " : ""}${E(m.phone || "")}</small>
    <small>কোড: <span class="cl-code">${fmtCode(code)}</span> ${m.uid ? "· ফোনে যুক্ত" : "· এখনো যুক্ত হননি"}</small>
    <small data-seen="${code}">${seenHtml(locs[code])}</small>
    <div class="cl-acts" style="margin-top:6px">
      <button data-ma="map" data-c="${code}">ম্যাপে দেখুন</button>
      <button data-ma="go" data-c="${code}">কাছে যান</button>
      ${m.phone ? `<a href="tel:${E(m.phone)}">ফোন</a>` : ""}
      <button data-ma="share" data-c="${code}">কোড পাঠান</button>
      <button data-ma="edit" data-c="${code}">এডিট</button>
      ${m.uid ? `<button data-ma="reset" data-c="${code}">ফোন রিসেট</button>` : ""}
      <button class="danger" data-ma="del" data-c="${code}">মুছুন</button>
    </div></div></li>`;
}
async function memberAction(e) {
  const b = e.target.closest("[data-ma]"); if (!b) return;
  const code = b.dataset.c, m = members[code] || {}, kid = curKid, a = b.dataset.ma;
  if (a === "map") { const l = locs[code]; if (!l) return toastMsg("এই সদস্যের লোকেশন এখনো আসেনি"); q("#admMapWrap").scrollIntoView({ behavior: "smooth", block: "center" }); admMap.setView([l.lat, l.lng], 18); }
  else if (a === "go") { const l = locs[code]; if (!l) return toastMsg("এই সদস্যের লোকেশন এখনো আসেনি"); addPlace({ id: "mem-" + code, kind: "gate", label: (m.name || "?").slice(0, 1), name: m.name, lat: l.lat, lng: l.lng, about: "সর্বশেষ লোকেশন: " + ago(l.t) + "।", why: m.phone ? "ফোন: " + m.phone : "", tips: [] }); startNav("mem-" + code); }
  else if (a === "share") {
    const txt = `হারাম গাইড অ্যাপে “হাতিম” পাতায় “আমার কাফেলা” ঘরে এই কোড লিখুন: ${fmtCode(code)}`;
    if (navigator.share) navigator.share({ text: txt }).catch(() => {}); else { try { await navigator.clipboard.writeText(txt); toastMsg("কপি হয়েছে"); } catch (x) { prompt("কপি করুন", txt); } }
  }
  else if (a === "edit") memberForm(code);
  else if (a === "reset") { if (!confirm(`${m.name}-এর কোড আবার নতুন ফোনে ব্যবহার করা যাবে। আগের ফোন থেকে আর লোকেশন আসবে না।`)) return; guard(b, async () => { await admDel(`k/${kid}/m/${code}/uid`); openKafela(); }, "রিসেট হয়েছে"); }
  else if (a === "del") { if (!confirm(`${m.name}-এর প্রোফাইল মুছে যাবে। নিশ্চিত?`)) return; guard(b, async () => { await admDel("codes/" + code); await admDel(`loc/${kid}/${code}`); await admDel(`k/${kid}/m/${code}`); openKafela(); }, "মুছে ফেলা হয়েছে"); }
}
function memberForm(code) {
  const m = code ? members[code] || {} : {}, info = (kafelas[curKid] && kafelas[curKid].info) || {};
  let photo = m.photo || "";
  const box = q("#mForm");
  box.innerHTML = `<div class="cl-card" style="background:var(--marble)"><h3>${code ? "সদস্যের তথ্য বদলান" : "নতুন সদস্য"}</h3>
    <div class="cl-me" style="margin-bottom:6px"><span id="mfPh">${avatar(m)}</span><label class="btn ghost small" style="cursor:pointer">ছবি দিন<input type="file" accept="image/*" id="mfFile" hidden></label>${photo ? '<button class="btn ghost small" id="mfNoPh">ছবি সরান</button>' : ""}</div>
    <div class="cl-grid">${fld("নাম", "mfName", m.name || "")}${fld("মোবাইল নম্বর", "mfPhone", m.phone || "", { type: "tel" })}
    ${fld("হোটেল", "mfHotel", m.hotel || info.hotel || "")}${fld("রুম নম্বর", "mfRoom", m.room || "")}</div>
    <div class="btn-row">${saveBtn("mfSave")}<button class="btn ghost" id="mfCancel">বাতিল</button></div></div>`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  q("#mfFile").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo = await photoToData(f); q("#mfPh").innerHTML = avatar({ photo }); } catch (x) { toastMsg("ছবিটি খোলা যায়নি"); } };
  const np = q("#mfNoPh"); if (np) np.onclick = () => { photo = ""; q("#mfPh").innerHTML = avatar({ name: val("mfName") }); };
  q("#mfCancel").onclick = () => { box.innerHTML = ""; };
  q("#mfSave").onclick = e => guard(e.target, async () => {
    const name = val("mfName"); if (!name) { toastMsg("নাম দিন"); throw new Error("x"); }
    const c = code || rid(10);
    const data = { name, phone: val("mfPhone"), hotel: val("mfHotel"), room: val("mfRoom"), photo };
    if (code && m.uid) data.uid = m.uid;
    await admPut(`k/${curKid}/m/${c}`, data);
    if (!code) await admPut("codes/" + c, curKid);
    box.innerHTML = ""; await openKafela();
    if (!code) toastMsg("সদস্য যোগ হয়েছে। কোড: " + fmtCode(c));
  }, code ? "সংরক্ষণ হয়েছে" : "");
}
function drawAdmMap(keepView) {
  if (!admMap) return;
  admLayer.clearLayers();
  const pts = [];
  const info = curKid && kafelas[curKid] && kafelas[curKid].info;
  if (info && typeof info.lat === "number") {
    L.marker([info.lat, info.lng], { icon: L.divIcon({ className: "", iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="adm-hotel">হো</div>' }), title: info.hotel || "হোটেল" }).bindTooltip(info.hotel || "হোটেল").addTo(admLayer);
    pts.push([info.lat, info.lng]);
  }
  for (const [code, l] of Object.entries(locs || {})) {
    const m = members[code]; if (!m || typeof l.lat !== "number") continue;
    const old = !l.t || Date.now() - l.t > 30 * 60000;
    const html = `<div style="position:relative"><div class="adm-pin${old ? " old" : ""}">${m.photo ? `<img src="${E(m.photo)}" alt="">` : E((m.name || "?").slice(0, 1))}</div><div class="adm-name">${E(m.name)}</div></div>`;
    L.marker([l.lat, l.lng], { icon: L.divIcon({ className: "", iconSize: [40, 40], iconAnchor: [20, 20], html }), title: m.name })
      .bindPopup(`<b>${E(m.name)}</b><br>${m.room ? "রুম " + E(m.room) + "<br>" : ""}${ago(l.t)}${m.phone ? `<br><a href="tel:${E(m.phone)}">${E(m.phone)}</a>` : ""}`).addTo(admLayer);
    pts.push([l.lat, l.lng]);
  }
  if (!keepView) { if (pts.length > 1) admMap.fitBounds(pts, { padding: [40, 40], maxZoom: 18 }); else if (pts.length) admMap.setView(pts[0], 17); }
  q("#admMapNote").textContent = Object.keys(locs || {}).length ? "ছবিওয়ালা গোল চিহ্ন সদস্য, ‘হো’ হোটেল। ধূসর চিহ্ন মানে ৩০ মিনিটের বেশি আগের লোকেশন। প্রতি ১২ সেকেন্ডে হালনাগাদ হয়।" : "সদস্যরা অ্যাপে কোড দিয়ে যুক্ত হলে, অ্যাপ খোলা থাকা অবস্থায় তাদের লোকেশন এখানে দেখা যাবে।";
}
function startLead() {
  if (leadWatch != null) { navigator.geolocation.clearWatch(leadWatch); leadWatch = null; }
  if (!ls.get("hgLeadOn", true) || !("geolocation" in navigator) || !adm.on) return;
  let last = 0;
  leadWatch = navigator.geolocation.watchPosition(p => {
    lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
    if (Date.now() - last < 30000) return; last = Date.now();
    admPut("lead", { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), t: NOW }).catch(() => {});
  }, () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 });
}
function stopAdminLive() { if (admPoll) { clearInterval(admPoll); admPoll = null; } }

/* ----- notices ----- */
async function tabNotice(P) {
  P.innerHTML = `<div class="cl-card"><h3>সবার জন্য নোটিশ</h3>
    <p class="lead" style="margin:0">এখানে লিখলে অ্যাপ খোলা সবাই “হাতিম” পাতার ওপরে দেখবে, আর ফোনে নোটিফিকেশন যাবে (যখন অ্যাপ খোলা হবে)।</p>
    ${fld("শিরোনাম", "ntTitle", "", { ph: "যেমন: আজ ফজরের পর জমায়েত" })}${fld("বিস্তারিত", "ntBody", "", { area: true, ph: "যেমন: ফজরের পর সবাই গেট ৭৯-এর সামনে দাঁড়াবেন।" })}
    <div class="btn-row">${saveBtn("ntSend", "নোটিশ পাঠান")}</div></div><div class="cl-card"><h3>পাঠানো নোটিশ</h3><ul class="cl-list" id="ntList"><li class="loading">আনা হচ্ছে…</li></ul></div>`;
  const load = async () => {
    const N = Object.entries((await admGet("content/notices").catch(() => null)) || {}).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    q("#ntList").innerHTML = N.map(([id, n]) => `<li class="cl-item"><div class="grow"><b>${E(n.title)}</b><small>${E(n.body || "")}</small><small>${ago(n.t)}</small></div><div class="cl-acts"><button class="danger" data-nd="${id}">মুছুন</button></div></li>`).join("") || '<li class="lead">কোনো নোটিশ নেই।</li>';
  };
  q("#ntSend").onclick = e => guard(e.target, async () => {
    const title = val("ntTitle"); if (!title) { toastMsg("শিরোনাম দিন"); throw new Error("x"); }
    await admPost("content/notices", { title, body: val("ntBody"), t: NOW });
    q("#ntTitle").value = ""; q("#ntBody").value = ""; await load();
  }, "নোটিশ পাঠানো হয়েছে");
  q("#ntList").onclick = e => { const b = e.target.closest("[data-nd]"); if (b && confirm("নোটিশটি মুছবেন?")) guard(b, async () => { await admDel("content/notices/" + b.dataset.nd); await load(); }, "মুছে ফেলা হয়েছে"); };
  load();
}

/* ----- hateem ----- */
async function tabHateem(P) {
  const H = window.HATEEM;
  const gates = [["hateem", "হাতিম (মাতাফ)"]].concat((window.PLACES || []).filter(p => p.kind === "gate").map(p => [p.id, p.name]));
  const part = (k, t) => { const g = H[k]; return `<div class="cl-card"><h3>${t}</h3>
    ${fld("সময় (দেখানোর লেখা)", k + "Time", g.time, { ph: "সকাল ৬টা – ৯টা" })}
    ${fld("খোলা থাকার সময় (২৪ ঘণ্টা হিসাবে)", k + "Open", winsText(g.open), { ph: "06:00-09:00", help: "একাধিক হলে কমা দিন। যেমন: 22:00-01:00" })}
    ${k === "women" ? fld("গেটে অপেক্ষার সময় (না থাকলে ফাঁকা রাখুন)", k + "Wait", winsText(g.wait), { ph: "19:00-06:00" }) : ""}
    ${fld("গেট (ছোট লেখা)", k + "Tag", g.gateTag, { ph: "গেট ৭৪" })}
    ${fld("“নিয়ে চলো” বোতাম কোথায় নেবে", k + "Goto", g.goto, { sel: gates })}
    ${fld("গেটের বর্ণনা", k + "GateText", g.gateText, { area: true })}
    ${fld("ধাপগুলো (প্রতি লাইনে একটি)", k + "Steps", (g.steps || []).join("\n"), { area: true })}
    ${k === "women" ? fld("মাঠের সর্বশেষ তথ্য (সবুজ ঘর)", "hFieldNote", g.fieldNote || "", { area: true }) : ""}</div>`; };
  P.innerHTML = part("women", "মহিলাদের জন্য") + part("men", "পুরুষদের জন্য") + `<div class="cl-card"><h3>অন্যান্য</h3>
    ${fld("সতর্কতা", "hWarn", H.warn, { area: true })}${fld("সর্বশেষ হালনাগাদের তারিখ", "hUpd", H.updated)}
    <div class="btn-row">${saveBtn("hSave")}</div></div>`;
  q("#hSave").onclick = e => guard(e.target, async () => {
    const part2 = k => ({ time: val(k + "Time"), openTxt: val(k + "Open"), gateTag: val(k + "Tag"), goto: val(k + "Goto"), gateText: val(k + "GateText"), steps: lines(val(k + "Steps")) });
    const w = part2("women"); w.waitTxt = val("womenWait"); w.fieldNote = val("hFieldNote");
    if (!parseWins(w.openTxt).length || !parseWins(val("menOpen")).length) { toastMsg("খোলা থাকার সময় ঠিকমতো লিখুন, যেমন 06:00-09:00"); throw new Error("x"); }
    await admPut("content/hateem", { women: w, men: part2("men"), warn: val("hWarn"), updated: val("hUpd") });
  }, "সংরক্ষণ হয়েছে। সবার অ্যাপে চলে যাবে।");
}

/* ----- places ----- */
let plCity = "makkah", plSearch = "";
async function tabPlaces(P) {
  const all = typeof PLACES !== "undefined" ? PLACES : [];
  const list = all.filter(p => p.city === plCity && !/^(my-|mem-)/.test(p.id) && (!plSearch || (p.name + " " + (p.label || "")).includes(plSearch)));
  P.innerHTML = `<div class="cl-card"><div class="cl-row" style="justify-content:space-between"><h3 style="margin:0">ম্যাপের জায়গা</h3><button class="btn small gold" id="plNew">নতুন জায়গা</button></div>
    <div class="cl-row" style="margin-top:8px"><div class="cl-tabs" id="plCity"><button data-c="makkah" aria-pressed="${plCity === "makkah"}">মক্কা</button><button data-c="madinah" aria-pressed="${plCity === "madinah"}">মদিনা</button></div>
    <input class="cl-in" id="plQ" placeholder="নাম দিয়ে খুঁজুন" value="${E(plSearch)}" style="flex:1;min-width:180px"></div>
    <div id="plForm"></div><ul class="cl-list" id="plList">${list.map(p => `<li class="cl-item"><span class="cl-ph" style="width:40px;height:40px;font-size:15px">${E(p.label || "•")}</span><div class="grow"><b>${E(p.name)}</b><small>${E(typeof kindBn === "function" ? kindBn(p) : p.kind)}</small></div><div class="cl-acts"><button data-pe="${E(p.id)}">এডিট</button></div></li>`).join("")}</ul></div>`;
  q("#plCity").onclick = e => { const b = e.target.closest("[data-c]"); if (b) { plCity = b.dataset.c; tabPlaces(P); } };
  q("#plQ").onchange = e => { plSearch = e.target.value.trim(); tabPlaces(P); };
  q("#plNew").onclick = () => placeForm(null);
  q("#plList").onclick = e => { const b = e.target.closest("[data-pe]"); if (b) placeForm(b.dataset.pe); };
  if (admMap) { admLayer.clearLayers(); list.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 6, color: "#fff", weight: 2, fillColor: p.kind === "gate" ? "#0B6B50" : "#C9A24A", fillOpacity: 1 }).bindTooltip(p.name).addTo(admLayer)); if (list.length) admMap.fitBounds(list.map(p => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 17 }); }
}
function placeForm(id) {
  const p = id ? (PLACES.find(x => x.id === id) || {}) : { kind: "history", city: plCity };
  const kinds = [["gate", "গেট"], ["holy", "মসজিদের ভেতরে"], ["history", "ঐতিহাসিক স্থান"], ["outside", "শহরের বাইরে"], ["service", "সেবা / ওযুখানা"]];
  const box = q("#plForm");
  box.innerHTML = `<div class="cl-card" style="background:var(--marble)"><h3>${id ? "জায়গা এডিট" : "নতুন জায়গা"}</h3><div class="cl-grid">
    ${fld("নাম", "pfName", p.name || "")}${fld("ম্যাপের চিহ্নে ছোট লেখা (১–৩ অক্ষর, যেমন গেট নম্বর)", "pfLabel", p.label || "")}
    ${fld("ধরন", "pfKind", p.kind, { sel: kinds })}${fld("লোকেশন", "pfLL", typeof p.lat === "number" ? p.lat.toFixed(6) + ", " + p.lng.toFixed(6) : "", { ph: "২১.৪২২৫, ৩৯.৮২৬২" })}</div>
    <div class="btn-row"><button class="btn ghost small" id="pfHere">আমার এখনকার লোকেশন</button><button class="btn ghost small" id="pfPick">ম্যাপে চাপ দিয়ে বসান</button></div>
    ${fld("এটা কী", "pfAbout", p.about || p.text || "", { area: true })}${fld("কেন যাবেন", "pfWhy", p.why || "", { area: true })}${fld("টিপস (প্রতি লাইনে একটি)", "pfTips", (p.tips || []).join("\n"), { area: true })}
    <label class="cl-row" style="gap:8px;margin:6px 0"><input type="checkbox" id="pfApprox" ${p.approx ? "checked" : ""} style="width:20px;height:20px"> লোকেশন আনুমানিক</label>
    <div class="btn-row">${saveBtn("pfSave")}<button class="btn ghost" id="pfCancel">বাতিল</button>${id ? '<button class="btn ghost" id="pfDel" style="color:#b3261e">ম্যাপ থেকে মুছুন</button>' : ""}</div></div>`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  const setLL = (a, b) => { q("#pfLL").value = a.toFixed(6) + ", " + b.toFixed(6); };
  q("#pfHere").onclick = () => hereNow(setLL); q("#pfPick").onclick = () => pickOnMap(setLL);
  q("#pfCancel").onclick = () => { box.innerHTML = ""; };
  q("#pfSave").onclick = e => guard(e.target, async () => {
    const ll = val("pfLL").replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d)).match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (!val("pfName") || !ll) { toastMsg("নাম আর লোকেশন দিন"); throw new Error("x"); }
    const lat = +ll[1], lng = +ll[2];
    const data = { name: val("pfName"), label: val("pfLabel") || "•", kind: val("pfKind"), lat, lng, city: lat > 23 ? "madinah" : "makkah", about: val("pfAbout"), text: val("pfAbout"), why: val("pfWhy"), tips: lines(val("pfTips")), approx: q("#pfApprox").checked };
    const pid = id || "x" + rid(8).toLowerCase();
    await admPut("content/places/" + pid, data);
    await admDel("content/placesDel/" + pid).catch(() => {});
    if (window.addPlace) addPlace(Object.assign({ id: pid }, data));
    box.innerHTML = ""; tabPlaces(q("#admPane"));
  }, "সংরক্ষণ হয়েছে। সবার অ্যাপে চলে যাবে।");
  const d = q("#pfDel"); if (d) d.onclick = e => { if (!confirm("জায়গাটি সবার ম্যাপ থেকে সরে যাবে। নিশ্চিত?")) return; guard(e.target, async () => {
    await admPut("content/placesDel/" + id, true); await admDel("content/places/" + id).catch(() => {});
    if (window.removePlace) removePlace(id);
    box.innerHTML = ""; tabPlaces(q("#admPane"));
  }, "মুছে ফেলা হয়েছে"); };
}

/* ----- duas, sunnah, seerah, guide sections ----- */
const ITYPES = [["dua", "দোয়া / সূরা / কালাম"], ["sunnah", "সুন্নত"], ["seerah", "সীরাতের অধ্যায়"], ["guide", "উমরাহ / হজ / মদিনা গাইডের ধাপ"]];
async function tabItems(P) {
  P.innerHTML = `<div class="cl-card"><div class="cl-row" style="justify-content:space-between"><h3 style="margin:0">নতুন লেখা যোগ করুন</h3></div>
    <p class="lead" style="margin:4px 0">যা যোগ করবেন, সবার অ্যাপে সঠিক পাতায় চলে যাবে।</p>
    <div class="cl-tabs" id="itNew">${ITYPES.map(([k, t]) => `<button data-it="${k}">${t}</button>`).join("")}</div><div id="itForm"></div></div>
    <div class="cl-card"><h3>যোগ করা লেখা</h3><ul class="cl-list" id="itList"><li class="loading">আনা হচ্ছে…</li></ul></div>`;
  const load = async () => {
    const I = Object.entries((await admGet("content/items").catch(() => null)) || {}).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    q("#itList").innerHTML = I.map(([id, it]) => `<li class="cl-item"><div class="grow"><b>${E(it.title)}</b><small>${E((ITYPES.find(x => x[0] === it.type) || [, ""])[1])}${it.g ? " · " + E(it.g) : ""}</small></div><div class="cl-acts"><button data-ie="${id}">এডিট</button><button class="danger" data-id="${id}">মুছুন</button></div></li>`).join("") || '<li class="lead">এখনো কিছু যোগ করা হয়নি।</li>';
    q("#itList").onclick = e => {
      const ed = e.target.closest("[data-ie]"), de = e.target.closest("[data-id]");
      if (ed) { const it = I.find(x => x[0] === ed.dataset.ie); itemForm(it[1].type, it[0], it[1]); }
      if (de && confirm("লেখাটি সবার অ্যাপ থেকে মুছে যাবে। নিশ্চিত?")) guard(de, async () => { await admDel("content/items/" + de.dataset.id); await load(); }, "মুছে ফেলা হয়েছে");
    };
  };
  q("#itNew").onclick = e => { const b = e.target.closest("[data-it]"); if (b) { qq("#itNew button").forEach(x => x.setAttribute("aria-pressed", x === b)); itemForm(b.dataset.it, null, {}); } };
  P._reload = load; load();
}
function itemForm(type, id, it) {
  const groupsOf = () => type === "dua" ? [...new Set((window.DUAS || []).map(d => d.g))] : type === "sunnah" ? (window.SUNNAH || []).map(s => s[0]) : type === "seerah" ? [...new Set((window.SEERAH || []).map(s => s.era))] : [];
  const dl = `<datalist id="itGroups">${groupsOf().map(g => `<option value="${E(g)}">`).join("")}</datalist>`;
  let f = "";
  if (type === "dua") f = fld("ভাগ (তালিকা থেকে বাছুন বা নতুন নাম লিখুন)", "itG", it.g || "", { attr: 'list="itGroups"' }) + fld("শিরোনাম", "itTitle", it.title || "") + fld("আরবি", "itAr", it.ar || "", { area: true, attr: 'dir="rtl"' }) + fld("বাংলা উচ্চারণ", "itPron", it.pron || "", { area: true }) + fld("অর্থ", "itMean", it.mean || "", { area: true }) + fld("কখন পড়বেন / ফজিলত (ঐচ্ছিক)", "itNote", it.note || "", { area: true }) + fld("তথ্যসূত্র", "itRef", it.ref || "");
  if (type === "sunnah") f = fld("ভাগ", "itG", it.g || "", { attr: 'list="itGroups"' }) + fld("শিরোনাম", "itTitle", it.title || "") + fld("বিস্তারিত", "itText", it.text || "", { area: true }) + fld("তথ্যসূত্র", "itRef", it.ref || "");
  if (type === "seerah") f = fld("যুগ (ভাগ)", "itG", it.g || "", { attr: 'list="itGroups"' }) + fld("বয়স / সময়", "itAge", it.age || "") + fld("শিরোনাম", "itTitle", it.title || "") + fld("আয়াত বা হাদিসের আরবি (ঐচ্ছিক)", "itAr", it.ar || "", { area: true, attr: 'dir="rtl"' }) + fld("আরবির অর্থ", "itArMean", it.arMean || "", { area: true }) + fld("ঘটনা (অনুচ্ছেদের মাঝে একটি ফাঁকা লাইন দিন)", "itText", it.text || "", { area: true }) + fld("শিক্ষা", "itLesson", it.lesson || "") + fld("তথ্যসূত্র", "itRef", it.ref || "");
  if (type === "guide") f = fld("কোন গাইডে", "itGuide", it.guide || "umrah", { sel: [["umrah", "উমরাহ"], ["hajj", "হজ"], ["madinah", "মদিনা"]] }) + fld("শিরোনাম", "itTitle", it.title || "") + fld("কখন (ছোট লেখা)", "itWhen", it.when || "") + fld("বিস্তারিত (অনুচ্ছেদের মাঝে একটি ফাঁকা লাইন দিন)", "itText", it.text || "", { area: true }) + fld("যা করবেন (প্রতি লাইনে একটি)", "itTodo", it.todo || "", { area: true }) + fld("যা করবেন না (প্রতি লাইনে একটি)", "itAvoid", it.avoid || "", { area: true }) + fld("মহিলাদের জন্য (প্রতি লাইনে একটি)", "itWomen", it.women || "", { area: true }) + fld("তথ্যসূত্র", "itRef", it.ref || "");
  const box = q("#itForm");
  box.innerHTML = `<div class="cl-card" style="background:var(--marble)">${dl}${f}<div class="btn-row">${saveBtn("itSave")}<button class="btn ghost" id="itCancel">বাতিল</button></div></div>`;
  q("#itCancel").onclick = () => { box.innerHTML = ""; };
  q("#itSave").onclick = e => guard(e.target, async () => {
    if (!val("itTitle")) { toastMsg("শিরোনাম দিন"); throw new Error("x"); }
    const data = { type, title: val("itTitle"), t: it.t || NOW };
    ["itG:g", "itAr:ar", "itPron:pron", "itMean:mean", "itNote:note", "itRef:ref", "itText:text", "itAge:age", "itArMean:arMean", "itLesson:lesson", "itGuide:guide", "itWhen:when", "itTodo:todo", "itAvoid:avoid", "itWomen:women"].forEach(s => { const [el, k] = s.split(":"); if (document.getElementById(el)) data[k] = val(el); });
    if (id) await admPut("content/items/" + id, data); else await admPost("content/items", data);
    box.innerHTML = ""; const P = q("#admPane"); if (P._reload) P._reload();
  }, "সংরক্ষণ হয়েছে। সবার অ্যাপে চলে যাবে।");
}

/* ----- setup ----- */
const RULES = JSON.stringify({ rules: {
  content: { ".read": true, ".write": `auth != null && auth.token.email == '${ADMIN_EMAIL}'` },
  lead: { ".read": "auth != null", ".write": `auth != null && auth.token.email == '${ADMIN_EMAIL}'` },
  kidx: { ".read": `auth != null && auth.token.email == '${ADMIN_EMAIL}'`, ".write": `auth != null && auth.token.email == '${ADMIN_EMAIL}'` },
  codes: { ".write": `auth != null && auth.token.email == '${ADMIN_EMAIL}'`, $code: { ".read": "auth != null" } },
  k: { ".read": `auth != null && auth.token.email == '${ADMIN_EMAIL}'`, ".write": `auth != null && auth.token.email == '${ADMIN_EMAIL}'`,
    $kid: { info: { ".read": "auth != null" }, m: { $mid: { ".read": "auth != null", uid: { ".write": "auth != null && (!data.exists() || data.val() === auth.uid) && newData.val() === auth.uid" } } } } },
  loc: { ".read": `auth != null && auth.token.email == '${ADMIN_EMAIL}'`, ".write": `auth != null && auth.token.email == '${ADMIN_EMAIL}'`,
    $kid: { $mid: { ".write": "auth != null && root.child('k').child($kid).child('m').child($mid).child('uid').val() === auth.uid", ".validate": "newData.hasChildren(['lat', 'lng', 't'])" } } }
} }, null, 2);
function tabSetup(P) {
  P.innerHTML = `<div class="cl-card"><h3>সার্ভারের অবস্থা</h3><p class="${READY ? "cl-ok" : "cl-err"}">${READY ? "সার্ভার যুক্ত আছে।" : "সার্ভার এখনো যুক্ত হয়নি (firebase-config.js ফাইলটি পূরণ করা হয়নি)।"}</p>
    <p class="lead">অ্যাডমিন অ্যাকাউন্ট: <span class="cl-code" style="direction:ltr;display:inline-block">${E(ADMIN_EMAIL)}</span></p></div>
    <div class="cl-card"><h3>নিরাপত্তা নিয়ম (Firebase Rules)</h3>
    <p class="lead">Firebase-এ Realtime Database → Rules-এ আগের সব লেখা মুছে এটা বসিয়ে Publish চাপুন। এতে শুধু আপনি (অ্যাডমিন) সবার তথ্য দেখতে ও বদলাতে পারবেন।</p>
    <div class="cl-pre" id="rulesTxt">${E(RULES)}</div><div class="btn-row"><button class="btn" id="rulesCopy">কপি করুন</button></div></div>`;
  q("#rulesCopy").onclick = async () => { try { await navigator.clipboard.writeText(RULES); toastMsg("কপি হয়েছে"); } catch (e) { const r = document.createRange(); r.selectNodeContents(q("#rulesTxt")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toastMsg("লেখাটি বাছাই করা হয়েছে, কপি করুন"); } };
}
function renderAdminSetupOnly() { q("#admHeadBtns").innerHTML = ""; const P = q("#admBody"); P.innerHTML = '<div id="admPane"></div>'; tabSetup(q("#admPane")); }

/* ---------------- start (called by the main script) ---------------- */
function start() {
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  // admin page (hidden; opened by holding the app name for 3 seconds)
  const sec = document.createElement("section");
  sec.className = "view"; sec.id = "v-admin"; sec.setAttribute("aria-label", "অ্যাডমিন");
  sec.innerHTML = '<div class="cl-row" style="justify-content:space-between;margin-top:10px"><h2 style="margin:0">অ্যাডমিন প্যানেল</h2><div class="cl-row" id="admHeadBtns"></div></div><div id="admBody"></div>';
  const home = q("#v-home"); home.parentNode.insertBefore(sec, home.nextSibling);
  const brand = q(".brand");
  if (brand && !locked()) {
    let t = null;
    const down = e => { clearTimeout(t); t = setTimeout(() => { t = null; if (navigator.vibrate) navigator.vibrate(30); adminEntry(); }, 3000); };
    const up = () => { clearTimeout(t); t = null; };
    brand.addEventListener("pointerdown", down); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => brand.addEventListener(ev, up));
    brand.addEventListener("contextmenu", e => e.preventDefault());
    brand.style.userSelect = "none"; brand.style.webkitUserSelect = "none";
  }
  renderNotices(); renderMy();
  if (my && window.addPlace) { const h = hotelPlace(); if (h) addPlace(h); const lp = leadPlace(); if (lp) addPlace(lp); }
  if (READY) {
    pullContent(true); refreshMy(); shareLoop();
    setInterval(() => { if (!document.hidden) { pullContent(false); refreshMy(); } }, 120000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { pullContent(false); refreshMy(); shareLoop(); } else if (my) { stopShare(); } });
    addEventListener("online", () => { pullContent(false); refreshMy(); });
  }
}
window.HGCloud = { start, applyPlaces, ready: READY };
})();
