import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// let the first screen paint before the scene is built (hidden tabs get no frames, hence the timeout race)
await new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 150); });

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 900px)').matches;
const canvas = document.getElementById('gl');
const tour = document.querySelector('.tour');
const labelBox = document.getElementById('labels');
const navBtns = [...document.querySelectorAll('.tour-nav button')];
const nav = document.querySelector('.tour-nav');
const stopEls = [...document.querySelectorAll('.stop')];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let dpr = Math.min(devicePixelRatio, 1.5);   // 2x retina doubled the pixel cost for no visible gain on a dark scene
renderer.setPixelRatio(dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const bgTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), gr = g.createRadialGradient(330, 220, 10, 300, 260, 420);
  gr.addColorStop(0, '#33240f'); gr.addColorStop(.45, '#150f09'); gr.addColorStop(1, '#0a0806');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
scene.background = bgTex;
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = env;

const key = new THREE.DirectionalLight('#fff0d2', 2.4); key.position.set(4, 6, 5); scene.add(key);
const rim = new THREE.DirectionalLight('#c9d8ff', 1.1); rim.position.set(-5, 2, -4); scene.add(rim);

/* ---------- materials ---------- */
const gold = new THREE.MeshPhysicalMaterial({ color: '#e9b54d', metalness: 1, roughness: .17, envMapIntensity: 1.3 });
const whiteGold = new THREE.MeshPhysicalMaterial({ color: '#dedcd6', metalness: 1, roughness: .13, envMapIntensity: 1.3 });
// mirror-polished facets + iridescent fire: reads as a diamond and costs no extra render pass (transmission did)
const diamond = new THREE.MeshPhysicalMaterial({
  color: '#f3f6ff', metalness: 1, roughness: .02, iridescence: 1, iridescenceIOR: 1.8,
  iridescenceThicknessRange: [200, 900], envMapIntensity: 3.2, flatShading: true
});
const plinthMat = new THREE.MeshStandardMaterial({ color: '#070504', metalness: .2, roughness: .55, envMapIntensity: .25 });
const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f3c977').multiplyScalar(2.2), toneMapped: false });

/* ---------- helpers ---------- */
const flat = g => { g = g.toNonIndexed(); g.computeVertexNormals(); return g; };
// torus-like surface whose cross-section radii can vary along the ring: f(u, v) -> [radial, axial]
function ringSurface(R, f, nu, nv, arc = Math.PI * 2) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu * arc;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * Math.PI * 2, [rr, ra] = f(u, v);
      const d = R + rr * Math.cos(v);
      pos.push(d * Math.cos(u), d * Math.sin(u), ra * Math.sin(v));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const brilliant = s => flat(new THREE.LatheGeometry(
  [[.001, -.42], [.42, 0], [.42, .035], [.25, .17], [.001, .17]].map(([x, y]) => new THREE.Vector2(x * s, y * s)), 16));
function canvasTex(w, h, draw, srgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const SPACING = 7.5;
const stations = [];   // { group, labels: [[Vector3, text]] }
function station(i, group, labels) {
  const holder = new THREE.Group(); holder.position.set(i * SPACING, 0, 0);
  holder.add(group);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, .22, 96), plinthMat); plinth.position.y = -1.95;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.72, .012, 8, 160), glowMat); halo.rotation.x = Math.PI / 2; halo.position.y = -1.83;
  holder.add(plinth, halo);
  scene.add(holder);
  stations.push({ holder, group, labels: labels.map(([p, t]) => [new THREE.Vector3(...p), t]) });
  return holder;
}

/* 1. solitaire ring */
const ring = new THREE.Group();
{
  const band = new THREE.Mesh(ringSurface(1, () => [.1, .13], 220, 32), gold);
  ring.add(band);
  const head = new THREE.Group(); head.position.y = 1.05; ring.add(head);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.24, .12, .22, 32, 1, true), gold); cup.position.y = .1; head.add(cup);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, prong = new THREE.Mesh(new THREE.CapsuleGeometry(.035, .5, 4, 10), gold);
    prong.position.set(Math.cos(a) * .3, .36, Math.sin(a) * .3); prong.rotation.set(Math.sin(a) * .35, 0, -Math.cos(a) * .35);
    head.add(prong);
  }
  const stone = new THREE.Mesh(brilliant(1.15), diamond); stone.position.y = .56; head.add(stone);
  // pavé shoulders
  for (let k = -5; k <= 5; k++) {
    if (Math.abs(k) < 2) continue;
    const a = Math.PI / 2 + k * .13, s = new THREE.Mesh(brilliant(.22), diamond);
    s.position.set(Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0); s.rotation.z = a - Math.PI / 2; ring.add(s);
  }
  ring.rotation.x = -.15;
}
station(0, ring, [[[0, 1.75, 0], 'Pırlanta'], [[.34, 1.4, 0], 'Tırnak'], [[-1.12, -.2, 0], 'Gövde']]);

/* 2. wedding bands */
const bands = new THREE.Group();
{
  const a = new THREE.Mesh(ringSurface(.95, () => [.09, .26], 200, 32), gold);
  const inlay = new THREE.Mesh(ringSurface(1.045, () => [.018, .018], 200, 10), whiteGold);
  const ga = new THREE.Group(); ga.add(a, inlay); ga.position.set(-.45, .05, 0); ga.rotation.set(.2, .55, .1);
  const b = new THREE.Mesh(ringSurface(.82, (u, v) => [.08, .22], 200, 32), whiteGold);
  const gb = new THREE.Group(); gb.add(b); gb.position.set(.62, -.25, .25); gb.rotation.set(-.35, -.7, -.2);
  bands.add(ga, gb);
}
station(1, bands, [[[-1.2, .8, 0], 'Sarı altın'], [[1.3, -.6, .3], 'Beyaz altın']]);

/* 3. 22k twisted bangle + coins */
const coinFace = canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#d9d9d9'; g.lineWidth = 18; g.beginPath(); g.arc(256, 256, 236, 0, 7); g.stroke();
  g.fillStyle = '#c4c4c4'; for (let k = 0; k < 72; k++) { const a = k / 72 * 6.283; g.beginPath(); g.arc(256 + Math.cos(a) * 205, 256 + Math.sin(a) * 205, 5, 0, 7); g.fill(); }
  g.strokeStyle = '#bdbdbd'; g.lineWidth = 6; for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283; g.beginPath(); g.moveTo(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120); g.lineTo(256 + Math.cos(a) * 180, 256 + Math.sin(a) * 180); g.stroke(); }
  g.fillStyle = '#efefef'; g.font = '600 74px "Bodoni Moda", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('22', 256, 226); g.font = '500 40px Georgia, serif'; g.fillText('AYAR', 256, 290);
});
const reed = canvasTex(1024, 8, (g, w, h) => { for (let x = 0; x < w; x += 6) { g.fillStyle = x % 12 ? '#444' : '#ddd'; g.fillRect(x, 0, 6, h); } });
const goldFace = gold.clone(); goldFace.bumpMap = coinFace; goldFace.bumpScale = 4;
const goldEdge = gold.clone(); goldEdge.bumpMap = reed; goldEdge.bumpScale = 3;
const coinGeo = new THREE.CylinderGeometry(.55, .55, .07, 128);
const coin = () => new THREE.Mesh(coinGeo, [goldEdge, goldFace, goldFace]);
const bangle = new THREE.Group();
{
  const b = new THREE.Mesh(ringSurface(1.15, (u, v) => { const r = .15 * (1 + .2 * Math.cos(4 * v + 70 * u)); return [r, r]; }, 900, 48), gold);
  b.rotation.set(-1.05, .3, 0); b.position.y = .15; bangle.add(b);
  const c1 = coin(); c1.position.set(.9, -1.47, .9); bangle.add(c1);
  const c2 = coin(); c2.position.set(.9, -1.39, .9); c2.rotation.y = .7; bangle.add(c2);
  const c3 = coin(); c3.position.set(-.95, -1.1, .85); c3.rotation.set(1.1, .3, .25); bangle.add(c3);
}
station(2, bangle, [[[-1.25, .6, 0], 'Burma bilezik'], [[-.95, -.6, .9], 'Çeyrek']]);

/* 4. chain with heart pendant (instanced links) */
const chain = new THREE.Group();
{
  const curve = new THREE.CatmullRomCurve3([[-1.55, 1.7, -.2], [-1.4, .55, 0], [-.85, -.45, .1], [0, -.88, .14], [.85, -.45, .1], [1.4, .55, 0], [1.55, 1.7, -.2]].map(p => new THREE.Vector3(...p)));
  const linkGeo = new THREE.TorusGeometry(.075, .024, 10, 24); linkGeo.scale(1.5, 1, 1);
  const n = Math.floor(curve.getLength() / .17);
  const links = new THREE.InstancedMesh(linkGeo, gold, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), basis = new THREE.Matrix4(), Z = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), p = curve.getPointAt(t), T = curve.getTangentAt(t);
    const N = new THREE.Vector3().crossVectors(Z, T).normalize(), B = new THREE.Vector3().crossVectors(T, N);
    basis.makeBasis(T, k % 2 ? N : B, k % 2 ? B : N.clone().negate()); q.setFromRotationMatrix(basis);
    links.setMatrixAt(k, m.compose(p, q, new THREE.Vector3(1, 1, 1)));
  }
  chain.add(links);
  const s = new THREE.Shape();
  s.moveTo(5, 5); s.bezierCurveTo(5, 5, 4, 0, 0, 0); s.bezierCurveTo(-6, 0, -6, 7, -6, 7); s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7); s.bezierCurveTo(16, 7, 16, 0, 10, 0); s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const hg = new THREE.ExtrudeGeometry(s, { depth: 2.5, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.2, bevelSegments: 8, curveSegments: 32 });
  hg.center(); hg.scale(.03, .03, .03); hg.rotateZ(Math.PI);
  const heart = new THREE.Mesh(hg, gold); heart.position.set(0, -1.3, .16); chain.add(heart);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(.07, .022, 10, 24), gold); bail.position.set(0, -.96, .15); bail.rotation.y = Math.PI / 2; chain.add(bail);
  chain.userData.heart = heart;
}
station(3, chain, [[[-1.42, .7, 0], 'Forse örgü'], [[0, -1.3, .25], 'Kalp']]);

/* 5. watch whose hands show the real time */
const watch = new THREE.Group();
const hands = {};
{
  const caseM = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .3, 96), gold); caseM.rotation.x = Math.PI / 2; watch.add(caseM);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(.98, .075, 24, 160), gold); bezel.position.z = .15; watch.add(bezel);
  const dialTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2, gr = g.createRadialGradient(c, c * .8, 20, c, c, c);
    gr.addColorStop(0, '#2a1f12'); gr.addColorStop(1, '#0b0805'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(239,230,212,.55)'; g.lineWidth = 3;
    for (let k = 0; k < 60; k++) { const a = k / 60 * 6.283; g.beginPath(); g.moveTo(c + Math.cos(a) * 470, c + Math.sin(a) * 470); g.lineTo(c + Math.cos(a) * 445, c + Math.sin(a) * 445); g.stroke(); }
    g.fillStyle = '#e3b866';
    for (let k = 0; k < 12; k++) {
      g.save(); g.translate(c, c); g.rotate(k / 12 * 6.283);
      if (k === 0) { g.fillRect(-22, -430, 14, 92); g.fillRect(8, -430, 14, 92); } else g.fillRect(-9, -430, 18, k % 3 ? 62 : 92);
      g.restore();
    }
    g.strokeStyle = 'rgba(227,184,102,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, 300, 0, 7); g.stroke();
  }, true);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(.92, 96), new THREE.MeshStandardMaterial({ map: dialTex, roughness: .5, metalness: .3 }));
  dial.position.z = .151; watch.add(dial);
  const hand = (len, w, mat, z) => {
    const g = new THREE.BoxGeometry(w, len, .02); g.translate(0, len / 2 - .08, 0);
    const pivot = new THREE.Group(); pivot.position.z = z; pivot.add(new THREE.Mesh(g, mat)); watch.add(pivot); return pivot;
  };
  hands.h = hand(.52, .06, gold, .17); hands.m = hand(.78, .04, gold, .18);
  hands.s = hand(.84, .012, new THREE.MeshStandardMaterial({ color: '#e8857a', metalness: .6, roughness: .3 }), .19);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .04, 24), gold); cap.rotation.x = Math.PI / 2; cap.position.z = .2; watch.add(cap);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .16, 24), gold); crown.rotation.z = Math.PI / 2; crown.position.x = 1.08; watch.add(crown);
  const linkGeo = new RoundedBoxGeometry(.62, .2, .14, 3, .04);
  const strap = new THREE.InstancedMesh(linkGeo, gold, 22), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let k = 0; k < 11; k++) for (const sg of [1, -1]) {
    const y = sg * (1.02 + k * .21), z = -.012 * k * k;
    q.setFromEuler(e.set(-sg * k * .05, 0, 0));
    strap.setMatrixAt(k * 2 + (sg > 0 ? 0 : 1), m.compose(new THREE.Vector3(0, y, z - .02), q, new THREE.Vector3(1, 1, 1)));
  }
  watch.add(strap);
  watch.rotation.set(-.08, -.12, 0);
}
const watchHolder = station(4, watch, [[[0, .6, .2], 'Kadran'], [[1.16, 0, 0], 'Kurma kolu'], [[0, -1.8, -.4], 'Kordon']]);

watchHolder.children[1].visible = watchHolder.children[2].visible = false;   // the bracelet would cut through the plinth

/* thumbnail-only: ribbed cuff (kaburga kelepçe) */
const cuff = new THREE.Group();
{
  const c = new THREE.Mesh(ringSurface(1.05, (u) => [.09 * (1 + .25 * Math.max(0, Math.cos(u * 46))), .36], 700, 40, Math.PI * 1.68), gold);
  c.rotation.set(-.5, .35, Math.PI * .66); cuff.add(c); cuff.visible = false; cuff.position.set(-SPACING * 2, 0, 0); scene.add(cuff);
}

/* sparkles */
const sparkles = (() => {
  const N = mobile ? 260 : 600, p = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    p[k * 3] = -6 + Math.random() * (SPACING * 4 + 12); p[k * 3 + 1] = -3 + Math.random() * 7.5; p[k * 3 + 2] = -7 + Math.random() * 9;
    ph[k] = Math.random() * 6.283; sz[k] = .6 + Math.random() * 1.8;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, px: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float ph; attribute float sz; uniform float t; uniform float px; varying float a;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); a = pow(.5+.5*sin(t*1.6+ph*3.),6.);
      gl_PointSize = sz*px*(26./-mv.z)*(.4+a); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float a; void main(){ vec2 c = gl_PointCoord-.5; float d = length(c);
      float star = max(0., .02/abs(c.x*c.y+.0004)) * .02 + smoothstep(.5,.0,d)*.6; gl_FragColor = vec4(1.,.86,.55, star*a*smoothstep(.5,.2,d)); }`
  });
  const pts = new THREE.Points(g, mat); scene.add(pts); return pts;
})();

/* ---------- camera rig ---------- */
const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);
const composer = !mobile && !reduce ? new EffectComposer(renderer) : null;
let bloom;
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .32, .4, .9); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
// station poses: [camera offset from holder, look-at offset]
const POSE = [
  [[-1.6, -.2, 5.6], [0, .55, 0]],      // hero: low, close on the ring
  [[.4, .6, 9.4], [0, .1, 0]],
  [[.2, .7, 9.6], [0, -.1, 0]],
  [[.3, 1.4, 10.6], [0, -.5, 0]],
  [[.0, .4, 10.4], [0, -.25, 0]],
  [[.2, .3, 10.8], [0, -.35, 0]]
];
const holderOf = i => stations[Math.min(stations.length - 1, Math.max(0, i - 1))].holder.position;   // station index 0 & 1 both look at the ring
function pose(i, w, h) {
  if (i >= 6) {   // overview of the whole row
    // row fills the right ~60% of the screen on desktop, the full width on phones
    const share = mobile ? .95 : .6, aspect = w / h, visW = (SPACING * 4 + 4) / share;
    const d = visW / (2 * Math.tan(THREE.MathUtils.degToRad(15)) * aspect), mid = SPACING * 2 - (mobile ? 0 : visW * .17);
    return [new THREE.Vector3(mid, 3.2 + d * .08, d), new THREE.Vector3(mid, mobile ? 3.2 : 1.6, 0)];
  }
  const base = holderOf(i), [po, lo] = POSE[i], k = mobile ? (i === 0 ? 1.8 : 1.35) : 1;
  return [base.clone().add(new THREE.Vector3(po[0], po[1], po[2] * k)), base.clone().add(new THREE.Vector3(...lo))];
}

let W = 1, H = 1, offs = [];
function resize() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  if (composer) { composer.setSize(W, H); }
  offs = mobile ? [0, .2 * H] : [-.2 * W, 0];   // positive y lifts the object above the text panel
}
addEventListener('resize', resize); resize();

/* ---------- labels ---------- */
const labelEls = stations.map(s => s.labels.map(([, t]) => { const el = document.createElement('span'); el.className = 'lab'; el.textContent = t; labelBox.appendChild(el); return el; }));
const tmp = new THREE.Vector3();
function updateLabels(s) {
  const active = Math.round(s), near = Math.abs(s - active) < .16 && active >= 1 && active <= 5 && !mobile;
  stations.forEach((st, si) => st.labels.forEach(([p, ], li) => {
    const el = labelEls[si][li], on = near && si === active - 1;
    el.classList.toggle('on', on);
    if (!on) return;
    tmp.copy(p); st.group.localToWorld(tmp); tmp.project(camera);
    el.style.transform = `translate(${(tmp.x * .5 + .5) * W}px, ${(-tmp.y * .5 + .5) * H}px) translate(-4px, -50%)`;
  }));
}

/* ---------- scroll -> station ---------- */
const GAP = .85;   // keep in sync with --gap in styles.css
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function station01() {
  const r = tour.getBoundingClientRect(), vh = innerHeight;
  const raw = Math.min(6, Math.max(0, -r.top / (vh * GAP)));
  const seg = Math.min(5, Math.floor(raw)), e = smooth(.12, .78, raw - seg);
  return { s: seg + e, seg, e };
}
navBtns.forEach(b => b.addEventListener('click', () => {
  const y = tour.offsetTop + (+b.dataset.i + .15) * innerHeight * GAP;
  window.lenis ? window.lenis.scrollTo(y, { duration: 1.6 }) : scrollTo({ top: y, behavior: 'smooth' });
}));

/* pointer: parallax + click an object to fly there */
const mouse = new THREE.Vector2(), ease = new THREE.Vector2();
const ray = new THREE.Raycaster();
addEventListener('pointermove', e => { mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  let o = ray.intersectObjects(stations.map(s => s.group), true)[0]?.object;
  while (o && !stations.some(s => s.group === o)) o = o.parent;
  return o ? stations.findIndex(s => s.group === o) : -1;
}
canvas.parentElement.addEventListener('click', e => { const i = pick(e); if (i >= 0) navBtns[i]?.click(); });

/* ---------- loop ---------- */
let bloomOn = !!composer, slow = 0, lastT = performance.now();
function adapt() {
  const now = performance.now(), dt = now - lastT; lastT = now;
  if (dt > 100) return;                      // tab switch or scroll jump, not a slow frame
  slow = dt > 24 ? slow + 1 : Math.max(0, slow - 1);
  if (slow < 40) return;
  slow = 0;
  if (dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); composer?.setPixelRatio(dpr); resize(); }
  else if (bloomOn) bloomOn = false;
}
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), clock = new THREE.Clock();
let visible = true, first = true;
new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(tour);
function frame() {
  requestAnimationFrame(frame);
  if (!visible && !first) return;
  const t = reduce ? 0 : clock.getElapsedTime();
  const { s, seg, e } = reduce ? { s: 0, seg: 0, e: 0 } : station01();
  const [p0, l0] = pose(seg, W, H), [p1, l1] = pose(Math.min(6, seg + 1), W, H);
  camPos.lerpVectors(p0, p1, e); camLook.lerpVectors(l0, l1, e);
  const arc = Math.sin(e * Math.PI); camPos.y += arc * .9; camPos.z += arc * 2.2;   // swoop out between stations
  ease.lerp(mouse, .05);
  camPos.x += ease.x * .35; camPos.y += ease.y * .25;
  camera.position.copy(camPos); camera.lookAt(camLook);
  // keep the object clear of the text column; fade the offset out on the overview
  const k = 1 - smooth(5, 6, s);
  camera.setViewOffset(W, H, offs[0] * k, offs[1] * k, W, H);

  stations.forEach((st, i) => { st.group.rotation.y = Math.sin(t * .35 + i) * (st.group === watch ? .15 : .35) + (s - (i + 1)) * .9; });
  chain.userData.heart.rotation.y = Math.sin(t * 1.3) * .4;
  const now = new Date(), hh = now.getHours() % 12 + now.getMinutes() / 60, mm = now.getMinutes() + now.getSeconds() / 60, ss = now.getSeconds() + now.getMilliseconds() / 1000;
  hands.h.rotation.z = -hh / 12 * Math.PI * 2; hands.m.rotation.z = -mm / 60 * Math.PI * 2; hands.s.rotation.z = -ss / 60 * Math.PI * 2;
  sparkles.material.uniforms.t.value = t;

  const cur = Math.round(s);
  navBtns.forEach(b => b.setAttribute('aria-current', String(+b.dataset.i === cur)));
  if (nav) nav.style.opacity = s > .5 && s < 5.6 ? 1 : 0;
  updateLabels(s);
  // only the current stop's text is shown, so a tall panel never bleeds into the next station
  stopEls.forEach((el, i) => { el.style.opacity = reduce ? 1 : Math.max(0, 1 - Math.abs(s - i) * 2.4); });

  composer && bloomOn ? composer.render() : renderer.render(scene, camera);
  adapt();
  if (first) { first = false; document.documentElement.classList.add('ready'); }
}
frame();

/* ---------- collection thumbnails rendered from this scene (second, offscreen context) ---------- */
const SHOTS = {
  ring: [ring, [-.9, .5, 6.2], [0, .45, 0], 1.6],
  bands: [bands, [0, .4, 5.4], [0, -.05, 0], 1],
  bangle: [bangle, [0, .8, 6.2], [0, -.35, 0], 1],
  chain: [chain, [0, -.3, 5.2], [0, -.35, 0], 1],
  watch: [watch, [1.2, .2, 5.6], [0, -.2, 0], 1],
  cuff: [cuff, [0, .3, 3.9], [0, .05, 0], 1.6]
};
async function thumbs() {
  const cards = [...document.querySelectorAll('.card[data-shot]')];
  if (!cards.length) return;
  const off = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  off.toneMapping = THREE.ACESFilmicToneMapping; off.toneMappingExposure = 1.1;
  const envB = new THREE.PMREMGenerator(off).fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 100);
  for (const card of cards) {
    const [obj, po, lo] = SHOTS[card.dataset.shot];
    const fig = card.querySelector('figure'), ratio = fig.clientWidth / fig.clientHeight || .8;
    const w = Math.round(Math.min(1400, Math.max(700, fig.clientWidth * 1.5))), h = Math.round(w / ratio);
    off.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const wp = obj.getWorldPosition(new THREE.Vector3());
    cam.position.copy(wp).add(new THREE.Vector3(...po)); cam.lookAt(wp.clone().add(new THREE.Vector3(...lo)));
    const vis = [];
    scene.traverse(o => { if (o.isMesh || o.isPoints || o.isInstancedMesh) { vis.push([o, o.visible]); o.visible = false; } });
    obj.visible = true; obj.traverse(o => { o.visible = true; });
    const holder = stations.find(s => s.group === obj)?.holder;
    holder?.children.forEach(c => { c.visible = true; });
    const ry = obj.rotation.y; obj.rotation.y = card.dataset.shot === 'watch' ? -.35 : .25;
    scene.environment = envB; off.render(scene, cam); scene.environment = env;
    obj.rotation.y = ry;
    vis.forEach(([o, v]) => { o.visible = v; }); cuff.visible = false;
    await fetch('http://127.0.0.1:8766/' + card.dataset.shot + '.webp', { method: 'POST', body: off.domElement.toDataURL('image/webp', .86) });
    await new Promise(r => setTimeout(r, 40));
  }
  off.dispose();
}
// cards ship pre-rendered webp files; ?shots=1 re-renders them and posts each to a local sink on :8766
if (new URLSearchParams(location.search).has('shots')) setTimeout(thumbs, 1500);
window.__gold = { scene, camera, stations, renderer };
// dev check: average GPU+CPU ms per frame, synchronous so it works even when the tab's timers are throttled
window.__bench = (n = 20) => {
  const gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
  for (let k = 0; k < n; k++) { composer ? composer.render() : renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  return +((performance.now() - t0) / n).toFixed(1);
};
