/*
 * 3D-weergave voor het Ecodan Dashboard.
 *
 * Alleen tekenen: alle logica (entiteiten, stand, kranen, warmtevraag, stooklijn) zit in het 2D-panel. Het panel
 * geeft per update een momentopname V (zie view3dState() in ecodash-panel.js); deze weergave kleurt, animeert en
 * beschrijft het model daarmee. Klikken meldt het onderdeel terug aan het panel (onPick), dat de uitleg toont,
 * net als in 2D. Gebaseerd op de ecodan-3d-card (model en schermen ongewijzigd).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { lcdSvg, drawAlpha, curveAt } from './screens.js';

const BLOOM = 1;                 // render-laag met alles wat gloeit
const HL = new THREE.Color('#3b82f6');   // markering van het gekozen onderdeel

// Welk onderdeel van het 2D-schema (data-c) hoort bij een object in het model; de eerste regel die past wint.
const PICK = [
  [/^txt_buiten_temp$/, 'th7'], [/^(txt_compressor_hz|buiten_compressor)$/, 'comp'], [/^(buitenunit_|buiten_ventilator)/, 'outdoor'],
  [/^txt_heetgas$/, 'heetgas'], [/^pipe_r32/, 'refr'], [/^txt_th2$/, 'th2'], [/^(platenwisselaar|txt_platenwisselaar)/, 'hex'],
  [/^(ftc6_|txt_wifi$)/, 'ftc'], [/^(txt_in1|basisstation|txt_basisstation)/, 'mohlenhoff'],
  [/^(bh1_|txt_bh1$)/, 'bh1'], [/^(pomp1_|txt_pomp1$|kraan_14$)/, 'pump1'], [/^txt_thw1$/, 'thw1'], [/^klep_3weg/, 'valve'],
  [/^(filter|debietmeter|txt_debiet$)/, 'filter'], [/^txt_thw2$/, 'thw2'], [/^txt_thw5[ab]$/, 'thw5'],
  [/^(tank_|txt_tap_doel$)/, 'tank'], [/^bedieningsscherm/, 'ctrl'], [/^(kraan_badkamer|kraan_keuken|kraan_hendels|pipe_warm_)/, 'taps'],
  [/^(txt_tapvoeler$|pipe_koud_)/, 'tapvoeler'], [/^txt_warm_leiding$/, 'tapwarm'],
  [/^(wisselaar_tapwater|pipe_tank_)/, 'hex16'], [/^(pomp18|pipe_tapcircuit_)/, 'pump18'], [/^wisselaar_17$/, 'scale'],
  [/^(expansievat|manometer|ontluchter|pipe_expansie)/, 'safety'], [/^kraan_(21|33)$/, 'dhwsafe'],
  [/^(kwh_meter_buiten|txt_kwh_buiten|txt_vermogen_buiten|kabel_buitenunit|din_rail)/, 'meterOut'],
  [/^(kwh_meter_binnen|txt_kwh_binnen|txt_vermogen_binnen|kabel_binnenunit)/, 'meterIn'],
  [/^stelmotor_/, 'act'], [/^(verdeler_|pipe_vloer|lus_)/, 'manifold'],
  [/^(thermostaat_|alpha_display_|txt_slaapkamer_|txt_woonkamer$)/, 'tstat'],
  [/^(stooklijn_|txt_stooklijn_)/, 'curve'], [/^(pipe_cv_aanvoer|pipe_retour|sensoren)$/, 'cyl'],
];
export const pickOf = (name) => { const r = PICK.find(([re]) => re.test(name)); return r ? r[1] : null; };

export class EcodashView3D {
  /** el: lege container; opts: { model, onPick(comp, textKey), onReady(), onError(msg), glow, flowSpeed } */
  constructor(el, opts) {
    this.el = el; this.o = { glow: 1, flowSpeed: 1, ...opts };
    this.V = null; this.sel = null; this.active = true; this._last = {};
    el.innerHTML = '<div class="v3d-msg">3D-model laden…</div>';
    this._msg = el.firstChild;
    const r = this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.className = 'v3d-canvas';
    el.appendChild(r.domElement);
    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
    this._controls = new OrbitControls(this._camera, r.domElement);
    this._controls.enableDamping = true; this._controls.dampingFactor = 0.08;
    this._scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(200, 1300, 1400); this._scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-900, 400, -600); this._scene.add(fill);
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(el);
    this._io = new IntersectionObserver((e) => { this._onScreen = e[0].isIntersecting; this._loop(); }); this._io.observe(el);
    r.domElement.addEventListener('pointerdown', (ev) => { this._down = [ev.clientX, ev.clientY]; });
    r.domElement.addEventListener('click', (ev) => {
      if (this._down && Math.hypot(ev.clientX - this._down[0], ev.clientY - this._down[1]) > 6) return;   // was slepen
      this._click(ev);
    });
    this._onVis = () => { if (!document.hidden) this._loop(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._clockIv = setInterval(() => this._ready && this._renderLcd(true), 15000);
    new GLTFLoader().load(this.o.model, (g) => this._onModel(g), undefined, (err) => {
      this._msg.textContent = `3D-model niet geladen (${this.o.model})`; console.error('Ecodan-panel 3D:', err); this.o.onError?.(String(err));
    });
  }

  /* ------------------------------------------------------------ publiek */
  update(V) { this.V = V; if (this._ready) this._apply(); }
  highlight(comp) { this.sel = comp || null; if (this._ready) { this._applyHighlight(); this._requestFrame(); } }
  setActive(on) { this.active = !!on; if (on) { this._resize(); this._loop(); } }
  zoom(f) {
    const c = this._controls, d = this._camera.position.clone().sub(c.target);
    const len = THREE.MathUtils.clamp(d.length() / f, c.minDistance || 50, c.maxDistance === Infinity ? 8000 : c.maxDistance);
    this._camera.position.copy(c.target).addScaledVector(d.normalize(), len); this._userMoved = true; this._requestFrame();
  }
  home() {
    if (!this._X) return;
    this._camera.position.fromArray(this._X.camera.position); this._controls.target.fromArray(this._X.camera.target);
    this._userMoved = false; this._resize();
  }
  dispose() {
    this.active = false; cancelAnimationFrame(this._raf); clearInterval(this._clockIv);
    this._ro.disconnect(); this._io.disconnect(); document.removeEventListener('visibilitychange', this._onVis);
    this._controls.dispose(); this._renderer.dispose(); this._scene.traverse((o) => { o.geometry?.dispose?.(); });
    this.el.innerHTML = '';
  }

  /* ------------------------------------------------------------ opbouw */
  _onModel(gltf) {
    const X = gltf.scene.userData.ecodan3d;
    if (!X) { this._msg.textContent = 'Het 3D-model bevat geen Ecodan-gegevens'; return; }
    this._X = X;
    this._scene.background = new THREE.Color(X.background || '#161616');
    this._scene.add(gltf.scene);
    this._objs = {};
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();              // eigen materiaal per object: markeren raakt geen buren
      this._objs[o.name] = o;
      if (o.material.map) o.material.map.anisotropy = 8;
      if (o.name === 'tank_water') { o.material.depthWrite = false; o.renderOrder = 2; }
      if (o.name === 'tank_mantel') { o.material.depthWrite = false; o.renderOrder = 3; }
      if (o.name === 'labels') o.renderOrder = 10;   // labels altijd over het (doorzichtige) vat heen
    });
    this._initScreens();
    this._buildSine();
    this._camera.position.fromArray(X.camera.position);
    this._controls.target.fromArray(X.camera.target);
    this._homeDist = this._camera.position.distanceTo(this._controls.target);
    this._buildFlows();
    this._setupBloom();
    // uitgangskleur per object, zodat markeren en weer loslaten de juiste kleur terugzet
    for (const o of Object.values(this._objs)) o.userData.e0 = [o.material.emissive?.clone(), o.material.emissiveIntensity];
    this._msg.remove();
    this._ready = true;
    this._resize();
    if (this.V) this._apply();
    this._loop();
    this.o.onReady?.();
  }

  _buildFlows() {
    const geo = new THREE.CapsuleGeometry(0.5, 1, 4, 12);
    this._flows = this._X.flows.map((f) => {
      const paths = f.paths.map((pts) => {
        const v = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const cum = [0], dirs = [new THREE.Vector3(0, 1, 0)];
        for (let i = 1; i < v.length; i++) { cum.push(cum[i - 1] + v[i].distanceTo(v[i - 1])); dirs.push(v[i].clone().sub(v[i - 1]).normalize()); }
        return { v, cum, dirs, len: cum[cum.length - 1] };
      });
      const count = paths.reduce((n, p) => n + Math.max(1, Math.floor(p.len / f.spacing)), 0);
      const base = new THREE.Color(f.color).lerp(new THREE.Color('#ffffff'), 0.3);
      const mat = new THREE.MeshBasicMaterial({ color: f.gradient ? 0xffffff : base, toneMapped: false });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false; mesh.visible = false; mesh.layers.enable(BLOOM); this._scene.add(mesh);
      if (f.gradient) {
        f._cs = f.gradient.map((c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.25)); f._ct = new THREE.Color();
        for (let i = 0; i < count; i++) mesh.setColorAt(i, f._cs[0]);
      }
      return { ...f, pathsV: paths, mesh, count, active: false, scl: new THREE.Vector3(f.radius * 2, f.spacing / 6, f.radius * 2) };
    });
    this._tmp = new THREE.Matrix4(); this._pos = new THREE.Vector3(); this._quat = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0);
  }

  /* ------------------------------------------------------------ toestand uit het panel */
  // stand van een sleutel; V.obj kan per object afwijken (de ventilator staat stil bij ontdooien, pomp 18 volgt de sanitaire pomp)
  _st(key, obj) { const V = this.V || {}; return (V.obj && obj in V.obj) ? V.obj[obj] : (V.state || {})[key]; }

  _apply() {
    const X = this._X, V = this.V || {};
    for (const t of X.texts) {
      const o = this._objs[t.object]; if (!o) continue;
      const txt = (V.text || {})[t.key] ?? '–';
      if (this._last[t.object] === txt) continue;
      this._last[t.object] = txt;
      if (o.material.map) o.material.map.dispose();
      o.material.map = this._textTex(o, txt, t); o.material.color.set('#ffffff');
      o.material.emissive = new THREE.Color('#ffffff'); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = 0.6;
      o.userData.e0 = [o.material.emissive.clone(), 0.6];
      o.material.needsUpdate = true;
    }
    this._pulse = [];
    for (const c of X.colors) {
      const o = this._objs[c.object]; if (!o) continue;
      const st = this._st(c.key, c.object), col = c.map[st];
      if (col) o.material.color.set(col);
      const glow = !!(c.glow && c.glow.includes(st));
      o.material.emissive = new THREE.Color(glow ? col : '#000000'); o.material.emissiveIntensity = glow ? 0.3 : 0;
      o.userData.e0 = [o.material.emissive.clone(), o.material.emissiveIntensity];
      if (glow && c.pulse) this._pulse.push(o.material);
      if (c.pulse) this._glowLayer(o, glow);
    }
    this._spin = X.rotates.filter((r) => (r.states || ['on']).includes(this._st(r.key, r.object))).map((r) => [this._objs[r.object], r.axis, r.rps]);
    for (const f of this._flows) { f.active = (f.states || []).includes(this._st(f.key, f.object)); f.mesh.visible = f.active; }
    this._renderLcd();
    this._renderAlpha();
    this._renderHeating();
    this._renderChart();
    this._applyHighlight();
    this._requestFrame();
  }

  _paint(o, col, glow) {   // kleur + gloed, en onthoud dat als uitgangskleur voor het markeren
    o.material.color.set(col);
    o.material.emissive = new THREE.Color(glow ? glow : '#000000'); o.material.emissiveIntensity = glow ? 0.35 : 0;
    o.userData.e0 = [o.material.emissive.clone(), o.material.emissiveIntensity];
  }
  _renderHeating() {
    const V = this.V || {};
    for (const a of this._X.actuators || []) {
      const o = this._objs[a.object]; if (!o) continue;
      const open = !!(V.act || {})[a.object];
      this._paint(o, open ? '#f87171' : '#f3f4f6', open ? '#ef4444' : null);
    }
    for (const l of this._X.leds || []) {
      const o = this._objs[l.object]; if (!o) continue;
      const on = !!(V.leds || {})[l.object];
      o.material.color.set(on ? '#22c55e' : '#3f444c');
      o.material.emissive = new THREE.Color(on ? '#22c55e' : '#000000'); o.material.emissiveIntensity = on ? 0.6 : 0;
      o.userData.e0 = [o.material.emissive.clone(), o.material.emissiveIntensity];
      this._glowLayer(o, on);
    }
  }

  /* ------------------------------------------------------------ markeren */
  _applyHighlight() {
    for (const [name, o] of Object.entries(this._objs || {})) {
      if (name === 'labels' || o.material.emissiveMap) continue;   // waardes en schermpjes blijven leesbaar
      const on = this.sel && pickOf(name) === this.sel;
      const [e0, i0] = o.userData.e0 || [];
      if (on) { o.material.emissive = HL.clone(); o.material.emissiveIntensity = 0.55; }
      else if (e0) { o.material.emissive = e0.clone(); o.material.emissiveIntensity = i0; }
    }
  }

  /* ------------------------------------------------------------ hoofdscherm + Alpha-displays */
  _screenTex(obj, W, H) {
    const o = this._objs[obj]; if (!o) return null;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    o.material.map = tex; o.material.color.set('#ffffff');
    o.material.emissive = new THREE.Color('#ffffff'); o.material.emissiveMap = tex; o.material.emissiveIntensity = 0.45;
    o.material.needsUpdate = true;
    return { c, ctx: c.getContext('2d'), tex };
  }
  _initScreens() {
    const sc = this._X.screens; if (!sc) return;
    this._lcd = this._screenTex(sc.lcd, 1296, 904);
    this._alpha = {};
    for (const [k, obj] of Object.entries(sc.alpha || {})) this._alpha[k] = this._screenTex(obj, 288, 168);
  }
  _renderLcd(clock) {
    const x = this.V && this.V.lcd; if (!this._lcd || !x) return;
    const led = this._objs.bedieningsscherm_led;
    if (led) led.material.color.set(x.power === false ? '#1f2937' : '#22c55e');
    const svg = lcdSvg(x);
    if (svg === this._lcdSvg) return; this._lcdSvg = svg;
    const img = new Image();
    img.onload = () => { const { ctx, c, tex } = this._lcd; ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height); tex.needsUpdate = true; this._requestFrame(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    if (clock) this._requestFrame();
  }
  _renderAlpha() {
    const V = this.V || {}, thermo = (this._X.screens || {}).thermostats || {};
    for (const [k, a] of Object.entries(this._alpha || {})) {
      const sp = (V.alpha || {})[k] ?? null, sig = String(sp);
      if (a.sig !== sig) { a.sig = sig; drawAlpha(a.ctx, a.c.width, a.c.height, sp); a.tex.needsUpdate = true; }
      const body = this._objs[thermo[k]];
      if (body) { const heat = (V.heat || {})[k] === true; this._paint(body, heat ? '#f87171' : '#e5e7eb', heat ? '#ef4444' : null); }
    }
  }

  /* ------------------------------------------------------------ sinusgolf in de compressor */
  _buildSine() {
    const C = this._X.compressor; if (!C) return;
    const N = 96, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
    const idx = []; for (let i = 0; i < N; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: '#6b7280', side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.layers.enable(BLOOM);
    this._scene.add(mesh);
    this._sine = { C, N, geo, mat, mesh, phase: 0 };
    this._drawSine(0, 0);
  }
  _drawSine(f, dt) {
    const S = this._sine; if (!S) return;
    const { C, N, geo } = S, half = C.r * 0.82, x0 = C.cx - half, W = 2 * half;
    const yc = 889 - (C.y0 + C.y1) / 2, A = f > 0 ? C.r * 0.36 : 0, th = 1.0;
    const cycles = f > 0 ? Math.min(4.5, Math.max(0.8, f / 25)) : 1, L = W / cycles;
    const period = Math.min(1.2, Math.max(0.25, 1.2 - f / 120));
    if (f > 0) S.phase = (S.phase + dt / period) % 1;
    const pos = geo.attributes.position.array;
    const P = (x) => yc - A * Math.sin(2 * Math.PI * ((x - x0) / L - S.phase));
    const zf = (xx) => C.z + Math.sqrt(Math.max(0, C.r * C.r - (xx - C.cx) * (xx - C.cx))) + 0.7;
    for (let i = 0; i <= N; i++) {
      const x = x0 + W * i / N, y = P(x), dy = (P(x + 0.01) - P(x - 0.01)) / 0.02, n = 1 / Math.sqrt(1 + dy * dy);
      const nx = -dy * n * th, ny = n * th;
      pos.set([x + nx, y + ny, zf(x + nx), x - nx, y - ny, zf(x - nx)], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
    S.mat.color.set(f > 0 ? '#e879f9' : '#6b7280');
  }

  /* ------------------------------------------------------------ stooklijn */
  _cx(t) { const C = this._X.chart; return C.x0 + (t - C.tmin) / (C.tmax - C.tmin) * (C.x1 - C.x0); }
  _cyW(f) { const C = this._X.chart; return 889 - (C.y_bot - (f - C.fmin) / (C.fmax - C.fmin) * (C.y_bot - C.y_top)); }
  _renderChart() {
    const C = this._X && this._X.chart, ch = this.V && this.V.chart; if (!C || !ch || !ch.curve) return;
    const { curve, t, thw1, curveOn } = ch;
    const sig = JSON.stringify([curve.pts, t, thw1, curveOn]);
    if (sig === this._chartSig) return; this._chartSig = sig;
    if (this._chart) { this._scene.remove(this._chart); this._chart.traverse((o) => { o.geometry && o.geometry.dispose(); }); }
    const g = this._chart = new THREE.Group(); this._scene.add(g);
    const clampT = (v) => Math.min(C.tmax, Math.max(C.tmin, v));
    const P = (tt, ff) => new THREE.Vector3(this._cx(clampT(tt)), this._cyW(Math.min(C.fmax, Math.max(C.fmin, ff))), 2);
    const pts = [[C.tmin, curveAt(curve, C.tmin)], ...curve.pts.filter(([a]) => a > C.tmin && a < C.tmax), [C.tmax, curveAt(curve, C.tmax)]];
    const path = new THREE.CurvePath();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(P(...pts[i - 1]), P(...pts[i])));
    const col = curveOn ? '#ef7b5f' : '#6b7280';
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24 * pts.length, 1.5, 10, false),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: curveOn ? 0.35 : 0, roughness: 0.4 })));
    const ball = (p, r, c, glow) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: glow, roughness: 0.3 })); m.position.copy(p); g.add(m); };
    for (const [a, b] of curve.pts) ball(P(a, b), 2.6, '#f3f4f6', 0.1);
    if (t != null) {
      const f = curveAt(curve, t);
      ball(P(t, f), 4.2, '#22c55e', 0.6);                                  // groen: aanvoer volgens de lijn
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.5, Math.abs(P(t, f).y - P(t, C.fmin).y), 0.5),
        new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.45 }));
      v.position.set(this._cx(clampT(t)), (P(t, f).y + P(t, C.fmin).y) / 2, 1); g.add(v);
      if (thw1 != null) ball(P(t, thw1), 4.2, '#ef4444', 0.6);           // rood: werkelijke aanvoer bij vloerverwarming
    }
  }

  /* ------------------------------------------------------------ tekst op het model */
  _textTex(o, txt, t) {
    o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
    const w = b.max.x - b.min.x, h = (b.max.y - b.min.y) || (b.max.z - b.min.z);
    const H = 96, W = Math.max(64, Math.round(H * w / h));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = t.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = t.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = (s) => (t.font === 'mono' ? `${s}px ui-monospace, Menlo, Consolas, monospace` : `600 ${s}px Inter, Roboto, system-ui, sans-serif`);
    let fs = H * 0.82; g.font = font(fs);
    while (g.measureText(txt).width > W * 0.96 && fs > 10) { fs -= 2; g.font = font(fs); }
    g.fillText(txt, W / 2, H / 2 + 3);
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  /* ------------------------------------------------------------ gloed */
  _setupBloom() {
    const g = Math.max(0, Number(this.o.glow) || 0);
    if (g <= 0) { this._composer = null; return; }
    const r = this._renderer, size = r.getSize(new THREE.Vector2());
    const bc = new EffectComposer(r); bc.renderToScreen = false;
    bc.addPass(new RenderPass(this._scene, this._camera));
    bc.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), Math.min(3, g) * 0.55, 0.4, 0));
    const fc = new EffectComposer(r);
    fc.addPass(new RenderPass(this._scene, this._camera));
    const mix = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { baseTexture: { value: null }, bloomTexture: { value: bc.renderTarget2.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;'
        + 'void main(){ gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }',
    }), 'baseTexture');
    mix.needsSwap = true; fc.addPass(mix); fc.addPass(new OutputPass());
    for (const c of [bc, fc]) { c.setPixelRatio(r.getPixelRatio()); c.setSize(size.x, size.y); }
    this._bloomComposer = bc; this._composer = fc;
  }
  _glowLayer(obj, on) { if (obj) { if (on) obj.layers.enable(BLOOM); else obj.layers.disable(BLOOM); } }
  _render() {
    if (!this._composer) { this._renderer.render(this._scene, this._camera); return; }
    const bg = this._scene.background;
    this._scene.background = null; this._camera.layers.set(BLOOM); this._bloomComposer.render();
    this._camera.layers.set(0); this._scene.background = bg; this._composer.render();
  }

  /* ------------------------------------------------------------ animatie */
  _resize() {
    if (!this._renderer) return;
    const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
    this._renderer.setSize(w, h, false);
    if (this._composer) { this._composer.setSize(w, h); this._bloomComposer.setSize(w, h); }
    this._camera.aspect = w / h;
    if (this._homeDist && !this._userMoved) {          // smal scherm: verder uitzoomen zodat alles past
      const k = Math.max(1, 1.45 / this._camera.aspect);
      const dir = this._camera.position.clone().sub(this._controls.target).normalize();
      this._camera.position.copy(this._controls.target).addScaledVector(dir, this._homeDist * k);
    }
    this._camera.updateProjectionMatrix();
    this._requestFrame();
  }
  _requestFrame() { if (!this._raf) this._loop(); }
  _loop() {
    if (this._raf || !this._ready || !this.active || this._onScreen === false) return;
    this._clock = this._clock || new THREE.Clock();
    const tick = () => {
      this._raf = null;
      if (!this.active || this._onScreen === false || document.hidden) return;
      const dt = Math.min(this._clock.getDelta(), 0.1), t = this._clock.elapsedTime;
      for (const [o, ax, rps] of this._spin || []) if (o) o.rotation[ax] += dt * rps * Math.PI * 2;
      this._animateFlows(t);
      if (this._sine) { const f = (this.V && this.V.freq) || 0; if (f > 0 || this._sine.lastF !== 0) this._drawSine(f, dt); this._sine.lastF = f; }
      for (const m of this._pulse || []) m.emissiveIntensity = 0.55 + 0.45 * Math.sin(t * 5);
      if (this._controls.update()) this._userMoved = true;
      this._render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  _animateFlows(t) {
    const m = this._tmp, p = this._pos, q = this._quat;
    for (const f of this._flows || []) {
      if (!f.active) continue;
      const phase = (t * f.speed * (this.o.flowSpeed || 1)) % f.spacing;
      let idx = 0, pi = -1;
      for (const path of f.pathsV) {
        pi++;
        const g = f.grad ? f.grad[pi] : null, n = Math.max(1, Math.floor(path.len / f.spacing));
        let seg = 1;
        for (let j = 0; j < n && idx < f.count; j++) {
          const d = (phase + j * f.spacing) % path.len;
          if (d < path.cum[seg - 1]) seg = 1;
          while (seg < path.cum.length - 1 && path.cum[seg] < d) seg++;
          const a = path.v[seg - 1], b = path.v[seg], segLen = path.cum[seg] - path.cum[seg - 1] || 1;
          p.lerpVectors(a, b, (d - path.cum[seg - 1]) / segLen);
          q.setFromUnitVectors(this._up, path.dirs[seg]);
          m.compose(p, q, f.scl); f.mesh.setMatrixAt(idx, m);
          if (g) {
            const u = d / path.len, tt = Math.min(1, Math.max(0, (u - g[0]) / (g[1] - g[0] || 1)));
            const cs = f._cs, k = Math.min(cs.length - 2, Math.floor(tt * (cs.length - 1)));
            f._ct.copy(cs[k]).lerp(cs[k + 1], tt * (cs.length - 1) - k); f.mesh.setColorAt(idx, f._ct);
          }
          idx++;
        }
      }
      f.mesh.instanceMatrix.needsUpdate = true;
      if (f.mesh.instanceColor) f.mesh.instanceColor.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------ klikken: het onderdeel aan het panel melden */
  _click(ev) {
    if (!this._ready) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(v, this._camera);
    const targets = Object.values(this._objs).concat(this._chart ? this._chart.children : []);
    const hit = ray.intersectObjects(targets, false).find((h) => h.object.name !== 'labels');
    if (!hit) { this.o.onPick?.(null); return; }
    const name = hit.object.parent === this._chart ? 'stooklijn_vlak' : hit.object.name;
    const t = this._X.texts.find((x) => x.object === name);
    this.o.onPick?.(pickOf(name), t ? t.key : null);
  }
}
