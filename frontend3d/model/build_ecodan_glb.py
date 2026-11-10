#!/usr/bin/env python3
"""
Ecodan 3D dashboard v3 – volledig 3D, zonder achtergrond.

Het 2D-dashboard staat rechtop als vooraanzicht: X = dashboard-x, Y = 889 - dashboard-y
(1 px = 1 cm), Z = diepte naar de kijker. Alle onderdelen zijn 3D-objecten op hun
dashboard-positie; leidingen liggen in het vlak Z = 0 en springen bij kruisingen naar voren.

Uitvoer: ecodan.glb, ecodan_3d_card.yaml, ecodan_bindings.json (preview)
Nodig:   numpy, Pillow. Uitvoer voor het Ecodan Dashboard: ecodash-3d.glb en ecodash-3d-labels-licht.png
(dezelfde labeltextuur met donkere tekst, voor het lichte thema).
"""
import io, json, math, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from geo import box, cyl, sphere, tube, quad, rotate, shift, part, hexrgb
import layout as L
import labels as LB

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
FLIP_TEXT_UV = False
MODEL_FILE = f"{OUT}/ecodash-3d.glb"
LIGHT_FILE = f"{OUT}/ecodash-3d-labels-licht.png"
PIPE_R, HOP_Z = 2.6, 9.0
BG = "#161616"
FONT_B = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
FONT_R = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
FONT_M = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

def V(x, y, z=0.0): return (float(x), 889.0 - float(y), float(z))

# ----------------------------------------------------------------- entiteiten (zelfde als v2)
ENTITIES = {
    "buiten_temp": "sensor.ecodan_hp_buitentemperatuur", "heetgas": "sensor.ecodan_hp_heetgastemperatuur",
    "compressor_hz": "sensor.ecodan_hp_compressor_frequentie", "wifi": "sensor.ecodan_hp_wifi_signaal",
    "in1": "binary_sensor.ecodan_hp_in1_warmtevraag", "warm_leiding": "sensor.ecodan_hp_warm_tapwater_leiding",
    "tapvoeler": "sensor.ecodan_hp_tapvoeler", "tap_doel": "sensor.ecodan_hp_tapwater_doel",
    "thw5a": "sensor.ecodan_hp_tapwater_boven", "thw5b": "sensor.ecodan_hp_tapwater_onder",
    "thw1": "sensor.ecodan_hp_aanvoertemperatuur", "bh1": "sensor.ecodan_3d_bh1_tekst",
    "platenwisselaar": "sensor.ecodan_hp_platenwisselaar_temperatuur", "th2": "sensor.ecodan_hp_koudemiddel_temperatuur",
    "pomp1": "sensor.ecodan_3d_pomp1_tekst", "thw2": "sensor.ecodan_hp_retourtemperatuur",
    "debiet": "sensor.ecodan_hp_debiet", "datum_tijd": "sensor.date_time",
    "scherm_tapwater": "sensor.ecodan_hp_tapwater_boven", "stooklijn_verschuiving": "sensor.ecodan_hp_stooklijn_verschuiving",
    "slaapkamer_4": "sensor.slaapkamer_4_temperatuur", "slaapkamer_1": "sensor.slaapkamer_1_temperatuur",
    "slaapkamer_2": "sensor.slaapkamer_2_temperatuur", "slaapkamer_3": "sensor.slaapkamer_3_temperatuur",
    "woonkamer": "sensor.woonkamer_temperatuur", "basisstation": "sensor.hobbykamer_hobbykamer_wcd_koof_vermogen",
    "vermogen_buiten": "sensor.ecodan_buitenunit_vermogen", "kwh_buiten": "sensor.ecodan_buitenunit_energie_vandaag",
    "vermogen_binnen": "sensor.ecodan_binnenunit_vermogen", "kwh_binnen": "sensor.ecodan_binnenunit_energie_vandaag",
    "stooklijn_buiten": "sensor.ecodan_hp_buitentemperatuur", "stooklijn_doel": "sensor.ecodan_hp_doel_aanvoertemperatuur",
    "stooklijn_ftc6": "sensor.ecodan_hp_ftc6_doel_aanvoer",
    "bh1_aan": "binary_sensor.ecodan_hp_booster_heater",
    "driewegklep": "binary_sensor.ecodan_hp_3wegklep_tapwater",
}
DEMO = {"buiten_temp": "8.0", "heetgas": "24.9", "compressor_hz": "0", "wifi": "-58", "in1": "off",
        "warm_leiding": "26.1", "tapvoeler": "21.7", "tap_doel": "55", "thw5a": "43.5", "thw5b": "43.0",
        "thw1": "29.0", "bh1": "uit", "platenwisselaar": "5.5", "th2": "26.5", "pomp1": "uit", "thw2": "26.0",
        "debiet": "0.0", "datum_tijd": "9 nov 2026  01:47", "scherm_tapwater": "43.5", "stooklijn_verschuiving": "+0",
        "slaapkamer_4": "20.5", "slaapkamer_1": "20.5", "slaapkamer_2": "20.6", "slaapkamer_3": "20.4",
        "woonkamer": "20.3", "basisstation": "4.8", "vermogen_buiten": "15.7", "kwh_buiten": "0.03",
        "vermogen_binnen": "0.0", "kwh_binnen": "0.00", "stooklijn_buiten": "8.0", "stooklijn_doel": "26.2",
        "stooklijn_ftc6": "26.0", "bh1_aan": "off", "driewegklep": "off"}

PIPE_STYLE = {
    "r32_gas": ("#e879f9", "#5b3a63", "compressor_aan", ["on"]),          # heetgas: warm magenta
    "r32_vloeistof": ("#8b5cf6", "#3f3566", "compressor_aan", ["on"]),    # vloeistof: koeler violet
    "cv": ("#ef7b5f", "#5a3129", "stand", ["vloer", "tapwater"]),
    "vloer_aanvoer": ("#ef7b5f", "#5a3129", "stand", ["vloer"]),
    "tank_aanvoer": ("#ef7b5f", "#5a3129", "stand", ["tapwater"]),
    "retour": ("#5b9bf0", "#263c5e", "stand", ["vloer", "tapwater"]),
    "vloer_retour": ("#5b9bf0", "#263c5e", "stand", ["vloer"]),
    "tank_retour": ("#5b9bf0", "#263c5e", "stand", ["tapwater"]),
    "tapcircuit_warm": ("#f2b33d", "#6b5121", "stand", ["tapwater"]),
    "tapcircuit_koud": ("#4fd1e8", "#235b66", "stand", ["tapwater"]),
    "warm": ("#f2b33d", "#6b5121", "tappen", ["on"]), "koud": ("#4fd1e8", "#235b66", "tappen", ["on"]),
    "kabel": ("#e8d18a", "#6b6040", "stroom", ["on"]),
}
STATES = {"stand": ["vloer", "tapwater", "uit"], "compressor_aan": ["on", "off"], "tappen": ["on", "off"],
          "stroom_buiten": ["on", "off"], "stroom_binnen": ["on", "off"]}
STEEL, DARKSTEEL, BRASS, CHROME = "#a8adb5", "#3b3f46", "#c9a24b", "#d7dbe0"

# z (diepte) en stijl per live waarde: (z, bg, fg, font)
F = (LB.FLOAT, BG, "#a3a3a3", "monospace"); FB = (LB.FLOAT, BG, "#ffffff", "sans-serif")
TEXT_Z = {k: F for k in L.TEXTS}
TEXT_Z.update({k: FB for k in ("slaapkamer_1", "slaapkamer_2", "slaapkamer_3", "slaapkamer_4", "woonkamer")})
TEXT_Z.update(buiten_temp=(LB.FRONT_UNIT, "#3b3f46", "#ffffff", "sans-serif"),
              compressor_hz=(LB.FRONT_UNIT, "#3b3f46", "#ffffff", "sans-serif"),
              wifi=(LB.FRONT_FTC6, "#2b2f36", "#ffffff", "sans-serif"),
              tap_doel=(LB.FRONT_TANK, BG, "#ffffff", "monospace"),
              thw5a=(LB.FRONT_TANK, BG, "#ffffff", "sans-serif"), thw5b=(LB.FRONT_TANK, BG, "#ffffff", "sans-serif"),
              datum_tijd=(LB.FRONT_CTRL + 0.3, "#d6dbd0", "#111111", "monospace"),
              scherm_tapwater=(LB.FRONT_CTRL + 0.3, "#d6dbd0", "#111111", "monospace"),
              stooklijn_verschuiving=(LB.FRONT_CTRL + 0.3, "#d6dbd0", "#111111", "monospace"),
              basisstation=(LB.FRONT_MOHL, "#1f2125", "#a3a3a3", "monospace"),
              vermogen_buiten=(LB.FRONT_METER + 0.5, "#b9c4b5", "#111111", "monospace"),
              kwh_buiten=(LB.FRONT_METER + 0.5, "#b9c4b5", "#111111", "monospace"),
              vermogen_binnen=(LB.FRONT_METER + 0.5, "#b9c4b5", "#111111", "monospace"),
              kwh_binnen=(LB.FRONT_METER + 0.5, "#b9c4b5", "#111111", "monospace"))
# de kWh-meters krijgen een eigen scherm (zoals de HomeWizard in 2D), dus geen losse tekstvlakken
METER_KEYS = ("vermogen_buiten", "kwh_buiten", "vermogen_binnen", "kwh_binnen")
TEXT_KEYS = [k for k in L.TEXTS if k not in ("kwh_buiten_tekst", "datum_tijd", "scherm_tapwater", "stooklijn_verschuiving") + METER_KEYS]

# ================================================================= texture-atlas (labels + schermpjes)
SS = 8  # textuurpixels per cm
class Atlas:
    def __init__(s, W=4096): s.W = W; s.items = []; s.x = s.y = s.row = 2
    def add(s, img, light=None):
        w, h = img.size
        if s.x + w + 2 > s.W: s.x = 2; s.y += s.row + 2; s.row = 0
        s.items.append((img, light or img, s.x, s.y)); r = (s.x, s.y, w, h); s.x += w + 2; s.row = max(s.row, h); return r
    def build(s):
        H = (s.y + s.row + 4 + 3) // 4 * 4; s.H = H
        a = Image.new("RGBA", (s.W, H), (0, 0, 0, 0)); b = Image.new("RGBA", (s.W, H), (0, 0, 0, 0))
        for img, light, x, y in s.items: a.paste(img, (x, y)); b.paste(light, (x, y))
        s.img = a; s.light = b; return a
    def uv(s, r, u, v):
        x, y, w, h = r; return (x + u * w, y + v * h)   # pixels; genormaliseerd na build()
ATLAS = Atlas()
STYLE_LBL = {"white": ("#f3f4f6", FONT_B), "grey": ("#9ca3af", FONT_R), "dark": ("#1f2937", FONT_B),
             "red": ("#e11d48", FONT_B), "bold": ("#f3f4f6", FONT_B), "title": ("#9ca3af", FONT_B), "mono": ("#a3a3a3", FONT_M)}

# licht thema: dezelfde labels met donkere tekst (zoals --ink en --muted van het 2D-panel)
STYLE_LBL_LIGHT = {"white": "#1b2422", "grey": "#5b6865", "dark": "#1f2937", "red": "#e11d48", "bold": "#1b2422",
                   "title": "#5b6865", "mono": "#4b5563"}
def text_img(text, size, style, light=False):
    col, fp = STYLE_LBL[style]
    if light: col = STYLE_LBL_LIGHT[style]
    font = ImageFont.truetype(fp, int(size * SS * 1.25))
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    w = int(tmp.textlength(text, font=font)) + 8; h = int(size * SS * 1.6)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.text((4, h / 2), text, fill=col, font=font, anchor="lm")
    return img

# ================================================================= scene + writer
class Scene:
    def __init__(s): s.objs = []
    def add(s, name, parts, color="#ffffff", alpha=1.0, metal=0.1, rough=0.6, tex=None, double=False, origin=None, vgrad=None):
        def flat(x):
            if isinstance(x[0], np.ndarray): return [x]
            return [q for y in x for q in flat(y)]
        s.objs.append(dict(name=name, parts=flat(parts), color=color, alpha=alpha, metal=metal, rough=rough,
                           tex=tex, double=double, origin=origin, vgrad=vgrad))
    def write(s, path, tex_png, extras=None):
        buf = bytearray(); views, accs, meshes, nodes, mats = [], [], [], [], []
        def view(data, target=None):
            while len(buf) % 4: buf.append(0)
            off = len(buf); buf.extend(data); v = dict(buffer=0, byteOffset=off, byteLength=len(data))
            if target: v["target"] = target
            views.append(v); return len(views) - 1
        def acc(arr, typ, comp, target, mm=False):
            a = dict(bufferView=view(arr.tobytes(), target), componentType=comp, count=int(arr.shape[0]), type=typ)
            if mm: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
            accs.append(a); return len(accs) - 1
        img_view = view(tex_png)
        for o in s.objs:
            P = np.concatenate([p[0] for p in o["parts"]]); N = np.concatenate([p[1] for p in o["parts"]])
            U = np.concatenate([p[2] for p in o["parts"]]); off, idx = 0, []
            for p in o["parts"]: idx.append(p[3] + off); off += len(p[0])
            I = np.concatenate(idx).astype(np.uint32)
            org = np.array(o["origin"], np.float32) if o["origin"] is not None else (P.min(0) + P.max(0)) / 2
            P = (P - org).astype(np.float32)
            N = (N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)).astype(np.float32)
            pbr = dict(baseColorFactor=hexrgb(o["color"], o["alpha"]), metallicFactor=o["metal"], roughnessFactor=o["rough"])
            m = dict(name="mat_" + o["name"], pbrMetallicRoughness=pbr)
            if o["tex"]:
                pbr["baseColorTexture"] = dict(index=0)
                if o["tex"] == "alpha": m["alphaMode"] = "BLEND"
            if o["alpha"] < 1: m["alphaMode"] = "BLEND"
            if o["double"] or o["alpha"] < 1: m["doubleSided"] = True
            mats.append(m)
            attrs = dict(POSITION=acc(P, "VEC3", 5126, 34962, True), NORMAL=acc(N, "VEC3", 5126, 34962),
                         TEXCOORD_0=acc(U.astype(np.float32), "VEC2", 5126, 34962))
            if any(len(p) > 4 for p in o["parts"]):
                col = np.concatenate([p[4] if len(p) > 4 else np.ones((len(p[0]), 3)) for p in o["parts"]])
                col = np.where(col <= 0.04045, col / 12.92, ((col + 0.055) / 1.055) ** 2.4)
                attrs["COLOR_0"] = acc(col.astype(np.float32), "VEC3", 5126, 34962)
            if o["vgrad"]:
                y0g, y1g, stops = o["vgrad"]; yy = np.clip(((P[:, 1] + org[1]) - y0g) / (y1g - y0g), 0, 1)
                ts = np.array([t for t, _ in stops]); cs = np.array([hexrgb(c)[:3] for _, c in stops])
                col = np.stack([np.interp(yy, ts, cs[:, k]) for k in range(3)], 1)
                col = np.where(col <= 0.04045, col / 12.92, ((col + 0.055) / 1.055) ** 2.4)   # sRGB -> lineair
                attrs["COLOR_0"] = acc(col.astype(np.float32), "VEC3", 5126, 34962)
            prim = dict(attributes=attrs, indices=acc(I, "SCALAR", 5125, 34963), material=len(mats) - 1)
            meshes.append(dict(name=o["name"], primitives=[prim]))
            nodes.append(dict(name=o["name"], mesh=len(meshes) - 1, translation=[float(x) for x in org]))
        while len(buf) % 4: buf.append(0)
        g = dict(asset=dict(version="2.0", generator="ecodan3d v3"), scene=0,
                 scenes=[dict(name="ecodan", nodes=list(range(len(nodes))), extras=extras or {})], nodes=nodes, meshes=meshes,
                 materials=mats, accessors=accs, bufferViews=views, buffers=[dict(byteLength=len(buf))],
                 images=[dict(bufferView=img_view, mimeType="image/png")],
                 samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)],
                 textures=[dict(source=0, sampler=0)])
        js = json.dumps(g, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(buf)))
            f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack("<II", len(buf), 0x004E4942)); f.write(bytes(buf))
S = Scene()

# ================================================================= vorm-helpers (dashboard-coördinaten)
def bx(x0, x1, y0, y1, z0, z1):
    return box(((x0 + x1) / 2, 889 - (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0))
def cz(x, y, z0, z1, r, seg=28, caps=True): return cyl(V(x, y, z0), V(x, y, z1), r, seg, caps)      # as = diepte
def cy(x, y0, y1, r, z=0, seg=28, caps=True): return cyl(V(x, y0, z), V(x, y1, z), r, seg, caps)    # as = verticaal
def cx(x0, x1, y, r, z=0, seg=24, caps=True): return cyl(V(x0, y, z), V(x1, y, z), r, seg, caps)    # as = horizontaal
def ellipsoid(c, rx, ry, rz, seg=16, half=None):
    p = sphere((0, 0, 0), 1, seg); P = p[0] * np.array([rx, ry, rz], np.float32)
    N = p[1] / np.array([rx, ry, rz], np.float32)
    if half: keep = (P[:, 1] * half >= -1e-4)
    out = part(P + np.array(c, np.float32), N, p[2], p[3])
    if half:
        T = out[3].reshape(-1, 3); T = T[keep[T].all(1)]; out[3] = T.reshape(-1)
    return out
def rrect(x0, x1, y0, y1, r, seg=6):
    pts = []
    for ccx, ccy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg); pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
    return pts
def extrude_xy(poly, z0, z1):
    """convexe polygoon in dashboard (x, y) extruderen in de diepte"""
    poly = [V(x, y)[:2] for x, y in poly]; poly = np.array(poly); n = len(poly); c = poly.mean(0); out = []
    for z, nz in ((z1, 1), (z0, -1)):
        P = [(c[0], c[1], z)] + [(p[0], p[1], z) for p in poly]
        I = sum([[0, i + 1, (i + 1) % n + 1] for i in range(n)], [])
        out.append(part(P, [(0, 0, nz)] * (n + 1), [(.5, .5)] * (n + 1), I))
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]; d = b - a; nr = np.array([d[1], -d[0], 0.0]); nr /= np.linalg.norm(nr) + 1e-9
        if np.dot(nr[:2], (a + b) / 2 - c) < 0: nr = -nr
        out.append(part([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], [nr] * 4,
                        [(0, 0)] * 4, [0, 1, 2, 0, 2, 3]))
    return out
def front_quad(x0, x1, y0, y1, z):  # vlak naar de kijker (+Z), tekst rechtop
    return quad(((x0 + x1) / 2, 889 - (y0 + y1) / 2, z), x1 - x0, y1 - y0, normal=(0, 0, 1), up=(0, 1, 0))

def pipe_points(pts, hops=()):
    out = []; P = [np.array(p, float) for p in pts]
    for a, b in zip(P, P[1:]):
        out.append(V(a[0], a[1], 0)); d = b - a; ln = np.linalg.norm(d)
        if ln < 1e-6: continue
        d /= ln
        hs = sorted([np.array(h, float) for h in hops if abs(d[0] * (h[1] - a[1]) - d[1] * (h[0] - a[0])) < 1.5
                     and 0 < np.dot(np.array(h, float) - a, d) < ln], key=lambda h: np.dot(h - a, d))
        for h in hs:
            for t, z in ((-10, 0), (-6, HOP_Z * .55), (-3, HOP_Z * .92), (0, HOP_Z), (3, HOP_Z * .92), (6, HOP_Z * .55), (10, 0)):
                q = h + d * t; out.append(V(q[0], q[1], z))
    out.append(V(P[-1][0], P[-1][1], 0)); return out

BIND = []
def bind_color(ent, oid, mapping, glow=None):
    BIND.append(dict(entity=ent, type3d="color", object_id=oid, glow=glow or [],
                     colorcondition=[dict(state=s, color=c) for s, c in mapping]))

# ================================================================= LEIDINGEN + STROMEN
FLOWS = []    # stroomdeeltjes: paden in stroomrichting, actief onder dezelfde voorwaarde als de kleur
SPEED = {"r32_gas": 30, "r32_vloeistof": 24, "loop": 13}   # cm/s, rustig
def add_flow(obj, kind, paths, radius=3.0, spacing=33, speed=20):
    act, dim, ent, on = PIPE_STYLE[kind]
    FLOWS.append(dict(object=obj, key=ent, states=on, color=act, radius=radius, spacing=spacing, speed=speed,
                      paths=[[[round(c, 2) for c in pt] for pt in path] for path in paths]))

for name, p in L.PIPES.items():
    act, dim, ent, on = PIPE_STYLE[p["kind"]]
    if ent == "stroom": ent = "stroom_buiten" if "buiten" in name else "stroom_binnen"
    pts = pipe_points(p["pts"], p.get("hops", ()))
    r = 1.3 if p["kind"] == "kabel" else PIPE_R
    S.add(name, tube(pts, r, 12), act, rough=0.35, metal=0.2)
    if ent:
        bind_color(ent, name, [(st, act if st in on else dim) for st in STATES[ent]], glow=on)
        if p.get("flow", True):
            add_flow(name, p["kind"], [pts[::-1] if p.get("rev") else pts], speed=SPEED.get(p["kind"], 20),
                     **(dict(radius=1.7, spacing=24) if p["kind"] == "kabel" else {}))
            FLOWS[-1]["key"] = ent

# --- vloerverwarming: horizontale verdeler tegen de achterwand + eenvoudige meanders in de vloer
LOOP_R = 1.9
RED, BLUE = "#ef4444", "#3b82f6"
def grad_tube(pts, r, s_a, s_b, seg=10, c0=None, c1=None, cm=None):
    """buis met vertexkleur rood->blauw langs de booglengte (s_a..s_b)"""
    P = [np.array(p, float) for p in pts]; cum = [0.0]
    for i in range(1, len(P)): cum.append(cum[-1] + np.linalg.norm(P[i] - P[i - 1]))
    cr, cb = np.array(hexrgb(c0 or RED)[:3]), np.array(hexrgb(c1 or BLUE)[:3])
    cmid = np.array(hexrgb(cm)[:3]) if cm else None
    def col(sv):
        t = np.clip((sv - s_a) / max(s_b - s_a, 1e-6), 0, 1)[:, None]
        if cmid is None: return cr * (1 - t) + cb * t
        t1 = np.clip(t * 2, 0, 1); t2 = np.clip(t * 2 - 1, 0, 1)
        return np.where(t < .5, cr * (1 - t1) + cmid * t1, cmid * (1 - t2) + cb * t2)
    out = []
    for i in range(1, len(P)):
        a, b = P[i - 1], P[i]; L_ = np.linalg.norm(b - a)
        if L_ < 1e-6: continue
        pt = cyl(a, b, r, seg, caps=False); d = (b - a) / L_
        tt = np.clip((pt[0] - a) @ d, 0, L_); pt.append(col(cum[i - 1] + tt)); out.append(pt)
        if 0 < i < len(P) - 1:
            u = (P[i + 1] - b); nu = np.linalg.norm(u)
            if nu > 1e-6 and np.dot(d, u / nu) < 0.97:
                sp = sphere(tuple(b), r, 5); sp.append(col(np.full(len(sp[0]), cum[i]))); out.append(sp)
    return out, cum[-1]

MAN_CAP, MAN_FM = "#1d4ed8", "#dc2626"
ACTUATORS, LOOPS_X, LEDS = [], {}, []
for fl, ys in L.LOOPS.items():
    n = len(ys); top = L.FLOOR_TOP[fl]; yf = top - LOOP_R
    y_b, y_t = top - 26, top - 46                     # aanvoerbalk (onder) en retourbalk (boven)
    z_b, z_t = -70, -80
    x0m = 806; xo = [814 + 10 * i for i in range(n)]; x1m = xo[-1] + 22
    # verdeler: twee zwarte balken zoals op de foto
    S.add(f"verdeler_{fl}", [bx(x0m, x1m, y_b - 3.5, y_b + 3.5, z_b - 3.5, z_b + 3.5),
                             bx(x0m, x1m, y_t - 3.5, y_t + 3.5, z_t - 3.5, z_t + 3.5),
                             bx(x1m - 4, x1m + 2, y_t - 4, y_b + 4, z_t - 1, z_t + 0.5)], "#18191c", rough=0.6)
    caps, acts, fms, glass, brass = [], [], [], [], []
    for i, x in enumerate(xo):
        if (fl, i) in LB.LOOP_ACTUATOR:
            nm_a = f"stelmotor_{fl}_{i}"
            S.add(nm_a, [bx(x + 1, x + 7, y_t - 13, y_t - 3.5, z_t - 3, z_t + 3)], "#f3f4f6", rough=0.5)
            ACTUATORS.append(dict(object=nm_a, room=LB.LOOP_CONTROL[fl][i]))
        else: caps += [cyl(V(x + 4, y_t - 3.5, z_t), V(x + 4, y_t - 8, z_t), 2.3, 14)]
        brass += [cyl(V(x + 4, y_t - 3.5, z_t), V(x + 4, y_t - 5, z_t), 1.6, 10),
                  cyl(V(x + 4, y_t + 3.5, z_t), V(x + 4, y_t + 7, z_t), 1.7, 10),
                  cyl(V(x, y_b + 3.5, z_b), V(x, y_b + 7, z_b), 1.7, 10)]
        fms += [cyl(V(x, y_b - 3.5, z_b), V(x, y_b - 6.5, z_b), 2.4, 14)]
        glass += [cyl(V(x, y_b - 6.5, z_b), V(x, y_b - 13, z_b), 1.5, 12)]
    # aansluitkranen links, ontluchters / thermometer / aftap rechts
    brass += [cyl(V(x0m - 7, y_b, z_b), V(x0m, y_b, z_b), 2.6, 14), cyl(V(x0m - 7, y_t, z_t), V(x0m, y_t, z_t), 2.6, 14),
              cyl(V(x1m - 6, y_t - 3.5, z_t), V(x1m - 6, y_t - 7, z_t), 1.5, 10),
              cyl(V(x1m + 2, y_b, z_b), V(x1m + 6, y_b, z_b), 2.2, 12), cyl(V(x1m + 2, y_t, z_t), V(x1m + 6, y_t, z_t), 2.2, 12),
              cyl(V(x1m - 5, y_b + 3.5, z_b), V(x1m - 5, y_b + 8, z_b), 1.5, 10)]
    S.add(f"verdeler_{fl}_kapjes", caps, MAN_CAP, rough=0.4)
    S.add(f"verdeler_{fl}_flowmeters", fms + [bx(x0m - 5, x0m - 3, y_b - 9, y_b - 3, z_b - 1, z_b + 1)], MAN_FM, rough=0.4)
    S.add(f"verdeler_{fl}_glas", glass, "#fde68a", alpha=0.55, rough=0.1)
    S.add(f"verdeler_{fl}_messing", brass, BRASS, metal=0.8, rough=0.3)
    S.add(f"verdeler_{fl}_blauwe_kraan", [bx(x0m - 5, x0m - 3, y_t - 9, y_t - 3, z_t - 1, z_t + 1)], MAN_CAP)
    if fl in LB.MANIFOLD_ACTUATOR:   # zone-afsluiter met stelmotor in de aanvoerleiding vóór de verdeler
        xv = x0m - 16
        S.add(f"verdeler_{fl}_zoneklep", [cx(xv - 7, xv + 7, y_b, 3.6, z_b, 16), ellipsoid(V(xv, y_b, z_b), 4.6, 4.6, 4.6, 12),
                                          cy(xv, y_b - 4, y_b - 8, 2.2, z_b, 12)], BRASS, metal=0.8, rough=0.3)
        S.add(f"stelmotor_{fl}_zone", [bx(xv - 6, xv + 6, y_b - 20, y_b - 8, z_b - 6, z_b + 6)], "#f3f4f6", rough=0.5)
        ACTUATORS.append(dict(object=f"stelmotor_{fl}_zone", room=LB.LOOP_CONTROL[fl][0]))
    S.add(f"verdeler_{fl}_thermometer", [cz(x1m - 12, y_b - 8, z_b - 1, z_b + 3, 4, 20)], "#111214", rough=0.4)
    # aanvoer vanaf de stijgleiding naar de linkerkant van de onderste balk, retour van de bovenste balk terug
    ya, yr = L.BRANCH_Y[fl]
    sup = [V(750, ya), V(766, ya), V(766, y_b), V(766, y_b, z_b), V(x0m - 7, y_b, z_b)]
    ret = [V(x0m - 7, y_t, z_t), V(760, y_t, z_t), V(760, y_t)] + pipe_points([(760, yr), (730, yr)], hops=[(750, yr)] if fl != "bg" else [])
    for nm, pts, kind in ((f"pipe_vloer_aanvoer_{fl}", sup, "vloer_aanvoer"), (f"pipe_vloer_retour_{fl}", ret, "vloer_retour")):
        act, dim, ent, on = PIPE_STYLE[kind]
        S.add(nm, tube(pts, PIPE_R, 12), act, rough=0.35, metal=0.2)
        bind_color(f"verdieping_{fl}", nm, [("vloer", act), ("uit", dim)], glow=["vloer"])
        add_flow(nm, kind, [pts]); FLOWS[-1].update(key=f"verdieping_{fl}", states=["vloer"])
    # meanders: elke lus een eigen zone, aanvoer rood -> geleidelijk afkoelend -> retour blauw
    zw = (L.MEANDER_X[1] - L.MEANDER_X[0]) / n; zb, zf = L.MEANDER_Z
    for i, x in enumerate(xo):
        xa = L.MEANDER_X[0] + i * zw + 4; xb = xa + zw - 10
        m = max(2, int(round((xb - xa) / 14)) // 2 * 2)
        xs = np.linspace(xa, xb, m)
        zs, zr = -26 - 8 * i, -30 - 8 * i                 # aansluitbanen achter de meanders
        pre = [V(x, y_b + 7, z_b), V(x, yf, z_b), V(x, yf, zs), V(xa, yf, zs)]
        serp = []
        for k, xx in enumerate(xs):
            a_, b_ = (zb, zf) if k % 2 == 0 else (zf, zb)
            serp += [V(xx, yf, a_), V(xx, yf, b_)]
        post = [V(xb, yf, zr), V(x + 4, yf, zr), V(x + 4, yf, z_t), V(x + 4, y_t + 7, z_t)]
        path = pre + serp + post
        cum = np.concatenate([[0], np.cumsum([np.linalg.norm(np.subtract(path[j], path[j - 1])) for j in range(1, len(path))])])
        s_a, s_b = cum[len(pre)], cum[len(pre) + len(serp) - 1]
        tp, total = grad_tube(path, LOOP_R, s_a, s_b)
        key = f"lus_{fl}_{i}"; LOOPS_X[key] = dict(floor=fl, room=LB.LOOP_CONTROL[fl][i], name=LB.LOOP_NAMES[fl][i])
        S.add(key, tp, "#ffffff", rough=0.4)
        bind_color(key, key, [("vloer", "#ffffff"), ("uit", "#4a4a4a")])     # dichte lus: vaag
        add_flow(key, "vloer_aanvoer", [path], radius=2.2, spacing=27, speed=SPEED["loop"])
        FLOWS[-1].update(key=key, states=["vloer"], gradient=[RED, BLUE], grad=[[round(s_a / total, 4), round(s_b / total, 4)]])

# ================================================================= BUITENUNIT
def plate_with_hole(x0, x1, y0, y1, hx, hy, hr, z):
    """voorpaneel met rond gat (ventilatoropening), normaal +Z"""
    corners = [(x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    angs = sorted(set([i * 2 * math.pi / 96 for i in range(96)] +
                      [math.atan2(cy_ - hy, cx_ - hx) % (2 * math.pi) for cx_, cy_ in corners]))
    P, I = [], []
    for a in angs:
        dx, dy = math.cos(a), math.sin(a)
        ts = [t for t in ((x0 - hx) / dx if dx < 0 else (x1 - hx) / dx if dx > 0 else 1e9,
                          (y0 - hy) / dy if dy < 0 else (y1 - hy) / dy if dy > 0 else 1e9)]
        t = min(ts)
        P += [V(hx + hr * dx, hy + hr * dy, z), V(hx + t * dx, hy + t * dy, z)]
    n = len(angs)
    for i in range(n):
        a, b = 2 * i, 2 * ((i + 1) % n); I += [a, b, a + 1, b, b + 1, a + 1]
    return part(P, [(0, 0, 1)] * len(P), [(0, 0)] * len(P), I)
(fx, fy), fr = L.FAN["c"], L.FAN["r"]
S.add("buitenunit_kast", [bx(36, 252, 67, 293, -45, 37), plate_with_hole(36, 252, 67, 293, fx, fy, fr, 45),
                          bx(36, 37, 67, 293, 37, 45), bx(251, 252, 67, 293, 37, 45), bx(36, 252, 67, 68, 37, 45), bx(36, 252, 292, 293, 37, 45)],
      "#3d4148", metal=0.35, rough=0.45)
S.add("buitenunit_voeten", [bx(50, 72, 293, 305, -40, 40), bx(216, 238, 293, 305, -40, 40)], "#25282c", rough=0.8)
S.add("buitenunit_lamellen", [bx(250, 252.5, 70 + i * 9, 72 + i * 9, -42, 30) for i in range(24)], "#2a2d32", metal=0.4)
(fx, fy), fr = L.FAN["c"], L.FAN["r"]
S.add("buitenunit_koker", [cz(fx, fy, 30, 45, fr, 64, caps=False), cz(fx, fy, 30, 30.5, fr, 64)], "#0b0c0e", rough=1)
fan = [cyl((0, 0, 0), (0, 0, 3), 8, 20)]
def blade_local(poly, z0, z1):
    poly = np.array(poly, float); n = len(poly); c = poly.mean(0); out = []
    for z, nz in ((z1, 1), (z0, -1)):
        P = [(c[0], c[1], z)] + [(q[0], q[1], z) for q in poly]
        out.append(part(P, [(0, 0, nz)] * (n + 1), [(.5, .5)] * (n + 1), sum([[0, i + 1, (i + 1) % n + 1] for i in range(n)], [])))
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]; d = b - a; nr = np.array([d[1], -d[0], 0.0]); nr /= np.linalg.norm(nr) + 1e-9
        if np.dot(nr[:2], (a + b) / 2 - c) < 0: nr = -nr
        out.append(part([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], [nr] * 4, [(0, 0)] * 4, [0, 1, 2, 0, 2, 3]))
    return out
for k in range(3):
    bl = blade_local([(6, -6), (fr * .45, -13), (fr - 7, -10), (fr - 5, 2), (fr * .5, 11), (6, 6)], 0.6, 2.2)
    fan += [rotate(p, (0, 0, 1), k * 2 * math.pi / 3) for p in bl]
fan += tube([(0.94 * fr * math.cos(t), 0.94 * fr * math.sin(t), 1.2) for t in np.linspace(0, 2 * math.pi, 49)], 0.6, 5)
S.add("buiten_ventilator", [shift(p, V(fx, fy, 40)) for p in fan], "#b8bcc4", metal=0.3, rough=0.4, origin=V(fx, fy, 41.2))
BIND.append(dict(entity="compressor_aan", type3d="rotate", object_id="buiten_ventilator", rotate=dict(axis="z", round_per_seconds=1)))
grill = tube([V(fx + fr * math.cos(t), fy + fr * math.sin(t), 46.5) for t in np.linspace(0, 2 * math.pi, 65)], 1.6, 8)
for rr in (fr * .66, fr * .33):
    grill += tube([V(fx + rr * math.cos(t), fy + rr * math.sin(t), 46.5) for t in np.linspace(0, 2 * math.pi, 49)], .7, 6)
grill += [cx(fx - fr, fx + fr, fy, .8, 46.5, 8), cy(fx, fy - fr, fy + fr, .8, 46.5, 8)]
S.add("buitenunit_rooster", grill, "#8f949c", metal=0.6, rough=0.35)
c0, c1, cy0, cy1 = L.COMPRESSOR; ccx, crr = (c0 + c1) / 2, (c1 - c0) / 2
S.add("buiten_compressor", [cy(ccx, cy0 + crr * .6, cy1 - crr * .6, crr, 45, 32, caps=False),
                            ellipsoid(V(ccx, cy0 + crr * .6, 45), crr, crr * .6, crr, 16, half=1),
                            ellipsoid(V(ccx, cy1 - crr * .6, 45), crr, crr * .6, crr, 16, half=-1)], DARKSTEEL, metal=0.5, rough=0.3)
bind_color("compressor_aan", "buiten_compressor", [("on", "#f59e0b"), ("off", DARKSTEEL)])

# ================================================================= BINNENUNIT
S.add("ftc6_regelaar", [bx(503, 666, 50, 102, -10, 10)], "#2b2f36", metal=0.3, rough=0.4)
S.add("ftc6_wifi", [tube([V(645 + r * math.cos(t), 78 - r * math.sin(t), 10.6) for t in np.linspace(math.radians(45), math.radians(135), 9)], .9, 6)
                    for r in (4, 8, 12)] + [sphere(V(645, 79, 10.6), 1.6, 6)], "#e5e7eb")
# expansievat + ontluchter + manometer
S.add("expansievat", [cy(360.5, 140, 152, 16.5, 0, 28, caps=False), ellipsoid(V(360.5, 140), 16.5, 13, 16.5, 16, half=1),
                      ellipsoid(V(360.5, 152), 16.5, 13, 16.5, 16, half=-1)], "#b91c1c", metal=0.3, rough=0.35)
S.add("ontluchter", [cy(360, 92, 106, 4, 0, 16), cy(360, 90, 93, 5.5, 0, 16)], BRASS, metal=0.8, rough=0.3)
S.add("manometer", [cz(360, 186, -4, 5, 9.5, 28), cz(360, 186, 5, 6, 8, 28)], CHROME, metal=0.8, rough=0.25)
S.add("manometer_wijzerplaat", [cz(360, 186, 6, 6.3, 7.4, 28)], "#f8fafc", rough=0.6)
S.add("manometer_naald", [bx(359.4, 360.6, 180, 187, 6.3, 6.8)], "#dc2626")
# 3-wegklep
vx, vy = L.VALVE_3WEG
S.add("klep_3weg", [cy(vx, vy - 12, vy + 12, 7.5, 0, 20), cx(vx, vx + 12, vy, 6.5, 0, 20), ellipsoid(V(vx, vy), 9.5, 9.5, 9.5, 16)],
      BRASS, metal=0.8, rough=0.3)
bind_color("stand", "klep_3weg", [("vloer", "#ef7b5f"), ("tapwater", "#f2b33d"), ("uit", BRASS)])
S.add("klep_3weg_motor", [bx(377, 393, 349, 365, -8, 8), cx(393, vx - 8, vy, 2.5, 0, 12)], "#e5e7eb", rough=0.5)
# BH1 bijverwarming
b0, b1, by0, by1 = L.BH1; bcx = (b0 + b1) / 2
S.add("bh1_element", [cy(bcx, by0 + 3, by1 - 3, 10, 0, 28)], "#9ca3af", alpha=0.25, metal=0.3, rough=0.1)
hel = [V(bcx + 6 * math.cos(t), by0 + 7 + (by1 - by0 - 14) * t / (10 * math.pi), 6 * math.sin(t)) for t in np.linspace(0, 10 * math.pi, 110)]
S.add("bh1_spiraal", tube(hel, 1.3, 8) + [cy(bcx, by0 + 3, by0 + 7, 1.3, 0, 8)], "#6b7280", metal=0.4, rough=0.4)
S.add("bh1_flenzen", [cy(bcx, by0, by0 + 3, 12, 0, 28), cy(bcx, by1 - 3, by1, 12, 0, 28), cx(bcx, bcx - 16, 470, 3, 0, 12)], CHROME, metal=0.8, rough=0.3)
bind_color("bh1_aan", "bh1_spiraal", [("on", "#f97316"), ("off", "#6b7280")], glow=["on"]); BIND[-1]["pulse"] = True
# platenwisselaars: voorkant open, interne kanalen met kleurverloop zichtbaar
def open_hex(x0, x1, y0, y1, d, t=1.6):
    return [bx(x0, x1, y0, y1, -d, -d + 2.5),                                     # achterplaat
            bx(x0, x0 + t, y0, y1, -d, d), bx(x1 - t, x1, y0, y1, -d, d),          # zijwanden
            bx(x0, x1, y0, y0 + t, -d, d), bx(x0, x1, y1 - t, y1, -d, d),
            bx(x0 - 1, x0 + 2.5, y0 - 1, y1 + 1, d - 1, d + 1), bx(x1 - 2.5, x1 + 1, y0 - 1, y1 + 1, d - 1, d + 1),   # voorrand
            bx(x0 - 1, x1 + 1, y0 - 1, y0 + 2.5, d - 1, d + 1), bx(x0 - 1, x1 + 1, y1 - 2.5, y1 + 1, d - 1, d + 1)]
def wavy(start, end, xc, amp=3.2, periods=2.5, n=64):
    """rustig golvend kanaal van het warme naar het koude punt"""
    (sx, sy), (ex, ey) = start, end
    ya, yb = sy + (6 if ey > sy else -6), ey - (6 if ey > sy else -6)
    pts = [V(sx, sy, 0), V(xc, sy, 0)]
    for k in range(n + 1):
        u = k / n; y = ya + (yb - ya) * u
        pts.append(V(xc + amp * math.sin(2 * math.pi * periods * u) * math.sin(math.pi * u) ** 0.5, y, 0))
    pts += [V(xc, ey, 0), V(ex, ey, 0)]
    return pts
def zigzag(start, end, xl, xr, rows):
    ys = np.linspace(start[1], end[1], rows); pts = [start]
    for k, y in enumerate(ys):
        a_, b_ = (xl, xr) if k % 2 == 0 else (xr, xl)
        if k: pts.append((pts[-1][0], y))
        pts += [(a_, y), (b_, y)]
    pts.append(end)
    return [V(x, y, 0) for x, y in pts]
HEX_R = 1.5
def hex_channel(name, pts2, c0, c1, key, states, speed=13, cm=None):
    _, total = grad_tube(pts2, HEX_R, 0, 1, 8, c0, c1)
    tp, total = grad_tube(pts2, HEX_R, 0, total, 8, c0, c1, cm)      # verloop over de hele lengte
    S.add(name, tp, "#ffffff", rough=0.35)
    BIND.append(dict(entity=key, type3d="color", object_id=name, glow=[],
                     colorcondition=[dict(state=st, color="#ffffff" if st in states else "#5c5c5c") for st in STATES[key]]))
    FLOWS.append(dict(object=name, key=key, states=states, color=c0, radius=1.8, spacing=13.5, speed=speed,
                      gradient=[c0, cm, c1] if cm else [c0, c1], grad=[[0, 1]], paths=[[[round(c, 2) for c in p] for p in pts2]]))
S.add("platenwisselaar", open_hex(335, 371, 517, 644, 16), STEEL, metal=0.7, rough=0.3)
hex_channel("platenwisselaar_koudemiddel", wavy((343, 545), (343, 620), 344.5), "#e879f9", "#8b5cf6", "compressor_aan", ["on"], 16)
hex_channel("platenwisselaar_water", wavy((362, 620), (362, 545), 361.5), "#3b82f6", "#ef4444", "stand", ["vloer", "tapwater"])
S.add("wisselaar_tapwater", open_hex(464, 500, 342, 422, 12), STEEL, metal=0.7, rough=0.3)
hex_channel("wisselaar_tapwater_primair", wavy((464, 357), (464, 410), 473.5, amp=3.0, periods=2), "#ef4444", "#3b82f6", "stand", ["tapwater"])
hex_channel("wisselaar_tapwater_secundair", wavy((500, 410), (500, 357), 490.5, amp=3.0, periods=2), "#22d3ee", "#f2b33d", "stand", ["tapwater"], cm="#e5e7eb")
S.add("wisselaar_17", [bx(503, 515, 313, 333, -7, 7)], STEEL, metal=0.7, rough=0.3)
# pompen
def circulator(x, y, r, depth):
    return [cz(x, y, -r * .8, r * .8, r, 32), cz(x, y, r * .8, r * .8 + depth, r * .82, 32)]
px, py = L.POMP1
S.add("pomp1_huis", circulator(px, py, 12.5, 14), "#d4d7dc", metal=0.3, rough=0.4)
S.add("pomp1_kop", [cz(px, py, 24, 25.5, 9, 32)], "#1f2937", rough=0.5)
imp = [cyl((0, 0, 0), (0, 0, 1.2), 2.5, 12)] + [rotate(box((4.5, 0, .6), (7, 2.2, 1.2)), (0, 0, 1), k * math.pi / 2) for k in range(4)]
S.add("pomp1_waaier", [shift(p, V(px, py, 25.6)) for p in imp], "#ef4444", origin=V(px, py, 26.2))
BIND.append(dict(entity="pomp_aan", type3d="rotate", object_id="pomp1_waaier", rotate=dict(axis="z", round_per_seconds=2)))
qx, qy = L.POMP18
S.add("pomp18", circulator(qx, qy, 9, 10), "#d4d7dc", metal=0.3, rough=0.4)
S.add("pomp18_kop", [cz(qx, qy, 17.2, 18.3, 6.5, 24)], "#1f2937")
imp18 = [cyl((0, 0, 0), (0, 0, 1.0), 1.8, 12)] + [rotate(box((3.2, 0, .5), (5, 1.6, 1.0)), (0, 0, 1), k * math.pi / 2) for k in range(4)]
S.add("pomp18_waaier", [shift(p, V(qx, qy, 18.4)) for p in imp18], "#f2b33d", origin=V(qx, qy, 18.9))
BIND.append(dict(entity="stand", type3d="rotate", object_id="pomp18_waaier", rotate=dict(axis="z", round_per_seconds=2.5), states=["tapwater"]))
# afsluiters, filter, debietmeter
S.add("kraan_14", [cx(400, 414, 662, 5, 0, 16), ellipsoid(V(407, 662), 6.5, 6.5, 6.5, 12), cy(407, 655, 662, 1.6, 0, 8)], BRASS, metal=0.8, rough=0.3)
S.add("kraan_hendels", [bx(399, 417, 652, 655, -2, 2), bx(579, 582, 168, 184, 0, 14)], "#dc2626", rough=0.5)
S.add("kraan_21", [cy(585, 169, 183, 5, 0, 16), ellipsoid(V(585, 176), 6.5, 6.5, 6.5, 12)], BRASS, metal=0.8, rough=0.3)
S.add("kraan_33", [cy(661, 171, 185, 5, 0, 16), cy(661, 176, 180, 6.5, 0, 16)], BRASS, metal=0.8, rough=0.3)
S.add("filter", [cx(462, 484, 662, 6.5, 0, 20), cyl(V(473, 662), V(478, 674, 6), 5, 16)], BRASS, metal=0.8, rough=0.3)
S.add("debietmeter", [cx(524, 547, 662, 7, 0, 20)], "#9ca3af", metal=0.5, rough=0.35)
S.add("debietmeter_kop", [bx(529, 542, 648, 656, -5, 5)], "#1f2937")
# sensoren (witte bolletjes)
S.add("sensoren", [sphere(V(x, y, z), 4.2, 10) for x, y, z in
                   [(286, 144, 0), (647, 130, 0), (661, 227, 0), (405, 411, 0), (319, 635, 0), (504, 662, 0),
                    (648, 391, 0), (648, 436, 0), (227, 97, 46)]], "#f3f4f6", rough=0.3)

# ================================================================= TAPWATERVAT (staand, glazen mantel)
t0, t1, ty0, ty1 = L.TANK; tcx, tr = (t0 + t1) / 2, (t1 - t0) / 2; cap = 30
S.add("tank_mantel", [cy(tcx, ty0 + cap, ty1 - cap, tr, 0, 56, caps=False),
                      ellipsoid(V(tcx, ty0 + cap), tr, cap, tr, 24, half=1), ellipsoid(V(tcx, ty1 - cap), tr, cap, tr, 24, half=-1)],
      "#dbe3ea", alpha=0.16, metal=0.3, rough=0.1)
# helemaal gevuld; verloop rood (boven) -> blauw (onder) via vertexkleuren
wr = tr - 2.2
S.add("tank_water", [cy(tcx, ty0 + cap, ty1 - cap, wr, 0, 56, caps=False),
                     ellipsoid(V(tcx, ty0 + cap), wr, cap - 2.2, wr, 24, half=1),
                     ellipsoid(V(tcx, ty1 - cap), wr, cap - 2.2, wr, 24, half=-1)],
      "#ffffff", alpha=0.62, rough=0.15,
      vgrad=(889 - ty1, 889 - ty0, [(0.0, "#1d4ed8"), (0.38, "#3b82f6"), (0.62, "#f97316"), (1.0, "#dc2626")]))
S.add("tank_ringen", [cy(tcx, ty0 + cap, ty0 + cap + 3, tr + 1.2, 0, 56, caps=False),
                      cy(tcx, ty1 - cap - 3, ty1 - cap, tr + 1.2, 0, 56, caps=False)] +
      [cy(tcx + dx, ty1 - 6, ty1 + 6, 3, dz, 10) for dx, dz in ((-35, -35), (35, -35), (0, 45))], CHROME, metal=0.8, rough=0.25)

# ================================================================= WONING
for nm in ("thermostaat_4", "thermostaat_1", "thermostaat_2", "thermostaat_3", "thermostaat_woonkamer"):
    x0, x1, y0, y1, _ = L.BLOCKS[nm]
    S.add(nm, extrude_xy(rrect(x0, x1, y0, y1, 3), -4, 4), "#e5e7eb", rough=0.5)
    S.add(nm + "_knop", [cz((x0 + x1) / 2, y1 - 6, 4, 4.8, 3.2, 16)], "#9ca3af")
for nm, (bx0, by0) in (("kraan_badkamer", (954, 426)), ("kraan_keuken", (954, 632))):
    S.add(nm, [cy(bx0, by0, by0 - 18, 2.6, 0, 16), cz(bx0, by0 - 18, 0, 13, 2.2, 16), ellipsoid(V(bx0, by0 - 18), 3, 3, 3, 10),
               cy(bx0, by0 - 18, by0 - 13, 1.8, 13, 12), bx(942, 966, by0 - 21, by0 - 19, -3, 3), cy(bx0, by0 - 23, by0 - 21, 3.4, 0, 16)],
          CHROME, metal=0.9, rough=0.2)
S.add("basisstation_mohlenhoff", extrude_xy(rrect(730, 1057, 662, 707, 5), -7, 7), "#1f2125", rough=0.5)
for li, (x, n) in enumerate(LB.MOHL_LEDS):
    kind, room = LB.LED_KIND[n]
    S.add(f"basisstation_led_{li}", [cz(x, 687, 7, 8.2, 2.7, 16)], "#4b5563", rough=0.3)
    LEDS.append(dict(object=f"basisstation_led_{li}", kind=kind, room=room, name=n))

# ================================================================= BEDIENINGSSCHERM & METERKAST
S.add("bedieningsscherm", extrude_xy(rrect(25, 265, 397, 607, 10), -6, 6), "#2a2d33", metal=0.2, rough=0.4)
S.add("bedieningsscherm_toetsen", [bx(x0, x0 + 46, 565, 575, 6, 7.5) for x0 in (47, 97, 147, 197)] +
      [cz(x, 591, 6, 7.6, 8, 24) for x in (64, 90, 116)] + [cz(219, 591, 6, 7.8, 11, 28)], "#3f444c", rough=0.5)
S.add("bedieningsscherm_led", [bx(188, 198, 590, 592.5, 6, 7)], "#22c55e")
# 1-fase DIN-kWh-meters in de stijl van de HWE-KWH1: staande lichtgrijze module, groot LCD, twee knoppen, pulslampjes
FM = LB.FRONT_METER - 0.4                      # voorkant van de behuizing
for nm, xc in (("kwh_meter_buiten", 282), ("kwh_meter_binnen", 399)):
    x0, x1, y0, y1 = xc - 32, xc + 32, 752, 858
    S.add(nm, extrude_xy(rrect(x0, x1, y0, y1, 4), -12, FM), "#eceef0", rough=0.55)
    S.add(nm + "_scherm", [front_quad(x0 + 1.2, x1 - 1.2, y0 + 1.2, y1 - 1.2, FM + 0.05)], "#ffffff", rough=0.8, metal=0, double=True)
    continue
    S.add(nm + "_rand", [bx(x0 + 3, x1 - 3, 771, 772, FM, FM + 0.3), bx(x0 + 3, x1 - 3, 852, 853, FM, FM + 0.3)], "#c9cdd2")
    S.add(nm + "_lcd_rand", [bx(x0 + 4, x1 - 4, 774, 816, FM, FM + 0.5)], "#9aa39a", rough=0.6)
    S.add(nm + "_display", [bx(x0 + 5, x1 - 5, 775, 815, FM + 0.5, FM + 0.7)], "#d6dfd2", rough=0.9)
    # Σ en signaalbalkjes in het LCD
    S.add(nm + "_lcd_tekens", [bx(x0 + 8 + 2.2 * i, x0 + 9.4 + 2.2 * i, 812 - 1.4 * (i + 1), 812, FM + 0.7, FM + 0.9) for i in range(5)],
          "#1b1f1c", rough=0.6)
    # knoppen (wifi, vernieuwen)
    S.add(nm + "_knoppen", extrude_xy(rrect(x0 + 6, x0 + 29, 822, 838, 2.5), FM, FM + 2.2) +
          extrude_xy(rrect(x1 - 29, x1 - 6, 822, 838, 2.5), FM, FM + 2.2), "#1f2328", rough=0.45)
    bw = x0 + 17.5; br = x1 - 17.5
    icons = [tube([V(bw + r * math.cos(t), 834 - r * math.sin(t), FM + 2.4) for t in np.linspace(math.radians(50), math.radians(130), 8)], .45, 5)
             for r in (2.5, 4.5, 6.5)] + [sphere(V(bw, 834.2, FM + 2.4), .7, 5)]
    icons += tube([V(br + 4.2 * math.cos(t), 830 - 4.2 * math.sin(t), FM + 2.4) for t in np.linspace(math.radians(20), math.radians(320), 18)], .45, 5)
    icons += [extrude_xy([(br + 3.2, 828.0), (br + 6.6, 828.6), (br + 4.6, 831.4)], FM + 2.2, FM + 2.6)]
    S.add(nm + "_iconen", icons, "#f3f4f6", rough=0.5)
    # pulslampjes 2 en 1
    S.add(nm + "_pulsleds", [cz(x1 - 14, 845, FM, FM + 0.8, 1.3, 12), cz(x1 - 7, 845, FM, FM + 0.8, 1.3, 12)], "#9ca3af", rough=0.4)
S.add("din_rail", [bx(236, 446, 802, 810, -14, -12)], "#9ca3af", metal=0.8)

# ================================================================= LABELS (atlas)
label_parts = []
def add_label(x, y, size, text, style, z, al):
    img = text_img(text, size, style); r = ATLAS.add(img, text_img(text, size, style, light=True))
    w, h = img.size[0] / SS, img.size[1] / SS
    xl = x - 0.5 if al == "l" else x - w + 0.5 if al == "r" else x - w / 2
    P = [V(xl, y - h / 2, z), V(xl + w, y - h / 2, z), V(xl + w, y + h / 2, z), V(xl, y + h / 2, z)]
    U = [ATLAS.uv(r, 0, 0), ATLAS.uv(r, 1, 0), ATLAS.uv(r, 1, 1), ATLAS.uv(r, 0, 1)]
    label_parts.append(part(P, [(0, 0, 1)] * 4, U, [0, 2, 1, 0, 3, 2]))
for l in LB.LABELS: add_label(*l)

# ---- stooklijn: raster, assen en schaalwaarden (de lijn zelf tekent de kaart live uit de instellingen)
C_ = L.CHART
def cx_(t): return C_["x0"] + (t - C_["tmin"]) / (C_["tmax"] - C_["tmin"]) * (C_["x1"] - C_["x0"])
def cy_(f): return C_["y_bot"] - (f - C_["fmin"]) / (C_["fmax"] - C_["fmin"]) * (C_["y_bot"] - C_["y_top"])
grid, axes, ticks = [], [], []
for t in range(C_["tmin"], C_["tmax"] + 1, 5):
    x = cx_(t); grid.append(bx(x - 0.25, x + 0.25, C_["y_top"], C_["y_bot"], -1.2, -0.8))
    add_label(x, C_["y_bot"] + 7, 5, ("−" if t < 0 else "") + str(abs(t)), "grey", 0.5, "c")
for t in range(C_["tmin"], C_["tmax"] + 1, 1):
    if t % 5: x = cx_(t); ticks.append(bx(x - 0.2, x + 0.2, C_["y_bot"], C_["y_bot"] + 2, -0.6, 0.4))
for f in range(C_["fmin"], C_["fmax"] + 1, 5):
    y = cy_(f); grid.append(bx(C_["x0"], C_["x1"], y - 0.25, y + 0.25, -1.2, -0.8))
    add_label(C_["x0"] - 3, y, 5, f"{f}°", "grey", 0.5, "r")
for f in range(C_["fmin"], C_["fmax"] + 1, 1):
    if f % 5: y = cy_(f); ticks.append(bx(C_["x0"] - 2, C_["x0"], y - 0.2, y + 0.2, -0.6, 0.4))
x0c = cx_(0)
axes += [bx(C_["x0"] - 0.6, C_["x0"] + 0.6, C_["y_top"], C_["y_bot"] + 0.6, -1, 0.6),
         bx(C_["x0"] - 0.6, C_["x1"], C_["y_bot"] - 0.6, C_["y_bot"] + 0.6, -1, 0.6),
         bx(x0c - 0.4, x0c + 0.4, C_["y_top"], C_["y_bot"], -1, 0.2)]          # 0 °C buiten
S.add("stooklijn_raster", grid, "#2c3036", rough=1)
S.add("stooklijn_assen", axes + ticks, "#6b7280", rough=0.8)
S.add("stooklijn_vlak", [front_quad(C_["x0"], C_["x1"], C_["y_top"], C_["y_bot"], -1.5)], "#000000", alpha=0.02, rough=1)
add_label(C_["x1"], C_["y_bot"] + 14, 5, "buiten °C", "grey", 0.5, "r")
add_label(C_["x0"] + 3, C_["y_top"] + 5, 5, "aanvoer °C", "grey", 0.5, "l")
for fl, names in LB.LOOP_NAMES.items():
    n_ = len(names); zw = (L.MEANDER_X[1] - L.MEANDER_X[0]) / n_
    for i, nm_ in enumerate(names):
        if not nm_: continue                                  # lus zonder naam, zoals in 2D
        xc = L.MEANDER_X[0] + i * zw + zw / 2 - 1          # bordje voor de eigen meanderzone
        add_label(xc, L.FLOOR_TOP[fl] - 6, 5.5 if len(nm_) < 16 else 4.0, nm_, "white", L.FLOOR_Z[1] + 1, "c")
for x, n in LB.MOHL_LEDS: add_label(x, 699, 5.5, n, "grey", LB.FRONT_MOHL, "c")
for k, u in LB.UNITS.items():
    if k in METER_KEYS: continue
    x0, x1, y0, y1, *_ = L.TEXTS[k]; z = TEXT_Z[k][0]
    st = "dark" if TEXT_Z[k][1] in ("#b9c4b5", "#d6dbd0") else ("bold" if TEXT_Z[k][3] == "sans-serif" else "mono")
    add_label(x1 + 1, (y0 + y1) / 2, (y1 - y0) * (.42 if k.startswith(("kwh_", "vermogen_")) else .55), u, st, z + 0.2, "l")

# live schermen: het LCD van de bediening, de Möhlenhoff Alpha-displays en de kWh-meters tekent de weergave zelf
SCREENS = {"lcd": "bedieningsscherm_lcd", "alpha": {}, "thermostats": {},
           "meters": {"buiten": "kwh_meter_buiten_scherm", "binnen": "kwh_meter_binnen_scherm"}}
S.add("bedieningsscherm_lcd", [front_quad(45, 244, 418, 558, LB.FRONT_CTRL - 0.2)], "#c9cfc7", rough=0.8, metal=0, double=True)
for key, blk in (("slaapkamer_4", "thermostaat_4"), ("slaapkamer_1", "thermostaat_1"), ("slaapkamer_2", "thermostaat_2"),
                 ("slaapkamer_3", "thermostaat_3"), ("woonkamer", "thermostaat_woonkamer")):
    x0, x1, y0, y1, _ = L.BLOCKS[blk]
    nm = f"alpha_display_{key}"
    S.add(nm, [front_quad(x0 + 3, x1 - 3, y0 + 3, y0 + 15, 4.25)], "#b9c4b5", rough=0.8, metal=0, double=True)
    SCREENS["alpha"][key] = nm; SCREENS["thermostats"][key] = blk
S.add("labels", label_parts, tex="alpha", rough=1, metal=0, double=True)

# ================================================================= LIVE TEKSTVLAKKEN
TEXT_SRC = {"pomp1": "pomp_aan", "bh1": "bh1_aan"}      # deze tonen aan/uit van een afgeleide/binaire state
TEXTS_X = []
for k in TEXT_KEYS:
    x0, x1, y0, y1, *_ = L.TEXTS[k]; z, bg, fg, font = TEXT_Z[k]
    S.add(f"txt_{k}", [front_quad(x0, x1 + 1, y0, y1 + 1, z + 0.15)], bg, rough=1, metal=0, double=True)
    TEXTS_X.append(dict(key=TEXT_SRC.get(k, k), object=f"txt_{k}", bg=bg, fg=fg,
                        font="mono" if font == "monospace" else "sans"))

atlas = ATLAS.build()
for o in S.objs:
    if o["tex"]:
        for p in o["parts"]: p[2] = (p[2] / np.array([ATLAS.W, ATLAS.H], np.float32)).astype(np.float32)

CAMERA = {"position": [545, 860, 1260], "target": [540, 430, 0]}
COLORS_X = [dict(key=b["entity"], object=b["object_id"], map={c["state"]: c["color"] for c in b["colorcondition"]},
                 glow=b.get("glow", []), pulse=b.get("pulse", False)) for b in BIND if b["type3d"] == "color"]
ROT_X = [dict(key=b["entity"], object=b["object_id"], axis=b["rotate"]["axis"], rps=b["rotate"]["round_per_seconds"],
              states=b.get("states", ["on"]))
         for b in BIND if b["type3d"] == "rotate"]
EXTRAS = {"ecodan3d": dict(version=6, camera=CAMERA, background=BG, texts=TEXTS_X, colors=COLORS_X,
                           rotates=ROT_X, flows=FLOWS, screens=SCREENS,
                           loops=LOOPS_X, actuators=ACTUATORS, leds=LEDS, chart=L.CHART,
                           compressor=dict(cx=ccx, r=crr, y0=cy0 + crr * .6, y1=cy1 - crr * .6, z=45))}
bio = io.BytesIO(); atlas.save(bio, "PNG", optimize=True)
S.write(MODEL_FILE, bio.getvalue(), EXTRAS)
ATLAS.light.save(LIGHT_FILE, "PNG", optimize=True)
print("objecten:", len(S.objs), "labels:", len(label_parts), "stromen:", len(FLOWS), "atlas:", atlas.size)
raise SystemExit

# ================================================================= kaartconfig + demo
USED = sorted({t["key"] for t in TEXTS_X} | {c["key"] for c in COLORS_X} | {r["key"] for r in ROT_X}
              | {"debiet", "compressor_hz", "driewegklep"})
DERIVED = {"stand", "compressor_aan", "pomp_aan"}
cfg_ents = {k: ENTITIES[k] for k in USED if k in ENTITIES and k not in DERIVED}
with open("ecodan_3d_card.yaml", "w") as f:
    f.write("# Ecodan 3D v4 – eigen kaart (custom:ecodan-3d-card)\n"
            "# Bestanden: /config/www/ecodan3d/ecodan.glb en /config/www/ecodan3d/ecodan-3d-card.js\n"
            "# Resource:  /local/ecodan3d/ecodan-3d-card.js  (type: JavaScript module)\n"
            "type: custom:ecodan-3d-card\nmodel: /local/ecodan3d/ecodan.glb\nheight: 620\n"
            "# waarden van 'driewegklep' die betekenen: klep staat op tapwater\n"
            "tapwater_states:\n  - 'on'\nentities:\n")
    for k, v in cfg_ents.items(): f.write(f"  {k}: {v}\n")
with open("ecodan_keys.json", "w") as f:
    json.dump(dict(entities=cfg_ents, demo={cfg_ents[k]: v for k, v in DEMO.items() if k in cfg_ents}), f)
print("objecten:", len(S.objs), "labels:", len(label_parts), "stromen:", len(FLOWS),
      "deeltjespaden:", sum(len(f["paths"]) for f in FLOWS), "atlas:", atlas.size)
