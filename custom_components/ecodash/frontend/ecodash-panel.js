/* =====================================================================
 * Ecodan Dashboard: zijbalk-panel voor Home Assistant
 * Installatieschema van de Ecodan-warmtepomp met live waarden van de
 * Asgard (ESPHome op de CN105 van de FTC6) en de kWh-meters in de meterkast. Alle data via de
 * HA-sessie (hass.states en hass.callWS), dus zonder tokens of losse servers.
 * ===================================================================== */
const ECODASH_VERSION = "1.11.0";

/* ------------------------- entiteiten ------------------------------ */
// Per sleutel: domein en achtervoegsel na het voorvoegsel, zoals de Asgard-firmware (esphome-ecodan-hp, Engelse labels) ze noemt.
// Wordt een entiteit niet gevonden onder het voorvoegsel, dan zoekt het panel op achtervoegsel
// binnen alle entiteiten met "ecodan" in de naam. Overrides gaan altijd voor.
const ENT = {
  // buitenunit
  buiten:      { d: "sensor", s: ["outside_temp"] },
  freq:        { d: "sensor", s: ["compressor_frequency"] },
  comp:        { d: "binary_sensor", s: ["compressor"] },
  defrost:     { d: "binary_sensor", s: ["defrost"] },
  cond:        { d: "sensor", s: ["refrigerant_condensing_temp"] },
  th2:         { d: "sensor", s: ["refrigerant_liquid_temp"] },
  discharge:   { d: "sensor", s: ["discharge_temp"] },
  superheat:   { d: "sensor", s: ["discharge_superheat_temp"] },
  subcool:     { d: "sensor", s: ["subcooling_temp"] },
  ou_liquid:   { d: "sensor", s: ["outside_unit_liquid_pipe_1_temp"] },
  ou_2phase:   { d: "sensor", s: ["outside_unit_two_phase_pipe_temp"] },
  ou_suction:  { d: "sensor", s: ["outside_unit_suction_pipe_temp"] },
  ou_heatsink: { d: "sensor", s: ["outside_unit_heatsink_temp"] },
  ou_surface:  { d: "sensor", s: ["outside_unit_compressor_surface_temp"] },
  fan:         { d: "sensor", s: ["fan_speed"] },
  starts:      { d: "sensor", s: ["accumulated_compressor_starts"] },
  runtime:     { d: "sensor", s: ["operating_runtime"] },
  // waterkant
  aanvoer:     { d: "sensor", s: ["feed_temp"] },
  retour:      { d: "sensor", s: ["return_temp"] },
  delta_t:     { d: "sensor", s: ["delta_t"] },
  flow:        { d: "sensor", s: ["flow_rate"] },
  pump1:       { d: "binary_sensor", s: ["water_pump_status", "water_pump"] },
  pump4:       { d: "binary_sensor", s: ["water_pump_4_status"] },
  pump_speed:  { d: "sensor", s: ["pump_speed"] },
  pump_w:      { d: "sensor", s: ["pump_consumption"] },
  pump_fb:     { d: "sensor", s: ["pump_feedback_status"] },
  klep:        { d: "binary_sensor", s: ["3_way_valve"] },
  bh1:         { d: "binary_sensor", s: ["booster_heater"] },
  heatsrc:     { d: "sensor", s: ["heat_source"] },
  // tapwater
  tank:        { d: "sensor", s: ["dhw_current_temp"] },
  tank2:       { d: "sensor", s: ["dhw_secondary_temp"] },
  dhw_sp:      { d: "sensor", s: ["dhw_setpoint_value"] },
  dhw_drop:    { d: "sensor", s: ["dhw_max_temp_drop"] },
  dhw_mode:    { d: "select", s: ["dhw_mode"] },
  leg_temp:    { d: "sensor", s: ["legionella_prevention_temp"] },
  // regelaar en energie
  opstate:     { d: "sensor", s: ["operation_mode"] },
  z1_sp:       { d: "sensor", s: ["zone_1_setpoint_value"] },
  z1_room:     { d: "sensor", s: ["zone_1_room_temp"] },
  p_heat:      { d: "sensor", s: ["output_power"] },
  p_est:       { d: "sensor", s: ["estimated_output_power"] },
  cop_est:     { d: "sensor", s: ["estimated_cop"] },
  dhw_prod:    { d: "sensor", s: ["dhw_delivered"] },
  dhw_cons:    { d: "sensor", s: ["dhw_consumed"] },
  dhw_cop:     { d: "sensor", s: ["dhw_cop"] },
  heat_prod:   { d: "sensor", s: ["heating_delivered"] },
  heat_cons:   { d: "sensor", s: ["heating_consumed"] },
  heat_cop:    { d: "sensor", s: ["heating_cop"] },
  day_prod:    { d: "sensor", s: ["estimated_total_daily_energy_produced"] },
  day_cons:    { d: "sensor", s: ["reported_total_daily_energy_consumption"] },
  fault:       { d: "sensor", s: ["fault_code"] },
  ref_err:     { d: "sensor", s: ["refrigerant_error_code"] },
  // Asgard zelf
  wifi:        { d: "sensor", s: ["wifi_signal_db"] },
  esp_temp:    { d: "sensor", s: ["esp_internal_temperature"] },
  uptime:      { d: "sensor", s: ["esp_uptime"] },
  esp_version: { d: "sensor", s: ["esp_version"] },
  // niet aangesloten
  mixing:      { d: "sensor", s: ["mixing_tank_temp"] },
  z1_feed:     { d: "sensor", s: ["z1_feed_temp"] },
  z1_return:   { d: "sensor", s: ["z1_return_temp"] },
  mix_step:    { d: "sensor", s: ["mixing_valve_step_z1"] },
  imm:         { d: "binary_sensor", s: ["immersion_heater"] },
  holiday:     { d: "binary_sensor", s: ["holiday_mode"] },
  pump2:       { d: "binary_sensor", s: ["water_pump_2_status"] },
};
// Met deze entiteiten bepaalt het panel of de Asgard bereikbaar is en hoe recent de waarden zijn.
const CORE_KEYS = ["buiten", "freq", "aanvoer", "retour", "tank", "flow", "opstate"];
// Per kamer de slimme temperatuurmeter die naast de (domme) thermostaat hangt. Per verdieping de lussen op de
// verdeler: met hoofdactuator zit er één aandrijving op de aanvoer en gaan alle lussen samen open of dicht,
// anders heeft elke lus een eigen aandrijving tenzij actuator: false (dan alleen een handwiel).
const DEFAULT_FLOORS = [
  { naam: "2E VERDIEPING", hoofdactuator: true, lussen: 3,
    kamers: [{ naam: "Slaapkamer 4", entity: "sensor.kantoor_kantoor_thermo_hygro_co2_temperatuur" }] },
  { naam: "1E VERDIEPING", lussen: [{ naam: "Overloop", actuator: false }, { naam: "Badkamer", via: "Slaapkamer 1" },
    "Slaapkamer 1", "Slaapkamer 2", "Slaapkamer 3"], kamers: [
    { naam: "Slaapkamer 1", entity: "sensor.slaapkamer_slaapkamer_thermo_hygro_co2_temperatuur" },
    { naam: "Slaapkamer 2", entity: "sensor.kinderkamer_kinderkamer_thermo_hygro_co2_temperatuur" },
    { naam: "Slaapkamer 3", entity: "sensor.hobbykamer_thermo_hygro_temperature" }] },
  { naam: "BEGANE GROND", hoofdactuator: true, lussen: 5, kamers: [{ naam: "Woonkamer", entity: "sensor.woonkamer_woonkamer_thermo_hygro_co2_temperatuur" }] },
];
// Kraan open/dicht per kamer, afgeleid uit gemeten tegen ingesteld: open vanaf ROOM_HYST onder de ingestelde waarde,
// dicht vanaf ROOM_HYST erboven, daartussen blijft de vorige stand staan (de thermostaat schakelt met hysterese).
const ROOM_HYST = 0.2;        // °C
const P_IDLE = 30;            // W: daaronder is een groep in stand-by (regelaar, wifi)
// Boven dit vermogen op de groep van de buitenunit draaien compressor en ventilator. Vangnet voor als de frequentie
// (nog) ontbreekt, bijvoorbeeld net na een herstart van de Asgard.
const P_RUN = 150;
// De watermeter meet al het water in huis. Alleen als het vat tegelijk afkoelt (er stroomt koud water in omdat er
// warm water getapt wordt) loopt de stroom via het vat. Het koude water komt onderin binnen, dus de onderste voeler
// (THW5B) zakt snel; 0,5 °C is ruim boven de langzame afkoeling van het vat in rust.
const TAP_DROP = 0.5;         // °C afkoeling van het vat ...
const TAP_WIN = 15 * 60e3;    // ... binnen dit venster

// Stooklijn zoals op het Ecodan-display: [buitentemperatuur, aanvoertemperatuur] per punt. Komt uit Configureren,
// want de FTC6 geeft de punten niet door (wel het actuele aanvoerdoel, Zone 1 Setpoint Value).
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
      c.sort((a, b) => a.length - b.length);     // de kortste naam: total_dhw_consumed is niet dhw_consumed
      if (c.length) return c[0];
    }
    return null;
  };
  const r = {};
  for (const [k, e] of Object.entries(ENT)) r[k] = pick(ov[k]) || find(e.d, e.s);

  // regeling van zone 1 (Heat Compensation Curve, Heat Flow Temperature of Heat Target Temperature)
  r.opmode = pick(ov.opmode) || find("select", ["selected_operating_mode"]);

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
  // warmtevraag van de regelunit van de vloerverwarming op ingang IN1 van de FTC6
  r.vraag = pick(ov.warmtevraag) || find("binary_sensor", ["in1_thermostat"]);

  // verdiepingen en kamers; thermostaten worden gezocht op kamernaam (climate.woonkamer of naam "Woonkamer")
  const floors = Array.isArray(ov.verdiepingen) && ov.verdiepingen.length ? ov.verdiepingen : DEFAULT_FLOORS;
  const climates = ids.filter(id => id.startsWith("climate.") && !id.includes("ecodan"));
  const setp = Object.fromEntries(Object.entries(cfg.instellingen || {}).map(([n, v]) => [slug(n), +v]));
  r.floors = floors.slice(0, 3).map(f => ({
    naam: String(f.naam || f.name || "").toUpperCase(),
    ...loopsOf(f),
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
  // welke kamerthermostaat stuurt de aandrijving van een lus (via: de badkamer volgt slaapkamer 1)
  r.floors.forEach(f => f.loops.forEach(l => {
    const j = f.kamers.findIndex(k => slug(k.naam) === slug(l.via || l.naam)); l.ctl = j < 0 ? null : j;
  }));
  return r;
}

// lussen: een aantal of een lijst van namen / {naam, actuator, via}; zonder opgave 5 lussen met elk een aandrijving
function loopsOf(f) {
  const main = !!(f.hoofdactuator ?? f.main_actuator);
  const l = f.lussen ?? f.loops;
  const list = Array.isArray(l) && l.length ? l : Array.from({ length: clamp(Math.round(+l) || 5, 1, 8) }, () => ({}));
  return { main, loops: list.slice(0, 8).map(x => {
    const o = typeof x === "object" && x ? x : { naam: x };
    return { naam: String(o.naam || o.name || ""), via: String(o.via || ""), act: !!(o.actuator ?? !main) };
  }) };
}

/* ------------------------- opmaak ---------------------------------- */
const opShort = m => /curve/i.test(m) ? "stooklijn" : /flow/i.test(m) ? "vaste aanvoer" : /target|room/i.test(m) ? "kamertemperatuur" : m;
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? "–" : nf(d).format(v).replace("-", "−"));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hhmm = t => new Date(t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const duur = sec => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? `${d} d ${h} u` : h ? `${h} u ${m} min` : `${m} min`; };
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
const nb = (x, y, n) => `<g class="nb"><circle cx="${x}" cy="${y}" r="6.2"/><text x="${x}" y="${y + 2.6}">${n}</text></g>`;
const pwr = (d, g) => `<path class="pwr" d="${d}"/><path class="fl f-${g} thin" d="${d}"/>`;

function floorsSvg(floors) {
  const tops = [70, 300, 530];
  // lussen: heen bovenlangs van rood naar de mengkleur bij de bocht, terug onderlangs van de mengkleur naar blauw
  let s = `<defs>
    <linearGradient id="loopOut" gradientUnits="userSpaceOnUse" x1="896" y1="0" x2="1056" y2="0">
      <stop offset="0" style="stop-color:var(--hot)"/><stop offset="1" style="stop-color:var(--loopmid)"/></linearGradient>
    <linearGradient id="loopBack" gradientUnits="userSpaceOnUse" x1="1056" y1="0" x2="896" y2="0">
      <stop offset="0" style="stop-color:var(--loopmid)"/><stop offset="1" style="stop-color:var(--ret)"/></linearGradient></defs>`;
  floors.forEach((f, fi) => {
    const T = tops[fi];
    s += `<rect class="band" x="800" y="${T}" width="378" height="210" rx="6"/>`;
    s += `<text class="t b fl-name" x="852" y="${T + 22}">${esc(f.naam)}</text>`;
    const hop = (T + 160) <= 580 ? `H842 a8,8 0 0 0 -16,0 H812` : `H812`;
    s += `<g class="ff" data-ff="${fi}">${pipe(`M834,${T + 50} H860`, "hot", "heat")}${pipe(`M860,${T + 160} ${hop}`, "ret", "heat")}</g>`;
    // lussen gelijk verdeeld over de hoogte van de verdeler
    const n = f.loops.length, step = n > 1 ? 108 / (n - 1) : 0, ly = i => T + 50 + i * step;
    const acts = f.loops.map((l, i) => l.act ? i : -1).filter(i => i >= 0);
    s += `<g class="comp" data-c="manifold" data-also="zone1" tabindex="0" role="button" aria-label="Verdeler ${esc(f.naam.toLowerCase())}">`;
    s += `<rect class="shape" x="860" y="${T + 38}" width="24" height="134" rx="3"/>`;
    s += `<text class="t s" x="872" y="${T + 190}" text-anchor="middle">verdeler</text>`;
    f.loops.forEach((l, i) => {
      const y = ly(i), d = `M896,${y - 4} H1052 a4,4 0 0 1 0,8 H896`;
      s += `<g class="lus" data-l="${fi}-${i}">`
        + `<path d="M896,${y - 4} H1052 a4,4 0 0 1 0,8" fill="none" stroke="url(#loopOut)" stroke-width="2.4" stroke-linecap="round" class="b-heat"/>`
        + `<path d="M1052,${y + 4} H896" fill="none" stroke="url(#loopBack)" stroke-width="2.4" stroke-linecap="round" class="b-heat"/>`
        + `<path class="fl f-heat thin" d="${d}"/></g>`;
      if (l.naam && step >= 20) s += `<text class="t loop" x="902" y="${y - 8}">${esc(l.naam.toLowerCase())}${l.via ? ` (via ${esc(l.via.toLowerCase())})` : ""}</text>`;
    });
    // lus zonder aandrijving: alleen het handwiel op de verdeler; er loopt eventueel een stuurdraad achterlangs
    const sigTo = f.main ? 847 : 890, sigEnd = f.main ? T + 44 : acts.length ? ly(acts[acts.length - 1]) - 6 : null;
    if (sigEnd != null) s += `<path class="sig" d="M1074,${T + 44} H1064 V${T + 32} H${sigTo} V${sigEnd}"/>`;
    f.loops.forEach((l, i) => { if (!l.act) s += `<circle class="cap" cx="890" cy="${ly(i)}" r="4.6"/>`; });
    const own = acts.length, what = f.main ? "samen open of dicht" : own === n ? "elk een eigen kraan" : own ? `${own} met eigen kraan` : "zonder kranen";
    s += `<text class="t s" x="976" y="${T + 192}" text-anchor="middle">${n} ${n === 1 ? "lus" : "lussen"}, ${what}</text></g>`;
    s += `<g class="comp" data-c="act" tabindex="0" role="button" aria-label="Ventielaandrijvingen">`;
    if (f.main) s += `<rect class="shape kraan" data-k="${fi}-m" x="841" y="${T + 44}" width="12" height="12" rx="2"/>`;
    acts.forEach(i => { s += `<rect class="shape kraan" data-k="${fi}-${i}" x="884" y="${ly(i) - 6}" width="12" height="12" rx="2"/>`; });
    s += `</g>`;
    s += `<g class="comp" data-c="tstat" tabindex="0" role="button" aria-label="Thermostaten ${esc(f.naam.toLowerCase())}">`;
    s += `<path class="sig s-vraag" d="M1172,${T + 49} H1182"/>`;
    s += `<rect class="shape regel" data-floor="${fi}" x="1074" y="${T + 36}" width="98" height="26" rx="4"/>`;
    s += `<text class="t s" x="1123" y="${T + 53}" text-anchor="middle">regelunit</text>`;
    const last = T + 84 + (Math.max(1, f.kamers.length) - 1) * 30;
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
  <defs>
    <!-- diepte: licht van linksboven op de randen (reliëf), slagschaduw eronder. Filtergebied over het hele schema,
         anders verdwijnen kaarsrechte lijnen (een horizontale lijn heeft geen hoogte). -->
    <filter id="bevel" filterUnits="userSpaceOnUse" x="-20" y="-20" width="1240" height="1052" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="2.6" specularConstant=".75" specularExponent="16" lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="235" elevation="42"/></feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".5" k4="0" result="lit"/>
      <feDropShadow in="lit" dx="0" dy="2" stdDeviation="1.6" flood-color="#000" style="flood-opacity:var(--sh-bevel)"/></filter>
    <filter id="tube" filterUnits="userSpaceOnUse" x="-20" y="-20" width="1240" height="1052" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="3.2" specularConstant="1.05" specularExponent="22" lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="250" elevation="50"/></feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0" result="lit"/>
      <feDropShadow in="lit" dx="0" dy="2.5" stdDeviation="1.8" flood-color="#000" style="flood-opacity:var(--sh-tube)"/></filter>
    <filter id="raise" filterUnits="userSpaceOnUse" x="-20" y="-20" width="1240" height="1052">
      <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000" style="flood-opacity:var(--sh-raise)"/></filter>
    <filter id="lift" filterUnits="userSpaceOnUse" x="-20" y="-20" width="1240" height="1052">
      <feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#000" style="flood-opacity:var(--sh-lift)"/></filter>
    <linearGradient id="zoneGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--zg1)"/><stop offset=".12" style="stop-color:var(--zg2)"/><stop offset="1" style="stop-color:var(--zg3)"/></linearGradient>
    <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--bg1);stop-opacity:.6"/><stop offset="1" style="stop-color:var(--bg2);stop-opacity:.5"/></linearGradient>
    <linearGradient id="shapeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--sg1)"/><stop offset=".5" style="stop-color:var(--sg2)"/><stop offset="1" style="stop-color:var(--sg3)"/></linearGradient>
    <linearGradient id="cylShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset=".22" stop-color="#fff" stop-opacity=".08"/>
      <stop offset=".34" stop-color="#fff" stop-opacity=".12"/><stop offset=".6" stop-color="#000" stop-opacity=".04"/>
      <stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient>
    <!-- platenwisselaars: water warmt op in 3 (onder retour, boven aanvoer); in 16 koelt het primaire water af en warmt het tapwater op -->
    <linearGradient id="hex3W" gradientUnits="userSpaceOnUse" x1="0" y1="720" x2="0" y2="600">
      <stop offset="0" style="stop-color:var(--ret)"/><stop offset="1" style="stop-color:var(--hot)"/></linearGradient>
    <linearGradient id="hex16P" gradientUnits="userSpaceOnUse" x1="0" y1="412" x2="0" y2="470">
      <stop offset="0" style="stop-color:var(--hot)"/><stop offset="1" style="stop-color:var(--ret)"/></linearGradient>
    <linearGradient id="hex16S" gradientUnits="userSpaceOnUse" x1="0" y1="470" x2="0" y2="412">
      <stop offset="0" style="stop-color:var(--cold)"/><stop offset="1" style="stop-color:var(--dhw)"/></linearGradient>
    <!-- vat: gelaagd, koud leidingwater onderin en warm tapwater bovenin -->
    <linearGradient id="tankGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--hot)"/><stop offset=".55" style="stop-color:var(--dhw);stop-opacity:.55"/>
      <stop offset="1" style="stop-color:var(--ret)"/></linearGradient>
    <radialGradient id="sphere" cx=".35" cy=".3" r=".75">
      <stop offset="0" style="stop-color:var(--sp1)"/><stop offset=".45" style="stop-color:var(--sp2)"/><stop offset="1" style="stop-color:var(--sp3)"/></radialGradient>
  </defs>
  <rect class="zone" x="16" y="16" width="290" height="384" rx="8"/>
  <rect class="zone" x="16" y="416" width="290" height="388" rx="8"/>
  <rect class="zone" x="320" y="16" width="460" height="788" rx="8"/>
  <rect class="zone" x="794" y="16" width="390" height="788" rx="8"/>
  <text class="zlabel" x="32" y="42">BUITEN · TUIN</text>
  <text class="zlabel" x="336" y="42">TECHNISCHE RUIMTE</text>
  <text class="zlabel" x="808" y="42">WONING</text>

  <g class="comp" data-c="cyl" tabindex="0" role="button" aria-label="Cilinderunit EHST20D-VM2D">
    <rect class="ghost" x="340" y="60" width="420" height="736" rx="14" style="stroke:var(--muted)"/>
    <text class="t h" x="356" y="84">EHST20D-VM2D</text>
    <text class="t s" x="356" y="100">cilinderunit (binnen) · Figure 8.2</text>
  </g>

  <!-- koudemiddel: heet gas van de buitenunit naar platenwisselaar 3, vloeistof terug (TH2 = 28, drukvoeler = 29) -->
  <g class="comp" data-c="refr" tabindex="0" role="button" aria-label="Koudemiddelleidingen">
    <rect class="hit" x="276" y="150" width="100" height="600"/>
    ${pipe("M280,175 H352 V600 H372", "refr", "refr")}
    ${pipe("M372,720 H338 V198 H280", "refr", "refr", true)}
    <text class="t s" x="286" y="166">R32</text>
  </g>
  <g class="comp" data-c="th2" tabindex="0" role="button" aria-label="Koudemiddelvoeler TH2">
    <rect class="hit" x="340" y="706" width="30" height="58"/>
    <circle class="sensor" cx="355" cy="720" r="5.5"/>
    <text class="t s" x="355" y="742" text-anchor="middle">TH2</text>
    ${nb(355, 756, 28)}
    <text class="val sm" id="v-th2" x="341" y="772"></text>
  </g>
  <g class="comp" data-c="psens" tabindex="0" role="button" aria-label="Drukvoeler">
    <path class="shape" d="M355,474 v12 l9,-6 z"/>
    ${nb(374, 480, 29)}
  </g>

  <!-- primair circuit: retour via 11-25-12-13-14 naar platenwisselaar 3, aanvoer via booster heater 4 en THW1 (24) naar 3-wegklep 5 -->
  ${pipe("M412,600 H450 V427", "hot", "prim")}
  ${pipe("M450,397 V240 H642 a8,8 0 0 1 16,0 H727 a8,8 0 0 1 16,0 H804 a8,8 0 0 1 16,0 H834", "hot", "heat")}
  ${pipe("M465,412 H516", "hot", "dhw")}
  ${pipe("M516,470 H502 V708 H620 V750", "ret", "dhw")}
  ${pipe("M812,330 H750 V750 H620", "ret", "heat")}
  ${pipe("M620,750 H425 V720 H412", "ret", "prim")}
  <circle class="fill-ink" cx="620" cy="750" r="3"/>
  <circle class="fill-ink" cx="450" cy="448" r="3"/>

  <!-- tapwater: koud leidingwater (terugslag 33) onderin het vat, warm tapwater (overdruk 21) bovenuit naar de kranen -->
  ${pipe("M772,196 H735 V680 H720", "cold", "tap")}
  <path class="pipe cold thin" d="M768,190 L758,196 L768,202"/>
  ${pipe("M650,300 V160 H788 V232 a8,8 0 0 1 0,16 V322 a8,8 0 0 1 0,16 V733", "dhw", "tap")}
  <text class="t s" x="662" y="152">warm tapwater</text>
  <text class="t s" x="662" y="188">koud leidingwater</text>
  <g class="comp" data-c="ds18" tabindex="0" role="button" aria-label="DS18B20-voeler op de warmwaterleiding">
    <rect class="hit" x="700" y="148" width="40" height="24"/>
    <circle class="sensor asgs" cx="720" cy="160" r="5"/>
    <text class="asg sm" x="742" y="174" text-anchor="end">1-wire (optie)</text>
  </g>
  <text class="val sm" id="v-tap" x="640" y="188" text-anchor="end"></text>
  <text class="val sm" id="v-tap2" x="640" y="201" text-anchor="end"></text>
  <g class="comp" data-c="dhwsafe" tabindex="0" role="button" aria-label="Overdrukventiel tapwater en terugslagklep">
    <rect class="hit" x="620" y="200" width="150" height="30"/>
    <path class="shape" d="M638,204 l12,7 l-12,7 z M662,204 l-12,7 l12,7 z"/>
    ${nb(628, 222, 21)}
    <path class="shape" d="M729,210 h12 l-6,9 z"/>
    ${nb(754, 214, 33)}
  </g>

  <path class="sig s-vraag" d="M1182,579 V56 H750 V98 H740"/>
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
    <text class="val sm" id="v-defrost" x="120" y="332" text-anchor="middle"></text>
  </g>
  <g class="comp" data-c="asgOut" tabindex="0" role="button" aria-label="Extra buitenunitwaarden via Asgard">
    <rect class="hit" x="40" y="346" width="240" height="50"/>
    <text class="val sm" id="v-out1" x="44" y="358"></text>
    <text class="val sm" id="v-out2" x="44" y="371"></text>
    <text class="val sm" id="v-out3" x="44" y="384"></text>
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

  <g class="comp" data-c="ftc" tabindex="0" role="button" aria-label="FTC6 regelaar en Asgard">
    <rect class="shape" x="560" y="70" width="180" height="58" rx="6"/>
    <text class="t b" x="574" y="90">FTC6 regelaar</text>
    <text class="t s" x="574" y="105">+ Asgard (ESP32-S3)</text>
    <text class="val" id="v-wifi" x="574" y="121"></text>
    <path class="wifi" d="M707,94 a15,15 0 0 1 22,0 M711,99 a9,9 0 0 1 14,0" fill="none" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="fill-ink" cx="718" cy="105" r="2.4"/>
    ${nb(548, 78, 1)}
    <text class="val sm" id="v-in1" x="560" y="142"></text>
  </g>

  <!-- veiligheidsgroep op de aanvoer: ontluchter 9, overdrukventiel 8 (3 bar), expansievat 10 (12 L), manometer 7 -->
  <g class="comp" data-c="safety" tabindex="0" role="button" aria-label="Expansievat, manometer, ontluchter en overdrukventiel">
    <rect class="hit" x="370" y="110" width="140" height="130"/>
    <path class="pipe hot thin" d="M450,448 H400 V134"/>
    <rect class="shape" x="394" y="120" width="12" height="10" rx="2"/>
    <path class="shape" d="M386,136 l-10,-6 v12 z"/>
    <path class="pwr" d="M376,142 v8" style="stroke:var(--muted);filter:none;stroke-width:1.2"/>
    <text class="t s" x="414" y="128">ontluchter</text>
    <text class="t s" x="414" y="141">overdruk 3 bar</text>
    ${nb(476, 124, 9)}
    ${nb(498, 137, 8)}
    <rect class="shape" x="382" y="156" width="36" height="42" rx="14"/>
    <text class="t s" x="426" y="174">expansievat</text>
    <text class="t s" x="426" y="187">12 L · 1 bar</text>
    ${nb(498, 183, 10)}
    <circle class="shape" cx="400" cy="220" r="9"/>
    <path d="M400,220 l5,-5" stroke="var(--hot)" stroke-width="1.4" stroke-linecap="round"/>
    <text class="t s" x="416" y="224">manometer</text>
    ${nb(482, 220, 7)}
  </g>

  <g class="comp" data-c="hex" tabindex="0" role="button" aria-label="Platenwisselaar koudemiddel-water">
    <rect class="shape" x="372" y="590" width="40" height="140" rx="4"/>
    <path class="hexwall" d="M392,594 V726"/>
    ${pipe("M372,600 H382 V720 H372", "refr", "refr", true)}
    <path class="pipe thin b-prim" style="stroke:url(#hex3W)" d="M412,720 H402 V600 H412"/><path class="fl f-prim thin" d="M412,720 H402 V600 H412"/>
    <text class="t s" x="360" y="568">platenwisselaar</text>
    <text class="val" id="v-cond" x="392" y="582" text-anchor="middle"></text>
    <text class="val sm" id="v-heat" x="348" y="554"></text>
    ${nb(392, 744, 3)}
  </g>

  <g class="comp" data-c="bh1" data-also="meterIn" tabindex="0" role="button" aria-label="Booster heater 1, 2 kW">
    <rect class="hit" x="370" y="496" width="100" height="60"/>
    <rect class="shape" x="440" y="500" width="20" height="52" rx="4"/>
    <path class="coilheat" d="M450,505 l-6,4 l12,7 l-12,7 l12,7 l-12,7 l12,7 l-6,4" fill="none" stroke-width="1.6"/>
    <text class="t s" x="432" y="522" text-anchor="end">BH1 · 2 kW</text>
    <text class="val" id="v-bh1" x="432" y="537" text-anchor="end"></text>
    ${nb(472, 526, 4)}
  </g>

  <g class="comp" data-c="thw1" tabindex="0" role="button" aria-label="Aanvoervoeler THW1">
    <rect class="hit" x="380" y="458" width="100" height="30"/>
    <circle class="sensor" cx="450" cy="472" r="7"/>
    <text class="t s" x="438" y="469" text-anchor="end">THW1</text>
    <text class="val" id="v-aanvoer" x="438" y="483" text-anchor="end"></text>
    ${nb(470, 472, 24)}
  </g>

  <g class="comp" data-c="valve" tabindex="0" role="button" aria-label="Driewegklep">
    <rect class="hit" x="418" y="380" width="96" height="62"/>
    <polygon class="shape" points="440,427 450,412 460,427"/>
    <polygon class="shape vport" id="port-heat" points="440,397 450,412 460,397"/>
    <polygon class="shape vport" id="port-dhw" points="465,402 450,412 465,422"/>
    <line x1="450" y1="412" x2="434" y2="412" stroke="var(--ink)" stroke-width="1.6"/>
    <rect class="shape" x="422" y="406" width="12" height="12" rx="2"/>
    <text class="t s" x="460" y="390">3-wegklep</text>
    <text class="val" id="v-klep" x="464" y="446"></text>
    ${nb(428, 432, 5)}
  </g>

  <!-- tapwaterkant: platenwisselaar water-water 16, kalkvanger 17, sanitaire pomp 18 -->
  <g class="comp" data-c="hex16" tabindex="0" role="button" aria-label="Platenwisselaar water-water voor tapwater">
    <rect class="shape" x="516" y="395" width="40" height="90" rx="4"/>
    <path class="hexwall" d="M536,399 V481"/>
    <path class="pipe thin b-dhw" style="stroke:url(#hex16P)" d="M516,412 H526 V470 H516"/><path class="fl f-dhw thin" d="M516,412 H526 V470 H516"/>
    <path class="pipe thin b-san" style="stroke:url(#hex16S)" d="M556,470 H546 V412 H556"/><path class="fl f-san thin" d="M556,470 H546 V412 H556"/>
    <text class="t s" x="536" y="499" text-anchor="middle">wisselaar</text>
    <text class="t s" x="536" y="511" text-anchor="middle">tapwater</text>
    ${nb(536, 525, 16)}
  </g>
  ${pipe("M580,640 H566 V470 H556", "cold", "san", true)}
  ${pipe("M556,412 H566 V325 H580", "dhw", "san", true)}
  <g class="comp" data-c="scale" tabindex="0" role="button" aria-label="Kalkvanger">
    <rect class="hit" x="540" y="356" width="34" height="34"/>
    <rect class="shape" x="559" y="362" width="14" height="24" rx="3"/>
    <path d="M562,366 l8,4 l-8,4 l8,4 l-8,4" fill="none" stroke="var(--muted)" stroke-width="1"/>
    ${nb(548, 374, 17)}
  </g>
  <g class="comp" data-c="pump18" tabindex="0" role="button" aria-label="Sanitaire pomp">
    <rect class="hit" x="540" y="310" width="40" height="44"/>
    <circle class="shape pump18" cx="566" cy="340" r="10"/>
    <path d="M561,345 L566,334 L571,345 Z" class="fill-ink"/>
    ${nb(548, 336, 18)}
  </g>

  <g class="comp" data-c="filter" tabindex="0" role="button" aria-label="Filter en debietmeter">
    <rect class="hit" x="508" y="738" width="104" height="44"/>
    <rect class="shape" x="585" y="743" width="20" height="14" rx="7"/>
    <text class="t s" x="595" y="773" text-anchor="middle">debiet</text>
    <text class="val sm" id="v-flow" x="626" y="738"></text>
    ${nb(595, 787, 11)}
    <rect class="shape" x="516" y="742" width="20" height="16" rx="2"/>
    <path d="M519,745 l14,10 M533,745 l-14,10" stroke="var(--muted)" stroke-width="1.2"/>
    <text class="t s" x="526" y="773" text-anchor="middle">filter</text>
    ${nb(526, 787, 12)}
  </g>

  <g class="comp" data-c="thw2" tabindex="0" role="button" aria-label="Retourvoeler THW2">
    <rect class="hit" x="542" y="726" width="36" height="66"/>
    <circle class="sensor" cx="560" cy="750" r="7"/>
    <text class="t s" x="560" y="773" text-anchor="middle">THW2</text>
    <text class="val" id="v-retour" x="560" y="737" text-anchor="middle"></text>
    <text class="val sm" id="v-dt" x="626" y="724"></text>
    ${nb(560, 787, 25)}
  </g>

  <g class="comp" data-c="pump1" tabindex="0" role="button" aria-label="Pomp 1">
    <rect class="hit" x="440" y="722" width="66" height="66"/>
    <circle class="shape pumpbody" cx="484" cy="750" r="13"/>
    <path d="M491,743 L476,750 L491,757 Z" class="fill-ink"/>
    <path class="shape" d="M446,744 l8,6 l-8,6 z M462,744 l-8,6 l8,6 z"/>
    <text class="t s" x="484" y="775" text-anchor="middle">pomp 1</text>
    <text class="val" id="v-pump1" x="484" y="731" text-anchor="middle"></text>
    ${nb(484, 787, 13)}
    ${nb(454, 770, 14)}
  </g>

  <g class="comp" data-c="tank" data-also="wh" tabindex="0" role="button" aria-label="Tapwatervat 200 liter">
    <rect id="tankfill" x="584" y="304" width="132" height="392" rx="30"/>
    <rect class="tankshade" x="584" y="304" width="132" height="392" rx="30"/>
    <rect class="shape" x="580" y="300" width="140" height="400" rx="34" style="fill:none"/>
    <text class="t b" x="650" y="672" text-anchor="middle">tapwatervat</text>
    <text class="t b" x="650" y="687" text-anchor="middle">200 L</text>
    <text class="val sm" id="v-target" x="660" y="320" text-anchor="middle"></text>
    ${nb(650, 650, 15)}
  </g>
  ${pipe("M580,325 H598 V506 a8,8 0 0 0 8,8", "dhw", "san", true)}
  <g class="comp" data-c="imm" tabindex="0" role="button" aria-label="Dompelaar, niet ingebouwd">
    <rect class="ghost" id="imm-shape" x="606" y="590" width="88" height="12" rx="3"/>
    <text class="t s" x="650" y="618" text-anchor="middle">dompelaar n.v.t.</text>
    ${nb(700, 596, 19)}
  </g>
  <g class="comp" data-c="thw5" tabindex="0" role="button" aria-label="Tankvoelers THW5A en THW5B">
    <rect class="hit" x="640" y="430" width="86" height="106"/>
    <circle class="sensor" cx="720" cy="450" r="7"/>
    <text class="t s" x="708" y="446" text-anchor="end">THW5A</text>
    <text class="val" id="v-tank2" x="708" y="461" text-anchor="end"></text>
    ${nb(700, 476, 26)}
    <circle class="sensor" cx="720" cy="500" r="7"/>
    <text class="t s" x="708" y="496" text-anchor="end">THW5B</text>
    <text class="val" id="v-tank" x="708" y="511" text-anchor="end"></text>
    ${nb(700, 526, 27)}
  </g>

  <text class="zlabel" x="32" y="442">HOOFDSCHERM</text>
  <text class="t s" x="290" y="442" text-anchor="end">bediening cilinderunit</text>
  <g class="comp" data-c="ctrl" tabindex="0" role="button" aria-label="Hoofdscherm van de bediening">
    <rect class="hit" x="20" y="450" width="282" height="250"/>
    ${ctrlSvg(23, 452, 276)}
  </g>
  <g class="comp" data-c="unused" tabindex="0" role="button" aria-label="Niet aangesloten onderdelen">
    <rect class="hit" x="24" y="716" width="274" height="34"/>
    <line x1="32" y1="716" x2="290" y2="716" stroke="var(--line)" stroke-width="1"/>
    <text class="t b" x="32" y="734" style="fill:var(--muted)">Niet aangesloten</text>
    <text class="t s" x="32" y="749">mengklep zone 1 · mengvat · pomp 2</text>
  </g>
  <g class="comp" data-c="absent" tabindex="0" role="button" aria-label="Niet in jouw installatie">
    <rect class="hit" x="24" y="756" width="274" height="40"/>
    <text class="t b" x="32" y="774" style="fill:var(--muted)">Niet in jouw installatie</text>
    <text class="t s" x="32" y="790">koeling · zone 2 · BH2 · pomp 3</text>
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
  <text class="t s" x="32" y="926">Echte stroommeting in de meterkast, los van de schattingen van de FTC6.</text>
  <text class="t s" id="v-meter1" x="32" y="944"></text>
  <text class="t s" id="v-meter2" x="32" y="962"></text>
  ${curveSvg(curve)}

  <g id="floors">${floorsSvg(floors)}</g>
  <!-- tappunten: alleen als de panel-indeling de standaardindeling is (begane grond onderaan, 1e in het midden) -->
  <g class="comp" data-c="taps" tabindex="0" role="button" aria-label="Tappunten warm water">
    ${pipe("M788,503 H804 a8,8 0 0 1 16,0 H826 a8,8 0 0 1 16,0 H1132", "dhw", "tap")}
    ${pipe("M788,733 H1100", "dhw", "tap")}
    <rect class="hit" x="1070" y="460" width="112" height="50"/>
    <rect class="hit" x="1070" y="690" width="112" height="50"/>
    <path class="pipe dhw thin" d="M1080,503 V490"/>
    <path class="shape tapfix" d="M1070,484 h20 a10,8 0 0 1 -20,0 z"/>
    <path class="tapfix" d="M1076,478 h7 v6" fill="none" stroke-width="2" stroke-linecap="round"/>
    <text class="t loop" x="1091" y="489">wasbak</text>
    <path class="pipe dhw thin" d="M1132,503 V474"/>
    <path class="shape tapfix" d="M1124,474 h16 a8,6 0 0 0 -16,0 z"/>
    <path class="drops" d="M1127,479 v5 M1132,479 v7 M1137,479 v5" fill="none" stroke-width="1.4" stroke-linecap="round"/>
    <text class="t loop" x="1143" y="489">douche</text>
    <path class="pipe dhw thin" d="M1100,733 V716"/>
    <path class="shape tapfix" d="M1086,712 h28 v-6 h-28 z"/>
    <path class="tapfix" d="M1096,706 v-10 h10 v4" fill="none" stroke-width="2" stroke-linecap="round"/>
    <text class="t s" x="1120" y="712">keuken</text>
  </g>
</svg>`;
}

/* ------------------------- onderdelen ------------------------------ */
const C = {
  outdoor: { name: "Buitenunit SUZ-SWM60 VA", where: "Tuin", text: "De eigenlijke warmtepomp. De ventilator blaast buitenlucht langs de verdamper; het koude koudemiddel neemt daar warmte op, ook als het buiten koud is. Een 6 kW-unit (SWM60). Er loopt geen water naar buiten, alleen twee koudemiddelleidingen. In het schema draait de ventilator mee zodra de compressor draait: volgens de Asgard (frequentie boven 0 Hz) of volgens de kWh-meter (meer dan 150 W op de groep van de buitenunit). Bij vorst en hoge luchtvochtigheid ijst de verdamper aan; dan draait de unit even om en ontdooit hij met warmte uit het water ('Defrost'). Het schema meldt dat bij de ventilator en bovenaan; de ventilator staat dan stil en het koudemiddel loopt achteruit." },
  comp: { name: "Compressor", where: "In de buitenunit", text: "Het hart van de warmtepomp. Drukt het koudemiddel samen, waardoor het heet wordt. Het is een inverter: het toerental (in Hz) past zich aan de vraag aan. 0 Hz = uit." },
  th7: { name: "Buitenvoeler TH7", where: "Achterkant buitenunit", text: "Meet de buitentemperatuur. De regelaar gebruikt die voor de stooklijn: hoe kouder het buiten is, hoe warmer het water naar de vloeren gaat." },
  refr: { name: "Koudemiddelleidingen (R32)", where: "Tussen tuin en technische ruimte", text: "Twee koperen leidingen: een dikke gasleiding (heet gas naar binnen) en een dunne vloeistofleiding (terug naar buiten). Dit is een split-systeem: het koudemiddel komt tot in de cilinderunit. De paarse bolletjes lopen zodra de compressor draait; hoe hoger het toerental, hoe sneller. Tijdens het ontdooien lopen ze achteruit: de 4-wegklep keert de kringloop dan om en het hete gas gaat naar de buitenunit." },
  hex: { name: "Platenwisselaar koudemiddel-water (3)", where: "In de cilinderunit", text: "Hier wordt koudemiddel-warmte omgezet in warm water. Links stroomt het koudemiddel (paars): het hete gas condenseert en verlaat de wisselaar als vloeistof langs TH2. Rechts stroomt het verwarmingswater van onder naar boven en warmt op. De platen houden beide circuits gescheiden." },
  ftc: { name: "FTC6 regelaar + Asgard", where: "In de cilinderunit (achter het bedieningspaneel)", text: "Het brein. De FTC6 leest alle voelers, stuurt pomp, klep en heaters aan en berekent het energieverbruik. De Asgard is een ESP32-S3 met ESPHome (esphome-ecodan-hp) op de CN105-aansluiting van de FTC6. Hij leest de waarden rechtstreeks uit de regelaar en geeft ze via de ESPHome-integratie binnen enkele seconden aan Home Assistant door, zonder cloud. Ook de buitenunit-waarden (persgas, zuiggas, ventilatortoerental) komen via de FTC6; op sommige buitenunits blijven die leeg." },
  bh1: { name: "Booster heater 1 (2 kW)", where: "In de aanvoerleiding, in de cilinderunit", text: "Een elektrisch verwarmingselement direct in het water. Springt bij als de warmtepomp het alleen niet redt: strenge vorst, ontdooien, of de wekelijkse legionella-run (vat naar ±60 °C). Dit is de dure route: 1 kWh stroom = 1 kWh warmte." },
  pump1: { name: "Pomp 1 (circulatiepomp)", where: "In de cilinderunit", text: "Ingebouwde pomp die het water rondpompt door de platenwisselaar en daarna naar het vat óf de vloeren. Staat de pomp uit, dan stroomt er niets en staan er in het schema geen bolletjes op de waterleidingen." },
  thw1: { name: "Aanvoervoeler THW1", where: "Aanvoerleiding, na booster heater", text: "Temperatuur van het water dat de unit verlaat. Bij vloerverwarming meestal 25–35 °C; bij tapwater maken hoger, tot ±55 °C." },
  valve: { name: "3-wegklep", where: "In de cilinderunit", text: "Wissel tussen twee bestemmingen. Stand 'verwarming': water gaat naar de vloerverwarming. Stand 'tapwater': water gaat door platenwisselaar 16 naast het vat. Het schema kleurt de actieve uitgang en dimt de tak die niet in gebruik is." },
  filter: { name: "Filter en debietmeter", where: "Retourleiding, in de cilinderunit", text: "Het filter vangt vuil uit het verwarmingswater (onderdeel van het onderhoud). De debietmeter meet hoeveel liter per minuut er stroomt; voor de SWM60 hoort dat tussen 7,2 en 17,2 L/min te liggen. De Asgard geeft het debiet door (Flow Rate); het staat in het schema onder filter · debiet." },
  thw2: { name: "Retourvoeler THW2", where: "Retourleiding, in de cilinderunit", text: "Temperatuur van het water dat terugkomt. Het verschil met de aanvoer (ΔT) laat zien hoeveel warmte er is afgegeven. Bij vloerverwarming is 3–7 °C verschil normaal." },
  tank: { name: "Tapwatervat 200 L", where: "Onderste deel van de cilinderunit", text: "Roestvrijstalen vat (15) met het drinkwater voor kranen en douche. Het verwarmingswater raakt dit drinkwater nooit: het vat wordt opgewarmd via platenwisselaar 16 en sanitaire pomp 18. Koud leidingwater komt onderin binnen, warm tapwater gaat bovenuit naar de kranen. Maximaal 70 °C. De kleur in het vat volgt de tanktemperatuur." },
  ctrl: { name: "Hoofdscherm van de bediening", where: "Voorkant cilinderunit (servicehandleiding 9-1)", text: "Nagebouwd display van de bediening, gevuld met de live waarden van de Asgard. Kraan met kader: tapwater wordt nu opgewarmd. Huis met zon: ruimteverwarming zone 1. In het kolommetje ernaast: ▶ in bedrijf, II stand-by. Balkjes bovenaan: de warmtepomp draait; een sneeuwvlok op die plek: de buitenunit ontdooit. Bliksem: de booster heater staat aan. Vat met blokjes: legionellapreventie. Koffer: vakantiemodus. ECO: tapwater in Eco-stand. Daaronder de kamertemperatuur van de voeler in het bedieningspaneel (Zone 1 Room Temp) en de vattemperatuur (THW5B); groot het aanvoerdoel dat de FTC6 nu gebruikt (Zone 1 Setpoint Value)." },
  taps: { name: "Tappunten warm water", where: "Keuken (begane grond), wasbak en douche (1e verdieping)", text: "Tijdens het tappen draait er geen pomp. De waterleidingdruk duwt koud water onderin het vat, en dat duwt het warme water bovenuit naar de kraan. Pas als het vat daardoor genoeg afkoelt, gaat de warmtepomp het vat opwarmen; dan draaien pomp 1 en de sanitaire pomp 18. Welke kraan open staat is niet te meten; het schema laat alle drie de tappunten oplichten zodra er warm water getapt wordt." },
  ds18: { name: "1-wire-voeler (DS18B20) op de warmwaterleiding", where: "Idee: op de uitgaande warmwaterleiding van het vat", text: "De Asgard heeft een 1-wire-aansluiting voor maximaal zes DS18B20-voelers. Een voeler op de warmwaterleiding warmt binnen seconden op zodra er getapt wordt. Zo is tappen direct en betrouwbaar te zien, ook zonder dat het vat al merkbaar afkoelt." },
  asgOut: { name: "Servicewaarden buitenunit en pomp (Asgard)", where: "Buitenunit en pomp 1", text: "De Asgard vraagt bij de FTC6 ook servicewaarden van de buitenunit op: persgastemperatuur (TH4), zuiggas, verdamping, ventilatortoerental, oververhitting, onderkoeling, compressorstarts en draaiuren, plus de stand en het verbruik van pomp 1. Die servicecodes werken niet op alle SUZ-buitenunits; blijft een waarde leeg, dan geeft jouw buitenunit hem niet door." },
  hex16: { name: "Platenwisselaar water-water (16)", where: "In de cilinderunit, naast het vat", text: "Het vat heeft geen spiraal. Staat de 3-wegklep (5) op tapwater, dan stroomt het verwarmingswater door de linkerhelft van deze tweede platenwisselaar en via de debietmeter (11) terug naar de warmtepomp. Door de rechterhelft pompt de sanitaire pomp (18) koud water van onderin het vat; dat gaat opgewarmd via de kalkvanger (17) en pomp 18 terug het vat in en komt vrij net onder THW5B. Het verwarmingswater en het drinkwater raken elkaar niet." },
  pump18: { name: "Sanitaire pomp (18)", where: "Tussen wisselaar 16 en het vat", text: "Pompt tijdens het opwarmen van tapwater het water van onderin het vat via de kalkvanger (17) en wisselaar 16 terug naar bovenin. Draait alleen in tapwaterstand. De FTC6 stuurt hem aan als pomp 4 (Water Pump 4 Status); start het opwarmen van het vat, dan gaan pomp 1 en pomp 4 tegelijk aan. Ontbreekt die entiteit, dan laat het schema hem meedraaien met de tapwaterstand." },
  scale: { name: "Kalkvanger (17)", where: "Sanitair circuit, voor pomp 18", text: "Vangt kalk op die uit het drinkwater neerslaat bij het opwarmen, zodat wisselaar 16 en pomp 18 niet dichtslibben. Hoort bij het jaarlijkse onderhoud." },
  safety: { name: "Expansievat, manometer, ontluchter en overdrukventiel", where: "Aanvoerleiding, bovenin de cilinderunit", text: "Expansievat 10 (12 L, voordruk 1 bar) vangt het uitzetten van het verwarmingswater op. Manometer 7 toont de waterdruk. Automatische ontluchter 9 laat lucht ontsnappen en overdrukventiel 8 opent bij 3 bar. Niets hiervan is uit te lezen; de waterdruk lees je af op de manometer." },
  dhwsafe: { name: "Overdrukventiel tapwater (21) en terugslagklep (33)", where: "Tapwateraansluitingen", text: "Overdrukventiel 21 beschermt het vat en opent bij 10 bar. Terugslagklep 33 (lokaal geplaatst) voorkomt dat tapwater terugstroomt in de waterleiding." },
  th2: { name: "Koudemiddelvoeler TH2 (28)", where: "Vloeistofleiding bij platenwisselaar 3", text: "Meet de temperatuur van het vloeibare koudemiddel na de platenwisselaar (Refrigerant Liquid Temp). Het verschil met de condensatietemperatuur is de onderkoeling: een paar graden is normaal." },
  psens: { name: "Drukvoeler (29)", where: "Gasleiding bij platenwisselaar 3", text: "Meet de druk van het koudemiddel aan de gaskant. De FTC6 rekent daar de condensatietemperatuur uit (Refrigerant Condensing Temp); de druk zelf geeft hij niet door." },
  imm: { name: "Dompelaar (immersion heater)", where: "Zou in het vat zitten", text: "Een optioneel elektrisch element direct in het tapwatervat. De standaard EHST20D-uitvoeringen hebben er geen; de entiteit bestaat omdat de regelaar het wel kán aansturen." },
  thw5: { name: "Tankvoelers THW5A (26) en THW5B (27)", where: "THW5A bovenin, THW5B onderin het vat", text: "THW5B zit onderin en is de voeler waarop de FTC6 regelt (DHW Current Temp). Zakt die onder de ingestelde waarde min de toegestane daling (DHW Max Temp Drop), dan schakelt de warmtepomp naar tapwater. THW5A zit bovenin (DHW Secondary Temp) en laat zien hoe warm het water is dat naar de kranen gaat; boven is het vat warmer dan onder. Tap je warm water, dan stroomt er onderin koud leidingwater bij en zakt THW5B snel; daaraan herkent het panel dat het water via het vat loopt. Geeft THW5A vast 25,0 °C, dan is er geen bovenste voeler aangesloten." },
  cyl: { name: "Cilinderunit EHST20D-VM2D", where: "Technische ruimte", text: "Alles-in-één binnenunit: platenwisselaar, pomp, 3-wegklep, 2 kW booster heater, expansievat, regelaar en een 200 L tapwatervat in één kast. 'VM2' = 1-fase, 2 kW booster heater. De H in EHST staat voor alleen verwarmen: deze unit kan niet koelen." },
  manifold: { name: "Vloerverwarmingsverdelers", where: "Eén per verdieping", text: "Verdelen het warme water over de lussen van een verdieping: 5 op de begane grond, 5 op de 1e en 3 op de 2e verdieping. Elke lus is een slang die door één kamer (of een deel ervan) in de dekvloer loopt en afgekoeld terugkomt." },
  act: { name: "Ventielaandrijvingen (kranen)", where: "Op de verdelers", text: "Kleine elektrische 'knoppen' die een lus open of dicht zetten, aangestuurd door de thermostaat via de regelunit. Op de begane grond en de 2e verdieping zit er één op de hoofdaanvoer van de verdeler: de thermostaat zet daar alle lussen tegelijk open of dicht. Op de 1e verdieping heeft elke slaapkamer een eigen aandrijving; die van de badkamer volgt de thermostaat van slaapkamer 1. De lus naar de overloop heeft geen aandrijving en staat altijd open. Lussen zonder aandrijving hebben alleen een handwiel (het rondje op de verdeler). De aandrijvingen zijn niet uit te lezen: het panel neemt aan dat een kraan open staat zodra de kamer 0,2 °C onder de ingestelde waarde zakt en weer dicht gaat 0,2 °C erboven. Een open kraan krijgt een rode rand en alleen door open lussen lopen bolletjes als de vloerverwarming draait." },
  tstat: { name: "Thermostaten + regelunit", where: "Per verdieping", text: "Elke thermostaat (Möhlenhoff) opent de aandrijving(en) die op zijn kanaal van de regelunit zitten. In het display-icoon staat de ingestelde temperatuur uit Configureren, ernaast de gemeten temperatuur. Zodra er ergens één warmte vraagt, geeft de regelunit een aan/uit-signaal aan de FTC6 en gaat de warmtepomp draaien. De thermostaten zelf zijn niet slim; de temperatuur bij elke kamer komt van de slimme temperatuurmeter die ernaast hangt. Of een thermostaat warmte vraagt, schat het panel uit gemeten tegen ingesteld: 0,2 °C eronder gaat de kraan open en kleurt het display-icoon rood, 0,2 °C erboven gaat hij weer dicht. De warmtevraag naar de FTC6 (ingang IN1) leest het panel via de Asgard ('In1 Thermostat'); staat die aan, dan kleurt het signaal naar de FTC6 rood. Zonder die entiteit leidt het panel de vraag af uit de warmtepomp." },
  unused: { name: "Niet aangesloten", where: "—", text: "De FTC6 ondersteunt een mengklep met eigen zonevoelers, een mengvat met extra zonepomp en een dompelaar. Bij jou is dat niet aangesloten. De entiteiten bestaan omdat de Asgard ze altijd aanmaakt. Voelers zonder sensor geven een vaste 25,0 °C. Water Pump 2 Status kan tijdens ruimteverwarming 'aan' melden: dan schakelt alleen de uitgang OUT2, er hangt geen pomp aan." },
  curve: { name: "Stooklijn (compensatiecurve)", where: "Instelling in de FTC6", text: "Met de regeling op Heat Compensation Curve bepaalt de FTC6 de aanvoertemperatuur uit de buitentemperatuur (TH7): hoe kouder buiten, hoe warmer het water naar de vloeren. Tot en met het koude punt geldt de hoogste aanvoer, vanaf het warme punt de laagste, en daartussen loopt de lijn recht (via het aanpassingspunt als dat is ingesteld). De groene stip is de huidige buitentemperatuur op de lijn: de aanvoer waar de FTC6 volgens de ingestelde punten op mikt. De Asgard meldt ook het aanvoerdoel dat de FTC6 zelf berekent (Zone 1 Setpoint Value); dat staat erbij en hoort gelijk te zijn aan de lijn. De rode stip is de werkelijke aanvoer (THW1) zodra de vloerverwarming draait. De punten zelf geeft de FTC6 niet door; ze komen uit Configureren. Pas ze daar aan als je de stooklijn op het Ecodan-display verandert." },
  zone1: { name: "Zone 1: de vloerverwarming", where: "Alle verdiepingen samen", text: "Voor de FTC6 is je hele vloerverwarming één zone. De Asgard meldt het aanvoerdoel van die zone (Zone 1 Setpoint Value) en de kamertemperatuur zoals de FTC6 die kent (Zone 1 Room Temp, van de voeler in het bedieningspaneel in de technische ruimte). Bij regeling op de stooklijn speelt die kamertemperatuur geen rol." },
  absent: { name: "Niet in jouw installatie", where: "Komen niet voor in jouw installatie", text: "De Asgard-firmware kent ook entiteiten voor koelen, een tweede zone, een tweede booster-trap en pomp 3 (zone 2). Jouw installatie heeft die onderdelen niet; als ze in Home Assistant staan, kun je ze uitschakelen." },
  meterOut: { name: "kWh-meter buitenunit", where: "Meterkast", text: "Meet het werkelijke stroomverbruik van de groep naar de buitenunit: compressor en ventilator. Bij de gebruikelijke Ecodan-bedrading krijgt de cilinderunit zijn regelstroom (FTC6, wifi, pomp 1, 3-wegklep) via de buitenunit, dus dan telt dat verbruik hier mee. Dit is de meting om op te vertrouwen; de 'consumed'-waarden van de Asgard zijn schattingen van de FTC6. Boven 30 W lopen er gele bolletjes over de stroomkabel." },
  meterIn: { name: "kWh-meter binnenunit", where: "Meterkast", text: "Meet de aparte groep naar de cilinderunit. Die voedt vooral de 2 kW booster heater (BH1). Die gaat aan bij de legionella-run: de warmtepomp brengt het vat naar ±50–55 °C en de booster heater duwt het laatste stuk naar 60 °C. Ook als back-up bij strenge vorst kan hij bijspringen. Op vol vermogen zie je hier ongeveer 2000 W." },
};
C.wh = C.tank;

/* ------------------------- entiteitenlijst ------------------------- */
// k = sleutel in de resolver, c = onderdeel in het schema, x = uitleg, now(X) = interpretatie van de live waarde
const onoff = v => v == null ? "–" : v ? "aan" : "uit";
const daily = X => X.dailyFresh ? "" : `Deze waarde is sinds ${dagTijd(X.dailySince)} niet veranderd, dus hij hoort bij een eerdere dag. De FTC6 werkt de dagtotalen met vertraging bij.`;
const G = [
  { title: "Buitenunit", note: "Wat de buitenunit in de tuin meet en doet. De FTC6 krijgt deze waarden van de buitenunit; op sommige modellen blijven de servicewaarden leeg.", items: [
    { k: "buiten", n: "Outside Temp", c: "th7", now: X => X.buiten == null ? "" : X.buiten < 0
      ? "Vorst: de stooklijn vraagt een hoge aanvoertemperatuur en de booster heater kan bijspringen."
      : X.buiten < 7 ? "Koud: de stooklijn vraagt een hogere aanvoertemperatuur."
      : X.buiten < 16 ? "Mild weer: de stooklijn vraagt een lage aanvoertemperatuur." : "Warm: er is weinig of geen verwarmingsvraag." },
    { k: "freq", n: "Compressor Frequency", c: "comp", now: X => X.compByMeter ? `De Asgard meldt 0 Hz, maar de kWh-meter van de buitenunit meet ${fmt(X.pOut, 0)} W: de compressor draait waarschijnlijk.`
      : !X.freq ? "0 Hz: de compressor staat stil."
      : `De compressor draait op ${fmt(X.freq, 0)} Hz` + (X.freq < 35 ? ": laag toerental, rustig modulerend en zuinig." : X.freq > 70 ? ": hoog toerental, grote vraag (tapwater of kou)." : ".") },
    { k: "comp", n: "Compressor", c: "comp", x: "Aan/uit-melding van de compressor volgens de FTC6.", now: X => X.compBin == null ? "" : X.compBin ? "Aan." : "Uit." },
    { k: "defrost", n: "Defrost", c: "outdoor", x: "Staat aan zolang de buitenunit ontdooit. De warmtepomp draait dan om en haalt even warmte uit het water; de aanvoer zakt kort.",
      now: X => X.defrost ? "Aan: de verdamper wordt ontdooid. De aanvoer zakt tijdelijk; dat is normaal." : X.defrost == null ? "" : "Uit." },
    { k: "cond", n: "Refrigerant Condensing Temp", c: "hex", x: "Temperatuur waarbij het koudemiddel in de platenwisselaar condenseert, dus waar de warmte aan het water wordt afgegeven. Wordt berekend uit de druk in de buitenunit, maar hoort fysiek bij de platenwisselaar.",
      now: X => !X.compRun ? "Bij stilstand zakt het koudemiddel richting omgevingstemperatuur."
      : X.aanvoer != null && X.cond != null ? `${fmt(X.cond - X.aanvoer, 1)} °C boven de aanvoertemperatuur. Een paar graden is normaal; hoe kleiner, hoe zuiniger.` : "" },
    { k: "th2", n: "Refrigerant Liquid Temp", c: "th2", x: "Voeler TH2 op de vloeistofleiding na de platenwisselaar: het gecondenseerde koudemiddel dat terug naar buiten gaat.",
      now: X => X.compRun && X.th2 != null && X.retour != null ? `${fmt(X.th2 - X.retour, 1)} °C ten opzichte van de retour.` : "" },
    { k: "discharge", svc: 1, n: "Discharge Temp", c: "asgOut", x: "Temperatuur van het hete gas direct na de compressor (persgas). Ruim boven de condensatietemperatuur; te hoog wijst op te weinig koudemiddel." },
    { k: "superheat", svc: 1, n: "Discharge Superheat Temp", c: "asgOut", x: "Hoeveel het persgas warmer is dan de condensatietemperatuur. De buitenunit regelt hiermee het expansieventiel." },
    { k: "subcool", svc: 1, n: "Subcooling Temp", c: "th2", x: "Hoeveel het vloeibare koudemiddel na de platenwisselaar onder de condensatietemperatuur is afgekoeld. Een paar graden is normaal." },
    { k: "ou_suction", svc: 1, n: "Outside Unit Suction Pipe Temp", c: "asgOut", x: "Zuiggasleiding naar de compressor: het koudemiddel dat net warmte uit de buitenlucht heeft opgenomen." },
    { k: "ou_2phase", svc: 1, n: "Outside Unit Two Phase Pipe Temp", c: "asgOut", x: "Leiding in de verdamper waar het koudemiddel half vloeibaar, half gas is: de verdampingstemperatuur. Ligt onder de buitentemperatuur." },
    { k: "ou_liquid", svc: 1, n: "Outside Unit Liquid Pipe 1 Temp", c: "asgOut", x: "Vloeistofleiding in de buitenunit, vóór het expansieventiel." },
    { k: "ou_surface", svc: 1, n: "Outside Unit Compressor Surface Temp", c: "asgOut", x: "Temperatuur van de compressorbehuizing." },
    { k: "ou_heatsink", svc: 1, n: "Outside Unit Heatsink Temp", c: "asgOut", x: "Koelplaat van de inverterelektronica die het toerental van de compressor regelt." },
    { k: "fan", svc: 1, n: "Fan Speed", c: "asgOut", x: "Toerental van de ventilator. Draait mee met de compressor; bij ontdooien staat hij stil." },
    { k: "starts", svc: 1, n: "Accumulated Compressor Starts", c: "asgOut", x: "Teller van compressorstarts. Veel starts per dag (pendelen) is slecht voor de levensduur en het rendement." },
    { k: "runtime", n: "Operating Runtime", c: "asgOut", x: "Totale draaitijd van de warmtepomp in uren." },
  ]},
  { title: "Waterkant cilinderunit", note: "Het verwarmingswater dat rondgaat tussen platenwisselaar, vat en vloeren.", items: [
    { k: "aanvoer", n: "Feed Temp", c: "thw1", now: X => !X.pump1 ? "De pomp staat stil: dit is stilstaand water in de unit (restwarmte), geen echte aanvoer."
      : X.dhw ? "Water naar platenwisselaar 16 van het tapwatervat." : "Water naar de vloerverwarming." },
    { k: "retour", n: "Return Temp", c: "thw2", now: X => !X.pump1 || X.dT == null ? "De pomp staat stil, dus ΔT zegt nu niets."
      : `ΔT ${fmt(X.dT, 1)} °C` + (X.dhw ? "." : X.dT < 2 ? ": klein, de vloeren nemen weinig warmte af." : X.dT > 8 ? ": groot, veel afgifte of weinig debiet." : ": normaal voor vloerverwarming.") },
    { k: "delta_t", n: "Delta T", c: "thw2", x: "Verschil tussen aanvoer (THW1) en retour (THW2), berekend door de Asgard." },
    { k: "flow", n: "Flow Rate", c: "filter", x: "Debiet door de unit, gemeten door de debietmeter in de retour. Voor de SWM60 hoort dat tussen 7,2 en 17,2 L/min te liggen.",
      now: X => X.flow == null ? "" : !X.flow ? "0 L/min: er stroomt geen water." : X.flow < 7.2 ? "Onder het minimum van 7,2 L/min: controleer filter en kranen." : X.flow > 17.2 ? "Boven het maximum van 17,2 L/min." : "Binnen het bereik van de SWM60." },
    { k: "pump1", n: "Water Pump Status", c: "pump1", der: X => X.pump1, derSrc: "Flow Rate", now: X => X.pump1 ? "Aan: er stroomt water door de unit." : "Uit: er stroomt geen water." },
    { k: "pump_speed", n: "Pump Speed", c: "pump1", x: "Stand van pomp 1 volgens de FTC6." },
    { k: "pump_w", n: "Pump Consumption", c: "pump1", x: "Opgenomen vermogen van pomp 1 volgens de pomp zelf." },
    { k: "pump_fb", n: "Pump Feedback Status", c: "pump1", x: "Terugmelding van pomp 1 aan de FTC6: Active, Warning of een storing." },
    { k: "pump4", n: "Water Pump 4 Status", c: "pump18", der: X => X.pump4 ?? (X.op == null && X.klep == null ? null : X.san), derSrc: "de tapwaterstand",
      x: "Uitgang pomp 4 van de FTC6. Bij de EHST20D is dat de sanitaire pomp 18: hij pompt tijdens het opwarmen van het vat het tapwater door platenwisselaar 16.",
      now: X => X.san ? "Aan: het vat wordt opgewarmd via wisselaar 16." : "Uit." },
    { k: "klep", n: "3-way Valve", c: "valve", der: X => X.opk == null ? null : X.dhw, derSrc: "Operation Mode", now: X => X.dhw ? "Klep staat op tapwater: het water gaat door platenwisselaar 16 naast het vat." : "Klep staat op ruimteverwarming (vloeren)." },
    { k: "bh1", n: "Booster Heater", c: "bh1", der: X => X.bh1, derSrc: "Heat Source", now: X => !X.bh1 ? "Uit: geen elektrische bijverwarming."
      : X.dhw ? "Aan tijdens tapwater: waarschijnlijk de legionella-run (vat naar ±60 °C)."
      : "Aan tijdens verwarmen: de warmtepomp redt het alleen niet (vorst of ontdooien). Dit is dure warmte." },
    { k: "heatsrc", n: "Heat Source", c: "bh1", x: "Waar de warmte nu vandaan komt volgens de FTC6: Heatpump, Booster Heater, Immersion Heater of een combinatie." },
  ]},
  { title: "Tapwater", note: "Het drinkwater in het vat voor kranen en douche.", items: [
    { k: "tank", n: "DHW Current Temp (THW5B)", c: "thw5", now: X => {
      if (X.tank == null) return "";
      if (X.mode === "tapwater" || X.mode === "legionella") return "Het vat wordt nu opgewarmd.";
      if (X.target == null) return "";
      const d = X.target - X.tank;
      return d <= 0 ? "Het vat is op temperatuur." : d <= X.hyst ? `${fmt(d, 1)} °C onder het doel: binnen de toegestane daling van ${fmt(X.hyst, 0)} °C, de warmtepomp start nog niet.`
        : `${fmt(d, 1)} °C onder het doel: de warmtepomp schakelt binnenkort naar tapwater.`; } },
    { k: "tank2", n: "DHW Secondary Temp (THW5A)", c: "thw5", now: X => fixedNo(X.tank2) || (X.tank2 != null && X.tank != null ? `Bovenin ${fmt(X.tank2 - X.tank, 1)} °C ${X.tank2 >= X.tank ? "warmer" : "kouder"} dan onderin.` : "") },
    { k: "dhw_sp", n: "DHW Setpoint Value", c: "tank", x: "Gewenste temperatuur van het vat, zoals ingesteld op het bedieningspaneel." },
    { k: "dhw_drop", n: "DHW Max Temp Drop", c: "thw5", x: "Hoeveel het vat onder de ingestelde waarde mag zakken voordat de warmtepomp het opnieuw opwarmt (hysterese)." },
    { k: "dhw_mode", n: "DHW Mode", c: "ctrl", x: "Normal of Eco. In Eco warmt de warmtepomp het vat rustiger op: zuiniger, maar het duurt langer." },
    { k: "leg_temp", n: "Legionella Prevention Temp", c: "tank", x: "Temperatuur waar het vat bij de legionella-run naartoe wordt gebracht. De booster heater duwt het laatste stuk." },
    { k: "tap", n: "Waterverbruik (watermeter)", c: "taps", x: `De watermeter in de meterkast meet al het water in huis, ook voor toilet en koude kranen. Het schema toont alleen stroming door het vat als het vat onderin tegelijk minstens ${fmt(TAP_DROP, 1)} °C afkoelt binnen ${TAP_WIN / 60e3} minuten. Korte tapbeurten (handen wassen) zie je daardoor niet.`,
      now: X => !X.tapFlow ? "Er stroomt nu geen water." : X.hotDraw ? `Er wordt warm water getapt: het vat is ${fmt(X.tankDrop, 1)} °C afgekoeld.` : "Er stroomt water, maar het vat koelt niet af: waarschijnlijk toilet of een koude kraan." },
  ]},
  { title: "Regelaar en energie", note: "Waarden die de FTC6 berekent of over zichzelf rapporteert.", items: [
    { k: "opstate", n: "Operation Mode", c: "ftc", x: "Wat de FTC6 nu doet: Off, Space Heating, Heating Water (tapwater), Legionella Prevention of Frost Protection.",
      now: X => X.op == null ? "" : `${esc(X.op)}: ${{ off: "geen vraag, de warmtepomp staat in rust.", heat: "ruimteverwarming.", dhw: "het vat wordt opgewarmd.", leg: "de legionella-run.", frost: "vorstbeveiliging: de pomp houdt het water in beweging.", cool: "koelen." }[opKind(X.op)] || "onbekende stand."}` },
    { k: "opmode", n: "Selected operating mode", c: "curve", x: "Hoe de FTC6 de aanvoertemperatuur bepaalt: Heat Compensation Curve (stooklijn op basis van de buitentemperatuur), Heat Flow Temperature (vaste aanvoertemperatuur) of Heat Target Temperature (op de kamertemperatuur van het bedieningspaneel). Het panel toont dit alleen; wijzigen kan hier bewust niet.",
      now: X => X.opmode == null ? "" : /curve/i.test(X.opmode) ? "Stooklijn. Zo hoort het bij jouw installatie." : "Let op: niet op de stooklijn. Daardoor regelt de warmtepomp anders dan bedoeld." },
    { k: "z1_sp", n: "Zone 1 Setpoint Value", c: "curve", x: "Het aanvoerdoel dat de FTC6 nu voor de vloerverwarming gebruikt. Bij de stooklijn volgt het uit de buitentemperatuur.",
      now: X => X.z1sp == null || X.curveTarget == null ? "" : Math.abs(X.z1sp - X.curveTarget) < 1 ? "Komt overeen met de stooklijn uit Configureren." : `Wijkt ${fmt(X.z1sp - X.curveTarget, 1)} °C af van de stooklijn uit Configureren: kijk of de punten nog kloppen met het display.` },
    { k: "z1_room", n: "Zone 1 Room Temp", c: "ctrl", x: "Kamertemperatuur volgens de FTC6: de voeler in het bedieningspaneel in de technische ruimte. Speelt bij regeling op de stooklijn geen rol." },
    { k: "vraag", n: "In1 Thermostat (warmtevraag)", c: "tstat", x: "Ingang IN1 van de FTC6: het aan/uit-signaal van de regelunit van de vloerverwarming. Aan zodra er ergens een thermostaat warmte vraagt.",
      now: X => X.vraag ? "Aan: minstens één thermostaat vraagt warmte." : "Uit: geen warmtevraag van de vloeren." },
    { k: "p_est", n: "Estimated Output Power", c: "hex", x: "Warmte die de warmtepomp nu levert, berekend door de Asgard uit debiet × ΔT.",
      now: X => X.copNow == null ? "" : `Met het gemeten stroomverbruik is de COP nu ongeveer ${fmt(X.copNow, 1)}.` },
    { k: "p_heat", n: "Output Power", c: "hex", x: "Geleverde warmte zoals de FTC6 die zelf meldt." },
    { k: "cop_est", n: "Estimated COP", c: "ftc", x: "COP van de lopende run volgens de Asgard: geschatte warmte ÷ door de FTC6 gemelde stroom, ongeveer elke 5 minuten bijgewerkt. 0 zolang de compressor stilstaat." },
    { k: "dhw_prod", n: "DHW Delivered", c: "ftc", x: "Warmte die vandaag in het tapwatervat is gestopt. Berekend door de FTC6 uit debiet × (aanvoer − retour); een goede schatting, geen geijkte meter.", now: daily },
    { k: "dhw_cons", n: "DHW Consumed", c: "ftc", x: "Stroom die vandaag is verbruikt voor tapwater (compressor, pomp, eventueel heaters). Intern berekend.", now: daily },
    { k: "dhw_cop", n: "DHW COP", c: "ftc", x: "COP voor sanitair warm water = geproduceerd ÷ verbruikt. Hoe hoger, hoe zuiniger. Tapwater haalt lager dan verwarming omdat het water heter moet (±50 °C).",
      now: X => X.dhw_cop ? (X.dhw_cop >= 2 ? "Normaal voor tapwater." : "Laag: misschien heeft de booster heater meegedraaid (legionella-run).") : "0: vandaag nog geen tapwater gemaakt." },
    { k: "heat_prod", n: "Heating Delivered", c: "ftc", x: "Warmte die vandaag naar de vloerverwarming is gegaan.", now: daily },
    { k: "heat_cons", n: "Heating Consumed", c: "ftc", x: "Stroom die vandaag voor ruimteverwarming is verbruikt.", now: daily },
    { k: "heat_cop", n: "Heating COP", c: "ftc", x: "COP voor ruimteverwarming. Bij vloerverwarming haalt een Ecodan buiten de strenge winter vaak 4 of hoger.",
      now: X => X.heat_cop ? (X.heat_cop >= 3.5 ? "Goed." : X.heat_cop >= 2.5 ? "Redelijk; bij kou is dit normaal." : "Laag: weinig gedraaid, of de booster heater sprong bij.") : "0: te weinig gedraaid om te berekenen." },
    { k: "day_prod", n: "Estimated Total Daily Energy Produced", c: "ftc", x: "Warmte van vandaag volgens de Asgard (opgeteld uit Estimated Output Power)." },
    { k: "day_cons", n: "Reported Total Daily Energy Consumption", c: "ftc", x: "Stroomverbruik van vandaag zoals de FTC6 het meldt (verwarming en tapwater samen)." },
    { k: "fault", n: "Fault code", c: "ftc", x: "Storingscode van de FTC6, zoals op het display. 'No error' is goed.",
      now: X => X.fault == null ? "" : X.faultOn ? "Er is een storing gemeld: zoek de code op in de servicehandleiding of op het display." : "Geen storing." },
    { k: "ref_err", n: "Refrigerant error code", c: "ftc", x: "Melding van het koudemiddelcircuit: Normal, Error of Maintenance Error." },
  ]},
  { title: "Asgard", note: "De ESP32-S3 op de CN105 van de FTC6 die de waarden doorgeeft.", items: [
    { k: "wifi", n: "WiFi Signal dB", c: "ftc", x: "Wifi-ontvangst van de Asgard. Beter dan −60 dBm is goed, slechter dan −75 dBm geeft verbindingsproblemen.",
      now: X => X.wifi == null ? "" : X.wifi >= -60 ? "Uitstekend." : X.wifi >= -75 ? "Redelijk." : "Zwak: kans op verbindingsproblemen met de Asgard." },
    { k: "uptime", n: "ESP Uptime", c: "ftc", x: "Hoe lang de Asgard draait sinds de laatste herstart. Begint dit vaak opnieuw, dan herstart hij (stroom, wifi of firmware)." },
    { k: "esp_temp", n: "ESP Internal Temperature", c: "ftc", x: "Temperatuur van de ESP32-S3 zelf." },
    { k: "esp_version", n: "ESP Version", c: "ftc", x: "Versie van de esphome-ecodan-hp-firmware op de Asgard." },
  ]},
  { title: "Stroommeting meterkast", note: "Je eigen kWh-meters: echte metingen, los van de schattingen van de FTC6.", items: [
    { k: "p_out", n: "Vermogen buitenunit", c: "meterOut", x: "Actueel opgenomen vermogen van de groep naar de buitenunit, gemeten in de meterkast.",
      now: X => X.pOut == null ? "" : X.pOut < P_IDLE ? "Stand-by: dit is het rustverbruik van de elektronica, waarschijnlijk inclusief de FTC6 en de Asgard." : "De compressor draait: honderden tot ruim duizend watt is normaal." },
    { k: "p_in", n: "Vermogen binnenunit", c: "meterIn", x: "Actueel opgenomen vermogen van de aparte groep naar de cilinderunit, gemeten in de meterkast.",
      now: X => X.pIn == null ? "" : X.pIn < P_IDLE ? "De booster heater is uit." : X.pIn > 1500 ? "De booster heater staat aan (±2000 W)." : "Klein verbruik op de binnenunit-groep." },
    { k: "e_out", n: "Energie buitenunit (teller)", c: "meterOut", x: "Totaalteller van de kWh-meter. Het panel rekent hiermee het verbruik van vandaag uit (stand nu − stand om middernacht)." },
    { k: "e_in", n: "Energie binnenunit (teller)", c: "meterIn", x: "Totaalteller van de kWh-meter van de binnenunit-groep." },
  ]},
  { title: "Niet aangesloten", note: "Deze entiteiten bestaan, maar er hangt niets aan. Je kunt ze in Home Assistant uitschakelen.", items: [
    { k: "z1_feed", n: "Z1 Feed Temp", c: "unused", unused: 1, x: "Aanvoervoeler THW6 achter een mengklep van zone 1.", now: X => fixed25(X.v) },
    { k: "z1_return", n: "Z1 Return Temp", c: "unused", unused: 1, x: "Retourvoeler THW7 van zone 1 bij een mengklep.", now: X => fixed25(X.v) },
    { k: "mix_step", n: "Mixing Valve Step z1", c: "unused", unused: 1, x: "Stand van een mengklep in zone 1. Zonder mengklep blijft dit 0." },
    { k: "mixing", n: "Mixing Tank Temp", c: "unused", unused: 1, x: "Voeler THW10 in een mengvat (buffervat). Wordt gebruikt als het systeem met een extra zonepomp werkt.", now: X => fixed25(X.v) },
    { k: "imm", n: "Immersion Heater", c: "imm", unused: 1, x: "Uitgang voor een dompelaar (elektrisch element) in het tapwatervat.",
      now: X => X.imm == null ? "Niet gevonden. Bij de EHST20D-VM2D zit geen dompelaar, dus dat kan zo blijven."
        : X.imm ? "Aan! Onverwacht: bij de EHST20D-VM2D zit normaal geen dompelaar." : "Uit. Bij jouw model zit geen dompelaar, dus dit blijft altijd uit." },
    { k: "pump2", n: "Water Pump 2 Status", c: "unused", unused: 1, x: "Uitgang OUT2 van de FTC6 voor een extra pomp in zone 1, bijvoorbeeld bij een mengvat of een lange leiding. De uitgang schakelt mee met de ruimteverwarming, maar bij jou hangt er geen pomp aan: alleen pomp 1 (13) en de sanitaire pomp 18 zijn er.",
      now: X => X.pump2 ? "Aan: de uitgang schakelt mee met de ruimteverwarming, maar er hangt geen pomp aan. Er draait dus niets extra." : "Uit." },
  ]},
  { title: "Niet in jouw installatie", note: "De Asgard-firmware kent deze functies, maar jouw installatie heeft de onderdelen niet.", items: [
    { k: "dis-cool", dis: 1, n: "Cool Consumed / Delivered / COP", c: "absent", x: "Stroomverbruik en geleverde koeling per dag.", now: () => "Niet van toepassing. De EHST20D verwarmt alleen (de H in EHST)." },
    { k: "dis-z2", dis: 1, n: "Zone 2", c: "absent", x: "Aanvoer, retour, doel en kamertemperatuur van een tweede zone.", now: () => "Niet aanwezig: de hele vloerverwarming is één zone." },
    { k: "dis-bh2", dis: 1, n: "Booster Heater 2", c: "absent", x: "Tweede trap van de booster heater, op grotere modellen.", now: () => "Bestaat niet bij jou: de VM2D heeft één trap van 2 kW." },
    { k: "dis-pump3", dis: 1, n: "Water Pump 3", c: "absent", x: "Pomp voor zone 2.", now: () => "Niet aanwezig: de hele vloerverwarming is één zone." },
  ]},
];
// soort bedrijf uit de tekst van Operation Mode (de Engelse labels van de Asgard-firmware)
function opKind(op) {
  if (op == null) return null;
  const o = String(op).toLowerCase();
  return /legionel/.test(o) ? "leg" : /water|dhw/.test(o) ? "dhw" : /frost/.test(o) ? "frost" : /cool/.test(o) ? "cool"
    : /heat/.test(o) ? "heat" : /^off$/.test(o) ? "off" : null;
}
function fixedNo(v) { return v != null && Math.abs(v - 25) < 0.05 ? "25,0 °C vast: er is geen bovenste voeler aangesloten." : ""; }
function fixed25(v) { return v == null ? "" : Math.abs(v - 25) < 0.05 ? "25,0 °C vast: geen voeler aangesloten." : `${fmt(v, 1)} °C, niet de vaste 25,0 °C: misschien is er toch een voeler aangesloten.`; }

/* ------------------------- stijl ----------------------------------- */
const STYLE = `
:host{
  --loopmid:color-mix(in srgb,var(--hot) 50%,var(--ret));
  --bg:#eef1ef; --surface:#fafbfa; --ink:#1b2422; --muted:#5b6865; --line:#c3ccc8; --zone:#e3e8e5;
  --asg:#2e8b57; --hot:#c9412c; --ret:#2c64c4; --refr:#7a4bbf; --dhw:#d9820f; --cold:#2a9bb5; --sig:#6c7a76;
  --accent:#2b2f2e; --accent-soft:#dfe4e2; --off:#8a9692; --glow:rgba(0,0,0,.28); --elec:#a87a00; --warn:#b26a00; --warn-soft:#fbeed6;
  --bad:#b3261e; --bad-soft:#f9dedc; --dot:#ffffffee;
  --plate:#ffffff; --plate-edge:#9aa6a2; --lcd:#b9c4b5; --lcd-edge:#8d9a8b;
  /* diepte: kleurverlopen en schaduwsterkte */
  --zg1:#eef2f0; --zg2:#e6ebe8; --zg3:#dde3e0; --bg1:#ffffff; --bg2:#f2f5f3; --sg1:#ffffff; --sg2:#f6f8f7; --sg3:#e3e8e5;
  --shape-edge:#4f5a57; --sp1:#a3aca9; --sp2:#4b5351; --sp3:#1d2120;
  --sh-bevel:.28; --sh-tube:.32; --sh-raise:.22; --sh-lift:.18; --sh-inset:rgba(0,0,0,.12);
  --f-display:"Barlow Semi Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif;
  --f-body:"IBM Plex Sans",Roboto,system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  display:block;height:100%;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.55;
  -webkit-font-smoothing:antialiased}
:host(.dark){
  /* donker thema: dezelfde matte opbouw als het lichte thema, in neutrale donkere tinten; accent lichtgrijs */
  --bg:#121212; --surface:#1c1c1c; --ink:#e6e6e6; --muted:#9e9e9e; --line:#333333; --zone:#242424;
  --asg:#6fcf97; --hot:#ee6a52; --ret:#5d93ee; --refr:#a985e6; --dhw:#f0a33d; --cold:#4cc0d8; --sig:#8a8a8a;
  --accent:#e0e0e0; --accent-soft:#2f2f2f; --off:#6e6e6e; --elec:#e2b84a; --warn:#f0b04a; --warn-soft:#2e2615;
  --bad:#ff8a80; --bad-soft:#331b19; --dot:#ffffffd9; --glow:rgba(255,255,255,.22);
  --plate:#2c2c2c; --plate-edge:#8a8a8a; --lcd:#aebaa9; --lcd-edge:#6f7b6c;
  --zg1:#2b2b2b; --zg2:#252525; --zg3:#1e1e1e; --bg1:#303030; --bg2:#232323; --sg1:#363636; --sg2:#262626; --sg3:#1b1b1b;
  --shape-edge:#8c8c8c; --sp1:#ffffff; --sp2:#cfcfcf; --sp3:#6f6f6f;
  --sh-bevel:.7; --sh-tube:.75; --sh-raise:.7; --sh-lift:.8; --sh-inset:rgba(0,0,0,.7); color-scheme:dark}
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
.chouse{fill:url(#shapeGrad);stroke:var(--shape-edge);stroke-width:1.4}
.cbrand{font-family:var(--f-body);font-size:8px;font-weight:700;letter-spacing:.06em;fill:var(--ink)}
.lcd{stroke:#1b1f1c;fill:none} .lcd text{stroke:none} .lcd .lt{fill:#1b1f1c;stroke:none;font-family:var(--f-mono);font-weight:500}
.lcd .lt.big{font-size:62px;font-weight:400;letter-spacing:-.04em} .lcd .lf{fill:#1b1f1c;stroke:none}
.lcd .ic.off, .lcd .st{opacity:.08} .lcd .st.on{opacity:1}
.lcd .cbox{stroke-opacity:.15} .lcd .cbox.on{stroke-opacity:1}
.ckeys rect, .ckeys circle{fill:var(--plate);stroke:var(--shape-edge);stroke-width:1.2;filter:url(#cbevel)}
.ckeys text{font-family:var(--f-body);font-size:10px;font-weight:600;text-anchor:middle;fill:var(--muted)}
.ckeys .ckg{fill:none;stroke:var(--muted);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ckeys #c-led{fill:#5b5f5c;stroke:none;filter:none} .ckeys #c-led.on{fill:#46d36f}
.board{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.viewport{position:relative;overflow:hidden;touch-action:pan-y;box-shadow:inset 0 3px 14px var(--sh-inset)}
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
.zone{fill:url(#zoneGrad);stroke:rgba(255,255,255,.08);stroke-width:1;filter:url(#lift)}
.zlabel{font-family:var(--f-display);font-weight:600;font-size:15px;letter-spacing:.08em;fill:var(--muted)}
.pipe{fill:none;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;transition:opacity .4s;filter:url(#tube)}
.pipe.thin{stroke-width:3.4}
.hot{stroke:var(--hot)} .ret{stroke:var(--ret)} .refr{stroke:var(--refr)} .dhw{stroke:var(--dhw)} .cold{stroke:var(--cold)}
.sig{fill:none;stroke:var(--sig);stroke-width:1.6;stroke-dasharray:5 4}
.pwr{filter:url(#tube);fill:none;stroke:var(--elec);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.shape{fill:url(#shapeGrad);stroke:var(--shape-edge);stroke-width:1.3;transition:stroke .3s;filter:url(#bevel)}
.shape.soft{stroke:var(--muted)}
.ghost{fill:none;stroke:var(--off);stroke-width:1.4;stroke-dasharray:4 4;filter:url(#raise)}
.band{fill:url(#bandGrad);stroke:rgba(255,255,255,.07)}
.t{fill:var(--ink);font-size:12px}
.t.s{font-size:10.5px;fill:var(--muted)}
.t.loop{font-size:9px;fill:var(--muted)}
.lus.dicht .b-heat{opacity:.35}
.lus.dicht .fl, .ff.dicht .fl{display:none}
.kraan.open{stroke:var(--hot);stroke-width:2}
.cap{fill:url(#shapeGrad);stroke:var(--shape-edge);stroke-width:1.2;filter:url(#bevel)}
.t.b{font-weight:600}
.t.h{font-family:var(--f-display);font-weight:600;font-size:15px}
.t.room{fill:var(--ink)}
.fl-name{font-family:var(--f-display);letter-spacing:.06em}
.val{font-family:var(--f-mono);font-size:11px;font-weight:500;fill:var(--accent);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
.val.sm{font-size:10px}
.val.off{fill:var(--off)} .val.hotv{fill:var(--hot)} .val.warnv{fill:var(--warn)}
.sensor{fill:url(#sphere);stroke:rgba(0,0,0,.35);stroke-width:1;filter:url(#raise)}
.tankshade{fill:url(#cylShade);pointer-events:none}
.fill-ink{fill:var(--ink)} .fill-muted{fill:var(--muted)}
.wifi{stroke:var(--ink)}
.coilheat{stroke:var(--off)}
.hexwall{stroke:var(--muted);stroke-width:1.4;stroke-dasharray:3 2;fill:none}
.nb circle{fill:var(--surface);stroke:var(--muted);stroke-width:.8;opacity:.9}
.nb text{font-family:var(--f-mono);font-size:7.2px;fill:var(--muted);text-anchor:middle;pointer-events:none}
svg.run-san .pump18{stroke:var(--accent);stroke-width:2.4}
.asg{font-family:var(--f-mono);font-size:11px;font-weight:500;fill:var(--asg);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
.asg.sm{font-size:9.5px}
.sensor.asgs{stroke:var(--asg);stroke-width:1.6}
.tapfix{stroke:var(--ink)} .drops{stroke:var(--muted)}
svg.run-tap .tapfix{stroke:var(--dhw);stroke-width:2.2} svg.run-tap .drops{stroke:var(--cold)}
.tplate{fill:var(--plate);stroke:var(--plate-edge);stroke-width:1.2;filter:url(#bevel)}
.tplate.heat{stroke:var(--hot);stroke-width:2}
.tlcd{fill:var(--lcd);stroke:var(--lcd-edge);stroke-width:.6}
.tknob{fill:var(--plate);stroke:var(--plate-edge);stroke-width:1.1}
.t.room{font-size:10px}
.tsp{fill:#1e2a20;font-family:var(--f-body);font-size:8.2px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;pointer-events:none}
.regel.heat{stroke:var(--hot);stroke-width:2.2}
#tankfill{fill:url(#tankGrad);opacity:.12;transition:opacity .6s}
/* stroom-overlay: bolletjes die in de tekenrichting van het pad lopen */
.fl{fill:none;stroke:var(--dot);stroke-width:2.2;stroke-linecap:round;stroke-dasharray:0.1 14;display:none;
  animation:flow var(--sp,1.2s) linear infinite;pointer-events:none}
.fl.thin{stroke-width:1.6;stroke-dasharray:0.1 11}
@keyframes flow{to{stroke-dashoffset:-14.1}}
.fl.thin{animation-name:flowt} @keyframes flowt{to{stroke-dashoffset:-11.1}}
svg.run-refr .f-refr{display:inline;--sp:var(--sp-refr)}
/* ontdooien: de 4-wegklep keert de kringloop om, het hete gas gaat naar de buitenunit */
svg.defrost .f-refr{animation-direction:reverse}
svg.run-prim .f-prim, svg.run-heat .f-heat, svg.run-dhw .f-dhw, svg.run-san .f-san, svg.run-tap .f-tap{display:inline}
svg.run-eout .f-eout{display:inline;--sp:var(--sp-eout)} svg.run-ein .f-ein{display:inline;--sp:var(--sp-ein)}
svg.mode-heat .b-dhw, svg.mode-heat .b-san, svg.mode-dhw .b-heat{opacity:.3}
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
.curve{fill:none;stroke:var(--hot);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round;filter:url(#tube)}
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
.comp.on .shape,.comp.on .ghost{stroke:var(--accent);stroke-width:2.2}
.comp.on{filter:drop-shadow(0 0 2.5px var(--glow))}
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


/* hoofdscherm van de bediening op de cilinderunit (servicehandleiding 9-1, Main screen) */
function ctrlSvg(x, y, w) {
  return `
<svg x="${x}" y="${y}" width="${w}" height="${w * 350 / 400}" viewBox="0 0 400 350" overflow="visible">
  <defs>
    <linearGradient id="lcdGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e4e8e2"/><stop offset="1" stop-color="#c5cbc4"/></linearGradient>
    <filter id="cbevel" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" style="flood-opacity:var(--sh-raise)"/></filter>
  </defs>
  <rect class="chouse" x="8" y="6" width="384" height="336" rx="22" filter="url(#cbevel)"/>
  <text class="cbrand" x="34" y="30">MITSUBISHI ELECTRIC</text>
  <rect x="38" y="40" width="324" height="226" rx="4" fill="url(#lcdGrad)" stroke="#111" stroke-width="2"/>
  <g class="lcd">
    <!-- 15, 14: SD-kaart en menuslot (niet actief) -->
    <g class="ic off"><rect x="140" y="47" width="14" height="16" rx="2" fill="none" stroke-width="1.4"/><text x="147" y="59" class="lt" font-size="6.5" text-anchor="middle">SD</text></g>
    <g class="ic off"><rect x="160" y="52" width="13" height="11" rx="1.5" fill="none" stroke-width="1.4"/><path d="M162,52 v-3 a4.5,4.5 0 0 1 9,0 v3" fill="none" stroke-width="1.4"/></g>
    <text class="lt" id="c-date" x="186" y="63" font-size="16"></text>
    <text class="lt" id="c-time" x="354" y="63" font-size="16" text-anchor="end"></text>
    <line x1="40" y1="70" x2="360" y2="70" stroke-width="2"/>

    <!-- 10: tapwater (kader = nu actief), ECO -->
    <rect class="cbox" id="c-dhwbox" x="48" y="80" width="58" height="50" fill="none" stroke-width="2.4"/>
    <path class="lf" d="M58,98 h22 v-5 h4 v-4 h-12 v4 h4 v5 h-18 z M80,98 h12 a4,4 0 0 1 4,4 v8 h-6 v-6 h-10 z"/>
    <path d="M93,114 v6 M96,116 v6 M90,117 v5" stroke-width="1.6"/>
    <text class="lt" id="c-eco" x="64" y="126" font-size="8">ECO</text>
    <!-- 9: ruimteverwarming zone 1 (kader = nu actief) -->
    <path class="cbox" id="c-heatbox" d="M48,166 L77,142 L106,166 V196 H48 Z" fill="none" stroke-width="2.4"/>
    <circle cx="77" cy="178" r="7" fill="none" stroke-width="2.2"/>
    <path d="M77,165 v-4 M77,195 v-4 M64,178 h-4 M94,178 h-4 M68,169 l-3,-3 M86,169 l3,-3 M68,187 l-3,3 M86,187 l3,3" stroke-width="1.8"/>
    <rect x="52" y="202" width="14" height="14" class="lf"/><text x="59" y="213" font-size="10" text-anchor="middle" fill="#e4e8e2">1</text>
    <rect x="86" y="202" width="14" height="14" fill="none" stroke-width="1.4"/><text class="lt" x="93" y="213" font-size="10" text-anchor="middle">2</text>

    <!-- 12: status tapwater (boven) en verwarming (onder): ▶ in bedrijf, II stand-by -->
    <g id="c-dhw-run" class="st"><rect x="112" y="96" width="16" height="16" rx="2" class="lf"/><path d="M117,99 l7,5 l-7,5 z" fill="#e4e8e2"/></g>
    <g id="c-dhw-sb" class="st"><rect x="112" y="96" width="16" height="16" rx="2" class="lf"/><path d="M116,99 v10 M124,99 v10" stroke="#e4e8e2" stroke-width="2.4"/></g>
    <g id="c-heat-run" class="st"><rect x="112" y="170" width="16" height="16" rx="2" class="lf"/><path d="M117,173 l7,5 l-7,5 z" fill="#e4e8e2"/></g>
    <g id="c-heat-sb" class="st"><rect x="112" y="170" width="16" height="16" rx="2" class="lf"/><path d="M116,173 v10 M124,173 v10" stroke="#e4e8e2" stroke-width="2.4"/></g>

    <!-- bovenste rij: 11 vakantie, 1 legionella, 17 SG, 2 warmtepomp, 3 elektrisch element, 16 buffervat -->
    <g class="ic off" id="c-hol"><rect x="146" y="82" width="24" height="18" rx="3" class="lf"/><circle cx="168" cy="98" r="6" fill="#e4e8e2" stroke-width="1.4"/><path d="M168,94 v4 h3" stroke-width="1.2"/></g>
    <g class="ic" id="c-leg"><path d="M182,84 h18 v16 a9,4 0 0 1 -18,0 z" fill="none" stroke-width="1.8"/><path d="M186,92 h3 v3 h3 v3 h-3 z" class="lf"/></g>
    <g class="ic off" id="c-sg"><rect x="208" y="82" width="22" height="20" rx="3" class="lf"/><text x="219" y="97" font-size="10" text-anchor="middle" fill="#e4e8e2">SG</text></g>
    <g class="ic" id="c-hp"><rect x="238" y="82" width="34" height="20" rx="2" class="lf"/>
      <g id="c-hp-run"><path d="M244,86 v12 M250,86 v12 M256,86 v12 M262,86 v12" stroke="#e4e8e2" stroke-width="2.6"/><path d="M268,84 v16" stroke="#e4e8e2" stroke-width="1"/></g>
      <g id="c-hp-def" display="none" stroke="#e4e8e2" stroke-width="1.6" stroke-linecap="round"><path d="M255,84 v16 M248,88 l14,8 M248,96 l14,-8"/><path d="M252,85 l3,2 l3,-2 M252,99 l3,-2 l3,2" fill="none" stroke-width="1.2"/></g></g>
    <g class="ic" id="c-bh"><rect x="280" y="82" width="32" height="20" rx="2" class="lf"/><path d="M299,84 l-8,9 h5 l-3,8 l9,-10 h-5 l3,-7 z" fill="#e4e8e2"/></g>
    <g class="ic off" id="c-buf"><rect x="320" y="82" width="32" height="20" rx="2" class="lf"/></g>

    <!-- 13: huidige kamer- en vattemperatuur -->
    <path d="M154,128 l9,-8 l9,8 v10 h-18 z" fill="none" stroke-width="1.6"/><path d="M163,127 v6" stroke-width="2"/>
    <text class="lt" id="c-room" x="178" y="139" font-size="17"></text>
    <path d="M258,121 h14 v15 a7,3 0 0 1 -14,0 z" class="lf"/>
    <text class="lt" id="c-tank" x="278" y="139" font-size="17"></text>

    <!-- 4: doeltemperatuur; bij Curve de stooklijn als symbool -->
    <path d="M156,168 l5,-8 l5,8 z M156,174 l5,8 l5,-8 z" class="lf"/>
    <g id="c-curveic"><path d="M150,212 h6 l14,-12 h6" fill="none" stroke-width="2.4"/><path d="M150,214 h26" stroke-width="1.2"/></g>
    <text class="lt big" id="c-big" x="300" y="222" text-anchor="end"></text>
    <text class="lt" x="304" y="186" font-size="18">°</text><text class="lt" x="314" y="220" font-size="30">C</text>
    <text class="lt" id="c-bigsub" x="190" y="234" font-size="8"></text>

    <!-- functietoetsen in het scherm -->
    <rect x="44" y="240" width="72" height="22" rx="3" class="lf"/><text x="80" y="256" font-size="11" text-anchor="middle" fill="#e4e8e2">Z1⇄Z2</text>
    <rect x="122" y="240" width="74" height="22" rx="3" class="lf"/><path d="M150,251 h18" stroke="#e4e8e2" stroke-width="2.4"/>
    <rect x="202" y="240" width="74" height="22" rx="3" class="lf"/><path d="M230,251 h18 M239,242 v18" stroke="#e4e8e2" stroke-width="2.4"/>
    <rect x="282" y="240" width="74" height="22" rx="3" class="lf"/><rect x="311" y="244" width="11" height="13" fill="none" stroke="#e4e8e2" stroke-width="1.4"/><path d="M317,253 l6,-5" stroke="#e4e8e2" stroke-width="1.6"/>
  </g>
  <!-- fysieke toetsen -->
  <g class="ckeys">
    <rect x="44" y="276" width="72" height="16" rx="3"/><rect x="122" y="276" width="74" height="16" rx="3"/>
    <rect x="202" y="276" width="74" height="16" rx="3"/><rect x="282" y="276" width="74" height="16" rx="3"/>
    <text x="80" y="288">F1</text><text x="159" y="288">F2</text><text x="239" y="288">F3</text><text x="319" y="288">F4</text>
    <circle cx="70" cy="318" r="13"/><circle cx="112" cy="318" r="13"/><circle cx="154" cy="318" r="13"/>
    <path d="M64,313 h12 M64,318 h12 M64,323 h12" class="ckg"/>
    <path d="M118,314 a7,7 0 1 1 -7,-3 m0,0 l-2,-3 m2,3 l-3,2" class="ckg"/>
    <path d="M147,318 l5,5 l9,-10" class="ckg"/>
    <circle cx="322" cy="316" r="20"/><path d="M322,307 v8 M315,311 a10,10 0 1 0 14,0" class="ckg"/>
    <rect id="c-led" x="272" y="314" width="14" height="5" rx="2.5"/>
  </g>
</svg>`;
}

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
          <span><i style="border-color:var(--dhw)"></i>warm tapwater</span>
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
      <p class="note">De Asgard leest de waarden rechtstreeks uit de FTC6 en geeft ze binnen enkele seconden door, net als de kWh-meters in de meterkast. Alleen de dagtotalen van energie en COP werkt de FTC6 met vertraging bij.</p>
    </div>
    <section class="flow" aria-label="Zo loopt de warmte">
      <div><span class="n">1</span><p><b>Buitenunit</b> haalt warmte uit de buitenlucht. De compressor pompt die warmte op naar een hogere temperatuur in het koudemiddel.</p></div>
      <div><span class="n">2</span><p><b>Platenwisselaar</b> in de cilinderunit: het hete koudemiddel condenseert en geeft zijn warmte af aan het water. Water en koudemiddel raken elkaar nooit.</p></div>
      <div><span class="n">3</span><p><b>Pomp 1</b> stuurt het warme water via de booster heater langs THW1 naar de <b>3-wegklep</b>.</p></div>
      <div><span class="n">4</span><p>De klep kiest: óf naar de <b>platenwisselaar voor tapwater</b> (16), waar de sanitaire pomp het water uit het vat langs pompt, óf naar de <b>verdelers</b> van de vloerverwarming. Nooit beide tegelijk; tapwater gaat voor.</p></div>
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
  const st = { open: {}, sel: null, selKey: null, sig: "", measured: { out: null, in: null, src: null }, midnight: null, timers: [], tankHist: [] };
  const S = id => (id ? host._hass.states[id] : undefined);
  const ok = s => s && s.state !== "unavailable" && s.state !== "unknown";
  const num = id => { const s = S(id); if (!ok(s)) return null; const v = parseFloat(s.state); return isFinite(v) ? v : null; };
  const bin = id => { const s = S(id); return ok(s) ? s.state === "on" : null; };
  const txt = id => { const s = S(id); return ok(s) ? s.state : null; };
  const watt = id => { const v = num(id); if (v == null) return null; const u = S(id).attributes.unit_of_measurement; return u === "kW" ? v * 1000 : v; };
  const kwh = id => { const v = num(id); if (v == null) return null; const u = S(id).attributes.unit_of_measurement; return u === "Wh" ? v / 1000 : u === "MWh" ? v * 1000 : v; };

  // gemeten tegen ingesteld: een indicatie, de thermostaat zelf is niet uit te lezen
  const vsSet = (v, sp) => { const d = v.t - sp;
    const pos = Math.abs(d) < 0.05 ? "Op de ingestelde waarde" : `${fmt(Math.abs(d), 1)} °C ${d < 0 ? "onder" : "boven"} de ingestelde waarde`;
    return v.heat == null ? pos + "." : `${pos}: de kraan staat waarschijnlijk ${v.heat ? "open en de kamer vraagt warmte" : "dicht"}.`; };
  // per verdieping per lus: stroomt er water door (kraan open, of geen kraan)?
  const loopsOpen = X => R.floors.map((f, fi) => {
    const roomOpen = j => X.rooms[fi]?.[j]?.heat ?? true;
    const main = !f.main || !f.kamers.length || f.kamers.some((_, j) => roomOpen(j));
    return f.loops.map(l => main && (!l.act || f.main || l.ctl == null || roomOpen(l.ctl)));
  });

  /* entiteitenlijst */
  const byKey = {};
  const rooms = R.floors.flatMap((f, fi) => f.kamers.map((r, j) => ({ k: `room_${fi}_${j}`, n: r.naam, c: "tstat",
    x: "Temperatuur van de slimme meter naast de kamerthermostaat (Möhlenhoff). De thermostaat zelf is niet slim en niet zichtbaar in Home Assistant; de ingestelde temperatuur komt uit Configureren en staat in het display-icoon in het schema.",
    now: X => { const v = X.rooms[fi]?.[j]; return v?.t == null ? "" : `${f.naam.charAt(0) + f.naam.slice(1).toLowerCase()}: gemeten ${fmt(v.t, 1)} °C` + (r.sp == null ? "." : `, ingesteld ${fmt(r.sp, 1)} °C. ` + vsSet(v, r.sp)); } })));
  const groups = rooms.length ? [...G.slice(0, 5), { title: "Kamertemperaturen", note: "Gemeten door de slimme meters naast de kamerthermostaten; de ingestelde waarde staat in het schema in het display-icoon.", items: rooms }, ...G.slice(5)] : G;
  $("#groups").innerHTML = groups.map(g => `<div class="group"><h3>${g.title}</h3><p class="gnote">${g.note}</p><ul class="ents">` +
    g.items.map(e => { byKey[e.k] = e;
      return `<li><button type="button" data-e="${e.k}"><span class="ename">${e.n}</span><span class="evalue" data-v="${e.k}"></span><span class="eid" data-id="${e.k}"></span></button></li>`; }).join("") +
    `</ul></div>`).join("");

  /* live waarden verzamelen */
  function collect() {
    const X = {};
    for (const k of ["buiten", "freq", "cond", "th2", "aanvoer", "retour", "flow", "pump_speed", "tank", "tank2", "dhw_drop", "leg_temp",
                     "dhw_prod", "dhw_cons", "dhw_cop", "heat_prod", "heat_cons", "heat_cop", "wifi", "mixing", "z1_feed", "z1_return"]) X[k] = num(R[k]);
    for (const k of ["pump1", "klep", "bh1", "imm", "pump2", "pump4", "defrost"]) X[k] = bin(R[k]);
    X.compBin = bin(R.comp);
    X.op = txt(R.opstate); X.opk = opKind(X.op); X.src = txt(R.heatsrc);
    X.fault = txt(R.fault); X.faultOn = X.fault != null && !/^(no error|no fault|normal|0+)$/i.test(X.fault.trim());
    X.refErr = txt(R.ref_err); X.refErrOn = X.refErr != null && !/^(normal|unknown)$/i.test(X.refErr.trim());
    // Zonder binaire sensoren: pomp uit het debiet, klep uit de bedrijfsmodus, booster en dompelaar uit de warmtebron.
    if (X.pump1 == null) X.pump1 = X.flow != null ? X.flow > 0.5 : X.pump_speed != null ? X.pump_speed > 0 : null;
    if (X.bh1 == null && X.src != null) X.bh1 = /booster/i.test(X.src);
    if (X.imm == null && X.src != null) X.imm = /immersion/i.test(X.src);
    X.dhw = X.klep != null ? (cfg.klep_aan_is_tapwater ? X.klep : !X.klep) : X.opk === "dhw" || X.opk === "leg";
    // sanitaire pomp 18 = uitgang pomp 4 van de FTC6; zonder die entiteit: draait mee met tapwater opwarmen
    X.san = X.pump4 != null ? X.pump4 : !!X.pump1 && X.dhw;
    X.dT = X.aanvoer != null && X.retour != null ? X.aanvoer - X.retour : null;
    X.target = num(R.dhw_sp);
    X.whMode = txt(R.dhw_mode);
    X.hyst = X.dhw_drop > 0 ? X.dhw_drop : 8;
    const om = S(R.opmode); X.opmode = ok(om) ? om.state : null;
    X.z1sp = num(R.z1_sp);
    X.pOut = watt(R.p_out); X.pIn = watt(R.p_in);
    X.eOutTot = kwh(R.e_out); X.eInTot = kwh(R.e_in);
    X.tapFlow = num(R.tap);
    // afkoeling van het vat in het laatste venster, uit de bijgehouden THW5B-historie
    const ts = S(R.tank), th = st.tankHist;
    if (ok(ts)) { const t = Date.parse(ts.last_changed) || Date.now(), v = parseFloat(ts.state);
      if (isFinite(v) && (!th.length || th[th.length - 1].t !== t)) th.push({ t, v }); }
    const from = Date.now() - TAP_WIN;
    while (th.length > 1 && th[1].t <= from) th.shift();               // houd één punt vóór het venster als beginstand
    X.tankDrop = th.length && X.tank != null ? Math.max(...th.map(p => p.v)) - X.tank : 0;
    X.hotDraw = X.tapFlow > 0 && X.tankDrop >= TAP_DROP;
    X.curveTarget = X.buiten == null ? null : curveAt(CURVE, X.buiten);
    X.compRun = X.freq > 0 || !!X.compBin || X.pOut > P_RUN;
    X.compByMeter = X.compRun && !(X.freq > 0) && !X.compBin;         // alleen de kWh-meter ziet hem draaien
    const running = X.compRun || !!X.pump1;
    X.leg = X.opk === "leg" || (X.dhw && !!X.bh1);
    X.mode = !running ? "rust" : X.dhw ? (X.leg ? "legionella" : "tapwater") : "verwarming";
    // warmte nu (kW) en de COP van dit moment met de gemeten stroom
    const pe = watt(R.p_est), ph = watt(R.p_heat);
    X.heatNow = pe != null ? pe : ph;
    const pel = (X.pOut || 0) + (X.pIn || 0);
    X.copNow = X.compRun && X.heatNow > 0 && pel > P_RUN ? X.heatNow / pel : null;
    if (X.copNow != null && X.copNow > 8) X.copNow = null;
    // kamers
    // heat: de kraan van de kamer staat open. Bij een climate-entiteit uit hvac_action, anders afgeleid (zie ROOM_HYST);
    // null = onbekend (geen meting of geen ingestelde waarde)
    X.rooms = R.floors.map((f, fi) => f.kamers.map((r, j) => {
      const s = S(r.ent); if (!ok(s)) return null;
      const climate = r.ent.startsWith("climate."), a = s.attributes;
      const t = climate ? parseFloat(a.current_temperature) : parseFloat(s.state);
      let heat = null;
      if (climate) heat = a.hvac_action === "heating";
      else if (isFinite(t) && r.sp != null) {
        const d = t - r.sp, key = `${fi}-${j}`;
        heat = d <= -ROOM_HYST ? true : d >= ROOM_HYST ? false : st.open[key] ?? d < 0;
        st.open[key] = heat;
      }
      return { t: isFinite(t) ? t : null, sp: parseFloat(a.temperature), heat, climate };
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
    // De FTC6 werkt de dagtotalen met vertraging bij. Is geen ervan sinds middernacht veranderd, dan horen ze bij een
    // eerdere dag en zijn ze niet te vergelijken met wat de kWh-meters vandaag gemeten hebben.
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const daily = ["heat_prod", "heat_cons", "dhw_prod", "dhw_cons"].map(k => S(R[k])).filter(ok);
    X.dailySince = daily.length ? Math.max(...daily.map(s => Date.parse(s.last_changed) || 0)) : null;
    X.dailyFresh = X.dailySince != null && X.dailySince >= mid.getTime();
    const cop = X.dailyFresh && X.prodTot != null && X.mTot > 0.05 ? X.prodTot / X.mTot : null;
    X.copMeas = cop != null && cop <= 8 ? cop : null;   // hoger kan fysiek niet: dan lopen de FTC6 en de meters uit de pas
    X.copMel = X.prodTot != null && X.consTot > 0.2 ? X.prodTot / X.consTot : null;
    return X;
  }

  const unitOf = k => { const id = R[k]; const s = S(id); return s?.attributes?.unit_of_measurement || ""; };
  function valueHtml(e, X) {
    if (e.dis) return `<span class="pill unused">n.v.t.</span>`;
    const id = R[e.k], s = S(id);
    if (!id && e.der && e.der(X) != null) return `<span class="pill${e.der(X) ? " on" : ""}">${e.der(X) ? "aan" : "uit"}</span> <span class="unit">afgeleid</span>`;
    if (!id) return e.unused || e.svc ? `<span class="pill unused">uitgeschakeld</span>` : `<span class="pill missing">niet gevonden</span>`;
    if (!ok(s)) return `<span class="pill missing">${s ? s.state : "ontbreekt"}</span>`;
    if (id.startsWith("binary_sensor.")) return `<span class="pill${s.state === "on" ? " on" : ""}${e.unused ? " unused" : ""}">${s.state === "on" ? "aan" : "uit"}</span>`;
    const v = Number(s.state);                      // tekst (ook "2025.1.0") blijft tekst
    if (s.state === "" || !isFinite(v)) return esc(s.state);
    const u = unitOf(e.k);
    if (u === "s" && v >= 60) return esc(duur(v));
    const d = /kWh|COP/.test(u) || /cop|prod|cons/.test(e.k) ? 2 : u === "°C" || /\/min/i.test(u) ? 1 : u === "W" ? 0 : (Math.abs(v) < 10 && v % 1 ? 2 : 0);
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
      "run-refr": X.compRun, "run-fan": X.compRun && !X.defrost, "defrost": !!X.defrost, "run-pump1": !!X.pump1,
      "run-prim": !!X.pump1, "run-heat": !!X.pump1 && !X.dhw, "run-dhw": !!X.pump1 && X.dhw, "run-san": X.san,
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
    setT("c-txt", X.curveTarget == null ? "" : `buiten ${fmt(X.buiten, 1)} °C → doel aanvoer ${fmt(X.curveTarget, 1)} °C`
      + (X.z1sp != null ? ` · FTC6 ${fmt(X.z1sp, 1)} °C` : ""), curveOn ? "" : "off");
    setT("c-txt2", !curveOn ? `Niet actief: de regeling staat op ${X.opmode}.`
      : heatNow ? `aanvoer nu ${fmt(X.aanvoer, 1)} °C (${X.aanvoer - X.curveTarget >= 0 ? "+" : ""}${fmt(X.aanvoer - X.curveTarget, 1)} t.o.v. de lijn)`
      : "rode stip: werkelijke aanvoer zodra de vloerverwarming draait");
    svg.style.setProperty("--sp-eout", clamp(2.4 - (X.pOut || 0) / 500, 0.4, 2.4).toFixed(2) + "s");
    svg.style.setProperty("--sp-ein", clamp(2.4 - (X.pIn || 0) / 1000, 0.4, 2.4).toFixed(2) + "s");
    $("#port-heat").classList.toggle("on", !!X.pump1 && !X.dhw);
    $("#port-dhw").classList.toggle("on", !!X.pump1 && X.dhw);
    $("#tankfill").style.opacity = X.tank == null ? 0.05 : clamp(0.1 + (X.tank - 15) / 45 * 0.25, 0.1, 0.35).toFixed(2);

    // schema: waarden
    setT("v-buiten", deg(X.buiten));
    setT("v-freq", X.freq > 0 ? fmt(X.freq, 0) + " Hz" : X.compByMeter ? "draait" : X.freq == null ? "–" : "0 Hz", X.compRun ? "" : "off");
    setT("v-cond", deg(X.cond), X.compRun ? "" : "off");
    setT("v-th2", deg(X.th2), X.compRun ? "" : "off");
    setT("v-heat", !(X.heatNow > 0) ? "" : `${fmt(X.heatNow / 1000, 1)} kW warmte`, X.heatNow > 0 ? "" : "off");
    const sv = (k, d = 0, u = "") => { const v = num(R[k]); return v == null ? null : fmt(v, d) + u; };
    const line = (...a) => a.filter(x => x[1] != null).map(x => x[0] + " " + x[1]).join(" · ");
    setT("v-out1", line(["persgas", sv("discharge", 0, " °C")], ["zuiggas", sv("ou_suction", 1, " °C")]), X.compRun ? "" : "off");
    setT("v-out2", line(["ventilator", sv("fan", 0, " rpm")], ["starts", sv("starts")]), X.compRun ? "" : "off");
    setT("v-out3", line(["pomp 1 stand", sv("pump_speed")], ["", sv("pump_w", 0, " W")]).replace(" ·  ", " · "), X.pump1 ? "" : "off");
    setT("v-in1", X.vraagSrc === "signaal" ? `IN1 warmtevraag: ${X.vraag ? "aan" : "uit"}` : "", X.vraag ? "hotv" : "off");
    setT("v-defrost", X.defrost ? "ontdooien" : "", "warnv");
    setT("v-bh1", onoff(X.bh1), X.bh1 ? "hotv" : "off");
    setT("v-pump1", onoff(X.pump1), X.pump1 ? "" : "off");
    setT("v-aanvoer", deg(X.aanvoer), X.pump1 ? "" : "off");
    setT("v-retour", deg(X.retour), X.pump1 ? "" : "off");
    setT("v-dt", X.pump1 && X.dT != null ? "ΔT " + fmt(X.dT, 1) : "");
    setT("v-flow", X.flow == null ? "" : fmt(X.flow, 1) + " L/min", !X.pump1 ? "off" : X.flow < 7.2 ? "warnv" : "");
    setT("v-klep", X.klep == null && X.opk == null ? "–" : X.dhw ? "→ vat" : "→ vloer", X.pump1 ? "" : "off");
    setT("v-tank", deg(X.tank));
    setT("v-tank2", fixedNo(X.tank2) ? "geen voeler" : deg(X.tank2), fixedNo(X.tank2) || X.tank2 == null ? "off" : "");
    const lpm = v => fmt(v, v < 10 ? 1 : 0) + " " + (unitOf("tap") || "l/min");
    setT("v-tap", !X.tapFlow ? "" : lpm(X.tapFlow), X.hotDraw ? "" : "off");
    setT("v-tap2", !X.tapFlow ? "" : X.hotDraw ? "via het vat" : "niet via het vat", X.hotDraw ? "" : "off");
    setT("v-target", X.target == null ? "" : `doel ${fmt(X.target, 0)} °C${X.whMode ? " · " + X.whMode : ""}`);
    setT("v-wifi", X.wifi == null ? "–" : fmt(X.wifi, 0) + " dBm", X.wifi != null && X.wifi < -75 ? "warnv" : "");
    setT("v-z1mix", `${deg(X.z1_feed)} / ${deg(X.z1_return)}`, "off");
    setT("v-mixing", deg(X.mixing), "off");
    setT("v-pump2", onoff(X.pump2), "off");
    setT("v-pout", X.pOut == null ? "–" : fmt(X.pOut, X.pOut < 100 ? 1 : 0) + " W", X.pOut > P_IDLE ? "" : "off");
    setT("v-pin", X.pIn == null ? "–" : fmt(X.pIn, X.pIn < 100 ? 1 : 0) + " W", X.pIn > P_IDLE ? (X.pIn > 1500 ? "hotv" : "") : "off");
    setT("v-eout", X.mOut == null ? "" : fmt(X.mOut, 2) + " kWh");
    setT("v-ein", X.mIn == null ? "" : fmt(X.mIn, 2) + " kWh");
    setT("v-meter1", X.mTot == null ? "Geen verbruik van vandaag beschikbaar (geen energieteller of statistiek gevonden)."
      : `Vandaag gemeten: ${fmt(X.mTot, 2)} kWh${X.consTot != null && X.dailyFresh ? ` · de FTC6 schat ${fmt(X.consTot, 2)} kWh` : ""}${st.measured.src === "statistiek" ? " (uit vermogensstatistiek)" : ""}.`);
    setT("v-meter2", X.copMeas != null ? `Warmte vandaag ${fmt(X.prodTot, 2)} kWh ÷ gemeten stroom = COP ${fmt(X.copMeas, 2)} (gemeten).`
      : X.consTot != null && !X.dailyFresh ? `De dagwaarden van de FTC6 zijn van ${dagTijd(X.dailySince)}: nog geen gemeten COP.` : "");
    // stroming door de vloer: alleen door lussen waarvan de kraan open staat; onbekend telt als open
    const loopOpen = loopsOpen(X), floorOpen = loopOpen.map(o => o.some(Boolean));
    $$(".ff").forEach(el => el.classList.toggle("dicht", !el.dataset.ff.split(" ").some(i => floorOpen[+i])));
    R.floors.forEach((f, fi) => {
      const open = loopOpen[fi];
      f.loops.forEach((l, i) => $$(`.lus[data-l="${fi}-${i}"]`).forEach(el => el.classList.toggle("dicht", !open[i])));
      $$(`.kraan[data-k^="${fi}-"]`).forEach(el => { const k = el.dataset.k.split("-")[1];
        el.classList.toggle("open", k === "m" ? open.some(Boolean) : !!open[+k]); });
      const anyHeat = (X.rooms[fi] || []).some(r => r && r.heat);
      $$(`.regel[data-floor="${fi}"]`).forEach(el => el.classList.toggle("heat", anyHeat));
      f.kamers.forEach((r, j) => {
        const v = X.rooms[fi]?.[j], dot = $(`#room-${fi}-${j}-dot`);
        if (dot) dot.classList.toggle("heat", !!v?.heat);
        const tx = $(`#room-${fi}-${j}`);
        if (tx) tx.textContent = v?.t == null ? "–" : fmt(v.t, 1) + " °C" + (isFinite(v.sp) ? ` → ${fmt(v.sp, 1)}` : "");
      });
    });

    // hoofdscherm bediening
    {
      const now = new Date(), cl = (sel, on) => { const el = $(sel); if (el) el.classList.toggle("on", !!on); };
      setT("c-date", now.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }).replace(".", ""));
      setT("c-time", now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
      const dhwOn = X.mode === "tapwater" || X.mode === "legionella", heatOn = X.mode === "verwarming";
      cl("#c-dhwbox", dhwOn); cl("#c-heatbox", heatOn);
      cl("#c-dhw-run", dhwOn); cl("#c-dhw-sb", !dhwOn); cl("#c-heat-run", heatOn); cl("#c-heat-sb", !heatOn);
      $("#c-leg")?.classList.toggle("off", X.mode !== "legionella");
      $("#c-hp")?.classList.toggle("off", !X.compRun && !X.defrost);
      $("#c-hp-run")?.setAttribute("display", X.defrost ? "none" : "inline");
      $("#c-hp-def")?.setAttribute("display", X.defrost ? "inline" : "none");
      $("#c-bh")?.classList.toggle("off", !(X.bh1 || X.imm));
      $("#c-eco")?.setAttribute("opacity", /eco/i.test(X.whMode || "") ? 1 : 0.08);
      $("#c-hol")?.classList.toggle("off", !bin(R.holiday));
      // kamertemperatuur: de voeler in het bedieningspaneel (Zone 1 Room Temp), anders de woonkamer
      const zr = num(R.z1_room), wk = R.floors.flatMap((f, fi) => f.kamers.map((k, j) => [k.naam, X.rooms[fi]?.[j]?.t])).find(([n, t]) => /woonkamer/i.test(n) && t != null);
      setT("c-room", zr != null ? fmt(zr, 0) + "°C" : wk ? fmt(wk[1], 0) + "°C" : "–");
      setT("c-tank", X.tank == null ? "–" : fmt(X.tank, 0) + "°C");
      const curveOn = X.opmode == null || /curve/i.test(X.opmode);
      $("#c-curveic")?.setAttribute("opacity", curveOn ? 1 : 0.08);
      const big = X.z1sp ?? (curveOn ? X.curveTarget : null);
      setT("c-big", big == null ? "–" : fmt(big, 0));
      setT("c-bigsub", big == null ? "" : X.z1sp != null ? "doel aanvoer (FTC6)" : "doel aanvoer (stooklijn)");
      cl("#c-led", X.buiten != null);
    }

    // kop
    const ML = { rust: X.opk === "frost" ? "vorstbeveiliging" : "in rust", verwarming: "ruimteverwarming", tapwater: "tapwater",
                 legionella: X.opk === "leg" ? "legionella-run" : "tapwater + booster (legionella?)" };
    const mc = $("#mode"); mc.textContent = ML[X.mode]; mc.className = "chip " + X.mode;
    let last = 0;
    for (const k of CORE_KEYS) { const s = S(R[k]); if (ok(s)) last = Math.max(last, Date.parse(s.last_reported || s.last_updated) || 0); }
    $("#upd").textContent = last ? "Asgard " + hhmm(last) : "";
    st.last = last;

    // kerncijfers
    const kpi = (c, k, v, u, s) => `<button class="kpi" data-c="${c}"><span class="k">${k}</span><span class="v">${v}${u ? ` <small>${u}</small>` : ""}</span><span class="s">${s || "&nbsp;"}</span></button>`;
    $("#kpis").innerHTML = [
      kpi("th7", "Buiten", fmt(X.buiten, 1), "°C", (X.opmode ? "regeling: " + esc(opShort(X.opmode)) : "")
          + (X.z1sp != null ? ` · doel aanvoer ${fmt(X.z1sp, 0)} °C` : X.curveTarget != null && (X.opmode == null || /curve/i.test(X.opmode)) ? ` · doel aanvoer ${fmt(X.curveTarget, 0)} °C` : "")),
      kpi("comp", "Compressor", X.freq > 0 ? fmt(X.freq, 0) : X.compByMeter ? "aan" : X.freq == null ? "–" : "0", X.compByMeter ? "" : "Hz",
          X.defrost ? "ontdooien" : X.freq > 0 ? "draait" : X.compByMeter ? "volgens de kWh-meter" : "staat stil"),
      kpi("thw1", "Aanvoer / retour", fmt(X.aanvoer, 1), `/ ${fmt(X.retour, 1)} °C`, X.pump1 && X.dT != null ? "ΔT " + fmt(X.dT, 1) + " °C" : "pomp staat stil"),
      kpi("thw5", "Tapwater", fmt(X.tank, 1), "°C", (X.tank2 != null && !fixedNo(X.tank2) ? `boven ${fmt(X.tank2, 1)} · ` : "")
          + (X.target != null ? "doel " + fmt(X.target, 0) + " °C" : "")),
      kpi("meterOut", "Vermogen nu", X.pOut == null && X.pIn == null ? "–" : fmt((X.pOut || 0) + (X.pIn || 0), 0), "W",
          X.pOut != null || X.pIn != null ? `buiten ${fmt(X.pOut, 0)} · binnen ${fmt(X.pIn, 0)}` : ""),
      kpi("hex", "Warmte nu", X.heatNow == null ? "–" : fmt(X.heatNow / 1000, 2), "kW",
          X.copNow != null ? `COP nu ${fmt(X.copNow, 1)} met gemeten stroom` : X.compRun ? "" : "compressor staat stil"),
      kpi("ftc", X.dailyFresh || X.dailySince == null ? "Warmte vandaag" : "Warmte (vorige dag)", fmt(X.prodTot, 2), "kWh",
          (X.heat_prod != null ? `vloer ${fmt(X.heat_prod, 2)} · tap ${fmt(X.dhw_prod, 2)}` : "") + (X.dailySince && !X.dailyFresh ? ` · stand ${dagTijd(X.dailySince)}` : "")),
      // COP per functie uit de COP-sensoren in Home Assistant; 0 betekent: te weinig gedraaid om te berekenen
      (R.heat_cop || R.dhw_cop)
        ? kpi("ftc", "COP vloer / tapwater", `${X.heat_cop ? fmt(X.heat_cop, 1) : "–"} / ${X.dhw_cop ? fmt(X.dhw_cop, 1) : "–"}`, "",
            X.copMeas != null ? `totaal met gemeten stroom ${fmt(X.copMeas, 2)}` : X.dailyFresh || X.dailySince == null ? "vandaag" : `dagwaarde ${dagTijd(X.dailySince)}`)
        : kpi("meterOut", X.dailyFresh || X.dailySince == null ? "COP vandaag" : "COP (vorige dag)", fmt(X.copMeas ?? X.copMel, 2), "",
            X.copMeas != null ? "met gemeten stroom" : X.copMel != null ? (X.dailyFresh ? "schatting FTC6" : "schatting FTC6, laatste dagwaarde") : "nog te weinig gedraaid"),
    ].join("");

    // entiteitenlijst
    groups.forEach(g => g.items.forEach(e => {
      const v = root.querySelector(`[data-v="${e.k}"]`); if (v) v.innerHTML = valueHtml(e, X);
      const i = root.querySelector(`[data-id="${e.k}"]`); if (i) i.textContent = e.dis ? "komt niet voor in jouw installatie" : e.svc && !R[e.k] ? "servicewaarde uitgeschakeld (levert deze buitenunit niet)" : e.unused && !R[e.k] ? "entiteit niet gevonden of uitgeschakeld"
        : R[e.k] || (e.der && e.der(X) != null ? `geen eigen entiteit · afgeleid uit ${e.derSrc}` : `niet gevonden · override-sleutel "${e.k}"`);
    }));

    renderBanners(X);
    renderNow(X);
    if (st.sel) showComp(st.sel, st.selKey, true); else if (!detail.innerHTML) intro();
  }

  function renderBanners(X) {
    const b = [];
    const core = CORE_KEYS.filter(k => R[k]);
    const down = core.filter(k => !ok(S(R[k]))).length;
    if (!R.freq && !R.aanvoer && !R.tank)
      b.push(["bad", `<b>Geen Asgard-entiteiten gevonden</b> met voorvoegsel <code>${esc(cfg.prefix)}</code>. Pas het voorvoegsel aan via Instellingen → Apparaten &amp; diensten → Ecodan Dashboard → Configureren.`]);
    else if (core.length && down > core.length / 2)
      b.push(["bad", `<b>Asgard niet bereikbaar:</b> ${down} van ${core.length} hoofdwaarden zijn onbeschikbaar. De waarden in het schema zijn niet actueel.`]);
    else if (st.last && Date.now() - st.last > 45 * 60e3 && core.some(k => S(R[k])?.last_reported))
      b.push(["warn", `<b>Geen nieuwe waarden</b> van de Asgard sinds ${hhmm(st.last)}. Controleer de Asgard (wifi, stroom) en de ESPHome-integratie.`]);
    if (X.defrost) b.push(["", `<b>De buitenunit ontdooit.</b> De kringloop draait tijdelijk om: de warmtepomp haalt warmte uit het water om het ijs van de verdamper te smelten en de ventilator staat stil. De aanvoer zakt een paar minuten; daarna gaat hij gewoon verder.`]);
    if (X.faultOn) b.push(["bad", `<b>Storing op de Ecodan: ${esc(X.fault)}.</b> Zie het bedieningspaneel of de servicehandleiding voor de betekenis van de code.`]);
    if (X.refErrOn) b.push(["bad", `<b>Koudemiddelcircuit meldt: ${esc(X.refErr)}.</b>`]);
    if (X.opmode != null && !/curve/i.test(X.opmode))
      b.push(["warn", `<b>De regeling staat op ${esc(X.opmode)}</b> in plaats van Heat Compensation Curve (stooklijn). Daardoor regelt de warmtepomp op ${/room|target/i.test(X.opmode) ? "de kamertemperatuur van het bedieningspaneel in de technische ruimte" : "een vaste aanvoertemperatuur"}.`]);
    if (X.bh1 && !X.dhw)
      b.push(["warn", `<b>Booster heater aan tijdens ruimteverwarming.</b> De warmtepomp redt het alleen niet (vorst of ontdooien). Elke kWh stroom levert hier maar 1 kWh warmte.`]);
    else if (X.mode === "legionella")
      b.push(["", X.opk === "leg" ? `<b>Legionella-run:</b> het vat wordt naar ${X.leg_temp != null ? fmt(X.leg_temp, 0) : "±60"} °C gebracht${X.bh1 ? "; de booster heater helpt mee" : ""}.`
        : `<b>Legionella-run (waarschijnlijk):</b> de booster heater helpt het vat naar ±60 °C te brengen.`]);
    if (X.imm) b.push(["warn", `<b>Immersion heater meldt aan.</b> Bij de EHST20D-VM2D zit normaal geen dompelaar.`]);
    $("#banners").innerHTML = b.map(([c, t]) => `<div class="banner ${c}">${t}</div>`).join("");
  }

  function renderNow(X) {
    const li = [];
    const hz = X.freq > 0 ? fmt(X.freq, 0) + " Hz" : X.compByMeter ? "aan (volgens de kWh-meter)" : X.freq == null ? "–" : "0 Hz";
    if (X.compByMeter) li.push(`<b>De compressor draait</b> volgens de kWh-meter van de buitenunit (${fmt(X.pOut, 0)} W), maar de Asgard meldt 0 Hz.`);
    if (X.defrost) li.push(`<b>De buitenunit ontdooit.</b> De warmtepomp haalt even warmte uit het water om het ijs van de verdamper te smelten; de aanvoer zakt kort.`);
    if (X.mode === "rust") li.push(`<b>De installatie staat in rust.</b> Compressor ${hz}, pomp 1 uit${X.bh1 ? "" : ", geen elektrische bijverwarming"}.`);
    else if (X.mode === "verwarming") li.push(`<b>Ruimteverwarming.</b> Compressor ${hz}, aanvoer ${deg(X.aanvoer)}, retour ${deg(X.retour)}${X.dT != null ? `, ΔT ${fmt(X.dT, 1)} °C` : ""}${X.flow != null ? `, ${fmt(X.flow, 1)} L/min` : ""}. Het water gaat naar de verdelers.`);
    else li.push(`<b>Tapwater wordt opgewarmd.</b> Vat ${deg(X.tank)}${X.target != null ? `, doel ${fmt(X.target, 0)} °C` : ""}; aanvoer ${deg(X.aanvoer)}. De vloeren krijgen nu geen warmte: tapwater gaat voor.${X.bh1 ? " De booster heater helpt mee." : ""}`);
    if (X.curveTarget != null && (X.opmode == null || /curve/i.test(X.opmode)))
      li.push(`<b>Stooklijn:</b> bij ${deg(X.buiten)} buiten hoort een aanvoer van ${deg(X.curveTarget)}${X.z1sp != null ? ` (de FTC6 mikt op ${deg(X.z1sp)})` : ""}${X.mode === "verwarming" && X.aanvoer != null ? `; nu ${deg(X.aanvoer)}` : ""}.`);
    if (X.heatNow > 0 && X.compRun) li.push(`<b>Warmte nu: ${fmt(X.heatNow / 1000, 2)} kW</b>${X.copNow != null ? ` bij ${fmt((X.pOut || 0) + (X.pIn || 0), 0)} W stroom: COP ${fmt(X.copNow, 1)}` : ""}.`);
    if (X.freq > 0 && !X.pump1) li.push(`De compressor draait maar pomp 1 staat (nog) uit: meestal een opstart- of ontdooimoment.`);
    if (X.pump1 && !X.freq) li.push(`Pomp 1 draait zonder compressor: nadraaien na een run, of ontdooien.`);
    if (X.vraagSrc !== "afgeleid")
      li.push(X.vraag ? `<b>Er is warmtevraag</b> vanuit ${X.vraagSrc === "signaal" ? "het warmtevraagsignaal" : "minstens één thermostaat"}.` : `Geen van de thermostaten vraagt nu warmte.`);
    if (X.pump1 && !X.dhw) {
      const lo = loopsOpen(X), cap = s => s.charAt(0) + s.slice(1).toLowerCase();
      li.push(`<b>Stroming door de vloer:</b> ` + R.floors.map((f, fi) => {
        const n = lo[fi].filter(Boolean).length, names = f.loops.filter((l, i) => lo[fi][i] && l.naam).map(l => l.naam.toLowerCase());
        return `${esc(cap(f.naam))} ${!n ? "dicht" : n === f.loops.length ? "alle lussen" : names.length === n ? esc(names.join(", ")) : `${n} van ${f.loops.length} lussen`}`;
      }).join(" · ") + ".");
    }
    const kamers = R.floors.flatMap((f, fi) => f.kamers.map((r, j) => [r.naam, X.rooms[fi]?.[j]?.t, r.sp])).filter(([, t]) => t != null);
    if (kamers.length) li.push(`<b>Kamers (gemeten / ingesteld):</b> ${kamers.map(([n, t, sp]) => `${esc(n)} ${fmt(t, 1)}${sp == null ? "" : " / " + fmt(sp, 1)} °C`).join(" · ")}.`);
    if (X.hotDraw) li.push(`<b>Er wordt warm water getapt.</b> De watermeter meet ${fmt(X.tapFlow, 1)} ${esc(unitOf("tap"))} en het vat is ${fmt(X.tankDrop, 1)} °C afgekoeld: er stroomt koud leidingwater het vat in.`);
    else if (X.tapFlow > 0) li.push(`De watermeter meet ${fmt(X.tapFlow, 1)} ${esc(unitOf("tap"))}, maar het vat koelt niet af: waarschijnlijk toilet of een koude kraan, dus niet via de Ecodan.`);
    if (X.tank != null && X.target != null && X.mode !== "tapwater" && X.mode !== "legionella") {
      const d = X.target - X.tank;
      li.push(d <= 0 ? `<b>Het vat is op temperatuur</b> (${deg(X.tank)}).` : `<b>Vat ${deg(X.tank)}</b>, ${fmt(d, 1)} °C onder het doel. ${d <= 8 ? "Binnen de marge (hysterese), dus de warmtepomp start nog niet." : "Tapwater-opwarming volgt binnenkort."}`);
    }
    const dag = X.dailyFresh || X.dailySince == null ? "vandaag" : `(dagwaarde van de FTC6 van ${dagTijd(X.dailySince)})`;
    if (X.dhw_prod != null) li.push(`<b>Tapwater ${dag}:</b> ${fmt(X.dhw_cons, 2)} kWh stroom in, ${fmt(X.dhw_prod, 2)} kWh warmte uit${X.dhw_cop ? `: COP ${fmt(X.dhw_cop, 2)}` : R.dhw_cop ? "" : X.dhw_cons > 0.2 ? `: COP ${fmt(X.dhw_prod / X.dhw_cons, 2)}` : ""}.`);
    if (X.heat_prod != null) li.push(`<b>Vloerverwarming ${dag}:</b> ${fmt(X.heat_cons, 2)} kWh stroom in, ${fmt(X.heat_prod, 2)} kWh warmte uit${X.heat_cop ? `: COP ${fmt(X.heat_cop, 2)}` : !R.heat_cop && X.heat_cons > 0.2 ? `: COP ${fmt(X.heat_prod / X.heat_cons, 2)}` : ": te weinig om een COP te berekenen"}.`);
    if (X.mTot != null) li.push(`<b>Gemeten in de meterkast vandaag:</b> ${fmt(X.mTot, 2)} kWh${X.consTot != null && X.dailyFresh ? ` tegen ${fmt(X.consTot, 2)} kWh volgens de FTC6` : ""}${X.copMeas != null ? `. Echte COP vandaag: <b>${fmt(X.copMeas, 2)}</b>` : ""}.`);
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
    let h = `<div class="kicker">${e ? (e.dis ? "komt niet voor in jouw installatie" : (e.unused || e.svc) && !R[e.k] ? "niet gevonden of uitgeschakeld" : esc(R[e.k] || (e.der ? "afgeleid uit " + e.derSrc : "niet gevonden"))) : esc(d.where)}</div><h2>${e ? e.n : d.name}</h2>`;
    if (e) {
      h += `<p class="muted">Onderdeel: <b style="color:var(--ink)">${d.name}</b> · ${d.where}</p>`;
      h += `<p>${e.x || d.text}</p>`;
      if (e.x) h += `<p class="muted">${d.text}</p>`;
      const nowTxt = e.now ? e.now({ ...X, v: X[e.k] }) : "";
      h += `<div class="now">Nu: <b>${valueHtml(e, X)}</b>${nowTxt ? "<br>" + nowTxt : ""}</div>`;
      if (e.svc && !R[e.k]) h += `<p class="muted">Uitgeschakeld in Home Assistant. Deze servicewaarde levert jouw buitenunit niet; zet dan ook <code>service_codes_enabled</code> van de Asgard uit.</p>`;
      if (!e.dis && !e.unused && !e.svc && !R[e.k]) h += `<p class="muted">${e.der ? `Deze entiteit is niet gevonden; het panel leidt de stand af uit ${e.derSrc}. Staat hij onder een andere naam in Home Assistant, koppel hem dan` : "Niet gevonden. Koppel hem met de hand"} via Configureren → overrides, bijv. <code>{"${e.k}": "${ENT[e.k]?.d || "sensor"}.${esc(cfg.prefix)}_${ENT[e.k]?.s[0] || "…"}"}</code>.</p>`;
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

  /* thema: volgt de optie uit Configureren (standaard: licht/donker van Home Assistant). De zon/maan-knop wisselt
     per apparaat, tot Home Assistant zelf van licht naar donker gaat of andersom; daarna volgt het panel HA weer. */
  const haDark = () => !!host._hass?.themes?.darkMode;
  const storedTheme = () => {
    try {
      const v = JSON.parse(localStorage.getItem("ecodash-theme") || "null");
      if (!v || typeof v !== "object") { localStorage.removeItem("ecodash-theme"); return null; }   // oude, blijvende keuze
      if (v.haDark !== haDark()) { localStorage.removeItem("ecodash-theme"); return null; }          // HA is gewisseld: volg HA
      return v.thema;
    } catch (e) { return null; }
  };
  const applyTheme = () => { const t = storedTheme() || cfg.thema;
    host.classList.toggle("dark", t === "dark" || (t === "auto" && !!host._hass?.themes?.darkMode)); };
  $("#theme").onclick = () => {
    try { localStorage.setItem("ecodash-theme", JSON.stringify({ thema: host.classList.contains("dark") ? "light" : "dark", haDark: haDark() })); } catch (e) {}
    applyTheme(); };
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
  const watched = () => [...Object.keys(ENT), "opmode", "p_out", "p_in", "e_out", "e_in", "tap", "vraag"].map(k => R[k])
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
