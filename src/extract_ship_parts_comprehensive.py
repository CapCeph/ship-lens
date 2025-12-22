#!/usr/bin/env python3
"""
Comprehensive Ship Parts Extraction Script
Extracts ALL ship parts data including:
  - Armor HP and resistance values per ship
  - Thruster HP per ship (mapped via hardpoints)
  - Turret HP per ship
  - Component HP (power plants, coolers, shields, QD)
  - All hardpoint mappings

This creates multiple output files for integration into the damage calculator.
"""

import csv
import re
from pathlib import Path
from collections import defaultdict

# Paths
SHIPS_DIR = Path("/home/kengonza/Tools/unp4k/Data/libs/foundry/records/entities/spaceships")
COMPONENTS_DIR = Path("/home/kengonza/Tools/unp4k/Data/libs/foundry/records/entities/scitem/ships")
OUTPUT_DIR = Path("/home/kengonza/Projects/sc-data-verification/processed/ships")

# Manufacturer mappings for display names
MANUFACTURERS = {
    'AEGS': 'Aegis', 'ANVL': 'Anvil', 'ARGO': 'Argo', 'BANU': 'Banu',
    'BEHR': 'Behring', 'CNOU': 'CO', 'CRUS': 'Crusader', 'DRAK': 'Drake',
    'ESPR': 'Esperia', 'GAMA': 'Gatac', 'GLSN': 'Gallenson', 'KRIG': 'Kruger',
    'MISC': 'MISC', 'MRAI': 'Mirai', 'ORIG': 'Origin', 'RSI': 'RSI',
    'TMBL': 'Tumbril', 'VNCL': 'Vanduul', 'XIAN': "Xi'An", 'XNAA': 'XNAA',
    'EAOBJECTIVEDESTRUCTABLE': 'EA Objective', 'ORBITAL': 'Orbital', 'PROBE': 'Probe',
}


def extract_value(content, pattern, default=None):
    """Extract a single value from XML content."""
    match = re.search(pattern, content, re.IGNORECASE)
    if match:
        return match.group(1)
    return default


def extract_all_values(content, pattern):
    """Extract all matching values from XML content."""
    return re.findall(pattern, content, re.IGNORECASE)


def parse_ship_name(raw_name):
    """Parse ship name from filename."""
    if not raw_name:
        return raw_name
    parts = raw_name.split('_')
    if len(parts) >= 2:
        mfr_code = parts[0].upper()
        mfr_name = MANUFACTURERS.get(mfr_code, mfr_code)
        ship_name = ' '.join(parts[1:])
        ship_name = re.sub(r'([a-z])([A-Z])', r'\1 \2', ship_name)
        return f"{mfr_name} {ship_name}"
    return raw_name.replace('_', ' ')


def load_armor_data():
    """Load all armor data with HP and resistances."""
    armor_dir = COMPONENTS_DIR / "armor"
    armor_data = {}

    if not armor_dir.exists():
        print(f"  Warning: Armor directory not found: {armor_dir}")
        return armor_data

    for xml_file in armor_dir.glob("*.xml"):
        try:
            content = xml_file.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            continue

        filename = xml_file.stem.lower()

        # Extract health
        health = extract_value(content, r'Health="(\d+(?:\.\d+)?)"')
        if not health:
            continue

        # Extract resistance multipliers
        phys_resist = extract_value(content, r'PhysicalResistance[^>]*Multiplier="([\d.]+)"', '1.0')
        energy_resist = extract_value(content, r'EnergyResistance[^>]*Multiplier="([\d.]+)"', '1.0')
        distortion_resist = extract_value(content, r'DistortionResistance[^>]*Multiplier="([\d.]+)"', '1.0')
        thermal_resist = extract_value(content, r'ThermalResistance[^>]*Multiplier="([\d.]+)"', '1.0')
        biochem_resist = extract_value(content, r'BiochemicalResistance[^>]*Multiplier="([\d.]+)"', '1.0')
        stun_resist = extract_value(content, r'StunResistance[^>]*Multiplier="([\d.]+)"', '1.0')

        armor_data[filename] = {
            'health': int(float(health)),
            'resist_physical': float(phys_resist),
            'resist_energy': float(energy_resist),
            'resist_distortion': float(distortion_resist),
            'resist_thermal': float(thermal_resist),
            'resist_biochemical': float(biochem_resist),
            'resist_stun': float(stun_resist),
        }

        # Also store without common prefixes for matching
        clean_name = filename.replace('armr_', '').replace('_scitem', '')
        armor_data[clean_name] = armor_data[filename]

    return armor_data


def load_thruster_data():
    """Load all thruster data with HP values."""
    thruster_dir = COMPONENTS_DIR / "thrusters"
    thruster_data = {}

    if not thruster_dir.exists():
        print(f"  Warning: Thrusters directory not found: {thruster_dir}")
        return thruster_data

    for xml_file in thruster_dir.glob("*.xml"):
        try:
            content = xml_file.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            continue

        filename = xml_file.stem.lower()

        # Extract health
        health = extract_value(content, r'Health="(\d+(?:\.\d+)?)"')
        if health:
            thruster_data[filename] = {
                'health': int(float(health)),
                'filename': filename,
            }
            # Also store without _scitem suffix
            clean_name = filename.replace('_scitem', '')
            thruster_data[clean_name] = thruster_data[filename]

    return thruster_data


def load_turret_data():
    """Load all turret data with HP values."""
    turret_dir = COMPONENTS_DIR / "turret"
    turret_data = {}

    if not turret_dir.exists():
        print(f"  Warning: Turret directory not found: {turret_dir}")
        return turret_data

    for xml_file in turret_dir.glob("*.xml"):
        try:
            content = xml_file.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            continue

        filename = xml_file.stem.lower()

        # Extract health
        health = extract_value(content, r'Health="(\d+(?:\.\d+)?)"')
        if health:
            turret_data[filename] = {
                'health': int(float(health)),
                'filename': filename,
            }
            # Also store without _scitem suffix
            clean_name = filename.replace('_scitem', '')
            turret_data[clean_name] = turret_data[filename]

    return turret_data


def load_component_data():
    """Load all component data (power plants, coolers, shields, QD)."""
    component_types = {
        'powerplant': {},
        'cooler': {},
        'shieldgenerator': {},
        'quantumdrive': {},
    }

    for comp_type in component_types.keys():
        comp_dir = COMPONENTS_DIR / comp_type
        if not comp_dir.exists():
            continue

        for xml_file in comp_dir.glob("*.xml"):
            try:
                content = xml_file.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            filename = xml_file.stem.lower()

            # Extract health
            health = extract_value(content, r'Health="(\d+(?:\.\d+)?)"')
            if health:
                component_types[comp_type][filename] = int(float(health))
                # Also store without _scitem suffix
                clean_name = filename.replace('_scitem', '')
                component_types[comp_type][clean_name] = int(float(health))

    return component_types


def extract_hardpoint_mappings(content):
    """Extract all hardpoint to entity mappings from ship content."""
    mappings = {}

    # Pattern to match itemPortName and entityClassName pairs
    pattern = r'itemPortName="([^"]+)"[^>]*entityClassName="([^"]+)"'
    matches = re.findall(pattern, content, re.IGNORECASE)

    for port_name, entity_class in matches:
        port_lower = port_name.lower()
        entity_lower = entity_class.lower()
        mappings[port_lower] = entity_lower

    return mappings


def categorize_hardpoints(mappings):
    """Categorize hardpoints by type."""
    categories = {
        'thrusters': [],
        'turrets': [],
        'armor': [],
        'powerplant': [],
        'cooler': [],
        'shield': [],
        'quantumdrive': [],
        'weapons': [],
        'missiles': [],
        'other': [],
    }

    for port_name, entity_class in mappings.items():
        if 'thruster' in port_name or 'thruster' in entity_class:
            categories['thrusters'].append((port_name, entity_class))
        elif 'turret' in port_name or 'turret' in entity_class:
            categories['turrets'].append((port_name, entity_class))
        elif 'armor' in port_name or 'armr_' in entity_class:
            categories['armor'].append((port_name, entity_class))
        elif 'power' in port_name:
            categories['powerplant'].append((port_name, entity_class))
        elif 'cooler' in port_name:
            categories['cooler'].append((port_name, entity_class))
        elif 'shield' in port_name:
            categories['shield'].append((port_name, entity_class))
        elif 'quantum' in port_name:
            categories['quantumdrive'].append((port_name, entity_class))
        elif 'weapon' in port_name or 'gun' in port_name:
            categories['weapons'].append((port_name, entity_class))
        elif 'missile' in port_name or 'pylon' in port_name:
            categories['missiles'].append((port_name, entity_class))
        else:
            categories['other'].append((port_name, entity_class))

    return categories


def process_all_ships(armor_data, thruster_data, turret_data, component_data):
    """Process all ship files and extract comprehensive parts data."""
    ships = []

    for xml_file in sorted(SHIPS_DIR.glob("*.xml")):
        try:
            content = xml_file.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue

        filename = xml_file.stem

        # Skip templates and test files
        if any(x in filename.lower() for x in ['template', 'test', 'unmanned']):
            continue

        # Check if it's a vehicle
        if 'VehicleComponentParams' not in content:
            continue

        # Extract base damage parameters
        hull_normalization = extract_value(
            content,
            r'vehicleHullDamageNormalizationValue="(\d+(?:\.\d+)?)"',
            default='0'
        )

        # Skip if no hull value
        if hull_normalization == '0':
            continue

        fuse_penetration = extract_value(
            content,
            r'fusePenetrationDamageMultiplier="(\d+(?:\.\d+)?)"',
            default='1.0'
        )

        component_penetration = extract_value(
            content,
            r'componentPenetrationDamageMultiplier="(\d+(?:\.\d+)?)"',
            default='1.0'
        )

        critical_chance = extract_value(
            content,
            r'criticalPartExplosionChance="(\d+(?:\.\d+)?)"',
            default='0.2'
        )

        # Get all hardpoint mappings
        hardpoint_mappings = extract_hardpoint_mappings(content)
        categorized = categorize_hardpoints(hardpoint_mappings)

        # Calculate armor HP and resistances
        armor_hp = 0
        armor_resist_phys = 1.0
        armor_resist_energy = 1.0
        armor_resist_distortion = 1.0

        for port_name, entity_class in categorized['armor']:
            entity_lower = entity_class.lower()
            if entity_lower in armor_data:
                armor_hp = armor_data[entity_lower]['health']
                armor_resist_phys = armor_data[entity_lower]['resist_physical']
                armor_resist_energy = armor_data[entity_lower]['resist_energy']
                armor_resist_distortion = armor_data[entity_lower]['resist_distortion']
                break

        # Also try to find armor by ship name pattern
        if armor_hp == 0:
            for armor_key in armor_data.keys():
                # Match ship manufacturer and model
                ship_parts = filename.lower().replace('_', '')
                armor_parts = armor_key.replace('_', '')
                if ship_parts in armor_parts or armor_parts in ship_parts:
                    armor_hp = armor_data[armor_key]['health']
                    armor_resist_phys = armor_data[armor_key]['resist_physical']
                    armor_resist_energy = armor_data[armor_key]['resist_energy']
                    armor_resist_distortion = armor_data[armor_key]['resist_distortion']
                    break

        # Calculate thruster HP totals
        thruster_main_hp = 0
        thruster_retro_hp = 0
        thruster_mav_hp = 0
        thruster_vtol_hp = 0
        thruster_count = 0

        for port_name, entity_class in categorized['thrusters']:
            entity_lower = entity_class.lower()
            hp = 0

            # Try direct match
            if entity_lower in thruster_data:
                hp = thruster_data[entity_lower]['health']
            else:
                # Try matching by pattern
                for thruster_key in thruster_data.keys():
                    if entity_lower in thruster_key or thruster_key in entity_lower:
                        hp = thruster_data[thruster_key]['health']
                        break

            if hp > 0:
                thruster_count += 1
                if 'main' in port_name.lower() or 'main' in entity_lower:
                    thruster_main_hp += hp
                elif 'retro' in port_name.lower() or 'retro' in entity_lower:
                    thruster_retro_hp += hp
                elif 'vtol' in port_name.lower() or 'vtol' in entity_lower:
                    thruster_vtol_hp += hp
                else:
                    thruster_mav_hp += hp

        # Calculate turret HP totals
        turret_total_hp = 0
        turret_count = 0

        for port_name, entity_class in categorized['turrets']:
            entity_lower = entity_class.lower()
            if entity_lower in turret_data:
                turret_total_hp += turret_data[entity_lower]['health']
                turret_count += 1

        # Calculate component HP totals
        pp_total_hp = 0
        pp_count = 0
        for port_name, entity_class in categorized['powerplant']:
            entity_lower = entity_class.lower()
            hp = component_data['powerplant'].get(entity_lower, 0)
            if hp == 0:
                hp = component_data['powerplant'].get(entity_lower.replace('_scitem', ''), 0)
            if hp > 0:
                pp_total_hp += hp
                pp_count += 1

        cooler_total_hp = 0
        cooler_count = 0
        for port_name, entity_class in categorized['cooler']:
            entity_lower = entity_class.lower()
            hp = component_data['cooler'].get(entity_lower, 0)
            if hp == 0:
                hp = component_data['cooler'].get(entity_lower.replace('_scitem', ''), 0)
            if hp > 0:
                cooler_total_hp += hp
                cooler_count += 1

        shield_total_hp = 0
        shield_count = 0
        for port_name, entity_class in categorized['shield']:
            entity_lower = entity_class.lower()
            hp = component_data['shieldgenerator'].get(entity_lower, 0)
            if hp == 0:
                hp = component_data['shieldgenerator'].get(entity_lower.replace('_scitem', ''), 0)
            if hp > 0:
                shield_total_hp += hp
                shield_count += 1

        qd_total_hp = 0
        qd_count = 0
        for port_name, entity_class in categorized['quantumdrive']:
            entity_lower = entity_class.lower()
            hp = component_data['quantumdrive'].get(entity_lower, 0)
            if hp == 0:
                hp = component_data['quantumdrive'].get(entity_lower.replace('_scitem', ''), 0)
            if hp > 0:
                qd_total_hp += hp
                qd_count += 1

        # Count hardpoints
        weapon_count = len(categorized['weapons'])
        missile_count = len(categorized['missiles'])
        total_hardpoints = len(hardpoint_mappings)

        display_name = parse_ship_name(filename)

        ship = {
            'filename': filename,
            'display_name': display_name,
            # Base damage params
            'hull_hp_normalized': int(float(hull_normalization)),
            'fuse_penetration_mult': float(fuse_penetration),
            'component_penetration_mult': float(component_penetration),
            'critical_explosion_chance': float(critical_chance),
            # Armor
            'armor_hp': armor_hp,
            'armor_resist_physical': armor_resist_phys,
            'armor_resist_energy': armor_resist_energy,
            'armor_resist_distortion': armor_resist_distortion,
            # Thrusters
            'thruster_count': thruster_count,
            'thruster_main_hp': thruster_main_hp,
            'thruster_retro_hp': thruster_retro_hp,
            'thruster_mav_hp': thruster_mav_hp,
            'thruster_vtol_hp': thruster_vtol_hp,
            'thruster_total_hp': thruster_main_hp + thruster_retro_hp + thruster_mav_hp + thruster_vtol_hp,
            # Turrets
            'turret_count': turret_count,
            'turret_total_hp': turret_total_hp,
            # Components
            'powerplant_count': pp_count,
            'powerplant_total_hp': pp_total_hp,
            'cooler_count': cooler_count,
            'cooler_total_hp': cooler_total_hp,
            'shield_gen_count': shield_count,
            'shield_gen_total_hp': shield_total_hp,
            'qd_count': qd_count,
            'qd_total_hp': qd_total_hp,
            # Counts
            'weapon_hardpoints': weapon_count,
            'missile_hardpoints': missile_count,
            'total_hardpoints': total_hardpoints,
        }

        ships.append(ship)

    return ships


def write_comprehensive_csv(ships, output_file):
    """Write comprehensive ship parts data to CSV."""
    fieldnames = [
        'filename', 'display_name',
        'hull_hp_normalized', 'fuse_penetration_mult', 'component_penetration_mult', 'critical_explosion_chance',
        'armor_hp', 'armor_resist_physical', 'armor_resist_energy', 'armor_resist_distortion',
        'thruster_count', 'thruster_main_hp', 'thruster_retro_hp', 'thruster_mav_hp', 'thruster_vtol_hp', 'thruster_total_hp',
        'turret_count', 'turret_total_hp',
        'powerplant_count', 'powerplant_total_hp',
        'cooler_count', 'cooler_total_hp',
        'shield_gen_count', 'shield_gen_total_hp',
        'qd_count', 'qd_total_hp',
        'weapon_hardpoints', 'missile_hardpoints', 'total_hardpoints',
    ]

    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ships)


def print_summary(ships):
    """Print summary statistics."""
    print("\n" + "=" * 70)
    print("COMPREHENSIVE SHIP PARTS EXTRACTION SUMMARY")
    print("=" * 70)

    print(f"\nTotal Ships Processed: {len(ships)}")

    # Ships with armor data
    ships_with_armor = [s for s in ships if s['armor_hp'] > 0]
    print(f"Ships with Armor HP: {len(ships_with_armor)}")

    # Ships with thrusters
    ships_with_thrusters = [s for s in ships if s['thruster_total_hp'] > 0]
    print(f"Ships with Thruster HP: {len(ships_with_thrusters)}")

    # Ships with turrets
    ships_with_turrets = [s for s in ships if s['turret_total_hp'] > 0]
    print(f"Ships with Turret HP: {len(ships_with_turrets)}")

    # Hull HP range
    hull_values = [s['hull_hp_normalized'] for s in ships]
    print(f"\nHull HP Range: {min(hull_values):,} - {max(hull_values):,}")

    # Armor HP range
    armor_values = [s['armor_hp'] for s in ships if s['armor_hp'] > 0]
    if armor_values:
        print(f"Armor HP Range: {min(armor_values):,} - {max(armor_values):,}")

    # Thruster HP range
    thruster_values = [s['thruster_total_hp'] for s in ships if s['thruster_total_hp'] > 0]
    if thruster_values:
        print(f"Thruster HP Range: {min(thruster_values):,} - {max(thruster_values):,}")

    # Print examples
    print("\n" + "=" * 70)
    print("EXAMPLE SHIPS:")
    print("=" * 70)

    examples = ['aegs_gladius', 'drak_vulture', 'anvl_hornet_f7c_mk2', 'misc_freelancer',
                'aegs_hammerhead', 'rsi_constellation_andromeda']

    for s in ships:
        if s['filename'] in examples:
            print(f"\n{s['display_name']}:")
            print(f"  Hull HP (Normalized): {s['hull_hp_normalized']:,}")
            print(f"  Fuse Penetration: {s['fuse_penetration_mult']:.0%}")
            print(f"  Component Penetration: {s['component_penetration_mult']:.0%}")
            print(f"  Armor: {s['armor_hp']:,} HP (Phys: {s['armor_resist_physical']:.2f}, Energy: {s['armor_resist_energy']:.2f})")
            print(f"  Thrusters: {s['thruster_count']}x = {s['thruster_total_hp']:,} HP total")
            print(f"    Main: {s['thruster_main_hp']:,}, Retro: {s['thruster_retro_hp']:,}, Mav: {s['thruster_mav_hp']:,}, VTOL: {s['thruster_vtol_hp']:,}")
            print(f"  Turrets: {s['turret_count']}x = {s['turret_total_hp']:,} HP")
            print(f"  Power Plants: {s['powerplant_count']}x = {s['powerplant_total_hp']:,} HP")
            print(f"  Coolers: {s['cooler_count']}x = {s['cooler_total_hp']:,} HP")
            print(f"  Shield Gens: {s['shield_gen_count']}x = {s['shield_gen_total_hp']:,} HP")


def main():
    print("=" * 70)
    print("COMPREHENSIVE SHIP PARTS EXTRACTION")
    print("Extracting armor, thrusters, turrets, and components for ALL ships")
    print("=" * 70)

    print("\n[1/5] Loading armor data...")
    armor_data = load_armor_data()
    print(f"  Found {len(armor_data)} armor entries")

    print("\n[2/5] Loading thruster data...")
    thruster_data = load_thruster_data()
    print(f"  Found {len(thruster_data)} thruster entries")

    print("\n[3/5] Loading turret data...")
    turret_data = load_turret_data()
    print(f"  Found {len(turret_data)} turret entries")

    print("\n[4/5] Loading component data...")
    component_data = load_component_data()
    print(f"  Power plants: {len(component_data['powerplant'])}")
    print(f"  Coolers: {len(component_data['cooler'])}")
    print(f"  Shield generators: {len(component_data['shieldgenerator'])}")
    print(f"  Quantum drives: {len(component_data['quantumdrive'])}")

    print("\n[5/5] Processing all ship files...")
    ships = process_all_ships(armor_data, thruster_data, turret_data, component_data)
    print(f"  Processed {len(ships)} ships")

    # Sort by display name
    ships.sort(key=lambda x: x['display_name'])

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_DIR / "ship_parts_comprehensive.csv"
    write_comprehensive_csv(ships, output_file)
    print(f"\nWrote data to: {output_file}")

    # Print summary
    print_summary(ships)

    print("\n" + "=" * 70)
    print("EXTRACTION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
