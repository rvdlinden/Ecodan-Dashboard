"""Constanten voor de Ecodan Dashboard-integratie."""

DOMAIN = "ecodash"
STATIC_URL = "/ecodash_static"
WEBCOMPONENT = "ecodash-panel"

CONF_TITLE = "sidebar_title"
CONF_ICON = "sidebar_icon"
CONF_URL_PATH = "url_path"
CONF_ADMIN_ONLY = "require_admin"
CONF_THEME = "thema"
CONF_PREFIX = "prefix"
CONF_VALVE_DHW = "klep_aan_is_tapwater"
CONF_OVERRIDES = "overrides"
# Stooklijn zoals ingesteld op het Ecodan-display (de FTC6 geeft de punten niet door).
CONF_CURVE_OUT_COLD = "stooklijn_buiten_koud"      # buitentemperatuur van het koude punt
CONF_CURVE_FLOW_COLD = "stooklijn_aanvoer_koud"    # aanvoertemperatuur bij het koude punt (en kouder)
CONF_CURVE_OUT_WARM = "stooklijn_buiten_warm"      # buitentemperatuur van het warme punt
CONF_CURVE_FLOW_WARM = "stooklijn_aanvoer_warm"    # aanvoertemperatuur bij het warme punt (en warmer)
CONF_CURVE_MID = "stooklijn_middenpunt"            # optioneel derde punt (aanpassing op het display)
CONF_CURVE_MID_OUT = "stooklijn_midden_buiten"
CONF_CURVE_MID_FLOW = "stooklijn_midden_aanvoer"
CONF_CURVE_SHIFT = "stooklijn_verschuiving"        # verschuiving van de hele lijn in °C
# Ingestelde temperatuur op de (niet-slimme) Möhlenhoff-displays per kamer: optie-sleutel en kamernaam in het schema.
ROOM_SETPOINTS = [
    ("instelling_woonkamer", "Woonkamer"),
    ("instelling_slaapkamer_1", "Slaapkamer 1"),
    ("instelling_slaapkamer_2", "Slaapkamer 2"),
    ("instelling_slaapkamer_3", "Slaapkamer 3"),
    ("instelling_slaapkamer_4", "Slaapkamer 4"),
]

DEFAULTS = {
    CONF_TITLE: "Ecodan",
    CONF_ICON: "mdi:heat-pump",
    CONF_URL_PATH: "ecodan",
    CONF_ADMIN_ONLY: False,
    CONF_THEME: "auto",
    CONF_PREFIX: "technische_ruimte_ecodan",
    CONF_VALVE_DHW: True,
    CONF_OVERRIDES: {},
    CONF_CURVE_OUT_COLD: -7,
    CONF_CURVE_FLOW_COLD: 32,
    CONF_CURVE_OUT_WARM: 12,
    CONF_CURVE_FLOW_WARM: 24,
    CONF_CURVE_MID: False,
    CONF_CURVE_MID_OUT: 3,
    CONF_CURVE_MID_FLOW: 28,
    CONF_CURVE_SHIFT: 0,
    **{key: 20.0 for key, _ in ROOM_SETPOINTS},
}
