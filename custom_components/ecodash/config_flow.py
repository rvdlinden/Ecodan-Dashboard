"""Config- en optie-flow voor Ecodan Dashboard."""
from __future__ import annotations

import re
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    BooleanSelector,
    IconSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    ObjectSelector,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

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
)

URL_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
PREFIX_RE = re.compile(r"^[a-z0-9_]*$")
# Bereiken zoals op het Ecodan-display: buitentemperatuur −30…+35 °C, aanvoer 20…60 °C, verschuiving ±5 °C.
OUTDOOR = NumberSelector(NumberSelectorConfig(min=-30, max=35, step=1, mode=NumberSelectorMode.BOX, unit_of_measurement="°C"))
FLOW = NumberSelector(NumberSelectorConfig(min=20, max=60, step=1, mode=NumberSelectorMode.BOX, unit_of_measurement="°C"))
SHIFT = NumberSelector(NumberSelectorConfig(min=-5, max=5, step=1, mode=NumberSelectorMode.BOX, unit_of_measurement="°C"))


def _panel_schema(d: dict[str, Any]) -> dict:
    return {
        vol.Required(CONF_TITLE, default=d[CONF_TITLE]): TextSelector(),
        vol.Required(CONF_ICON, default=d[CONF_ICON]): IconSelector(),
        vol.Required(CONF_URL_PATH, default=d[CONF_URL_PATH]): TextSelector(),
        vol.Required(CONF_ADMIN_ONLY, default=d[CONF_ADMIN_ONLY]): BooleanSelector(),
        vol.Required(CONF_THEME, default=d[CONF_THEME]): SelectSelector(
            SelectSelectorConfig(options=["light", "dark", "auto"], translation_key="thema",
                                 mode=SelectSelectorMode.DROPDOWN)),
    }


def _data_schema(d: dict[str, Any]) -> dict:
    return {
        vol.Required(CONF_PREFIX, default=d[CONF_PREFIX]): TextSelector(),
        vol.Required(CONF_VALVE_DHW, default=d[CONF_VALVE_DHW]): BooleanSelector(),
        vol.Required(CONF_CURVE_OUT_COLD, default=d[CONF_CURVE_OUT_COLD]): OUTDOOR,
        vol.Required(CONF_CURVE_FLOW_COLD, default=d[CONF_CURVE_FLOW_COLD]): FLOW,
        vol.Required(CONF_CURVE_OUT_WARM, default=d[CONF_CURVE_OUT_WARM]): OUTDOOR,
        vol.Required(CONF_CURVE_FLOW_WARM, default=d[CONF_CURVE_FLOW_WARM]): FLOW,
        vol.Required(CONF_CURVE_MID, default=d[CONF_CURVE_MID]): BooleanSelector(),
        vol.Required(CONF_CURVE_MID_OUT, default=d[CONF_CURVE_MID_OUT]): OUTDOOR,
        vol.Required(CONF_CURVE_MID_FLOW, default=d[CONF_CURVE_MID_FLOW]): FLOW,
        vol.Required(CONF_CURVE_SHIFT, default=d[CONF_CURVE_SHIFT]): SHIFT,
        vol.Optional(CONF_OVERRIDES, default=d[CONF_OVERRIDES]): ObjectSelector(),
    }


def _validate(user_input: dict[str, Any]) -> dict[str, str]:
    errors: dict[str, str] = {}
    if CONF_URL_PATH in user_input:
        user_input[CONF_URL_PATH] = user_input[CONF_URL_PATH].strip().strip("/").lower()
        if not URL_RE.match(user_input[CONF_URL_PATH]):
            errors[CONF_URL_PATH] = "invalid_url_path"
    if CONF_PREFIX in user_input:
        user_input[CONF_PREFIX] = user_input[CONF_PREFIX].strip().strip("_").lower()
        if not PREFIX_RE.match(user_input[CONF_PREFIX]):
            errors[CONF_PREFIX] = "invalid_prefix"
    if CONF_OVERRIDES in user_input and not isinstance(user_input[CONF_OVERRIDES] or {}, dict):
        errors[CONF_OVERRIDES] = "invalid_overrides"
    if CONF_CURVE_OUT_COLD in user_input:
        cold, warm = user_input[CONF_CURVE_OUT_COLD], user_input[CONF_CURVE_OUT_WARM]
        if cold >= warm:
            errors[CONF_CURVE_OUT_WARM] = "curve_order"
        elif user_input[CONF_CURVE_FLOW_COLD] < user_input[CONF_CURVE_FLOW_WARM]:
            errors[CONF_CURVE_FLOW_WARM] = "curve_flow"
        elif user_input.get(CONF_CURVE_MID) and not cold < user_input[CONF_CURVE_MID_OUT] < warm:
            errors[CONF_CURVE_MID_OUT] = "curve_mid"
    return errors


class EcodashConfigFlow(ConfigFlow, domain=DOMAIN):
    """Eenmalige installatie: alleen de zijbalk-instellingen."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                return self.async_create_entry(title=user_input[CONF_TITLE], data={},
                                               options={**DEFAULTS, **user_input})
        d = {**DEFAULTS, **(user_input or {})}
        return self.async_show_form(step_id="user", data_schema=vol.Schema(_panel_schema(d)), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return EcodashOptionsFlow()


class EcodashOptionsFlow(OptionsFlow):
    """Alle opties wijzigen na installatie."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        current = {**DEFAULTS, **self.config_entry.options}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                user_input.setdefault(CONF_OVERRIDES, {})
                if user_input[CONF_TITLE] != self.config_entry.title:
                    self.hass.config_entries.async_update_entry(self.config_entry, title=user_input[CONF_TITLE])
                return self.async_create_entry(data={**current, **user_input})
        d = {**current, **(user_input or {})}
        return self.async_show_form(step_id="init",
                                    data_schema=vol.Schema({**_panel_schema(d), **_data_schema(d)}),
                                    errors=errors)
