(async () => {
const THREE = await import('https://unpkg.com/three@0.179.0/build/three.module.js');

/* ------------------------------------------------------------------ *
 *  Голубая точка — 3D-Земля, которая меняет позу при скролле.
 *  Разметка и стили — index.html / css/style.css (контракт по id/классам).
 * ------------------------------------------------------------------ */

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth < 768;
const lowEnd = isMobile() || (navigator.deviceMemory && navigator.deviceMemory < 4);
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

const DEG = Math.PI / 180;
const sections = [...document.querySelectorAll('.scene[data-scene]')];

/* ---------- Позы Земли для каждой секции ----------
 * x, y   — центр глобуса в долях половины экрана (-1…1, y вверх)
 * size   — диаметр: доля высоты экрана (десктоп) или ширины (мобильные)
 * lat/lon — точка поверхности, повёрнутая к зрителю
 * sunAz/sunEl — откуда светит Солнце (0° — из-за спины зрителя, 90° — справа)
 * clouds — непрозрачность облаков, spin — вес медленного вращения        */
const POSES = {
  hero:      { x: 0,     y: -0.02, size: 0.82, lat: 18,  lon: 15,   sunAz: -55, sunEl: 18, clouds: 0.9,  spin: 1 },
  cosmos:    { x: 0.44,  y: 0,     size: 0.70, lat: 8,   lon: 70,   sunAz: -80, sunEl: 6,  clouds: 0.9,  spin: 0 },
  structure: { x: -0.42, y: 0,     size: 0.80, lat: 22,  lon: 84,   sunAz: -35, sunEl: 15, clouds: 0.5,  spin: 0 }, // Гималаи: здесь кора толще всего
  oceans:    { x: 0.44,  y: 0,     size: 0.86, lat: -8,  lon: -172, sunAz: -30, sunEl: 20, clouds: 0.45, spin: 0 },
  life:      { x: -0.42, y: 0,     size: 0.86, lat: -6,  lon: -62,  sunAz: -40, sunEl: 15, clouds: 0.7,  spin: 0 },
  night:     { x: 0.42,  y: 0,     size: 0.84, lat: 38,  lon: 12,   sunAz: 155, sunEl: 5,  clouds: 0.12, spin: 0 },
  finale:    { x: 0.42,  y: 0,     size: 0.74, lat: 15,  lon: 0,    sunAz: -50, sunEl: 15, clouds: 0.9,  spin: 1 },
};
// На телефоне глобус над панелью текста, по центру по горизонтали
const MOBILE = {
  hero:      { x: 0, y: 0.10, size: 0.98 },
  cosmos:    { x: 0, y: 0.40, size: 0.80 },
  structure: { x: 0, y: 0.40, size: 0.86 },
  oceans:    { x: 0, y: 0.38, size: 1.0 },
  life:      { x: 0, y: 0.40, size: 0.92 },
  night:     { x: 0, y: 0.40, size: 0.92 },
  finale:    { x: 0, y: 0.40, size: 0.88 },
};
const poseFor = (name) => (isMobile() ? { ...POSES[name], ...MOBILE[name] } : POSES[name]);

/* ---------- Общая часть: активная секция, точки навигации, счётчики ---------- */

const dots = [...document.querySelectorAll('.dots [data-target]')];
let activeScene = sections[0]?.dataset.scene || 'hero';

function setScene(name) {
  activeScene = name;
  root.dataset.scene = name;
  for (const d of dots) {
    const on = d.dataset.target === name;
    d.classList.toggle('is-active', on);
    if (on) d.setAttribute('aria-current', 'true');
    else d.removeAttribute('aria-current');
  }
}
setScene(activeScene);

const ruFormat = (value, decimals) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

function runCounters(section) {
  if (reduceMotion || !gsap) return;
  for (const el of section.querySelectorAll('.count[data-to]')) {
    const to = parseFloat(el.dataset.to);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const state = { v: 0 };
    gsap.to(state, {
      v: to, duration: 1.8, ease: 'power2.out',
      onUpdate: () => { el.textContent = ruFormat(state.v, decimals); },
    });
  }
}

if (gsap && ScrollTrigger) {
  for (const section of sections) {
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      end: 'bottom center',
      onToggle: (self) => self.isActive && setScene(section.dataset.scene),
    });
    ScrollTrigger.create({ trigger: section, start: 'top 70%', once: true, onEnter: () => runCounters(section) });

    const panel = section.querySelector('.panel');
    if (panel && !reduceMotion && section !== sections[0]) {
      gsap.from(panel, {
        y: 40, opacity: 0.15, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: section, start: 'top 75%', once: true },
      });
    }
  }
}

/* ---------- WebGL ---------- */

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const canvas = document.getElementById('globe');
if (!canvas || !hasWebGL()) {
  root.classList.add('no-webgl', 'is-loaded');
} else {
  initGlobe(canvas);
}

function initGlobe(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowEnd ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  camera.position.set(0, 0, 6);

  /* --- загрузка текстур с прогрессом --- */
  const loaderBar = document.querySelector('#loader .loader-bar span');
  const loaderPct = document.querySelector('#loader .loader-pct');
  const reveal = () => root.classList.add('is-loaded');
  const manager = new THREE.LoadingManager(reveal, (_url, loaded, total) => {
    const pct = Math.round((loaded / total) * 100);
    if (loaderBar) loaderBar.style.width = pct + '%';
    if (loaderPct) loaderPct.textContent = pct + ' %';
  });
  manager.onError = (url) => console.warn('Не загрузилась текстура', url);
  setTimeout(reveal, 12000);

  const texLoader = new THREE.TextureLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (src, color = true) => {
    // при открытии файла двойным кликом (file://) текстуры берутся из js/textures.js
    const t = texLoader.load(window.EARTH_TEXTURES?.[src] || src);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    return t;
  };
  const dayMap = tex(lowEnd ? 'textures/earth_atmos_2048.jpg' : 'textures/earth-blue-marble.jpg');
  const nightMap = tex(lowEnd ? 'textures/earth_lights_2048.png' : 'textures/earth-night.jpg');
  const specMap = tex('textures/earth_specular_2048.jpg', false);
  const cloudMap = tex('textures/earth_clouds_1024.png');

  const sunDir = new THREE.Vector3(-0.6, 0.3, 0.7).normalize();

  /* --- Земля: день/ночь по положению Солнца, блики на воде, дымка у края --- */
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: dayMap }, nightMap: { value: nightMap }, specMap: { value: specMap }, sunDir: { value: sunDir }, glintAmt: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap, nightMap, specMap; uniform vec3 sunDir; uniform float glintAmt;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vP);
        vec3 L = normalize(sunDir);
        float ndl = dot(N, L);
        float dayAmt = smoothstep(-0.12, 0.25, ndl);

        vec3 day = texture2D(dayMap, vUv).rgb;
        vec3 night = texture2D(nightMap, vUv).rgb;
        float water = texture2D(specMap, vUv).r;

        vec3 col = day * (0.035 + 1.1 * max(ndl, 0.0));
        float glint = pow(max(dot(N, normalize(L + V)), 0.0), 320.0) * water * dayAmt;
        col += vec3(1.0, 0.92, 0.8) * glint * 0.18 * glintAmt;
        // огни городов: яркие пиксели усиливаются сильнее тёмного фона ночной текстуры
        float lum = max(night.r, max(night.g, night.b));
        float boost = 1.8 + 4.2 * smoothstep(0.12, 0.6, lum);
        col += night * vec3(1.0, 0.8, 0.5) * boost * (1.0 - smoothstep(-0.2, 0.06, ndl));

        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += vec3(0.30, 0.58, 1.0) * fres * (0.04 + 0.4 * smoothstep(-0.25, 0.6, ndl));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

  const earthGroup = new THREE.Group(); // позиция и масштаб
  const earthSpin = new THREE.Group();  // поворот к нужной точке
  earthGroup.add(earthSpin);
  scene.add(earthGroup);

  const segs = lowEnd ? 64 : 128;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, segs, segs / 2), earthMat);
  earthSpin.add(earth);

  /* --- облака отдельным слоем, медленно плывут --- */
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { cloudMap: { value: cloudMap }, sunDir: { value: sunDir }, opacity: { value: 0.9 } },
    vertexShader: earthMat.vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float opacity;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vec4 c = texture2D(cloudMap, vUv);
        float ndl = dot(normalize(vN), normalize(sunDir));
        float lit = smoothstep(-0.15, 0.45, ndl);
        float a = c.a * opacity * (0.12 + 0.88 * lit);
        gl_FragColor = vec4(vec3(0.03 + 0.97 * lit), a);
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, segs, segs / 2), cloudMat);
  earthSpin.add(clouds);

  /* --- атмосфера: свечение по краю, ярче со стороны Солнца --- */
  const atmoMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: /* glsl */ `
      varying vec3 vNv; varying vec3 vNw;
      void main() {
        vNv = normalize(normalMatrix * normal);
        vNw = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir; varying vec3 vNv; varying vec3 vNw;
      void main() {
        // задние грани: у края Земли -z ≈ 0.42, у внешней кромки ≈ 0 — свечение гаснет к кромке
        float rim = pow(clamp(-vNv.z * 2.4, 0.0, 1.0), 1.8);
        float sun = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(vNw, normalize(sunDir)));
        // альфа = сила свечения: иначе кольцо закрашивает фон страницы непрозрачным тёмным
        float glow = rim * sun;
        gl_FragColor = vec4(vec3(0.55, 0.78, 1.0), glow * 0.75);
        #include <colorspace_fragment>
      }`,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 32), atmoMat);
  earthGroup.add(atmosphere);

  /* --- звёзды --- */
  const starCount = lowEnd ? 1400 : 2800;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const r = 40 + Math.random() * 50;
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
    tint.setHSL(0.55 + Math.random() * 0.12, 0.5, 0.65 + Math.random() * 0.35);
    if (Math.random() < 0.12) tint.setHSL(0.09, 0.6, 0.8);
    starCol.set([tint.r, tint.g, tint.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const dotSprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 0.32, map: dotSprite, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9,
  }));
  scene.add(stars);

  /* --- размеры и якоря секций --- */
  let anchors = [];
  function measure() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const maxScroll = document.documentElement.scrollHeight - h;
    // десктоп: поза держится, когда центр секции в центре экрана;
    // телефон: когда секция у верха экрана — глобус сверху, панель под ним
    anchors = sections.map((s) => {
      const top = s.getBoundingClientRect().top + scrollY;
      const at = isMobile() ? top + Math.max(s.offsetHeight - h, 0) * 0.35 : top + s.offsetHeight / 2 - h / 2;
      return Math.min(Math.max(at, 0), maxScroll);
    });
  }
  measure();
  addEventListener('resize', measure);
  ScrollTrigger?.addEventListener('refresh', measure);
  document.fonts?.ready.then(measure);

  /* --- целевая поза из позиции скролла: «держим» позу у центра секции --- */
  const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, t) => { const x = Math.min(Math.max((t - a) / (b - a), 0), 1); return x * x * (3 - 2 * x); };

  function targetPose() {
    const y = scrollY;
    let i = 0;
    while (i < anchors.length - 1 && y >= anchors[i + 1]) i++;
    const A = poseFor(sections[i].dataset.scene);
    if (i === anchors.length - 1) return { ...A, progress: i };
    const span = anchors[i + 1] - anchors[i] || 1;
    const t = smooth(0.18, 0.82, (y - anchors[i]) / span);
    const B = poseFor(sections[i + 1].dataset.scene);
    const out = { progress: i + t };
    for (const k of ['x', 'y', 'size', 'lat', 'sunEl', 'clouds', 'spin']) out[k] = lerp(A[k], B[k], t);
    out.lon = A.lon + wrap180(B.lon - A.lon) * t;
    out.sunAz = A.sunAz + wrap180(B.sunAz - A.sunAz) * t;
    return out;
  }

  const cur = { ...targetPose() };

  /* --- вращение рукой: после отпускания возвращается в позу секции --- */
  const user = { yaw: 0, pitch: 0 };
  let drag = null;
  let dragMoved = false; // чтобы отпускание глобуса после вращения не считалось кликом мимо
  let globeScreen = { x: 0, y: 0, r: 0 };
  const overGlobe = (e) => Math.hypot(e.clientX - globeScreen.x, e.clientY - globeScreen.y) < globeScreen.r;

  canvas.addEventListener('pointerdown', (e) => {
    if (!overGlobe(e)) return;
    gsap?.killTweensOf(user);
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragMoved = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { canvas.style.cursor = overGlobe(e) ? 'grab' : ''; return; }
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) dragMoved = true;
    user.yaw += (e.clientX - drag.x) * 0.006;
    user.pitch = Math.max(-0.7, Math.min(0.7, user.pitch + (e.clientY - drag.y) * 0.006));
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const release = () => {
    if (!drag) return;
    drag = null;
    canvas.style.cursor = '';
    if (gsap) gsap.to(user, { yaw: 0, pitch: 0, duration: reduceMotion ? 0.3 : 1.8, delay: 0.8, ease: 'power3.inOut' });
    else { user.yaw = 0; user.pitch = 0; }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* --- маркеры: список .marker-data внутри секции, видны только в своей секции --- */
  const markerLayer = document.getElementById('markers');
  const markers = [...document.querySelectorAll('.marker-data li')].map((li) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'marker is-hidden';
    btn.setAttribute('aria-expanded', 'false');
    const dot = document.createElement('span'); dot.className = 'marker-dot';
    const label = document.createElement('span'); label.className = 'marker-label'; label.textContent = li.dataset.title;
    const tip = document.createElement('span'); tip.className = 'marker-tip'; tip.textContent = li.textContent.trim();
    btn.append(dot, label, tip);
    markerLayer?.append(btn);
    const lat = parseFloat(li.dataset.lat) * DEG;
    const phi = ((parseFloat(li.dataset.lon) + 180) / 360) * Math.PI * 2;
    const theta = Math.PI / 2 - lat;
    const local = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    // zoom — радиус глобуса при приближении: чем больше, тем ближе (2.9 ≈ обзор 4000 км)
    const section = li.closest('.scene');
    return {
      btn, local, data: li.dataset, tip: tip.textContent,
      scene: section?.dataset.scene, panel: section?.querySelector('.panel'),
      lat: parseFloat(li.dataset.lat), lon: parseFloat(li.dataset.lon), zoom: parseFloat(li.dataset.zoom) || 2.9,
    };
  });
  const closeAll = (except) => {
    for (const m of markers) if (m.btn !== except) { m.btn.classList.remove('is-open'); m.btn.setAttribute('aria-expanded', 'false'); }
  };
  /* --- приближение к выбранному месту: глобус разворачивается и наезжает на точку --- */
  const focus = { v: 0, lat: 0, lon: 0, zoom: 2.9, marker: null, scrollY: 0 };
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'focus-back';
  backBtn.textContent = '← Назад к глобусу';
  document.body.append(backBtn);

  // вид с высоты: после наезда глобуса проявляется снимок места крупным планом
  const aerial = document.createElement('figure');
  aerial.className = 'aerial';
  aerial.innerHTML = `<div class="aerial-img" role="img"></div>
    <figcaption class="aerial-caption">
      <p class="aerial-eyebrow">Вид сверху</p>
      <h3 class="aerial-title"></h3>
      <p class="aerial-tip"></p>
      <p class="aerial-view"></p>
      <p class="aerial-credit"></p>
    </figcaption>`;
  document.body.append(aerial);
  const aerialImg = aerial.querySelector('.aerial-img');
  let aerialTimer = 0;

  function showAerial(m) {
    if (!m.data.img) return;
    aerialImg.style.backgroundImage = `url("${m.data.img}")`;
    aerialImg.style.filter = m.data.bright ? `brightness(${m.data.bright})` : '';
    // для вида сбоку «снижение» идёт к вершине, а не к центру кадра
    aerialImg.style.transformOrigin = m.data.origin || '';
    aerialImg.style.backgroundPosition = m.data.origin || '';
    aerialImg.style.setProperty('--aerial-scale', m.data.scale || '1.45');
    aerial.classList.toggle('aerial--side', m.data.layout === 'side');
    aerialImg.setAttribute('aria-label', m.data.view || m.data.title);
    aerial.querySelector('.aerial-eyebrow').textContent = m.data.eyebrow || 'Вид сверху';
    aerial.querySelector('.aerial-title').textContent = m.data.title;
    aerial.querySelector('.aerial-tip').textContent = m.tip;
    aerial.querySelector('.aerial-view').textContent = m.data.view || '';
    const credit = aerial.querySelector('.aerial-credit');
    credit.textContent = m.data.credit || '';
    credit.title = m.data.credit || '';
    // перезапуск медленного «снижения» над местом
    aerialImg.classList.remove('is-moving');
    void aerialImg.offsetWidth;
    aerialImg.classList.add('is-moving');
    root.classList.add('is-aerial');
  }

  function focusOn(m) {
    closeAll(m.btn);
    m.btn.classList.add('is-open');
    m.btn.setAttribute('aria-expanded', 'true');
    Object.assign(focus, { marker: m, lat: m.lat, lon: m.lon, zoom: m.zoom, scrollY });
    root.classList.add('is-focused');
    root.classList.remove('is-aerial');
    clearTimeout(aerialTimer);
    if (m.data.img) new Image().src = m.data.img; // подгрузить снимок, пока глобус поворачивается
    gsap?.killTweensOf(focus);
    if (gsap && !reduceMotion) {
      gsap.to(focus, { v: 1, duration: 1.8, ease: 'power3.inOut' });
      aerialTimer = setTimeout(() => showAerial(m), 1900);
    } else {
      focus.v = 1;
      showAerial(m);
    }
  }
  function unfocus() {
    if (!focus.marker) return;
    focus.marker = null;
    clearTimeout(aerialTimer);
    closeAll(null);
    root.classList.remove('is-focused', 'is-aerial');
    gsap?.killTweensOf(focus);
    if (gsap && !reduceMotion) gsap.to(focus, { v: 0, duration: 1.3, ease: 'power3.inOut' });
    else focus.v = 0;
  }
  for (const m of markers) {
    m.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (focus.marker === m) unfocus();
      else focusOn(m);
    });
  }
  backBtn.addEventListener('click', (e) => { e.stopPropagation(); unfocus(); });
  aerial.addEventListener('click', (e) => e.stopPropagation()); // клик по снимку не закрывает его
  document.addEventListener('click', () => { if (!dragMoved) unfocus(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') unfocus(); });
  addEventListener('scroll', () => { if (Math.abs(scrollY - focus.scrollY) > 80) unfocus(); }, { passive: true });

  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  function updateMarkers(settled) {
    if (focus.marker && (focus.marker.scene !== activeScene || !settled)) unfocus();
    if (!settled) closeAll(null);
    // маркер не должен ложиться поверх текста панели (на телефоне панель перекрывает низ глобуса)
    const panel = sections.find((s) => s.dataset.scene === activeScene)?.querySelector('.panel');
    const pr = settled && panel ? panel.getBoundingClientRect() : null;
    const underPanel = (x, y) => pr && x > pr.left - 12 && x < pr.right + 12 && y > pr.top - 12 && y < pr.bottom + 12;
    for (const m of markers) {
      const show = settled && m.scene === activeScene;
      tmp.copy(m.local).applyMatrix4(earth.matrixWorld);
      nrm.copy(m.local).transformDirection(earth.matrixWorld);
      toCam.copy(camera.position).sub(tmp).normalize();
      const facing = nrm.dot(toCam) > 0.25;
      tmp.project(camera);
      const sx = (tmp.x * 0.5 + 0.5) * innerWidth;
      const sy = (-tmp.y * 0.5 + 0.5) * innerHeight;
      m.btn.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      // при приближении видна только выбранная точка, панель текста в это время приглушена
      const visible = show && facing && (focus.marker ? focus.marker === m : !underPanel(sx, sy));
      m.btn.classList.toggle('is-hidden', !visible);
      m.btn.classList.toggle('is-flip', sx > innerWidth * 0.55);
      m.btn.tabIndex = visible ? 0 : -1;
    }
  }

  /* --- вступление: «восход» над планетой --- */
  const intro = { v: reduceMotion ? 1 : 0 };
  const startIntro = () => {
    if (!reduceMotion && gsap) gsap.to(intro, { v: 1, duration: 2.8, ease: 'power2.out' });
    else intro.v = 1;
  };
  if (root.classList.contains('is-loaded')) startIntro();
  else new MutationObserver((_, obs) => {
    if (root.classList.contains('is-loaded')) { obs.disconnect(); startIntro(); }
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  /* --- кадр --- */
  let spinOffset = 0;
  let last = performance.now();
  const clock = { t: 0 };

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock.t += dt;

    const target = targetPose();
    const k = 1 - Math.exp(-dt * (reduceMotion ? 14 : 3.2));
    for (const key of ['x', 'y', 'size', 'lat', 'sunEl', 'clouds', 'spin', 'progress']) cur[key] = lerp(cur[key], target[key], k);
    cur.lon += wrap180(target.lon - cur.lon) * k;
    cur.sunAz += wrap180(target.sunAz - cur.sunAz) * k;

    // медленное вращение в первой и последней секции
    if (!reduceMotion && !drag) {
      spinOffset += dt * 0.06 * cur.spin;
      if (cur.spin > 0.999) spinOffset = ((spinOffset + Math.PI) % (Math.PI * 2)) - Math.PI;
    }

    // позиция и масштаб в мировых единицах
    const visH = 2 * Math.tan((camera.fov * DEG) / 2) * camera.position.z;
    const visW = visH * camera.aspect;
    const diameterPx = cur.size * (isMobile() ? innerWidth : innerHeight);
    const iv = intro.v;
    // fv — приближение к выбранной точке (радиус глобуса focus.zoom, камера на расстоянии 6)
    const fv = focus.v;
    const scale = lerp((diameterPx / innerHeight) * visH / 2 * lerp(0.82, 1, iv), focus.zoom, fv);
    earthGroup.position.set(
      lerp(cur.x * visW / 2, 0, fv),
      lerp(cur.y * visH / 2 - (1 - iv) * 0.25, 0, fv),
      0,
    );
    earthGroup.scale.setScalar(scale);

    earthSpin.rotation.set(
      lerp(cur.lat, focus.lat, fv) * DEG + user.pitch,
      -(cur.lon + wrap180(focus.lon - cur.lon) * fv + 90) * DEG + user.yaw + spinOffset * cur.spin * (1 - fv),
      0,
    );
    clouds.rotation.y = clock.t * (reduceMotion ? 0 : 0.008);
    cloudMat.uniforms.opacity.value = lerp(cur.clouds, 0.08, fv);
    earthMat.uniforms.glintAmt.value = 1 - fv; // блик не закрывает выбранное место

    const az = lerp(lerp(165, cur.sunAz, iv), -25, fv) * DEG;
    const el = lerp(cur.sunEl, 12, fv) * DEG;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

    stars.rotation.y = cur.progress * 0.06 + (reduceMotion ? 0 : clock.t * 0.002);
    stars.rotation.x = cur.progress * 0.02;

    // экранная окружность глобуса — для перетаскивания
    tmp.copy(earthGroup.position).project(camera);
    globeScreen = {
      x: (tmp.x * 0.5 + 0.5) * innerWidth,
      y: (-tmp.y * 0.5 + 0.5) * innerHeight,
      r: (scale / (visH / 2)) * (innerHeight / 2),
    };

    renderer.render(scene, camera);
    updateMarkers(Math.abs(target.progress - cur.progress) < 0.04 && Math.abs(target.progress - Math.round(target.progress)) < 0.02);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
})();
