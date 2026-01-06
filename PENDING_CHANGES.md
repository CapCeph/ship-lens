# Pending Changes Since v0.1.18

**Last Release:** v0.1.18 (Release v0.1.18: Fix weapon display names)
**Status:** NOT COMMITTED - Bug fix required before release

---

## Summary

Major data accuracy overhaul with complete ship JSON regeneration, new data files, mount selection system, and ship-exclusive weapon support.

---

## 1. Ship Data Migration (307 ships)

### Changed
- **Renamed all ship JSON files to lowercase** (e.g., `AEGS_GLADIUS.json` → `aegs_gladius.json`)
- Regenerated all 307 ship JSON files from P4K source data
- Fixed numerous loadout accuracy issues across all manufacturers

### New Ships Added
- `aegs_avenger_titan_renegade_unmanned_ff.json`
- `aegs_gladius_unmanned_fleetweek2024.json`
- `aegs_gladius_unmanned_restoration.json`
- `aegs_hammerhead_unmanned_ninetails.json`
- `aegs_idris_m_pu_gamemaster.json`
- `aegs_reclaimer_pu_hijacked.json` (+ variants a, b, c)
- `anvl_c8_pisces_tutorial.json`
- `anvl_lightning_f8_fleetweek.json` (+ color variants)
- `anvl_valkyrie_citizencon.json`
- `anvl_valkyrie_indestructible.json`
- `anvl_valkyrie_unmanned_ninetails.json`
- `cnou_mustang_alpha_citizencon2018.json`
- `drak_caterpillar_pu_hijacked.json`
- `drak_caterpillar_unmanned_ninetails.json`
- `drak_cutlass_black_unmanned_ninetails.json`
- `misc_prospector_unmanned_ninetails.json`
- `misc_starfarer_unmanned_ninetails.json`
- `orig_300i_unmanned_restoration.json`
- `orig_890jump_hijacked.json`
- `orig_890jump_hijacked_pisces.json`
- `rsi_constellation_andromeda_unmanned_ninetails.json`

---

## 2. New Data Files

### Added
- **`data/missiles.json`** - 46 missiles with damage, tracking type, explosion radius
- **`data/mounts.json`** - 2476 lines of gimbal/turret mount configurations
- **`data/shields.json`** - Migrated from CSV to JSON format

### Removed (Deprecated CSVs)
- `data/shields_combined.csv`
- `data/ship_hardpoint_summary.csv`
- `data/ship_hull_hp.csv`
- `data/ship_parts_comprehensive.csv`
- `data/ship_weapons.csv`
- `data/weapon_power_data.csv`
- `data/weapons_combined.csv`

---

## 3. Mount Selection System

### New Feature
Swappable mount selection for hardpoints with multiple compatible mounts.

### Implementation
- **Detection Logic**: Hardpoints with `compatible_mounts` array AND `mount_name` defined show "SWAP" badge
- **UI Flow**: Click mount header → popup with compatible mount options → select new mount
- **Data Updates**: When mount changes, `sub_ports` update to match new mount's `ports` and `port_size`

### Files Changed
- `src/main.ts`: Added mount selection popup, click handlers, mount tracking
- `src/style.css`: Added `.swappable-mount`, `.swap-mount-badge`, `.mount-option` styles
- `src-tauri/src/lib.rs`: Added `get_mounts()` Tauri command
- `src-tauri/src/data.rs`: Added `Mount` struct and `load_mounts()` function

---

## 4. Ship-Exclusive Weapons (Vanduul Fix)

### Problem
Vanduul Scythe pilot weapons showed as "missing" because exclusive weapons weren't in weapons.json.

### Solution
Added `ship_exclusive` flag to weapon data model.

### Weapons Added
| Weapon | Size | Display Name | DPS |
|--------|------|--------------|-----|
| vncl_lasercannon_s1 | 1 | 'WEAK' Repeater | 425 |
| vncl_neutroncannon_s5 | 5 | 'WAR' Cannon | 1890 |
| vncl_plasmacannon_s5 | 5 | 'WRATH' Cannon | 810 |

### Files Changed
- `data/weapons.json`: Added 3 Vanduul weapons with `ship_exclusive: true`
- `src-tauri/src/data.rs`: Added `ship_exclusive: bool` field to Weapon struct
- `src/main.ts`: Added filtering logic to exclude ship_exclusive weapons from non-matching ship dropdowns

### Behavior
- Ship-exclusive weapons appear ONLY in dropdowns where they are the default weapon
- Other ships cannot select ship-exclusive weapons (matches game behavior)

---

## 5. RSI Ship Loadout Fixes

### RSI Polaris
| Issue | Fix |
|-------|-----|
| Maris Cannon double-counted | Removed duplicate pilot entries (nested in chin turret) |
| Missile racks: 1x S3 each | Fixed to 8x S3 each (16 total) |
| Missing remote turret top | Added missile turret with 12x S2 Ignite |
| Torpedo racks: 1x S10 each | Fixed to 7x S10 each (28 total) |
| PDC max_size: 1 | Fixed to 2 for all 7 PDCs |

### RSI Perseus
| Issue | Fix |
|-------|-----|
| Duplicate gimbal entries | Removed (nested inside manned turrets) |
| Duplicate secondary gun entries | Removed (nested inside manned turrets) |

### RSI Scorpius (all variants)
| Issue | Fix |
|-------|-----|
| Missile racks: 1-2 missiles each | Fixed to 4x S2 each (16 total) |

### RSI Zeus Mk II (all variants)
| Issue | Fix |
|-------|-----|
| Missile racks: 1x S2 each | Fixed to 4x S2 each (8 total) |

---

## 6. Code Changes Summary

### Backend (Rust)

**`src-tauri/src/data.rs`** (+318/-140 lines)
- Added `Mount` struct for gimbal/turret data
- Added `load_mounts()` function
- Added `ship_exclusive` field to `Weapon` struct
- Improved JSON parsing for new data format

**`src-tauri/src/lib.rs`** (+134 lines)
- Added `get_mounts()` Tauri command
- Updated data loading for new JSON files

**`src-tauri/src/ttk.rs`** (+16 lines)
- Minor TTK calculation adjustments

### Frontend (TypeScript/CSS)

**`src/main.ts`** (+399/-140 lines)
- Added `Mount` interface
- Added `getMountsByMaxSize()` function
- Added `showMountSelectionPopup()` function
- Added `applyMountToHardpoint()` function
- Added `selectedMounts` tracking Map
- Added swappable mount detection and UI
- Added ship_exclusive weapon filtering

**`src/style.css`** (+427 lines)
- Mount selection popup styles
- Swappable mount header styles
- Current mount highlight in popup

**`index.html`** (+8 lines)
- Minor structural adjustments

---

## 7. File Statistics

| Category | Count |
|----------|-------|
| Ship JSON files | 307 |
| Weapons | 145 (including 3 Vanduul exclusive) |
| Missiles | 46 |
| Shields | 63 |
| Mounts | ~150+ entries |

---

## 8. Bug Fix: Windows Ships Not Loading

### Issue
Windows users on v0.1.18 reported "No matches found" in ship dropdown - ships weren't loading.

### Root Cause
The `tauri.conf.json` resource bundling config used `../data/*` which only copies files directly in `data/`, NOT subdirectories.

```json
// BROKEN - doesn't include data/ships/
"resources": {
  "../data/*": "data/"
}
```

The `data/ships/*.json` directory was never bundled into the Windows installer!

### Fix Applied
Updated `tauri.conf.json` to explicitly include the ships subdirectory:

```json
// FIXED - includes ships subdirectory
"resources": {
  "../data/*.json": "data/",
  "../data/*.csv": "data/",
  "../data/ships/*.json": "data/ships/"
}
```

### When Bug Was Introduced
v0.1.17 - when we migrated from CSV to per-ship JSON files in `data/ships/`.

---

## Files Modified (Summary)

### Code Files
- `src-tauri/src/data.rs` - Major updates
- `src-tauri/src/lib.rs` - Major updates
- `src-tauri/src/ttk.rs` - Minor updates
- `src/main.ts` - Major updates
- `src/style.css` - Major updates
- `index.html` - Minor updates

### Data Files
- `data/weapons.json` - Regenerated with 145 weapons
- `data/shields.json` - Converted from CSV
- `data/missiles.json` - New file (46 missiles)
- `data/mounts.json` - New file
- `data/ships/*.json` - 307 files (renamed lowercase + regenerated)

### Removed
- 7 deprecated CSV files
- All uppercase ship JSON files (replaced by lowercase)

---

## 9. Data Validation Results

Comprehensive validation run on 2026-01-07:

### Ship Data
| Metric | Result |
|--------|--------|
| Total ships | 307 |
| Ships with hull HP > 0 | 307 (100%) |
| Ships with armor HP > 0 | 228 (74%) |
| Ships without armor | 79 (small vehicles, bikes, pods) |

### Weapon Data
| Metric | Result |
|--------|--------|
| Total weapons | 145 |
| Guns | 142 |
| PDCs | 3 |
| Ship-exclusive weapons | 3 (Vanduul) |

### Shield Data
| Metric | Result |
|--------|--------|
| Total shields | 72 |
| By size | S0: 2, S1: 24, S2: 23, S3: 15, S4: 8 |

### Missile Data
| Metric | Result |
|--------|--------|
| Total missiles | 46 |
| Missiles | 39 |
| Torpedoes | 4 |
| Bombs | 3 |

### Known Edge Cases (Not Blocking)
| Issue | Impact |
|-------|--------|
| 3 weapons with 0 DPS | Template/EMP/beam - none used by ships |
| 5 missing weapon refs | EMP devices & rocket pods (specialized equipment) |

### TTK Tests
All 6 TTK calculation tests pass:
- `test_armor_resistances` ✓
- `test_ballistic_passthrough` ✓
- `test_energy_no_passthrough` ✓
- `test_full_ttk_calculation` ✓
- `test_rule_of_two` ✓
- `test_zone_modifiers_affect_ttk` ✓
