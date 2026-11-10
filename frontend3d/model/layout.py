"""Alle posities in pixels van het originele dashboard (1080 x 889).
In het model: X = pixel-x, Z = pixel-y (1 px = 1 cm), Y = hoogte."""

# ----------------------------------------------------------------- live waarden
# key: (x0, x1, y0, y1, hoogte_oppervlak, stijl)
#   stijl: 'big' = vet wit, 'mono' = grijs mono, 'lcd' = bedieningsscherm
TEXTS = {
    "buiten_temp":        (206, 229, 113, 127, 14, "big"),
    "heetgas":            (256, 281, 123, 134, 0, "mono"),
    "compressor_hz":      (192, 208, 180, 193, 14, "big"),
    "wifi":               (515, 537, 85, 98, 8, "big"),
    "in1":                (594, 619, 105, 117, 0, "mono"),
    "warm_leiding":       (629, 651, 135, 146, 0, "mono"),
    "tapvoeler":          (615, 638, 228, 239, 0, "mono"),
    "tap_doel":           (569, 582, 313, 325, 8, "big"),
    "thw5a":              (594, 619, 390, 405, 8, "big"),
    "thw5b":              (594, 619, 436, 450, 8, "big"),
    "thw1":               (351, 376, 411, 424, 0, "mono"),
    "bh1":                (369, 391, 461, 472, 0, "mono"),
    "platenwisselaar":    (334, 355, 501, 514, 0, "mono"),
    "th2":                (306, 328, 673, 685, 0, "mono"),
    "pomp1":              (424, 446, 636, 647, 0, "mono"),
    "thw2":               (482, 506, 639, 651, 0, "mono"),
    "debiet":             (561, 581, 641, 653, 0, "mono"),
    "datum_tijd":         (134, 243, 423, 436, 6, "lcd"),
    "scherm_tapwater":    (191, 207, 468, 482, 6, "lcd"),
    "stooklijn_verschuiving": (164, 209, 500, 533, 6, "lcd"),
    "slaapkamer_4":       (967, 990, 99, 111, 0, "big"),
    "slaapkamer_1":       (967, 990, 306, 319, 0, "big"),
    "slaapkamer_2":       (967, 990, 333, 345, 0, "big"),
    "slaapkamer_3":       (967, 990, 360, 372, 0, "big"),
    "woonkamer":          (967, 990, 513, 525, 0, "big"),
    "basisstation":       (1026, 1041, 667, 679, 6, "mono"),
    "vermogen_buiten":    (269, 293, 803, 811, 6, "mono"),
    "kwh_buiten":         (259, 289, 787, 799, 6, "mono"),
    "vermogen_binnen":    (386, 410, 803, 811, 6, "mono"),
    "kwh_binnen":         (376, 406, 787, 799, 6, "mono"),
    "kwh_buiten_tekst":   (109, 127, 828, 840, 0, "mono"),
    "stooklijn_buiten":   (649, 671, 763, 777, 0, "mono"),
    "stooklijn_doel":     (782, 809, 763, 777, 0, "mono"),
    "stooklijn_ftc6":     (871, 898, 763, 777, 0, "mono"),
    "stooklijn_param":    (880, 1050, 740, 750, 0, "mono"),
}
# vlakken die gewist worden zonder live tekst ervoor in de plaats
ERASE_ONLY = [(38, 150, 324, 336)]          # "pomp 1 stand 0 · 0 W"

# ----------------------------------------------------------------- opgetilde blokken (bovenkant = dashboardplaatje)
# naam: (x0, x1, y0, y1, hoogte)
BLOCKS = {
    "buitenunit":          (36, 252, 67, 293, 14),
    "ftc6_regelaar":       (503, 666, 50, 102, 8),
    "bedieningsscherm":    (25, 265, 397, 607, 6),
    "expansievat":         (344, 377, 127, 165, 10),
    "platenwisselaar":     (335, 371, 517, 644, 10),
    "wisselaar_tapwater":  (464, 500, 342, 422, 10),
    "verdeler_2e":         (774, 796, 84, 205, 12),
    "verdeler_1e":         (774, 796, 291, 412, 12),
    "verdeler_bg":         (774, 796, 498, 619, 12),
    "thermostaat_4":       (937, 964, 86, 112, 6),
    "thermostaat_1":       (937, 964, 293, 319, 6),
    "thermostaat_2":       (937, 964, 320, 345, 6),
    "thermostaat_3":       (937, 964, 347, 373, 6),
    "thermostaat_woonkamer": (937, 964, 500, 525, 6),
    "kwh_meter_buiten":    (228, 336, 752, 794, 6),
    "kwh_meter_binnen":    (345, 453, 752, 794, 6),
    "basisstation_mohlenhoff": (730, 1057, 662, 707, 6),
}

# ----------------------------------------------------------------- leidingen
# punten (x, y) in pixels; hops = kruisingen waar deze leiding overheen springt
PIPES = {
    # koudemiddel R32
    "pipe_r32_heetgas":    dict(pts=[(252, 144), (317, 144), (317, 527), (343, 527), (343, 545)], kind="r32_gas"),
    "pipe_r32_vloeistof":  dict(pts=[(252, 165), (304, 165), (304, 635), (343, 635), (343, 620)], kind="r32_vloeistof", rev=True),
    # CV aanvoer: platenwisselaar -> BH1 -> 3-wegklep
    "pipe_cv_aanvoer":     dict(pts=[(362, 545), (362, 528), (404, 528), (404, 366)], kind="cv"),
    # 3-wegklep -> vloerverwarming (incl. expansievat-leiding)
    "pipe_vloer_aanvoer":  dict(pts=[(404, 348), (404, 204), (750, 204)], hops=[(585, 204), (661, 204), (709, 204), (730, 204)], kind="vloer_aanvoer"),
    "pipe_expansie":       dict(pts=[(360, 107), (360, 390), (404, 390)], kind="vloer_aanvoer", flow=False),
    "pipe_vloer_stijg_aanvoer_op": dict(pts=[(750, 204), (750, 92)], kind="vloer_aanvoer"),
    "pipe_vloer_stijg_aanvoer_neer": dict(pts=[(750, 204), (750, 509)], kind="vloer_aanvoer"),
    # 3-wegklep -> wisselaar tapwater (primair)
    "pipe_tank_aanvoer":   dict(pts=[(413, 357), (464, 357)], kind="tank_aanvoer"),
    "pipe_tank_retour":    dict(pts=[(464, 410), (451, 410), (451, 625), (558, 625), (558, 663)], kind="tank_retour"),
    # tapwatercircuit (secundair, via pomp 18)
    "pipe_tapcircuit_warm": dict(pts=[(500, 357), (509, 357), (509, 278), (538, 278), (538, 440), (545, 448)], kind="tapcircuit_warm"),
    "pipe_tapcircuit_koud": dict(pts=[(500, 410), (509, 410), (509, 565), (545, 565), (560, 570), (571, 581), (575, 595), (575, 609)], kind="tapcircuit_koud", rev=True),
    # CV retour
    "pipe_retour":         dict(pts=[(362, 620), (362, 635), (382, 635), (382, 663), (558, 663)], kind="retour", rev=True),
    "pipe_vloer_retour":   dict(pts=[(558, 663), (676, 663), (676, 285), (730, 285)], hops=[(709, 285)], kind="vloer_retour", rev=True),
    "pipe_vloer_stijg_retour_op": dict(pts=[(730, 607), (730, 285)], kind="vloer_retour"),
    "pipe_vloer_stijg_retour_neer": dict(pts=[(730, 194), (730, 285)], kind="vloer_retour"),
    # tapwater (staat altijd onder druk -> vaste kleur)
    "pipe_warm_tapwater":  dict(pts=[(625, 266), (625, 287), (621, 295), (613, 299), (597, 299), (589, 295), (585, 287),
                                     (585, 131), (709, 131), (709, 646), (955, 646), (955, 632)], kind="warm"),
    "pipe_warm_badkamer":  dict(pts=[(709, 438), (955, 438), (955, 426)], hops=[(730, 438), (750, 438)], kind="warm"),
    "pipe_koud_water":     dict(pts=[(696, 163), (661, 163), (661, 573), (632, 573), (621, 579), (615, 590), (614, 611)], kind="koud"),
    "pipe_koud_inlaat":    dict(pts=[(603, 611), (624, 611)], kind="koud"),
    # elektra naar de meterkast
    "kabel_buitenunit":    dict(pts=[(252, 257), (281, 257), (281, 752)], kind="kabel", rev=True),   # stroom: meterkast -> unit
    "kabel_binnenunit":    dict(pts=[(398, 696), (398, 752)], kind="kabel", rev=True),
}

# vloerlussen: verdieping -> lijst van lus-middens (y), loopt van x 806 tot 913
LOOPS = {
    "2e": [94, 143.5, 192],
    "1e": [301.5, 325.5, 350.5, 374.5, 398.5],
    "bg": [508.5, 532.5, 556.5, 581, 605.5],
}
LOOP_X = (806, 913)

# ----------------------------------------------------------------- bewegende / schakelende componenten
FAN = dict(c=(108, 192), r=52)
COMPRESSOR = (187, 233, 199, 265)
TANK = (522, 649, 257, 617)
VALVE_3WEG = (405, 357)
BH1 = (395, 415, 437, 484)
POMP1 = (435, 662)
POMP18 = (509, 292)

# vloerplaten (bovenkant, dashboard-y) en meanderzone
FLOOR_TOP = {"2e": 236, "1e": 444, "bg": 652}
FLOOR_X = (800, 1062)
FLOOR_Z = (-88, 90)
MEANDER_X = (818, 1056)
MEANDER_Z = (-18, 82)

# aftakking van de stijgleidingen per verdieping (dashboard-y): aanvoer, retour
BRANCH_Y = {"2e": (95, 194), "1e": (301, 399), "bg": (509, 607)}

# stooklijn-grafiek (STOOKLIJN-vak onderaan): plotgebied in dashboard-pixels en de assen zoals het Ecodan-display
CHART = dict(x0=600, x1=1045, y_top=752, y_bot=872, tmin=-30, tmax=35, fmin=20, fmax=60, z=0)
