//! Ship Lens Data Structures
//!
//! Contains all the data models for Star Citizen ships, weapons, and shields.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Weapon hardpoint with category information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaponHardpoint {
    pub slot_number: i32,
    pub port_name: String,
    pub max_size: i32,
    pub gimbal_type: String,
    pub control_type: String,
    pub category: String,  // "pilot", "manned_turret", "remote_turret", "pdc", "specialized", "torpedo", "missile", "bomb"
    pub default_weapon: String,  // filename of default weapon for this hardpoint
    pub mount_name: String,  // gimbal/turret mount name (e.g., "crus_spirit_nose_turret_s3")
    pub sub_port_count: i32,  // number of weapon sub-ports (1 for single, 2 for dual mount)
    pub sub_port_sizes: String,  // comma-separated sizes of sub-ports (e.g., "3,3" for dual S3)
}

/// Ship data with survivability and loadout information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ship {
    pub filename: String,
    pub display_name: String,
    pub hull_hp: i32,
    pub armor_hp: i32,
    // Dual-layer armor damage system (4.5):
    // Layer 1: SCItemVehicleArmorParams.damageMultiplier
    pub armor_damage_mult_physical: f64,
    pub armor_damage_mult_energy: f64,
    pub armor_damage_mult_distortion: f64,
    // Layer 2: SHealthComponentParams.DamageResistances
    pub armor_resist_physical: f64,
    pub armor_resist_energy: f64,
    pub armor_resist_distortion: f64,
    pub thruster_main_hp: i32,
    pub thruster_retro_hp: i32,
    pub thruster_mav_hp: i32,
    pub thruster_vtol_hp: i32,
    pub thruster_total_hp: i32,
    pub turret_total_hp: i32,
    pub powerplant_total_hp: i32,
    pub cooler_total_hp: i32,
    pub shield_gen_total_hp: i32,
    pub qd_total_hp: i32,
    pub pilot_weapon_count: i32,
    pub pilot_weapon_sizes: String,
    pub max_shield_size: i32,
    pub shield_count: i32,
    pub default_shield_ref: String,
    pub weapon_hardpoints: Vec<WeaponHardpoint>,
}

/// Weapon data with damage output and penetration info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weapon {
    pub display_name: String,
    pub filename: String,
    pub size: i32,
    pub damage_type: String,
    pub sustained_dps: f64,
    pub power_consumption: f64,
    // 4.5 damage breakdown by type
    pub damage_physical: f64,
    pub damage_energy: f64,
    pub damage_distortion: f64,
    // Penetration cone data
    pub base_penetration_distance: f64,
    pub near_radius: f64,
    pub far_radius: f64,
}

/// Shield data with defense and absorption values
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shield {
    pub display_name: String,
    pub internal_name: String,
    pub size: i32,
    pub max_hp: f64,
    pub regen: f64,
    pub resist_physical: f64,
    pub resist_energy: f64,
    pub resist_distortion: f64,
    // 4.5 absorption values (how much damage is absorbed vs passes through)
    // Physical: 0.0-0.45 typical (55-100% passes through for ballistics!)
    // Energy: 1.0 typical (fully absorbed)
    // Distortion: 1.0 typical (fully absorbed)
    pub absorb_physical: f64,
    pub absorb_energy: f64,
    pub absorb_distortion: f64,
}

/// Damage calculation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DamageResult {
    pub ttk_seconds: f64,
    pub shield_damage_time: f64,
    pub armor_damage_time: f64,
    pub hull_damage_time: f64,
    pub effective_dps: f64,
    pub total_hp_to_destroy: f64,
}

/// Combat scenario configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatScenario {
    pub scenario_type: String,
    pub mount_type: String,
    pub fire_mode: String,
    pub target_zone: String,
    pub accuracy_modifier: f64,
}

/// The main data store for all game data
#[derive(Debug, Clone, Default)]
pub struct GameData {
    pub ships: HashMap<String, Ship>,
    pub weapons: HashMap<String, Weapon>,
    pub shields: HashMap<String, Shield>,
}

impl GameData {
    /// Load all game data from CSV files in the data directory
    pub fn load(data_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let mut data = GameData::default();

        data.load_ships(data_dir)?;
        data.load_weapons(data_dir)?;
        data.load_shields(data_dir)?;

        Ok(data)
    }

    fn load_ships(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        // Filter patterns for AI variants
        let filter_patterns = [
            "_ai_", "_pu_ai", "_ea_ai", "_teach", "_tutorial",
            "_hijacked", "_derelict", "_wreck", "fleetweek",
            "citizencon", "indestructible", "gamemaster"
        ];

        // Load parts data
        let parts_path = data_dir.join("ship_parts_comprehensive.csv");
        let hardpoint_path = data_dir.join("ship_hardpoint_summary.csv");
        let hull_hp_path = data_dir.join("ship_hull_hp.csv");
        let weapon_hardpoints_path = data_dir.join("ship_weapon_hardpoints.csv");

        // Build default shield lookup from ship_hull_hp.csv
        // CSV columns: display_name,internal_name,hull_hp,shield_count,shield_size,
        //              total_shield_hp,total_shield_regen,shield_hp_each,shield_regen_each,shield_ref,filename
        let mut shield_ref_lookup: HashMap<String, String> = HashMap::new();
        if hull_hp_path.exists() {
            let mut rdr = csv::Reader::from_path(&hull_hp_path)?;
            for result in rdr.records() {
                let record = result?;
                let filename = record.get(10).unwrap_or("");  // filename column
                let shield_ref = record.get(9).unwrap_or("").to_lowercase();  // shield_ref column
                if !shield_ref.is_empty() {
                    shield_ref_lookup.insert(filename.to_uppercase(), shield_ref);
                }
            }
        }

        // Build detailed weapon hardpoints lookup
        // CSV v4 columns: ship_name,slot_number,port_name,max_size,gimbal_type,category,mount_name,sub_port_count,sub_port_sizes,default_weapon
        let mut weapon_hardpoints_lookup: HashMap<String, Vec<WeaponHardpoint>> = HashMap::new();
        if weapon_hardpoints_path.exists() {
            let mut rdr = csv::Reader::from_path(&weapon_hardpoints_path)?;
            for result in rdr.records() {
                let record = result?;
                let ship_name = record.get(0).unwrap_or("").to_uppercase();
                let port_name = record.get(2).unwrap_or("").to_lowercase();
                let category = record.get(5).unwrap_or("Unknown").to_string();
                let mut max_size: i32 = record.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

                // If size is 0, try to infer from port_name patterns (for ships with incomplete data)
                if max_size == 0 {
                    max_size = Self::infer_weapon_size_from_port(&port_name);
                }

                // Skip slots that still have size 0 after inference (truly empty hardpoints)
                if max_size == 0 {
                    continue;
                }

                let hardpoint = WeaponHardpoint {
                    slot_number: record.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
                    port_name: port_name.clone(),
                    max_size,
                    gimbal_type: record.get(4).unwrap_or("Unknown").to_string(),
                    control_type: category.clone(),  // Populate control_type field with category value
                    category,
                    default_weapon: record.get(9).unwrap_or("").to_string(),  // v4: default_weapon column
                    mount_name: record.get(6).unwrap_or("").to_string(),
                    sub_port_count: record.get(7).and_then(|s| s.parse().ok()).unwrap_or(1),
                    sub_port_sizes: record.get(8).unwrap_or("").to_string(),
                };

                weapon_hardpoints_lookup
                    .entry(ship_name)
                    .or_insert_with(Vec::new)
                    .push(hardpoint);
            }
        }

        // Build hardpoint lookup
        // CSV columns: ship_name,weapon_count,pilot_weapon_count,turret_weapon_count,
        //              weapon_sizes,pilot_weapon_sizes,max_weapon_size,shield_count,
        //              shield_sizes,max_shield_size,...
        let mut hp_lookup: HashMap<String, (i32, String, i32, i32)> = HashMap::new();
        if hardpoint_path.exists() {
            let mut rdr = csv::Reader::from_path(&hardpoint_path)?;
            for result in rdr.records() {
                let record = result?;
                let ship_name = record.get(0).unwrap_or("");
                let pilot_count: i32 = record.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                let pilot_sizes = record.get(5).unwrap_or("").to_string();
                let shield_count: i32 = record.get(7).and_then(|s| s.parse().ok()).unwrap_or(1);
                let max_shield_size: i32 = record.get(9).and_then(|s| s.parse().ok()).unwrap_or(0);
                hp_lookup.insert(ship_name.to_uppercase(), (pilot_count, pilot_sizes, max_shield_size, shield_count));
            }
        }

        if parts_path.exists() {
            let mut rdr = csv::Reader::from_path(&parts_path)?;
            for result in rdr.records() {
                let record = result?;
                let filename = record.get(0).unwrap_or("");

                // Skip AI variants
                if filter_patterns.iter().any(|p| filename.to_lowercase().contains(p)) {
                    continue;
                }

                let ship_upper = filename.to_uppercase();
                let (pilot_count, pilot_sizes, max_shield_size, shield_count) = hp_lookup.get(&ship_upper)
                    .cloned()
                    .unwrap_or((0, String::new(), 0, 1));

                // Include all ships (even without pilot weapons) as they can be targets

                let display_name = Self::format_ship_name(filename);

                // CSV columns (after dual-layer armor update):
                // 0: filename, 1: display_name, 2: hull_hp_normalized, 3: fuse_penetration_mult,
                // 4: component_penetration_mult, 5: critical_explosion_chance, 6: armor_hp,
                // 7: armor_resist_physical, 8: armor_resist_energy, 9: armor_resist_distortion,
                // 10: armor_damage_mult_physical, 11: armor_damage_mult_energy, 12: armor_damage_mult_distortion,
                // 13: armor_effective_physical, 14: armor_effective_energy, 15: armor_effective_distortion,
                // 16: thruster_count, 17: thruster_main_hp, 18: thruster_retro_hp, 19: thruster_mav_hp,
                // 20: thruster_vtol_hp, 21: thruster_total_hp, 22: turret_count, 23: turret_total_hp,
                // 24: powerplant_count, 25: powerplant_total_hp, 26: cooler_count, 27: cooler_total_hp,
                // 28: shield_gen_count, 29: shield_gen_total_hp, 30: qd_count, 31: qd_total_hp,...
                // Get weapon hardpoints for this ship
                let hardpoints = weapon_hardpoints_lookup.get(&ship_upper)
                    .cloned()
                    .unwrap_or_default();

                let ship = Ship {
                    filename: filename.to_string(),
                    display_name: display_name.clone(),
                    hull_hp: record.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),  // hull_hp_normalized
                    armor_hp: record.get(6).and_then(|s| s.parse().ok()).unwrap_or(0),  // armor_hp
                    // Dual-layer armor damage system
                    armor_damage_mult_physical: record.get(10).and_then(|s| s.parse().ok()).unwrap_or(0.75),
                    armor_damage_mult_energy: record.get(11).and_then(|s| s.parse().ok()).unwrap_or(0.6),
                    armor_damage_mult_distortion: record.get(12).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                    armor_resist_physical: record.get(7).and_then(|s| s.parse().ok()).unwrap_or(0.85),
                    armor_resist_energy: record.get(8).and_then(|s| s.parse().ok()).unwrap_or(1.3),
                    armor_resist_distortion: record.get(9).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                    // Component HP (shifted by 6 columns due to new armor fields)
                    thruster_main_hp: record.get(17).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_retro_hp: record.get(18).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_mav_hp: record.get(19).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_vtol_hp: record.get(20).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_total_hp: record.get(21).and_then(|s| s.parse().ok()).unwrap_or(0),
                    turret_total_hp: record.get(23).and_then(|s| s.parse().ok()).unwrap_or(0),
                    powerplant_total_hp: record.get(25).and_then(|s| s.parse().ok()).unwrap_or(0),
                    cooler_total_hp: record.get(27).and_then(|s| s.parse().ok()).unwrap_or(0),
                    shield_gen_total_hp: record.get(29).and_then(|s| s.parse().ok()).unwrap_or(0),
                    qd_total_hp: record.get(31).and_then(|s| s.parse().ok()).unwrap_or(0),
                    pilot_weapon_count: pilot_count,
                    pilot_weapon_sizes: pilot_sizes,
                    max_shield_size,
                    shield_count,
                    default_shield_ref: shield_ref_lookup.get(&ship_upper).cloned().unwrap_or_default(),
                    weapon_hardpoints: hardpoints,
                };

                self.ships.insert(display_name, ship);
            }
        }

        Ok(())
    }

    /// Infer weapon size from port_name when actual size data is missing
    /// Based on common Star Citizen naming conventions:
    /// - Remote turrets (PDCs): typically S2
    /// - Manned turrets on capital ships: typically S4-S5
    /// - Side turrets: typically S4
    /// - Top/bottom turrets: typically S4-S5
    /// - Chin cannons: typically S7+
    fn infer_weapon_size_from_port(port_name: &str) -> i32 {
        let port_lower = port_name.to_lowercase();

        // Skip ordnance hardpoints (missiles, torpedoes, bombs, racks - not direct-fire weapons)
        if port_lower.contains("torpedo") || port_lower.contains("missile")
            || port_lower.contains("rack") || port_lower.contains("bomb") {
            return 0;
        }

        // Skip camera/sensor ports
        if port_lower.contains("camera") || port_lower.contains("sensor") {
            return 0;
        }

        // Remote turrets (PDCs) - typically S2
        if port_lower.contains("remote") {
            return 2;
        }

        // Chin cannons - typically large (S7)
        if port_lower.contains("chin") {
            return 7;
        }

        // Main cannon - very large (S10)
        if port_lower.contains("main_cannon") {
            return 10;
        }

        // Railgun - large (S7)
        if port_lower.contains("rail") {
            return 7;
        }

        // Side turrets on capital ships - typically S4
        if port_lower.contains("turret_side") {
            return 4;
        }

        // Top/bottom turrets - typically S5
        if port_lower.contains("turret_top") || port_lower.contains("turret_bottom")
            || port_lower.contains("turret_lower") || port_lower.contains("turret_upper") {
            return 5;
        }

        // Generic weapon turret - S4 (must have "weapon" in name to distinguish from utility turrets)
        if port_lower.contains("turret") && port_lower.contains("weapon") {
            return 4;
        }

        // Skip utility turrets (turret without "weapon" in name - tractor beams, mining, etc.)
        if port_lower.contains("turret") && !port_lower.contains("weapon") {
            return 0;
        }

        // Generic weapon hardpoints - S3 default
        if port_lower.contains("weapon") || port_lower.contains("gun") {
            return 3;
        }

        // Unknown - skip
        0
    }

    /// Derive weapon hardpoint category from port_name and control_type
    /// Returns one of: "torpedo", "missile", "bomb", "pdc", "specialized",
    /// "remote_turret", "manned_turret", "pilot"
    ///
    /// NOTE: This function is no longer used for hardpoint loading (v4 CSV has category column).
    /// Kept for potential future use or fallback scenarios.
    fn derive_hardpoint_category(port_name: &str, control_type: &str) -> String {
        let port_lower = port_name.to_lowercase();

        // 1. Ordnance patterns (highest priority)
        if port_lower.contains("torpedo") {
            return "torpedo".to_string();
        }
        if port_lower.contains("missile") || port_lower.contains("rack") {
            return "missile".to_string();
        }
        if port_lower.contains("bomb") {
            return "bomb".to_string();
        }

        // 2. Special patterns
        // PDC/PDT (Point Defense Cannons/Turrets)
        if port_lower.contains("pdc") || port_lower.contains("pdt") {
            return "pdc".to_string();
        }
        // Specialized weapons (chin guns, main cannons, railguns, spinal mounts)
        if port_lower.contains("chin") || port_lower.contains("main_cannon")
            || port_lower.contains("rail") || port_lower.contains("spinal")
            || control_type == "Specialized" {
            return "specialized".to_string();
        }

        // 3. Turret patterns
        // Remote turrets (remotely-operated, not auto-PDC)
        if port_lower.contains("remote") && (port_lower.contains("turret") || control_type == "Turret") {
            return "remote_turret".to_string();
        }
        // Manned turrets (without "remote")
        if port_lower.contains("turret") || control_type == "Turret" {
            return "manned_turret".to_string();
        }

        // 4. Pilot patterns
        if control_type == "Pilot" {
            // Check for typical pilot weapon port names
            if port_lower.contains("nose") || port_lower.contains("wing") || port_lower.contains("gun") {
                return "pilot".to_string();
            }
        }

        // 5. Fallbacks
        // "gun" pattern typically indicates pilot weapons
        if port_lower.contains("gun") {
            return "pilot".to_string();
        }

        // Generic "weapon" - check context
        if port_lower.contains("weapon") {
            // Capital ship patterns (generic weapon hardpoints on large ships)
            if (port_lower == "hardpoint_weapon_left" || port_lower == "hardpoint_weapon_right")
                || (port_lower.starts_with("hardpoint_weapon_") &&
                    (port_lower.ends_with("_left") || port_lower.ends_with("_right"))) {
                return "manned_turret".to_string();
            }
            // Default weapon to pilot for smaller ships
            return "pilot".to_string();
        }

        // Default fallback
        "pilot".to_string()
    }

    fn format_ship_name(filename: &str) -> String {
        let manufacturers: HashMap<&str, &str> = [
            ("aegs", "Aegis"), ("anvl", "Anvil"), ("argo", "Argo"), ("banu", "Banu"),
            ("cnou", "C.O."), ("crus", "Crusader"), ("drak", "Drake"),
            ("espr", "Esperia"), ("gama", "Gatac"), ("krig", "Kruger"),
            ("misc", "MISC"), ("mrai", "Mirai"), ("orig", "Origin"), ("rsi", "RSI"),
            ("tmbl", "Tumbril"), ("vncl", "Vanduul"), ("xian", "Xi'An"),
        ].into_iter().collect();

        let name_fixes: HashMap<&str, &str> = [
            ("avenger", "Avenger"), ("stalker", "Stalker"), ("titan", "Titan"),
            ("gladius", "Gladius"), ("eclipse", "Eclipse"), ("hammerhead", "Hammerhead"),
            ("sabre", "Sabre"), ("vanguard", "Vanguard"), ("hornet", "Hornet"),
            ("arrow", "Arrow"), ("hawk", "Hawk"), ("hurricane", "Hurricane"),
            ("valkyrie", "Valkyrie"), ("carrack", "Carrack"), ("pisces", "Pisces"),
            ("gladiator", "Gladiator"), ("terrapin", "Terrapin"), ("redeemer", "Redeemer"),
            ("mole", "MOLE"), ("raft", "RAFT"), ("mpuv", "MPUV"), ("srv", "SRV"),
            ("f7a", "F7A"), ("f7c", "F7C"), ("f7cm", "F7C-M"), ("f7cr", "F7C-R"),
            ("f7cs", "F7C-S"), ("f8", "F8"), ("f8c", "F8C"),
            ("mk1", "Mk I"), ("mk2", "Mk II"),
            ("c8", "C8"), ("c8r", "C8R"), ("c8x", "C8X"),
            ("a1", "A1"), ("a2", "A2"), ("c1", "C1"), ("c2", "C2"), ("m2", "M2"),
            ("p52", "P-52"), ("p72", "P-72"),
            ("mustang", "Mustang"), ("aurora", "Aurora"), ("constellation", "Constellation"),
            ("freelancer", "Freelancer"), ("starfarer", "Starfarer"), ("prospector", "Prospector"),
            ("cutlass", "Cutlass"), ("caterpillar", "Caterpillar"), ("corsair", "Corsair"),
            ("buccaneer", "Buccaneer"), ("herald", "Herald"), ("vulture", "Vulture"),
            ("defender", "Defender"), ("prowler", "Prowler"), ("talon", "Talon"),
            ("nox", "Nox"), ("dragonfly", "Dragonfly"), ("razor", "Razor"), ("reliant", "Reliant"),
            ("polaris", "Polaris"), ("idris", "Idris"), ("javelin", "Javelin"), ("kraken", "Kraken"),
            ("reclaimer", "Reclaimer"), ("merchantman", "Merchantman"), ("endeavor", "Endeavor"),
            ("genesis", "Genesis"), ("hull", "Hull"), ("orion", "Orion"), ("pioneer", "Pioneer"),
            ("nautilus", "Nautilus"), ("perseus", "Perseus"), ("liberator", "Liberator"),
        ].into_iter().collect();

        let lowercase = filename.to_lowercase();
        let parts: Vec<&str> = lowercase.split('_').collect();
        if parts.len() < 2 {
            return filename.to_string();
        }

        let mfr_name = manufacturers.get(parts[0]).unwrap_or(&parts[0]);

        let model_parts: Vec<String> = parts[1..]
            .iter()
            .map(|p| {
                name_fixes.get(*p)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        let mut chars: Vec<char> = p.chars().collect();
                        if !chars.is_empty() {
                            chars[0] = chars[0].to_uppercase().next().unwrap_or(chars[0]);
                        }
                        chars.into_iter().collect()
                    })
            })
            .collect();

        format!("{} {}", mfr_name, model_parts.join(" "))
    }

    fn load_weapons(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        // Try the new combined CSV first, fall back to legacy
        let combined_path = data_dir.join("weapons_combined.csv");
        let legacy_path = data_dir.join("ship_weapons.csv");
        let power_path = data_dir.join("weapon_power_data.csv");

        // Build power lookup for legacy format
        let mut power_lookup: HashMap<String, f64> = HashMap::new();
        if power_path.exists() {
            let mut rdr = csv::Reader::from_path(&power_path)?;
            for result in rdr.records() {
                let record = result?;
                if let (Some(filename), Some(power)) = (record.get(0), record.get(1)) {
                    power_lookup.insert(
                        filename.to_lowercase(),
                        power.parse().unwrap_or(0.0)
                    );
                }
            }
        }

        // Use combined CSV if available (4.5 format with penetration data)
        if combined_path.exists() {
            let mut rdr = csv::Reader::from_path(&combined_path)?;
            // CSV columns: display_name,filename,manufacturer,size,damage_type,
            //              sustained_dps,fire_rate,damage_per_shot,speed,max_range,
            //              damage_physical,damage_energy,damage_distortion,
            //              base_penetration_distance,near_radius,far_radius,max_penetration_thickness
            for result in rdr.records() {
                let record = result?;
                let display_name = record.get(0).unwrap_or("Unknown").to_string();
                let filename = record.get(1).unwrap_or("").to_string();
                let size: i32 = record.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

                if size == 0 {
                    continue;
                }

                let sustained_dps: f64 = record.get(5).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                let damage_per_shot: f64 = record.get(7).and_then(|s| s.parse().ok()).unwrap_or(1.0);

                // Per-shot damage breakdown
                let phys_per_shot: f64 = record.get(10).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                let energy_per_shot: f64 = record.get(11).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                let dist_per_shot: f64 = record.get(12).and_then(|s| s.parse().ok()).unwrap_or(0.0);

                // Convert per-shot to DPS by ratio
                // DPS_type = sustained_dps * (damage_type_per_shot / damage_per_shot_total)
                let total_per_shot = phys_per_shot + energy_per_shot + dist_per_shot;
                let (damage_physical, damage_energy, damage_distortion) = if total_per_shot > 0.0 {
                    (
                        sustained_dps * (phys_per_shot / total_per_shot),
                        sustained_dps * (energy_per_shot / total_per_shot),
                        sustained_dps * (dist_per_shot / total_per_shot),
                    )
                } else {
                    // Fallback: assume all energy if no breakdown
                    (0.0, sustained_dps, 0.0)
                };

                let weapon = Weapon {
                    display_name: display_name.clone(),
                    filename: filename.clone(),
                    size,
                    damage_type: record.get(4).unwrap_or("Unknown").to_string(),
                    sustained_dps,
                    power_consumption: power_lookup.get(&filename.to_lowercase()).copied().unwrap_or(0.0),
                    // 4.5 damage breakdown (converted to DPS)
                    damage_physical,
                    damage_energy,
                    damage_distortion,
                    // Penetration data
                    base_penetration_distance: record.get(13).and_then(|s| s.parse().ok()).unwrap_or(2.0),
                    near_radius: record.get(14).and_then(|s| s.parse().ok()).unwrap_or(0.1),
                    far_radius: record.get(15).and_then(|s| s.parse().ok()).unwrap_or(0.2),
                };

                self.weapons.insert(display_name, weapon);
            }
        } else if legacy_path.exists() {
            // Fallback to legacy format
            let mut rdr = csv::Reader::from_path(&legacy_path)?;
            for result in rdr.records() {
                let record = result?;
                let display_name = record.get(0).unwrap_or("Unknown").to_string();
                let filename = record.get(1).unwrap_or("").to_string();
                let size: i32 = record.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);

                if size == 0 {
                    continue;
                }

                let sustained_dps: f64 = record.get(9).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                let damage_type = record.get(3).unwrap_or("Unknown").to_string();

                // Infer damage breakdown from type for legacy data
                let (damage_physical, damage_energy, damage_distortion) = match damage_type.to_lowercase().as_str() {
                    s if s.contains("ballistic") || s.contains("physical") => (sustained_dps, 0.0, 0.0),
                    s if s.contains("distortion") => (0.0, 0.0, sustained_dps),
                    _ => (0.0, sustained_dps, 0.0), // Default to energy
                };

                let weapon = Weapon {
                    display_name: display_name.clone(),
                    filename: filename.clone(),
                    size,
                    damage_type,
                    sustained_dps,
                    power_consumption: power_lookup.get(&filename.to_lowercase()).copied().unwrap_or(0.0),
                    damage_physical,
                    damage_energy,
                    damage_distortion,
                    base_penetration_distance: 2.0, // Default
                    near_radius: 0.1,
                    far_radius: 0.2,
                };

                self.weapons.insert(display_name, weapon);
            }
        }

        Ok(())
    }

    fn load_shields(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        // Try the new combined CSV first, fall back to legacy
        let combined_path = data_dir.join("shields_combined.csv");
        let legacy_path = data_dir.join("shields.csv");

        let mfr_codes: HashMap<&str, &str> = [
            ("godi", "Gorgon Defender"), ("asas", "ASAS"), ("basl", "Basilisk"),
            ("seco", "Seal Corp"), ("banu", "Banu"), ("behr", "Behring"),
        ].into_iter().collect();

        // Use combined CSV if available (4.5 format with absorption data)
        if combined_path.exists() {
            let mut rdr = csv::Reader::from_path(&combined_path)?;
            // CSV columns: display_name,internal_name,size,max_hp,regen,damage_regen_delay,
            //              down_regen_delay,resist_physical,resist_energy,resist_distortion,
            //              absorb_physical,absorb_energy,absorb_distortion
            for result in rdr.records() {
                let record = result?;
                let display_name = record.get(0).unwrap_or("Unknown").to_string();
                let internal_name = record.get(1).unwrap_or("").to_string();

                if internal_name.contains("Template") {
                    continue;
                }

                let max_hp: f64 = record.get(3).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                if max_hp <= 0.0 {
                    continue;
                }

                let shield = Shield {
                    display_name: display_name.clone(),
                    internal_name,
                    size: record.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
                    max_hp,
                    regen: record.get(4).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    resist_physical: record.get(7).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    resist_energy: record.get(8).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    resist_distortion: record.get(9).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    // 4.5 absorption values
                    absorb_physical: record.get(10).and_then(|s| s.parse().ok()).unwrap_or(0.225),
                    absorb_energy: record.get(11).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                    absorb_distortion: record.get(12).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                };

                self.shields.insert(display_name, shield);
            }
        } else if legacy_path.exists() {
            // Fallback to legacy format
            let mut rdr = csv::Reader::from_path(&legacy_path)?;
            for result in rdr.records() {
                let record = result?;
                let name = record.get(0).unwrap_or("");

                if name.contains("Template") {
                    continue;
                }

                let max_hp: f64 = record.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                if max_hp <= 0.0 {
                    continue;
                }

                // Format display name from internal name
                let display_name = {
                    let clean_name = name.to_lowercase().replace("_scitem", "");
                    let parts: Vec<&str> = clean_name.split('_').collect();
                    if parts.len() >= 4 && parts[0] == "shld" {
                        let mfr = mfr_codes.get(parts[1]).unwrap_or(&parts[1]);
                        let model: String = parts[3..].iter()
                            .map(|p| {
                                let mut chars: Vec<char> = p.chars().collect();
                                if !chars.is_empty() {
                                    chars[0] = chars[0].to_uppercase().next().unwrap_or(chars[0]);
                                }
                                chars.into_iter().collect::<String>()
                            })
                            .collect::<Vec<_>>()
                            .join(" ");
                        format!("{} {}", mfr, model)
                    } else {
                        name.to_string()
                    }
                };

                // CSV columns: name,size,shield_max_hp,shield_regen,shield_damage_regen_delay,
                // shield_down_regen_delay,reserve_pool_drain_ratio,resist_physical_min,
                // resist_physical_max,resist_physical_avg,resist_energy_min,resist_energy_max,
                // resist_energy_avg,resist_distortion_min,resist_distortion_max,resist_distortion_avg,...
                let shield = Shield {
                    display_name: display_name.clone(),
                    internal_name: name.to_string(),
                    size: record.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
                    max_hp,
                    regen: record.get(3).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    resist_physical: record.get(9).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    resist_energy: record.get(12).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    resist_distortion: record.get(15).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    // Default absorption values for legacy data (typical 4.5 values)
                    absorb_physical: 0.225,  // Only 22.5% absorbed, 77.5% passes through
                    absorb_energy: 1.0,       // Fully absorbed
                    absorb_distortion: 1.0,   // Fully absorbed
                };

                self.shields.insert(display_name, shield);
            }
        }

        Ok(())
    }

    /// Get sorted list of ship names
    pub fn get_ships_sorted(&self) -> Vec<String> {
        let mut names: Vec<_> = self.ships.keys().cloned().collect();
        names.sort();
        names
    }

    /// Get weapons of a specific size, sorted by DPS
    pub fn get_weapons_by_size(&self, size: i32) -> Vec<String> {
        let mut weapons: Vec<_> = self.weapons.iter()
            .filter(|(_, w)| w.size == size)
            .map(|(n, w)| (n.clone(), w.sustained_dps))
            .collect();
        weapons.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        weapons.into_iter().map(|(n, _)| n).collect()
    }

    /// Get shields of a specific size, sorted by HP
    pub fn get_shields_by_size(&self, size: i32) -> Vec<String> {
        let mut shields: Vec<_> = self.shields.iter()
            .filter(|(_, s)| s.size == size)
            .map(|(n, s)| (n.clone(), s.max_hp))
            .collect();
        shields.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        shields.into_iter().map(|(n, _)| n).collect()
    }
}

/// Calculate damage and TTK
pub fn calculate_damage(
    attacker_weapons: &[&Weapon],
    target: &Ship,
    shield: Option<&Shield>,
    scenario: &CombatScenario,
) -> DamageResult {
    // Calculate total DPS from weapons
    let total_dps: f64 = attacker_weapons.iter().map(|w| w.sustained_dps).sum();

    // Apply accuracy modifier based on scenario
    let accuracy = match scenario.mount_type.as_str() {
        "Fixed" => 0.60,
        "Gimballed" => 0.75,
        "Auto-Gimbal" => 0.80,
        "Turret" => 0.70,
        _ => 0.70,
    };

    let effective_dps = total_dps * accuracy * scenario.accuracy_modifier;

    // Calculate shield damage time
    let shield_damage_time = if let Some(s) = shield {
        // Account for shield regen
        let net_dps = effective_dps - s.regen;
        if net_dps > 0.0 {
            s.max_hp / net_dps
        } else {
            f64::INFINITY
        }
    } else {
        0.0
    };

    // Determine primary damage type and apply armor resistance
    let armor_resist = target.armor_resist_physical; // Default to physical
    let armor_damage_time = if target.armor_hp > 0 {
        let armor_effective_hp = target.armor_hp as f64 * armor_resist;
        armor_effective_hp / effective_dps
    } else {
        0.0
    };

    // Hull damage time
    let hull_damage_time = target.hull_hp as f64 / effective_dps;

    let ttk_seconds = shield_damage_time + armor_damage_time + hull_damage_time;
    let total_hp = shield.map(|s| s.max_hp).unwrap_or(0.0)
        + target.armor_hp as f64
        + target.hull_hp as f64;

    DamageResult {
        ttk_seconds,
        shield_damage_time,
        armor_damage_time,
        hull_damage_time,
        effective_dps,
        total_hp_to_destroy: total_hp,
    }
}
