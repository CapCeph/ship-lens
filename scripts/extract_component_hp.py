#!/usr/bin/env python3
"""
Extract component HP data from Star Citizen P4K files and update Ship Lens JSON files.

Data Source: /home/kengonza/Tools/unp4k/Data/
Target: /home/kengonza/Documents/ShipLens/data/ships/*.json

Component HP is found in component XML files under:
<SHealthComponentParams Health="750" .../>

Component locations:
- Power plants: libs/foundry/records/entities/scitem/ships/powerplant/
- Coolers: libs/foundry/records/entities/scitem/ships/cooler/
- Shield generators: libs/foundry/records/entities/scitem/ships/shieldgenerator/
- Quantum drives: libs/foundry/records/entities/scitem/ships/quantumdrive/
- Thrusters: libs/foundry/records/entities/scitem/ships/thrusters/
- Turrets: libs/foundry/records/entities/scitem/ships/turret/
"""

import os
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Optional
import re

# Paths
P4K_DATA_DIR = "/home/kengonza/Tools/unp4k/Data"
SHIP_JSON_DIR = "/home/kengonza/Documents/ShipLens/data/ships"
SHIP_XML_DIR = os.path.join(P4K_DATA_DIR, "libs/foundry/records/entities/spaceships")

# Component directories
COMPONENT_DIRS = {
    'powerplant': 'libs/foundry/records/entities/scitem/ships/powerplant',
    'cooler': 'libs/foundry/records/entities/scitem/ships/cooler',
    'shield_generator': 'libs/foundry/records/entities/scitem/ships/shieldgenerator',
    'quantum_drive': 'libs/foundry/records/entities/scitem/ships/quantumdrive',
    'thruster': 'libs/foundry/records/entities/scitem/ships/thrusters',
    'turret': 'libs/foundry/records/entities/scitem/ships/turret',
}

def build_component_hp_lookup() -> tuple[Dict[str, int], Dict[str, str]]:
    """
    Build lookup dictionaries for component HP and GUID resolution.

    Returns:
        Tuple of (component name → HP, GUID → component name)
    """
    component_hp = {}
    guid_lookup = {}

    for component_type, rel_path in COMPONENT_DIRS.items():
        component_dir = os.path.join(P4K_DATA_DIR, rel_path)

        if not os.path.exists(component_dir):
            print(f"Warning: Component directory not found: {component_dir}")
            continue

        # Recursively find all XML files
        for root, dirs, files in os.walk(component_dir):
            for filename in files:
                if not filename.endswith('.xml'):
                    continue

                xml_path = os.path.join(root, filename)

                try:
                    tree = ET.parse(xml_path)
                    root_elem = tree.getroot()

                    # Extract component name from filename
                    component_name = filename.replace('.xml', '')

                    # Extract GUID from root element __ref attribute
                    guid = root_elem.get('__ref', '')
                    if guid and guid != '00000000-0000-0000-0000-000000000000':
                        guid_lookup[guid.lower()] = component_name.lower()

                    # Find SHealthComponentParams element
                    health_elem = root_elem.find('.//SHealthComponentParams')
                    if health_elem is not None and 'Health' in health_elem.attrib:
                        hp_value = int(float(health_elem.attrib['Health']))

                        # Store with lowercase key for case-insensitive lookup
                        component_hp[component_name.lower()] = hp_value

                except Exception as e:
                    print(f"Error parsing {xml_path}: {e}")

    print(f"Built component HP lookup with {len(component_hp)} components")
    print(f"Built GUID lookup with {len(guid_lookup)} entries")
    return component_hp, guid_lookup

def find_ship_xml(ship_json_name: str) -> Optional[str]:
    """
    Find the ship XML file for a given ship JSON filename.

    Args:
        ship_json_name: e.g., "aegs_gladius.json"

    Returns:
        Path to ship XML file, or None if not found
    """
    # Remove .json extension and convert to uppercase
    base_name = ship_json_name.replace('.json', '')

    # Search for XML file in spaceships directory
    for root, dirs, files in os.walk(SHIP_XML_DIR):
        for filename in files:
            if filename.endswith('.xml'):
                # Compare case-insensitive
                if filename.replace('.xml', '').lower() == base_name.lower():
                    return os.path.join(root, filename)

    return None

def extract_component_hp_from_ship(ship_xml_path: str, component_hp_lookup: Dict[str, int], guid_lookup: Dict[str, str]) -> Dict[str, int]:
    """
    Extract component HP totals from a ship XML file.

    Args:
        ship_xml_path: Path to ship XML file
        component_hp_lookup: Component name → HP lookup dictionary
        guid_lookup: GUID → component name lookup dictionary

    Returns:
        Dict with HP totals for each component type
    """
    hp_totals = {
        'turret_total_hp': 0,
        'powerplant_total_hp': 0,
        'cooler_total_hp': 0,
        'shield_gen_total_hp': 0,
        'qd_total_hp': 0,
        'thruster_total_hp': 0,
    }

    component_not_found = []

    try:
        tree = ET.parse(ship_xml_path)
        root = tree.getroot()

        # Find all loadout entries
        for loadout_entry in root.findall('.//SItemPortLoadoutEntryParams'):
            port_name = loadout_entry.get('itemPortName', '')

            # Get the entity class (component name) - try entityClassName first, then resolve GUID
            entity_class = loadout_entry.get('entityClassName', '')

            if not entity_class:
                # Try to resolve from GUID
                guid = loadout_entry.get('entityClassReference', '')
                if guid and guid != '00000000-0000-0000-0000-000000000000':
                    entity_class = guid_lookup.get(guid.lower(), '')

            if not entity_class:
                continue

            # Determine component type from port name
            port_lower = port_name.lower()
            component_type = None

            if 'turret' in port_lower:
                component_type = 'turret_total_hp'
            elif 'powerplant' in port_lower or 'power_plant' in port_lower:
                component_type = 'powerplant_total_hp'
            elif 'cooler' in port_lower:
                component_type = 'cooler_total_hp'
            elif 'shield_generator' in port_lower or 'shieldgenerator' in port_lower:
                component_type = 'shield_gen_total_hp'
            elif 'quantum' in port_lower or 'quantumdrive' in port_lower:
                component_type = 'qd_total_hp'
            elif 'thruster' in port_lower:
                component_type = 'thruster_total_hp'

            if component_type:
                # Look up HP
                entity_lower = entity_class.lower()
                if entity_lower in component_hp_lookup:
                    hp_totals[component_type] += component_hp_lookup[entity_lower]
                else:
                    component_not_found.append(f"{entity_class} (port: {port_name})")

        if component_not_found:
            print(f"  Components not found in HP lookup: {', '.join(component_not_found)}")

    except Exception as e:
        print(f"Error parsing ship XML {ship_xml_path}: {e}")

    return hp_totals

def update_ship_json_files(component_hp_lookup: Dict[str, int], guid_lookup: Dict[str, str]):
    """
    Update all ship JSON files with component HP data.

    Args:
        component_hp_lookup: Component name → HP lookup dictionary
        guid_lookup: GUID → component name lookup dictionary
    """
    ship_json_files = sorted(Path(SHIP_JSON_DIR).glob('*.json'))

    updated_count = 0
    skipped_count = 0

    for json_path in ship_json_files:
        ship_name = json_path.name

        # Find corresponding ship XML
        ship_xml_path = find_ship_xml(ship_name)

        if not ship_xml_path:
            print(f"Skipping {ship_name}: XML not found")
            skipped_count += 1
            continue

        # Extract component HP from ship XML
        hp_totals = extract_component_hp_from_ship(ship_xml_path, component_hp_lookup, guid_lookup)

        # Check if any HP values were found
        if sum(hp_totals.values()) == 0:
            print(f"Skipping {ship_name}: No component HP data found")
            skipped_count += 1
            continue

        # Read ship JSON
        try:
            with open(json_path, 'r') as f:
                ship_data = json.load(f)

            # Ensure components object exists
            if 'components' not in ship_data:
                ship_data['components'] = {}

            # Ensure thrusters object exists
            if 'thrusters' not in ship_data:
                ship_data['thrusters'] = {}

            # Update HP values in the nested components object
            changed = False
            for key, value in hp_totals.items():
                if value > 0:  # Only update if we found data
                    if ship_data['components'].get(key) != value:
                        ship_data['components'][key] = value
                        changed = True

                    # Also update thrusters.total_hp for Rust backend compatibility
                    if key == 'thruster_total_hp':
                        if ship_data['thrusters'].get('total_hp') != value:
                            ship_data['thrusters']['total_hp'] = value
                            changed = True

            if changed:
                # Write updated JSON
                with open(json_path, 'w') as f:
                    json.dump(ship_data, f, indent=2)

                print(f"Updated {ship_name}: {hp_totals}")
                updated_count += 1
            else:
                print(f"No changes for {ship_name}")

        except Exception as e:
            print(f"Error updating {ship_name}: {e}")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Updated: {updated_count} ships")
    print(f"  Skipped: {skipped_count} ships")
    print(f"  Total processed: {len(ship_json_files)} ships")

def main():
    print("Building component HP lookup from P4K data...")
    component_hp_lookup, guid_lookup = build_component_hp_lookup()

    print(f"\nUpdating ship JSON files...")
    update_ship_json_files(component_hp_lookup, guid_lookup)

    print("\nDone!")

if __name__ == '__main__':
    main()
