"""Fork (matt/single-pane, FORK.md §3/§4/§6): persisted keys added by the fork
pass the canonical Voluptuous schema, are bounded, and survive round trips."""
import json
import os
from pathlib import Path

import pytest
import voluptuous as vol

from pure_imports import load_pure

_HOUSEPLAN_ROOT = Path(os.path.dirname(os.path.dirname(__file__))) / "custom_components" / "houseplan"
v = load_pure("hp_validation_fork", _HOUSEPLAN_ROOT / "validation.py")


def _space(**extra):
    return {"id": "main", "title": "Main", "view_box": [0, 0, 1, 1], "rooms": [], **extra}


REGIONS = [
    {"id": "rack", "x": 0.395, "y": 0.115, "w": 0.09, "h": 0.12, "room_id": "living"},
    {"id": "udm", "x": 0.402, "y": 0.128, "w": 0.076, "h": 0.022, "parent_id": "rack",
     "name": "UDM", "future": {"kept": True}},
]


def test_fork_focus_regions_round_trip_losslessly():
    config = {"spaces": [_space(focus_regions=REGIONS)], "markers": []}
    validated = v.CONFIG_SCHEMA(json.loads(json.dumps(config)))
    assert validated["spaces"][0]["focus_regions"] == REGIONS
    # Absent stays absent: old configs are untouched.
    assert "focus_regions" not in v.CONFIG_SCHEMA({"spaces": [_space()], "markers": []})["spaces"][0]


@pytest.mark.parametrize("broken", [
    {"id": "", "x": 0, "y": 0, "w": 1, "h": 1},
    {"id": "a", "x": 0, "y": 0, "w": 0, "h": 1},
    {"id": "a", "x": 0, "y": 0, "w": 1, "h": -1},
    {"id": "a", "x": 1e9, "y": 0, "w": 1, "h": 1},
    {"id": "a", "x": float("nan"), "y": 0, "w": 1, "h": 1},
    {"id": "a", "x": 0, "y": 0, "w": 1, "h": 1, "parent_id": 5},
    {"id": "a", "x": 0, "y": 0, "w": 1, "h": 1, "room_id": "x" * 65},
    {"id": "a", "y": 0, "w": 1, "h": 1},
])
def test_fork_focus_regions_reject_malformed_records(broken):
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [_space(focus_regions=[broken])], "markers": []})


def test_fork_focus_regions_are_bounded_and_unique():
    dup = [REGIONS[0], {**REGIONS[0]}]
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [_space(focus_regions=dup)], "markers": []})
    many = [{"id": f"r{i}", "x": 0, "y": 0, "w": 1, "h": 1} for i in range(v.MAX_FOCUS_REGIONS + 1)]
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [_space(focus_regions=many)], "markers": []})


def test_fork_marker_callout_action():
    marker = {"id": "m", "binding": "entity:switch.rack", "tap_action": "callout"}
    validated = v.CONFIG_SCHEMA({"spaces": [], "markers": [marker]})
    assert validated["markers"][0]["tap_action"] == "callout"
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [], "markers": [{**marker, "tap_action": "popover"}]})


def test_fork_marker_ghost_presentation():
    marker = {"id": "m", "binding": "virtual", "presentation": "ghost"}
    assert v.CONFIG_SCHEMA({"spaces": [], "markers": [marker]})["markers"][0]["presentation"] == "ghost"
    assert v.CONFIG_SCHEMA({"spaces": [], "markers": [{**marker, "presentation": None}]})["markers"][0]["presentation"] is None
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [], "markers": [{**marker, "presentation": "glass"}]})


@pytest.mark.parametrize("reveal", ["room", "region:fr_rack", {"min_zoom": 4}, None])
def test_fork_reveal_on_markers_and_decor(reveal):
    marker = {"id": "m", "binding": "virtual", "reveal": reveal}
    decor = {"id": "d", "kind": "rect", "x": 0.1, "y": 0.1, "w": 0.1, "h": 0.1, "reveal": reveal}
    out = v.CONFIG_SCHEMA({"spaces": [_space(decor=[decor])], "markers": [marker]})
    assert out["markers"][0]["reveal"] == reveal
    assert out["spaces"][0]["decor"][0]["reveal"] == reveal


@pytest.mark.parametrize("bad", ["house", "region:", {"min_zoom": 0}, {"min_zoom": 100}, 3])
def test_fork_reveal_rejects_unknown_rules(bad):
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [], "markers": [{"id": "m", "binding": "virtual", "reveal": bad}]})


def test_matt2_marker_keys_round_trip_and_bound():
    marker = {
        "id": "m", "binding": "entity:light.mini_lanterns",
        "inactive_presentation": "ghost", "hide_badge_when_inactive": True,
        "badge_hide_when": ["0", "unknown", "unavailable", "primary_off"],
        "actions": [{"entity": "script.lanterns_candle", "icon": "mdi:candle", "name": "Candle"}],
        "extra_entities": ["select.lantern_scene", "switch.heater_oscillation"],
    }
    out = v.CONFIG_SCHEMA({"spaces": [], "markers": [marker]})["markers"][0]
    assert {k: out[k] for k in marker} == marker
    for bad in (
        {"inactive_presentation": "glass"},
        {"actions": [{"entity": "light.x"}]},
        {"actions": [{"entity": f"script.s{i}"} for i in range(13)]},
        {"extra_entities": ["not an id"]},
        {"badge_hide_when": [""]},
    ):
        with pytest.raises(vol.Invalid):
            v.CONFIG_SCHEMA({"spaces": [], "markers": [{**marker, **bad}]})


@pytest.mark.parametrize("hold", ["callout", "card", None])
def test_matt3_hold_action_round_trips(hold):
    marker = {"id": "m", "binding": "entity:switch.heater", "hold_action": hold}
    out = v.CONFIG_SCHEMA({"spaces": [], "markers": [marker]})["markers"][0]
    assert out["hold_action"] == hold


@pytest.mark.parametrize("bad", ["toggle", "more-info", 1, True])
def test_matt3_hold_action_rejects_other_values(bad):
    with pytest.raises(vol.Invalid):
        v.CONFIG_SCHEMA({"spaces": [], "markers": [{"id": "m", "binding": "virtual", "hold_action": bad}]})
