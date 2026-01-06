#!/usr/bin/env python3
"""
Fix missile rack loadouts in Ship Lens.
Extracts actual missile slots from P4K game data and updates ship JSONs.
"""

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Paths
P4K_DATA = Path("/home/kengonza/Tools/unp4k/Data")
SHIPS_XML_DIR = P4K_DATA / "libs/foundry/records/entities/spaceships"
SHIP_LENS_DATA = Path("/home/kengonza/Documents/ShipLens/data")
SHIPS_JSON_DIR = SHIP_LENS_DATA / "ships"

def extract_missiles_from_xml(ship_xml_path: Path) -> Dict[str, List[Tuple[int, str]]]:
    """
    Extract missile loadouts from a ship XML.
    Returns dict mapping hardpoint name to list of (size, missile_id) tuples.
    """
    try:
        tree = ET.parse(ship_xml_path)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f"  Error parsing {ship_xml_path.name}: {e}")
        return {}

    missile_loadouts = {}

    # Find all missile rack entries
    for entry in root.iter('SItemPortLoadoutEntryParams'):
        port_name = entry.get('itemPortName', '').lower()
        entity_class = entry.get('entityClassName', '')

        # Check if this is a missile rack (MRCK_*)
        if entity_class.upper().startswith('MRCK_'):
            missiles = []

            # Find nested missile entries
            for sub_entry in entry.iter('SItemPortLoadoutEntryParams'):
                sub_port = sub_entry.get('itemPortName', '').lower()
                sub_entity = sub_entry.get('entityClassName', '')

                # Check if this is a missile (MISL_*)
                if sub_entity.upper().startswith('MISL_'):
                    # Extract size from missile name (e.g., MISL_S02_IR_FSKI_Ignite -> 2)
                    size_match = re.search(r'MISL_S(\d+)', sub_entity, re.I)
                    size = int(size_match.group(1)) if size_match else 2
                    missiles.append((size, sub_entity.lower()))

            if missiles:
                missile_loadouts[port_name] = missiles

        # Also check for torpedo racks
        elif 'torpedo' in port_name and entity_class.upper().startswith('MRCK_'):
            torpedoes = []
            for sub_entry in entry.iter('SItemPortLoadoutEntryParams'):
                sub_entity = sub_entry.get('entityClassName', '')
                if sub_entity.upper().startswith('MISL_'):
                    size_match = re.search(r'MISL_S(\d+)', sub_entity, re.I)
                    size = int(size_match.group(1)) if size_match else 5
                    torpedoes.append((size, sub_entity.lower()))
            if torpedoes:
                missile_loadouts[port_name] = torpedoes

    return missile_loadouts

def find_ship_xml(ship_filename: str) -> Optional[Path]:
    """Find the matching XML file for a ship."""
    xml_name = f"{ship_filename}.xml"
    xml_path = SHIPS_XML_DIR / xml_name
    if xml_path.exists():
        return xml_path

    xml_path = SHIPS_XML_DIR / xml_name.lower()
    if xml_path.exists():
        return xml_path

    for xml_file in SHIPS_XML_DIR.glob("*.xml"):
        if xml_file.stem.lower() == ship_filename.lower():
            return xml_file

    return None

def load_weapons_database() -> dict:
    """Load the weapons database."""
    weapons_path = SHIP_LENS_DATA / "weapons.json"
    try:
        with open(weapons_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading weapons database: {e}")
        return {}

def main():
    print("Ship Lens - Missile Loadout Fixer")
    print("=" * 50)

    # Load weapons database
    weapons_db = load_weapons_database()
    print(f"Loaded {len(weapons_db)} weapons\n")

    total_ships = 0
    ships_updated = 0
    total_missiles_fixed = 0

    for json_path in sorted(SHIPS_JSON_DIR.glob("*.json")):
        total_ships += 1

        with open(json_path, 'r') as f:
            ship_data = json.load(f)

        ship_filename = ship_data.get('filename', json_path.stem.lower())
        xml_path = find_ship_xml(ship_filename)

        if not xml_path:
            continue

        # Extract missile loadouts from XML
        missile_loadouts = extract_missiles_from_xml(xml_path)

        if not missile_loadouts:
            continue

        # Update ship data
        missiles_fixed = 0
        for hp in ship_data.get('weapon_hardpoints', []):
            port_name = hp.get('port_name', '').lower()

            if port_name in missile_loadouts:
                missiles = missile_loadouts[port_name]

                # Create correct sub_ports structure
                new_sub_ports = []
                for size, missile_id in missiles:
                    # Verify missile exists in database
                    if missile_id in weapons_db:
                        new_sub_ports.append({
                            'size': size,
                            'default_weapon': missile_id
                        })
                    else:
                        # Still add it, might be valid
                        new_sub_ports.append({
                            'size': size,
                            'default_weapon': missile_id
                        })

                if new_sub_ports and new_sub_ports != hp.get('sub_ports', []):
                    old_count = len(hp.get('sub_ports', []))
                    new_count = len(new_sub_ports)
                    hp['sub_ports'] = new_sub_ports
                    missiles_fixed += new_count
                    if old_count != new_count:
                        print(f"  {json_path.name}: {port_name} {old_count} -> {new_count} missiles")

        if missiles_fixed > 0:
            with open(json_path, 'w') as f:
                json.dump(ship_data, f, indent=2)
            ships_updated += 1
            total_missiles_fixed += missiles_fixed

    print("\n" + "=" * 50)
    print(f"Summary:")
    print(f"  Ships processed: {total_ships}")
    print(f"  Ships updated: {ships_updated}")
    print(f"  Total missile slots fixed: {total_missiles_fixed}")

if __name__ == '__main__':
    main()
