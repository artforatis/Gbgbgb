/* 3D step-by-step guide for Umrah, Hajj and Madinah (three.js r149 + haram3d.js).
   Guide3D.mount(hostElement) then Guide3D.play(scene, anim). Scenes: ihram, mataf, masa, hajjmap, nabawi.
   Captions are sent to Guide3D.onCaption(title, line, counter). */
(function () {
"use strict";
const G = { onCaption: null };
let T, H3, host, renderer, cam, labels, raf = 0, last = 0, active = null, playing = true, mounted = false;
const scenes = {};
const view = { yaw: 0, pitch: .6, dist: 30, min: 2, max: 900, idle: 99, drag: false };
const want = { yaw: 0, pitch: .6, dist: 30, tx: 0, ty: 0, tz: 0, follow: null };
const target = { x: 0, y: 0, z: 0 };
let userAt = -1e9;
const caption = (title, line, counter) => { if (G.onCaption) G.onCaption(title || "", line || "", counter || ""); };
const V = (x, y, z) => new T.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; };
function std(c, o) { return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .7 }, o || {})); }
function camTo(o) { Object.assign(want, o); }

/* a highlighted pilgrim: ring under the feet, a floating marker above and a fading trail */
function avatar(scene, opt) {
  const p = H3.person(Object.assign({ kind: "ihram", scale: 1.15 }, opt));
  const g = new T.Group(); g.add(p.root);
  const ring = new T.Mesh(new T.RingGeometry(.55, .75, 32), new T.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: .95, side: T.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; g.add(ring);
  const mk = new T.Mesh(new T.ConeGeometry(.28, .6, 16), new T.MeshBasicMaterial({ color: 0xffc94a }));
  mk.rotation.x = Math.PI; mk.position.y = 2.75; g.add(mk);
  scene.add(g);
  const N = 240, pos = new Float32Array(N * 3);
  const tg = new T.BufferGeometry(); tg.setAttribute("position", new T.BufferAttribute(pos, 3)); tg.setDrawRange(0, 0);
  const trail = new T.Line(tg, new T.LineBasicMaterial({ color: 0xffb300, transparent: true, opacity: .8 }));
  scene.add(trail);
  let n = 0, lastPt = null;
  return {
    g, p, ring, mk,
    at(x, z, face) { g.position.set(x, 0, z); if (face !== undefined) g.rotation.y = face; },
    faceTo(x, z) { g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z); },
    trail(on) {
      if (!on) { n = 0; tg.setDrawRange(0, 0); lastPt = null; return; }
      const q = g.position;
      if (lastPt && Math.hypot(q.x - lastPt[0], q.z - lastPt[1]) < .6) return;
      lastPt = [q.x, q.z];
      if (n >= N) { pos.copyWithin(0, 3); n = N - 1; }
      pos[n * 3] = q.x; pos[n * 3 + 1] = .08; pos[n * 3 + 2] = q.z; n++;
      tg.setDrawRange(0, n); tg.attributes.position.needsUpdate = true;
    },
    tick(t) { mk.position.y = 2.75 + Math.sin(t / 300) * .15; ring.material.opacity = .65 + Math.sin(t / 250) * .3; }
  };
}
function lights(scene, sky, hemiI, sunI) {
  scene.background = new T.Color(sky);
  const h = new T.HemisphereLight(0xffffff, 0xb8b2a2, hemiI); scene.add(h);
  const s = new T.DirectionalLight(0xffffff, sunI); s.position.set(40, 90, 30); scene.add(s);
  return { h, s };
}
function walkTo(av, x, z, speed, dt, t) {
  const q = av.g.position, dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz);
  if (d < .05) { av.p.walk(0, 0); return true; }
  const st = Math.min(d, speed * dt);
  q.x += dx / d * st; q.z += dz / d * st;
  av.g.rotation.y = angLerp(av.g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
  av.p.walk(t / 1000 * speed * 4.5, 1);
  return false;
}

/* ===================== IHRAM ===================== */
scenes.ihram = function () {
  const scene = new T.Scene();
  const L = lights(scene, 0xe8edf0, .75, 1.0);
  L.s.position.set(3, 6, 4); L.s.castShadow = true; L.s.shadow.mapSize.set(1024, 1024);
  L.s.shadow.camera.left = L.s.shadow.camera.bottom = -3; L.s.shadow.camera.right = L.s.shadow.camera.top = 3;
  const fill = new T.DirectionalLight(0xfff1dc, .35); fill.position.set(-4, 3, -2); scene.add(fill);
  const floorTex = H3.canvasTex(512, 512, (x, w) => { const g = x.createRadialGradient(256, 256, 20, 256, 256, 256); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#d9dfe2"); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  const floor = new T.Mesh(new T.CircleGeometry(6, 64), new T.MeshStandardMaterial({ map: floorTex, roughness: .5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ped = new T.Mesh(new T.CylinderGeometry(.9, 1, .12, 48), std(0xc9a24a, { metalness: .5, roughness: .35 })); ped.position.y = .06; ped.receiveShadow = true; scene.add(ped);
  const man = H3.person({ kind: "ihram", scale: 1 }), woman = H3.person({ kind: "abaya", scale: .96, skin: 0xc79a7a });
  for (const p of [man, woman]) { p.root.position.y = .12; p.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(p.root); }
  let anim = "wear", t0 = 0, wearTop = true;
  const S = {
    scene,
    play(a) {
      anim = a; t0 = performance.now();
      man.root.visible = a !== "women"; woman.root.visible = a === "women";
      man.set({ idtiba: a === "idtiba", hair: "normal", top: true }); wearTop = true;
      man.parts.hair.visible = true; man.parts.hair.scale.set(.93, .95, 1);
      man.pose("none");
      const head = a === "halq" || a === "qasr";
      camTo({ yaw: .9, pitch: head ? .3 : .12, dist: head ? 1.9 : 3.1, tx: 0, ty: head ? 1.72 : 1.02, tz: 0, follow: null });
    },
    update(dt, t) {
      const k = (t - t0) / 1000;
      const turn = k * .35;
      man.root.rotation.y = woman.root.rotation.y = turn;
      if (anim === "wear") {
        const ph = k % 9;
        const top = ph >= 2.5; if (top !== wearTop) { wearTop = top; man.set({ top }); }
        if (ph < 2.5) { caption("ইহরামের কাপড় পরা", "প্রথমে নিচের চাদর (ইযার): নাভির ওপর থেকে টাখনুর ওপর পর্যন্ত জড়িয়ে নিন।"); }
        else if (ph < 5) { man.parts.rida.position.y = Math.max(0, (4 - ph)) * .25; caption("ইহরামের কাপড় পরা", "তারপর ওপরের চাদর (রিদা) দিয়ে দুই কাঁধ ঢেকে নিন।"); }
        else { man.parts.rida.position.y = 0; caption("ইহরামের কাপড় পরা", "মাথা খোলা থাকবে। সেলাইবিহীন দুটি সাদা চাদর আর এমন স্যান্ডেল, যাতে পায়ের পাতার ওপরের উঁচু হাড় খোলা থাকে।"); }
      } else if (anim === "idtiba") {
        man.parts.rida.position.y = 0;
        caption("ইযতিবা (শুধু পুরুষ, শুধু তাওয়াফে)", "ওপরের চাদরের মাঝখান ডান বগলের নিচ দিয়ে এনে দুই প্রান্ত বাম কাঁধের ওপর রাখুন। ডান কাঁধ খোলা থাকবে।");
      } else if (anim === "women") {
        caption("মহিলাদের ইহরাম", "আলাদা কোনো কাপড় নেই। ঢিলেঢালা শালীন সাধারণ পোশাক, চুল ঢাকা। মুখমণ্ডল ও হাত খোলা থাকবে, নিকাব ও হাতমোজা পরবেন না।");
      } else if (anim === "halq") {
        const f = Math.max(0, 1 - Math.max(0, (k % 7) - 1.2) / 3);
        man.parts.hair.visible = f > .02; man.parts.hair.scale.set(.93 * (.9 + .1 * f), .95 * f + .01, 1);
        caption("হলক: মাথা মুণ্ডন", "পুরুষদের জন্য পুরো মাথা মুণ্ডন করা উত্তম। নবীজি ﷺ মুণ্ডনকারীদের জন্য তিনবার দোয়া করেছেন।");
      } else if (anim === "qasr") {
        const f = Math.max(0, 1 - Math.max(0, (k % 7) - 1.2) / 3);
        man.parts.hair.scale.set(.93, .8 + .15 * f, .95 + .05 * f);
        caption("কসর: চুল ছোট করা", "পুরুষেরা পুরো মাথা থেকে কিছুটা চুল ছোট করবেন। মহিলারা চুলের আগা থেকে আঙুলের এক কর পরিমাণ কাটবেন।");
      }
    }
  };
  return S;
};

/* ===================== MATAF ===================== */
scenes.mataf = function () {
  const scene = new T.Scene();
  const L = lights(scene, 0x0b1424, .95, .3);
  scene.fog = new T.Fog(0x0b1424, 150, 320);
  const env = H3.matafEnv(scene);
  const crowd = H3.crowd(scene, 2200, env.rMin);
  const av = avatar(scene, { idtiba: true });
  const K = H3.KAABA;
  const A_BS = Math.atan2(-K.BS[2], K.BS[0]), A_YM = Math.atan2(-K.YAMANI[2], K.YAMANI[0]) + Math.PI * 2;
  const R = 15.5;
  let anim = "tawaf", t0 = 0, a = A_BS, lap = 0, phase = 0, pauseUntil = 0, lastLap = 0;
  const lab = [];
  const posAt = (ang, r) => [r * Math.cos(ang), -r * Math.sin(ang)];
  const S = {
    scene,
    occ: [[-6.1, 0, -5.6, 6.1, 15, 5.6]],
    labels() { return [["কাবা", V(0, 15.8, 0)], ["হাজরে আসওয়াদ", V(6.5, 2.5, 6.0)], ["রুকনে ইয়ামানি", V(-6.5, 2.5, 6.0)], ["হাতিম", V(0, 2.2, -12.5)], ["মাকামে ইবরাহিম", V(14, 3.4, 2.4)], ["মুলতাযাম", V(6.6, 4.6, 4.0)], ["দরজা", V(6.4, 7.6, 2.4)]]; },
    play(an) {
      anim = an; t0 = performance.now(); lap = 0; phase = 0; pauseUntil = 0; lastLap = 0;
      env.startLine.material.opacity = (an === "start" || an === "tawaf" || an === "ramal") ? .85 : .25;
      av.trail(false); av.p.pose("none");
      av.p.set({ idtiba: an !== "maqam" && an !== "zamzam" && an !== "hateem" && an !== "enter" });
      if (an === "enter") { const [x, z] = posAt(-.35, 52); av.at(x, z); }
      else if (an === "start") { const [x, z] = posAt(A_BS, R); av.at(x, z); av.faceTo(0, 0); }
      else if (an === "tawaf" || an === "ramal") { a = A_BS; const [x, z] = posAt(a, R); av.at(x, z); }
      else if (an === "yamani") { a = A_YM; const [x, z] = posAt(a, R - 4); av.at(x, z); }
      else if (an === "maqam") { const d = Math.hypot(14, 2.4), r = d + 3.2; av.at(14 / d * r, 2.4 / d * r); av.faceTo(0, 0); }
      else if (an === "zamzam") { const [x, z] = posAt(.5, 24); av.at(x, z); }
      else if (an === "multazam") { av.at(7.0, 4.0); av.g.rotation.y = -Math.PI / 2; }
      else if (an === "hateem") { av.at(0, -8.5); av.faceTo(0, 0); }
      const q = av.g.position, ay = Math.atan2(q.z, q.x);
      const C = {
        enter: { dy: .2, dist: 20, pitch: .62, follow: true },
        start: { dy: -.55, dist: 24, pitch: .42, tf: .78 },
        tawaf: { y: .9, dist: 34, pitch: .78, follow: true }, ramal: { y: .9, dist: 34, pitch: .78, follow: true },
        yamani: { dy: .55, dist: 24, pitch: .55, follow: true },
        maqam: { dy: .4, dist: 22, pitch: .38, tf: .85 },
        zamzam: { dy: .45, dist: 20, pitch: .45, follow: true },
        multazam: { dy: .3, dist: 15, pitch: .28, tf: .93 },
        hateem: { dy: .55, dist: 26, pitch: .6, tf: .95 }
      }[an] || { dy: .4, dist: 30, pitch: .5, tf: .8 };
      camTo({ dist: C.dist, pitch: C.pitch, yaw: C.y !== undefined ? C.y : ay + C.dy, follow: C.follow ? av : null,
        tx: q.x * (C.tf || 1), ty: 1.6, tz: q.z * (C.tf || 1) });
    },
    update(dt, t) {
      crowd.update(dt, t, anim === "hateem" ? .35 : .42, null, anim === "hateem", 1);
      av.tick(t);
      const k = (t - t0) / 1000;
      if (anim === "enter") {
        const tgt = posAt(A_BS, R + 1.5);
        if (walkTo(av, tgt[0], tgt[1], 3.2, dt, t)) { av.faceTo(0, 0); av.p.pose("istilam", Math.min(1, (k % 6) / 1)); if (k > 18) S.play("enter"); }
        caption("মসজিদুল হারামে প্রবেশ", "ডান পা দিয়ে ঢুকুন, প্রবেশের দোয়া পড়ুন। তারপর সোজা হাজরে আসওয়াদ বরাবর শুরুর দাগের দিকে যান।");
      } else if (anim === "start") {
        const pr = (k % 5) / 5;
        av.p.pose("istilam", pr < .6 ? Math.sin(pr / .6 * Math.PI) : 0);
        caption("তাওয়াফ শুরু: ইস্তিলাম", "হাজরে আসওয়াদের দিকে মুখ করে ডান হাত তুলে বলুন: “বিসমিল্লাহি আল্লাহু আকবার”। ছুঁতে না পারলে দূর থেকে ইশারাই যথেষ্ট, ধাক্কাধাক্কি করবেন না।");
      } else if (anim === "tawaf" || anim === "ramal") {
        if (t < pauseUntil) { av.p.walk(0, 0); return; }
        const ramal = anim === "ramal" && lap < 3;
        const speed = ramal ? 3.4 : 2.6;
        a += speed / R * dt;
        const [x, z] = posAt(a, R);
        av.g.position.set(x, 0, z); av.g.rotation.y = a + Math.PI;
        av.p.walk(t / 1000 * (ramal ? 13 : 9), ramal ? .7 : 1);
        av.trail(true);
        const done = Math.floor((a - A_BS) / (Math.PI * 2));
        if (done > lastLap) {
          lastLap = done; lap = done;
          if (lap >= 7) { caption("তাওয়াফ শেষ", "৭ চক্কর পূর্ণ হয়েছে। এবার ডান কাঁধ ঢেকে মাকামে ইবরাহিমের পেছনে দুই রাকাত নামাজ।", "৭ / ৭"); pauseUntil = t + 4000; setTimeout(() => active === S && S.play(anim), 4200); return; }
          pauseUntil = t + 900; av.faceTo(0, 0); av.p.pose("istilam", 1); setTimeout(() => av.p.pose("none"), 800);
        }
        const rel = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const inYamani = rel > (A_YM % (Math.PI * 2)) && rel < ((A_BS + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2);
        const cnt = `চক্কর ${"০১২৩৪৫৬৭"[Math.min(7, lap + 1)]} / ৭`;
        if (ramal) caption("রমল (প্রথম ৩ চক্কর, শুধু পুরুষ)", "ছোট ছোট কদমে একটু দ্রুত হাঁটুন, কাঁধ সামান্য দুলিয়ে। ৪র্থ চক্কর থেকে স্বাভাবিক হাঁটা।", cnt);
        else if (inYamani) caption("রুকনে ইয়ামানি থেকে হাজরে আসওয়াদ", "এখানে পড়ুন: “রাব্বানা আতিনা ফিদ্দুনইয়া হাসানাতাঁও ওয়াফিল আখিরাতি হাসানাতাঁও ওয়াকিনা আযাবান্নার”।", cnt);
        else caption("তাওয়াফ", "কাবা থাকবে আপনার বাম দিকে। হাতিমের বাইরে দিয়ে ঘুরুন। প্রতি চক্করের নির্দিষ্ট দোয়া নেই, যেকোনো দোয়া ও যিকির করুন।", cnt);
      } else if (anim === "yamani") {
        const a1 = A_BS + Math.PI * 2;
        if (a < a1) {
          a += 2.4 / (R - 4) * dt;
          const [x, z] = posAt(a, R - 4); av.g.position.set(x, 0, z); av.g.rotation.y = a + Math.PI; av.p.walk(t / 1000 * 9, 1); av.trail(true);
          const touch = a - A_YM < .25;
          if (touch) { av.p.pose("istilam", .8); }
          caption("রুকনে ইয়ামানি", touch ? "সম্ভব হলে ডান হাতে রুকনে ইয়ামানি ছুঁয়ে নিন (চুমু নয়)। ভিড় হলে ইশারারও দরকার নেই, হেঁটে যান।" : "এখান থেকে হাজরে আসওয়াদ পর্যন্ত পড়ুন: “রাব্বানা আতিনা ফিদ্দুনইয়া হাসানাহ…”।");
        } else { av.trail(false); a = A_YM; }
      } else if (anim === "maqam") {
        const seq = ["qiyam", "qiyam", "ruku", "qiyam", "sujud", "sujud", "qiyam"], i = Math.floor(k / 1.6) % seq.length;
        av.p.pose(seq[i], 1);
        caption("তাওয়াফের পর দুই রাকাত", "মাকামে ইবরাহিমকে সামনে রেখে দুই রাকাত পড়ুন: প্রথম রাকাতে সূরা কাফিরুন, দ্বিতীয়তে সূরা ইখলাস। ভিড় হলে মসজিদের যেকোনো জায়গায় পড়লেও হবে।");
      } else if (anim === "zamzam") {
        const c = env.zamzam[0];
        if (walkTo(av, c[0] * .94, c[1] * .94, 3, dt, t)) { av.faceTo(c[0], c[1]); av.p.pose("drink"); }
        caption("যমযম পান", "কিবলামুখী হয়ে, বিসমিল্লাহ বলে, তিন নিঃশ্বাসে পান করুন এবং মনের দোয়া করুন।");
      } else if (anim === "multazam") {
        av.p.pose("dua", 1);
        caption("মুলতাযাম", "হাজরে আসওয়াদ ও কাবার দরজার মাঝের দেয়াল। ভিড় না থাকলে বুক-গাল লাগিয়ে দোয়া করা যায়; বর্ণনাগুলোর সনদে মতভেদ আছে, এটা জরুরি নয়।");
      } else if (anim === "hateem") {
        const seq = ["qiyam", "ruku", "qiyam", "sujud", "sujud", "qiyam", "dua"], i = Math.floor(k / 1.6) % seq.length;
        av.p.pose(seq[i], 1);
        caption("হাতিমে নামাজ", "হাতিম কাবারই অংশ। নির্ধারিত সময়ে ভেতরে দুই রাকাত নফল ও দোয়া (সময় ‘হাতিম’ ট্যাবে)।");
      }
    }
  };
  return S;
};

/* ===================== MAS'A (SA'I) ===================== */
scenes.masa = function () {
  const scene = new T.Scene();
  lights(scene, 0x9fb3c4, .8, .55);
  const LEN = 140, GA = 54, GB = 70;
  const floorTex = H3.canvasTex(512, 2048, (x, w, h) => {
    x.fillStyle = "#e4e1da"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(110,100,85,.35)"; x.lineWidth = 2;
    for (let y = 0; y < h; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
    for (let i = 0; i < w; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  });
  floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping; floorTex.repeat.set(3, 1); floorTex.rotation = Math.PI / 2;
  const floor = new T.Mesh(new T.PlaneGeometry(LEN + 30, 24), new T.MeshStandardMaterial({ map: floorTex, roughness: .25 }));
  floor.rotation.x = -Math.PI / 2; floor.position.x = LEN / 2; scene.add(floor);
  const divider = new T.Mesh(new T.BoxGeometry(LEN - 6, .9, .5), std(0xe6dfcf)); divider.position.set(LEN / 2, .45, 0); scene.add(divider);
  const colM = std(0xefe9dc, { roughness: .4 }), capM = std(0xc9a24a, { metalness: .6, roughness: .35 });
  const lowWall = new T.Mesh(new T.BoxGeometry(LEN + 10, 1.2, .4), std(0xc9bfa8)); lowWall.position.set(LEN / 2, .6, 12); scene.add(lowWall);
  for (let x = 0; x <= LEN; x += 7) for (const z of [-12]) {
    const c = new T.Mesh(new T.CylinderGeometry(.55, .6, 11, 12), colM); c.position.set(x, 5.5, z); scene.add(c);
    const cap = new T.Mesh(new T.CylinderGeometry(.85, .6, .7, 12), capM); cap.position.set(x, 11.1, z); scene.add(cap);
  }
  // ceiling seen only from below, so the camera can look in from above
  const ceil = new T.Mesh(new T.PlaneGeometry(LEN + 30, 25), std(0xf3eee2)); ceil.rotation.x = Math.PI / 2; ceil.position.set(LEN / 2, 12, 0); scene.add(ceil);
  const lightM = new T.MeshBasicMaterial({ color: 0xfff7dd });
  for (let x = 3; x < LEN; x += 7) for (const z of [-6, 6]) { const l = new T.Mesh(new T.PlaneGeometry(4, 1.4), lightM); l.rotation.x = Math.PI / 2; l.position.set(x, 11.9, z); scene.add(l); }
  // green lights: men walk fast between them
  const greenM = new T.MeshBasicMaterial({ color: 0x19e07a });
  for (let x = GA; x <= GB; x += 2) { const g = new T.Mesh(new T.PlaneGeometry(1.4, 22), greenM); g.rotation.x = Math.PI / 2; g.position.set(x, 11.85, 0); scene.add(g); }
  const greenFloor = new T.Mesh(new T.PlaneGeometry(GB - GA, 22), new T.MeshBasicMaterial({ color: 0x19e07a, transparent: true, opacity: .18 }));
  greenFloor.rotation.x = -Math.PI / 2; greenFloor.position.set((GA + GB) / 2, .03, 0); scene.add(greenFloor);
  for (const x of [GA, GB]) { const st = new T.Mesh(new T.PlaneGeometry(.6, 22), greenM); st.rotation.x = -Math.PI / 2; st.position.set(x, .04, 0); scene.add(st); }
  for (const x of [GA, GB]) for (const z of [-11.4, 11.4]) { const g = new T.Mesh(new T.BoxGeometry(.4, 9, .15), greenM); g.position.set(x, 6, z); scene.add(g); }
  // Safa and Marwa hills (rock under a glass rail and a dome)
  const rockM = std(0x8f8270, { roughness: 1, flatShading: true });
  const hill = (cx, dirn, size) => {
    const g = new T.Group();
    for (let i = 0; i < 26; i++) {
      const r = new T.Mesh(new T.DodecahedronGeometry(.8 + Math.random() * 1.4 * size, 0), rockM);
      r.position.set(cx + dirn * (Math.random() * 6 * size), Math.random() * 1.8 * size, (Math.random() - .5) * 12);
      r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); g.add(r);
    }
    const rail = new T.Mesh(new T.BoxGeometry(.15, 1.1, 13), new T.MeshStandardMaterial({ color: 0xbfe4ff, transparent: true, opacity: .35, roughness: .1 }));
    rail.position.set(cx - dirn * .5, .55, 0); g.add(rail);
    const dome = new T.Mesh(new T.SphereGeometry(10, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf5f1e6, { side: T.DoubleSide }));
    dome.position.set(cx + dirn * 3, 12.2, 0); g.add(dome);
    scene.add(g);
  };
  hill(-1, -1, 1); hill(LEN + 1, 1, .7);
  const arrow = new T.Mesh(new T.ConeGeometry(.6, 1.6, 16), new T.MeshBasicMaterial({ color: 0xc9a24a }));
  arrow.rotation.x = -Math.PI / 2; arrow.position.set(-2, 4.2, -9); scene.add(arrow);
  // crowd walking both ways
  const MAX = 1400;
  const bodyG = new T.CylinderGeometry(.19, .27, 1.3, 7); bodyG.translate(0, .65, 0);
  const headG = new T.SphereGeometry(.13, 8, 6); headG.translate(0, 1.45, 0);
  const body = new T.InstancedMesh(bodyG, std(0xffffff, { roughness: .9 }), MAX), head = new T.InstancedMesh(headG, std(0xffffff), MAX);
  const col = new T.Color(), ag = [];
  for (let i = 0; i < MAX; i++) {
    const ab = Math.random() < .3;
    body.setColorAt(i, col.set(ab ? 0x151515 : (Math.random() < .8 ? 0xfafaf6 : 0x6a7f99)));
    head.setColorAt(i, col.set(ab ? 0x151515 : 0x3b2a20));
    ag.push({ x: Math.random() * LEN, dir: Math.random() < .5 ? 1 : -1, z: 1.5 + Math.random() * 8.5, sp: 2.2 + Math.random() * 1.4, ph: Math.random() * 6 });
  }
  scene.add(body, head);
  const av = avatar(scene, { idtiba: false });
  const M = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), SC = new T.Vector3(1, 1, 1), UP = new T.Vector3(0, 1, 0);
  let anim = "sai", t0 = 0, lap = 0, dir = 1, pauseUntil = 0;
  const S = {
    scene,
    labels() { return [["সাফা", V(-4, 6, 0)], ["মারওয়া", V(LEN + 3, 5, 0)], ["সবুজ বাতি", V((GA + GB) / 2, 10, 11)], ["কাবা এদিকে", V(-2, 5.6, -9)]]; },
    play(an) {
      anim = an; t0 = performance.now(); lap = 0; dir = 1; pauseUntil = 0; av.trail(false); av.p.pose("none");
      if (an === "safa") { av.at(-3.2, 4); av.g.position.y = 1.6; av.faceTo(-3.2, -20); }
      else if (an === "marwa") { av.at(LEN - 4, 5); }
      else if (an === "green") { av.at(GA - 12, 5); }
      else { av.at(1, 5); av.g.position.y = 0; }
      camTo({ dist: an === "sai" ? 40 : an === "green" ? 36 : 22, pitch: an === "safa" || an === "marwa" ? .62 : .9, yaw: an === "safa" ? 2.2 : an === "marwa" ? .9 : 1.75, follow: av, ty: 2 });
    },
    update(dt, t) {
      for (let i = 0; i < MAX; i++) {
        const g = ag[i];
        g.x += g.dir * g.sp * (g.x > GA && g.x < GB ? 1.4 : 1) * dt;
        if (g.x > LEN - 1) { g.dir = -1; } if (g.x < 1) { g.dir = 1; }
        const z = g.dir > 0 ? g.z : -g.z;
        P.set(g.x, Math.abs(Math.sin(t / 240 + g.ph)) * .06, z); Q.setFromAxisAngle(UP, g.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        M.compose(P, Q, SC); body.setMatrixAt(i, M); head.setMatrixAt(i, M);
      }
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
      av.tick(t);
      const k = (t - t0) / 1000;
      const q = av.g.position;
      if (anim === "safa" || anim === "marwa") {
        if (anim === "marwa" && q.x < LEN - .5 && k < 6) { walkTo(av, LEN + .5, 5, 3, dt, t); av.g.position.y = Math.max(0, (q.x - (LEN - 2)) * .6); caption("মারওয়ায় পৌঁছানো", "মারওয়ায় উঠে কাবার দিকে মুখ করে সাফার মতোই যিকির ও দোয়া করুন।"); return; }
        av.faceTo(q.x, -20); av.p.pose("dua", 1);
        caption(anim === "safa" ? "সাফায় দাঁড়িয়ে" : "মারওয়ায় দাঁড়িয়ে", anim === "safa"
          ? "পড়ুন “ইন্নাস সাফা ওয়াল মারওয়াতা মিন শাআইরিল্লাহ”, “আবদাউ বিমা বাদাআল্লাহু বিহি”। কাবার দিকে মুখ করে দুই হাত তুলে তিনবার যিকির ও দোয়া।"
          : "সাফার মতোই কাবার দিকে মুখ করে যিকির ও দোয়া করুন। সাঈ মারওয়াতেই শেষ হয় (৭ম চক্কর)।");
      } else if (anim === "green") {
        const inG = q.x > GA && q.x < GB;
        if (walkTo(av, GB + 12, 5, inG ? 5 : 2.8, dt, t)) av.at(GA - 12, 5);
        av.p.walk(t / 1000 * (inG ? 16 : 9), 1);
        caption("সবুজ বাতির মাঝখানে", inG ? "পুরুষেরা এখানে দ্রুত হাঁটবেন (হালকা দৌড়)। মহিলারা স্বাভাবিকভাবে হাঁটবেন।" : "সবুজ বাতির আগে-পরে স্বাভাবিক গতিতে হাঁটুন।");
      } else {
        if (t < pauseUntil) { av.faceTo(q.x, -20); av.p.pose("dua", 1); return; }
        av.p.pose("none");
        const endX = dir > 0 ? LEN - 1.5 : 1.5, laneZ = dir > 0 ? 5 : -5;
        const inG = q.x > GA && q.x < GB;
        if (Math.abs(q.z - laneZ) > .2 && (q.x < 4 || q.x > LEN - 4)) { walkTo(av, q.x, laneZ, 3, dt, t); }
        else if (walkTo(av, endX, laneZ, inG ? 6.5 : 4, dt, t)) {
          lap++; if (lap >= 7) { caption("সাঈ শেষ", "৭ চক্কর মারওয়ায় শেষ হলো। এবার পুরুষেরা মাথা মুণ্ডন বা চুল ছোট, মহিলারা আঙুলের এক কর পরিমাণ চুল কাটবেন।", "৭ / ৭"); pauseUntil = t + 4500; setTimeout(() => active === S && S.play("sai"), 4700); return; }
          dir = -dir; pauseUntil = t + 2200;
        }
        av.trail(true);
        if (inG) av.p.walk(t / 1000 * 16, 1);
        const cnt = `চক্কর ${"০১২৩৪৫৬৭"[Math.min(7, lap + 1)]} / ৭`;
        caption("সাঈ", dir > 0 ? "সাফা থেকে মারওয়া (১ চক্কর)।" + (inG ? " সবুজ বাতির মাঝে পুরুষেরা দ্রুত হাঁটুন।" : "") : "মারওয়া থেকে সাফা (আরেক চক্কর)।" + (inG ? " সবুজ বাতির মাঝে পুরুষেরা দ্রুত হাঁটুন।" : ""), cnt);
      }
    }
  };
  return S;
};

/* ===================== HAJJ MAP ===================== */
scenes.hajjmap = function () {
  const scene = new T.Scene();
  const L = lights(scene, 0xa9c3da, .55, 1.25);
  scene.fog = new T.Fog(0xa9c3da, 700, 1600);
  const SC = 25; // metres per unit
  const X = lng => (lng - 39.8262) * 103600 / SC, Z = lat => -(lat - 21.4225) * 110540 / SC;
  const P = (lat, lng) => [X(lng), Z(lat)];
  const W = {
    haram: P(21.4225, 39.8262), jamarat: P(21.4206, 39.8726), mina: P(21.4133, 39.8933), muzd: P(21.3836, 39.9368),
    mashar: P(21.3875, 39.9125), namirah: P(21.3534, 39.9655), arafat: P(21.3549, 39.9842), rahmah: P(21.3548, 39.9841), slaughter: P(21.4005, 39.8735)
  };
  const route = [W.haram, P(21.4215, 39.8420), P(21.4205, 39.8580), W.jamarat, P(21.4170, 39.8830), W.mina, P(21.4020, 39.9110), W.mashar, W.muzd, P(21.3720, 39.9520), W.namirah, W.arafat];
  const dSeg = (x, z, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz; let t = ((x - a[0]) * vx + (z - a[1]) * vz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz); };
  const dRoute = (x, z) => { let m = 1e9; for (let i = 1; i < route.length; i++) m = Math.min(m, dSeg(x, z, route[i - 1], route[i])); return m; };
  // value noise
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v); };
  const fbm = (x, z) => { let s = 0, a = .5, f = 1; for (let o = 0; o < 5; o++) { s += a * noise(x * f, z * f); a *= .5; f *= 2.03; } return s; };
  const flat = (x, z) => {
    let k = Math.min(1, Math.max(0, (dRoute(x, z) - 14) / 45));
    for (const [c, r] of [[W.arafat, 110], [W.muzd, 60], [W.mina, 45], [W.haram, 40], [W.namirah, 30]]) { const d = Math.hypot(x - c[0], z - c[1]); k = Math.min(k, Math.max(0, (d - r) / 40)); }
    return k;
  };
  const CX = 340, CZ = 150, GW = 1100, GD = 620;
  const geo = new T.PlaneGeometry(GW, GD, 275, 155); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + CX, z = pos.getZ(i) + CZ;
    const h = Math.pow(fbm(x / 60, z / 60), 1.6) * 75 * flat(x, z);
    pos.setX(i, x); pos.setZ(i, z); pos.setY(i, h);
    c.set(h < 3 ? 0xc9b48c : h < 18 ? 0xa88a62 : h < 35 ? 0x86684a : 0x664c35); colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new T.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const terrain = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  scene.add(terrain);
  const local = new T.Group(); scene.add(local); local.add(terrain);
  // Haram and clock tower
  const haram = new T.Mesh(new T.CylinderGeometry(9, 9, 2.4, 8), std(0xf4f1e8)); haram.position.set(W.haram[0], 1.2, W.haram[1]); local.add(haram);
  const kb = new T.Mesh(new T.BoxGeometry(1.4, 1.6, 1.3), std(0x050505)); kb.position.set(W.haram[0], 2.8, W.haram[1]); local.add(kb);
  const tower = new T.Mesh(new T.BoxGeometry(3, 24, 3), std(0xd8d0bd)); tower.position.set(W.haram[0] + 1, 12, W.haram[1] + 12); local.add(tower);
  const clock = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, .2, 24), new T.MeshBasicMaterial({ color: 0x8fe08f })); clock.rotation.x = Math.PI / 2; clock.position.set(W.haram[0] + 1, 20, W.haram[1] + 10.4); local.add(clock);
  // Mina tents
  const tentG = new T.ConeGeometry(.9, 1.1, 4); tentG.translate(0, .55, 0);
  const tents = new T.InstancedMesh(tentG, std(0xffffff, { roughness: .6 }), 5200);
  let nt = 0; const M = new T.Matrix4(), Qn = new T.Quaternion(), Pn = new T.Vector3(), Sn = new T.Vector3(1, 1, 1);
  for (let gx = W.jamarat[0] + 10; gx < W.mina[0] + 95 && nt < 5200; gx += 2.3) for (let gz = W.mina[1] - 60; gz < W.mina[1] + 60 && nt < 5200; gz += 2.3) {
    if (dRoute(gx, gz) > 40 || flat(gx, gz) > .55) continue;
    Pn.set(gx, 0, gz); M.compose(Pn, Qn, Sn); tents.setMatrixAt(nt++, M);
  }
  tents.count = nt; local.add(tents);
  // Jamarat bridge with three pillars (Aqabah is the one closest to Makkah)
  const jg = new T.Group(); jg.position.set(W.jamarat[0], 0, W.jamarat[1]);
  const jDir = Math.atan2(-(W.mina[1] - W.jamarat[1]), W.mina[0] - W.jamarat[0]);
  jg.rotation.y = jDir;
  for (let lv = 0; lv < 4; lv++) { const deck = new T.Mesh(new T.BoxGeometry(40, .8, 6), std(0xd9d4c8)); deck.position.set(4, 1 + lv * 3, 0); jg.add(deck); }
  const pillars = [];
  [[-12, "বড় (আকাবা)"], [2, "মধ্যম (উসতা)"], [16, "ছোট (উলা)"]].forEach(([x, name]) => {
    const p = new T.Mesh(new T.BoxGeometry(5, 15, 1.2), std(0x8c8577)); p.position.set(x, 7.5, 0); jg.add(p);
    const basin = new T.Mesh(new T.CylinderGeometry(4.2, 4.2, .7, 24, 1, true), std(0xbcb3a2, { side: T.DoubleSide })); basin.scale.z = .5; basin.position.set(x, .4, 0); jg.add(basin);
    pillars.push({ x, name });
  });
  local.add(jg);
  const pillarWorld = i => { const v = new T.Vector3(pillars[i].x, 3, 0); jg.updateMatrixWorld(); return v.applyMatrix4(jg.matrixWorld); };
  // Muzdalifah lights, Mash'ar mosque, Namirah, Jabal ar-Rahmah, trees
  const lampG = new T.SphereGeometry(.35, 6, 4), lampM = new T.MeshBasicMaterial({ color: 0xfff2b0 });
  const lamps = new T.InstancedMesh(lampG, lampM, 400);
  for (let i = 0; i < 400; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 55; Pn.set(W.muzd[0] + r * Math.cos(a), 4, W.muzd[1] + r * Math.sin(a)); M.compose(Pn, Qn, Sn); lamps.setMatrixAt(i, M); }
  local.add(lamps);
  const mosque = (pt, w, d, nMin, colr) => {
    const g = new T.Group(); g.position.set(pt[0], 0, pt[1]);
    const b = new T.Mesh(new T.BoxGeometry(w, 4, d), std(colr || 0xf1ede2)); b.position.y = 2; g.add(b);
    for (let i = 0; i < nMin; i++) { const m = new T.Mesh(new T.CylinderGeometry(.45, .6, 12, 8), std(0xf1ede2)); m.position.set((i % 2 ? 1 : -1) * w / 2, 6, (i < 2 ? -1 : 1) * d / 2 * (nMin > 2 ? 1 : 0)); g.add(m); }
    local.add(g); return g;
  };
  mosque(W.mashar, 12, 8, 2); mosque(W.namirah, 22, 14, 6, 0xe9e3d3);
  const rh = new T.Mesh(new T.ConeGeometry(9, 7, 18), std(0x8a7358, { flatShading: true })); rh.position.set(W.rahmah[0] + 4, 3.5, W.rahmah[1] + 4); local.add(rh);
  const pil = new T.Mesh(new T.BoxGeometry(.8, 4, .8), std(0xffffff)); pil.position.set(W.rahmah[0] + 4, 9, W.rahmah[1] + 4); local.add(pil);
  const trees = new T.InstancedMesh(new T.SphereGeometry(.9, 6, 4), std(0x6b8f4e), 1500);
  for (let i = 0; i < 1500; i++) { const a = Math.random() * 6.28, r = 20 + Math.sqrt(Math.random()) * 95; Pn.set(W.arafat[0] - 15 + r * Math.cos(a), .9, W.arafat[1] + r * Math.sin(a) * .7); M.compose(Pn, Qn, Sn); trees.setMatrixAt(i, M); }
  local.add(trees);
  // route as a tube that grows with the journey
  const curve = new T.CatmullRomCurve3(route.map(p => new T.Vector3(p[0], 2.2, p[1])), false, "catmullrom", .3);
  const tube = new T.Mesh(new T.TubeGeometry(curve, 600, .9, 8, false), new T.MeshBasicMaterial({ color: 0xffb300 }));
  local.add(tube);
  const tubeIdx = tube.geometry.index.count;
  const marker = new T.Group();
  const mball = new T.Mesh(new T.SphereGeometry(2.2, 20, 14), new T.MeshBasicMaterial({ color: 0xffd34d }));
  const beam = new T.Mesh(new T.CylinderGeometry(.6, .6, 40, 12, 1, true), new T.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: .35 }));
  beam.position.y = 20; marker.add(mball, beam); local.add(marker);
  const near = (pt) => { let best = 0, bd = 1e9; for (let i = 0; i <= 400; i++) { const p = curve.getPointAt(i / 400), d = Math.hypot(p.x - pt[0], p.z - pt[1]); if (d < bd) { bd = d; best = i / 400; } } return best; };
  const U = { haram: 0, jamarat: near(W.jamarat), mina: near(W.mina), mashar: near(W.mashar), muzd: near(W.muzd), namirah: near(W.namirah), arafat: 1 };
  // pebbles
  const pebbles = []; const pebG = new T.SphereGeometry(.35, 6, 4), pebM = std(0x555046);
  for (let i = 0; i < 7; i++) { const p = new T.Mesh(pebG, pebM); p.visible = false; local.add(p); pebbles.push(p); }

  /* far map for the miqats (1 unit = 1 km) */
  const far = new T.Group(); far.visible = false; scene.add(far);
  const FX = lng => (lng - 39.8262) * 103.6, FZ = lat => -(lat - 21.4225) * 110.5;
  const land = new T.Mesh(new T.PlaneGeometry(1400, 900), std(0xd9c7a0, { roughness: 1 })); land.rotation.x = -Math.PI / 2; land.position.set(150, -.2, -80); far.add(land);
  const coast = [[24.6, 37.5], [24.1, 38.06], [23.4, 38.6], [22.8, 39.0], [22.3, 39.08], [21.7, 39.1], [21.48, 39.17], [21.0, 39.5], [20.5, 39.9], [20.15, 40.27], [19.6, 40.7], [19.0, 41.1]];
  const shape = new T.Shape();
  shape.moveTo(FX(36.5), -FZ(24.8));
  coast.forEach(([la, lo]) => shape.lineTo(FX(lo), -FZ(la)));
  shape.lineTo(FX(36.5), -FZ(18.8)); shape.closePath();
  const sea = new T.Mesh(new T.ShapeGeometry(shape), std(0x3d79b0, { roughness: .3, metalness: .1 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = .2; far.add(sea);
  const MIQ = [["যুল হুলাইফা (মদিনার দিক)", 24.4136, 39.5447], ["জুহফা / রাবিগ (শামের দিক)", 22.7050, 39.1450], ["কারনুল মানাযিল (নজদের দিক, পূর্ব)", 21.6330, 40.4270], ["ইয়ালামলাম (ইয়েমেনের দিক, দক্ষিণ)", 20.5160, 39.8700], ["যাতু ইরক (ইরাকের দিক)", 21.9300, 40.4300]];
  const pinM = new T.MeshBasicMaterial({ color: 0x0b6b50 });
  const ringPts = [];
  MIQ.forEach(([n, la, lo]) => { const p = new T.Mesh(new T.CylinderGeometry(3, 3, 14, 16), pinM); p.position.set(FX(lo), 7, FZ(la)); far.add(p); ringPts.push(new T.Vector3(FX(lo), 1, FZ(la))); });
  const mk = new T.Mesh(new T.CylinderGeometry(5, 5, 20, 20), new T.MeshBasicMaterial({ color: 0xffc94a })); mk.position.set(0, 10, 0); far.add(mk);
  const ringOrder = [0, 4, 2, 3, 1, 0].map(i => ringPts[i]);
  const ring = new T.Line(new T.BufferGeometry().setFromPoints(new T.CatmullRomCurve3(ringOrder, true).getPoints(200)), new T.LineDashedMaterial({ color: 0x0b6b50, dashSize: 8, gapSize: 6 }));
  ring.computeLineDistances(); far.add(ring);
  const jed = [FX(39.1565), FZ(21.6796)];
  const plane = new T.Group();
  const fus = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 14, 12), std(0xffffff)); fus.rotation.z = Math.PI / 2; plane.add(fus);
  const wing = new T.Mesh(new T.BoxGeometry(3, .4, 16), std(0xffffff)); plane.add(wing);
  plane.position.y = 20; far.add(plane);
  const planeFrom = [700, -60];

  let anim = "makkah", t0 = 0, seg = [0, 0], focus = null, night = false;
  const setSky = (n) => { night = n; const sky = n ? 0x0b1424 : 0xa9c3da; scene.background = new T.Color(sky); scene.fog.color.set(sky); L.h.intensity = n ? .45 : .55; L.s.intensity = n ? .25 : 1.25; };
  const S = {
    scene,
    labels() {
      if (anim === "miqat") return MIQ.map(([n, la, lo]) => [n, V(FX(lo), 18, FZ(la))]).concat([["মক্কা", V(0, 24, 0)], ["জেদ্দা বিমানবন্দর", V(jed[0], 8, jed[1])], ["তানঈম (মসজিদে আয়েশা) মক্কার ভেতরেই", V(-3, 34, -6)]]);
      const L2 = [["মসজিদুল হারাম", V(W.haram[0], 28, W.haram[1])], ["মিনা", V(W.mina[0], 10, W.mina[1])], ["জামারাত", V(W.jamarat[0], 20, W.jamarat[1])], ["মুযদালিফা", V(W.muzd[0], 10, W.muzd[1])], ["মাশআরুল হারাম", V(W.mashar[0], 12, W.mashar[1])], ["মসজিদে নামিরা", V(W.namirah[0], 14, W.namirah[1])], ["আরাফাত", V(W.arafat[0] + 30, 10, W.arafat[1] - 25)], ["জাবালে রহমত", V(W.rahmah[0] + 4, 15, W.rahmah[1] + 4)]];
      if (anim === "jamarat10" || anim === "tashriq") pillars.forEach((p, i) => L2.push([p.name, pillarWorld(i).add(V(0, 12, 0))]));
      if (anim === "sacrifice") L2.push(["কুরবানির জায়গা (আনুমানিক)", V(W.slaughter[0], 10, W.slaughter[1])]);
      return L2;
    },
    play(an) {
      anim = an; t0 = performance.now(); pebbles.forEach(p => p.visible = false);
      const isFar = an === "miqat";
      far.visible = isFar; local.visible = !isFar;
      scene.fog.near = isFar ? 2000 : 700; scene.fog.far = isFar ? 4000 : 1600;
      setSky(an === "muzdalifah");
      const D = {
        makkah: { seg: [0, 0], cam: { at: W.haram, dist: 110, pitch: .6, yaw: 2.2 } },
        mina8: { seg: [0, U.mina], cam: { at: W.mina, dist: 260, pitch: .7, yaw: 2.0 } },
        arafat: { seg: [U.mina, 1], cam: { at: W.arafat, dist: 260, pitch: .65, yaw: 2.4 } },
        namirah: { seg: [U.namirah, U.namirah], cam: { at: W.namirah, dist: 70, pitch: .5, yaw: 2.0 } },
        muzdalifah: { seg: [1, U.muzd], cam: { at: W.muzd, dist: 200, pitch: .7, yaw: 2.2 } },
        jamarat10: { seg: [U.muzd, U.jamarat], cam: { at: W.jamarat, dist: 80, pitch: .85, yaw: 1.9 } },
        sacrifice: { seg: [U.jamarat, U.jamarat], cam: { at: W.slaughter, dist: 90, pitch: .6, yaw: 2.0 } },
        ifadah: { seg: [U.jamarat, 0], cam: { at: W.haram, dist: 220, pitch: .7, yaw: 1.8 } },
        tashriq: { seg: [U.mina, U.jamarat], cam: { at: W.jamarat, dist: 80, pitch: .85, yaw: 1.5 } },
        wada: { seg: [U.mina, 0], cam: { at: W.haram, dist: 120, pitch: .6, yaw: 2.4 } },
        miqat: { seg: [0, 0], cam: { at: [40, -40], dist: 760, pitch: 1.05, yaw: 1.57 } }
      }[an] || { seg: [0, 0], cam: { at: W.haram, dist: 120, pitch: .6, yaw: 2 } };
      seg = D.seg; focus = D.cam;
      camTo({ tx: D.cam.at[0], ty: 0, tz: D.cam.at[1], dist: D.cam.dist, pitch: D.cam.pitch, yaw: D.cam.yaw, follow: null });
    },
    update(dt, t) {
      const k = (t - t0) / 1000;
      if (anim === "miqat") {
        const f = (k % 12) / 10, q = Math.min(1, f);
        plane.position.set(lerp(planeFrom[0], jed[0], q), 20, lerp(planeFrom[1], jed[1], q));
        plane.rotation.y = Math.atan2(-(jed[1] - planeFrom[1]), jed[0] - planeFrom[0]) + Math.PI / 2;
        caption("মীকাত", "বাংলাদেশ থেকে জেদ্দাগামী বিমান সাধারণত কারনুল মানাযিল বা ইয়ালামলামের সীমা পার হয়। বিমানে ঘোষণা দেওয়ার আগেই ইহরাম বেঁধে নিয়ত করুন। মক্কায় থাকলে উমরাহর জন্য তানঈম (মসজিদে আয়েশা) বা জিরানা যান।");
        return;
      }
      const dur = 8, f = Math.min(1, (k % (dur + 3)) / dur);
      const u = lerp(seg[0], seg[1], f);
      const p = curve.getPointAt(Math.max(0, Math.min(1, u)));
      marker.position.set(p.x, p.y, p.z);
      const shown = Math.max(seg[0], seg[1], u);
      tube.geometry.setDrawRange(0, Math.floor(tubeIdx * Math.max(.002, shown)));
      mball.scale.setScalar(1 + Math.sin(t / 200) * .15);
      const txt = {
        makkah: ["মসজিদুল হারাম", "মক্কায় পৌঁছে প্রথমে উমরাহ (তামাত্তু হলে)। তারপর ৮ জিলহজ পর্যন্ত হোটেলে থেকে নফল ইবাদত।"],
        mina8: ["৮ জিলহজ: মিনায়", "ইহরাম বেঁধে হজের নিয়ত করে মিনায় যান। যোহর, আসর, মাগরিব, এশা ও পরদিন ফজর মিনায় পড়ুন, রাতে মিনায় থাকুন।"],
        arafat: ["৯ জিলহজ: আরাফাত", "সূর্যোদয়ের পর আরাফাতে যান। দুপুর থেকে সূর্যাস্ত পর্যন্ত আরাফাতে অবস্থান, এটাই হজের মূল রুকন। বেশি বেশি দোয়া ও যিকির।"],
        namirah: ["মসজিদে নামিরা", "ইমামের খুতবা ও যোহর-আসর একসাথে। মসজিদের সামনের অংশ আরাফাতের সীমার বাইরে, তাই সীমার সাইনবোর্ড দেখে ভেতরে থাকুন।"],
        muzdalifah: ["১০ জিলহজের রাত: মুযদালিফা", "সূর্যাস্তের পর আরাফাত থেকে মুযদালিফায় এসে মাগরিব ও এশা একসাথে। খোলা আকাশের নিচে রাত, পাথর কুড়ানো, ফজরের পর অবস্থান ও দোয়া।"],
        jamarat10: ["১০ জিলহজ: বড় জামারায় পাথর", "শুধু বড় জামারা (আকাবা), যেটা মক্কার দিকে। একটি একটি করে ৭টি পাথর, প্রতিটিতে “আল্লাহু আকবার”। প্রথম পাথরে তালবিয়া বন্ধ।"],
        sacrifice: ["১০ জিলহজ: কুরবানি", "তামাত্তু ও কিরান হজে কুরবানি ওয়াজিব। সাধারণত ব্যাংক বা অফিশিয়াল কুপনের মাধ্যমে দেওয়া হয়; কুরবানি হয়ে গেছে নিশ্চিত হয়ে তারপর মাথা মুণ্ডন।"],
        ifadah: ["তাওয়াফে যিয়ারত (ইফাদা)", "মক্কায় গিয়ে হজের ফরজ তাওয়াফ, তারপর তামাত্তুর জন্য সাঈ। ১২ জিলহজ সূর্যাস্তের আগে করা উত্তম (হানাফি মতে ওয়াজিব সময়)।"],
        tashriq: ["১১–১৩ জিলহজ: তিন জামারা", "দুপুরের পর প্রথমে ছোট, তারপর মধ্যম, শেষে বড় জামারায় ৭টি করে পাথর। প্রথম দুটির পর কিবলামুখী হয়ে দীর্ঘ দোয়া, তৃতীয়টির পর নয়।"],
        wada: ["বিদায়ী তাওয়াফ", "মক্কা ছাড়ার আগে শেষ কাজ বিদায়ী তাওয়াফ। ঋতুবতী মহিলাদের জন্য এটা মাফ।"]
      }[anim];
      if (txt) caption(txt[0], txt[1]);
      if (anim === "jamarat10" || anim === "tashriq") {
        const order = anim === "jamarat10" ? [0] : [2, 1, 0];
        const per = 7 * .6 + 1.2, kk = k % (order.length * per + 1);
        const which = Math.min(order.length - 1, Math.floor(kk / per)), within = kk - which * per;
        const tgt = pillarWorld(order[which]);
        const from = tgt.clone().add(V(Math.sin(jDir) * 6, 6, Math.cos(jDir) * 6));
        marker.position.copy(from).add(V(0, -5, 0));
        pebbles.forEach((pb, i) => {
          const s0 = i * .6, q = (within - s0) / .5;
          pb.visible = q > 0 && q < 1;
          if (pb.visible) pb.position.set(lerp(from.x, tgt.x, q), lerp(from.y, tgt.y, q) + Math.sin(q * Math.PI) * 3, lerp(from.z, tgt.z, q));
        });
        const thrown = Math.max(0, Math.min(7, Math.floor(within / .6) + 1));
        if (anim === "tashriq") caption("১১–১৩ জিলহজ: তিন জামারা", `এখন ${pillars[order[which]].name} জামারা। ৭টি পাথর, প্রতিটিতে “আল্লাহু আকবার”।${which < 2 ? " শেষে একপাশে সরে কিবলামুখী হয়ে দোয়া।" : " এর পর দোয়ার জন্য দাঁড়াবেন না।"}`, `পাথর ${"০১২৩৪৫৬৭"[thrown]} / ৭`);
        else caption(txt[0], txt[1], `পাথর ${"০১২৩৪৫৬৭"[thrown]} / ৭`);
      }
    }
  };
  return S;
};

/* ===================== MASJID AN-NABAWI ===================== */
scenes.nabawi = function () {
  const scene = new T.Scene();
  const L = lights(scene, 0x9fbad3, .55, 1.15);
  scene.fog = new T.Fog(0x9fbad3, 300, 700);
  // z+ is south (the qiblah in Madinah), x+ is east
  const ground = new T.Mesh(new T.PlaneGeometry(420, 360), new T.MeshStandardMaterial({ map: H3.canvasTex(1024, 1024, (x, w) => { x.fillStyle = "#d8d1c2"; x.fillRect(0, 0, w, w); x.strokeStyle = "rgba(100,85,60,.3)"; for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, w); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } }), roughness: .5 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(30, 0, 0); scene.add(ground);
  const wallM = std(0xece4d2, { roughness: .6 }), trimM = std(0xc8a96a, { metalness: .4, roughness: .45 });
  const BW = 100, BD = 140;
  // outer walls with gate arches
  const walls = new T.Group(); scene.add(walls);
  for (const [w, d, x, z] of [[BW, 1.5, 0, -BD / 2], [BW, 1.5, 0, BD / 2], [1.5, BD, -BW / 2, 0], [1.5, BD, BW / 2, 0]]) {
    const m = new T.Mesh(new T.BoxGeometry(w, 12, d), wallM); m.position.set(x, 6, z); walls.add(m);
  }
  const archM = std(0x5d4a2e);
  for (let x = -BW / 2 + 6; x < BW / 2; x += 8) for (const z of [-BD / 2 - .8, BD / 2 + .8]) { const a = new T.Mesh(new T.BoxGeometry(3, 6, .2), archM); a.position.set(x, 3, z); walls.add(a); }
  for (let z = -BD / 2 + 6; z < BD / 2; z += 8) for (const x of [-BW / 2 - .8, BW / 2 + .8]) { const a = new T.Mesh(new T.BoxGeometry(.2, 6, 3), archM); a.position.set(x, 3, z); walls.add(a); }
  // roof with small sliding domes; the old part (south-east) can be opened to look inside
  const roofMain = new T.Group(), roofOld = new T.Group(); scene.add(roofMain, roofOld);
  const OLD = { x0: -20, x1: 30, z0: 40, z1: 70 };
  const inOld = (x, z) => x > OLD.x0 && x < OLD.x1 && z > OLD.z0 && z < OLD.z1;
  const slabM = std(0xe2dccf, { roughness: .6 });
  for (let x = -BW / 2; x < BW / 2; x += 10) for (let z = -BD / 2; z < BD / 2; z += 10) {
    const s = new T.Mesh(new T.BoxGeometry(10, .8, 10), slabM); s.position.set(x + 5, 12.4, z + 5);
    (inOld(x + 5, z + 5) ? roofOld : roofMain).add(s);
  }
  const domeG = new T.SphereGeometry(2.6, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), domeM = std(0xb9ae94, { roughness: .5 });
  for (let x = -BW / 2 + 8; x < BW / 2; x += 14) for (let z = -BD / 2 + 8; z < BD / 2; z += 14) { const d = new T.Mesh(domeG, domeM); d.position.set(x, 12.8, z); (inOld(x, z) ? roofOld : roofMain).add(d); }
  // interior of the old mosque: carpet, columns, Rawdah, minbar, mihrab, the blessed chamber
  const inside = new T.Group(); scene.add(inside);
  const carpet = new T.Mesh(new T.PlaneGeometry(OLD.x1 - OLD.x0, OLD.z1 - OLD.z0), std(0x9b1f2b, { roughness: 1 })); carpet.rotation.x = -Math.PI / 2; carpet.position.set((OLD.x0 + OLD.x1) / 2, .05, (OLD.z0 + OLD.z1) / 2); inside.add(carpet);
  const RAW = { x0: -2, x1: 12, z0: 58, z1: 67 };
  const rawdah = new T.Mesh(new T.PlaneGeometry(RAW.x1 - RAW.x0, RAW.z1 - RAW.z0), new T.MeshStandardMaterial({ color: 0x2f8f55, roughness: 1, emissive: 0x0a2a14 }));
  rawdah.rotation.x = -Math.PI / 2; rawdah.position.set((RAW.x0 + RAW.x1) / 2, .07, (RAW.z0 + RAW.z1) / 2); inside.add(rawdah);
  const colG = new T.CylinderGeometry(.45, .5, 12, 10), colIn = std(0xf2ede2, { roughness: .4 }), capG = new T.CylinderGeometry(.58, .48, .5, 10);
  for (let x = OLD.x0 + 3; x < OLD.x1; x += 5) for (let z = OLD.z0 + 3; z < OLD.z1 - 4; z += 5) {
    if (x > 13 && z > 55) continue;
    const c = new T.Mesh(colG, colIn); c.position.set(x, 6, z); inside.add(c);
    const cp = new T.Mesh(capG, trimM); cp.position.set(x, 11.7, z); inside.add(cp);
  }
  const minbar = new T.Mesh(new T.BoxGeometry(1.4, 4, 4), std(0xf3f0e6)); minbar.position.set(-2.5, 2, 63); inside.add(minbar);
  const mihrab = new T.Mesh(new T.BoxGeometry(3, 6, .6), trimM); mihrab.position.set(5, 3, 69.3); inside.add(mihrab);
  const grill = H3.canvasTex(512, 256, (x, w, h) => { x.fillStyle = "#1f5f3c"; x.fillRect(0, 0, w, h); x.strokeStyle = "#e3c062"; x.lineWidth = 6; for (let i = 0; i < w; i += 32) for (let j = 0; j < h; j += 32) { x.beginPath(); x.arc(i + 16, j + 16, 11, 0, 6.28); x.stroke(); } x.fillStyle = "#e3c062"; for (const cx of [128, 256, 384]) { x.beginPath(); x.arc(cx, 120, 16, 0, 6.28); x.fill(); } });
  const HUJ = { x: 19, z: 62, w: 10, d: 11 };
  const huj = new T.Mesh(new T.BoxGeometry(HUJ.w, 8, HUJ.d), new T.MeshStandardMaterial({ map: grill, metalness: .3, roughness: .5 })); huj.position.set(HUJ.x, 4, HUJ.z); inside.add(huj);
  const greenDome = new T.Group(); greenDome.position.set(HUJ.x, 13, HUJ.z); scene.add(greenDome);
  const gdM = std(0x1f8a4c, { roughness: .45, metalness: .2 });
  const drum = new T.Mesh(new T.CylinderGeometry(4.2, 4.6, 3, 24), gdM); drum.position.y = 1.5; greenDome.add(drum);
  const gd = new T.Mesh(new T.SphereGeometry(4.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gdM); gd.position.y = 3; gd.scale.y = 1.35; greenDome.add(gd);
  const fin = new T.Mesh(new T.CylinderGeometry(.12, .12, 3, 8), trimM); fin.position.y = 9.4; greenDome.add(fin);
  // minarets
  const minPos = [[-BW / 2, -BD / 2], [BW / 2, -BD / 2], [-BW / 2, BD / 2], [BW / 2, BD / 2], [0, -BD / 2], [-BW / 2, 0], [BW / 2, 0], [-30, BD / 2], [34, BD / 2]];
  for (const [x, z] of minPos) {
    const g = new T.Group(); g.position.set(x, 0, z);
    const s1 = new T.Mesh(new T.CylinderGeometry(1.6, 1.9, 30, 12), wallM); s1.position.y = 15; g.add(s1);
    const b1 = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 1, 12), trimM); b1.position.y = 30; g.add(b1);
    const s2 = new T.Mesh(new T.CylinderGeometry(1.2, 1.4, 14, 12), wallM); s2.position.y = 37.5; g.add(s2);
    const b2 = new T.Mesh(new T.CylinderGeometry(2, 2, .8, 12), trimM); b2.position.y = 44.8; g.add(b2);
    const tip = new T.Mesh(new T.ConeGeometry(1.2, 6, 12), std(0xd4af37, { metalness: .8, roughness: .3 })); tip.position.y = 48.5; g.add(tip);
    scene.add(g);
  }
  // the big umbrellas in the courtyards
  const umbG = new T.ConeGeometry(8.2, 2.6, 4, 1, true); umbG.rotateY(Math.PI / 4); umbG.translate(0, 14.5, 0);
  const poleG = new T.CylinderGeometry(.35, .45, 14, 8); poleG.translate(0, 7, 0);
  const pts = [];
  for (let x = -160; x <= 170; x += 15) for (let z = -150; z <= 150; z += 15) {
    if (x > -BW / 2 - 6 && x < BW / 2 + 6 && z > -BD / 2 - 6 && z < BD / 2 + 6) continue;
    if (x > 95) continue;
    pts.push([x, z]);
  }
  const umb = new T.InstancedMesh(umbG, new T.MeshStandardMaterial({ color: 0xfbfaf5, roughness: .8, side: T.DoubleSide }), pts.length);
  const poles = new T.InstancedMesh(poleG, std(0xd8d2c2), pts.length);
  const M = new T.Matrix4(), Q = new T.Quaternion(), Pv = new T.Vector3(), Sv = new T.Vector3(1, 1, 1);
  const setUmb = open => { pts.forEach(([x, z], i) => { Pv.set(x, 0, z); Sv.set(open, 1, open); M.compose(Pv, Q, Sv); umb.setMatrixAt(i, M); Sv.set(1, 1, 1); M.compose(Pv, Q, Sv); poles.setMatrixAt(i, M); }); umb.instanceMatrix.needsUpdate = poles.instanceMatrix.needsUpdate = true; };
  setUmb(1); scene.add(umb, poles);
  // Jannat al-Baqi to the east
  const BQ = { x0: 118, x1: 175, z0: -10, z1: 45 };
  const baqi = new T.Mesh(new T.PlaneGeometry(BQ.x1 - BQ.x0, BQ.z1 - BQ.z0), std(0xb9a98c, { roughness: 1 })); baqi.rotation.x = -Math.PI / 2; baqi.position.set((BQ.x0 + BQ.x1) / 2, .06, (BQ.z0 + BQ.z1) / 2); scene.add(baqi);
  for (const [w, d, x, z] of [[BQ.x1 - BQ.x0, .8, (BQ.x0 + BQ.x1) / 2, BQ.z0], [BQ.x1 - BQ.x0, .8, (BQ.x0 + BQ.x1) / 2, BQ.z1], [.8, BQ.z1 - BQ.z0, BQ.x0, (BQ.z0 + BQ.z1) / 2], [.8, BQ.z1 - BQ.z0, BQ.x1, (BQ.z0 + BQ.z1) / 2]]) { const m = new T.Mesh(new T.BoxGeometry(w, 3, d), wallM); m.position.set(x, 1.5, z); scene.add(m); }
  const graves = new T.InstancedMesh(new T.BoxGeometry(.6, .35, 1.4), std(0x8f8170), 700);
  for (let i = 0; i < 700; i++) { Pv.set(BQ.x0 + 3 + Math.random() * (BQ.x1 - BQ.x0 - 6), .18, BQ.z0 + 3 + Math.random() * (BQ.z1 - BQ.z0 - 6)); M.compose(Pv, Q, Sv); graves.setMatrixAt(i, M); }
  scene.add(graves);
  // people in the courtyards
  const MAXP = 900;
  const bodyG = new T.CylinderGeometry(.19, .27, 1.3, 7); bodyG.translate(0, .65, 0);
  const crowd = new T.InstancedMesh(bodyG, std(0xffffff, { roughness: .9 }), MAXP);
  const ag = []; const col = new T.Color();
  for (let i = 0; i < MAXP; i++) { crowd.setColorAt(i, col.set(Math.random() < .35 ? 0x161616 : Math.random() < .7 ? 0xf6f6f2 : 0x7189a8)); const p = pts[(Math.random() * pts.length) | 0]; ag.push({ x: p[0] + (Math.random() - .5) * 12, z: p[1] + (Math.random() - .5) * 12, a: Math.random() * 6.28, sp: .6 + Math.random() }); }
  scene.add(crowd);
  const av = avatar(scene, { kind: "thobe" });
  const GATES = { salam: [-BW / 2, 64], jibril: [BW / 2, 56], baqi: [BW / 2, 67], makkah37: [14, BD / 2], fahd: [0, -BD / 2], abdulaziz: [-BW / 2, 20], umar: [BW / 2, 10] };
  let anim = "overview", t0 = 0, path = [], pi = 0, stopUntil = 0;
  const salamStops = [{ x: HUJ.x - 3, label: "নবীজি ﷺ-কে সালাম" }, { x: HUJ.x - 1.2, label: "আবু বকর (রা.)-কে সালাম" }, { x: HUJ.x + .6, label: "উমর (রা.)-কে সালাম" }];
  const S = {
    scene,
    labels() {
      const out = [["সবুজ গম্বুজ", V(HUJ.x, 24, HUJ.z)], ["জান্নাতুল বাকি", V((BQ.x0 + BQ.x1) / 2, 6, (BQ.z0 + BQ.z1) / 2)]];
      if (anim === "gates" || anim === "overview" || anim === "enter" || anim === "salam") out.push(["১ বাবুস সালাম", V(GATES.salam[0] - 2, 14, GATES.salam[1])], ["৪০ বাবে জিবরিল", V(GATES.jibril[0] + 2, 14, GATES.jibril[1])], ["৪১ বাবুল বাকি", V(GATES.baqi[0] + 2, 18, GATES.baqi[1])]);
      if (anim === "gates" || anim === "overview") out.push(["২১ বাদশাহ ফাহদ গেট", V(GATES.fahd[0], 14, GATES.fahd[1] - 2)], ["উত্তর", V(0, 2, -BD / 2 - 30)], ["কিবলা (দক্ষিণ)", V(0, 2, BD / 2 + 30)]);
      if (anim === "rawdah" || anim === "gates") out.push(["৩৭ বাবে মক্কা (রওজার লাইন)", V(GATES.makkah37[0], 14, GATES.makkah37[1] + 2)]);
      if (anim === "rawdah" || anim === "salam") out.push(["রিয়াদুল জান্নাহ (সবুজ কার্পেট)", V((RAW.x0 + RAW.x1) / 2, 4, (RAW.z0 + RAW.z1) / 2)], ["মিম্বর", V(-2.5, 5.5, 63)], ["রওজা মোবারক (হুজরা)", V(HUJ.x, 10, HUJ.z)]);
      return out;
    },
    play(an) {
      anim = an; t0 = performance.now(); pi = 0; stopUntil = 0; av.trail(false); av.p.pose("none");
      const open = an === "rawdah" || an === "salam";
      roofOld.visible = !open; greenDome.visible = !open; inside.visible = true;
      av.g.visible = an !== "gates" && an !== "overview";
      if (an === "enter") { path = [[-90, 64], [GATES.salam[0] - 2.5, 64]]; av.at(-90, 64); }
      else if (an === "rawdah") { path = [[-6, 66], [4, 62]]; av.at(-6, 66); }
      else if (an === "salam") { path = [[-16, 68.4], [HUJ.x - 6, 68.4], [salamStops[0].x, 68.4], [salamStops[1].x, 68.4], [salamStops[2].x, 68.4], [GATES.baqi[0] - 1, 68.4], [GATES.baqi[0] + 8, 68.4]]; av.at(path[0][0], path[0][1]); }
      else if (an === "baqi") { path = [[BQ.x0 - 8, 20], [BQ.x0 + 4, 20]]; av.at(BQ.x0 - 8, 20); }
      const C = {
        overview: { at: [20, 0], dist: 330, pitch: .75, yaw: 2.2 }, gates: { at: [0, 0], dist: 300, pitch: 1.35, yaw: 1.57 },
        enter: { at: [-55, 64], dist: 48, pitch: .5, yaw: 2.7 }, rawdah: { at: [8, 63], dist: 34, pitch: 1.05, yaw: Math.PI + .35 },
        salam: { at: [HUJ.x - 10, 65], dist: 52, pitch: 1.05, yaw: Math.PI + .25 }, baqi: { at: [(BQ.x0 + BQ.x1) / 2, 18], dist: 120, pitch: .7, yaw: 2.4 }
      }[an] || { at: [0, 0], dist: 300, pitch: .8, yaw: 2 };
      camTo({ tx: C.at[0], ty: 0, tz: C.at[1], dist: C.dist, pitch: C.pitch, yaw: C.yaw, follow: an === "enter" ? av : null });
      setUmb(an === "overview" || an === "enter" ? 0 : 1);
    },
    update(dt, t) {
      const k = (t - t0) / 1000;
      if (anim === "overview") setUmb(Math.min(1, Math.max(0, (k - 1) / 4)));
      for (let i = 0; i < MAXP; i++) { const g = ag[i]; g.a += (Math.random() - .5) * dt; g.x += Math.cos(g.a) * g.sp * dt; g.z += Math.sin(g.a) * g.sp * dt; Pv.set(g.x, 0, g.z); M.compose(Pv, Q, Sv); crowd.setMatrixAt(i, M); }
      crowd.instanceMatrix.needsUpdate = true;
      av.tick(t);
      if (path.length && pi < path.length && t > stopUntil) {
        const [x, z] = path[pi];
        if (walkTo(av, x, z, anim === "enter" ? 4 : 1.6, dt, t)) {
          if (anim === "salam" && pi >= 2 && pi <= 4) { stopUntil = t + 3800; av.faceTo(av.g.position.x, HUJ.z); }
          pi++;
          if (pi >= path.length) setTimeout(() => active === S && S.play(anim), 3000);
        }
        av.trail(true);
      }
      if (t < stopUntil && anim === "salam") av.p.pose("none");
      const txt = {
        overview: ["মসজিদে নববী", "দক্ষিণ দিক কিবলা। সবুজ গম্বুজের নিচে নবীজি ﷺ-এর রওজা মোবারক, পাশে আবু বকর ও উমর (রা.)। পূর্ব দিকে জান্নাতুল বাকি।"],
        gates: ["গেটগুলো", "সালাম দিতে গেট ১ (বাবুস সালাম) দিয়ে ঢুকে কিবলার দেয়াল ধরে পূর্ব দিকে এগোতে হয়, বের হতে হয় গেট ৪১ (বাবুল বাকি) দিয়ে। রওজায় (রিয়াদুল জান্নাহ) যাওয়ার লাইন গেট ৩৭-এর সামনের চত্বর থেকে। নম্বর মসজিদের সাইনে লেখা থাকে।"],
        enter: ["মসজিদে প্রবেশ", "ডান পা দিয়ে ঢুকুন, দরুদ ও প্রবেশের দোয়া পড়ুন, তারপর দুই রাকাত তাহিয়্যাতুল মসজিদ।"],
        rawdah: ["রিয়াদুল জান্নাহ", "নবীজি ﷺ-এর ঘর ও মিম্বরের মাঝের জায়গা জান্নাতের বাগানের একটি অংশ (বুখারি, মুসলিম)। এখন নুসুক অ্যাপে সময় বুক করে যেতে হয়। ভেতরে দুই রাকাত নফল ও দোয়া, অল্প সময়।"],
        salam: ["রওজা মোবারকে সালাম", "কিবলার দেয়াল ধরে লাইনে এগিয়ে প্রথম জালির সামনে নবীজি ﷺ-কে, একটু ডানে আবু বকর (রা.)-কে, আরও একটু ডানে উমর (রা.)-কে সালাম দিন। নিচু স্বরে, না থেমে। তারপর বাবুল বাকি দিয়ে বের হন।"],
        baqi: ["জান্নাতুল বাকি", "মদিনার প্রধান কবরস্থান: উসমান (রা.), নবী-পরিবারের অনেকে ও হাজারো সাহাবি। কবর জিয়ারতের দোয়া পড়ুন। পুরুষদের জন্য সাধারণত ফজরের পর থেকে সকাল ৮টা আর আসরের পর প্রায় এক ঘণ্টা খোলা থাকে; মহিলাদের সাধারণত ভেতরে যেতে দেওয়া হয় না।"]
      }[anim];
      if (txt) {
        let line = txt[1];
        if (anim === "salam" && t < stopUntil) { const st = salamStops[Math.max(0, Math.min(2, pi - 3))]; line = st.label + ": “আসসালামু আলাইকা…” নিচু স্বরে।"; }
        caption(txt[0], line);
      }
    }
  };
  return S;
};

/* ===================== player ===================== */
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.1, (t - last) / 1000); last = t;
  if (!active) return;
  if (playing) active.update(dt, t);
  const k = Math.min(1, dt * 2.2);
  const userRecent = performance.now() - userAt < 7000;
  if (want.follow) { want.tx = want.follow.g.position.x; want.ty = 1.5; want.tz = want.follow.g.position.z; }
  target.x = lerp(target.x, want.tx, k); target.y = lerp(target.y, want.ty || 0, k); target.z = lerp(target.z, want.tz, k);
  if (!userRecent) { view.yaw = angLerp(view.yaw, want.yaw, k * .6); view.pitch = lerp(view.pitch, want.pitch, k * .6); view.dist = lerp(view.dist, want.dist, k * .6); }
  cam.position.set(target.x + view.dist * Math.cos(view.pitch) * Math.cos(view.yaw), target.y + view.dist * Math.sin(view.pitch), target.z + view.dist * Math.cos(view.pitch) * Math.sin(view.yaw));
  cam.lookAt(target.x, target.y, target.z);
  renderer.render(active.scene, cam);
  if (active.occ && (++occN % 8 === 0)) occlude();
  labels.update(cam);
}
let occN = 0, labelList = [];
const _ray = { o: null, d: null };
function hitBox(o, d, b, maxT) {
  let t0 = 0, t1 = maxT;
  for (let k = 0; k < 3; k++) {
    const oo = [o.x, o.y, o.z][k], dd = [d.x, d.y, d.z][k], lo = b[k], hi = b[k + 3];
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return false; continue; }
    let a = (lo - oo) / dd, c = (hi - oo) / dd; if (a > c) { const tmp = a; a = c; c = tmp; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return false;
  }
  return true;
}
function occlude() {
  for (const L of labelList) {
    const d = L.v.clone().sub(cam.position), len = d.length(); d.divideScalar(len);
    L.on = !active.occ.some(b => hitBox(cam.position, d, b, len - .5));
  }
}
function resize() {
  if (!mounted) return;
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
  cam.aspect = w / h; cam.updateProjectionMatrix();
}
G.mount = function (el) {
  T = window.THREE; H3 = window.Haram3D;
  if (!T || !H3) { el.insertAdjacentHTML("beforeend", '<p class="loading">৩ডি দেখানো যাচ্ছে না। ' + (!T ? "three.min.js" : "haram3d.js") + ' ফাইলটি পাওয়া যায়নি। অ্যাপ বা পাতা নতুন করে হালনাগাদ করুন।</p>'); return false; }
  if (mounted) return true;
  host = el; renderer = H3.setupRenderer(host); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  cam = new T.PerspectiveCamera(42, 1, .1, 3000);
  labels = H3.labels(host);
  H3.orbit(renderer.domElement, view, () => { userAt = performance.now(); });
  addEventListener("resize", resize);
  mounted = true; resize();
  return true;
};
G.play = function (name, anim) {
  if (!mounted) return;
  if (!scenes[name]) return;
  if (typeof scenes[name] === "function") scenes[name] = scenes[name]();
  const S = scenes[name];
  const first = active !== S;
  active = S; playing = true; userAt = -1e9;
  S.play(anim);
  labels.clear(); labelList = (S.labels ? S.labels() : []).map(([t, v]) => labels.add(t, v));
  if (first) { target.x = want.tx; target.y = want.ty || 0; target.z = want.tz; view.yaw = want.yaw; view.pitch = want.pitch; view.dist = want.dist * 1.25; }
  resize();
  cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame);
};
G.pause = function (p) { playing = !p; };
G.stop = function () { cancelAnimationFrame(raf); };
G.resume = function () { if (active) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); } };
G.resize = resize;
window.Guide3D = G;
})();
