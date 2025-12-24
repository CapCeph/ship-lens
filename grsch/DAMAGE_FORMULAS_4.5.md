# Star Citizen 4.5 Damage Model - Complete Formula Documentation

*Generated from P4K data extraction and research analysis*

---

## Overview

The Alpha 4.5 damage model is fundamentally different from pre-4.5. Key changes:

1. **Ballistic weapons partially bypass shields** - Physical damage passes through based on shield absorption
2. **Penetration depth matters** - Weapons have cone geometry that determines internal component access
3. **Armor has typed resistances** - Energy vs Physical vs Distortion have different effects
4. **Shield "Rule of Two"** - Only 2 shield generators active at once (rest are standby)

---

## Phase 1: Shield Damage

### For Energy Weapons (Laser Cannons, Laser Repeaters, Neutron, etc.)

```
Shield Damage = Weapon DPS × Shield Resist[Energy]

Where:
  Shield Resist[Energy] = 1 - resist_energy_avg
  (Note: resist_energy_avg is typically NEGATIVE, e.g., -0.12 means +12% damage)

Damage to Hull = 0 (energy is 100% absorbed by shields)
```

### For Physical Weapons (Ballistic Cannons, Gatlings, Mass Drivers)

```
Absorption = absorb_physical_avg  (typically 0.225 average, range 0.0-0.45)

Shield Damage = Weapon DPS × Absorption × (1 - resist_physical_avg)
Hull Passthrough = Weapon DPS × (1 - Absorption)
```

**Example:** S4 Revenant Gatling (1,266 DPS) vs typical shield:
- Shield absorbs: 1,266 × 0.225 = 285 DPS to shields
- Passthrough: 1,266 × 0.775 = 981 DPS directly to armor/hull

### For Distortion Weapons

```
Shield Damage = Weapon DPS × (1 - resist_distortion_avg)
Hull Passthrough = 0 (distortion is 100% absorbed)
```

Note: Distortion typically has 0.85+ resistance on shields, making it weak vs shields but effective at disabling components.

---

## Phase 2: Shield Time Calculation

### Standard Model (Single Shield Generator)

```
Net Shield DPS = Shield Damage - Shield Regen
Time to Break Shield = Shield HP / Net Shield DPS

If Net Shield DPS <= 0:
  Time to Break Shield = INFINITY (shields regenerate faster than damage)
```

### Rule of Two Model (Multi-Generator Ships)

```
Active Generators = MIN(2, total_shield_count)
Standby Generators = MAX(0, total_shield_count - 2)

Active Shield HP = (shield_max_hp × 2)
Redundant Phases = Standby Generators / 2  (rounded down)

Total Shield Time = (Time to Break × Active Generators) × (1 + Redundant Phases × 0.8)
  (0.8 factor accounts for swap delay and partial damage)
```

---

## Phase 3: Armor Damage

After shields are depleted (or via passthrough):

```
Armor Damage[Physical] = Hull DPS × armor_resist_physical
Armor Damage[Energy] = Hull DPS × armor_resist_energy
Armor Damage[Distortion] = Hull DPS × armor_resist_distortion

Where:
  armor_resist_physical = 0.85 (takes 85% damage, 15% reduction)
  armor_resist_energy = 1.30 (takes 130% damage, WEAK to energy)
  armor_resist_distortion = 1.0 (no resistance)

Time to Destroy Armor = Armor HP / Armor Damage
```

---

## Phase 4: Hull Damage

After armor is depleted:

```
Hull Damage = Effective DPS (no resistance modifiers on hull)
Time to Destroy Hull = Hull HP / Hull Damage
```

---

## Phase 5: Component Sniping (Advanced)

Weapons with sufficient penetration depth can damage internal components:

```
If weapon.base_penetration_distance >= component_depth:
  Component Damage = Hull DPS × zone_distribution[component_type]

Component Depths (estimated):
  - Power Plant: 5-15m (varies by ship size)
  - Coolers: 3-10m
  - Shield Generators: 2-8m
  - Thrusters: External (0m)
```

### Penetration Classes

| Penetration Depth | Can Reach |
|-------------------|-----------|
| 50m+ | Capital ship reactors |
| 25-50m | Large ship internals |
| 10-25m | Medium ship reactors |
| 5-10m | Fighter internals |
| 2-5m | Surface components |
| <2m | External only |

---

## Combat Modifiers (User-Configurable)

### Accuracy Modifiers

```
Mount Type Accuracy:
  Fixed = 0.70
  Gimballed = 0.85
  Turret = 0.90
  Auto-Gimbal = 0.95

Combat Scenario:
  Dogfight = (accuracy: 0.75, time_on_target: 0.65)
  Jousting = (accuracy: 0.85, time_on_target: 0.35)
  Synthetic = (accuracy: 0.95, time_on_target: 0.95)

Fire Mode:
  Sustained = 1.00
  Burst = 0.85
  Staggered = 0.75

Power Level:
  33% = 1.00
  50% = 1.07
  66% = 1.13
  100% = 1.20
```

### Effective DPS Formula

```
Effective DPS = Raw DPS
  × Mount Accuracy
  × Scenario Accuracy
  × Time on Target
  × Fire Mode
  × Power Multiplier
```

---

## Complete TTK Calculation

```python
def calculate_ttk(weapon, target, scenario):
    # Step 1: Calculate effective DPS
    effective_dps = weapon.dps * scenario.hit_rate * scenario.tot * scenario.fire_mode * scenario.power

    # Step 2: Split damage by type and shield absorption
    if weapon.damage_type == "Physical":
        shield_dps = effective_dps * target.shield.absorb_physical_avg * (1 + target.shield.resist_physical_avg)
        passthrough_dps = effective_dps * (1 - target.shield.absorb_physical_avg)
    elif weapon.damage_type == "Energy":
        shield_dps = effective_dps * (1 + target.shield.resist_energy_avg)  # resist is negative
        passthrough_dps = 0
    else:  # Distortion
        shield_dps = effective_dps * (1 - target.shield.resist_distortion_avg)
        passthrough_dps = 0

    # Step 3: Shield time
    net_shield_dps = max(0, shield_dps - target.shield.regen)
    if net_shield_dps > 0:
        shield_time = target.shield.hp / net_shield_dps
    else:
        shield_time = float('inf')

    # Step 4: Armor time (damage that passed through + post-shield)
    armor_dps = passthrough_dps + (effective_dps if shield_time < float('inf') else 0)
    armor_dps *= target.armor.resist[weapon.damage_type]
    armor_time = target.armor.hp / armor_dps if armor_dps > 0 else 0

    # Step 5: Hull time
    hull_dps = effective_dps  # No resistance on hull
    hull_time = target.hull.hp / hull_dps if hull_dps > 0 else 0

    # Total TTK
    return shield_time + armor_time + hull_time
```

---

## Data Sources

| Data | File | Key Fields |
|------|------|------------|
| Weapon Penetration | `weapon_penetration.csv` | `base_penetration_distance`, `near_radius`, `far_radius` |
| Shield Stats | `shields.csv` | `absorb_physical_*`, `absorb_energy_*`, `resist_*` |
| Armor Stats | `ship_parts_comprehensive.csv` | `armor_hp`, `armor_resist_*` |
| Weapon DPS | `ship_weapons.csv` | `dps`, `damage_type` |

---

## Key Insights

1. **Ballistics are king for DPS** - 55-100% of damage bypasses shields
2. **Energy weapons need shields down** - 100% blocked until shields break
3. **Armor is weak to energy** - 130% damage multiplier rewards shield-breaking
4. **Capital weapons can snipe reactors** - S10+ Mass Drivers reach 50m+ deep
5. **Small weapons bounce off big ships** - Low penetration = minimal internal damage

---

## Implementation Priority for Ship Lens

1. **Phase 1**: Add shield absorption split (ballistic vs energy)
2. **Phase 2**: Apply armor resistance by damage type
3. **Phase 3**: Add penetration depth data to weapon display
4. **Phase 4**: Component sniping TTK (power plant kill path)
5. **Phase 5**: Rule of Two multi-shield modeling
