//! Ship Lens TTK Calculation Module
//!
//! Implements the Alpha 4.5 damage model including:
//! - Ballistic shield penetration (passthrough based on absorption)
//! - Damage type resistances (Physical/Energy/Distortion)
//! - Rule of Two multi-shield failover system
//! - Armor damage with typed resistances

use serde::{Deserialize, Serialize};
use crate::data::{Ship, Weapon, Shield};

/// Combat scenario configuration affecting accuracy and DPS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatScenario {
    /// Mount type accuracy: Fixed=0.60, Gimballed=0.75, Auto-Gimbal=0.80, Turret=0.70
    pub mount_accuracy: f64,
    /// Scenario accuracy: Dogfight=0.75, Jousting=0.85, Synthetic=0.95
    pub scenario_accuracy: f64,
    /// Time on target: Dogfight=0.65, Jousting=0.35, Synthetic=0.95
    pub time_on_target: f64,
    /// Fire mode: Sustained=1.0, Burst=0.85, Staggered=0.75
    pub fire_mode: f64,
    /// Power multiplier: 33%=1.0, 50%=1.07, 66%=1.13, 100%=1.2
    pub power_multiplier: f64,
}

impl Default for CombatScenario {
    fn default() -> Self {
        Self {
            mount_accuracy: 0.75,    // Gimballed
            scenario_accuracy: 0.75, // Dogfight
            time_on_target: 0.65,    // Dogfight
            fire_mode: 1.0,          // Sustained
            power_multiplier: 1.0,   // 33% power (no boost)
        }
    }
}

/// Target zone modifiers - determines damage distribution across ship zones
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoneModifiers {
    /// Percentage of damage going to hull (0.0-1.0)
    pub hull: f64,
    /// Percentage of damage going to armor (0.0-1.0)
    pub armor: f64,
    /// Percentage of damage going to thrusters (0.0-1.0)
    pub thruster: f64,
    /// Percentage of damage going to components (0.0-1.0)
    pub component: f64,
}

impl Default for ZoneModifiers {
    fn default() -> Self {
        // Center mass - balanced damage distribution
        Self {
            hull: 0.6,
            armor: 0.3,
            thruster: 0.05,
            component: 0.05,
        }
    }
}

/// Damage breakdown by type
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DamageBreakdown {
    pub physical: f64,
    pub energy: f64,
    pub distortion: f64,
}

impl DamageBreakdown {
    pub fn total(&self) -> f64 {
        self.physical + self.energy + self.distortion
    }
}

/// Effective shield after applying Rule of Two
#[derive(Debug, Clone)]
struct EffectiveShield {
    total_hp: f64,
    regen: f64,
    failover_phases: i32,
}

/// Complete TTK calculation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTKResult {
    /// Time to deplete shields (seconds)
    pub shield_time: f64,
    /// Time to deplete armor after shields (seconds)
    pub armor_time: f64,
    /// Time to deplete hull after armor (seconds)
    pub hull_time: f64,
    /// Total time to kill (seconds)
    pub total_ttk: f64,
    /// Damage breakdown by type (after accuracy)
    pub damage_breakdown: DamageBreakdown,
    /// Effective DPS after all modifiers
    pub effective_dps: f64,
    /// DPS applied to shields (absorbed portion)
    pub shield_dps: f64,
    /// DPS that passes through shields (ballistic passthrough)
    pub passthrough_dps: f64,
    /// Armor damage eaten during shield phase
    pub armor_damage_during_shields: f64,
    /// Number of shield failover phases (Rule of Two)
    pub shield_failover_phases: i32,
}

/// Equipped weapon with quantity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquippedWeapon {
    pub weapon: Weapon,
    pub count: i32,
}

/// Calculate total damage output from weapons with scenario modifiers
fn sum_weapon_damage(weapons: &[EquippedWeapon], scenario: &CombatScenario) -> DamageBreakdown {
    let accuracy = scenario.mount_accuracy
        * scenario.scenario_accuracy
        * scenario.time_on_target
        * scenario.fire_mode
        * scenario.power_multiplier;

    let mut damage = DamageBreakdown::default();

    for equipped in weapons {
        let count = equipped.count as f64;
        damage.physical += equipped.weapon.damage_physical * count * accuracy;
        damage.energy += equipped.weapon.damage_energy * count * accuracy;
        damage.distortion += equipped.weapon.damage_distortion * count * accuracy;
    }

    damage
}

/// Calculate shield damage and passthrough based on absorption values
///
/// Shield Absorption mechanics (4.5):
/// - Physical: absorb_physical (typically 0.225) absorbed, rest passes through
/// - Energy: fully absorbed (absorb_energy = 1.0)
/// - Distortion: fully absorbed (absorb_distortion = 1.0)
fn calculate_shield_damage(damage: &DamageBreakdown, shield: &Shield) -> (f64, f64) {
    // Physical: partially absorbed, rest passes through to armor
    let phys_absorbed = damage.physical * shield.absorb_physical;
    let phys_passthrough = damage.physical * (1.0 - shield.absorb_physical);
    // Apply resistance to absorbed portion (resist_physical is typically positive = resistance)
    let phys_shield_dmg = phys_absorbed * (1.0 - shield.resist_physical);

    // Energy: fully absorbed (absorb_energy = 1.0 typically)
    let energy_absorbed = damage.energy * shield.absorb_energy;
    // Energy resistance is typically negative (shields are weak to energy = bonus damage)
    let energy_shield_dmg = energy_absorbed * (1.0 - shield.resist_energy);
    let energy_passthrough = damage.energy * (1.0 - shield.absorb_energy);

    // Distortion: fully absorbed with high resistance
    let dist_absorbed = damage.distortion * shield.absorb_distortion;
    let dist_shield_dmg = dist_absorbed * (1.0 - shield.resist_distortion);
    let dist_passthrough = damage.distortion * (1.0 - shield.absorb_distortion);

    let total_shield_dps = phys_shield_dmg + energy_shield_dmg + dist_shield_dmg;
    let total_passthrough = phys_passthrough + energy_passthrough + dist_passthrough;

    (total_shield_dps, total_passthrough)
}

/// Apply Rule of Two for multi-shield ships
///
/// Rule of Two mechanics:
/// - Only 2 shield generators can be active at once
/// - Additional generators are on standby
/// - When active shields fail, standby pair activates
/// - Each failover pair operates at ~80% efficiency
fn apply_rule_of_two(shield: &Shield, shield_count: i32) -> EffectiveShield {
    if shield_count <= 0 {
        return EffectiveShield {
            total_hp: 0.0,
            regen: 0.0,
            failover_phases: 0,
        };
    }

    let active_count = shield_count.min(2);
    let standby_count = (shield_count - 2).max(0);

    // Active shields provide full HP and regen
    let active_hp = shield.max_hp * active_count as f64;
    let active_regen = shield.regen * active_count as f64;

    // Standby shields add redundancy phases
    // Each pair of standby shields = 1 additional phase at 80% efficiency
    let failover_phases = standby_count / 2;
    let redundant_hp = shield.max_hp * 2.0 * failover_phases as f64 * 0.8;

    // Odd standby shield adds half a phase worth
    let odd_standby = if standby_count % 2 == 1 {
        shield.max_hp * 0.8
    } else {
        0.0
    };

    EffectiveShield {
        total_hp: active_hp + redundant_hp + odd_standby,
        regen: active_regen,
        failover_phases,
    }
}

/// Calculate armor damage with dual-layer damage system
///
/// Dual-layer armor mechanics (4.5):
/// Layer 1 (SCItemVehicleArmorParams.damageMultiplier):
/// - damage_mult_physical: typically 0.75 (base reduction)
/// - damage_mult_energy: typically 0.6 (base reduction)
/// - damage_mult_distortion: typically 1.0 (no reduction)
///
/// Layer 2 (SHealthComponentParams.DamageResistances):
/// - resist_physical: typically 0.85 (takes 85% of layer 1 result)
/// - resist_energy: typically 1.30 (takes 130% = weak to energy)
/// - resist_distortion: typically 1.0 (no modification)
///
/// Total effective = damage × damage_mult × resist
/// Example: 1000 physical → 1000 × 0.75 × 0.85 = 637.5 actual armor damage
fn calculate_armor_damage(damage: &DamageBreakdown, target: &Ship) -> f64 {
    // Layer 1 × Layer 2 for each damage type
    let phys_dmg = damage.physical
        * target.armor_damage_mult_physical
        * target.armor_resist_physical;
    let energy_dmg = damage.energy
        * target.armor_damage_mult_energy
        * target.armor_resist_energy;
    let dist_dmg = damage.distortion
        * target.armor_damage_mult_distortion
        * target.armor_resist_distortion;

    phys_dmg + energy_dmg + dist_dmg
}

/// Main TTK calculation function
///
/// Calculates time to kill based on:
/// 1. Weapon damage output with scenario modifiers
/// 2. Shield damage with absorption (ballistic passthrough)
/// 3. Rule of Two for multi-shield ships
/// 4. Armor damage with typed resistances
/// 5. Hull damage with zone modifiers
/// 6. Passthrough damage path (armor/hull can be destroyed while shields are up)
pub fn calculate_ttk(
    weapons: &[EquippedWeapon],
    target: &Ship,
    shield: &Shield,
    scenario: &CombatScenario,
    zone: &ZoneModifiers,
) -> TTKResult {
    // 1. Calculate damage breakdown by type with accuracy modifiers
    let damage = sum_weapon_damage(weapons, scenario);

    if damage.total() <= 0.0 {
        return TTKResult {
            shield_time: f64::INFINITY,
            armor_time: 0.0,
            hull_time: 0.0,
            total_ttk: f64::INFINITY,
            damage_breakdown: damage,
            effective_dps: 0.0,
            shield_dps: 0.0,
            passthrough_dps: 0.0,
            armor_damage_during_shields: 0.0,
            shield_failover_phases: 0,
        };
    }

    // 2. Shield phase with absorption
    let (shield_dps, passthrough_dps) = calculate_shield_damage(&damage, shield);

    // 3. Apply Rule of Two for multi-shield ships
    let effective_shield = apply_rule_of_two(shield, target.shield_count);

    // 4. Shield time calculation (time to fully deplete shields)
    let theoretical_shield_time = if effective_shield.total_hp > 0.0 {
        let net_shield_dps = (shield_dps - effective_shield.regen).max(0.0);
        if net_shield_dps > 0.0 {
            effective_shield.total_hp / net_shield_dps
        } else {
            f64::INFINITY // Can't break shields if DPS <= regen
        }
    } else {
        0.0 // No shields
    };

    // 5. Apply zone modifiers to effective HP
    let zone_armor_hp = target.armor_hp * zone.armor;
    let zone_hull_hp = target.hull_hp * zone.hull;
    let zone_thruster_hp = target.thruster_total_hp as f64 * zone.thruster;
    let zone_component_hp = (target.powerplant_total_hp + target.cooler_total_hp + target.shield_gen_total_hp) as f64 * zone.component;
    let total_hull_hp = zone_hull_hp + zone_thruster_hp + zone_component_hp;

    // 6. Calculate passthrough damage path
    // With ballistics, armor/hull can be destroyed while shields are up via passthrough
    let armor_passthrough_dps = if passthrough_dps > 0.0 {
        // Passthrough goes to armor first, apply armor resistances
        calculate_armor_damage(&DamageBreakdown {
            physical: passthrough_dps,
            energy: 0.0,
            distortion: 0.0,
        }, target)
    } else {
        0.0
    };

    // Time to destroy armor via passthrough alone
    let time_to_destroy_armor_via_passthrough = if armor_passthrough_dps > 0.0 && zone_armor_hp > 0.0 {
        zone_armor_hp / armor_passthrough_dps
    } else if zone_armor_hp <= 0.0 {
        0.0
    } else {
        f64::INFINITY
    };

    // Time to destroy hull via passthrough (after armor is gone)
    let time_to_destroy_hull_via_passthrough = if passthrough_dps > 0.0 && total_hull_hp > 0.0 {
        total_hull_hp / passthrough_dps
    } else if total_hull_hp <= 0.0 {
        0.0
    } else {
        f64::INFINITY
    };

    // Total time to kill via passthrough path (target dies while shields are still up)
    let passthrough_kill_time = time_to_destroy_armor_via_passthrough + time_to_destroy_hull_via_passthrough;

    // 7. Calculate normal path (shields break, then armor, then hull)
    // Armor damage during shield phase (passthrough from ballistics)
    let armor_damage_during_shields = if theoretical_shield_time.is_finite() && passthrough_dps > 0.0 {
        // Calculate how much armor passthrough damages during shield phase
        let max_armor_damage = armor_passthrough_dps * theoretical_shield_time;
        max_armor_damage.min(zone_armor_hp) // Can't do more damage than armor HP
    } else if theoretical_shield_time.is_infinite() && passthrough_dps > 0.0 {
        // Shields never break, all armor damage happens via passthrough
        zone_armor_hp
    } else {
        0.0
    };

    // Hull damage during shield phase (if armor is destroyed before shields)
    let hull_damage_during_shields = if theoretical_shield_time.is_finite() && passthrough_dps > 0.0 {
        let time_armor_depleted = if armor_passthrough_dps > 0.0 && zone_armor_hp > 0.0 {
            zone_armor_hp / armor_passthrough_dps
        } else {
            0.0
        };

        if time_armor_depleted < theoretical_shield_time {
            // Armor is destroyed before shields - passthrough hits hull for remaining time
            let remaining_shield_time = theoretical_shield_time - time_armor_depleted;
            (passthrough_dps * remaining_shield_time).min(total_hull_hp)
        } else {
            0.0
        }
    } else if theoretical_shield_time.is_infinite() && passthrough_dps > 0.0 {
        // Shields never break, all damage happens via passthrough
        total_hull_hp
    } else {
        0.0
    };

    let remaining_armor = (zone_armor_hp - armor_damage_during_shields).max(0.0);
    let remaining_hull = (total_hull_hp - hull_damage_during_shields).max(0.0);

    // Armor phase with resistances (after shields are down)
    let armor_dps = calculate_armor_damage(&damage, target);
    let armor_time = if remaining_armor > 0.0 && armor_dps > 0.0 {
        remaining_armor / armor_dps
    } else {
        0.0
    };

    // Hull phase (after armor, when shields are down)
    let hull_dps = damage.total();
    let hull_time = if remaining_hull > 0.0 && hull_dps > 0.0 {
        remaining_hull / hull_dps
    } else {
        0.0
    };

    // 8. Calculate total TTK - take the shorter path
    // Path A: Break shields, then destroy remaining armor/hull
    // Path B: Kill via passthrough while shields are up

    let shield_break_path_ttk = if theoretical_shield_time.is_finite() {
        theoretical_shield_time + armor_time + hull_time
    } else {
        f64::INFINITY
    };

    // Choose the shorter path
    let (total_ttk, actual_shield_time) = if passthrough_dps > 0.0 && passthrough_kill_time < shield_break_path_ttk {
        // Target dies via passthrough before shields would break
        // Redistribute timeline: shield_time = passthrough_kill_time, armor/hull = 0
        // This shows that during the entire fight, shields were "active" but passthrough was killing
        (passthrough_kill_time, passthrough_kill_time)
    } else {
        (shield_break_path_ttk, theoretical_shield_time)
    };

    // Recalculate timeline phases for display
    // If killed via passthrough, show armor/hull times as portions of total passthrough time
    let (display_shield_time, display_armor_time, display_hull_time) = if passthrough_dps > 0.0 && passthrough_kill_time < shield_break_path_ttk && passthrough_kill_time.is_finite() {
        // Killed via passthrough - redistribute timeline to show armor/hull phases during passthrough
        (0.0, time_to_destroy_armor_via_passthrough, time_to_destroy_hull_via_passthrough)
    } else if actual_shield_time.is_finite() {
        (actual_shield_time, armor_time, hull_time)
    } else {
        (f64::INFINITY, 0.0, 0.0)
    };

    TTKResult {
        shield_time: display_shield_time,
        armor_time: display_armor_time,
        hull_time: display_hull_time,
        total_ttk,
        damage_breakdown: damage,
        effective_dps: hull_dps,
        shield_dps,
        passthrough_dps,
        armor_damage_during_shields,
        shield_failover_phases: effective_shield.failover_phases,
    }
}

/// Calculate TTK without shields (shields already down or target has none)
pub fn calculate_ttk_no_shields(
    weapons: &[EquippedWeapon],
    target: &Ship,
    scenario: &CombatScenario,
) -> TTKResult {
    let damage = sum_weapon_damage(weapons, scenario);

    if damage.total() <= 0.0 {
        return TTKResult {
            shield_time: 0.0,
            armor_time: f64::INFINITY,
            hull_time: 0.0,
            total_ttk: f64::INFINITY,
            damage_breakdown: damage,
            effective_dps: 0.0,
            shield_dps: 0.0,
            passthrough_dps: 0.0,
            armor_damage_during_shields: 0.0,
            shield_failover_phases: 0,
        };
    }

    let armor_dps = calculate_armor_damage(&damage, target);
    let armor_time = if target.armor_hp > 0.0 && armor_dps > 0.0 {
        target.armor_hp / armor_dps
    } else {
        0.0
    };

    let hull_dps = damage.total();
    let hull_time = if target.hull_hp > 0.0 && hull_dps > 0.0 {
        target.hull_hp / hull_dps
    } else {
        0.0
    };

    TTKResult {
        shield_time: 0.0,
        armor_time,
        hull_time,
        total_ttk: armor_time + hull_time,
        damage_breakdown: damage.clone(),
        effective_dps: hull_dps,
        shield_dps: 0.0,
        passthrough_dps: hull_dps, // All damage goes to armor/hull (same as effective_dps)
        armor_damage_during_shields: 0.0,
        shield_failover_phases: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_weapon(phys: f64, energy: f64, dist: f64) -> Weapon {
        Weapon {
            display_name: "Test Weapon".to_string(),
            filename: "test_weapon".to_string(),
            size: 3,
            damage_type: "Mixed".to_string(),
            sustained_dps: phys + energy + dist,
            power_consumption: 100.0,
            damage_physical: phys,
            damage_energy: energy,
            damage_distortion: dist,
            base_penetration_distance: 2.0,
            near_radius: 0.1,
            far_radius: 0.2,
            weapon_type: "gun".to_string(),
            restricted_to: vec![],
            ship_exclusive: false,
        }
    }

    fn make_test_shield() -> Shield {
        Shield {
            display_name: "Test Shield".to_string(),
            internal_name: "test_shield".to_string(),
            size: 2,
            max_hp: 10000.0,
            regen: 500.0,
            resist_physical: 0.125,   // 12.5% resist
            resist_energy: -0.3,      // 30% bonus damage (weak to energy)
            resist_distortion: 0.85,  // 85% resist
            absorb_physical: 0.225,   // Only 22.5% absorbed
            absorb_energy: 1.0,       // Fully absorbed
            absorb_distortion: 1.0,   // Fully absorbed
        }
    }

    fn make_test_ship() -> Ship {
        Ship {
            filename: "test_ship".to_string(),
            display_name: "Test Ship".to_string(),
            hull_hp: 5000.0,
            armor_hp: 3000.0,
            // Dual-layer armor values (typical fighter)
            armor_damage_mult_physical: 0.75,
            armor_damage_mult_energy: 0.6,
            armor_damage_mult_distortion: 1.0,
            armor_resist_physical: 0.85,
            armor_resist_energy: 1.30,
            armor_resist_distortion: 1.0,
            thruster_main_hp: 500,
            thruster_retro_hp: 200,
            thruster_mav_hp: 200,
            thruster_vtol_hp: 0,
            thruster_total_hp: 900,
            turret_total_hp: 0,
            powerplant_total_hp: 500,
            cooler_total_hp: 300,
            shield_gen_total_hp: 400,
            qd_total_hp: 300,
            pilot_weapon_count: 2,
            pilot_weapon_sizes: "S3, S3".to_string(),
            max_shield_size: 2,
            shield_count: 2,
            default_shield_ref: "".to_string(),
            weapon_hardpoints: vec![],
        }
    }

    #[test]
    fn test_ballistic_passthrough() {
        // Ballistic weapon (physical only)
        let weapon = make_test_weapon(1000.0, 0.0, 0.0);
        let shield = make_test_shield();

        let damage = DamageBreakdown {
            physical: 1000.0,
            energy: 0.0,
            distortion: 0.0,
        };

        let (shield_dps, passthrough_dps) = calculate_shield_damage(&damage, &shield);

        // 22.5% absorbed * (1 - 0.125 resist) = 0.225 * 0.875 = 0.197
        assert!((shield_dps - 196.875).abs() < 0.1);
        // 77.5% passes through
        assert!((passthrough_dps - 775.0).abs() < 0.1);
    }

    #[test]
    fn test_energy_no_passthrough() {
        // Energy weapon (no physical)
        let damage = DamageBreakdown {
            physical: 0.0,
            energy: 1000.0,
            distortion: 0.0,
        };
        let shield = make_test_shield();

        let (shield_dps, passthrough_dps) = calculate_shield_damage(&damage, &shield);

        // 100% absorbed * (1 - (-0.3) resist) = 1.0 * 1.3 = 1300
        assert!((shield_dps - 1300.0).abs() < 0.1);
        assert!((passthrough_dps - 0.0).abs() < 0.1);
    }

    #[test]
    fn test_rule_of_two() {
        let shield = make_test_shield();

        // 2 shields = no failover
        let eff2 = apply_rule_of_two(&shield, 2);
        assert_eq!(eff2.failover_phases, 0);
        assert!((eff2.total_hp - 20000.0).abs() < 0.1);

        // 4 shields = 1 failover phase
        let eff4 = apply_rule_of_two(&shield, 4);
        assert_eq!(eff4.failover_phases, 1);
        // 2 active + 2 standby at 80% = 20000 + 16000 = 36000
        assert!((eff4.total_hp - 36000.0).abs() < 0.1);

        // 6 shields = 2 failover phases
        let eff6 = apply_rule_of_two(&shield, 6);
        assert_eq!(eff6.failover_phases, 2);
        // 2 active + 4 standby at 80% = 20000 + 32000 = 52000
        assert!((eff6.total_hp - 52000.0).abs() < 0.1);
    }

    #[test]
    fn test_armor_resistances() {
        let ship = make_test_ship();

        // Physical damage with dual-layer armor
        // 1000 × 0.75 (damage_mult) × 0.85 (resist) = 637.5
        let phys_damage = DamageBreakdown { physical: 1000.0, energy: 0.0, distortion: 0.0 };
        let phys_armor_dps = calculate_armor_damage(&phys_damage, &ship);
        assert!((phys_armor_dps - 637.5).abs() < 0.1, "Physical: expected 637.5, got {}", phys_armor_dps);

        // Energy damage with dual-layer armor
        // 1000 × 0.6 (damage_mult) × 1.3 (resist, weak to energy) = 780
        let energy_damage = DamageBreakdown { physical: 0.0, energy: 1000.0, distortion: 0.0 };
        let energy_armor_dps = calculate_armor_damage(&energy_damage, &ship);
        assert!((energy_armor_dps - 780.0).abs() < 0.1, "Energy: expected 780, got {}", energy_armor_dps);

        // Distortion damage (no modification)
        // 1000 × 1.0 (damage_mult) × 1.0 (resist) = 1000
        let dist_damage = DamageBreakdown { physical: 0.0, energy: 0.0, distortion: 1000.0 };
        let dist_armor_dps = calculate_armor_damage(&dist_damage, &ship);
        assert!((dist_armor_dps - 1000.0).abs() < 0.1, "Distortion: expected 1000, got {}", dist_armor_dps);
    }

    #[test]
    fn test_full_ttk_calculation() {
        let weapon = make_test_weapon(500.0, 500.0, 0.0);
        let equipped = vec![EquippedWeapon { weapon, count: 2 }];
        let target = make_test_ship();
        let shield = make_test_shield();
        let scenario = CombatScenario {
            mount_accuracy: 1.0,
            scenario_accuracy: 1.0,
            time_on_target: 1.0,
            fire_mode: 1.0,
            power_multiplier: 1.0,
        };
        let zone = ZoneModifiers::default(); // Center mass

        let result = calculate_ttk(&equipped, &target, &shield, &scenario, &zone);

        // Should complete and have positive times
        assert!(result.total_ttk > 0.0);
        assert!(result.total_ttk.is_finite());
        // With passthrough, the timeline might show shield_time = 0 if killed via passthrough
        // But armor_time + hull_time should be positive
        assert!(result.armor_time + result.hull_time > 0.0 || result.shield_time > 0.0,
            "At least one timeline phase should be positive");
        assert!(result.armor_time >= 0.0);
        assert!(result.hull_time >= 0.0);

        // Passthrough should be present (ballistic component)
        assert!(result.passthrough_dps > 0.0);
    }

    #[test]
    fn test_zone_modifiers_affect_ttk() {
        let weapon = make_test_weapon(1000.0, 0.0, 0.0);
        let equipped = vec![EquippedWeapon { weapon, count: 1 }];
        let target = make_test_ship();
        let shield = make_test_shield();
        let scenario = CombatScenario {
            mount_accuracy: 1.0,
            scenario_accuracy: 1.0,
            time_on_target: 1.0,
            fire_mode: 1.0,
            power_multiplier: 1.0,
        };

        // Center mass (default: 60% hull, 30% armor)
        let zone_center = ZoneModifiers::default();
        let result_center = calculate_ttk(&equipped, &target, &shield, &scenario, &zone_center);

        // Engines (primarily thrusters: 10% hull, 20% armor, 60% thruster, 10% component)
        let zone_engines = ZoneModifiers {
            hull: 0.1,
            armor: 0.2,
            thruster: 0.6,
            component: 0.1,
        };
        let result_engines = calculate_ttk(&equipped, &target, &shield, &scenario, &zone_engines);

        // With passthrough damage, pure ballistic weapons can now kill without breaking shields
        // Shields can't be broken (196 DPS absorbed < 500 regen), but passthrough (775 DPS) kills
        // So shield_time = 0 (killed via passthrough path), armor_time + hull_time shows actual TTK
        // Total TTK should be finite for both
        assert!(result_center.total_ttk.is_finite(),
            "Center mass TTK should be finite: {}", result_center.total_ttk);
        assert!(result_engines.total_ttk.is_finite(),
            "Engines TTK should be finite: {}", result_engines.total_ttk);

        // Armor and hull times should differ due to zone targeting
        assert!((result_center.armor_time - result_engines.armor_time).abs() > 0.1,
            "Armor time should differ: center={}, engines={}",
            result_center.armor_time, result_engines.armor_time);

        assert!((result_center.hull_time - result_engines.hull_time).abs() > 0.1,
            "Hull time should differ: center={}, engines={}",
            result_center.hull_time, result_engines.hull_time);

        // Engines target should have faster TTK (less HP to destroy)
        assert!(result_engines.total_ttk < result_center.total_ttk,
            "Targeting engines should be faster: engines={}, center={}",
            result_engines.total_ttk, result_center.total_ttk);
    }
}
