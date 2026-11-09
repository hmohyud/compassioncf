// Interactive participant globe — vanilla port of the Compassion Course hero globe
// (compassion-course-website/src/components/Globe.tsx). Three.js, two stacked canvases
// (earth + markers, then a drifting cloud layer), density markers, drag-to-spin,
// hover/click tooltips and a passive "auto-tour" that highlights communities.
//
// Usage:
//   import { mountGlobe } from '../shared/globe.js';
//   mountGlobe(document.querySelector('#globe'), { marker: '239,142,47', hover: '196,74,26' });

import * as THREE from './vendor/three.module.min.js';
import { CLUSTERS } from './clusters.js';

const PI = Math.PI;
const AUTO_SELECT_INTERVAL = 5000;
const AUTO_SELECT_RESUME_MS = 15000;
const AUTO_SELECT_DURATION = 3500;
const asset = (p) => new URL(p, import.meta.url).href;

function latLonToVec3(lat, lon, r = 1) {
  const phi = (90 - lat) * (PI / 180);
  const theta = (lon + 180) * (PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function markerTexture(color, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const m = size / 2, r = size * 0.3;
  const g = ctx.createRadialGradient(m, m, r * 0.6, m, m, r * 1.5);
  g.addColorStop(0, `rgba(${color},0.5)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.beginPath(); ctx.arc(m, m, r * 1.5, 0, PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(m, m, r + 1, 0, PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  ctx.beginPath(); ctx.arc(m, m, r, 0, PI * 2); ctx.fillStyle = `rgba(${color},1)`; ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const STYLE_ID = 'ccf-globe-style';
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .g-wrap{position:relative;margin:0 auto;opacity:0;transform:scale(.85)}
  .g-wrap.ready{animation:gReveal 1.4s cubic-bezier(.34,1.56,.64,1) forwards}
  @keyframes gReveal{0%{opacity:0;transform:scale(.85)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}
  @media (prefers-reduced-motion:reduce){.g-wrap{opacity:1;transform:none}.g-wrap.ready{animation:none}}
  .g-glow{position:absolute;inset:-15%;border-radius:50%;pointer-events:none;background:radial-gradient(circle,var(--g-glow,rgba(95,169,227,.14)) 0%,transparent 65%)}
  .g-wrap canvas{position:absolute;inset:0;display:block}
  .g-clouds{z-index:2;cursor:grab;touch-action:pan-y}
  .g-stem{position:absolute;inset:0;pointer-events:none;transition:opacity .25s}
  .g-tip{position:absolute;pointer-events:none;z-index:11;max-width:220px;white-space:nowrap;text-align:left;
    padding:8px 14px;border-radius:12px;transform:translate(-80%,0);opacity:0;transition:opacity .25s;
    background:var(--g-tip-bg,rgba(20,20,30,.55));color:var(--g-tip-fg,#fff);
    backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
    border:1px solid var(--g-tip-border,rgba(255,255,255,.15));box-shadow:0 4px 24px rgba(0,0,0,.2)}
  .g-tip.on{opacity:1}
  .g-tip b{display:block;font-size:.8rem;font-weight:600;white-space:normal;line-height:1.4}
  .g-tip span{font-size:.7rem;opacity:.65}`;
  document.head.appendChild(s);
}

export function mountGlobe(host, opts = {}) {
  const o = {
    marker: '239,142,47',
    hover: '196,74,26',
    maxSize: 720,
    cloudOpacity: 0.2,
    onReady: null,
    ...opts,
  };
  injectStyles();

  const wrap = document.createElement('div');
  wrap.className = 'g-wrap notranslate';
  wrap.setAttribute('translate', 'no');
  wrap.innerHTML = `<div class="g-glow"></div><canvas class="g-earth"></canvas><canvas class="g-clouds" aria-label="Interactive globe of Compassion Course participants. Drag to spin."></canvas>
    <svg class="g-stem"><line stroke-width="1.5" stroke-dasharray="4 3"/><circle/></svg>
    <div class="g-tip" role="status"><b></b><span></span></div>`;
  host.appendChild(wrap);
  const earthCanvas = wrap.querySelector('.g-earth');
  const cloudCanvas = wrap.querySelector('.g-clouds');
  const stem = wrap.querySelector('.g-stem');
  const stemLine = stem.querySelector('line');
  const stemDot = stem.querySelector('circle');
  const tipEl = wrap.querySelector('.g-tip');
  stemLine.setAttribute('stroke', `rgba(${o.marker},0.7)`);

  let size = 500;
  const isMobile = () => window.innerWidth <= 1080;

  // tooltip state
  const tip = { visible: false, idx: -1, x: 0, y: 0, behind: false };
  const anchor = () => ({ x: size * 0.82, y: size * 0.08 });
  function renderTip() {
    const show = tip.visible && !isMobile();
    tipEl.classList.toggle('on', show);
    stem.style.display = show ? '' : 'none';
    if (!show) return;
    const a = anchor();
    tipEl.style.left = a.x + 'px';
    tipEl.style.top = a.y + 'px';
    stem.style.zIndex = tip.behind ? -1 : 3;
    stemLine.setAttribute('x1', a.x); stemLine.setAttribute('y1', a.y + 30);
    stemLine.setAttribute('x2', tip.x); stemLine.setAttribute('y2', tip.y);
    stemDot.setAttribute('cx', tip.x); stemDot.setAttribute('cy', tip.y);
    stemDot.setAttribute('r', tip.behind ? 2.5 : 3.5);
    stemDot.setAttribute('fill', tip.behind ? 'none' : `rgba(${o.marker},0.9)`);
    stemDot.setAttribute('stroke', tip.behind ? `rgba(${o.marker},0.5)` : 'white');
    stemDot.setAttribute('stroke-width', tip.behind ? 1 : 1.5);
  }
  function showTip(idx, x, y) {
    const [, , count, names] = CLUSTERS[idx];
    tipEl.querySelector('b').textContent = (names[0] || 'This region') + (names.length > 1 ? ` +${names.length - 1} more` : '');
    tipEl.querySelector('span').textContent = `${count} participant${count !== 1 ? 's' : ''} in this area`;
    Object.assign(tip, { visible: true, idx, x, y, behind: false });
    renderTip();
  }
  function hideTip() { if (tip.visible) { tip.visible = false; tip.idx = -1; renderTip(); } }

  // --- three setup ---
  const dpr = Math.min(window.devicePixelRatio, 2);
  const scene = new THREE.Scene();
  const cloudScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 3.45);
  const renderer = new THREE.WebGLRenderer({ canvas: earthCanvas, alpha: true, antialias: true });
  const cloudRenderer = new THREE.WebGLRenderer({ canvas: cloudCanvas, alpha: true, antialias: false });
  for (const r of [renderer, cloudRenderer]) { r.setPixelRatio(dpr); r.outputColorSpace = THREE.SRGBColorSpace; }

  scene.add(new THREE.AmbientLight(0xfff5e6, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 1, 3); scene.add(dl);
  const fl = new THREE.DirectionalLight(0xc4dff6, 0.3); fl.position.set(-2, -0.5, -1); scene.add(fl);

  const loader = new THREE.TextureLoader();
  const earthMat = new THREE.MeshPhongMaterial({ shininess: 15, specular: new THREE.Color(0x333333) });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
  scene.add(earth);
  loader.load(asset('./textures/earth-day.jpg'), (t) => {
    t.colorSpace = THREE.SRGBColorSpace; earthMat.map = t; earthMat.needsUpdate = true;
    wrap.classList.add('ready'); o.onReady && o.onReady();
  });
  loader.load(asset('./textures/earth-topology.png'), (t) => { earthMat.bumpMap = t; earthMat.bumpScale = 0.02; earthMat.needsUpdate = true; });

  const cloudMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: o.cloudOpacity, depthWrite: false });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.02, 48, 48), cloudMat);
  cloudScene.add(clouds);
  loader.load(asset('./textures/earth-clouds.png'), (t) => { t.colorSpace = THREE.SRGBColorSpace; cloudMat.map = t; cloudMat.needsUpdate = true; });

  const tex = markerTexture(o.marker), hoverTex = markerTexture(o.hover);
  const maxCount = Math.max(...CLUSTERS.map((c) => c[2]));
  const group = new THREE.Group();
  const sprites = [], scales = [];
  for (const [lat, lon, count] of CLUSTERS) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
    s.position.copy(latLonToVec3(lat, lon, 1.005));
    const sc = 0.022 + (Math.log2(count + 1) / Math.log2(maxCount + 1)) * 0.05;
    s.scale.set(sc, sc, 1);
    scales.push(sc); sprites.push(s); group.add(s);
  }
  const tilt = 0.25;
  earth.rotation.x = clouds.rotation.x = group.rotation.x = tilt;
  scene.add(group);

  function resize() {
    size = Math.min(host.clientWidth || 500, o.maxSize);
    wrap.style.width = wrap.style.height = size + 'px';
    stem.setAttribute('width', size); stem.setAttribute('height', size);
    renderer.setSize(size, size); cloudRenderer.setSize(size, size);
    renderTip();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  // --- interaction state ---
  let down = false, lastX = 0, sx0 = 0, sy0 = 0, t0 = 0, vel = 0, target = 0, smooth = 0, drift = 0;
  let autoOn = true, lastAuto = 0, lastAutoIdx = -1, autoTimer = null, lastInteract = 0, userSel = false, hovered = -1;
  const camDir = () => camera.position.clone().negate().normalize();
  const project = (s) => { const p = s.getWorldPosition(new THREE.Vector3()).project(camera); return [(p.x * 0.5 + 0.5) * size, (-p.y * 0.5 + 0.5) * size]; };
  const isBack = (s) => camDir().dot(s.getWorldPosition(new THREE.Vector3()).normalize()) > 0.15;
  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = earthCanvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(sprites);
    if (!hit.length) return -1;
    const i = sprites.indexOf(hit[0].object);
    return i >= 0 && !isBack(sprites[i]) ? i : -1;
  }
  function unhover() {
    if (hovered < 0) return;
    sprites[hovered].scale.set(scales[hovered], scales[hovered], 1);
    sprites[hovered].material.map = tex;
    hovered = -1;
  }

  // --- animation ---
  let frame = 0, visible = true;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 });
  io.observe(wrap);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate() {
    frame = requestAnimationFrame(animate);
    if (!visible) return;
    if (!down) { vel *= 0.95; target += (reduced ? 0.00015 : 0.0006) + vel; }
    smooth += (target - smooth) * 0.15;
    drift += 0.00012;
    earth.rotation.y = group.rotation.y = smooth;
    clouds.rotation.y = smooth * 0.25 + drift;
    clouds.rotation.x = tilt + Math.sin(drift * 0.8) * 0.06;
    clouds.rotation.z = Math.sin(drift * 0.4) * 0.03;
    renderer.render(scene, camera);
    cloudRenderer.render(cloudScene, camera);

    if (tip.visible && tip.idx >= 0) {
      const [x, y] = project(sprites[tip.idx]);
      const b = isBack(sprites[tip.idx]);
      if (Math.abs(tip.x - x) >= 0.5 || Math.abs(tip.y - y) >= 0.5 || b !== tip.behind) { tip.x = x; tip.y = y; tip.behind = b; renderTip(); }
    }

    const now = Date.now();
    if (autoOn && !userSel && !down && !isMobile() && !tip.visible && now - lastAuto > AUTO_SELECT_INTERVAL) {
      const cd = camDir();
      let best = -1, bestScore = -Infinity;
      for (let i = 0; i < sprites.length; i++) {
        if (i === lastAutoIdx) continue;
        const d = cd.dot(sprites[i].getWorldPosition(new THREE.Vector3()).normalize());
        if (d > -0.3) continue;
        if (-d > bestScore && CLUSTERS[i][2] >= 3) { bestScore = -d; best = i; }
      }
      if (best >= 0) {
        lastAuto = now; lastAutoIdx = best;
        const [x, y] = project(sprites[best]);
        showTip(best, x, y);
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => { if (tip.idx === best) hideTip(); }, AUTO_SELECT_DURATION);
      }
    }
  }
  animate();

  const scheduleResume = () => setTimeout(() => {
    if (Date.now() - lastInteract >= AUTO_SELECT_RESUME_MS - 100) { autoOn = true; userSel = false; }
  }, AUTO_SELECT_RESUME_MS);

  cloudCanvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    down = true; lastX = sx0 = e.clientX; sy0 = e.clientY; t0 = Date.now(); vel = 0;
    cloudCanvas.style.cursor = 'grabbing';
    autoOn = false; lastInteract = Date.now(); clearTimeout(autoTimer);
  });
  cloudCanvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    const dist = Math.hypot(e.clientX - sx0, e.clientY - sy0);
    down = false; cloudCanvas.style.cursor = 'grab';
    if (dist < 5 && Date.now() - t0 < 400 && !isMobile()) {
      const i = pick(e);
      if (i >= 0) { const [x, y] = project(sprites[i]); showTip(i, x, y); } else hideTip();
      userSel = true;
    }
    scheduleResume();
  });
  cloudCanvas.addEventListener('pointerout', () => { down = false; cloudCanvas.style.cursor = 'grab'; unhover(); });
  cloudCanvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (down) {
      const dx = e.clientX - lastX; lastX = e.clientX;
      target += dx / 150; vel = dx / 150;
      hideTip(); unhover();
      return;
    }
    if (isMobile()) return;
    const i = pick(e);
    if (i !== hovered) {
      unhover();
      if (i >= 0) { sprites[i].scale.set(scales[i] * 1.6, scales[i] * 1.6, 1); sprites[i].material.map = hoverTex; cloudCanvas.style.cursor = 'pointer'; }
      else cloudCanvas.style.cursor = 'grab';
      hovered = i;
    }
  });
  // Touch: horizontal drags spin the globe, vertical drags scroll the page
  // (so a globe placed mid-page never traps the reader's scroll).
  let touchAxis = null, ty0 = 0;
  cloudCanvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (!t) return;
    down = true; lastX = sx0 = t.clientX; ty0 = t.clientY; touchAxis = null; vel = 0;
  }, { passive: true });
  cloudCanvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (!down || !t) return;
    if (!touchAxis) {
      const ax = Math.abs(t.clientX - sx0), ay = Math.abs(t.clientY - ty0);
      if (ax < 6 && ay < 6) return;
      touchAxis = ax > ay ? 'x' : 'y';
      if (touchAxis === 'y') { down = false; return; }
      autoOn = false; lastInteract = Date.now();
    }
    e.preventDefault();
    const dx = t.clientX - lastX; lastX = t.clientX; target += dx / 150; vel = dx / 150;
  }, { passive: false });
  cloudCanvas.addEventListener('touchend', () => { down = false; scheduleResume(); });

  return {
    destroy() {
      cancelAnimationFrame(frame); ro.disconnect(); io.disconnect();
      renderer.dispose(); cloudRenderer.dispose(); wrap.remove();
    },
  };
}
