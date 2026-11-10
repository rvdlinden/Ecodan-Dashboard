// Live schermen voor de ecodan-3d-card:
//  - het hoofdscherm van de bediening (nagebouwd zoals ctrlSvg() in het Ecodan Dashboard, servicehandleiding 9-1)
//  - de Möhlenhoff Alpha-displays met de ingestelde temperatuur per kamer

const fmt = (v, d = 0) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d).replace('.', ','));

/** Hoofdscherm (alleen het LCD-deel; behuizing en toetsen zijn 3D). x = toestand, zie lcdState() in de kaart. */
export function lcdSvg(x) {
  const on = (b) => (b ? ' on' : '');
  const off = (b) => (b ? '' : ' off');
  const now = new Date();
  const date = now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
  const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const dhwOn = x.mode === 'tapwater' || x.mode === 'legionella', heatOn = x.mode === 'verwarming';
  const dhwBlock = !dhwOn && !!x.dhwProhibit;
  const curveOn = x.opmode == null || /curve/i.test(x.opmode);
  const standby = x.power === false;
  const sh = x.shift || 0;
  const big = curveOn ? (sh < 0 ? '−' : '+') + fmt(Math.abs(sh), 0) : x.z1sp != null ? fmt(x.z1sp, 0) : '–';
  const sub = standby ? 'stand-by (uit)' : curveOn ? 'verschuiving stooklijn' : x.z1sp != null ? 'doel aanvoer' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="38 40 324 226" width="1296" height="904">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4e8e2"/><stop offset="1" stop-color="#c5cbc4"/></linearGradient>
<style>
.lcd{stroke:#1b1f1c;fill:none}.lcd text{stroke:none}
.lt{fill:#1b1f1c;stroke:none;font-family:Menlo,Consolas,'DejaVu Sans Mono',monospace;font-weight:500}
.big{font-size:62px;font-weight:400;letter-spacing:-.04em}.lf{fill:#1b1f1c;stroke:none}
.off,.st{opacity:0}.st.on{opacity:1}.cbox{stroke-opacity:.15}.cbox.on{stroke-opacity:1}
</style></defs>
<rect x="38" y="40" width="324" height="226" rx="4" fill="url(#g)" stroke="#111" stroke-width="2"/>
<g class="lcd">
 <g><rect x="140" y="47" width="14" height="16" rx="2" fill="none" stroke-width="1.4"/><text x="147" y="59" class="lt" font-size="6.5" text-anchor="middle">SD</text></g>
 <text class="lt" x="186" y="63" font-size="16">${date}</text>
 <text class="lt" x="354" y="63" font-size="16" text-anchor="end">${time}</text>
 <line x1="40" y1="70" x2="360" y2="70" stroke-width="2"/>
 <rect class="cbox${on(dhwOn)}" x="48" y="80" width="58" height="50" fill="none" stroke-width="2.4"/>
 <path class="lf" d="M58,98 h22 v-5 h4 v-4 h-12 v4 h4 v5 h-18 z M80,98 h12 a4,4 0 0 1 4,4 v8 h-6 v-6 h-10 z"/>
 <path d="M93,114 v6 M96,116 v6 M90,117 v5" stroke-width="1.6"/>
 <text class="lt" x="64" y="126" font-size="8" opacity="${/eco/i.test(x.dhwMode || '') ? 1 : 0}">ECO</text>
 <path class="cbox${on(heatOn)}" d="M48,166 L77,142 L106,166 V196 H48 Z" fill="none" stroke-width="2.4"/>
 <circle cx="77" cy="178" r="7" fill="none" stroke-width="2.2"/>
 <path d="M77,165 v-4 M77,195 v-4 M64,178 h-4 M94,178 h-4 M68,169 l-3,-3 M86,169 l3,-3 M68,187 l-3,3 M86,187 l3,3" stroke-width="1.8"/>
 <g class="st${on(x.dhwProhibit)}"><circle cx="120" cy="88" r="7.5" fill="none" stroke-width="2"/><path d="M120,83 v5 h4" fill="none" stroke-width="1.8"/></g>
 <g class="st${on(dhwOn)}"><rect x="112" y="104" width="16" height="16" rx="2" class="lf"/><path d="M117,107 l7,5 l-7,5 z" fill="#e4e8e2"/></g>
 <g class="st${on(!dhwOn && !dhwBlock)}"><rect x="112" y="104" width="16" height="16" rx="2" class="lf"/><path d="M116,107 v10 M124,107 v10" stroke="#e4e8e2" stroke-width="2.4"/></g>
 <g class="st${on(dhwBlock)}"><rect x="112" y="104" width="16" height="16" rx="2" class="lf"/><rect x="116" y="108" width="8" height="8" fill="#e4e8e2"/></g>
 <g class="st${on(heatOn)}"><rect x="112" y="170" width="16" height="16" rx="2" class="lf"/><path d="M117,173 l7,5 l-7,5 z" fill="#e4e8e2"/></g>
 <g class="st${on(!heatOn)}"><rect x="112" y="170" width="16" height="16" rx="2" class="lf"/><path d="M116,173 v10 M124,173 v10" stroke="#e4e8e2" stroke-width="2.4"/></g>
 <g class="${off(x.holiday)}"><rect x="146" y="82" width="24" height="18" rx="3" class="lf"/><circle cx="168" cy="98" r="6" fill="#e4e8e2" stroke-width="1.4"/><path d="M168,94 v4 h3" stroke-width="1.2"/></g>
 <g class="${off(x.mode === 'legionella')}"><path d="M182,84 h18 v16 a9,4 0 0 1 -18,0 z" fill="none" stroke-width="1.8"/><path d="M186,92 h3 v3 h3 v3 h-3 z" class="lf"/></g>
 <g class="${off(x.compRun || x.defrost)}"><rect x="238" y="82" width="34" height="20" rx="2" class="lf"/>
  ${x.defrost
    ? '<g stroke="#e4e8e2" stroke-width="1.6" stroke-linecap="round"><path d="M255,84 v16 M248,88 l14,8 M248,96 l14,-8"/><path d="M252,85 l3,2 l3,-2 M252,99 l3,-2 l3,2" fill="none" stroke-width="1.2"/></g>'
    : '<path d="M244,86 v12 M250,86 v12 M256,86 v12 M262,86 v12" stroke="#e4e8e2" stroke-width="2.6"/><path d="M268,84 v16" stroke="#e4e8e2" stroke-width="1"/>'}</g>
 <g class="${off(x.bh1)}"><rect x="280" y="82" width="32" height="20" rx="2" class="lf"/><path d="M299,84 l-8,9 h5 l-3,8 l9,-10 h-5 l3,-7 z" fill="#e4e8e2"/></g>
 <path d="M258,121 h14 v15 a7,3 0 0 1 -14,0 z" class="lf"/>
 <text class="lt" x="278" y="139" font-size="17">${x.tank == null ? '–' : fmt(x.tank, 0) + '°C'}</text>
 <path d="M156,168 l5,-8 l5,8 z M156,174 l5,8 l5,-8 z" class="lf"/>
 <g opacity="${curveOn && !standby ? 1 : 0}"><path d="M150,198 v16 h26" fill="none" stroke-width="1.4"/><path d="M152,200 h4 l14,10 h4" fill="none" stroke-width="2.4"/></g>
 ${standby
    ? '<g fill="none" stroke="#1b1f1c" stroke-width="3.4" stroke-linecap="round"><path d="M252,183 a21,21 0 1 0 22,0"/><path d="M263,172 v20"/></g>'
    : `<text class="lt big" x="300" y="222" text-anchor="end">${big}</text><text class="lt" x="304" y="186" font-size="18">°</text><text class="lt" x="314" y="220" font-size="30">C</text>`}
 <text class="lt" x="190" y="234" font-size="8">${sub}</text>
 <rect x="44" y="240" width="72" height="22" rx="3" class="lf"/><text x="80" y="257" font-size="14" font-weight="700" text-anchor="middle" fill="#e4e8e2" font-family="sans-serif">i</text>
 <rect x="122" y="240" width="74" height="22" rx="3" class="lf"/><path d="M150,251 h18" stroke="#e4e8e2" stroke-width="2.4"/>
 <rect x="202" y="240" width="74" height="22" rx="3" class="lf"/><path d="M230,251 h18 M239,242 v18" stroke="#e4e8e2" stroke-width="2.4"/>
 <rect x="282" y="240" width="74" height="22" rx="3" class="lf"/><rect x="311" y="244" width="11" height="13" fill="none" stroke="#e4e8e2" stroke-width="1.4"/><path d="M317,253 l6,-5" stroke="#e4e8e2" stroke-width="1.6"/>
</g></svg>`;
}

/** Möhlenhoff Alpha-display: groen LCD met de ingestelde temperatuur. */
export function drawAlpha(ctx, W, H, sp) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#c3cebf'); g.addColorStop(1, '#a9b6a5');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8d9a8b'; ctx.lineWidth = Math.max(2, H * 0.04); ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = '#1b1f1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const txt = sp == null ? '–' : `${fmt(sp, 1)}°`;
  let fs = H * 0.72;
  const font = (s) => `600 ${s}px Menlo, Consolas, 'DejaVu Sans Mono', monospace`;
  ctx.font = font(fs);
  while (ctx.measureText(txt).width > W * 0.9 && fs > 8) { fs -= 2; ctx.font = font(fs); }
  ctx.fillText(txt, W / 2, H / 2 + H * 0.04);
}

export const DEFAULT_CURVE = { koud: [-7, 32], warm: [12, 24], midden: null, verschuiving: 0 };
/** Controle zoals de optie-flow van het Ecodan Dashboard; geeft een foutmelding of null. */
export function curveError(c) {
  const ok = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => v !== null && v !== '' && isFinite(v));
  if (!ok(c.koud) || !ok(c.warm)) return 'koude of warme punt ontbreekt';
  if (+c.koud[0] >= +c.warm[0]) return 'het warme punt moet warmer zijn dan het koude punt';
  if (+c.koud[1] < +c.warm[1]) return 'de aanvoer bij het warme punt mag niet hoger zijn dan bij het koude punt';
  if (c.midden && ok(c.midden) && !(+c.midden[0] > +c.koud[0] && +c.midden[0] < +c.warm[0])) return 'het aanpassingspunt moet tussen het koude en het warme punt liggen';
  return null;
}
/** Stooklijn zoals in het Ecodan Dashboard: rechte stukken tussen de punten, verschuiving op alle punten. */
export function curvePoints(c) {
  const ok = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => isFinite(v));
  if (!c || !ok(c.koud) || !ok(c.warm) || +c.koud[0] >= +c.warm[0]) return null;
  const shift = +c.verschuiving || 0;
  const mid = ok(c.midden) && c.midden[0] > c.koud[0] && c.midden[0] < c.warm[0] ? c.midden : null;
  return { shift, pts: [c.koud, mid, c.warm].filter(Boolean).map(([t, v]) => [+t, +v + shift]) };
}
export function curveAt(curve, t) {
  const p = curve.pts;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (t <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
  return p[p.length - 1][1];
}
