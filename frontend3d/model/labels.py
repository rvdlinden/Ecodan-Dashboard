"""Vaste teksten (3D-labels) op de posities van het originele dashboard.
(x, y, grootte, tekst, stijl, z, uitlijning)   x,y in dashboard-pixels; y = midden van de tekstregel."""

W, G, D, R = "white", "grey", "dark", "red"
FRONT_UNIT, FRONT_FTC6, FRONT_TANK, FRONT_MOHL, FRONT_METER, FRONT_CTRL, FLOAT = 45.4, 10.4, 66.0, 7.4, 12.4, 6.4, 14.0

LABELS = [
    # sectietitels
    (28, 20, 10, "BUITEN · TUIN", "title", FLOAT, "l"),
    (303, 20, 10, "TECHNISCHE RUIMTE", "title", FLOAT, "l"),
    (727, 20, 10, "WONING", "title", FLOAT, "l"),
    (28, 380, 10, "HOOFDSCHERM", "title", FLOAT, "l"),
    (28, 743, 10, "METERKAST", "title", FLOAT, "l"),
    (556, 743, 10, "STOOKLIJN", "title", FLOAT, "l"),
    # buitenunit
    (49, 86, 11, "SUZ-SWM60 VA", "bold", FRONT_UNIT, "l"),
    (49, 103, 7, "buitenunit", "white", FRONT_UNIT, "l"),
    (198, 97, 8, "TH7", G, FRONT_UNIT, "l"),
    (108, 267, 7, "ventilator + verdamper", "white", FRONT_UNIT, "c"),
    (210, 281, 7, "compressor", "white", FRONT_UNIT, "c"),
    (257, 117, 7, "heetgas", G, FLOAT, "l"),
    (257, 154, 7, "R32", G, FLOAT, "l"),
    # binnenunit
    (321, 57, 10, "EHST20D-VM2D", "bold", FLOAT, "l"),
    (321, 73, 7, "cilinderunit (binnen)", G, FLOAT, "l"),
    (516, 62, 9, "FTC6 regelaar", "bold", FRONT_FTC6, "l"),
    (516, 76, 7, "+ Asgard (ESP32-S3)", "white", FRONT_FTC6, "l"),
    (504, 111, 7, "IN1 warmtevraag:", "mono", FLOAT, "l"),
    (373, 98, 7, "ontluchter", G, FLOAT, "l"),
    (373, 109, 7, "overdruk 3 bar", G, FLOAT, "l"),
    (383, 139, 7, "expansievat", G, FLOAT, "l"),
    (383, 150, 7, "12 L · 1 bar", G, FLOAT, "l"),
    (373, 186, 7, "manometer", G, FLOAT, "l"),
    (414, 335, 7, "3-wegklep", G, FLOAT, "l"),
    (417, 384, 7, "→ vloer", "mono", FLOAT, "l"),
    (368, 405, 7, "THW1", G, FLOAT, "l"),
    (343, 453, 7, "BH1 · 2 kW", G, FLOAT, "l"),
    (324, 494, 7, "platenwisselaar", G, FLOAT, "l"),
    (311, 651, 7, "TH2", G, FLOAT, "l"),
    (482, 431, 7, "wisselaar", G, FLOAT, "c"),
    (482, 441, 7, "tapwater", G, FLOAT, "c"),
    (436, 682, 7, "pomp 1", G, FLOAT, "c"),
    (474, 682, 7, "filter", G, FLOAT, "c"),
    (504, 682, 7, "THW2", G, FLOAT, "c"),
    (535, 682, 7, "debiet", G, FLOAT, "c"),
    (596, 121, 7, "warm tapwater", G, FLOAT, "l"),
    (596, 152, 7, "koud leidingwater", G, FLOAT, "l"),
    (615, 220, 7, "tapvoeler", G, FLOAT, "l"),
    # tapwatervat
    (605, 383, 8, "THW5A", "bold", FRONT_TANK, "l"),
    (605, 429, 8, "THW5B", "bold", FRONT_TANK, "l"),
    (586, 477, 10, "tapwatervat", "bold", FRONT_TANK, "c"),
    (586, 493, 10, "200 L", "bold", FRONT_TANK, "c"),
    (543, 319, 7, "doel", "bold", FRONT_TANK, "l"),
    (585, 319, 7, "°C · Normal", "bold", FRONT_TANK, "l"),
    # woning
    (766, 65, 10, "2E VERDIEPING", "bold", FLOAT, "l"),
    (766, 272, 10, "1E VERDIEPING", "bold", FLOAT, "l"),
    (766, 480, 10, "BEGANE GROND", "bold", FLOAT, "l"),
    (806, 219, 7, "verdeler", G, -60, "l"),
    (806, 425, 7, "verdeler", G, -60, "l"),
    (806, 632, 7, "verdeler", G, -60, "l"),
    (806, 228, 6, "3 lussen, stelmotor op aanvoer", G, -60, "l"),
    (806, 434, 6, "5 lussen, 4 met kraan", G, -60, "l"),
    (806, 641, 6, "5 lussen, zonder kranen", G, -60, "l"),
    (968, 95, 7.5, "Slaapkamer 4", "bold", FLOAT, "l"),
    (968, 302, 7.5, "Slaapkamer 1", "bold", FLOAT, "l"),
    (968, 329, 7.5, "Slaapkamer 2", "bold", FLOAT, "l"),
    (968, 356, 7.5, "Slaapkamer 3", "bold", FLOAT, "l"),
    (968, 509, 7.5, "Woonkamer", "bold", FLOAT, "l"),
    (972, 418, 7, "badkamer", G, FLOAT, "l"),
    (972, 625, 7, "keuken", G, FLOAT, "l"),
    # möhlenhoff basisstation
    (740, 673, 9, "möhlenhoff", R, FRONT_MOHL, "l"),
    (885, 673, 7, "basisstation · alle thermostaten", "white", FRONT_MOHL, "l"),
    # stooklijn (regel met live waarden)
    (609, 770, 7, "buiten", "mono", FLOAT, "l"),
    (673, 770, 7, "°C → doel aanvoer", "mono", FLOAT, "l"),
    (811, 770, 7, "°C · FTC6", "mono", FLOAT, "l"),
    (900, 770, 7, "°C", "mono", FLOAT, "l"),
    # bedieningsscherm
    (40, 409, 5, "MITSUBISHI ELECTRIC", W, FRONT_CTRL, "l"),
]

LOOP_NAMES = {
    "2e": ["slaapkamer 4.1", "slaapkamer 4.2", "slaapkamer 4.3"],
    "1e": ["overloop", "badkamer (hand: open)", "slaapkamer 1", "slaapkamer 2", "slaapkamer 3"],
    "bg": ["woonkamer 1", "woonkamer 2", "woonkamer 3", "woonkamer 4", "woonkamer 5"],
}
# lussen met een stelmotor (kraan) op de verdeler, zoals in het dashboard
LOOP_ACTUATOR = {("1e", 1), ("1e", 2), ("1e", 3), ("1e", 4)}   # badkamer (handbediening, altijd open) + slaapkamer 1-3
# welke kamerthermostaat bepaalt of een lus open staat (None = geen aandrijving: altijd open), zoals het Ecodan Dashboard
LOOP_CONTROL = {
    "2e": ["slaapkamer_4"] * 3,                       # stelmotor op de aanvoer: alle lussen samen
    "1e": [None, None, "slaapkamer_1", "slaapkamer_2", "slaapkamer_3"],   # overloop en badkamer (hand) altijd open
    "bg": [None] * 5,                                 # geen aandrijving (meer) op de verdeler: altijd open
}
# lampjes op het basisstation: (soort, kamer)
LED_KIND = {"IN1": ("in1", None), "aan": ("power", None), "badkamer": ("room", "slaapkamer_1"),
            "slaapk. 1": ("room", "slaapkamer_1"), "slaapk. 2": ("room", "slaapkamer_2"), "slaapk. 3": ("room", "slaapkamer_3"),
            "2e verd.": ("room", "slaapkamer_4"), "beg. grond": ("room", "woonkamer")}
# stelmotor op de aanvoer van de hele verdeler (2e verdieping, zie foto)
MANIFOLD_ACTUATOR = {"2e"}

MOHL_LEDS = [(750, "IN1"), (791, "aan"), (832, "badkamer"), (873, "slaapk. 1"), (913, "slaapk. 2"),
             (954, "slaapk. 3"), (994, "2e verd."), (1034, "beg. grond")]

# eenheid achter elke live waarde (None = staat al in een label)
UNITS = {"buiten_temp": "°C", "heetgas": "°C", "compressor_hz": "Hz", "wifi": "dBm", "warm_leiding": "°C",
         "tapvoeler": "°C", "thw5a": "°C", "thw5b": "°C", "thw1": "°C", "platenwisselaar": "°C", "th2": "°C",
         "thw2": "°C", "debiet": "L/min", "slaapkamer_4": "°C", "slaapkamer_1": "°C", "slaapkamer_2": "°C",
         "slaapkamer_3": "°C", "woonkamer": "°C", "basisstation": "W", "vermogen_buiten": "W",
         "kwh_buiten": "kWh", "vermogen_binnen": "W", "kwh_binnen": "kWh"}
