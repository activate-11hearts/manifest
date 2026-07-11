/* ============ How Trinfinity8 works — interactive 3D story ============ */

import * as THREE from "./vendor/three.module.min.js";

const section = document.getElementById("t8how");
const stage = document.getElementById("t8-stage");
const captionEl = document.getElementById("t8-caption");
const dotsEl = document.getElementById("t8-dots");
const playBtn = document.getElementById("t8-play");

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const STAGE_SECONDS = 8;

const CAPTIONS = [
  "1 · A Trinfinity8 session — the program, the crystal rods, and you",
  "2 · The program — animated fractals, sacred geometry & mathematical healing codes",
  "3 · Streams of coded data flow from the software through a digital translator…",
  "4 · …into hand-held quartz crystal transmitter rods",
  "5 · Energy enters through the nerves & meridians of the hands, washing over the whole body",
  "6 · Mathematical sequences carry information to your cells — a language your DNA remembers",
];

(function init() {
  if (!section || !stage) return;

  // detect software rendering (no GPU) so weak devices get a lighter scene
  let SOFT = false;
  try {
    const probe = document.createElement("canvas").getContext("webgl");
    const info = probe && probe.getExtension("WEBGL_debug_renderer_info");
    const gpuName = info ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
    SOFT = /swiftshader|llvmpipe|software|basic render/i.test(gpuName);
  } catch {}

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !SOFT, alpha: true });
  } catch {
    return; // section stays hidden
  }
  renderer.setPixelRatio(SOFT ? 0.7 : Math.min(window.devicePixelRatio, 1.5));
  stage.appendChild(renderer.domElement);
  section.hidden = false;

  const scene = new THREE.Scene();
  if (!SOFT) scene.fog = new THREE.Fog(0x100e1b, 9, 22);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 50);

  scene.add(new THREE.AmbientLight(0x9a8cc0, 1.0));
  const keyLight = new THREE.PointLight(0xd9ab5f, 90, 30);
  keyLight.position.set(0, 4, 5);
  const fillLight = new THREE.PointLight(0xb48ac9, 50, 30);
  fillLight.position.set(-4, -2, 4);
  scene.add(keyLight, fillLight);

  /* ================= the program (laptop + living screen) ================= */

  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = screenCanvas.height = 256;
  const sctx = screenCanvas.getContext("2d");
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;

  function drawScreen(t) {
    sctx.fillStyle = "#151129";
    sctx.fillRect(0, 0, 256, 256);
    sctx.save();
    sctx.translate(128, 118);
    sctx.rotate(t * 0.15);
    // flower-of-life rings
    sctx.strokeStyle = "rgba(217,171,95,0.85)";
    sctx.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = i === 0 ? 0 : Math.cos(a) * 34;
      const y = i === 0 ? 0 : Math.sin(a) * 34;
      sctx.beginPath();
      sctx.arc(x, y, 34, 0, Math.PI * 2);
      sctx.stroke();
    }
    sctx.strokeStyle = "rgba(180,138,201,0.6)";
    sctx.beginPath();
    sctx.arc(0, 0, 68 + Math.sin(t * 1.8) * 5, 0, Math.PI * 2);
    sctx.stroke();
    sctx.restore();
    // drifting code glyphs
    sctx.fillStyle = "rgba(242,210,150,0.9)";
    sctx.font = "13px monospace";
    const glyphs = "8φπ∞01";
    for (let i = 0; i < 14; i++) {
      const y = ((t * 22 + i * 41) % 280) - 12;
      sctx.fillText(glyphs[i % glyphs.length], 8 + (i * 37) % 240, y);
    }
    screenTex.needsUpdate = true;
  }

  const laptop = new THREE.Group();
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.4),
    new THREE.MeshBasicMaterial({ map: screenTex })
  );
  const screenShell = new THREE.Mesh(
    new THREE.BoxGeometry(2.16, 1.56, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x2a2440, metalness: 0.6, roughness: 0.4 })
  );
  screenShell.position.z = -0.05;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.16, 0.09, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x2a2440, metalness: 0.6, roughness: 0.4 })
  );
  base.position.set(0, -0.82, 0.62);
  screen.position.y = 0;
  laptop.add(screenShell, screen, base);
  laptop.position.set(-4.2, 0.55, 0);
  laptop.rotation.y = 0.5;
  scene.add(laptop);

  /* ================= translator box ================= */

  const translator = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.3, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x3a3055, metalness: 0.5, roughness: 0.35, emissive: 0xd9ab5f, emissiveIntensity: 0.1 })
  );
  translator.position.set(-2.2, -0.75, 0.3);
  scene.add(translator);

  /* ================= the person (energy being) ================= */

  const person = new THREE.Group();
  const beingMat = new THREE.MeshStandardMaterial({
    color: 0xb9a8e0,
    transparent: true,
    opacity: 0.5,
    roughness: 0.35,
    emissive: 0x6a4a8a,
    emissiveIntensity: 0.25,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), beingMat);
  head.position.set(0, 1.12, 0);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 8, 20), beingMat);
  torso.position.set(0, 0.3, 0);
  const legs = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 20), beingMat);
  legs.scale.set(1.15, 0.38, 0.85);
  legs.position.set(0, -0.42, 0.1);
  person.add(head, torso, legs);

  // arms reaching forward to the rods
  const handL = new THREE.Vector3(-0.55, -0.15, 0.55);
  const handR = new THREE.Vector3(0.55, -0.15, 0.55);
  const armCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.38, 0.62, 0.05),
    new THREE.Vector3(-0.62, 0.2, 0.3),
    handL,
  ]);
  const armCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.38, 0.62, 0.05),
    new THREE.Vector3(0.62, 0.2, 0.3),
    handR,
  ]);
  person.add(
    new THREE.Mesh(new THREE.TubeGeometry(armCurveL, 16, 0.09, 8), beingMat),
    new THREE.Mesh(new THREE.TubeGeometry(armCurveR, 16, 0.09, 8), beingMat)
  );

  // crystal rods in the hands
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0xe8e0f5,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
    emissive: 0xd9ab5f,
    emissiveIntensity: 0.15,
  });
  const rodGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.5, 6);
  const rodL = new THREE.Mesh(rodGeo, rodMat);
  rodL.position.copy(handL);
  rodL.rotation.z = 0.5;
  const rodR = new THREE.Mesh(rodGeo, rodMat.clone());
  rodR.position.copy(handR);
  rodR.rotation.z = -0.5;
  person.add(rodL, rodR);

  // aura
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0xd9ab5f, transparent: true, opacity: 0.05, side: THREE.BackSide })
  );
  aura.position.y = 0.3;
  aura.scale.set(1, 1.25, 1);
  aura.visible = !SOFT; // full-screen transparent overdraw is brutal without a GPU
  person.add(aura);

  person.position.set(2.7, 0, 0);
  scene.add(person);

  const worldHandL = handL.clone().add(person.position);
  const worldHandR = handR.clone().add(person.position);

  /* ================= cables + data particles ================= */

  const cableCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.2, -0.25, 0.62),
    new THREE.Vector3(-3.2, -0.85, 0.5),
    translator.position.clone().add(new THREE.Vector3(-0.1, 0.05, 0.05)),
    new THREE.Vector3(-0.6, -1.0, 0.6),
    new THREE.Vector3(1.2, -0.7, 0.75),
    worldHandL,
  ]);
  const cableCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.2, -0.25, 0.62),
    new THREE.Vector3(-3.1, -0.9, 0.35),
    translator.position.clone().add(new THREE.Vector3(0.1, 0.05, 0.05)),
    new THREE.Vector3(-0.3, -1.05, 0.35),
    new THREE.Vector3(1.5, -0.75, 0.5),
    worldHandR,
  ]);

  const cableMat = new THREE.MeshStandardMaterial({ color: 0x4a3f6a, roughness: 0.5, emissive: 0xd9ab5f, emissiveIntensity: 0.06 });
  scene.add(
    new THREE.Mesh(new THREE.TubeGeometry(cableCurveL, 60, 0.022, 6), cableMat),
    new THREE.Mesh(new THREE.TubeGeometry(cableCurveR, 60, 0.022, 6), cableMat)
  );

  function particleStream(count, color, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0 });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    return { geo, mat, points, offsets: Array.from({ length: count }, () => Math.random()) };
  }

  const dataL = particleStream(50, 0xf2d296, 0.07);
  const dataR = particleStream(50, 0xf2d296, 0.07);

  // energy climbing the arms (world-space copies of the arm curves)
  const armWorldL = new THREE.CatmullRomCurve3(armCurveL.points.map((p) => p.clone().add(person.position)));
  const armWorldR = new THREE.CatmullRomCurve3(armCurveR.points.map((p) => p.clone().add(person.position)));
  const armFlowL = particleStream(30, 0xf2d296, 0.06);
  const armFlowR = particleStream(30, 0xf2d296, 0.06);

  function flowAlong(stream, curve, t, speed, reverse) {
    const arr = stream.geo.attributes.position.array;
    stream.offsets.forEach((o, i) => {
      let u = (o + t * speed) % 1;
      if (reverse) u = 1 - u;
      const p = curve.getPointAt(u);
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    stream.geo.attributes.position.needsUpdate = true;
  }

  /* ================= cells + DNA ================= */

  const cellGroup = new THREE.Group();
  const cells = [];
  const cellMat = () => new THREE.MeshStandardMaterial({
    color: 0x7fc9cf,
    transparent: true,
    opacity: 0,
    roughness: 0.3,
    emissive: 0x6fc3c9,
    emissiveIntensity: 0.2,
  });
  for (let i = 0; i < 40; i++) {
    const r = 0.05 + Math.random() * 0.07;
    const cell = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), cellMat());
    const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
    const rad = 0.35 + Math.random() * 0.75;
    cell.position.set(Math.sin(b) * Math.cos(a) * rad, Math.sin(b) * Math.sin(a) * rad * 1.2, Math.cos(b) * rad);
    cell.userData = { phase: Math.random() * Math.PI * 2, speed: 0.7 + Math.random() * 1.2, base: 1 };
    cells.push(cell);
    cellGroup.add(cell);
  }

  // double helix of points
  const helixPts = [];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 5 + s * Math.PI;
      helixPts.push(Math.cos(a) * 0.16, (i / 40) * 1.1 - 0.55, Math.sin(a) * 0.16);
    }
  }
  const helixGeo = new THREE.BufferGeometry();
  helixGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(helixPts), 3));
  const helixMat = new THREE.PointsMaterial({ color: 0xf2d296, size: 0.045, transparent: true, opacity: 0 });
  const helix = new THREE.Points(helixGeo, helixMat);
  cellGroup.add(helix);

  cellGroup.position.copy(person.position).add(new THREE.Vector3(0, 0.35, 0));
  scene.add(cellGroup);

  /* ================= stages ================= */

  // per-stage targets: camera pos, lookAt, and opacities
  // (cam2/look2 = cinematic sweep: camera glides from cam→cam2 across the stage)
  const S = [
    { cam: [-5.4, 0.3, 3.2], look: [-3.8, 0.3, 0], cam2: [0.2, 1.15, 6.8], look2: [-0.4, 0.0, 0], data: 0.7, rodGlow: 0.5, aura: 0.1, cellO: 0, armF: 0.3 },
    { cam: [-5.6, 1.0, 3.4], look: [-4.2, 0.5, 0], data: 0.15, rodGlow: 0.15, aura: 0.05, cellO: 0, armF: 0 },
    { cam: [-2.2, 0.3, 5.0], look: [-1.6, -0.4, 0], data: 1, rodGlow: 0.25, aura: 0.05, cellO: 0, armF: 0 },
    { cam: [2.9, -0.2, 2.5], look: [2.7, -0.15, 0.4], data: 1, rodGlow: 1.4, aura: 0.08, cellO: 0, armF: 0.4 },
    { cam: [2.7, 0.7, 4.8], look: [2.7, 0.3, 0], data: 1, rodGlow: 1.0, aura: 0.16, cellO: 0, armF: 1 },
    { cam: [2.7, 0.42, 1.75], look: [2.7, 0.35, 0], data: 0.5, rodGlow: 0.7, aura: 0.10, cellO: 0.85, armF: 0.6 },
  ];

  let stageIdx = 0;
  let playing = !REDUCE;
  let stageClock = 0;
  const camPos = new THREE.Vector3(...S[0].cam);
  const camLook = new THREE.Vector3(...S[0].look);
  const cur = { data: 0, rodGlow: 0.15, aura: 0.05, cellO: 0, armF: 0 };

  const dots = CAPTIONS.map((c, i) => {
    const b = document.createElement("button");
    b.className = "t8-dot";
    b.setAttribute("aria-label", `Stage ${i + 1}`);
    b.addEventListener("click", () => setStage(i, true));
    dotsEl.appendChild(b);
    return b;
  });

  function setStage(i, manual) {
    stageIdx = i;
    stageClock = 0;
    captionEl.textContent = CAPTIONS[i];
    dots.forEach((d, j) => d.classList.toggle("active", j === i));
    if (manual && REDUCE) renderOnce();
  }

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "⏸" : "▶";
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  });

  /* drag to orbit */
  let dragging = false, lastX = 0, lastY = 0, yaw = 0, pitch = 0;
  stage.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener("pointerup", () => (dragging = false));
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.005;
    pitch += (e.clientY - lastY) * 0.003;
    pitch = Math.max(-0.5, Math.min(0.6, pitch));
    lastX = e.clientX; lastY = e.clientY;
  });

  /* ================= run state ================= */

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  let inView = false, running = false, lastT = 0, frameCount = 0;
  new IntersectionObserver((en) => { inView = en[0].isIntersecting; maybeRun(); }, { threshold: 0.05 }).observe(stage);
  document.addEventListener("visibilitychange", maybeRun);

  function maybeRun() {
    const should = inView && !document.hidden && !REDUCE;
    if (should && !running) { running = true; resize(); lastT = 0; requestAnimationFrame(frame); }
    else if (!should) running = false;
    if (REDUCE && inView) renderOnce();
  }

  function applyStage(dt, time) {
    const T = S[stageIdx];
    // ease opacities toward targets
    for (const k of Object.keys(cur)) cur[k] += (T[k] - cur[k]) * Math.min(1, dt * 2.2);

    dataL.mat.opacity = dataR.mat.opacity = cur.data;
    armFlowL.mat.opacity = armFlowR.mat.opacity = cur.armF;
    rodL.material.emissiveIntensity = rodR.material.emissiveIntensity = cur.rodGlow * (1 + Math.sin(time * 3) * 0.25);
    aura.material.opacity = cur.aura * (1 + Math.sin(time * 1.4) * 0.25);
    translator.material.emissiveIntensity = 0.1 + cur.data * 0.5 * (0.5 + 0.5 * Math.sin(time * 5));
    helixMat.opacity = cur.cellO;

    cellGroup.visible = cur.cellO > 0.02;
    helix.visible = cellGroup.visible;
    if (cellGroup.visible) {
      for (const cell of cells) {
        const u = cell.userData;
        const pulse = Math.max(0, Math.sin(time * u.speed + u.phase));
        cell.material.opacity = cur.cellO * 0.75;
        cell.material.emissiveIntensity = 0.2 + pulse * pulse * 1.6 * cur.cellO;
        cell.scale.setScalar(1 + pulse * pulse * 0.3 * cur.cellO);
      }
    }

    // camera: stage keyframe (or cinematic sweep) + gentle filmed drift + user orbit offsets
    let look = new THREE.Vector3(...T.look);
    let basePos = new THREE.Vector3(...T.cam);
    if (T.cam2) {
      const p = Math.min(1, stageClock / STAGE_SECONDS);
      const ease = p * p * (3 - 2 * p);
      basePos.lerp(new THREE.Vector3(...T.cam2), ease);
      look.lerp(new THREE.Vector3(...(T.look2 || T.look)), ease);
    }
    const offset = basePos.clone().sub(look);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta += yaw + Math.sin(time * 0.12) * 0.06;
    sph.phi = Math.max(0.4, Math.min(2.4, sph.phi + pitch + Math.sin(time * 0.09) * 0.04));
    const target = look.clone().add(new THREE.Vector3().setFromSpherical(sph));
    camPos.lerp(target, Math.min(1, dt * 1.8));
    camLook.lerp(look, Math.min(1, dt * 1.8));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  function frame(t) {
    if (!running) return;
    const time = t / 1000;
    const dt = lastT ? Math.min(0.05, time - lastT) : 0.016;
    lastT = time;

    if (playing) {
      stageClock += dt;
      if (stageClock >= STAGE_SECONDS) setStage((stageIdx + 1) % S.length);
    }

    if ((frameCount++ % 3) === 0) drawScreen(time);
    flowAlong(dataL, cableCurveL, time, 0.11);
    flowAlong(dataR, cableCurveR, time, 0.1);
    flowAlong(armFlowL, armWorldL, time, 0.2, true); // hands → shoulders
    flowAlong(armFlowR, armWorldR, time, 0.22, true);
    helix.rotation.y = time * 0.5;
    cellGroup.rotation.y = time * 0.08;

    applyStage(dt, time);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function renderOnce() {
    resize();
    drawScreen(1);
    // jump straight to the stage's look
    const T = S[stageIdx];
    for (const k of Object.keys(cur)) cur[k] = T[k];
    applyStage(1, 1);
    camera.position.set(...T.cam);
    camera.lookAt(new THREE.Vector3(...T.look));
    renderer.render(scene, camera);
  }

  setStage(0);
  if (REDUCE) {
    playBtn.textContent = "▶";
  }
  maybeRun();
})();
