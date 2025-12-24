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
  <img src="https://robertsspaceindustries.com/media/a2u5vfrvz1u4br/source/CreatedByTheCommunity_1920x1080.jpg" alt="Made By TheCeph for The Community" width="400">
</p>

---

## What is Ship Lens?

Ship Lens is a fast, native desktop app that calculates **Time-To-Kill (TTK)** between Star Citizen ships. No browser needed - just launch and go.

Note: Please keep in mind that this is a new project. Solidification of the proper calculation systems are still in development and current results may not be accurate.

Think of it as a varient of [Erkul](https://www.erkul.games/) but as a lightweight desktop app built in Rust.

### Features

- **Alpha 4.5 Damage Model** - Accurate TTK with dual-layer armor, shield absorption, and damage type resistances
- **279+ Ships** - All flyable ships with hull, armor, and component HP
- **114+ Weapons** - Player-equippable weapons with proper in-game names
- **Weapon Categories** - Pilot weapons, turrets, PDCs, and specialized mounts
- **Combat Scenarios** - Dogfight, Jousting, and Synthetic test modes
- **Damage Breakdown** - Physical, Energy, and Distortion DPS with shield bypass
- **Real-time TTK** - Instant calculations as you adjust loadouts
- **Fleet Presets** - Save your favorite ship configurations
- **Multiple Themes** - Crusader, Drake, MISC, Origin, and Aegis color schemes
- **Auto-Updates** - Get notified when new versions are available

---

## Installation

### Linux

**Fedora / RHEL:**
```bash
curl -sLO https://github.com/CapCeph/ship-lens/releases/latest/download/Ship.Lens-0.1.8-1.x86_64.rpm && sudo dnf install -y ./Ship.Lens-*.rpm
```

**Ubuntu / Debian / Zorin:**
```bash
curl -sLO https://github.com/CapCeph/ship-lens/releases/latest/download/Ship.Lens_0.1.8_amd64.deb && sudo apt install -y ./Ship.Lens_*.deb
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
