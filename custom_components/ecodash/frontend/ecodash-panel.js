/* =====================================================================
 * Ecodan Dashboard: zijbalk-panel voor Home Assistant
 * Installatieschema van de Ecodan-warmtepomp met live waarden uit de
 * MELCloud-integratie en de kWh-meters in de meterkast. Alle data via de
 * HA-sessie (hass.states en hass.callWS), dus zonder tokens of losse servers.
 * ===================================================================== */
const ECODASH_VERSION = "1.6.1";

/* ------------------------- entiteiten ------------------------------ */
// Per sleutel: domein en mogelijke achtervoegsels na het voorvoegsel (eerste = jouw installatie).
// Wordt een entiteit niet gevonden onder het voorvoegsel, dan zoekt het panel op achtervoegsel
// binnen alle entiteiten met "ecodan" in de naam. Overrides gaan altijd voor.
const ENT = {
  buiten:      { d: "sensor", s: ["buitentemperatuur", "outside_temperature", "outdoor_temperature"] },
  freq:        { d: "sensor", s: ["heat_pump_frequency", "compressor_frequency"] },
  cond:        { d: "sensor", s: ["condensing_temperature"] },
  aanvoer:     { d: "sensor", s: ["aanvoertemperatuur", "flow_temperature"] },
  retour:      { d: "sensor", s: ["retourtemperatuur", "return_temperature"] },
  pump1:       { d: "binary_sensor", s: ["water_pump_1"] },
  klep:        { d: "binary_sensor", s: ["3_way_valve"] },
  bh1:         { d: "binary_sensor", s: ["booster_heater_1"] },
  tank:        { d: "sensor", s: ["tanktemperatuur", "tank_temperature", "tank_water_temperature"] },
  imm:         { d: "binary_sensor", s: ["immersion_heater"] },
  dhw_prod:    { d: "sensor", s: ["daily_hot_water_energy_produced"] },
  dhw_cons:    { d: "sensor", s: ["daily_hot_water_energy_consumed"] },
  dhw_cop:     { d: "sensor", s: ["sww_cop", "hot_water_cop"] },
  heat_prod:   { d: "sensor", s: ["daily_heating_energy_produced"] },
  heat_cons:   { d: "sensor", s: ["daily_heating_energy_consumed"] },
  heat_cop:    { d: "sensor", s: ["verwarming_cop", "heating_cop"] },
  e_prod:      { d: "sensor", s: ["energy_produced"] },
  demand:      { d: "sensor", s: ["demand_percentage"] },
  wifi:        { d: "sensor", s: ["signaalsterkte", "wifi_signal", "signal_strength", "rssi"] },
  boiler:      { d: "binary_sensor", s: ["boiler"] },
  boiler_flow: { d: "sensor", s: ["boiler_flow_temperature"] },
  boiler_ret:  { d: "sensor", s: ["boiler_return_temperature"] },
  mixing:      { d: "sensor", s: ["mixing_tank_temperature"] },
  pump2:       { d: "binary_sensor", s: ["water_pump_2"] },
};
const MELCLOUD_KEYS = Object.keys(ENT).concat(["water_heater", "opmode"]);
// Per kamer de slimme temperatuurmeter die naast de (domme) thermostaat hangt.
const DEFAULT_FLOORS = [
  { naam: "2E VERDIEPING", kamers: [{ naam: "Slaapkamer 4", entity: "sensor.kantoor_thermo_hygro_temperature" }] },
  { naam: "1E VERDIEPING", kamers: [
    { naam: "Slaapkamer 1", entity: "sensor.slaapkamer_thermo_hygro_temperature" },
    { naam: "Slaapkamer 2", entity: "sensor.kinderkamer_thermo_hygro_temperature" },
    { naam: "Slaapkamer 3", entity: "sensor.hobbykamer_thermo_hygro_temperature" }] },
  { naam: "BEGANE GROND", kamers: [{ naam: "Woonkamer", entity: "sensor.woonkamer_woonkamer_thermo_hygro_co2_temperatuur" }] },
];
const P_IDLE = 30;            // W: daaronder is een groep in stand-by (regelaar, wifi)
// Boven dit vermogen op de groep van de buitenunit draaien compressor en ventilator. De kWh-meter reageert direct,
// MELCloud geeft de frequentie pas na een paar minuten door; zo draait de ventilator meteen mee.
const P_RUN = 150;
// De watermeter meet al het water in huis. Alleen als het vat tegelijk afkoelt (er stroomt koud water in omdat er
// warm water getapt wordt) loopt de stroom via het vat. 1 °C, omdat MELCloud THW5 in stappen van 0,5 °C meldt
// en het vat in rust ook langzaam afkoelt.
const TAP_DROP = 1.0;         // °C afkoeling van het vat ...
const TAP_WIN = 15 * 60e3;    // ... binnen dit venster

// Stooklijn zoals op het Ecodan-display: [buitentemperatuur, aanvoertemperatuur] per punt. Komt uit Configureren,
// want MELCloud geeft de instelling niet door.
const DEFAULT_CURVE = { koud: [-7, 32], warm: [12, 24], midden: null, verschuiving: 0 };
function curvePoints(c) {
  const ok = p => Array.isArray(p) && p.length === 2 && p.every(v => isFinite(v));
  if (!c || !ok(c.koud) || !ok(c.warm) || c.koud[0] >= c.warm[0]) c = DEFAULT_CURVE;
  const shift = +c.verschuiving || 0;
  const pts = [c.koud, ok(c.midden) && c.midden[0] > c.koud[0] && c.midden[0] < c.warm[0] ? c.midden : null, c.warm]
    .filter(Boolean).map(([t, v]) => [+t, +v + shift]);
  return { pts, shift, raw: c };
}
// vlak tot het koude punt, rechte stukken tussen de punten, vlak vanaf het warme punt
function curveAt(curve, t) {
  const p = curve.pts;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (t <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
  return p[p.length - 1][1];
}

const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function resolveEntities(hass, cfg) {
  const S = hass.states, ids = Object.keys(S), ov = cfg.overrides || {}, pre = cfg.prefix || "";
  const has = id => !!id && id in S;
  const pick = (id) => (typeof id === "string" && id.includes(".") ? id : null);
  const find = (dom, suffixes) => {
    for (const s of suffixes) { const id = `${dom}.${pre ? pre + "_" : ""}${s}`; if (has(id)) return id; }
    for (const s of suffixes) {
      const c = ids.filter(id => id.startsWith(dom + ".") && id.endsWith("_" + s) && id.includes("ecodan"));
      // zone-entiteiten ("Ecodan Huis") alleen als er niets anders is
      c.sort((a, b) => a.includes("_huis_") - b.includes("_huis_") || a.length - b.length);
      if (c.length) return c[0];
    }
    return null;
  };
  const r = {};
  for (const [k, e] of Object.entries(ENT)) r[k] = pick(ov[k]) || find(e.d, e.s);

  // tapwaterbediening
  r.water_heater = pick(ov.water_heater) || (has(`water_heater.${pre}`) ? `water_heater.${pre}` : null)
    || ids.find(id => id.startsWith("water_heater.") && id.includes("ecodan"))
    || (ids.filter(id => id.startsWith("water_heater.")).length === 1 ? ids.find(id => id.startsWith("water_heater.")) : null);
  // operation mode van zone 1
  r.opmode = pick(ov.opmode) || (has(`select.${pre}_huis_operation_mode`) ? `select.${pre}_huis_operation_mode` : null)
    || ids.find(id => id.startsWith("select.") && id.includes("ecodan") && id.endsWith("operation_mode")) || null;

  // kWh-meters in de meterkast
  const meter = (side) => ids.filter(id => id.startsWith("sensor.") && id.includes("ecodan") && id.includes(side));
  const powerOf = (side) => {
    const def = `sensor.meterkast_kwh_meter_ecodan_${side}_vermogen`;
    if (has(def)) return def;
    return meter(side).find(id => /_(vermogen|power)$/.test(id)) || null;
  };
  const energyOf = (side, p) => {
    const c = [];
    if (p) c.push(p.replace(/_(vermogen|power)$/, "_energie_import"), p.replace(/_(vermogen|power)$/, "_energy_import"),
                  p.replace(/_(vermogen|power)$/, "_energie_import_tarief_1"));
    const f = c.find(has);
    if (f) return f;
    return meter(side).find(id => /_(energie|energy)_import$/.test(id)) || null;
  };
  r.p_out = pick(ov.p_out) || powerOf("buitenunit");
  r.p_in = pick(ov.p_in) || powerOf("binnenunit");
  r.e_out = pick(ov.e_out) || energyOf("buitenunit", r.p_out);
  r.e_in = pick(ov.e_in) || energyOf("binnenunit", r.p_in);

  // optioneel: tapwaterdebiet en warmtevraag
  r.tap = pick(ov.tapwater_debiet) || (has("sensor.meterkast_watermeter_water_gebruik") ? "sensor.meterkast_watermeter_water_gebruik"
    : ids.find(id => id.startsWith("sensor.") && id.includes("watermeter") && /_(water_gebruik|active_water_usage)$/.test(id)) || null);
  r.vraag = pick(ov.warmtevraag);

  // verdiepingen en kamers; thermostaten worden gezocht op kamernaam (climate.woonkamer of naam "Woonkamer")
  const floors = Array.isArray(ov.verdiepingen) && ov.verdiepingen.length ? ov.verdiepingen : DEFAULT_FLOORS;
  const climates = ids.filter(id => id.startsWith("climate.") && !id.includes("ecodan"));
  const setp = Object.fromEntries(Object.entries(cfg.instellingen || {}).map(([n, v]) => [slug(n), +v]));
  r.floors = floors.slice(0, 3).map(f => ({
    naam: String(f.naam || f.name || "").toUpperCase(),
    kamers: (f.kamers || f.rooms || []).slice(0, 4).map(k => {
      const naam = typeof k === "string" ? k : (k.naam || k.name || "");
      const given = typeof k === "object" && k ? pick(k.entity) : null;
      let ent = has(given) ? given : null;
      if (!ent && !(typeof k === "object" && k && k.entity === false)) {
        const sl = slug(naam);
        ent = climates.find(id => id === "climate." + sl)
          || climates.find(id => slug(S[id].attributes.friendly_name || "") === sl) || given;
      }
      const own = typeof k === "object" && k ? parseFloat(k.instelling) : NaN;
      const sp = isFinite(own) ? own : setp[slug(naam)];
      return { naam, ent, sp: isFinite(sp) ? sp : null };
    }),
  }));
  r.floors.forEach((f, fi) => f.kamers.forEach((k, j) => { r[`room_${fi}_${j}`] = k.ent; }));
  return r;
}

/* ------------------------- opmaak ---------------------------------- */
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? "–" : nf(d).format(v).replace("-", "−"));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hhmm = t => new Date(t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const dagTijd = t => new Date(t).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* ------------------------- SVG-schema ------------------------------ */
// grafiek van de stooklijn: buiten −30…+35 °C (zoals het display) en aanvoer 20…60 °C
const CV = { x0: 660, x1: 1150, y0: 980, t0: -30, t1: 35 };
const cvx = t => CV.x0 + (clamp(t, CV.t0, CV.t1) - CV.t0) / (CV.t1 - CV.t0) * (CV.x1 - CV.x0);
const cvy = v => CV.y0 - (clamp(v, 20, 60) - 20) * 3;
function curveSvg(curve) {
  const f = (v) => fmt(v, 0), c = curve.raw;
  const lbl = `koud ${f(c.koud[0])} → ${f(c.koud[1])} °C` + (curve.pts.length === 3 ? ` · midden ${f(c.midden[0])} → ${f(c.midden[1])} °C` : "")
    + ` · warm ${f(c.warm[0])} → ${f(c.warm[1])} °C` + (curve.shift ? ` · verschoven ${curve.shift > 0 ? "+" : ""}${f(curve.shift)} °C` : "");
  let s = `<rect class="zone" x="600" y="820" width="584" height="184" rx="8"/>
  <g class="comp" id="curvegrp" data-c="curve" data-also="th7" tabindex="0" role="button" aria-label="Stooklijn">
    <rect class="hit" x="600" y="820" width="584" height="184"/>
    <text class="zlabel" x="616" y="846">STOOKLIJN</text>
    <text class="t s" x="1168" y="846" text-anchor="end">${lbl}</text>`;
  // raster en waarden om de 5 °C (om de 10 °C iets sterker), kleine streepjes om de 2 °C
  for (let v = 20; v <= 60; v += 5)
    s += `<line class="${v % 10 ? "cgrid2" : "cgrid"}" x1="${CV.x0}" x2="${CV.x1}" y1="${cvy(v)}" y2="${cvy(v)}"/>`
      + `<line class="caxis" x1="${CV.x0 - 5}" x2="${CV.x0}" y1="${cvy(v)}" y2="${cvy(v)}"/>`
      + `<text class="t s" x="${CV.x0 - 8}" y="${cvy(v) + 3.5}" text-anchor="end">${v}°</text>`;
  for (let t = CV.t0; t <= CV.t1; t += 5)
    s += `<line class="${t % 10 ? "cgrid2" : "cgrid"}" x1="${cvx(t)}" x2="${cvx(t)}" y1="860" y2="${CV.y0}"/>`
      + `<line class="caxis" x1="${cvx(t)}" x2="${cvx(t)}" y1="${CV.y0}" y2="${CV.y0 + 5}"/>`
      + (t <= 30 ? `<text class="t s" x="${cvx(t)}" y="${CV.y0 + 16}" text-anchor="middle">${fmt(t, 0)}</text>` : "");
  for (let v = 20; v <= 60; v += 2) s += `<line class="ctick" x1="${CV.x0 - 2.5}" x2="${CV.x0}" y1="${cvy(v)}" y2="${cvy(v)}"/>`;
  for (let t = CV.t0; t <= CV.t1; t += 2) s += `<line class="ctick" x1="${cvx(t)}" x2="${cvx(t)}" y1="${CV.y0}" y2="${CV.y0 + 2.5}"/>`;
  s += `<text class="t s" x="1168" y="${CV.y0 + 16}" text-anchor="end">buiten</text>
    <line class="caxis" x1="${CV.x0}" y1="${CV.y0}" x2="${CV.x1}" y2="${CV.y0}"/><line class="caxis" x1="${CV.x0}" y1="860" x2="${CV.x0}" y2="${CV.y0}"/>`;
  const line = [[CV.t0, curve.pts[0][1]], ...curve.pts, [CV.t1, curve.pts[curve.pts.length - 1][1]]];
  s += `<polyline class="curve" points="${line.map(([t, v]) => cvx(t).toFixed(1) + "," + cvy(v).toFixed(1)).join(" ")}"/>`;
  curve.pts.forEach(([t, v]) => { s += `<circle class="cpt" cx="${cvx(t).toFixed(1)}" cy="${cvy(v).toFixed(1)}" r="3"/>`; });
  s += `<line class="cnow" id="c-now" x1="-50" x2="-50" y1="${CV.y0}" y2="${CV.y0}"/>
    <circle class="cdot" id="c-dot" r="5" cx="-50" cy="-50"/><circle class="cflow" id="c-flow" r="4.5" cx="-50" cy="-50"/>
    <text class="val" id="c-txt" x="676" y="874"></text><text class="t s" id="c-txt2" x="676" y="890"></text>
    <g id="c-cross" visibility="hidden">
      <line class="ccross" id="cx-v"/><line class="ccross" id="cx-h"/><circle class="cxdot" id="cx-dot" r="4.5"/>
      <rect class="cxbox" id="cx-xb" width="34" height="15" rx="3"/><text class="cxtxt" id="cx-xt" text-anchor="middle"></text>
      <rect class="cxbox" id="cx-yb" width="42" height="15" rx="3"/><text class="cxtxt" id="cx-yt" text-anchor="middle"></text>
    </g>
  </g>`;
  return s;
}

// pipe(): de leiding zelf plus een stroom-overlay (bolletjes) die alleen zichtbaar is als de groep actief is.
// De tekenrichting van elk pad is de stroomrichting.
const pipe = (d, col, g, thin = false) =>
  `<path class="pipe ${col} b-${g}${thin ? " thin" : ""}" d="${d}"/><path class="fl f-${g}${thin ? " thin" : ""}" d="${d}"/>`;
const pwr = (d, g) => `<path class="pwr" d="${d}"/><path class="fl f-${g} thin" d="${d}"/>`;

function floorsSvg(floors) {
  const tops = [70, 300, 530];
  let s = `<defs><linearGradient id="loopGrad" x1="0" x2="1"><stop offset="0" stop-color="var(--hot)"/><stop offset="1" stop-color="var(--ret)"/></linearGradient></defs>`;
  floors.forEach((f, fi) => {
    const T = tops[fi];
    s += `<rect class="band" x="800" y="${T}" width="378" height="210" rx="6"/>`;
    s += `<text class="t b fl-name" x="852" y="${T + 22}">${esc(f.naam)}</text>`;
    s += pipe(`M834,${T + 50} H860`, "hot", "heat");
    const hop = (T + 160) <= 580 ? `H842 a8,8 0 0 0 -16,0 H812` : `H812`;
    s += pipe(`M860,${T + 160} ${hop}`, "ret", "heat");
    s += `<g class="comp" data-c="manifold" data-also="zone1" tabindex="0" role="button" aria-label="Verdeler ${esc(f.naam.toLowerCase())}">`;
    s += `<rect class="shape" x="860" y="${T + 38}" width="24" height="134" rx="3"/>`;
    s += `<text class="t s" x="872" y="${T + 190}" text-anchor="middle">verdeler</text>`;
    for (let i = 0; i < 5; i++) {
      const y = T + 50 + i * 27, d = `M896,${y - 4} H1052 a4,4 0 0 1 0,8 H896`;
      s += `<path d="${d}" fill="none" stroke="url(#loopGrad)" stroke-width="2.4" class="b-heat"/><path class="fl f-heat thin" d="${d}"/>`;
    }
    s += `<text class="t s" x="976" y="${T + 192}" text-anchor="middle">4–5 lussen door de kamers</text></g>`;
    s += `<g class="comp" data-c="act" tabindex="0" role="button" aria-label="Ventielaandrijvingen">`;
    for (let i = 0; i < 5; i++) s += `<rect class="shape" x="884" y="${T + 44 + i * 27}" width="12" height="12" rx="2"/>`;
    s += `</g>`;
    s += `<g class="comp" data-c="tstat" tabindex="0" role="button" aria-label="Thermostaten ${esc(f.naam.toLowerCase())}">`;
    s += `<path class="sig" d="M1074,${T + 44} H1064 V${T + 32} H890 V${T + 44}"/>`;
    s += `<path class="sig s-vraag" d="M1172,${T + 49} H1182"/>`;
    s += `<rect class="shape regel" data-floor="${fi}" x="1074" y="${T + 36}" width="98" height="26" rx="4"/>`;
    s += `<text class="t s" x="1123" y="${T + 53}" text-anchor="middle">regelunit</text>`;
    const n = Math.max(1, f.kamers.length), last = T + 84 + (n - 1) * 30;
    s += `<path class="sig" d="M1078,${T + 62} V${last}"/>`;
    f.kamers.forEach((r, j) => {
      const y = T + 84 + j * 30;
      s += `<path class="sig" d="M1078,${y} H1082"/>`;
      // Möhlenhoff-display: vierkant plaatje, LCD-schermpje met de ingestelde waarde en een ronde draaiknop
      s += `<rect class="tplate" id="room-${fi}-${j}-dot" x="1083" y="${y - 14}" width="28" height="28" rx="3"/>`;
      s += `<rect class="tlcd" x="1085" y="${y - 11.5}" width="24" height="12.5" rx="1"/>`;
      s += `<text class="tsp" x="1097" y="${y - 2}" text-anchor="middle">${r.sp == null ? "–" : fmt(r.sp, 1) + "°"}</text>`;
      s += `<circle class="tknob" cx="1097" cy="${y + 7.5}" r="3.6"/>`;
      if (r.ent) {
        s += `<text class="t s room" x="1116" y="${y - 1}">${esc(r.naam)}</text>`;
        s += `<text class="val sm" id="room-${fi}-${j}" x="1116" y="${y + 11}"></text>`;
      } else s += `<text class="t s room" x="1116" y="${y + 4}">${esc(r.naam)}</text>`;
    });
    s += `</g>`;
  });
  return s;
}

function schemaSvg(floors, curve) {
  return `
<svg class="schema" id="schema" viewBox="0 0 1200 1012" role="img" aria-label="Schema van de Ecodan-installatie met buitenunit, cilinderunit en vloerverwarming">
  <rect class="zone" x="16" y="16" width="290" height="384" rx="8"/>
  <rect class="zone" x="16" y="416" width="290" height="388" rx="8"/>
  <rect class="zone" x="320" y="16" width="460" height="788" rx="8"/>
  <rect class="zone" x="794" y="16" width="390" height="788" rx="8"/>
  <text class="zlabel" x="32" y="42">BUITEN · TUIN</text>
  <text class="zlabel" x="336" y="42">TECHNISCHE RUIMTE</text>
  <text class="zlabel" x="808" y="42">WONING</text>

  <g class="comp" data-c="cyl" tabindex="0" role="button" aria-label="Cilinderunit EHST20D-VM2D">
    <rect class="ghost" x="340" y="60" width="420" height="730" rx="14" style="stroke:var(--muted)"/>
    <text class="t h" x="356" y="84">EHST20D-VM2D</text>
    <text class="t s" x="356" y="100">cilinderunit (binnen)</text>
  </g>

  <g class="comp" data-c="refr" tabindex="0" role="button" aria-label="Koudemiddelleidingen">
    <rect class="hit" x="276" y="150" width="108" height="110"/>
    ${pipe("M280,175 H352 V218 H380", "refr", "refr")}
    ${pipe("M380,250 H338 V198 H280", "refr", "refr", true)}
    <text class="t s" x="286" y="166">R32</text>
  </g>
  ${pipe("M440,240 H676", "hot", "prim")}
  ${pipe("M704,240 H804 a8,8 0 0 1 16,0 H834", "hot", "heat")}
  ${pipe("M834,240 V120", "hot", "heat")}
  ${pipe("M834,240 V580", "hot", "heat")}
  ${pipe("M690,254 V420", "hot", "dhw")}
  ${pipe("M812,230 V330", "ret", "heat")}
  ${pipe("M812,690 V330", "ret", "heat")}
  ${pipe("M812,330 H745", "ret", "heat")}
  ${pipe("M745,330 H698 a8,8 0 0 0 -16,0 H440", "ret", "prim")}
  ${pipe("M720,650 H745 V330", "ret", "dhw")}
  ${pipe("M470,456 H352", "dhw", "tap")}
  <path class="pipe dhw thin" d="M362,450 L352,456 L362,462"/>
  ${pipe("M352,736 H470", "cold", "tap")}
  <path class="pipe cold thin" d="M460,730 L470,736 L460,742"/>
  <text class="t s" x="356" y="446">warm tapwater</text>
  <text class="t s" x="364" y="474">naar de kranen</text>
  <text class="t s" x="356" y="726">koud leidingwater</text>
  <text class="val sm" id="v-tap" x="356" y="754"></text>
  <text class="val sm" id="v-tap2" x="356" y="767"></text>

  <path class="sig s-vraag" d="M1182,579 V56 H750 V125 H740"/>
  <text class="t s" x="1170" y="50" text-anchor="end">warmtevraag aan/uit → FTC6</text>

  <g class="comp" data-c="outdoor" data-also="meterOut" tabindex="0" role="button" aria-label="Buitenunit SUZ-SWM60 VA">
    <rect class="shape" x="40" y="90" width="240" height="250" rx="8"/>
    <text class="t h" x="54" y="116">SUZ-SWM60 VA</text>
    <text class="t s" x="54" y="132">buitenunit</text>
    <circle class="shape soft" cx="120" cy="228" r="62"/>
    <g class="fill-muted fan" opacity=".55">
      <circle cx="120" cy="228" r="58" fill="none" stroke="none"/>
      <ellipse cx="120" cy="198" rx="11" ry="26"/>
      <ellipse cx="120" cy="198" rx="11" ry="26" transform="rotate(120 120 228)"/>
      <ellipse cx="120" cy="198" rx="11" ry="26" transform="rotate(240 120 228)"/>
    </g>
    <circle class="fill-ink" cx="120" cy="228" r="7"/>
    <text class="t s" x="120" y="314" text-anchor="middle">ventilator + verdamper</text>
  </g>
  <g class="comp" data-c="comp" data-also="meterOut" tabindex="0" role="button" aria-label="Compressor">
    <rect class="hit" x="196" y="200" width="74" height="130"/>
    <rect class="shape compbody" x="208" y="236" width="50" height="72" rx="22"/>
    <clipPath id="compClip"><rect x="211" y="239" width="44" height="66" rx="19"/></clipPath>
    <g clip-path="url(#compClip)"><path class="sine" id="sine" d="M203,272 H263"/></g>
    <text class="t s" x="233" y="326" text-anchor="middle">compressor</text>
    <text class="val" id="v-freq" x="233" y="226" text-anchor="middle"></text>
  </g>
  <g class="comp" data-c="th7" tabindex="0" role="button" aria-label="Buitenvoeler TH7">
    <rect class="hit" x="208" y="100" width="70" height="66"/>
    <circle class="sensor" cx="252" cy="122" r="7"/>
    <text class="t s" x="240" y="126" text-anchor="end">TH7</text>
    <text class="val" id="v-buiten" x="252" y="152" text-anchor="middle"></text>
  </g>

  <g class="comp" data-c="ftc" tabindex="0" role="button" aria-label="FTC6 regelaar en MELCloud wifi">
    <rect class="shape" x="560" y="110" width="180" height="70" rx="6"/>
    <text class="t b" x="574" y="134">FTC6 regelaar</text>
    <text class="t s" x="574" y="151">+ MELCloud wifi-adapter</text>
    <text class="val" id="v-wifi" x="574" y="170"></text>
    <path class="wifi" d="M707,140 a15,15 0 0 1 22,0 M711,145 a9,9 0 0 1 14,0" fill="none" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="fill-ink" cx="718" cy="151" r="2.4"/>
  </g>

  <g class="comp" data-c="hex" tabindex="0" role="button" aria-label="Platenwarmtewisselaar">
    <rect class="shape" x="380" y="200" width="60" height="130" rx="4"/>
    <g stroke="var(--muted)" stroke-width="1.2">
      <line x1="388" y1="214" x2="432" y2="214"/><line x1="388" y1="230" x2="432" y2="230"/>
      <line x1="388" y1="246" x2="432" y2="246"/><line x1="388" y1="262" x2="432" y2="262"/>
      <line x1="388" y1="278" x2="432" y2="278"/><line x1="388" y1="294" x2="432" y2="294"/>
      <line x1="388" y1="310" x2="432" y2="310"/>
    </g>
    <text class="t s" x="410" y="350" text-anchor="middle">platenwisselaar</text>
    <text class="val" id="v-cond" x="410" y="190" text-anchor="middle"></text>
  </g>

  <g class="comp" data-c="bh1" data-also="meterIn" tabindex="0" role="button" aria-label="Booster heater 1, 2 kW">
    <rect class="hit" x="452" y="200" width="68" height="80"/>
    <rect class="shape" x="458" y="227" width="56" height="26" rx="4"/>
    <path class="coilheat" d="M464,240 l6,-7 l6,14 l6,-14 l6,14 l6,-14 l6,14 l6,-7" fill="none" stroke-width="1.6"/>
    <text class="t s" x="486" y="272" text-anchor="middle">BH1 · 2 kW</text>
    <text class="val" id="v-bh1" x="486" y="218" text-anchor="middle"></text>
  </g>

  <g class="comp" data-c="pump1" tabindex="0" role="button" aria-label="Pomp 1">
    <rect class="hit" x="528" y="200" width="44" height="80"/>
    <circle class="shape pumpbody" cx="550" cy="240" r="15"/>
    <path d="M543,232 L560,240 L543,248 Z" class="fill-ink"/>
    <text class="t s" x="550" y="272" text-anchor="middle">pomp 1</text>
    <text class="val" id="v-pump1" x="550" y="218" text-anchor="middle"></text>
  </g>

  <g class="comp" data-c="thw1" tabindex="0" role="button" aria-label="Aanvoervoeler THW1">
    <rect class="hit" x="580" y="200" width="50" height="80"/>
    <circle class="sensor" cx="608" cy="240" r="7"/>
    <text class="t s" x="608" y="272" text-anchor="middle">THW1</text>
    <text class="val" id="v-aanvoer" x="608" y="220" text-anchor="middle"></text>
  </g>

  <g class="comp" data-c="valve" tabindex="0" role="button" aria-label="Driewegklep">
    <rect class="hit" x="664" y="196" width="96" height="70"/>
    <polygon class="shape" points="675,230 690,240 675,250"/>
    <polygon class="shape vport" id="port-heat" points="705,230 690,240 705,250"/>
    <polygon class="shape vport" id="port-dhw" points="680,256 690,240 700,256"/>
    <line x1="690" y1="240" x2="690" y2="224" stroke="var(--ink)" stroke-width="1.6"/>
    <rect class="shape" x="682" y="212" width="16" height="12" rx="2"/>
    <text class="t s" x="704" y="210">3-wegklep</text>
    <text class="val" id="v-klep" x="708" y="262"></text>
  </g>

  <g class="comp" data-c="filter" tabindex="0" role="button" aria-label="Filter en debietmeter">
    <rect class="shape" x="490" y="322" width="22" height="16" rx="2"/>
    <path d="M493,325 l16,10 M509,325 l-16,10" stroke="var(--muted)" stroke-width="1.2"/>
    <rect class="shape" x="540" y="322" width="22" height="16" rx="8"/>
    <text class="t s" x="526" y="356" text-anchor="middle">filter · debiet</text>
  </g>

  <g class="comp" data-c="thw2" tabindex="0" role="button" aria-label="Retourvoeler THW2">
    <rect class="hit" x="606" y="300" width="50" height="62"/>
    <circle class="sensor" cx="632" cy="330" r="7"/>
    <text class="t s" x="632" y="356" text-anchor="middle">THW2</text>
    <text class="val" id="v-retour" x="632" y="314" text-anchor="middle"></text>
    <text class="val sm" id="v-dt" x="632" y="372" text-anchor="middle"></text>
  </g>

  <g class="comp" data-c="tank" data-also="wh" tabindex="0" role="button" aria-label="Tapwatervat 200 liter">
    <rect id="tankfill" x="474" y="424" width="242" height="342" rx="36"/>
    <rect class="shape" x="470" y="420" width="250" height="350" rx="40" style="fill:none"/>
    <text class="t b" x="595" y="752" text-anchor="middle">tapwatervat 200 L</text>
    <text class="val sm" id="v-target" x="595" y="446" text-anchor="middle"></text>
  </g>
  <g class="comp" data-c="coil" tabindex="0" role="button" aria-label="Warmtewisselspiraal in het vat">
    <rect class="hit" x="520" y="460" width="180" height="200"/>
    ${pipe("M690,420 V470 H530 V500 H690 V530 H530 V560 H690 V590 H530 V620 H690 V650 H720", "dhw", "dhw", true)}
  </g>
  <g class="comp" data-c="imm" tabindex="0" role="button" aria-label="Dompelaar, optioneel">
    <rect class="ghost" id="imm-shape" x="530" y="684" width="130" height="16" rx="3"/>
    <text class="t s" x="595" y="720" text-anchor="middle">dompelaar (niet ingebouwd)</text>
  </g>
  <g class="comp" data-c="thw5" tabindex="0" role="button" aria-label="Tankvoeler THW5">
    <rect class="hit" x="400" y="566" width="90" height="46"/>
    <circle class="sensor" cx="472" cy="590" r="7"/>
    <text class="t s" x="458" y="584" text-anchor="end">THW5</text>
    <text class="val" id="v-tank" x="458" y="603" text-anchor="end"></text>
  </g>

  <g class="comp" data-c="unused" tabindex="0" role="button" aria-label="Niet aangesloten onderdelen">
    <rect class="hit" x="16" y="416" width="290" height="330"/>
    <text class="zlabel" x="32" y="442">NIET AANGESLOTEN</text>
    <text class="t s" x="32" y="460">entiteiten bestaan wel, maar meten niets</text>
    <rect class="ghost" x="36" y="486" width="40" height="52" rx="4"/>
    <path d="M56,526 c-9,-6 -6,-16 0,-22 c1,7 9,9 6,17 c-2,4 -4,5 -6,5z" fill="none" stroke="var(--off)" stroke-width="1.4"/>
    <text class="t b" x="92" y="502">Externe cv-ketel</text>
    <text class="t s" x="92" y="518">boiler · boiler flow/return</text>
    <text class="val off" id="v-boiler" x="92" y="534"></text>
    <rect class="ghost" x="40" y="586" width="32" height="60" rx="12"/>
    <text class="t b" x="92" y="604">Mengvat / buffervat</text>
    <text class="t s" x="92" y="620">mixing tank temperature</text>
    <text class="val off" id="v-mixing" x="92" y="636"></text>
    <circle class="ghost" cx="56" cy="716" r="18"/>
    <path d="M49,708 L66,716 L49,724 Z" fill="none" stroke="var(--off)" stroke-width="1.4"/>
    <text class="t b" x="92" y="704">Pomp 2 (zonepomp)</text>
    <text class="t s" x="92" y="720">water pump 2</text>
    <text class="val off" id="v-pump2" x="92" y="736"></text>
  </g>
  <g class="comp" data-c="absent" tabindex="0" role="button" aria-label="Uitgeschakelde entiteiten">
    <rect class="hit" x="24" y="752" width="274" height="46"/>
    <line x1="32" y1="756" x2="290" y2="756" stroke="var(--line)" stroke-width="1"/>
    <text class="t b" x="32" y="774" style="fill:var(--muted)">Uitgeschakeld in Home Assistant</text>
    <text class="t s" x="32" y="790">koeling · 2-wegklep · BH2 · BH2+ · pomp 3 en 4</text>
  </g>

  <rect class="zone" x="16" y="820" width="574" height="184" rx="8"/>
  <text class="zlabel" x="32" y="846">METERKAST</text>
  <g class="comp" data-c="meterOut" tabindex="0" role="button" aria-label="kWh-meter buitenunit">
    ${pwr("M313,850 V300 H280", "eout")}
    <rect class="shape" x="253" y="850" width="120" height="46" rx="5"/>
    <text class="t b" x="263" y="869">kWh buitenunit</text>
    <text class="val" id="v-pout" x="263" y="887"></text>
    <text class="t s" id="v-eout" x="365" y="887" text-anchor="end"></text>
  </g>
  <g class="comp" data-c="meterIn" tabindex="0" role="button" aria-label="kWh-meter binnenunit">
    ${pwr("M443,850 V790", "ein")}
    <rect class="shape" x="383" y="850" width="120" height="46" rx="5"/>
    <text class="t b" x="393" y="869">kWh binnenunit</text>
    <text class="val" id="v-pin" x="393" y="887"></text>
    <text class="t s" id="v-ein" x="495" y="887" text-anchor="end"></text>
  </g>
  <text class="t s" x="32" y="926">Echte stroommeting in de meterkast, los van de schattingen in MELCloud.</text>
  <text class="t s" id="v-meter1" x="32" y="944"></text>
  <text class="t s" id="v-meter2" x="32" y="962"></text>
  ${curveSvg(curve)}

  <g id="floors">${floorsSvg(floors)}</g>
</svg>`;
}

/* ------------------------- onderdelen ------------------------------ */
const C = {
  outdoor: { name: "Buitenunit SUZ-SWM60 VA", where: "Tuin", text: "De eigenlijke warmtepomp. De ventilator blaast buitenlucht langs de verdamper; het koude koudemiddel neemt daar warmte op, ook als het buiten koud is. Een 6 kW-unit (SWM60). Er loopt geen water naar buiten, alleen twee koudemiddelleidingen. In het schema draait de ventilator mee zodra de compressor draait: volgens MELCloud (frequentie boven 0 Hz) of al eerder volgens de kWh-meter (meer dan 150 W op de groep van de buitenunit)." },
  comp: { name: "Compressor", where: "In de buitenunit", text: "Het hart van de warmtepomp. Drukt het koudemiddel samen, waardoor het heet wordt. Het is een inverter: het toerental (in Hz) past zich aan de vraag aan. 0 Hz = uit." },
  th7: { name: "Buitenvoeler TH7", where: "Achterkant buitenunit", text: "Meet de buitentemperatuur. De regelaar gebruikt die voor de stooklijn: hoe kouder het buiten is, hoe warmer het water naar de vloeren gaat." },
  refr: { name: "Koudemiddelleidingen (R32)", where: "Tussen tuin en technische ruimte", text: "Twee koperen leidingen: een dikke gasleiding (heet gas naar binnen) en een dunne vloeistofleiding (terug naar buiten). Dit is een split-systeem: het koudemiddel komt tot in de cilinderunit. De paarse bolletjes lopen zodra de compressor draait; hoe hoger het toerental, hoe sneller." },
  hex: { name: "Platenwarmtewisselaar", where: "In de cilinderunit", text: "Hier wordt koudemiddel-warmte omgezet in warm water. Het hete koudemiddel condenseert (wordt weer vloeibaar) en geeft daarbij zijn warmte af aan het verwarmingswater dat er aan de andere kant langs stroomt." },
  ftc: { name: "FTC6 regelaar + MELCloud wifi", where: "In de cilinderunit (achter het bedieningspaneel)", text: "Het brein. De FTC6 leest alle voelers, stuurt pomp, klep en heaters aan, berekent het energieverbruik en praat via de wifi-adapter met MELCloud. Home Assistant haalt alle waarden op uit MELCloud, niet rechtstreeks uit de unit. Daardoor lopen de waarden een paar minuten achter." },
  bh1: { name: "Booster heater 1 (2 kW)", where: "In de aanvoerleiding, in de cilinderunit", text: "Een elektrisch verwarmingselement direct in het water. Springt bij als de warmtepomp het alleen niet redt: strenge vorst, ontdooien, of de wekelijkse legionella-run (vat naar ±60 °C). Dit is de dure route: 1 kWh stroom = 1 kWh warmte." },
  pump1: { name: "Pomp 1 (circulatiepomp)", where: "In de cilinderunit", text: "Ingebouwde pomp die het water rondpompt door de platenwisselaar en daarna naar het vat óf de vloeren. Staat de pomp uit, dan stroomt er niets en staan er in het schema geen bolletjes op de waterleidingen." },
  thw1: { name: "Aanvoervoeler THW1", where: "Aanvoerleiding, na booster heater", text: "Temperatuur van het water dat de unit verlaat. Bij vloerverwarming meestal 25–35 °C; bij tapwater maken hoger, tot ±55 °C." },
  valve: { name: "3-wegklep", where: "In de cilinderunit", text: "Wissel tussen twee bestemmingen. Stand 'verwarming': water gaat naar de vloerverwarming. Stand 'tapwater': water gaat door de spiraal in het vat. Het schema kleurt de actieve uitgang en dimt de tak die niet in gebruik is." },
  filter: { name: "Filter en debietmeter", where: "Retourleiding, in de cilinderunit", text: "Het filter vangt vuil uit het verwarmingswater (onderdeel van het onderhoud). De debietmeter meet hoeveel liter per minuut er stroomt; voor de SWM60 hoort dat tussen 7,2 en 17,2 L/min te liggen. Deze waarde zit niet in de MELCloud-integratie." },
  thw2: { name: "Retourvoeler THW2", where: "Retourleiding, in de cilinderunit", text: "Temperatuur van het water dat terugkomt. Het verschil met de aanvoer (ΔT) laat zien hoeveel warmte er is afgegeven. Bij vloerverwarming is 3–7 °C verschil normaal." },
  tank: { name: "Tapwatervat 200 L", where: "Onderste deel van de cilinderunit", text: "Roestvrijstalen vat met het drinkwater voor kranen en douche. Het verwarmingswater raakt dit drinkwater nooit; het geeft zijn warmte af via de spiraal. De kleur in het vat volgt de tanktemperatuur." },
  coil: { name: "Spiraal in het vat", where: "In het tapwatervat", text: "Als de 3-wegklep op tapwater staat, stroomt het warme verwarmingswater door deze spiraal en warmt zo het vat op." },
  imm: { name: "Dompelaar (immersion heater)", where: "Zou in het vat zitten", text: "Een optioneel elektrisch element direct in het tapwatervat. De standaard EHST20D-uitvoeringen hebben er geen; de entiteit bestaat omdat de regelaar het wel kán aansturen." },
  thw5: { name: "Tankvoeler THW5", where: "Halverwege het vat", text: "Temperatuur van het tapwater. Zakt die onder de ingestelde waarde min de hysterese (vaak 5–10 °C), dan schakelt de warmtepomp naar tapwater. Tap je warm water, dan stroomt er onderin koud leidingwater bij en zakt deze temperatuur; daaraan herkent het panel dat het water via het vat loopt." },
  cyl: { name: "Cilinderunit EHST20D-VM2D", where: "Technische ruimte", text: "Alles-in-één binnenunit: platenwisselaar, pomp, 3-wegklep, 2 kW booster heater, expansievat, regelaar en een 200 L tapwatervat in één kast. 'VM2' = 1-fase, 2 kW booster heater. De H in EHST staat voor alleen verwarmen: deze unit kan niet koelen." },
  manifold: { name: "Vloerverwarmingsverdelers", where: "Eén per verdieping", text: "Verdelen het warme water over 4–5 lussen per verdieping. Elke lus is een slang die door één kamer (of een deel ervan) in de dekvloer loopt en afgekoeld terugkomt." },
  act: { name: "Ventielaandrijvingen (kranen)", where: "Op de verdelers", text: "Kleine elektrische 'knoppen' bovenop de verdeler die een lus open of dicht zetten. Ze worden aangestuurd door de thermostaat van de kamer. Niet zichtbaar in MELCloud." },
  tstat: { name: "Thermostaten + regelunit", where: "Per verdieping", text: "Elke thermostaat (Möhlenhoff) opent de kranen van zijn eigen kamer. In het display-icoon staat de ingestelde temperatuur uit Configureren, ernaast de gemeten temperatuur. Zodra er ergens één warmte vraagt, geeft de regelunit een aan/uit-signaal aan de FTC6 en gaat de warmtepomp draaien. De thermostaten zelf zijn niet slim; de temperatuur bij elke kamer komt van de slimme temperatuurmeter die ernaast hangt. Of een thermostaat warmte vraagt is daardoor niet te zien. Het panel leidt de warmtevraag af uit de warmtepomp: draait die op ruimteverwarming, dan vraagt minstens één thermostaat warmte en kleurt het signaal naar de FTC6 rood." },
  unused: { name: "Niet aangesloten", where: "—", text: "De FTC6 ondersteunt een hybride cv-ketel, een mengvat met extra zonepomp en meer. Bij jou is dat niet aangesloten. De entiteiten bestaan omdat MELCloud ze altijd meestuurt. Voelers zonder sensor geven een vaste 25,0 °C." },
  curve: { name: "Stooklijn (compensatiecurve)", where: "Instelling in de FTC6", text: "Met Operation mode Curve bepaalt de FTC6 de aanvoertemperatuur uit de buitentemperatuur (TH7): hoe kouder buiten, hoe warmer het water naar de vloeren. Tot en met het koude punt geldt de hoogste aanvoer, vanaf het warme punt de laagste, en daartussen loopt de lijn recht (via het aanpassingspunt als dat is ingesteld). De groene stip is de huidige buitentemperatuur op de lijn: de aanvoer waar de FTC6 nu op mikt. De rode stip is de werkelijke aanvoer (THW1) zodra de vloerverwarming draait. De punten komen niet uit MELCloud maar uit Configureren; pas ze daar aan als je de stooklijn op het Ecodan-display verandert." },
  zone1: { name: "Zone 1: de vloerverwarming", where: "Alle verdiepingen samen", text: "Voor de FTC6 is je hele vloerverwarming één zone. In Home Assistant maakt MELCloud daar een apart apparaat voor ('Ecodan Huis'). Het apparaat 'Ecodan' is de unit zelf met het tapwater." },
  absent: { name: "Uitgeschakelde entiteiten", where: "Komen niet voor in jouw installatie", text: "De MELCloud-integratie maakt voor elke uitgang van de FTC6 een entiteit aan, ook voor functies die jouw installatie niet heeft: koelen, een tweede booster-trap, extra zones en een los tapwatervat. Home Assistant heeft deze standaard uitgeschakeld en dat kan zo blijven." },
  meterOut: { name: "kWh-meter buitenunit", where: "Meterkast", text: "Meet het werkelijke stroomverbruik van de groep naar de buitenunit: compressor en ventilator. Bij de gebruikelijke Ecodan-bedrading krijgt de cilinderunit zijn regelstroom (FTC6, wifi, pomp 1, 3-wegklep) via de buitenunit, dus dan telt dat verbruik hier mee. Dit is de meting om op te vertrouwen; de 'consumed'-waarden in MELCloud zijn schattingen van de FTC6. Boven 30 W lopen er gele bolletjes over de stroomkabel." },
  meterIn: { name: "kWh-meter binnenunit", where: "Meterkast", text: "Meet de aparte groep naar de cilinderunit. Die voedt vooral de 2 kW booster heater (BH1). Die gaat aan bij de legionella-run: de warmtepomp brengt het vat naar ±50–55 °C en de booster heater duwt het laatste stuk naar 60 °C. Ook als back-up bij strenge vorst kan hij bijspringen. Op vol vermogen zie je hier ongeveer 2000 W." },
};
C.wh = C.tank;

/* ------------------------- entiteitenlijst ------------------------- */
// k = sleutel in de resolver, c = onderdeel in het schema, x = uitleg, now(X) = interpretatie van de live waarde
const onoff = v => v == null ? "–" : v ? "aan" : "uit";
const G = [
  { title: "Buitenunit", note: "Wat de buitenunit in de tuin meet en doet.", items: [
    { k: "buiten", n: "Buitentemperatuur", c: "th7", now: X => X.buiten == null ? "" : X.buiten < 0
      ? "Vorst: de stooklijn vraagt een hoge aanvoertemperatuur en de booster heater kan bijspringen."
      : X.buiten < 7 ? "Koud: de stooklijn vraagt een hogere aanvoertemperatuur."
      : X.buiten < 16 ? "Mild weer: de stooklijn vraagt een lage aanvoertemperatuur." : "Warm: er is weinig of geen verwarmingsvraag." },
    { k: "freq", n: "Heat pump frequency", c: "comp", now: X => X.compByMeter ? `MELCloud meldt nog 0 Hz, maar de kWh-meter van de buitenunit meet ${fmt(X.pOut, 0)} W: de compressor draait al. De frequentie volgt over een paar minuten.`
      : !X.freq ? "0 Hz: de compressor staat stil."
      : `De compressor draait op ${fmt(X.freq, 0)} Hz` + (X.freq < 35 ? ": laag toerental, rustig modulerend en zuinig." : X.freq > 70 ? ": hoog toerental, grote vraag (tapwater of kou)." : ".") },
    { k: "cond", n: "Condensing temperature", c: "hex", x: "Temperatuur waarbij het koudemiddel in de platenwisselaar condenseert, dus waar de warmte aan het water wordt afgegeven. Wordt gemeten in de buitenunit, maar hoort fysiek bij de platenwisselaar.",
      now: X => !X.freq ? "Bij stilstand zakt het koudemiddel richting omgevingstemperatuur."
      : X.aanvoer != null && X.cond != null ? `${fmt(X.cond - X.aanvoer, 1)} °C boven de aanvoertemperatuur. Een paar graden is normaal; hoe kleiner, hoe zuiniger.` : "" },
  ]},
  { title: "Waterkant cilinderunit", note: "Het verwarmingswater dat rondgaat tussen platenwisselaar, vat en vloeren.", items: [
    { k: "aanvoer", n: "Aanvoertemperatuur", c: "thw1", now: X => !X.pump1 ? "De pomp staat stil: dit is stilstaand water in de unit (restwarmte), geen echte aanvoer."
      : X.dhw ? "Water naar de spiraal in het vat." : "Water naar de vloerverwarming." },
    { k: "retour", n: "Retourtemperatuur", c: "thw2", now: X => !X.pump1 || X.dT == null ? "De pomp staat stil, dus ΔT zegt nu niets."
      : `ΔT ${fmt(X.dT, 1)} °C` + (X.dhw ? "." : X.dT < 2 ? ": klein, de vloeren nemen weinig warmte af." : X.dT > 8 ? ": groot, veel afgifte of weinig debiet." : ": normaal voor vloerverwarming.") },
    { k: "pump1", n: "Water pump 1", c: "pump1", now: X => X.pump1 ? "Aan: er stroomt water door de unit." : "Uit: er stroomt geen water." },
    { k: "klep", n: "3-way valve", c: "valve", now: X => X.dhw ? "Klep staat op tapwater: het water gaat door de spiraal in het vat." : "Klep staat op ruimteverwarming (vloeren)." },
    { k: "bh1", n: "Booster heater 1", c: "bh1", now: X => !X.bh1 ? "Uit: geen elektrische bijverwarming."
      : X.dhw ? "Aan tijdens tapwater: waarschijnlijk de legionella-run (vat naar ±60 °C)."
      : "Aan tijdens verwarmen: de warmtepomp redt het alleen niet (vorst of ontdooien). Dit is dure warmte." },
  ]},
  { title: "Tapwater", note: "Het drinkwater in het vat voor kranen en douche.", items: [
    { k: "tank", n: "Tanktemperatuur", c: "thw5", now: X => {
      if (X.tank == null) return "";
      if (X.mode === "tapwater") return "Het vat wordt nu opgewarmd.";
      if (X.target == null) return "";
      const d = X.target - X.tank;
      return d <= 0 ? "Het vat is op temperatuur." : d <= 8 ? `${fmt(d, 1)} °C onder het doel: binnen de marge (hysterese), de warmtepomp start nog niet.`
        : `${fmt(d, 1)} °C onder het doel: de warmtepomp schakelt binnenkort naar tapwater.`; } },
    { k: "water_heater", n: "Ecodan (bediening tapwater)", c: "tank", x: "De bedienknop voor het tapwater. Hier stel je de gewenste vattemperatuur en de modus in. 'Huidige temperatuur' is dezelfde meting als Tanktemperatuur (THW5).",
      now: X => X.target == null ? "" : `Modus ${esc(X.whMode || "–")}, doel ${fmt(X.target, 0)} °C.` },
    { k: "tap", n: "Waterverbruik (watermeter)", c: "tank", x: `De watermeter in de meterkast meet al het water in huis, ook voor toilet en koude kranen. Het schema toont alleen stroming door het vat als het vat tegelijk minstens ${fmt(TAP_DROP, 1)} °C afkoelt binnen ${TAP_WIN / 60e3} minuten. Doordat MELCloud de tanktemperatuur met vertraging doorgeeft, start dat pas na een paar minuten; korte tapbeurten (handen wassen) zie je niet.`,
      now: X => !X.tapFlow ? "Er stroomt nu geen water." : X.hotDraw ? `Er wordt warm water getapt: het vat is ${fmt(X.tankDrop, 1)} °C afgekoeld.` : "Er stroomt water, maar het vat koelt niet af: waarschijnlijk toilet of een koude kraan." },
  ]},
  { title: "Regelaar, energie en verbinding", note: "Waarden die de FTC6 berekent of over zichzelf rapporteert.", items: [
    { k: "dhw_prod", n: "Daily hot water energy produced", c: "ftc", x: "Warmte die vandaag in het tapwatervat is gestopt. Berekend door de FTC6 uit debiet × (aanvoer − retour); een goede schatting, geen geijkte meter.", now: X => X.dailyFresh ? "" : `Deze waarde is sinds ${dagTijd(X.dailySince)} niet veranderd, dus hij hoort bij een eerdere dag. MELCloud werkt de dagtotalen met vertraging bij.` },
    { k: "dhw_cons", n: "Daily hot water energy consumed", c: "ftc", x: "Stroom die vandaag is verbruikt voor tapwater (compressor, pomp, eventueel heaters). Intern berekend.", now: X => X.dailyFresh ? "" : `Deze waarde is sinds ${dagTijd(X.dailySince)} niet veranderd, dus hij hoort bij een eerdere dag. MELCloud werkt de dagtotalen met vertraging bij.` },
    { k: "dhw_cop", n: "SWW COP", c: "ftc", x: "COP voor sanitair warm water = geproduceerd ÷ verbruikt. Hoe hoger, hoe zuiniger. Tapwater haalt lager dan verwarming omdat het water heter moet (±50 °C).",
      now: X => X.dhw_cop ? (X.dhw_cop >= 2 ? "Normaal voor tapwater." : "Laag: misschien heeft de booster heater meegedraaid (legionella-run).") : "0: vandaag nog geen tapwater gemaakt." },
    { k: "heat_prod", n: "Daily heating energy produced", c: "ftc", x: "Warmte die vandaag naar de vloerverwarming is gegaan.", now: X => X.dailyFresh ? "" : `Deze waarde is sinds ${dagTijd(X.dailySince)} niet veranderd, dus hij hoort bij een eerdere dag. MELCloud werkt de dagtotalen met vertraging bij.` },
    { k: "heat_cons", n: "Daily heating energy consumed", c: "ftc", x: "Stroom die vandaag voor ruimteverwarming is verbruikt.", now: X => X.dailyFresh ? "" : `Deze waarde is sinds ${dagTijd(X.dailySince)} niet veranderd, dus hij hoort bij een eerdere dag. MELCloud werkt de dagtotalen met vertraging bij.` },
    { k: "heat_cop", n: "Verwarming COP", c: "ftc", x: "COP voor ruimteverwarming. Bij vloerverwarming haalt een Ecodan buiten de strenge winter vaak 4 of hoger.",
      now: X => X.heat_cop ? (X.heat_cop >= 3.5 ? "Goed." : X.heat_cop >= 2.5 ? "Redelijk; bij kou is dit normaal." : "Laag: weinig gedraaid, of de booster heater sprong bij.") : "0: te weinig gedraaid om te berekenen." },
    { k: "e_prod", n: "Energy produced", c: "ftc", x: "Lopende waarde van geleverde warmte. Staat op 0 zolang de compressor niets levert." },
    { k: "demand", n: "Demand percentage", c: "ftc", x: "Waarschijnlijk de vraagbegrenzing uit MELCloud: hoeveel procent van het vermogen de warmtepomp maximaal mag gebruiken.",
      now: X => X.demand == null ? "" : X.demand >= 100 ? "100 %: geen begrenzing." : `Begrensd op ${fmt(X.demand, 0)} %.` },
    { k: "wifi", n: "Signaalsterkte", c: "ftc", x: "Wifi-ontvangst van de MELCloud-adapter. Beter dan −60 dBm is goed, slechter dan −75 dBm geeft verbindingsproblemen.",
      now: X => X.wifi == null ? "" : X.wifi >= -60 ? "Uitstekend." : X.wifi >= -75 ? "Redelijk." : "Zwak: kans op verbindingsproblemen met MELCloud." },
    { k: "opmode", n: "Operation mode (Ecodan Huis)", c: "curve", x: "Hoe de FTC6 de aanvoertemperatuur bepaalt: Room (op kamertemperatuur van het display), Flow (vaste aanvoertemperatuur) of Curve (stooklijn op basis van de buitentemperatuur). Het panel toont dit alleen; wijzigen kan hier bewust niet.",
      now: X => X.opmode == null ? "" : /curve/i.test(X.opmode) ? "Curve = stooklijn. Zo hoort het bij jouw installatie." : "Let op: niet op Curve. Daardoor regelt de warmtepomp anders dan bedoeld." },
  ]},
  { title: "Stroommeting meterkast", note: "Je eigen kWh-meters: echte metingen, los van MELCloud.", items: [
    { k: "p_out", n: "Vermogen buitenunit", c: "meterOut", x: "Actueel opgenomen vermogen van de groep naar de buitenunit, gemeten in de meterkast.",
      now: X => X.pOut == null ? "" : X.pOut < P_IDLE ? "Stand-by: dit is het rustverbruik van de elektronica, waarschijnlijk inclusief de FTC6 en wifi-adapter." : "De compressor draait: honderden tot ruim duizend watt is normaal." },
    { k: "p_in", n: "Vermogen binnenunit", c: "meterIn", x: "Actueel opgenomen vermogen van de aparte groep naar de cilinderunit, gemeten in de meterkast.",
      now: X => X.pIn == null ? "" : X.pIn < P_IDLE ? "De booster heater is uit." : X.pIn > 1500 ? "De booster heater staat aan (±2000 W)." : "Klein verbruik op de binnenunit-groep." },
    { k: "e_out", n: "Energie buitenunit (teller)", c: "meterOut", x: "Totaalteller van de kWh-meter. Het panel rekent hiermee het verbruik van vandaag uit (stand nu − stand om middernacht)." },
    { k: "e_in", n: "Energie binnenunit (teller)", c: "meterIn", x: "Totaalteller van de kWh-meter van de binnenunit-groep." },
  ]},
  { title: "Niet aangesloten", note: "Deze entiteiten bestaan, maar er hangt niets aan. Je kunt ze in Home Assistant uitschakelen.", items: [
    { k: "boiler", n: "Boiler", c: "unused", unused: 1, x: "Stuursignaal voor een externe cv-ketel (hybride systeem). 'Boiler' betekent hier ketel, niet het tapwatervat.", now: X => X.boiler ? "Aan! Er is geen ketel, dus dit is onverwacht." : "Uit, en blijft uit: er is geen ketel." },
    { k: "boiler_flow", n: "Boiler flow temperature", c: "unused", unused: 1, x: "Aanvoervoeler THWB1 van een externe ketel.", now: X => fixed25(X.v) },
    { k: "boiler_ret", n: "Boiler return temperature", c: "unused", unused: 1, x: "Retourvoeler THWB2 van een externe ketel.", now: X => fixed25(X.v) },
    { k: "mixing", n: "Mixing tank temperature", c: "unused", unused: 1, x: "Voeler THW10 in een mengvat (buffervat). Wordt gebruikt als het systeem met een extra zonepomp werkt.", now: X => fixed25(X.v) },
    { k: "imm", n: "Immersion heater", c: "imm", unused: 1, x: "Uitgang voor een dompelaar (elektrisch element) in het tapwatervat.",
      now: X => X.imm == null ? "Uitgeschakeld in Home Assistant. Bij de EHST20D-VM2D zit geen dompelaar, dus dat kan zo blijven."
        : X.imm ? "Aan! Onverwacht: bij de EHST20D-VM2D zit normaal geen dompelaar." : "Uit. Bij jouw model zit geen dompelaar, dus dit blijft altijd uit." },
    { k: "pump2", n: "Water pump 2", c: "unused", unused: 1, x: "Extra pomp voor zone 1 (uitgang OUT2), alleen nodig bij een mengvat of een lange leiding.", now: X => X.pump2 ? "Aan: dan heeft de installateur wél een tweede pomp geplaatst." : "Uit." },
  ]},
  { title: "Uitgeschakeld in Home Assistant", note: "Deze entiteiten staan bij jou terecht uit. De regelaar kan ze aansturen, maar jouw installatie heeft de onderdelen niet.", items: [
    { k: "dis-cool", dis: 1, n: "Daily cooling energy consumed/produced", c: "absent", x: "Stroomverbruik en geleverde koeling per dag.", now: () => "Niet van toepassing. De EHST20D verwarmt alleen (de H in EHST)." },
    { k: "dis-2way", dis: 1, n: "2-way valve", c: "absent", x: "Uitgang voor een 2-wegklep.", now: () => "Niet aanwezig. Jouw unit gebruikt de ingebouwde 3-wegklep." },
    { k: "dis-bh2", dis: 1, n: "Booster heater 2 en 2+", c: "absent", x: "Tweede trap van de booster heater, op grotere modellen.", now: () => "Bestaat niet bij jou: de VM2D heeft één trap van 2 kW." },
    { k: "dis-pump34", dis: 1, n: "Water pump 3 en 4", c: "absent", x: "Pomp voor zone 2 en een tapwaterpomp voor een los vat.", now: () => "Niet aanwezig: één zone en een ingebouwd vat." },
    { k: "dis-zone", dis: 1, n: "Ecodan Huis: thermostaat, flow, kamertemperatuur", c: "zone1", x: "De overige entiteiten van zone 1.", now: () => "Uitgeschakeld. De kamerthermostaten bepalen wánnéér er gestookt wordt, de stooklijn hoe warm." },
  ]},
];
function fixed25(v) { return v == null ? "" : Math.abs(v - 25) < 0.05 ? "25,0 °C vast: geen voeler aangesloten." : `${fmt(v, 1)} °C, niet de vaste 25,0 °C: misschien is er toch een voeler aangesloten.`; }

/* ------------------------- stijl ----------------------------------- */
const STYLE = `
:host{
  --bg:#eef1ef; --surface:#fafbfa; --ink:#1b2422; --muted:#5b6865; --line:#c3ccc8; --zone:#e3e8e5;
  --hot:#c9412c; --ret:#2c64c4; --refr:#7a4bbf; --dhw:#d9820f; --cold:#2a9bb5; --sig:#6c7a76;
  --accent:#0d7a64; --accent-soft:#d3ebe4; --off:#8a9692; --elec:#a87a00; --warn:#b26a00; --warn-soft:#fbeed6;
  --bad:#b3261e; --bad-soft:#f9dedc; --dot:#ffffffee;
  --plate:#ffffff; --plate-edge:#9aa6a2; --lcd:#b9c4b5; --lcd-edge:#8d9a8b;
  --f-display:"Barlow Semi Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif;
  --f-body:"IBM Plex Sans",Roboto,system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  display:block;height:100%;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.55;
  -webkit-font-smoothing:antialiased}
:host(.dark){
  /* donker thema in de stijl van het Home Assistant-dashboard: bijna zwart, neutrale tegels, lime accent */
  --bg:#0c0c0c; --surface:#131313; --ink:#e8e8e8; --muted:#9a9da2; --line:#2a2a2a; --zone:#1a1a1a;
  --hot:#ff6b57; --ret:#5d9bff; --refr:#b48cff; --dhw:#ffab40; --cold:#4fd2e6; --sig:#7a7a7a;
  --accent:#aedf2a; --accent-soft:#232d0c; --off:#6b6b6b; --elec:#f2c53d; --warn:#f0b04a; --warn-soft:#2a2213;
  --bad:#ff6b5e; --bad-soft:#2c1513; --dot:#ffffffd9; --bar:#161616; --ctl:#2a2a2a;
  --plate:#2c2c2c; --plate-edge:#8a8a8a; --lcd:#aebaa9; --lcd-edge:#6f7b6c;
  --f-display:Roboto,"Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-body:Roboto,"Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-mono:Roboto,"Noto Sans",system-ui,sans-serif; color-scheme:dark}
/* tegels: geen rand, ronde hoeken en een dun lime lijntje bovenaan dat naar rechts vervaagt */
:host(.dark) .kpi, :host(.dark) .board, :host(.dark) aside.detail, :host(.dark) section.flow > div, :host(.dark) .now-box{
  border:0;border-radius:12px;
  background:linear-gradient(90deg,var(--accent),transparent 35%) top left/100% 1.5px no-repeat,var(--surface)}
:host(.dark) .kpi:hover{box-shadow:0 0 0 1px var(--line)}
:host(.dark) .kpi .k{font-size:14px}
:host(.dark) .kpi .v{font-size:30px;font-weight:400;letter-spacing:-.01em;line-height:1.2}
:host(.dark) .kpi .v small{font-size:15px}
:host(.dark) .bar{background:var(--bar);border-bottom:0}
:host(.dark) .bar h1{font-weight:500}
:host(.dark) .zb{background:var(--ctl);border:0;border-radius:12px;box-shadow:none}
:host(.dark) .zoombar{border-top-color:var(--line)}
:host(.dark) .board-foot{border-top-color:var(--line)}
:host(.dark) .chip{border-color:#353535}
:host(.dark) .banner{border-radius:12px}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
#root{height:100%;overflow:auto}
.bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;padding:max(6px,env(safe-area-inset-top)) 12px 6px 4px;
  background:var(--bg);border-bottom:1px solid var(--line)}
.bar h1{font-family:var(--f-display);font-weight:700;font-size:21px;margin:0 6px 0 4px;letter-spacing:.01em}
ha-menu-button{--mdc-icon-button-size:40px;color:var(--ink)}
.chip{font-family:var(--f-mono);font-size:12px;padding:2px 10px;border-radius:99px;border:1px solid var(--line);white-space:nowrap}
.chip.rust{color:var(--muted)} .chip.verwarming{color:var(--hot);border-color:var(--hot)}
.chip.tapwater{color:var(--dhw);border-color:var(--dhw)} .chip.legionella{color:var(--bad);border-color:var(--bad)}
.sp{flex:1}
.upd{font-family:var(--f-mono);font-size:11.5px;color:var(--muted);white-space:nowrap}
@media (max-width:560px){.upd{display:none}.bar h1{font-size:19px}.chip{overflow:hidden;text-overflow:ellipsis;min-width:0}}
.iconbtn{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none}
.iconbtn:hover{background:var(--zone)}
.iconbtn svg{width:22px;height:22px}
:host(.dark) .sun, :host(:not(.dark)) .moon{display:none}
.wrap{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:22px;padding:18px 16px calc(48px + env(safe-area-inset-bottom))}
h2{font-family:var(--f-display);font-weight:600;font-size:22px;margin:0;text-wrap:balance}
h3{font-family:var(--f-display);font-weight:600;font-size:15px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0}
.banners{display:flex;flex-direction:column;gap:8px}
.banners:empty{display:none}
.banner{border-radius:8px;padding:10px 14px;font-size:14px;border:1px solid var(--line);background:var(--surface)}
.banner.warn{background:var(--warn-soft);border-color:var(--warn)} .banner.bad{background:var(--bad-soft);border-color:var(--bad)}
.banner b{font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi{all:unset;box-sizing:border-box;cursor:pointer;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:2px;min-width:0}
.kpi:hover{border-color:var(--accent)} .kpi:focus-visible{outline:2px solid var(--accent)}
.kpi .k{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi .v{font-family:var(--f-mono);font-size:19px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.kpi .v small{font-size:12px;color:var(--muted)}
.kpi .s{font-size:12px;color:var(--muted);line-height:1.35}
.legend{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:13px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:8px}
.legend i{display:inline-block;width:26px;height:0;border-top:4px solid}
.legend i.dash{border-top:2px dashed var(--sig)}
.board{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.viewport{position:relative;overflow:hidden;touch-action:pan-y}
.viewport.zoomed{touch-action:none}
.viewport.zoomed svg.schema{cursor:grab}
svg.schema{display:block;width:100%;height:auto;aspect-ratio:1200/1012;font-family:var(--f-body);user-select:none;-webkit-user-select:none}
.zoombar{display:flex;gap:6px;justify-content:flex-end;padding:6px 8px;border-top:1px solid var(--line)}
@media (max-width:600px){.zb{width:34px;height:34px;border-radius:8px}.zb svg{width:18px;height:18px}}
.zb{width:40px;height:40px;border-radius:10px;background:var(--surface);border:1px solid var(--line);display:grid;place-items:center;
  box-shadow:0 1px 4px #0003;color:var(--ink)}
.zb:hover,.zb:focus-visible{border-color:var(--accent);color:var(--accent);outline:none}
.zb svg{width:20px;height:20px}
.board.full{position:fixed;inset:0;z-index:20;border:0;border-radius:0;display:flex;flex-direction:column}
.board.full .viewport{flex:1;min-height:0;touch-action:none}
.board.full svg.schema{height:100%;aspect-ratio:auto}
.board.full .board-foot{display:none}
.board.full .zoombar{position:absolute;flex-direction:column;padding:0;border:0;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom))}
.board-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;padding:12px 16px;border-top:1px solid var(--line)}
/* SVG */
.zone{fill:var(--zone);stroke:none}
.zlabel{font-family:var(--f-display);font-weight:600;font-size:15px;letter-spacing:.08em;fill:var(--muted)}
.pipe{fill:none;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;transition:opacity .4s}
.pipe.thin{stroke-width:3}
.hot{stroke:var(--hot)} .ret{stroke:var(--ret)} .refr{stroke:var(--refr)} .dhw{stroke:var(--dhw)} .cold{stroke:var(--cold)}
.sig{fill:none;stroke:var(--sig);stroke-width:1.6;stroke-dasharray:5 4}
.pwr{fill:none;stroke:var(--elec);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.shape{fill:var(--surface);stroke:var(--ink);stroke-width:1.6;transition:fill .3s,stroke .3s}
.shape.soft{stroke:var(--muted)}
.ghost{fill:none;stroke:var(--off);stroke-width:1.4;stroke-dasharray:4 4}
.band{fill:var(--surface);opacity:.55}
.t{fill:var(--ink);font-size:12px}
.t.s{font-size:10.5px;fill:var(--muted)}
.t.b{font-weight:600}
.t.h{font-family:var(--f-display);font-weight:600;font-size:15px}
.t.room{fill:var(--ink)}
.fl-name{font-family:var(--f-display);letter-spacing:.06em}
.val{font-family:var(--f-mono);font-size:11px;font-weight:500;fill:var(--accent);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
.val.sm{font-size:10px}
.val.off{fill:var(--off)} .val.hotv{fill:var(--hot)} .val.warnv{fill:var(--warn)}
.sensor{fill:var(--accent);stroke:var(--surface);stroke-width:2}
.fill-ink{fill:var(--ink)} .fill-muted{fill:var(--muted)}
.wifi{stroke:var(--ink)}
.coilheat{stroke:var(--off)}
.tplate{fill:var(--plate);stroke:var(--plate-edge);stroke-width:1.2}
.tplate.heat{stroke:var(--hot);stroke-width:2}
.tlcd{fill:var(--lcd);stroke:var(--lcd-edge);stroke-width:.6}
.tknob{fill:var(--plate);stroke:var(--plate-edge);stroke-width:1.1}
.t.room{font-size:10px}
.tsp{fill:#1e2a20;font-family:var(--f-body);font-size:8.2px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;pointer-events:none}
.regel.heat{stroke:var(--hot);stroke-width:2.2}
#tankfill{fill:var(--dhw);opacity:.08;transition:opacity .6s}
/* stroom-overlay: bolletjes die in de tekenrichting van het pad lopen */
.fl{fill:none;stroke:var(--dot);stroke-width:2.2;stroke-linecap:round;stroke-dasharray:0.1 14;display:none;
  animation:flow var(--sp,1.2s) linear infinite;pointer-events:none}
.fl.thin{stroke-width:1.6;stroke-dasharray:0.1 11}
@keyframes flow{to{stroke-dashoffset:-14.1}}
.fl.thin{animation-name:flowt} @keyframes flowt{to{stroke-dashoffset:-11.1}}
svg.run-refr .f-refr{display:inline;--sp:var(--sp-refr)}
svg.run-prim .f-prim, svg.run-heat .f-heat, svg.run-dhw .f-dhw, svg.run-tap .f-tap{display:inline}
svg.run-eout .f-eout{display:inline;--sp:var(--sp-eout)} svg.run-ein .f-ein{display:inline;--sp:var(--sp-ein)}
svg.mode-heat .b-dhw, svg.mode-dhw .b-heat{opacity:.3}
svg.run-vraag .s-vraag{stroke:var(--hot);animation:sig 1s linear infinite} @keyframes sig{to{stroke-dashoffset:-18}}
.fan{transform-box:fill-box;transform-origin:center}
svg.run-fan .fan{animation:spin var(--sp-fan,1.4s) linear infinite} @keyframes spin{to{transform:rotate(360deg)}}
svg.run-refr .compbody{stroke:var(--refr);stroke-width:2.6}
.cgrid{stroke:var(--line);stroke-width:1}
.cgrid2{stroke:var(--line);stroke-width:.6;opacity:.55}
.ctick{stroke:var(--muted);stroke-width:.9}
.ccross{stroke:var(--accent);stroke-width:1.2;stroke-dasharray:4 3;pointer-events:none}
.cxdot{fill:var(--surface);stroke:var(--accent);stroke-width:2.2;pointer-events:none}
.cxbox{fill:var(--accent);pointer-events:none}
.cxtxt{fill:var(--surface);font-family:var(--f-mono);font-size:10px;font-weight:500;pointer-events:none}
.caxis{stroke:var(--muted);stroke-width:1.3}
.curve{fill:none;stroke:var(--hot);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
.cpt{fill:var(--surface);stroke:var(--hot);stroke-width:1.6}
.cnow{stroke:var(--accent);stroke-width:1.4;stroke-dasharray:3 3}
.cdot{fill:var(--accent);stroke:var(--surface);stroke-width:2}
.cflow{fill:var(--hot);stroke:var(--surface);stroke-width:2}
#curvegrp.inactive .curve{stroke:var(--off)} #curvegrp.inactive .cpt{stroke:var(--off)}
.sine{fill:none;stroke:var(--off);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
svg.run-refr .sine{stroke:var(--refr)}
svg.run-pump1 .pumpbody{stroke:var(--accent);stroke-width:2.6}
svg.run-bh1 .coilheat{stroke:var(--hot);stroke-width:2.2;animation:glow 1.2s ease-in-out infinite alternate}
@keyframes glow{from{opacity:.45}to{opacity:1}}
.vport.on{fill:var(--hot);stroke:var(--hot)}
svg.imm-on #imm-shape{stroke:var(--hot);stroke-dasharray:none}
.comp{cursor:pointer;transition:opacity .2s}
.comp:focus{outline:none}
.comp .hit{fill:transparent;stroke:none}
svg.focus .comp:not(.on){opacity:.35}
svg.focus .pipe,svg.focus .sig{opacity:.55}
.comp.on .shape,.comp.on .ghost{stroke:var(--accent);stroke-width:2.6}
.comp.on{filter:drop-shadow(0 0 5px var(--accent))}
.comp:focus-visible .hit{stroke:var(--accent);stroke-width:2;stroke-dasharray:3 3}
/* onder het schema */
.grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:28px;align-items:start}
@media (max-width:860px){.grid{grid-template-columns:1fr}}
.groups{display:flex;flex-direction:column;gap:22px;min-width:0}
.group{display:flex;flex-direction:column;gap:8px}
.group p.gnote{margin:0;font-size:13px;color:var(--muted)}
ul.ents{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
ul.ents li{border-bottom:1px solid var(--line)}
ul.ents button{all:unset;box-sizing:border-box;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 14px;padding:9px 10px;cursor:pointer;border-radius:6px}
ul.ents button:hover{background:var(--zone)}
ul.ents button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
ul.ents button.on{background:var(--accent-soft)}
.ename{font-weight:500}
.eid{grid-column:1/2;font-family:var(--f-mono);font-size:11.5px;color:var(--muted);overflow-wrap:anywhere}
.evalue{grid-row:1/3;grid-column:2;align-self:center;font-family:var(--f-mono);font-size:14px;font-variant-numeric:tabular-nums;text-align:right}
.unit{color:var(--muted);font-size:12px}
.pill{display:inline-block;font-family:var(--f-mono);font-size:12px;padding:1px 9px;border-radius:99px;border:1px solid var(--off);color:var(--off)}
.pill.on{border-color:var(--accent);color:var(--accent)}
.pill.unused{border-style:dashed}
.pill.missing{border-color:var(--warn);color:var(--warn);border-style:dashed}
aside.detail{position:sticky;top:64px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;min-width:0}
@media (max-width:860px){aside.detail{position:static}}
.detail .kicker{font-family:var(--f-mono);font-size:12px;color:var(--accent);overflow-wrap:anywhere}
.detail p{margin:0;max-width:62ch}
.detail .now{background:var(--zone);border-radius:8px;padding:10px 12px;font-size:14px}
.detail .now b{font-family:var(--f-mono);font-weight:500}
.detail .links{display:flex;flex-wrap:wrap;gap:6px}
.detail .links button{font-family:var(--f-mono);font-size:11.5px;padding:3px 8px;border-radius:5px;border:1px solid var(--line)}
.detail .links button:hover,.detail .links button:focus-visible{border-color:var(--accent);color:var(--accent)}
.detail .hist{align-self:flex-start;font-size:13px;padding:5px 12px;border-radius:6px;border:1px solid var(--accent);color:var(--accent)}
.muted{color:var(--muted);font-size:14px}
section.flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
section.flow > div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
section.flow .n{font-family:var(--f-display);font-weight:700;font-size:22px;color:var(--accent);line-height:1}
section.flow p{margin:0;font-size:14px;color:var(--muted)}
section.flow b{color:var(--ink);font-weight:600}
.now-box{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:10px}
.now-box ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;max-width:90ch}
.note{font-size:13px;color:var(--muted);max-width:90ch;margin:0}
@media (prefers-reduced-motion:reduce){.fl,.fan,.coilheat,.s-vraag{animation:none!important}.comp,.pipe{transition:none}}
`;

const TEMPLATE = (floors, curve) => `
<div id="root">
  <div class="bar">
    <span id="menu"></span><h1 id="title">Ecodan</h1><span class="chip rust" id="mode">–</span>
    <span class="sp"></span><span class="upd" id="upd"></span>
    <button class="iconbtn" id="theme" aria-label="Licht of donker thema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path class="moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><g class="sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></svg></button>
  </div>
  <main class="wrap">
    <div class="banners" id="banners"></div>
    <section class="kpis" id="kpis" aria-label="Kerncijfers"></section>
    <div class="board" id="board">
      <div class="viewport" id="vp">${schemaSvg(floors, curve)}
      </div>
      <div class="zoombar">
        <button class="zb" id="z-in" aria-label="Inzoomen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
        <button class="zb" id="z-out" aria-label="Uitzoomen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
        <button class="zb" id="z-fit" aria-label="Hele schema tonen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/></svg></button>
        <button class="zb" id="z-full" aria-label="Volledig scherm"></button>
      </div>
      <div class="board-foot">
        <div class="legend" aria-label="Legenda">
          <span><i style="border-color:var(--hot)"></i>aanvoer (warm water erheen)</span>
          <span><i style="border-color:var(--ret)"></i>retour (afgekoeld terug)</span>
          <span><i style="border-color:var(--refr)"></i>koudemiddel R32</span>
          <span><i style="border-color:var(--dhw)"></i>tapwater / spiraal</span>
          <span><i style="border-color:var(--cold)"></i>koud leidingwater</span>
          <span><i style="border-color:var(--elec)"></i>stroom 230 V</span>
          <span><i class="dash"></i>stuursignaal</span>
        </div>
        <span class="legend">Lopende bolletjes = er stroomt nu iets · knijp, dubbeltik of gebruik + om in te zoomen, sleep om te schuiven</span>
      </div>
    </div>
    <div class="grid">
      <div class="groups" id="groups"></div>
      <aside class="detail" id="detail" aria-live="polite"></aside>
    </div>
    <div class="now-box">
      <h2>Wat gebeurt er nu?</h2>
      <ul id="nowlist"></ul>
      <p class="note">MELCloud stuurt de waarden met een paar minuten vertraging door; de kWh-meters in de meterkast zijn vrijwel direct. Daardoor kan het schema even een draaiende compressor tonen terwijl de meter al stand-by meet, of andersom.</p>
    </div>
    <section class="flow" aria-label="Zo loopt de warmte">
      <div><span class="n">1</span><p><b>Buitenunit</b> haalt warmte uit de buitenlucht. De compressor pompt die warmte op naar een hogere temperatuur in het koudemiddel.</p></div>
      <div><span class="n">2</span><p><b>Platenwisselaar</b> in de cilinderunit: het hete koudemiddel condenseert en geeft zijn warmte af aan het water. Water en koudemiddel raken elkaar nooit.</p></div>
      <div><span class="n">3</span><p><b>Pomp 1</b> stuurt het warme water via de booster heater langs THW1 naar de <b>3-wegklep</b>.</p></div>
      <div><span class="n">4</span><p>De klep kiest: óf door de <b>spiraal in het vat</b> (tapwater), óf naar de <b>verdelers</b> van de vloerverwarming. Nooit beide tegelijk; tapwater gaat voor.</p></div>
      <div><span class="n">5</span><p>Het afgekoelde water komt terug langs <b>THW2</b> en het filter, en gaat opnieuw de platenwisselaar in.</p></div>
    </section>
    <p class="note">Ecodan Dashboard ${ECODASH_VERSION}</p>
  </main>
</div>`;

/* ------------------------- panel ----------------------------------- */
function mountDashboard(host, root) {
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const cfg = Object.assign({ prefix: "technische_ruimte_ecodan", klep_aan_is_tapwater: true, thema: "auto", overrides: {}, stooklijn: DEFAULT_CURVE },
                            host._panel?.config || {});
  const CURVE = curvePoints(cfg.stooklijn);
  let R = resolveEntities(host._hass, cfg);
  root.innerHTML = `<style>${STYLE}</style>${TEMPLATE(R.floors, CURVE)}`;
  if (host._panel?.title) $("#title").textContent = host._panel.title;
  host._menu = document.createElement("ha-menu-button");
  host._menu.hass = host._hass; host._menu.narrow = host._narrow;
  $("#menu").appendChild(host._menu);

  const svg = $("#schema"), detail = $("#detail");
  const st = { sel: null, selKey: null, sig: "", measured: { out: null, in: null, src: null }, midnight: null, timers: [], tankHist: [] };
  const S = id => (id ? host._hass.states[id] : undefined);
  const ok = s => s && s.state !== "unavailable" && s.state !== "unknown";
  const num = id => { const s = S(id); if (!ok(s)) return null; const v = parseFloat(s.state); return isFinite(v) ? v : null; };
  const bin = id => { const s = S(id); return ok(s) ? s.state === "on" : null; };
  const watt = id => { const v = num(id); if (v == null) return null; const u = S(id).attributes.unit_of_measurement; return u === "kW" ? v * 1000 : v; };
  const kwh = id => { const v = num(id); if (v == null) return null; const u = S(id).attributes.unit_of_measurement; return u === "Wh" ? v / 1000 : u === "MWh" ? v * 1000 : v; };

  // gemeten tegen ingesteld: een indicatie, de thermostaat zelf is niet uit te lezen
  const vsSet = (t, sp) => { const d = t - sp;
    return d < -0.3 ? `${fmt(-d, 1)} °C onder de ingestelde waarde: deze kamer vraagt waarschijnlijk warmte.`
      : d > 0.5 ? `${fmt(d, 1)} °C boven de ingestelde waarde: de kranen van deze kamer staan waarschijnlijk dicht.`
      : "Rond de ingestelde waarde."; };

  /* entiteitenlijst */
  const byKey = {};
  const rooms = R.floors.flatMap((f, fi) => f.kamers.map((r, j) => ({ k: `room_${fi}_${j}`, n: r.naam, c: "tstat",
    x: "Temperatuur van de slimme meter naast de kamerthermostaat (Möhlenhoff). De thermostaat zelf is niet slim en niet zichtbaar in Home Assistant; de ingestelde temperatuur komt uit Configureren en staat in het display-icoon in het schema.",
    now: X => { const v = X.rooms[fi]?.[j]; return v?.t == null ? "" : `${f.naam.charAt(0) + f.naam.slice(1).toLowerCase()}: gemeten ${fmt(v.t, 1)} °C` + (r.sp == null ? "." : `, ingesteld ${fmt(r.sp, 1)} °C. ` + vsSet(v.t, r.sp)); } })));
  const groups = rooms.length ? [...G.slice(0, 5), { title: "Kamertemperaturen", note: "Gemeten door de slimme meters naast de kamerthermostaten; de ingestelde waarde staat in het schema in het display-icoon.", items: rooms }, ...G.slice(5)] : G;
  $("#groups").innerHTML = groups.map(g => `<div class="group"><h3>${g.title}</h3><p class="gnote">${g.note}</p><ul class="ents">` +
    g.items.map(e => { byKey[e.k] = e;
      return `<li><button type="button" data-e="${e.k}"><span class="ename">${e.n}</span><span class="evalue" data-v="${e.k}"></span><span class="eid" data-id="${e.k}"></span></button></li>`; }).join("") +
    `</ul></div>`).join("");

  /* live waarden verzamelen */
  function collect() {
    const X = {};
    for (const k of ["buiten", "freq", "cond", "aanvoer", "retour", "tank", "dhw_prod", "dhw_cons", "dhw_cop", "heat_prod", "heat_cons",
                     "heat_cop", "e_prod", "demand", "wifi", "boiler_flow", "boiler_ret", "mixing"]) X[k] = num(R[k]);
    for (const k of ["pump1", "klep", "bh1", "imm", "boiler", "pump2"]) X[k] = bin(R[k]);
    X.dhw = X.klep == null ? false : (cfg.klep_aan_is_tapwater ? X.klep : !X.klep);
    X.dT = X.aanvoer != null && X.retour != null ? X.aanvoer - X.retour : null;
    const wh = S(R.water_heater);
    X.target = ok(wh) ? parseFloat(wh.attributes.temperature ?? wh.attributes.target_temperature) : null;
    if (!isFinite(X.target)) X.target = null;
    X.whMode = ok(wh) ? (wh.attributes.operation_mode || wh.state) : null;
    if (X.tank == null && ok(wh) && isFinite(parseFloat(wh.attributes.current_temperature))) X.tank = parseFloat(wh.attributes.current_temperature);
    const om = S(R.opmode); X.opmode = ok(om) ? om.state : null;
    X.pOut = watt(R.p_out); X.pIn = watt(R.p_in);
    X.eOutTot = kwh(R.e_out); X.eInTot = kwh(R.e_in);
    X.tapFlow = num(R.tap);
    // afkoeling van het vat in het laatste venster, uit de bijgehouden THW5-historie
    const ts = S(R.tank), th = st.tankHist;
    if (ok(ts)) { const t = Date.parse(ts.last_changed) || Date.now(), v = parseFloat(ts.state);
      if (isFinite(v) && (!th.length || th[th.length - 1].t !== t)) th.push({ t, v }); }
    const from = Date.now() - TAP_WIN;
    while (th.length > 1 && th[1].t <= from) th.shift();               // houd één punt vóór het venster als beginstand
    X.tankDrop = th.length && X.tank != null ? Math.max(...th.map(p => p.v)) - X.tank : 0;
    X.hotDraw = X.tapFlow > 0 && X.tankDrop >= TAP_DROP;
    X.curveTarget = X.buiten == null ? null : curveAt(CURVE, X.buiten);
    X.compRun = X.freq > 0 || X.pOut > P_RUN;
    X.compByMeter = X.compRun && !(X.freq > 0);                       // de meter ziet het al, MELCloud nog niet
    const running = X.compRun || !!X.pump1;
    X.mode = !running ? "rust" : X.dhw ? (X.bh1 ? "legionella" : "tapwater") : "verwarming";
    // kamers
    X.rooms = R.floors.map(f => f.kamers.map(r => {
      const s = S(r.ent); if (!ok(s)) return null;
      const a = s.attributes, t = r.ent.startsWith("climate.") ? parseFloat(a.current_temperature) : parseFloat(s.state);
      return { t: isFinite(t) ? t : null, sp: parseFloat(a.temperature), heat: a.hvac_action === "heating", climate: r.ent.startsWith("climate.") };
    }));
    // warmtevraag: uit een eigen signaal, uit slimme thermostaten (hvac_action), of afgeleid uit de warmtepomp
    const vr = bin(R.vraag), clim = X.rooms.flat().filter(r => r && r.climate);
    X.vraagSrc = vr != null ? "signaal" : clim.length ? "thermostaat" : "afgeleid";
    X.vraag = vr != null ? vr : clim.length ? clim.some(r => r.heat) : X.mode === "verwarming";
    // vandaag gemeten (teller nu − teller om middernacht), anders uit de 5-minutenstatistiek
    const m = st.measured;
    const today = (tot, mid) => tot != null && mid != null && tot >= mid ? tot - mid : null;
    X.mOut = m.src === "teller" ? today(X.eOutTot, m.out) : m.out;
    X.mIn = m.src === "teller" ? today(X.eInTot, m.in) : m.in;
    X.mTot = X.mOut != null || X.mIn != null ? (X.mOut || 0) + (X.mIn || 0) : null;
    X.prodTot = X.heat_prod != null || X.dhw_prod != null ? (X.heat_prod || 0) + (X.dhw_prod || 0) : null;
    X.consTot = X.heat_cons != null || X.dhw_cons != null ? (X.heat_cons || 0) + (X.dhw_cons || 0) : null;
    // MELCloud werkt de dagtotalen met vertraging bij. Is geen ervan sinds middernacht veranderd, dan horen ze bij een
    // eerdere dag en zijn ze niet te vergelijken met wat de kWh-meters vandaag gemeten hebben.
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const daily = ["heat_prod", "heat_cons", "dhw_prod", "dhw_cons"].map(k => S(R[k])).filter(ok);
    X.dailySince = daily.length ? Math.max(...daily.map(s => Date.parse(s.last_changed) || 0)) : null;
    X.dailyFresh = X.dailySince != null && X.dailySince >= mid.getTime();
    const cop = X.dailyFresh && X.prodTot != null && X.mTot > 0.05 ? X.prodTot / X.mTot : null;
    X.copMeas = cop != null && cop <= 8 ? cop : null;   // hoger kan fysiek niet: dan lopen MELCloud en de meters uit de pas
    X.copMel = X.prodTot != null && X.consTot > 0.2 ? X.prodTot / X.consTot : null;
    return X;
  }

  const unitOf = k => { const id = R[k]; const s = S(id); return s?.attributes?.unit_of_measurement || ""; };
  function valueHtml(e, X) {
    if (e.dis) return `<span class="pill unused">uitgeschakeld</span>`;
    const id = R[e.k], s = S(id);
    if (!id) return e.unused ? `<span class="pill unused">uitgeschakeld</span>` : `<span class="pill missing">niet gevonden</span>`;
    if (!ok(s)) return `<span class="pill missing">${s ? s.state : "ontbreekt"}</span>`;
    if (id.startsWith("binary_sensor.")) return `<span class="pill${s.state === "on" ? " on" : ""}${e.unused ? " unused" : ""}">${s.state === "on" ? "aan" : "uit"}</span>`;
    if (id.startsWith("water_heater.")) return `${esc(X.whMode || s.state)} · doel ${fmt(X.target, 0)} <span class="unit">°C</span>`;
    const v = parseFloat(s.state);
    if (!isFinite(v)) return esc(s.state);
    const u = unitOf(e.k), d = /kWh|COP/.test(u) || /cop|prod|cons/.test(e.k) ? 2 : u === "°C" || /\/min/i.test(u) ? 1 : u === "W" ? 0 : (Math.abs(v) < 10 && v % 1 ? 2 : 0);
    return `${fmt(v, d)}${u ? ` <span class="unit">${esc(u)}</span>` : ""}`;
  }

  /* sinusgolf in de compressor: meer golven en sneller bij een hogere frequentie, vlakke lijn als hij stilstaat */
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function drawSine(f) {
    const key = Math.round(f / 2);                  // alleen opnieuw tekenen bij een merkbaar andere frequentie
    if (key === st.sineKey) return;
    st.sineKey = key;
    const el = $("#sine"); st.sineAnim?.cancel(); st.sineAnim = null;
    if (!(f > 0)) { el.setAttribute("d", "M203,272 H263"); return; }
    const cycles = clamp(f / 25, 0.8, 4.5);         // zichtbare golven in de 44 eenheden brede behuizing
    const L = 44 / cycles, A = 13, x0 = 211 - L, x1 = 255 + L;
    let d = "";
    for (let x = x0; x <= x1 + 0.01; x += 1) d += (d ? " L" : "M") + x.toFixed(1) + "," + (272 - A * Math.sin(2 * Math.PI * (x - 211) / L)).toFixed(1);
    el.setAttribute("d", d);
    if (!reduceMotion && el.animate)                 // één golflengte opschuiven en herhalen: naadloos
      st.sineAnim = el.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${L.toFixed(2)}px)` }],
        { duration: 1000 * clamp(1.2 - f / 120, 0.25, 1.2), iterations: Infinity, easing: "linear" });
  }

  /* weergave */
  const setT = (id, txt, cls = "") => { const el = $("#" + id); if (!el) return; el.textContent = txt; el.setAttribute("class", el.getAttribute("class").replace(/\s?(off|hotv|warnv)\b/g, "") + (cls ? " " + cls : "")); };
  const deg = v => (v == null ? "–" : fmt(v, 1) + " °C");

  function render() {
    const X = collect();
    st.X = X;
    // schema: stromen
    const run = {
      "run-refr": X.compRun, "run-fan": X.compRun, "run-pump1": !!X.pump1,
      "run-prim": !!X.pump1, "run-heat": !!X.pump1 && !X.dhw, "run-dhw": !!X.pump1 && X.dhw,
      "mode-heat": !!X.pump1 && !X.dhw, "mode-dhw": !!X.pump1 && X.dhw,
      "run-eout": X.pOut > P_IDLE, "run-ein": X.pIn > P_IDLE, "run-bh1": !!X.bh1, "imm-on": !!X.imm,
      "run-tap": !!X.hotDraw, "run-vraag": !!X.vraag,
    };
    for (const [c, on] of Object.entries(run)) svg.classList.toggle(c, on);
    const fEff = X.freq > 0 ? X.freq : (X.pOut || 0) / 25;          // zonder frequentie: grove schatting uit het vermogen
    svg.style.setProperty("--sp-refr", clamp(2.2 - fEff / 50, 0.45, 2.2).toFixed(2) + "s");
    svg.style.setProperty("--sp-fan", clamp(2.4 - fEff / 40, 0.5, 2.4).toFixed(2) + "s");
    drawSine(X.compRun ? fEff : 0);
    // stooklijn: de buitentemperatuur op de lijn (doel-aanvoer) en de werkelijke aanvoer als die naar de vloeren gaat
    const curveOn = X.opmode == null || /curve/i.test(X.opmode), heatNow = !!X.pump1 && !X.dhw && X.aanvoer != null;
    $("#curvegrp").classList.toggle("inactive", !curveOn);
    const put = (id, a) => { const el = $("#" + id); for (const [k, v] of Object.entries(a)) el.setAttribute(k, typeof v === "number" ? v.toFixed(1) : v); };
    if (X.curveTarget != null) {
      const x = cvx(X.buiten), y = cvy(X.curveTarget);
      put("c-now", { x1: x, x2: x, y1: CV.y0, y2: y }); put("c-dot", { cx: x, cy: y });
      put("c-flow", heatNow ? { cx: x, cy: cvy(X.aanvoer) } : { cx: -50, cy: -50 });
    } else { put("c-now", { x1: -50, x2: -50 }); put("c-dot", { cx: -50, cy: -50 }); put("c-flow", { cx: -50, cy: -50 }); }
    setT("c-txt", X.curveTarget == null ? "" : `buiten ${fmt(X.buiten, 1)} °C → doel aanvoer ${fmt(X.curveTarget, 1)} °C`, curveOn ? "" : "off");
    setT("c-txt2", !curveOn ? `Niet actief: operation mode staat op ${X.opmode}.`
      : heatNow ? `aanvoer nu ${fmt(X.aanvoer, 1)} °C (${X.aanvoer - X.curveTarget >= 0 ? "+" : ""}${fmt(X.aanvoer - X.curveTarget, 1)} t.o.v. de lijn)`
      : "rode stip: werkelijke aanvoer zodra de vloerverwarming draait");
    svg.style.setProperty("--sp-eout", clamp(2.4 - (X.pOut || 0) / 500, 0.4, 2.4).toFixed(2) + "s");
    svg.style.setProperty("--sp-ein", clamp(2.4 - (X.pIn || 0) / 1000, 0.4, 2.4).toFixed(2) + "s");
    $("#port-heat").classList.toggle("on", !!X.pump1 && !X.dhw);
    $("#port-dhw").classList.toggle("on", !!X.pump1 && X.dhw);
    $("#tankfill").style.opacity = X.tank == null ? 0.05 : clamp((X.tank - 15) / 45 * 0.3, 0.05, 0.3).toFixed(2);

    // schema: waarden
    setT("v-buiten", deg(X.buiten));
    setT("v-freq", X.freq > 0 ? fmt(X.freq, 0) + " Hz" : X.compByMeter ? "draait" : X.freq == null ? "–" : "0 Hz", X.compRun ? "" : "off");
    setT("v-cond", deg(X.cond), X.freq > 0 ? "" : "off");
    setT("v-bh1", onoff(X.bh1), X.bh1 ? "hotv" : "off");
    setT("v-pump1", onoff(X.pump1), X.pump1 ? "" : "off");
    setT("v-aanvoer", deg(X.aanvoer), X.pump1 ? "" : "off");
    setT("v-retour", deg(X.retour), X.pump1 ? "" : "off");
    setT("v-dt", X.pump1 && X.dT != null ? "ΔT " + fmt(X.dT, 1) : "");
    setT("v-klep", X.klep == null ? "–" : X.dhw ? "→ vat" : "→ vloer", X.pump1 ? "" : "off");
    setT("v-tank", deg(X.tank));
    const lpm = v => fmt(v, v < 10 ? 1 : 0) + " " + (unitOf("tap") || "l/min");
    setT("v-tap", !X.tapFlow ? "" : lpm(X.tapFlow), X.hotDraw ? "" : "off");
    setT("v-tap2", !X.tapFlow ? "" : X.hotDraw ? "via het vat" : "niet via het vat", X.hotDraw ? "" : "off");
    setT("v-target", X.target == null ? "" : `doel ${fmt(X.target, 0)} °C${X.whMode ? " · " + X.whMode : ""}`);
    setT("v-wifi", X.wifi == null ? "–" : fmt(X.wifi, 0) + " dBm", X.wifi != null && X.wifi < -75 ? "warnv" : "");
    setT("v-boiler", `${onoff(X.boiler)} · ${deg(X.boiler_flow)}`, "off");
    setT("v-mixing", deg(X.mixing), "off");
    setT("v-pump2", onoff(X.pump2), "off");
    setT("v-pout", X.pOut == null ? "–" : fmt(X.pOut, X.pOut < 100 ? 1 : 0) + " W", X.pOut > P_IDLE ? "" : "off");
    setT("v-pin", X.pIn == null ? "–" : fmt(X.pIn, X.pIn < 100 ? 1 : 0) + " W", X.pIn > P_IDLE ? (X.pIn > 1500 ? "hotv" : "") : "off");
    setT("v-eout", X.mOut == null ? "" : fmt(X.mOut, 2) + " kWh");
    setT("v-ein", X.mIn == null ? "" : fmt(X.mIn, 2) + " kWh");
    setT("v-meter1", X.mTot == null ? "Geen verbruik van vandaag beschikbaar (geen energieteller of statistiek gevonden)."
      : `Vandaag gemeten: ${fmt(X.mTot, 2)} kWh${X.consTot != null && X.dailyFresh ? ` · MELCloud schat ${fmt(X.consTot, 2)} kWh` : ""}${st.measured.src === "statistiek" ? " (uit vermogensstatistiek)" : ""}.`);
    setT("v-meter2", X.copMeas != null ? `Warmte vandaag ${fmt(X.prodTot, 2)} kWh ÷ gemeten stroom = COP ${fmt(X.copMeas, 2)} (gemeten).`
      : X.consTot != null && !X.dailyFresh ? `MELCloud-dagwaarden zijn van ${dagTijd(X.dailySince)}: nog geen gemeten COP.` : "");
    R.floors.forEach((f, fi) => {
      const anyHeat = (X.rooms[fi] || []).some(r => r && r.heat);
      $$(`.regel[data-floor="${fi}"]`).forEach(el => el.classList.toggle("heat", anyHeat));
      f.kamers.forEach((r, j) => {
        const v = X.rooms[fi]?.[j], dot = $(`#room-${fi}-${j}-dot`);
        if (dot) dot.classList.toggle("heat", !!v?.heat);
        const tx = $(`#room-${fi}-${j}`);
        if (tx) tx.textContent = v?.t == null ? "–" : fmt(v.t, 1) + " °C" + (isFinite(v.sp) ? ` → ${fmt(v.sp, 1)}` : "");
      });
    });

    // kop
    const ML = { rust: "in rust", verwarming: "ruimteverwarming", tapwater: "tapwater", legionella: "tapwater + booster (legionella?)" };
    const mc = $("#mode"); mc.textContent = ML[X.mode]; mc.className = "chip " + X.mode;
    let last = 0;
    for (const k of MELCLOUD_KEYS) { const s = S(R[k]); if (s) last = Math.max(last, Date.parse(s.last_reported || s.last_updated) || 0); }
    $("#upd").textContent = last ? "MELCloud " + hhmm(last) : "";
    st.last = last;

    // kerncijfers
    const kpi = (c, k, v, u, s) => `<button class="kpi" data-c="${c}"><span class="k">${k}</span><span class="v">${v}${u ? ` <small>${u}</small>` : ""}</span><span class="s">${s || "&nbsp;"}</span></button>`;
    $("#kpis").innerHTML = [
      kpi("th7", "Buiten", fmt(X.buiten, 1), "°C", (X.opmode ? "regeling: " + esc(X.opmode) : "")
          + (X.curveTarget != null && (X.opmode == null || /curve/i.test(X.opmode)) ? ` · doel aanvoer ${fmt(X.curveTarget, 0)} °C` : "")),
      kpi("comp", "Compressor", X.freq > 0 ? fmt(X.freq, 0) : X.compByMeter ? "aan" : X.freq == null ? "–" : "0", X.compByMeter ? "" : "Hz",
          X.freq > 0 ? "draait" : X.compByMeter ? "volgens de kWh-meter; Hz volgt via MELCloud" : "staat stil"),
      kpi("thw1", "Aanvoer / retour", fmt(X.aanvoer, 1), `/ ${fmt(X.retour, 1)} °C`, X.pump1 && X.dT != null ? "ΔT " + fmt(X.dT, 1) + " °C" : "pomp staat stil"),
      kpi("thw5", "Tapwater", fmt(X.tank, 1), "°C", X.target != null ? "doel " + fmt(X.target, 0) + " °C" : ""),
      kpi("meterOut", "Vermogen nu", X.pOut == null && X.pIn == null ? "–" : fmt((X.pOut || 0) + (X.pIn || 0), 0), "W",
          X.pOut != null || X.pIn != null ? `buiten ${fmt(X.pOut, 0)} · binnen ${fmt(X.pIn, 0)}` : ""),
      kpi("ftc", X.dailyFresh || X.dailySince == null ? "Warmte vandaag" : "Warmte (MELCloud-dag)", fmt(X.prodTot, 2), "kWh",
          (X.heat_prod != null ? `vloer ${fmt(X.heat_prod, 2)} · tap ${fmt(X.dhw_prod, 2)}` : "") + (X.dailySince && !X.dailyFresh ? ` · stand ${dagTijd(X.dailySince)}` : "")),
      // COP per functie uit de COP-sensoren in Home Assistant; 0 betekent: te weinig gedraaid om te berekenen
      (R.heat_cop || R.dhw_cop)
        ? kpi("ftc", "COP vloer / tapwater", `${X.heat_cop ? fmt(X.heat_cop, 1) : "–"} / ${X.dhw_cop ? fmt(X.dhw_cop, 1) : "–"}`, "",
            X.copMeas != null ? `totaal met gemeten stroom ${fmt(X.copMeas, 2)}` : X.dailyFresh || X.dailySince == null ? "vandaag" : `dagwaarde ${dagTijd(X.dailySince)}`)
        : kpi("meterOut", X.dailyFresh || X.dailySince == null ? "COP vandaag" : "COP (MELCloud-dag)", fmt(X.copMeas ?? X.copMel, 2), "",
            X.copMeas != null ? "met gemeten stroom" : X.copMel != null ? (X.dailyFresh ? "schatting MELCloud" : "schatting MELCloud, laatste dagwaarde") : "nog te weinig gedraaid"),
    ].join("");

    // entiteitenlijst
    groups.forEach(g => g.items.forEach(e => {
      const v = root.querySelector(`[data-v="${e.k}"]`); if (v) v.innerHTML = valueHtml(e, X);
      const i = root.querySelector(`[data-id="${e.k}"]`); if (i) i.textContent = e.dis || (e.unused && !R[e.k]) ? "entiteit uitgeschakeld in Home Assistant" : (R[e.k] || `niet gevonden · override-sleutel "${e.k}"`);
    }));

    renderBanners(X);
    renderNow(X);
    if (st.sel) showComp(st.sel, st.selKey, true); else if (!detail.innerHTML) intro();
  }

  function renderBanners(X) {
    const b = [];
    const mel = MELCLOUD_KEYS.filter(k => R[k]);
    const down = mel.filter(k => !ok(S(R[k]))).length;
    if (!R.freq && !R.aanvoer && !R.tank)
      b.push(["bad", `<b>Geen Ecodan-entiteiten gevonden</b> met voorvoegsel <code>${esc(cfg.prefix)}</code>. Pas het voorvoegsel aan via Instellingen → Apparaten &amp; diensten → Ecodan Dashboard → Configureren.`]);
    else if (mel.length && down > mel.length / 2)
      b.push(["bad", `<b>MELCloud niet bereikbaar:</b> ${down} van ${mel.length} entiteiten zijn onbeschikbaar. De waarden in het schema zijn niet actueel.`]);
    else if (st.last && Date.now() - st.last > 45 * 60e3 && mel.some(k => S(R[k])?.last_reported))
      b.push(["warn", `<b>Geen nieuwe waarden</b> van MELCloud sinds ${hhmm(st.last)}. Controleer de wifi-adapter of de MELCloud-integratie.`]);
    if (X.opmode != null && !/curve/i.test(X.opmode))
      b.push(["warn", `<b>Operation mode staat op ${esc(X.opmode)}</b> in plaats van Curve (stooklijn). Daardoor regelt de warmtepomp op ${/room/i.test(X.opmode) ? "de kamertemperatuur van het display in de technische ruimte" : "een vaste aanvoertemperatuur"}.`]);
    if (X.bh1 && !X.dhw)
      b.push(["warn", `<b>Booster heater aan tijdens ruimteverwarming.</b> De warmtepomp redt het alleen niet (vorst of ontdooien). Elke kWh stroom levert hier maar 1 kWh warmte.`]);
    else if (X.bh1)
      b.push(["", `<b>Legionella-run (waarschijnlijk):</b> de booster heater helpt het vat naar ±60 °C te brengen.`]);
    if (X.imm) b.push(["warn", `<b>Immersion heater meldt aan.</b> Bij de EHST20D-VM2D zit normaal geen dompelaar.`]);
    $("#banners").innerHTML = b.map(([c, t]) => `<div class="banner ${c}">${t}</div>`).join("");
  }

  function renderNow(X) {
    const li = [];
    const hz = X.freq > 0 ? fmt(X.freq, 0) + " Hz" : X.compByMeter ? "aan (volgens de kWh-meter)" : X.freq == null ? "–" : "0 Hz";
    if (X.compByMeter) li.push(`<b>De compressor draait</b> volgens de kWh-meter van de buitenunit (${fmt(X.pOut, 0)} W). MELCloud meldt nog 0 Hz; de frequentie en de andere waarden volgen over een paar minuten.`);
    if (X.mode === "rust") li.push(`<b>De installatie staat in rust.</b> Compressor ${hz}, pomp 1 uit${X.bh1 ? "" : ", geen elektrische bijverwarming"}.`);
    else if (X.mode === "verwarming") li.push(`<b>Ruimteverwarming.</b> Compressor ${hz}, aanvoer ${deg(X.aanvoer)}, retour ${deg(X.retour)}${X.dT != null ? `, ΔT ${fmt(X.dT, 1)} °C` : ""}. Het water gaat naar de verdelers.`);
    else li.push(`<b>Tapwater wordt opgewarmd.</b> Vat ${deg(X.tank)}${X.target != null ? `, doel ${fmt(X.target, 0)} °C` : ""}; aanvoer ${deg(X.aanvoer)}. De vloeren krijgen nu geen warmte: tapwater gaat voor.${X.bh1 ? " De booster heater helpt mee." : ""}`);
    if (X.curveTarget != null && (X.opmode == null || /curve/i.test(X.opmode)))
      li.push(`<b>Stooklijn:</b> bij ${deg(X.buiten)} buiten hoort een aanvoer van ${deg(X.curveTarget)}${X.mode === "verwarming" && X.aanvoer != null ? `; nu ${deg(X.aanvoer)}` : ""}.`);
    if (X.freq > 0 && !X.pump1) li.push(`De compressor draait maar pomp 1 staat (nog) uit: meestal een opstart- of ontdooimoment, of MELCloud loopt achter.`);
    if (X.pump1 && !X.freq) li.push(`Pomp 1 draait zonder compressor: nadraaien na een run, of ontdooien.`);
    if (X.vraagSrc !== "afgeleid")
      li.push(X.vraag ? `<b>Er is warmtevraag</b> vanuit ${X.vraagSrc === "signaal" ? "het warmtevraagsignaal" : "minstens één thermostaat"}.` : `Geen van de thermostaten vraagt nu warmte.`);
    const kamers = R.floors.flatMap((f, fi) => f.kamers.map((r, j) => [r.naam, X.rooms[fi]?.[j]?.t, r.sp])).filter(([, t]) => t != null);
    if (kamers.length) li.push(`<b>Kamers (gemeten / ingesteld):</b> ${kamers.map(([n, t, sp]) => `${esc(n)} ${fmt(t, 1)}${sp == null ? "" : " / " + fmt(sp, 1)} °C`).join(" · ")}.`);
    if (X.hotDraw) li.push(`<b>Er wordt warm water getapt.</b> De watermeter meet ${fmt(X.tapFlow, 1)} ${esc(unitOf("tap"))} en het vat is ${fmt(X.tankDrop, 1)} °C afgekoeld: er stroomt koud leidingwater het vat in.`);
    else if (X.tapFlow > 0) li.push(`De watermeter meet ${fmt(X.tapFlow, 1)} ${esc(unitOf("tap"))}, maar het vat koelt niet af: waarschijnlijk toilet of een koude kraan, dus niet via de Ecodan.`);
    if (X.tank != null && X.target != null && X.mode !== "tapwater" && X.mode !== "legionella") {
      const d = X.target - X.tank;
      li.push(d <= 0 ? `<b>Het vat is op temperatuur</b> (${deg(X.tank)}).` : `<b>Vat ${deg(X.tank)}</b>, ${fmt(d, 1)} °C onder het doel. ${d <= 8 ? "Binnen de marge (hysterese), dus de warmtepomp start nog niet." : "Tapwater-opwarming volgt binnenkort."}`);
    }
    const dag = X.dailyFresh || X.dailySince == null ? "vandaag" : `(MELCloud-dagwaarde van ${dagTijd(X.dailySince)})`;
    if (X.dhw_prod != null) li.push(`<b>Tapwater ${dag}:</b> ${fmt(X.dhw_cons, 2)} kWh stroom in, ${fmt(X.dhw_prod, 2)} kWh warmte uit${X.dhw_cop ? `: COP ${fmt(X.dhw_cop, 2)}` : R.dhw_cop ? "" : X.dhw_cons > 0.2 ? `: COP ${fmt(X.dhw_prod / X.dhw_cons, 2)}` : ""}.`);
    if (X.heat_prod != null) li.push(`<b>Vloerverwarming ${dag}:</b> ${fmt(X.heat_cons, 2)} kWh stroom in, ${fmt(X.heat_prod, 2)} kWh warmte uit${X.heat_cop ? `: COP ${fmt(X.heat_cop, 2)}` : !R.heat_cop && X.heat_cons > 0.2 ? `: COP ${fmt(X.heat_prod / X.heat_cons, 2)}` : ": te weinig om een COP te berekenen"}.`);
    if (X.mTot != null) li.push(`<b>Gemeten in de meterkast vandaag:</b> ${fmt(X.mTot, 2)} kWh${X.consTot != null && X.dailyFresh ? ` tegen ${fmt(X.consTot, 2)} kWh volgens MELCloud` : ""}${X.copMeas != null ? `. Echte COP vandaag: <b>${fmt(X.copMeas, 2)}</b>` : ""}.`);
    if (X.pOut != null || X.pIn != null)
      li.push(`<b>Stroom nu: ${fmt(X.pOut, 0)} W buiten, ${fmt(X.pIn, 0)} W binnen.</b> ${X.pOut < P_IDLE && X.pIn < P_IDLE ? "Alleen stand-by." : X.pIn > 1500 ? "De booster heater staat aan." : ""}`);
    $("#nowlist").innerHTML = li.map(t => `<li>${t}</li>`).join("");
  }

  /* detailkaart */
  function intro() {
    detail.innerHTML = `<h2>Hoe lees je dit?</h2>
    <p>Links de tuin, in het midden de cilinderunit in de technische ruimte, rechts de verdiepingen. Rood is warm water dat ergens heen gaat, blauw is afgekoeld water dat terugkomt.</p>
    <p>Lopende bolletjes laten zien waar nu iets stroomt: koudemiddel als de compressor draait, water als pomp 1 draait (naar de vloeren óf door het vat, afhankelijk van de 3-wegklep) en stroom zodra een groep meer dan stand-by verbruikt.</p>
    <p>De groene getallen zijn live waarden uit Home Assistant. Klik op een onderdeel of een entiteit voor uitleg.</p>`;
  }
  function highlight(c) {
    svg.classList.toggle("focus", !!c);
    $$(".comp").forEach(g => g.classList.toggle("on", !!c && (g.dataset.c === c || (g.dataset.also || "").split(" ").includes(c))));
  }
  function showComp(c, key, refresh) {
    const d = C[c]; if (!d) return;
    st.sel = c; st.selKey = key || null;
    if (!refresh) highlight(c);
    $$("ul.ents button").forEach(b => b.classList.toggle("on", byKey[b.dataset.e].c === c && (!key || b.dataset.e === key)));
    const e = key ? byKey[key] : null, X = st.X || {};
    const list = Object.values(byKey).filter(x => x.c === c);
    let h = `<div class="kicker">${e ? (e.dis || (e.unused && !R[e.k]) ? "uitgeschakeld in Home Assistant" : esc(R[e.k] || "niet gevonden")) : esc(d.where)}</div><h2>${e ? e.n : d.name}</h2>`;
    if (e) {
      h += `<p class="muted">Onderdeel: <b style="color:var(--ink)">${d.name}</b> · ${d.where}</p>`;
      h += `<p>${e.x || d.text}</p>`;
      if (e.x) h += `<p class="muted">${d.text}</p>`;
      const nowTxt = e.now ? e.now({ ...X, v: X[e.k] }) : "";
      h += `<div class="now">Nu: <b>${valueHtml(e, X)}</b>${nowTxt ? "<br>" + nowTxt : ""}</div>`;
      if (!e.dis && !e.unused && !R[e.k]) h += `<p class="muted">Niet gevonden. Koppel hem met de hand via Configureren → overrides, bijv. <code>{"${e.k}": "${ENT[e.k]?.d || "sensor"}.…"}</code>.</p>`;
      if (R[e.k] && S(R[e.k])) h += `<button class="hist" data-more="${esc(R[e.k])}">Geschiedenis en details</button>`;
    } else h += `<p>${d.text}</p>`;
    const others = list.filter(x => !e || x.k !== e.k);
    if (others.length) h += `<h3>${e ? "Ook bij dit onderdeel" : "Entiteiten in Home Assistant"}</h3><div class="links">` + others.map(x => `<button type="button" data-e="${x.k}">${x.n}</button>`).join("") + `</div>`;
    else if (!e) h += `<p class="muted">Geen eigen entiteit in Home Assistant.</p>`;
    detail.innerHTML = h;
  }
  const showEnt = k => { const e = byKey[k]; if (e) showComp(e.c, k); };
  const clearSel = () => { st.sel = null; st.selKey = null; highlight(null); intro(); $$("ul.ents button.on").forEach(b => b.classList.remove("on")); };

  root.addEventListener("click", ev => {
    const more = ev.target.closest("[data-more]");
    if (more) { host.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: more.dataset.more }, bubbles: true, composed: true })); return; }
    const b = ev.target.closest("button[data-e]"); if (b) { showEnt(b.dataset.e); return; }
    const k = ev.target.closest(".kpi"); if (k) { showComp(k.dataset.c); detail.scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
    if (ev.target.closest("svg.schema")) { if (st.moved > 8) return; const g = ev.target.closest(".comp"); if (g) showComp(g.dataset.c); else clearSel(); }
  });
  svg.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const g = ev.target.closest(".comp"); if (g) { ev.preventDefault(); showComp(g.dataset.c); }
  });
  $$("ul.ents button").forEach(b => {
    b.addEventListener("mouseenter", () => highlight(byKey[b.dataset.e].c));
    b.addEventListener("mouseleave", () => highlight(st.sel));
  });

  /* zoomen en schuiven: de viewBox volgt schaal s (css-px per tekeneenheid) en middelpunt (cx, cy) */
  const VB = { w: 1200, h: 1012 }, vp = $("#vp"), board = $("#board");
  const zm = { s: 0, cx: VB.w / 2, cy: VB.h / 2, fit: true };
  const box = () => { const r = svg.getBoundingClientRect(); return { l: r.left, t: r.top, W: r.width || 1, H: r.height || 1 }; };
  const fitS = () => { const b = box(); return Math.min(b.W / VB.w, b.H / VB.h); };
  function applyZoom() {
    const { W, H } = box(), s0 = fitS();
    if (zm.fit || !zm.s) { zm.s = s0; zm.cx = VB.w / 2; zm.cy = VB.h / 2; }
    zm.s = clamp(zm.s, s0, Math.max(s0 * 8, 3));
    const vw = W / zm.s, vh = H / zm.s;
    zm.cx = vw >= VB.w ? VB.w / 2 : clamp(zm.cx, vw / 2, VB.w - vw / 2);
    zm.cy = vh >= VB.h ? VB.h / 2 : clamp(zm.cy, vh / 2, VB.h - vh / 2);
    svg.setAttribute("viewBox", `${(zm.cx - vw / 2).toFixed(1)} ${(zm.cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    zm.fit = zm.s <= s0 * 1.001;
    vp.classList.toggle("zoomed", !zm.fit);
  }
  // zoom met factor f rond schermpunt (px, py): dat punt blijft op zijn plek
  function zoomAt(f, px, py) {
    const { l, t, W, H } = box(), dx = px - l - W / 2, dy = py - t - H / 2;
    const ux = zm.cx + dx / zm.s, uy = zm.cy + dy / zm.s;
    zm.fit = false; zm.s *= f; zm.cx = ux - dx / zm.s; zm.cy = uy - dy / zm.s;
    applyZoom();
  }
  const zoomMid = f => { const { l, t, W, H } = box(); zoomAt(f, l + W / 2, t + H / 2); };
  const ptrs = new Map();
  const centroid = () => { const v = [...ptrs.values()], n = v.length;
    return [v.reduce((a, p) => a + p.x, 0) / n, v.reduce((a, p) => a + p.y, 0) / n, n > 1 ? Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) : 0]; };
  svg.addEventListener("pointerdown", e => {
    if (!ptrs.size) st.moved = 0;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  svg.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const [x0, y0, d0] = centroid(); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [x1, y1, d1] = centroid();
    if (ptrs.size === 1 && zm.fit) return;          // niet ingezoomd: één vinger scrolt gewoon de pagina
    st.moved += Math.abs(x1 - x0) + Math.abs(y1 - y0) + Math.abs(d1 - d0);
    if (st.moved > 8 && !svg.hasPointerCapture(e.pointerId)) { try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
    zm.cx -= (x1 - x0) / zm.s; zm.cy -= (y1 - y0) / zm.s;
    if (ptrs.size > 1 && d0 > 0) zoomAt(d1 / d0, x1, y1); else applyZoom();
  });
  const up = e => ptrs.delete(e.pointerId);
  const cross = $("#c-cross"), toSvg = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  function showCross(e) {
    const p = toSvg(e);
    if (p.x < CV.x0 - 2 || p.x > CV.x1 + 2 || p.y < 852 || p.y > CV.y0 + 20) { if (e.type !== "pointermove" || e.pointerType === "mouse") cross.setAttribute("visibility", "hidden"); return; }
    const t = Math.round(CV.t0 + clamp((p.x - CV.x0) / (CV.x1 - CV.x0), 0, 1) * (CV.t1 - CV.t0));   // hele graden, zoals het display
    const v = curveAt(CURVE, t), x = cvx(t), y = cvy(v);
    const set = (id, a) => { const el = $("#" + id); for (const [k, val] of Object.entries(a)) el.setAttribute(k, typeof val === "number" ? val.toFixed(1) : val); };
    set("cx-v", { x1: x, x2: x, y1: CV.y0, y2: y }); set("cx-h", { x1: CV.x0, x2: x, y1: y, y2: y }); set("cx-dot", { cx: x, cy: y });
    set("cx-xb", { x: x - 17, y: CV.y0 + 4 }); set("cx-xt", { x, y: CV.y0 + 15 }); $("#cx-xt").textContent = fmt(t, 0) + "°";
    set("cx-yb", { x: CV.x0 - 46, y: y - 7.5 }); set("cx-yt", { x: CV.x0 - 25, y: y + 3.5 }); $("#cx-yt").textContent = fmt(v, 1) + "°";
    cross.setAttribute("visibility", "visible");
  }
  svg.addEventListener("pointermove", showCross); svg.addEventListener("pointerdown", showCross);
  svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") cross.setAttribute("visibility", "hidden"); });
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("wheel", e => {
    if (e.ctrlKey) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); }
    else if (!zm.fit) { e.preventDefault(); zm.cx += e.deltaX / zm.s; zm.cy += e.deltaY / zm.s; applyZoom(); }
  }, { passive: false });
  svg.addEventListener("dblclick", e => { e.preventDefault(); if (zm.s > fitS() * 3.5) { zm.fit = true; applyZoom(); } else zoomAt(2, e.clientX, e.clientY); });
  $("#z-in").onclick = () => zoomMid(1.5);
  $("#z-out").onclick = () => zoomMid(1 / 1.5);
  $("#z-fit").onclick = () => { zm.fit = true; applyZoom(); };
  const ICON_FULL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
  const ICON_EXIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>`;
  // volledig scherm: het schema vult het hele scherm en begint zo groot dat het de hoogte of breedte vult
  function setFull(on) {
    board.classList.toggle("full", on);
    const b = $("#z-full"); b.innerHTML = on ? ICON_EXIT : ICON_FULL; b.setAttribute("aria-label", on ? "Volledig scherm sluiten" : "Volledig scherm");
    requestAnimationFrame(() => {
      const { W, H } = box();
      zm.fit = !on; zm.s = on ? Math.max(W / VB.w, H / VB.h) : 0; zm.cx = VB.w / 2; zm.cy = VB.h / 2; applyZoom();
    });
    if (on && board.requestFullscreen) board.requestFullscreen().then(() => { st.realFs = true; }, () => {});
    if (!on && st.realFs) { st.realFs = false; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }
  $("#z-full").innerHTML = ICON_FULL;
  $("#z-full").onclick = () => setFull(!board.classList.contains("full"));
  const onFs = () => { if (!document.fullscreenElement && st.realFs) { st.realFs = false; setFull(false); } };
  const onKey = e => { if (e.key === "Escape" && board.classList.contains("full")) setFull(false); };
  document.addEventListener("fullscreenchange", onFs); document.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => applyZoom()); ro.observe(vp);
  requestAnimationFrame(applyZoom);

  /* thema: de knop onthoudt de keuze per apparaat; anders geldt de optie uit Configureren */
  const storedTheme = () => { try { return localStorage.getItem("ecodash-theme"); } catch (e) { return null; } };
  const applyTheme = () => { const t = storedTheme() || cfg.thema;
    host.classList.toggle("dark", t === "dark" || (t === "auto" && !!host._hass?.themes?.darkMode)); };
  $("#theme").onclick = () => { try { localStorage.setItem("ecodash-theme", host.classList.contains("dark") ? "light" : "dark"); } catch (e) {} applyTheme(); };
  applyTheme();

  /* verbruik van vandaag: tellerstand om middernacht uit de historie, of anders vermogensstatistiek integreren */
  async function loadMeasured() {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const hass = host._hass, m = { out: null, in: null, src: null };
    try {
      const ids = [R.e_out, R.e_in].filter(Boolean);
      if (ids.length) {
        const res = await hass.callWS({ type: "history/history_during_period", start_time: mid.toISOString(),
          end_time: new Date(mid.getTime() + 60e3).toISOString(), entity_ids: ids, include_start_time_state: true,
          minimal_response: true, no_attributes: true, significant_changes_only: false });
        const first = id => { const h = res?.[id]; const v = h && h.length ? parseFloat(h[0].s ?? h[0].state) : NaN;
          if (!isFinite(v)) return null; const u = S(id)?.attributes?.unit_of_measurement; return u === "Wh" ? v / 1000 : v; };
        m.out = R.e_out ? first(R.e_out) : null; m.in = R.e_in ? first(R.e_in) : null;
        if (m.out != null || m.in != null) m.src = "teller";
      }
      if (!m.src) {
        const pids = [R.p_out, R.p_in].filter(Boolean);
        if (pids.length) {
          const res = await hass.callWS({ type: "recorder/statistics_during_period", start_time: mid.toISOString(),
            statistic_ids: pids, period: "5minute", types: ["mean"], units: { power: "W" } });
          const integ = id => { const rows = res?.[id]; if (!rows || !rows.length) return null;
            return rows.reduce((s, r) => { const a = typeof r.start === "number" ? r.start : Date.parse(r.start);
              const b = typeof r.end === "number" ? r.end : Date.parse(r.end) || a + 300e3;
              return s + (r.mean || 0) * (b - a) / 3600e3; }, 0) / 1000; };
          m.out = R.p_out ? integ(R.p_out) : null; m.in = R.p_in ? integ(R.p_in) : null;
          if (m.out != null || m.in != null) m.src = "statistiek";
        }
      }
    } catch (e) { console.warn("Ecodan-panel: verbruik van vandaag niet beschikbaar", e); }
    st.measured = m; st.midnight = mid.getTime(); st.sig = ""; schedule();
  }

  /* bijwerken: alleen als een relevante entiteit verandert, hooguit één keer per frame */
  let raf = 0;
  const watched = () => [...MELCLOUD_KEYS, "p_out", "p_in", "e_out", "e_in", "tap", "vraag"].map(k => R[k])
    .concat(R.floors.flatMap(f => f.kamers.map(r => r.ent))).filter(Boolean);
  let watchIds = watched(), nStates = Object.keys(host._hass.states).length;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  function update() {
    const S0 = host._hass.states, n = Object.keys(S0).length;
    if (n !== nStates) {           // nieuwe of verwijderde entiteiten: opnieuw zoeken (schema-indeling blijft)
      nStates = n; const floors = R.floors; R = resolveEntities(host._hass, cfg); R.floors = floors; watchIds = watched();
    }
    applyTheme();
    const sig = watchIds.map(id => { const s = S0[id]; return s ? s.state + "|" + (s.attributes.temperature ?? "") + (s.attributes.hvac_action ?? "") + (s.attributes.current_temperature ?? "") : "-"; }).join(",");
    if (sig === st.sig) return;
    st.sig = sig; render();
  }
  host._onHass = schedule;
  /* tanktemperatuur van het laatste venster, zodat afkoeling ook direct na het openen herkend wordt */
  async function loadTankHist() {
    if (!R.tank) return;
    try {
      const start = new Date(Date.now() - TAP_WIN);
      const res = await host._hass.callWS({ type: "history/history_during_period", start_time: start.toISOString(), entity_ids: [R.tank],
        include_start_time_state: true, minimal_response: true, no_attributes: true, significant_changes_only: false });
      const pts = (res?.[R.tank] || []).map(h => ({ t: h.lu != null ? h.lu * 1000 : Date.parse(h.last_changed), v: parseFloat(h.s ?? h.state) }))
        .filter(p => isFinite(p.v) && isFinite(p.t));
      const live = st.tankHist.filter(p => !pts.length || p.t > pts[pts.length - 1].t);
      st.tankHist = pts.concat(live); st.sig = ""; schedule();
    } catch (e) { console.warn("Ecodan-panel: historie tanktemperatuur niet beschikbaar", e); }
  }
  render(); loadMeasured(); loadTankHist();
  st.timers.push(setInterval(() => {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    if (mid.getTime() !== st.midnight || st.measured.src === "statistiek") loadMeasured();   // nieuwe dag, of statistiek bijwerken
    else { st.sig = ""; schedule(); }                                                         // "geen nieuwe waarden"-check
  }, 5 * 60e3));
  return () => { st.timers.forEach(clearInterval); cancelAnimationFrame(raf); host._onHass = null; ro.disconnect();
    document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("keydown", onKey); };
}

class EcodashPanel extends HTMLElement {
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (this._menu) this._menu.hass = h;
    if (first) this._start(); else if (this._onHass) this._onHass();
  }
  get hass() { return this._hass; }
  set narrow(n) { this._narrow = n; if (this._menu) this._menu.narrow = n; }
  set panel(p) { this._panel = p; }
  set route(r) {}

  connectedCallback() { if (this._hass && !this._stop) this._start(); }
  disconnectedCallback() { if (this._stop) { this._stop(); this._stop = null; } }

  _start() {
    if (this._stop || !this.isConnected) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._stop = mountDashboard(this, this.shadowRoot);
  }
}
if (!customElements.get("ecodash-panel")) customElements.define("ecodash-panel", EcodashPanel);
console.info("%c Ecodan-panel %c " + ECODASH_VERSION + " ", "background:#0d7a64;color:#fff", "background:#222;color:#fff");
