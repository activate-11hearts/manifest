/* ============ hero quartz crystal (Three.js) ============ */

import * as THREE from "./vendor/three.module.min.js";

const stage = document.getElementById("crystal-stage");

(function init() {
  if (!stage) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    stage.style.display = "none"; // no WebGL — hero simply looks as before
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 0, 7.2);

  /* --- the crystal: hexagonal bipyramid, quartz-point silhouette --- */
  const crystal = new THREE.Group();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xcdbfe8,
    transparent: true,
    opacity: 0.62,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.55,
    thickness: 1.6,
    iridescence: 0.65,
    iridescenceIOR: 1.4,
    emissive: 0x8a6a3a,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
  });

  const upper = new THREE.Mesh(new THREE.ConeGeometry(1, 2.1, 6), material);
  upper.position.y = 1.05;
  const lower = new THREE.Mesh(new THREE.ConeGeometry(1, 2.1, 6), material);
  lower.rotation.x = Math.PI;
  lower.position.y = -1.05;
  crystal.add(upper, lower);

  // faint golden edge lines for definition
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xd9ab5f, transparent: true, opacity: 0.35 });
  crystal.add(
    new THREE.LineSegments(new THREE.EdgesGeometry(upper.geometry).translate(0, 1.05, 0), edgeMat),
    new THREE.LineSegments(new THREE.EdgesGeometry(lower.geometry).rotateX(Math.PI).translate(0, -1.05, 0), edgeMat)
  );

  crystal.scale.setScalar(1.05);
  scene.add(crystal);

  /* --- lights --- */
  scene.add(new THREE.AmbientLight(0x8878aa, 0.6));
  const gold = new THREE.PointLight(0xd9ab5f, 55);
  gold.position.set(3.5, 2.5, 4);
  const plum = new THREE.PointLight(0xb48ac9, 40);
  plum.position.set(-3.5, -2, 3);
  const inner = new THREE.PointLight(0xf2d296, 10, 4);
  scene.add(gold, plum, inner);

  /* --- orbiting sparkles --- */
  const SPARKS = 42;
  const positions = new Float32Array(SPARKS * 3);
  const seeds = [];
  for (let i = 0; i < SPARKS; i++) {
    seeds.push({
      radius: 1.9 + Math.random() * 1.6,
      speed: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      y: (Math.random() - 0.5) * 3.4,
      wobble: Math.random() * 0.5,
    });
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: 0xf2d296, size: 0.05, transparent: true, opacity: 0.8, sizeAttenuation: true })
  );
  scene.add(sparks);

  /* --- sizing --- */
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  /* --- mouse lean (desktop) --- */
  let targetX = 0, targetY = 0;
  if (finePointer && !reduceMotion) {
    document.addEventListener("mousemove", (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.55;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.35;
    });
  }

  /* --- render loop: only while visible --- */
  let inView = true;
  let running = false;

  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    maybeRun();
  }).observe(stage);

  document.addEventListener("visibilitychange", maybeRun);

  function maybeRun() {
    const should = inView && !document.hidden;
    if (should && !running) {
      running = true;
      requestAnimationFrame(frame);
    } else if (!should) {
      running = false;
    }
  }

  function frame(t) {
    if (!running) return;
    const time = t / 1000;

    if (!reduceMotion) {
      crystal.rotation.y = time * 0.35;
      crystal.position.y = Math.sin(time * 0.8) * 0.16;
      crystal.rotation.z = Math.sin(time * 0.5) * 0.05 + targetX * 0.4;
      crystal.rotation.x = targetY * 0.6;
      inner.intensity = 8 + Math.sin(time * 1.6) * 4;

      const arr = sparkGeo.attributes.position.array;
      for (let i = 0; i < SPARKS; i++) {
        const s = seeds[i];
        const a = s.phase + time * s.speed;
        arr[i * 3] = Math.cos(a) * s.radius;
        arr[i * 3 + 1] = s.y + Math.sin(time * 0.7 + s.phase) * s.wobble;
        arr[i * 3 + 2] = Math.sin(a) * s.radius;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    // single static frame
    crystal.rotation.y = 0.6;
    renderer.render(scene, camera);
  } else {
    maybeRun();
  }
})();
