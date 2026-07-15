/* ============ The Experience: scroll-driven 3D journey (Three.js) ============ */

import * as THREE from "./vendor/three.module.min.js";

const stage = document.getElementById("stage");
const chapters = [...document.querySelectorAll(".chapter")].map((el) => ({
  el,
  from: parseFloat(el.dataset.from),
  to: parseFloat(el.dataset.to),
  shown: -1,
}));
const progressBar = document.getElementById("progress");

/* a handful of the paintings become floating portals along the path */
const PORTALS = [
  "phoenix.jpg",
  "portal of light.jpg",
  "cosmic spiral.jpg",
  "lotus heart.jpg",
  "spirit dance.jpg",
  "vortex.jpg",
];

(function init() {
  if (!stage) return;

  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SMALL = matchMedia("(max-width: 720px)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !SMALL, alpha: false });
  } catch {
    document.body.classList.add("flat"); // no WebGL — the story stacks as a page
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, SMALL ? 1.5 : 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b18);
  scene.fog = new THREE.Fog(0x0d0b18, 16, 44);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 90);

  scene.add(new THREE.AmbientLight(0x9a8cc0, 1.15));
  const camLight = new THREE.PointLight(0xd9ab5f, 90, 26);
  scene.add(camLight);

  /* --- soft radial glow texture, shared by sprites --- */
  function glowTexture(inner, mid) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, mid);
    grad.addColorStop(1, "rgba(13,11,24,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const goldGlow = glowTexture("rgba(242,210,150,0.9)", "rgba(217,171,95,0.25)");
  const roseGlow = glowTexture("rgba(240,190,205,0.9)", "rgba(180,138,201,0.22)");

  /* --- starfield spread along the whole journey --- */
  function starCloud(count, color, size) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 64;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 36;
      pos[i * 3 + 2] = 30 - Math.random() * 270;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    return points;
  }
  starCloud(SMALL ? 500 : 1400, 0xf2d296, 0.075);
  starCloud(SMALL ? 300 : 800, 0xb48ac9, 0.06);

  /* --- frequency waves: flowing lines the camera passes through --- */
  const WAVE_SEGS = SMALL ? 90 : 160;
  const waves = [];
  for (let w = 0; w < 6; w++) {
    const pos = new Float32Array((WAVE_SEGS + 1) * 3);
    for (let i = 0; i <= WAVE_SEGS; i++) {
      pos[i * 3] = -22 + (44 * i) / WAVE_SEGS;
      pos[i * 3 + 2] = -38 - w * 7.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: w % 2 ? 0xb48ac9 : 0xd9ab5f,
      transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    waves.push({ geo, baseY: (w - 2.5) * 1.5, amp: 0.7 + (w % 3) * 0.35, speed: 0.5 + w * 0.13, phase: w * 1.7 });
  }

  /* --- eleven hearts in a slow spiral --- */
  function heartGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0.5);
    s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
    s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
    s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
    s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
    s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1, 0);
    s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);
    const geo = new THREE.ShapeGeometry(s);
    geo.rotateZ(Math.PI); // point down → up
    geo.translate(0.5, 0.95, 0); // center on origin
    geo.scale(0.42, 0.42, 0.42);
    return geo;
  }
  const heartGeo = heartGeometry();
  const hearts = [];
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 3;
    const radius = 2.6 + (i % 3) * 0.8;
    const mesh = new THREE.Mesh(
      heartGeo,
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xf0becd : 0xf2d296,
        transparent: true, opacity: 0.95, side: THREE.DoubleSide,
      })
    );
    mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55, -86 - i * 3.4);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: i % 2 ? roseGlow : goldGlow,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(2.4);
    glow.position.copy(mesh.position);
    scene.add(mesh, glow);
    hearts.push({ mesh, glow, seed: i });
  }

  /* --- painting portals in gold frames, alternating sides of the path --- */
  const loader = new THREE.TextureLoader();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc99b52, metalness: 0.85, roughness: 0.32 });
  const portals = [];
  PORTALS.forEach((file, i) => {
    const side = i % 2 ? 1 : -1;
    const group = new THREE.Group();
    group.position.set(side * 4.4, (Math.random() - 0.5) * 1.2, -128 - i * 9);
    group.rotation.y = -side * 0.5; // angled toward the path

    const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, roughness: 0.85 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.75), mat);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.24, 3.99, 0.12), frameMat.clone());
    frame.position.z = -0.07;
    frame.material.transparent = true;
    frame.material.opacity = 0;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: goldGlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(6.5, 7.5, 1);
    glow.position.z = -0.4;
    group.add(frame, plane, glow);
    scene.add(group);
    portals.push({ group, plane, frame, glow, file, loaded: false, seed: i * 2.3 });
  });

  // portal textures are heavy — request them only as that part of the journey nears
  let texturesRequested = false;
  function loadTextures() {
    if (texturesRequested) return;
    texturesRequested = true;
    for (const p of portals) {
      loader.load(encodeURI("/paintings/" + p.file), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const aspect = tex.image.width / tex.image.height;
        const h = 3.75;
        const w = Math.min(4.6, Math.max(2.2, h * aspect));
        p.plane.geometry.dispose();
        p.plane.geometry = new THREE.PlaneGeometry(w, h);
        p.frame.geometry.dispose();
        p.frame.geometry = new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.12);
        p.plane.material.map = tex;
        p.plane.material.needsUpdate = true;
        p.loaded = true; // fades in during the loop
      });
    }
  }

  /* --- the radiant core at journey's end --- */
  const core = new THREE.Group();
  core.position.set(0, 0, -206);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: goldGlow, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreGlow.scale.setScalar(11);
  const coreHeart = new THREE.Mesh(heartGeo, new THREE.MeshBasicMaterial({
    color: 0xfff3dd, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
  }));
  coreHeart.scale.setScalar(2.2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xd9ab5f, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.02, 8, 90), ringMat);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.015, 8, 90), ringMat.clone());
  ringB.material.color.set(0xb48ac9);
  core.add(coreGlow, coreHeart, ringA, ringB);
  scene.add(core);

  /* --- camera path: scroll progress → position along the journey --- */
  // ends at z −196: ten units short of the core, which sits centered in view
  const pathPoint = (p, v) => v.set(
    Math.sin(p * Math.PI * 3) * 2.1 * (1 - p * 0.7),
    Math.sin(p * Math.PI * 2) * 0.55,
    10 - p * 206
  );
  const camPos = new THREE.Vector3();
  const lookPos = new THREE.Vector3();

  /* --- scroll + pointer --- */
  let target = 0, prog = 0;
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  let pointerX = 0, pointerY = 0;
  if (finePointer && !REDUCE) {
    document.addEventListener("mousemove", (e) => {
      pointerX = (e.clientX / innerWidth - 0.5) * 2;
      pointerY = (e.clientY / innerHeight - 0.5) * 2;
    });
  }

  /* --- overlay fade: 1 inside [from,to], eased ramps at the edges --- */
  const EDGE = 0.05;
  function fade(p, a, b) {
    if (p < a - EDGE || p > b + EDGE) return 0;
    if (p < a) return (p - (a - EDGE)) / EDGE;
    if (p > b) return (b + EDGE - p) / EDGE;
    return 1;
  }

  function updateChapters(p) {
    for (const ch of chapters) {
      const o = fade(p, ch.from, ch.to);
      const on = o > 0.01 ? 1 : 0;
      if (on !== ch.shown || on) {
        ch.el.style.opacity = o.toFixed(3);
        ch.el.style.pointerEvents = o > 0.5 ? "auto" : "none";
        ch.el.style.transform = `translateY(${((1 - o) * 14).toFixed(1)}px)`;
        ch.shown = on;
      }
    }
    progressBar.style.width = (p * 100).toFixed(2) + "%";
  }

  /* --- sizing / run state --- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  let running = false;
  document.addEventListener("visibilitychange", maybeRun);
  function maybeRun() {
    if (!document.hidden && !running) {
      running = true;
      requestAnimationFrame(frame);
    } else if (document.hidden) {
      running = false;
    }
  }

  function frame(t) {
    if (!running) return;
    const time = t / 1000;

    prog += (target - prog) * (REDUCE ? 1 : 0.08);
    if (Math.abs(target - prog) < 0.0004) prog = target;

    if (prog > 0.42) loadTextures();

    pathPoint(prog, camPos);
    camera.position.set(camPos.x + pointerX * 0.55, camPos.y - pointerY * 0.4, camPos.z);
    pathPoint(Math.min(1, prog + 0.028), lookPos);
    camera.lookAt(lookPos.x, lookPos.y, lookPos.z - 4);
    camLight.position.set(camera.position.x + 1.5, camera.position.y + 1.5, camera.position.z + 2);

    // frequency waves ripple
    if (!REDUCE || prog > 0.15) {
      for (const w of waves) {
        const arr = w.geo.attributes.position.array;
        const anim = REDUCE ? 0 : time;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] = w.baseY + Math.sin(arr[i] * 0.32 + anim * w.speed + w.phase) * w.amp;
        }
        w.geo.attributes.position.needsUpdate = true;
      }
    }

    // hearts pulse
    if (!REDUCE) {
      for (const h of hearts) {
        const s = 1 + Math.sin(time * 1.3 + h.seed * 1.8) * 0.09;
        h.mesh.scale.setScalar(s);
        h.glow.scale.setScalar(2.4 * s);
        h.mesh.rotation.y = Math.sin(time * 0.4 + h.seed) * 0.35;
      }
    }

    // portals fade in and sway
    for (const p of portals) {
      if (p.loaded && p.plane.material.opacity < 1) {
        const o = Math.min(1, p.plane.material.opacity + 0.03);
        p.plane.material.opacity = o;
        p.frame.material.opacity = o;
        p.glow.material.opacity = o * 0.35;
      }
      if (!REDUCE) p.group.position.y += Math.sin(time * 0.5 + p.seed) * 0.0012;
    }

    // core breathes and rings turn
    if (!REDUCE) {
      const pulse = 1 + Math.sin(time * 1.1) * 0.07;
      coreGlow.scale.setScalar(11 * pulse);
      coreHeart.scale.setScalar(2.2 * pulse);
      ringA.rotation.x = time * 0.3;
      ringA.rotation.y = time * 0.22;
      ringB.rotation.x = -time * 0.2;
      ringB.rotation.z = time * 0.27;
    }

    updateChapters(prog);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  maybeRun();
})();
