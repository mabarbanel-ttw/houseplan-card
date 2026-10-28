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
