#!/usr/bin/env python3
"""
Extract default weapon loadouts from Star Citizen P4K game data.
Updates Ship Lens JSON files with correct default weapons.
"""

import json
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

# Paths
P4K_DATA = Path("/home/kengonza/Tools/unp4k/Data")
SHIPS_XML_DIR = P4K_DATA / "libs/foundry/records/entities/spaceships"
SCITEM_DIR = P4K_DATA / "libs/foundry/records/entities/scitem"
SHIP_LENS_DATA = Path("/home/kengonza/Documents/ShipLens/data")
SHIPS_JSON_DIR = SHIP_LENS_DATA / "ships"

# Weapon categories to extract
WEAPON_HARDPOINT_PATTERNS = [
    r'hardpoint_gun',
    r'hardpoint_weapon',
    r'hardpoint_turret',
    r'hardpoint_missile',
    r'hardpoint_torpedo',
    r'hardpoint_pdc',
    r'hardpoint_nose',
    r'hardpoint_tail',
    r'hardpoint_front',
    r'hardpoint_rear',
    r'hardpoint_left',
    r'hardpoint_right',
    r'hardpoint_top',
    r'hardpoint_bottom',
    r'hardpoint_laser',
    r'hardpoint_cannon',
]

# Patterns for weapons (to identify weapon entity class names)
WEAPON_PATTERNS = [
    r'^[A-Z]{4}_',  # Manufacturer prefix (BEHR_, KLWE_, AMRS_, etc.)
    r'LaserCannon',
    r'LaserRepeater',
    r'BallisticCannon',
    r'BallisticGatling',
    r'MassDriver',
    r'Distortion',
    r'MISL_',
    r'_S\d+$',  # Size suffix
]

@dataclass
class WeaponSlot:
    size: int
    default_weapon: Optional[str]

@dataclass
class Hardpoint:
    port_name: str
    mount_name: str
    sub_ports: List[WeaponSlot] = field(default_factory=list)

def is_weapon_class(name: str) -> bool:
    """Check if an entity class name looks like a weapon."""
    if not name:
        return False
    name_upper = name.upper()
    # Common weapon prefixes
    weapon_prefixes = ['BEHR_', 'KLWE_', 'AMRS_', 'GATS_', 'APAR_', 'KRIG_',
                       'VNCL_', 'TALN_', 'MISL_', 'AEGS_', 'ANVL_', 'HURSTON_',
                       'JOKER_', 'MAXOX_', 'KBAR_', 'SPCD_']
    for prefix in weapon_prefixes:
        if name_upper.startswith(prefix):
            return True
    # Check for weapon keywords
    weapon_keywords = ['LASER', 'CANNON', 'REPEATER', 'GATLING', 'BALLISTIC',
                       'MASS', 'DRIVER', 'DISTORTION', 'TORPEDO', 'MISSILE']
    for kw in weapon_keywords:
        if kw in name_upper:
            return True
    return False

def is_turret_mount(name: str) -> bool:
    """Check if an entity class name is a turret mount."""
    if not name:
        return False
    name_lower = name.lower()
    return 'turret' in name_lower or 'mount' in name_lower

def is_missile_rack(name: str) -> bool:
    """Check if an entity class name is a missile rack."""
    if not name:
        return False
    name_upper = name.upper()
    return name_upper.startswith('MRCK_')

def parse_loadout_entry(entry: ET.Element, depth: int = 0) -> List[Tuple[str, str]]:
    """
    Recursively parse a loadout entry to find weapons.
    Returns list of (hardpoint_name, weapon_class_name) tuples.
    """
    results = []

    port_name = entry.get('itemPortName', '')
    entity_class = entry.get('entityClassName', '')

    # If this entry has a weapon, record it
    if entity_class and is_weapon_class(entity_class):
        results.append((port_name, entity_class.lower()))

    # Check nested loadouts
    for loadout in entry.findall('.//loadout'):
        for manual_params in loadout.findall('.//SItemPortLoadoutManualParams'):
            for entries in manual_params.findall('.//entries'):
                for sub_entry in entries.findall('.//SItemPortLoadoutEntryParams'):
                    results.extend(parse_loadout_entry(sub_entry, depth + 1))

    # Also check direct nested entries
    for sub_entry in entry.findall('.//SItemPortLoadoutEntryParams'):
        if sub_entry != entry:  # Avoid infinite recursion
            results.extend(parse_loadout_entry(sub_entry, depth + 1))

    return results

def extract_ship_loadout(ship_xml_path: Path) -> Dict[str, List[str]]:
    """
    Extract weapon loadout from a ship XML file.
    Returns dict mapping hardpoint names to list of weapon class names.
    """
    try:
        tree = ET.parse(ship_xml_path)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f"  Error parsing {ship_xml_path.name}: {e}")
        return {}

    loadouts = {}

    # Find all loadout entries
    for entry in root.findall('.//SItemPortLoadoutEntryParams'):
        port_name = entry.get('itemPortName', '').lower()
        entity_class = entry.get('entityClassName', '')

        # Skip non-weapon hardpoints
        is_weapon_hp = any(re.search(pat, port_name, re.I) for pat in WEAPON_HARDPOINT_PATTERNS)
        if not is_weapon_hp:
            continue

        weapons = []

        # Case 1: Direct weapon on hardpoint
        if entity_class and is_weapon_class(entity_class):
            weapons.append(entity_class.lower())

        # Case 2: Mount/turret with nested weapons
        elif entity_class and (is_turret_mount(entity_class) or is_missile_rack(entity_class)):
            # Parse nested loadout for weapons
            nested_weapons = parse_loadout_entry(entry)
            for _, weapon in nested_weapons:
                if weapon and weapon not in weapons:
                    weapons.append(weapon)

        # Case 3: Check nested loadout anyway
        else:
            nested_weapons = parse_loadout_entry(entry)
            for _, weapon in nested_weapons:
                if weapon and weapon not in weapons:
                    weapons.append(weapon)

        if weapons:
            loadouts[port_name] = weapons

    return loadouts

def load_ship_json(ship_json_path: Path) -> Optional[dict]:
    """Load a ship JSON file."""
    try:
        with open(ship_json_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"  Error loading {ship_json_path.name}: {e}")
        return None

def save_ship_json(ship_json_path: Path, data: dict):
    """Save a ship JSON file."""
    with open(ship_json_path, 'w') as f:
        json.dump(data, f, indent=2)

def update_ship_with_loadout(ship_data: dict, loadouts: Dict[str, List[str]], weapons_db: dict) -> int:
    """
    Update ship JSON data with extracted loadout.
    Returns count of updated weapons.
    """
    updated = 0

    for hp in ship_data.get('weapon_hardpoints', []):
        port_name = hp.get('port_name', '').lower()

        # Find matching loadout
        weapons = loadouts.get(port_name, [])

        if not weapons:
            continue

        sub_ports = hp.get('sub_ports', [])

        # Update sub_ports with weapons
        for i, sp in enumerate(sub_ports):
            if sp.get('default_weapon') is None and i < len(weapons):
                weapon_id = weapons[i]
                # Verify weapon exists in our database
                if weapon_id in weapons_db:
                    sp['default_weapon'] = weapon_id
                    updated += 1
                else:
                    # Try without manufacturer prefix variations
                    print(f"    Warning: Weapon '{weapon_id}' not in database")

    return updated

def load_weapons_database() -> dict:
    """Load the weapons database."""
    weapons_path = SHIP_LENS_DATA / "weapons.json"
    try:
        with open(weapons_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading weapons database: {e}")
        return {}

def find_ship_xml(ship_filename: str) -> Optional[Path]:
    """Find the matching XML file for a ship."""
    # Try direct match
    xml_name = f"{ship_filename}.xml"
    xml_path = SHIPS_XML_DIR / xml_name
    if xml_path.exists():
        return xml_path

    # Try lowercase
    xml_path = SHIPS_XML_DIR / xml_name.lower()
    if xml_path.exists():
        return xml_path

    # Search for matching file
    for xml_file in SHIPS_XML_DIR.glob("*.xml"):
        if xml_file.stem.lower() == ship_filename.lower():
            return xml_file

    return None

def main():
    print("Ship Lens - P4K Loadout Extractor")
    print("=" * 50)

    # Load weapons database
    print("\nLoading weapons database...")
    weapons_db = load_weapons_database()
    print(f"  Loaded {len(weapons_db)} weapons")

    # Process each ship JSON
    print("\nProcessing ships...")

    total_ships = 0
    total_updated = 0
    ships_updated = 0

    for json_path in sorted(SHIPS_JSON_DIR.glob("*.json")):
        total_ships += 1
        ship_data = load_ship_json(json_path)
        if not ship_data:
            continue

        ship_filename = ship_data.get('filename', json_path.stem.lower())

        # Find corresponding XML
        xml_path = find_ship_xml(ship_filename)
        if not xml_path:
            # print(f"  {json_path.name}: No XML found for '{ship_filename}'")
            continue

        # Extract loadout from XML
        loadouts = extract_ship_loadout(xml_path)
        if not loadouts:
            continue

        # Update ship data
        updated = update_ship_with_loadout(ship_data, loadouts, weapons_db)

        if updated > 0:
            save_ship_json(json_path, ship_data)
            ships_updated += 1
            total_updated += updated
            print(f"  {json_path.name}: Updated {updated} weapons")

    print("\n" + "=" * 50)
    print(f"Summary:")
    print(f"  Total ships processed: {total_ships}")
    print(f"  Ships updated: {ships_updated}")
    print(f"  Total weapons updated: {total_updated}")

if __name__ == '__main__':
    main()
