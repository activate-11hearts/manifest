/* ============ 3D gallery: rotating ring of paintings + cinematic viewer ============ */

import * as THREE from "./vendor/three.module.min.js";

const stage = document.getElementById("gallery3d-stage");
const wrap = document.getElementById("gallery3d");
const titleEl = document.getElementById("g3d-title");
const actionEl = document.getElementById("g3d-action");

const cinema = document.getElementById("cinema");
const cinemaStage = document.getElementById("cinema-stage");
const cinemaTitle = document.getElementById("cinema-title");
const cinemaAction = document.getElementById("cinema-action");

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fmt = (n) => (typeof money === "function" ? money(n) : "$" + n);

function actionHTML(p) {
  if (p.price > 0) {
    return `<button class="btn btn-primary btn-small" data-buy="Painting: ${esc(p.title)}" data-price="${p.price}">Buy · ${fmt(p.price)}</button>`;
  }
  return `<a class="inquire" href="mailto:activate@11heartsfrequency.org?subject=${encodeURIComponent("Painting inquiry: " + p.title)}">email for details</a>`;
}

(async function init() {
  if (!stage || !cinemaStage) return;

  let paintings;
  try {
    paintings = await (await fetch("/api/paintings")).json();
  } catch {
    return;
  }
  if (!paintings.length) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return; // no WebGL → 2D masonry gallery stays
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  // 3D mode is a go — reveal the stage, hide the 2D grid
  wrap.hidden = false;
  document.body.classList.add("gallery-3d");

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x100e1b, 14, 30);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);

  const COUNT = paintings.length;
  const STEP = (Math.PI * 2) / COUNT;
  const RADIUS = Math.max(8, (COUNT * 3.5) / (Math.PI * 2));
  camera.position.set(0, 0.15, RADIUS + 5.6);

  scene.add(new THREE.AmbientLight(0x9a8cc0, 1.1));
  const key = new THREE.PointLight(0xd9ab5f, 160, 40);
  key.position.set(4, 4, RADIUS + 7);
  const fill = new THREE.PointLight(0xb48ac9, 90, 40);
  fill.position.set(-5, -2, RADIUS + 5);
  scene.add(key, fill);

  /* --- build the ring --- */
  const ring = new THREE.Group();
  scene.add(ring);

  const loader = new THREE.TextureLoader();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc99b52, metalness: 0.85, roughness: 0.32 });
  const items = []; // { group, plane, painting, baseScale }

  paintings.forEach((p, i) => {
    const group = new THREE.Group();
    const angle = i * STEP;
    group.position.set(Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS);
    group.rotation.y = angle;

    const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, roughness: 0.85, metalness: 0 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), mat);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 0.1), frameMat.clone());
    frame.position.z = -0.06;
    frame.material.transparent = true;
    frame.material.opacity = 0;
    group.add(frame, plane);

    const item = { group, plane, frame, painting: p, index: i, loaded: false, hover: 0 };
    items.push(item);
    ring.add(group);
  });

  // textures are heavy — load them only once the gallery is first opened
  let texturesRequested = false;
  function loadTextures() {
    if (texturesRequested) return;
    texturesRequested = true;
    for (const item of items) {
      loader.load(encodeURI(item.painting.url), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const aspect = tex.image.width / tex.image.height;
        const h = 2.5;
        const w = Math.min(3.1, Math.max(1.5, h * aspect));
        item.plane.geometry.dispose();
        item.plane.geometry = new THREE.PlaneGeometry(w, h);
        item.frame.geometry.dispose();
        item.frame.geometry = new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.1);
        item.plane.material.map = tex;
        item.plane.material.needsUpdate = true;
        item.loaded = true; // fade in during the loop
      });
    }
  }

  /* --- spin: auto + drag + wheel --- */
  let spin = 0;
  let velocity = REDUCE ? 0 : 0.0022;
  let dragging = false;
  let lastX = 0;

  stage.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener("pointermove", (e) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      spin += dx * 0.004;
      velocity = dx * 0.0006;
    }
    updatePointer(e);
  });
  stage.addEventListener("pointerup", () => (dragging = false));
  stage.addEventListener("pointercancel", () => (dragging = false));
  stage.addEventListener("wheel", (e) => { e.preventDefault(); velocity += e.deltaY * 0.00003; }, { passive: false });

  /* --- picking --- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let hovered = null;
  let downAt = 0;

  function updatePointer(e) {
    const r = stage.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  stage.addEventListener("pointerdown", () => (downAt = Date.now()));
  stage.addEventListener("click", () => {
    if (Date.now() - downAt > 250) return; // was a drag, not a click
    if (hovered) openCinema(hovered);
  });

  /* --- caption --- */
  let captionIndex = -1;
  function updateCaption() {
    const idx = ((Math.round(-spin / STEP) % COUNT) + COUNT) % COUNT;
    if (idx === captionIndex) return;
    captionIndex = idx;
    const p = paintings[idx];
    titleEl.textContent = p.title;
    actionEl.innerHTML = actionHTML(p);
  }

  /* --- sizing / run state --- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  let inView = false, running = false;
  new IntersectionObserver((en) => { inView = en[0].isIntersecting; maybeRun(); }, { threshold: 0.05 }).observe(stage);
  document.addEventListener("visibilitychange", maybeRun);

  function maybeRun() {
    const should = inView && !document.hidden;
    if (should && !running) { running = true; loadTextures(); resize(); requestAnimationFrame(frame); }
    else if (!should) running = false;
  }

  function frame(t) {
    if (!running) return;
    const time = t / 1000;

    if (!dragging) {
      if (!REDUCE) velocity += (0.0022 - velocity) * 0.01; // ease back to idle spin
      spin += velocity;
      velocity *= 0.985;
    }
    ring.rotation.y = spin;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(items.map((i) => i.plane));
    const hit = hits.length ? items.find((i) => i.plane === hits[0].object) : null;
    if (hit !== hovered) {
      hovered = hit;
      stage.style.cursor = hit ? "pointer" : "grab";
    }

    for (const item of items) {
      // fade in once texture arrives
      if (item.loaded && item.plane.material.opacity < 1) {
        item.plane.material.opacity = Math.min(1, item.plane.material.opacity + 0.04);
        item.frame.material.opacity = item.plane.material.opacity;
      }
      // individual sway + hover lift
      if (!REDUCE) item.group.rotation.y = item.index * STEP + Math.sin(time * 0.6 + item.index) * 0.05;
      item.hover += ((item === hovered ? 1 : 0) - item.hover) * 0.12;
      const s = 1 + item.hover * 0.1;
      item.group.scale.setScalar(s);
      item.frame.material.emissive = item.frame.material.emissive || new THREE.Color();
      item.frame.material.emissive.setScalar(item.hover * 0.35);
    }

    updateCaption();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ============ cinematic viewer ============ */

  let cRenderer = null, cScene, cCamera, cPlane, cFrame, cKey, cSparks, cSeeds;
  let cRunning = false, cStart = 0;

  function ensureCinema() {
    if (cRenderer) return;
    cRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    cRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    cinemaStage.appendChild(cRenderer.domElement);

    cScene = new THREE.Scene();
    cCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);

    cScene.add(new THREE.AmbientLight(0x9a8cc0, 0.9));
    cKey = new THREE.PointLight(0xd9ab5f, 220, 30);
    cScene.add(cKey);
    const rim = new THREE.PointLight(0xb48ac9, 70, 30);
    rim.position.set(-4, 2, 3);
    cScene.add(rim);

    cPlane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.6), new THREE.MeshStandardMaterial({ roughness: 0.85 }));
    cFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.8, 0.12), frameMat.clone());
    cFrame.position.z = -0.07;
    cScene.add(cPlane, cFrame);

    // drifting dust sparkles
    const N = 110;
    const pos = new Float32Array(N * 3);
    cSeeds = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 6, z: Math.random() * 4 - 0.5,
      sp: 0.05 + Math.random() * 0.2, ph: Math.random() * Math.PI * 2,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    cSparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf2d296, size: 0.035, transparent: true, opacity: 0.7 }));
    cScene.add(cSparks);

    new ResizeObserver(() => {
      const w = cinemaStage.clientWidth, h = cinemaStage.clientHeight;
      if (!w || !h) return;
      cRenderer.setSize(w, h);
      cCamera.aspect = w / h;
      cCamera.updateProjectionMatrix();
    }).observe(cinemaStage);
  }

  function openCinema(item) {
    ensureCinema();
    const p = item.painting;
    const tex = item.plane.material.map;
    if (tex) {
      const aspect = tex.image.width / tex.image.height;
      const h = 3.6, w = Math.min(4.6, Math.max(2.2, h * aspect));
      cPlane.geometry.dispose();
      cPlane.geometry = new THREE.PlaneGeometry(w, h);
      cFrame.geometry.dispose();
      cFrame.geometry = new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.12);
      cPlane.material.map = tex;
      cPlane.material.needsUpdate = true;
    }
    cinemaTitle.textContent = p.title;
    cinemaAction.innerHTML = actionHTML(p);
    cinema.hidden = false;
    cStart = performance.now();
    cRunning = true;
    requestAnimationFrame(cinemaFrame);
  }

  function cinemaFrame(t) {
    if (!cRunning) return;
    const e = (t - cStart) / 1000;

    if (REDUCE) {
      cCamera.position.set(0, 0, 5);
      cCamera.lookAt(0, 0, 0);
    } else {
      const loop = (e % 9) / 9; // the 9-second "shot"
      const sweep = Math.sin(loop * Math.PI * 2);
      const angle = sweep * 0.5;
      const radius = 5.4 - Math.sin(loop * Math.PI) * 1.4; // dolly in and back out
      cCamera.position.set(Math.sin(angle) * radius, Math.sin(loop * Math.PI * 2 * 0.5) * 0.4, Math.cos(angle) * radius);
      cCamera.lookAt(0, 0, 0);
      cKey.position.set(sweep * 4.5, 2.2 + sweep, 4); // light sweeps across the canvas

      const arr = cSparks.geometry.attributes.position.array;
      cSeeds.forEach((s, i) => {
        arr[i * 3] = s.x + Math.sin(e * s.sp + s.ph) * 0.6;
        arr[i * 3 + 1] = s.y + Math.cos(e * s.sp * 0.8 + s.ph) * 0.5;
        arr[i * 3 + 2] = s.z;
      });
      cSparks.geometry.attributes.position.needsUpdate = true;
    }

    cRenderer.render(cScene, cCamera);
    requestAnimationFrame(cinemaFrame);
  }

  function closeCinema() {
    cRunning = false;
    cinema.hidden = true;
  }

  cinema.addEventListener("click", (e) => {
    if (e.target.closest(".cinema-close") || e.target === cinema) closeCinema();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !cinema.hidden) closeCinema();
  });
})();
