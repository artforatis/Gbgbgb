/* Shared 3D building blocks (three.js r149): the Mataf with the Kaaba, the moving crowd,
   and a pilgrim figure that can wear ihram, show idtiba, walk, raise a hand and pray.
   Units are metres. In the Mataf: the door is on the +x face, the Black Stone on the +x/+z corner,
   the Hateem on the -z side, Rukn Yamani on the -x/+z corner. Tawaf moves with the angle increasing
   (x = r cos a, z = -r sin a), which is counter-clockwise seen from above, Kaaba on the left. */
(function () {
"use strict";
const H3 = {};
const T = () => window.THREE;

H3.canvasTex = function (w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new (T().CanvasTexture)(c); t.anisotropy = 4; t.encoding = T().sRGBEncoding;
  return t;
};
H3.setupRenderer = function (host, opts) {
  const THREE = T();
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, (opts && opts.maxDpr) || 1.75));
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  host.appendChild(r.domElement);
  return r;
};

/* ---------------- Mataf environment ---------------- */
H3.KAABA = { BS: [6.05, 1.6, 5.55], YAMANI: [-6.05, 1.6, 5.55], DOOR: [6.02, 4.0, 2.4], MAQAM: [14, 0, 2.4], HATEEM_A: Math.PI / 2 };
H3.matafEnv = function (scene, opt) {
  const THREE = T(); opt = opt || {};
  const out = {};
  const floorTex = H3.canvasTex(1024, 1024, (x, w) => {
    x.fillStyle = "#f7f7f4"; x.fillRect(0, 0, w, w);
    x.strokeStyle = "rgba(150,145,130,.22)"; x.lineWidth = 2;
    for (let r = 30; r < 520; r += 22) { x.beginPath(); x.arc(512, 512, r, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 96; a++) { x.beginPath(); x.moveTo(512 + 30 * Math.cos(a / 96 * 6.283), 512 + 30 * Math.sin(a / 96 * 6.283)); x.lineTo(512 + 520 * Math.cos(a / 96 * 6.283), 512 + 520 * Math.sin(a / 96 * 6.283)); x.stroke(); }
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(95, 128), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .35, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // the brown marble line that marks the start of tawaf (in line with the Black Stone) — shown green-lit here
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(36, .45), new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: .0 }));
  startLine.rotation.x = -Math.PI / 2; startLine.rotation.z = Math.atan2(5.55, 6.05);
  const dir = new THREE.Vector3(6.05, 0, 5.55).normalize();
  startLine.position.set(dir.x * 26, .03, dir.z * 26); scene.add(startLine);
  out.startLine = startLine;

  const kiswaTex = H3.canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = "#060606"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(255,255,255,.045)"; x.lineWidth = 3;
    for (let y = 30; y < h; y += 46) for (let i = 0; i < w; i += 60) { x.beginPath(); x.moveTo(i, y); x.bezierCurveTo(i + 15, y - 18, i + 35, y + 18, i + 52, y); x.stroke(); }
    const by = 250, bh = 110;
    const gg = x.createLinearGradient(0, by, 0, by + bh); gg.addColorStop(0, "#8a6a26"); gg.addColorStop(.5, "#e7c66f"); gg.addColorStop(1, "#8a6a26");
    x.fillStyle = gg; x.fillRect(0, by, w, bh);
    x.fillStyle = "#060606"; x.fillRect(0, by + 10, w, bh - 20);
    x.strokeStyle = "#e2bf63"; x.lineWidth = 5;
    for (let i = 0; i < w; i += 14) { x.beginPath(); x.moveTo(i, by + 22 + (i * 37 % 40)); x.quadraticCurveTo(i + 7, by + 30, i + 12, by + bh - 24 - (i * 13 % 30)); x.stroke(); }
    for (let i = 70; i < w; i += 220) {
      x.fillStyle = "#c9a24a"; x.fillRect(i, by + bh + 40, 70, 90);
      x.fillStyle = "#060606"; x.fillRect(i + 8, by + bh + 48, 54, 74);
      x.strokeStyle = "#e2bf63"; x.lineWidth = 3; for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(i + 14, by + bh + 58 + k * 13); x.lineTo(i + 56, by + bh + 58 + k * 13); x.stroke(); }
    }
  });
  const kiswa = new THREE.MeshStandardMaterial({ map: kiswaTex, roughness: .85 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: .9 });
  const kaaba = new THREE.Mesh(new THREE.BoxGeometry(12, 13.1, 11), [kiswa, kiswa, roofM, roofM, kiswa, kiswa]);
  kaaba.position.y = 6.75; scene.add(kaaba); out.kaaba = kaaba;
  const shadh = new THREE.Mesh(new THREE.BoxGeometry(12.9, .6, 11.9), new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: .4 }));
  shadh.position.y = .3; scene.add(shadh);
  const doorTex = H3.canvasTex(256, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#f3dc94"); g.addColorStop(.5, "#c9a24a"); g.addColorStop(1, "#8a6a26");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#6b4f17"; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 28); x.beginPath(); x.moveTo(w / 2, 14); x.lineTo(w / 2, h - 14); x.stroke();
    for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(w / 4, 60 + k * 72, 18, 0, 6.28); x.arc(3 * w / 4, 60 + k * 72, 18, 0, 6.28); x.stroke(); }
  });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.3), new THREE.MeshStandardMaterial({ map: doorTex, metalness: .6, roughness: .35, emissive: 0x2a1a00 }));
  door.position.set(6.02, 4.0, 2.4); door.rotation.y = Math.PI / 2; scene.add(door);
  const silver = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: .9, roughness: .25 });
  const stone = new THREE.Mesh(new THREE.TorusGeometry(.45, .14, 10, 24), silver);
  stone.position.set(6.05, 1.6, 5.55); stone.rotation.y = Math.PI / 4; scene.add(stone);
  const blackStone = new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: .5 }));
  blackStone.position.copy(stone.position); blackStone.scale.set(1, 1, .5); blackStone.rotation.y = Math.PI / 4; scene.add(blackStone);
  // Hateem
  const hm = new THREE.MeshStandardMaterial({ color: 0xfafaf6, roughness: .3 });
  const hGroup = new THREE.Group();
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI * i / 48, seg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, .9), hm);
    seg.position.set(7.8 * Math.cos(a), .65, -4.5 - 8.2 * Math.sin(a)); seg.rotation.y = -a + Math.PI / 2; hGroup.add(seg);
  }
  scene.add(hGroup);
  // Mizab (golden spout) over the Hateem side
  const mizab = new THREE.Mesh(new THREE.BoxGeometry(.35, .3, 1.6), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: .8, roughness: .3 }));
  mizab.position.set(0, 13.0, -6.2); scene.add(mizab);
  // Maqam Ibrahim
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: .85, roughness: .3, emissive: 0x1a1000 });
  const mq = new THREE.Group();
  const m1 = new THREE.Mesh(new THREE.CylinderGeometry(.8, .95, 2.0, 8), new THREE.MeshStandardMaterial({ color: 0xf0e2b0, metalness: .3, roughness: .2, transparent: true, opacity: .75 }));
  m1.position.y = 1.0; mq.add(m1);
  const m2 = new THREE.Mesh(new THREE.SphereGeometry(.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold); m2.position.y = 2.0; mq.add(m2);
  const m3 = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .6, 6), gold); m3.position.y = 3.0; mq.add(m3);
  const fp = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .5, 12), new THREE.MeshStandardMaterial({ color: 0x8a7a5a })); fp.position.y = .25; mq.add(fp);
  mq.position.set(14, 0, 2.4); scene.add(mq);
  // Zamzam water coolers near the edge of the Mataf
  const coolM = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, metalness: .4, roughness: .3 });
  out.zamzam = [];
  for (const a of [.2, 1.25, 2.6, 3.9, 5.1]) {
    const c = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 1.1, 14), coolM); b.position.y = .55; c.add(b);
    const tap = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .2), new THREE.MeshStandardMaterial({ color: 0x3b7bbf })); tap.position.set(0, .8, .36); c.add(tap);
    const x = 33 * Math.cos(a), z = -33 * Math.sin(a); c.position.set(x, 0, z); c.lookAt(0, 0, 0); scene.add(c);
    out.zamzam.push([x, z]);
  }
  // Ottoman portico around the Mataf
  const sx = 58, sz = 50, nP = 4.2;
  const ringPt = t => { const c = Math.cos(t), s = Math.sin(t); return [sx * Math.sign(c) * Math.pow(Math.abs(c), 2 / nP), sz * Math.sign(s) * Math.pow(Math.abs(s), 2 / nP)]; };
  const pts = []; let prev = ringPt(0), acc = 0; pts.push(prev);
  for (let t = 0; t < Math.PI * 2; t += .002) { const p = ringPt(t); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); if (acc >= 4.6) { pts.push(p); acc = 0; } prev = p; }
  const stoneM = new THREE.MeshStandardMaterial({ color: 0xe9e1cf, roughness: .7 });
  const pillar = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, .5, 7, 10), stoneM, pts.length);
  const dome = new THREE.InstancedMesh(new THREE.SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: .6 }), pts.length);
  const arch = new THREE.InstancedMesh(new THREE.TorusGeometry(2.3, .32, 6, 18, Math.PI), new THREE.MeshStandardMaterial({ color: 0xc8a96a, roughness: .5 }), pts.length);
  const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(4.8, 1.2, 5), stoneM, pts.length);
  const MM = new THREE.Matrix4(), QQ = new THREE.Quaternion(), PP = new THREE.Vector3(), SS = new THREE.Vector3(1, 1, 1), YUP = new THREE.Vector3(0, 1, 0);
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    QQ.setFromAxisAngle(YUP, -ang);
    PP.set(p[0], 3.5, p[1]); MM.compose(PP, QQ, SS); pillar.setMatrixAt(i, MM);
    PP.set(mid[0], 7, mid[1]); MM.compose(PP, QQ, SS); arch.setMatrixAt(i, MM);
    PP.set(mid[0], 8.6, mid[1]); MM.compose(PP, QQ, SS); beam.setMatrixAt(i, MM);
    PP.set(mid[0], 9.2, mid[1]); MM.compose(PP, QQ, SS); dome.setMatrixAt(i, MM);
  });
  scene.add(pillar, arch, beam, dome);
  const facadeTex = H3.canvasTex(2048, 256, (x, w, h) => {
    x.fillStyle = "#d9d2c0"; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 3; row++) for (let i = 0; i < w; i += 64) {
      const y = 20 + row * 80;
      x.fillStyle = "#fff6d8"; x.beginPath(); x.moveTo(i + 12, y + 60); x.lineTo(i + 12, y + 22); x.arc(i + 32, y + 22, 20, Math.PI, 0); x.lineTo(i + 52, y + 60); x.fill();
      x.fillStyle = "rgba(120,100,60,.35)"; x.fillRect(i + 12, y + 62, 40, 4);
    }
  });
  facadeTex.wrapS = THREE.RepeatWrapping; facadeTex.repeat.set(3, 1);
  const facade = new THREE.Mesh(new THREE.CylinderGeometry(92, 92, 34, 96, 1, true), new THREE.MeshStandardMaterial({ map: facadeTex, side: THREE.BackSide, emissive: 0x3a3426, roughness: .8 }));
  facade.position.y = 17; scene.add(facade);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  const poleM = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: .6, roughness: .4 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, x = 44 * Math.cos(a), z = 40 * Math.sin(a);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, 9, 6), poleM); pole.position.set(x, 4.5, z); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 8), lampM); lamp.position.set(x, 9.2, z); scene.add(lamp);
  }
  out.rMin = a => 9.6 + 8 * Math.pow(Math.max(0, Math.cos(a - H3.KAABA.HATEEM_A)), 2);
  return out;
};

/* ---------------- crowd of pilgrims (instanced) ---------------- */
H3.crowd = function (scene, MAX, rMin) {
  const THREE = T();
  const bodyG = new THREE.CylinderGeometry(.19, .27, 1.3, 7); bodyG.translate(0, .65, 0);
  const headG = new THREE.SphereGeometry(.13, 8, 6); headG.translate(0, 1.45, 0);
  const body = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ roughness: .9 }), MAX);
  const head = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: .8 }), MAX);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color(), ag = [];
  for (let i = 0; i < MAX; i++) {
    const r = Math.random(), kind = r < .56 ? "ihram" : r < .84 ? "abaya" : "other";
    body.setColorAt(i, col.set(kind === "ihram" ? [0xffffff, 0xf4f4f0, 0xeceae4][(Math.random() * 3) | 0] : kind === "abaya" ? [0x111111, 0x1b1b1f, 0x262626][(Math.random() * 3) | 0] : [0x4a6fa5, 0x8c6d4f, 0xa8a8a8, 0x2e7d5b, 0x7a3e3e, 0xd8c9a8][(Math.random() * 6) | 0]));
    head.setColorAt(i, col.set(kind === "abaya" ? 0x111111 : [0x3b2a20, 0x5a4030, 0x2a2420, 0xf0f0f0][(Math.random() * 4) | 0]));
    ag.push({ a: Math.random() * Math.PI * 2, u: Math.random(), sp: .7 + Math.random() * .6, ph: Math.random() * 6.28, r: 0, s: .9 + Math.random() * .22 });
  }
  scene.add(body, head);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  return {
    update(dt, t, cur, prayer, hateemOpen, speedMul) {
      const n = Math.round(Math.pow(cur, 1.15) * MAX), outer = 15 + cur * 30;
      body.count = head.count = n;
      for (let i = 0; i < n; i++) {
        const g = ag[i];
        let x, z, face;
        if (hateemOpen && i < 60) {
          z = -6.4 - g.u * 5.6;
          const half = Math.sqrt(Math.max(0, 7.8 * 7.8 - (z + 4.5) * (z + 4.5))) - 1.1;
          x = (g.sp - 1) * 2 * half; face = 0;
        } else {
          const lo = rMin(g.a), want = Math.sqrt(lo * lo + g.u * (outer * outer - lo * lo));
          if (!g.r) g.r = want;
          if (prayer) { const row = Math.round(want / 1.15) * 1.15; g.r += (row - g.r) * Math.min(1, dt * 2); }
          else { g.r += (want - g.r) * Math.min(1, dt * .5); g.a += g.sp * (1.15 - .8 * cur) * 1.6 * (speedMul || 1) / Math.max(9, g.r) * dt; }
          const r = Math.max(g.r, rMin(g.a));
          x = r * Math.cos(g.a); z = -r * Math.sin(g.a);
          face = prayer ? Math.atan2(-x, -z) : -g.a;
        }
        const moving = !prayer && !(hateemOpen && i < 60);
        P.set(x, moving ? Math.abs(Math.sin(t / 250 * g.sp + g.ph)) * .07 : 0, z); Q.setFromAxisAngle(UP, face);
        const bow = prayer && (Math.floor(t / 4500 + g.ph) % 3 === 1);
        S.set(g.s, bow ? .55 : g.s, g.s);
        M.compose(P, Q, S); body.setMatrixAt(i, M); head.setMatrixAt(i, M);
      }
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
    }
  };
};

/* ---------------- a pilgrim figure ---------------- */
// kind: "ihram" (man in the two white sheets) | "abaya" (woman, fully covered in black) | "thobe" (man in a white robe)
// The face never shows any features: it is a soft bright glow.
// returns { root, parts, upper, lower, set(state), pose(name, t), walk(phase, amt) }
H3.person = function (opt) {
  const THREE = T(); opt = opt || {};
  const kind = opt.kind || "ihram", ihram = kind === "ihram", woman = kind === "abaya";
  const skin = new THREE.MeshStandardMaterial({ color: opt.skin || 0xb98563, roughness: .65 });
  const towel = H3.canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = "#fbfbf8"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) { x.fillStyle = i % 4 ? "rgba(0,0,0,.025)" : "rgba(0,0,0,.05)"; x.fillRect(i, 0, 1, h); }
    for (let j = 0; j < h; j += 3) { x.fillStyle = "rgba(0,0,0,.02)"; x.fillRect(0, j, w, 1); }
    for (let i = 0; i < 9; i++) { const g = x.createLinearGradient(i * 57, 0, i * 57 + 57, 0); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.5, "rgba(120,110,95,.06)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(i * 57, 0, 57, h); }
  });
  towel.wrapS = towel.wrapT = THREE.RepeatWrapping; towel.repeat.set(2, 1);
  const white = new THREE.MeshStandardMaterial({ map: towel, roughness: .95, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: .55, metalness: .08, side: THREE.DoubleSide });
  const robe = woman ? black : white;
  const hairM = new THREE.MeshStandardMaterial({ color: 0x1d1511, roughness: .9 });
  const sandal = new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: .7 });
  const fringeTex = H3.canvasTex(512, 32, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = "#f4f2ec"; for (let i = 0; i < w; i += 6) x.fillRect(i, 0, 3, h - (i * 7 % 9)); });
  fringeTex.wrapS = THREE.RepeatWrapping; fringeTex.repeat.set(3, 1);
  const fringeM = new THREE.MeshStandardMaterial({ map: fringeTex, alphaTest: .5, transparent: false, side: THREE.DoubleSide, roughness: 1 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // a cloth of revolution around the body, reshaped per vertex by f(r, y, phi, x) -> [r, y]
  const drape = (pts, segs, f) => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), phi = Math.atan2(x, z), r = Math.hypot(x, z);
      const [r2, y2] = f(r, y, phi, x);
      p.setXYZ(i, r2 * Math.sin(phi), y2, r2 * Math.cos(phi));
    }
    g.computeVertexNormals();
    return g;
  };
  const folds = (r, y, phi, top, amt) => r + clamp((top - y) / .6, 0, 1) * amt * (Math.sin(phi * 7 + y * 4) * .012 + Math.sin(phi * 13 + 1) * .006);

  const root = new THREE.Group(), lower = new THREE.Group(), upper = new THREE.Group();
  root.add(lower, upper); upper.position.y = 1.0;
  const P = {};
  // legs
  P.legL = new THREE.Group(); P.legR = new THREE.Group();
  for (const [g, x] of [[P.legL, -.09], [P.legR, .09]]) {
    g.position.set(x, .95, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(.08, .07, .5, 12), skin); thigh.position.y = -.25; g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .45, 12), skin); shin.position.y = -.68; g.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.11, .05, .26), sandal); foot.position.set(0, -.92, .05); g.add(foot);
    if (ihram) { const strap = new THREE.Mesh(new THREE.BoxGeometry(.12, .03, .05), sandal); strap.position.set(0, -.88, .1); g.add(strap); }
    if (woman) g.visible = false;
    lower.add(g);
  }
  if (ihram) {
    // izar: one sheet wrapped round the waist, falling to mid-calf, overlapping at the front, with a fringed hem
    P.izar = new THREE.Mesh(drape([[.18, 1.05], [.2, 1.0], [.215, .85], [.23, .6], [.242, .42], [.247, .33]], 48, (r, y, phi) => {
      let r2 = folds(r, y, phi, 1.0, .8);
      if (phi > -.25 && phi < 1.25) r2 += .007;            // the overlapping end of the sheet
      const y2 = y < .35 ? y - .02 * Math.sin(phi * 3) : y;
      return [r2, y2];
    }), white);
    lower.add(P.izar);
    const fr = new THREE.Mesh(new THREE.CylinderGeometry(.249, .252, .05, 48, 1, true), fringeM); fr.position.y = .3; lower.add(fr);
  } else {
    // a long loose robe to the ground (black abaya, or white thobe)
    P.robeLow = new THREE.Mesh(drape([[.2, 1.05], [.23, .95], [.27, .7], [.31, .4], [.34, .1], [.35, .02]], 48, (r, y, phi) => [folds(r, y, phi, 1.0, 1.2), y]), robe);
    lower.add(P.robeLow);
  }
  // torso
  P.torso = new THREE.Mesh(new THREE.CylinderGeometry(.17, .19, .55, 24), ihram ? skin : robe); P.torso.position.y = .28; upper.add(P.torso);
  P.shL = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), ihram ? skin : robe); P.shL.position.set(-.19, .5, 0); upper.add(P.shL);
  P.shR = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), ihram ? skin : robe); P.shR.position.set(.19, .5, 0); upper.add(P.shR);
  // rida: the upper sheet over the shoulders. Two shapes: both shoulders covered, or idtiba (right shoulder and arm bare)
  const FL = -.75; // front-left, where the long end of the sheet hangs down
  const ridaPts = [[.07, .605], [.13, .6], [.2, .58], [.26, .545], [.295, .49], [.305, .4], [.31, .25], [.315, .1], [.325, -.05], [.33, -.18]];
  const ridaF = idt => (r, y, phi, x) => {
    let r2 = folds(r, y, phi, .45, 1), y2 = y;
    if (y < 0) { const k = clamp(-y / .18, 0, 1); y2 -= k * (idt ? .3 : .22) * Math.pow(Math.max(0, Math.cos(phi - FL)), 2); }
    if (idt) {
      const yTop = .6 - .5 * clamp((x + .12) / .42, 0, 1);
      if (y2 > yTop) { y2 = yTop; r2 = Math.min(r2, .2); }
      const s = clamp((x - .04) / .2, 0, 1);
      r2 = r2 + (Math.min(r2, y2 < 0 ? .235 : .205) - r2) * s;
    }
    return [r2, y2];
  };
  let ridaNorm = null, ridaIdt = null;
  if (ihram) {
    ridaNorm = drape(ridaPts, 56, ridaF(false));
    ridaIdt = drape(ridaPts, 56, ridaF(true));
    P.rida = new THREE.Mesh(ridaNorm, white); upper.add(P.rida);
    P.ridaUp = P.rida;
  } else {
    // a covering over the head and shoulders down to the elbows (khimar), or a plain collar for the thobe
    P.cape = new THREE.Mesh(drape(woman ? [[.1, .66], [.15, .62], [.24, .56], [.31, .45], [.34, .3], [.35, .15]] : [[.08, .6], [.16, .58], [.24, .54], [.26, .45], [.25, .2], [.24, .05]], 48,
      (r, y, phi) => [folds(r, y, phi, .5, woman ? 1.2 : .6), y]), robe);
    upper.add(P.cape);
  }
  // arms
  P.armL = new THREE.Group(); P.armR = new THREE.Group();
  for (const [g, x] of [[P.armL, -.24], [P.armR, .24]]) {
    g.position.set(x, .5, 0);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(.055, .05, .3, 12), ihram ? white : robe); up.position.y = -.15; g.add(up); g.userData.up = up;
    const fore = new THREE.Group(); fore.position.y = -.3; g.add(fore); g.userData.fore = fore;
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(woman ? .055 : .045, woman ? .06 : .04, .27, 12), woman ? robe : skin); fa.position.y = -.135; fore.add(fa);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.048, 12, 10), woman ? robe : skin); hand.position.y = -.29; fore.add(hand);
    upper.add(g);
  }
  // neck and head; the face is a featureless soft glow
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.05, .055, .08, 12), woman ? robe : skin); neck.position.y = .6; upper.add(neck);
  P.head = new THREE.Group(); P.head.position.y = .72; upper.add(P.head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.105, 24, 18), woman ? robe : skin); face.scale.set(.92, 1.08, .98); P.head.add(face);
  const glowTex = H3.canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,252,244,1)"); g.addColorStop(.45, "rgba(255,248,236,.85)"); g.addColorStop(1, "rgba(255,248,236,0)"); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  // a soft light over the front of the head hides the face from every front and side angle
  const glowM = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.125, 28, 18, Math.PI * .02, Math.PI * .96, Math.PI * .22, Math.PI * .6), glowM);
  glow.rotation.y = Math.PI; glow.position.set(0, -.012, .005); P.head.add(glow); P.glow = glow;
  const glowFront = new THREE.Mesh(new THREE.CircleGeometry(.14, 32), glowM); glowFront.position.set(0, -.012, .112); P.head.add(glowFront);
  P.hair = new THREE.Mesh(new THREE.SphereGeometry(.112, 24, 12, 0, Math.PI * 2, 0, Math.PI * .5), hairM); P.hair.position.y = .035; P.hair.scale.set(.93, .95, 1); P.head.add(P.hair);
  if (woman) {
    P.hair.visible = false;
    P.scarf = new THREE.Mesh(new THREE.SphereGeometry(.13, 28, 18, Math.PI * .7, Math.PI * 1.6, 0, Math.PI * .8), black); P.scarf.position.y = .008; P.head.add(P.scarf);
  } else if (kind === "thobe") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.114, 24, 10, 0, Math.PI * 2, 0, Math.PI * .42), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 })); cap.position.y = .015; P.head.add(cap);
  }
  const s = opt.scale || 1; root.scale.set(s, s, s);
  let idt = false, top = true;
  const api = {
    root, parts: P, upper, lower,
    // idtiba: right shoulder and right arm uncovered, the sheet passes under the right arm and over the left shoulder
    set(st) {
      if (!ihram) return;
      if (st.idtiba !== undefined) { idt = !!st.idtiba; P.rida.geometry = idt ? ridaIdt : ridaNorm; }
      if (st.top !== undefined) top = st.top !== false;
      if (st.hair) { P.hair.visible = st.hair !== "bald"; P.hair.scale.set(.93, st.hair === "short" ? .8 : .95, st.hair === "short" ? .95 : 1); }
      P.rida.visible = top;
      P.armL.userData.up.material = top ? white : skin;
      P.armR.userData.up.material = top && !idt ? white : skin;
    },
    // walking cycle; phase in radians, amount 0..1
    walk(phase, amt) {
      const a = Math.sin(phase) * .5 * amt;
      P.legL.rotation.x = a; P.legR.rotation.x = -a;
      P.armL.rotation.x = -a * .8; P.armR.rotation.x = a * .8;
      root.position.y = Math.abs(Math.cos(phase)) * .03 * amt * s;
    },
    pose(name, k) {
      k = k === undefined ? 1 : k;
      P.armL.rotation.set(0, 0, 0); P.armR.rotation.set(0, 0, 0); upper.rotation.set(0, 0, 0);
      P.armL.userData.fore.rotation.set(0, 0, 0); P.armR.userData.fore.rotation.set(0, 0, 0);
      P.legL.rotation.set(0, 0, 0); P.legR.rotation.set(0, 0, 0); lower.position.y = 0; upper.position.y = 1.0;
      if (name === "istilam") { P.armR.rotation.x = -2.2 * k; P.armR.rotation.z = .25 * k; }            // raise right hand towards the Black Stone
      else if (name === "dua") { P.armL.rotation.x = P.armR.rotation.x = -1.1 * k; P.armL.userData.fore.rotation.x = P.armR.userData.fore.rotation.x = -.9 * k; P.armL.rotation.z = .25 * k; P.armR.rotation.z = -.25 * k; }
      else if (name === "takbir") { P.armL.rotation.x = P.armR.rotation.x = -.5 * k; P.armL.userData.fore.rotation.x = P.armR.userData.fore.rotation.x = -2.2 * k; }
      else if (name === "qiyam") { P.armL.rotation.x = P.armR.rotation.x = -.35; P.armL.userData.fore.rotation.x = P.armR.userData.fore.rotation.x = -1.3; P.armL.rotation.z = -.35; P.armR.rotation.z = .35; }
      else if (name === "ruku") { upper.rotation.x = 1.35 * k; P.armL.rotation.x = P.armR.rotation.x = -1.2 * k; }
      else if (name === "sujud") { upper.rotation.x = 1.9 * k; upper.position.y = 1.0 - .55 * k; P.legL.rotation.x = P.legR.rotation.x = -1.4 * k; lower.position.y = -.42 * k; P.armL.rotation.x = P.armR.rotation.x = -2.6 * k; }
      else if (name === "drink") { P.armR.rotation.x = -1.3; P.armR.userData.fore.rotation.x = -1.7; }
      else if (name === "throw") { P.armR.rotation.x = -2.6 * k; P.armR.userData.fore.rotation.x = -.3 * k; }
    }
  };
  if (ihram) api.set({ idtiba: !!opt.idtiba, top: true });
  return api;
};

/* ---------------- small helpers shared by the 3D views ---------------- */
H3.orbit = function (el, state, onUser) {
  // state: {yaw, pitch, dist}; drag to turn, pinch / wheel to zoom
  el.style.touchAction = "none";
  const ptr = new Map();
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); state.drag = true; state.idle = 0; onUser && onUser(); });
  el.addEventListener("pointermove", e => {
    if (!ptr.has(e.pointerId)) return;
    const [x0, y0] = ptr.get(e.pointerId);
    if (ptr.size === 1) { state.yaw -= (e.clientX - x0) * .006; state.pitch = Math.max(.08, Math.min(1.52, state.pitch + (e.clientY - y0) * .005)); }
    else if (ptr.size === 2) {
      const o = [...ptr.entries()].find(([k]) => k !== e.pointerId)[1];
      const d0 = Math.hypot(x0 - o[0], y0 - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
      state.dist = Math.max(state.min || 3, Math.min(state.max || 400, state.dist * d0 / (d1 || 1)));
    }
    ptr.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const up = e => { ptr.delete(e.pointerId); if (!ptr.size) state.drag = false; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", e => { e.preventDefault(); state.dist = Math.max(state.min || 3, Math.min(state.max || 400, state.dist * (1 + e.deltaY * .001))); onUser && onUser(); }, { passive: false });
};
H3.labels = function (host) {
  const list = [];
  return {
    add(text, v, cls) { const d = document.createElement("div"); d.className = "tw-label" + (cls ? " " + cls : ""); d.textContent = text; host.appendChild(d); const L = { d, v, on: true }; list.push(L); return L; },
    clear() { list.forEach(L => L.d.remove()); list.length = 0; },
    update(cam) {
      const w = host.clientWidth, h = host.clientHeight;
      for (const L of list) {
        const p = L.v.clone().project(cam);
        L.d.style.transform = `translate(${(p.x * .5 + .5) * w}px, ${(-p.y * .5 + .5) * h}px) translate(-50%,-100%)`;
        L.d.style.opacity = (L.on && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1) ? 1 : 0;
      }
    }
  };
};
window.Haram3D = H3;
})();
