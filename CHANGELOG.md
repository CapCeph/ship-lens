# Changelog

All notable changes to Ship Lens will be documented in this file.

---

## [v0.1.22](https://github.com/CapCeph/ship-lens/releases/tag/v0.1.22) - 2025-01-13

### New Features

#### Per-Weapon Effectiveness Breakdown
- Each weapon in the Weapon Effectiveness section now displays its own mini-timeline showing shield/armor/hull phase durations
- Weapons show individual DPS contributions: shield DPS (absorbed), passthrough DPS, armor DPS, hull DPS
- Solo TTK displayed for each weapon type (how long that weapon alone would take to kill)
- Collapsible cards for ineffective weapons with expand/collapse on click

#### Per-Missile Damage Analysis
- Missiles now show damage distribution bars (shield/armor/hull proportional segments)
- "Saves Xs off TTK" metric shows how much each missile salvo reduces overall time-to-kill
- Damage breakdown includes passthrough damage for physical missiles

#### Visual Improvements
- Mini-timeline bars with color-coded segments matching main timeline (shield=cyan, armor=orange, hull=red)
- Damage values displayed on timeline segments
- Effectiveness badges (EFFECTIVE/INEFFECTIVE) with reasons for ineffective weapons
- Disabled weapons hidden from effectiveness section (count already reflects enabled state)

### Bug Fixes

#### Data Integrity
- Fixed Idris-P Fleet Week (`aegs_idris_p_fw_25`) armor_hp: 0 → 2,160,000
- Disambiguated duplicate weapon display names:
  - `CF-227 Badger (Broken)` - Non-functional Banu variant
  - `CF-227 Badger PDC` - Point defense variant
  - `M9A Laser Cannon (Idris-M)` - Idris-M specific
  - `M9A Laser Cannon (Turret)` - Turret variant
  - `M9A Laser Cannon S8` - Size 8 variant
  - `M9A Laser Cannon S9` - Size 9 variant
  - `M12A Mass Driver` - Size 12 mass driver
  - `Attrition-4 Repeater (Turret)` - Turret variant

#### UI/UX
- Weapon effectiveness section now displays weapons in same order as attacker weapons panel
- Fixed weapon effectiveness showing "EFFECTIVE" for weapons without backend data

### Technical Changes

#### Backend (ttk.rs)
- Added `shield_time`, `armor_time`, `hull_time` fields to `WeaponEffectiveness`
- Added `time_saved` field to `MissileEffectiveness`
- Per-weapon phase timing calculation with passthrough path handling

#### Frontend (main.ts)
- `getAllWeaponsGroupedByHardpoint()` now tracks `minSlotIndex` for consistent ordering
- `updateWeaponBreakdown()` renders mini-timelines and damage bars
- Disabled weapons filtered from display (count reflects enabled state)

#### Styling (style.css)
- Added ~370 lines for weapon breakdown section
- Mini-timeline bars, damage segments, effectiveness badges
- Responsive text sizing for damage labels

### Files Changed

| File | Changes |
|------|---------|
| `src-tauri/src/ttk.rs` | +358 lines - Per-weapon/missile effectiveness calculation |
| `src/main.ts` | +683/-3 lines - Weapon breakdown rendering, slot ordering |
| `src/style.css` | +372 lines - Mini-timeline and damage bar styling |
| `index.html` | +5 lines - Weapon breakdown container |
| `data/weapons.json` | Disambiguated duplicate display names |
| `data/ships/aegs_idris_p_fw_25.json` | Fixed armor_hp: 0 → 2,160,000 |

### Validation

Health check completed across all 307 ships:
- All weapon hardpoint structures valid
- All shield configurations valid
- TTK calculations match P4K source data

---

## [v0.1.21](https://github.com/CapCeph/ship-lens/releases/tag/v0.1.21) - 2025-01-12

- Simplified weapon toggles and startup fix

---

## [v0.1.20](https://github.com/CapCeph/ship-lens/releases/tag/v0.1.20)

- Fixed TTK calculation to use sustained DPS (not per-shot damage)
- Added 3 missing capital ship weapons
- Fixed 39 ships with missing default_weapon data
- Fixed aegs_emp_sentinel_s4 weapon entry
- Updated default shield references for all ships (from P4K data)
- Removed DAMAGE BREAKDOWN section from UI
- Fixed dropdown positioning - opens upward when near bottom of viewport

---

## [v0.1.16](https://github.com/CapCeph/ship-lens/releases/tag/v0.1.16)

- Fixed weapon hardpoint categorization (Spirit C1, Carrack, Valkyrie)
- Added 9 weapon categories (pilot, manned_turret, remote_turret, pdc, missile, torpedo, bomb, spinal, specialized)
- Fixed "rack" substring issue
- Fixed turret detection priority
- Filtered utility mounts
- Validated 749 ships with correct loadout data

---

## Earlier Releases

See [GitHub Releases](https://github.com/CapCeph/ship-lens/releases) for complete history.
