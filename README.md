<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Ship Lens Logo" width="128" height="128">
</p>

<h1 align="center">Ship Lens</h1>

<p align="center">
  <strong>A lightweight desktop damage calculator for Star Citizen</strong>
</p>

<p align="center">
  <a href="https://github.com/CapCeph/ship-lens/releases/latest">
    <img src="https://img.shields.io/github/v/release/CapCeph/ship-lens?style=flat-square&color=blue" alt="Latest Release">
  </a>
  <a href="https://github.com/CapCeph/ship-lens/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/CapCeph/ship-lens/releases">
    <img src="https://img.shields.io/github/downloads/CapCeph/ship-lens/total?style=flat-square&color=green" alt="Downloads">
  </a>
</p>

<p align="center">
  <img src="https://robertsspaceindustries.com/media/a2u5vfrvz1u4br/source/CreatedByTheCommunity_1920.1.100.jpg" alt="Made By TheCeph for The Community" width="400">
</p>

---

## What is Ship Lens?

Ship Lens is a fast, native desktop app that calculates **Time-To-Kill (TTK)** between Star Citizen ships. TTK is the time to reach **power plant failure** - the point of no return where the ship will explode if the pilot/crew doesn't eject or repair. No browser needed - just launch and go.

## Disclaimer
 TTK values are typically accurate within 5 seconds based on testing against live Alpha 4.5 combat. Real fights vary based on pilot skill, hit rate, and maneuvering. Feedback is welcome!

<p align="center">
  <img src="assets/Ship Lens.png" alt="Ship Lens Screenshot" width="700">
</p>

Think of it as a variant of [Erkul](https://www.erkul.games/) but as a lightweight desktop app built in Rust.

### Current Support: Star Citizen Alpha 4.5 LIVE

### Features

- **Answer "Can I Kill That?"** - See exactly how long any fight takes before you engage
- **Every Flyable Ship** - 307+ ships with accurate hull, armor, and shield stats
- **All Player Weapons** - 145+ guns you can actually equip (no NPC/template junk)
- **Test Before You Die** - Dogfight vs Jousting scenarios to plan your approach
- **See What Hurts** - Breakdown of physical, energy, and distortion damage
- **Instant Results** - Tweak loadouts and see TTK update live
- **Save Your Builds** - Fleet presets for your favorite configurations
- **Rep Your Manufacturer** - Crusader, Drake, MISC, Origin, and Aegis themes
- **Know Your Weapons** - See exactly how each gun contributes: shield DPS, armor DPS, and solo TTK
- **Missile Math** - Know how much time your torpedoes save before you waste them on the wrong target
- **Visual Damage Phases** - Mini-timelines show each weapon's shield/armor/hull breakdown at a glance
- **Effectiveness Check** - Instantly see which weapons can break shields vs which are just tickling
- **Torpedo Time Savings** - See exactly how many seconds each missile salvo shaves off

---

# v0.1.22 Release Notes

## New Features

### Per-Weapon Effectiveness Breakdown
- Each weapon in the Weapon Effectiveness section now displays its own mini-timeline showing shield/armor/hull phase durations
- Weapons show individual DPS contributions: shield DPS (absorbed), passthrough DPS, armor DPS, hull DPS
- Solo TTK displayed for each weapon type (how long that weapon alone would take to kill)
- Collapsible cards for ineffective weapons with expand/collapse on click

### Per-Missile Damage Analysis
- Missiles now show damage distribution bars (shield/armor/hull proportional segments)
- "Saves Xs off TTK" metric shows how much each missile salvo reduces overall time-to-kill
- Damage breakdown includes passthrough damage for physical missiles

### Visual Improvements
- Mini-timeline bars with color-coded segments matching main timeline (shield=cyan, armor=orange, hull=red)
- Damage values displayed on timeline segments
- Effectiveness badges (EFFECTIVE/INEFFECTIVE) with reasons for ineffective weapons
- Disabled weapons hidden from effectiveness section (count already reflects enabled state)

---

## Bug Fixes

### Data Integrity
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

### UI/UX
- Weapon effectiveness section now displays weapons in same order as attacker weapons panel
- Fixed weapon effectiveness showing "EFFECTIVE" for weapons without backend data

---

## Technical Changes

### Backend (ttk.rs)
- Added `shield_time`, `armor_time`, `hull_time` fields to `WeaponEffectiveness`
- Added `time_saved` field to `MissileEffectiveness`
- Per-weapon phase timing calculation with passthrough path handling

### Frontend (main.ts)
- `getAllWeaponsGroupedByHardpoint()` now tracks `minSlotIndex` for consistent ordering
- `updateWeaponBreakdown()` renders mini-timelines and damage bars
- Disabled weapons filtered from display (count reflects enabled state)

### Styling (style.css)
- Added ~370 lines for weapon breakdown section
- Mini-timeline bars, damage segments, effectiveness badges
- Responsive text sizing for damage labels

---

## Files Changed

| File | Changes |
|------|---------|
| `src-tauri/src/ttk.rs` | +358 lines - Per-weapon/missile effectiveness calculation |
| `src/main.ts` | +683/-3 lines - Weapon breakdown rendering, slot ordering |
| `src/style.css` | +372 lines - Mini-timeline and damage bar styling |
| `index.html` | +5 lines - Weapon breakdown container |
| `data/weapons.json` | Disambiguated duplicate display names |
| `data/ships/aegs_idris_p_fw_25.json` | Fixed armor_hp: 0 → 2,160,000 |

---

## Validation

Health check completed across all 307 ships:
- All weapon hardpoint structures valid
- All shield configurations valid
- TTK calculations match P4K source data
- 86 ships have null `thruster_total_hp` (non-critical, doesn't affect TTK)
---

## Installation

### Linux

**Fedora / RHEL:**
```bash
curl -sLO https://github.com/CapCeph/ship-lens/releases/latest/download/Ship.Lens-0.1.16-1.x86_64.rpm && sudo dnf install -y ./Ship.Lens-*.rpm
```

**Ubuntu / Debian / Zorin:**
```bash
curl -sLO https://github.com/CapCeph/ship-lens/releases/latest/download/Ship.Lens_0.1.16_amd64.deb && sudo apt install -y ./Ship.Lens_*.deb
```

### Windows

Download the `.msi` installer from the [Releases page](https://github.com/CapCeph/ship-lens/releases/latest), run it, and launch "Ship Lens" from the Start Menu.

> **Note:** Linux is the primary development platform. Windows builds are provided via GitHub Actions but may contain bugs or untested behavior. Please [report any issues](https://github.com/CapCeph/ship-lens/issues) you encounter.

### Manual Download

**[Download Latest Release](https://github.com/CapCeph/ship-lens/releases/latest)**

| Platform | File |
|----------|------|
| Windows | `.msi` / `.exe` |
| Fedora/RHEL | `.rpm` |
| Ubuntu/Debian | `.deb` |

---

## Building from Source

<details>
<summary>Click to expand build instructions</summary>

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) (stable)
- System dependencies: See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Build

```bash
git clone https://github.com/CapCeph/ship-lens.git
cd ship-lens
npm install
npm run tauri build
```

Output will be in `src-tauri/target/release/bundle/`

### Development

```bash
npm run tauri dev
```

</details>

---

## Data Sources

Ship, weapon, and shield data is extracted from Star Citizen game files using [scdatatools](https://gitlab.com/scmodding/frameworks/scdatatools).

Data is updated periodically after major patches.

---

## Disclaimer

This is an **unofficial** Star Citizen fan project, not affiliated with Cloud Imperium Games.

Star Citizen®, Roberts Space Industries®, and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC.

---

## License

MIT License - See [LICENSE](LICENSE) for details.

**Trademark:** "Ship Lens" is a trademark of TheCeph. Forks must use a different name.

---

<p align="center">
  <strong>New to Star Citizen?</strong><br>
  Use referral code <a href="https://www.robertsspaceindustries.com/enlist?referral=STAR-2DFQ-WXQ6"><strong>STAR-2DFQ-WXQ6</strong></a> for bonus credits!
</p>
