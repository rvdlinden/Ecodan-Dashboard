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

DEFAULTS = {
    CONF_TITLE: "Ecodan",
    CONF_ICON: "mdi:heat-pump",
    CONF_URL_PATH: "ecodan",
    CONF_ADMIN_ONLY: False,
    CONF_THEME: "auto",
    CONF_PREFIX: "technische_ruimte_ecodan",
    CONF_VALVE_DHW: True,
    CONF_OVERRIDES: {},
}
