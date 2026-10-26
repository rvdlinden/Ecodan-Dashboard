"""Ecodan Dashboard: een zijbalk-panel met het installatieschema van de Ecodan-warmtepomp.

De integratie serveert de frontend-bestanden uit deze map en registreert het panel.
Alle data haalt het panel zelf uit de websocket-sessie van de ingelogde gebruiker
(hass.states van de MELCloud-integratie en de kWh-meters, plus recorder-statistieken).
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import (
    CONF_ADMIN_ONLY,
    CONF_CURVE_FLOW_COLD,
    CONF_CURVE_FLOW_WARM,
    CONF_CURVE_MID,
    CONF_CURVE_MID_FLOW,
    CONF_CURVE_MID_OUT,
    CONF_CURVE_OUT_COLD,
    CONF_CURVE_OUT_WARM,
    CONF_CURVE_SHIFT,
    CONF_ICON,
    CONF_OVERRIDES,
    CONF_PREFIX,
    CONF_THEME,
    CONF_TITLE,
    CONF_URL_PATH,
    CONF_VALVE_DHW,
    DEFAULTS,
    DOMAIN,
    ROOM_SETPOINTS,
    STATIC_URL,
    WEBCOMPONENT,
)

_LOGGER = logging.getLogger(__name__)
FRONTEND_DIR = Path(__file__).parent / "frontend"


def _opt(entry: ConfigEntry, key: str):
    return entry.options.get(key, DEFAULTS[key])


def _file_hash() -> str:
    """Korte hash van de panel-JS, zodat browsers na een update de nieuwe versie laden."""
    data = (FRONTEND_DIR / "ecodash-panel.js").read_bytes()
    return hashlib.sha1(data).hexdigest()[:8]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Registreer statische bestanden en het panel."""
    store = hass.data.setdefault(DOMAIN, {})
    if not store.get("static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), False)]
        )
        store["static"] = True

    integration = await async_get_integration(hass, DOMAIN)
    file_hash = await hass.async_add_executor_job(_file_hash)

    panel_config = {
        "prefix": str(_opt(entry, CONF_PREFIX)).strip(),
        "klep_aan_is_tapwater": bool(_opt(entry, CONF_VALVE_DHW)),
        "thema": _opt(entry, CONF_THEME),
        "overrides": _opt(entry, CONF_OVERRIDES) or {},
        "stooklijn": {
            "koud": [float(_opt(entry, CONF_CURVE_OUT_COLD)), float(_opt(entry, CONF_CURVE_FLOW_COLD))],
            "warm": [float(_opt(entry, CONF_CURVE_OUT_WARM)), float(_opt(entry, CONF_CURVE_FLOW_WARM))],
            "midden": [float(_opt(entry, CONF_CURVE_MID_OUT)), float(_opt(entry, CONF_CURVE_MID_FLOW))]
            if _opt(entry, CONF_CURVE_MID) else None,
            "verschuiving": float(_opt(entry, CONF_CURVE_SHIFT)),
        },
        "instellingen": {room: float(_opt(entry, key)) for key, room in ROOM_SETPOINTS},
    }
    url_path = _opt(entry, CONF_URL_PATH)

    if url_path in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, url_path)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=url_path,
        webcomponent_name=WEBCOMPONENT,
        sidebar_title=_opt(entry, CONF_TITLE),
        sidebar_icon=_opt(entry, CONF_ICON),
        module_url=f"{STATIC_URL}/ecodash-panel.js?v={integration.version}-{file_hash}",
        embed_iframe=False,
        require_admin=bool(_opt(entry, CONF_ADMIN_ONLY)),
        config=panel_config,
    )
    store["url_path"] = url_path
    _LOGGER.debug("Ecodan-panel geregistreerd op /%s", url_path)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Verwijder het panel uit de zijbalk."""
    url_path = hass.data.get(DOMAIN, {}).pop("url_path", None)
    if url_path and url_path in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, url_path)
    return True
