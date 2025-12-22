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
    pub category: String,  // "pilot", "manned_turret", "auto_pdw", "specialized"
    pub default_weapon: String,  // filename of default weapon for this hardpoint
}

/// Ship data with survivability and loadout information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ship {
    pub filename: String,
    pub display_name: String,
    pub hull_hp: i32,
    pub armor_hp: i32,
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

/// Weapon data with damage output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weapon {
    pub display_name: String,
    pub filename: String,
    pub size: i32,
    pub damage_type: String,
    pub sustained_dps: f64,
    pub power_consumption: f64,
}

/// Shield data with defense values
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
        // CSV columns: ship_name,slot_number,port_name,max_size,gimbal_type,control_type
        let mut weapon_hardpoints_lookup: HashMap<String, Vec<WeaponHardpoint>> = HashMap::new();
        if weapon_hardpoints_path.exists() {
            let mut rdr = csv::Reader::from_path(&weapon_hardpoints_path)?;
            for result in rdr.records() {
                let record = result?;
                let ship_name = record.get(0).unwrap_or("").to_uppercase();
                let port_name = record.get(2).unwrap_or("").to_lowercase();
                let control_type = record.get(5).unwrap_or("Unknown").to_string();
                let mut max_size: i32 = record.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

                // If size is 0, try to infer from port_name patterns (for ships with incomplete data)
                if max_size == 0 {
                    max_size = Self::infer_weapon_size_from_port(&port_name);
                }

                // Skip slots that still have size 0 after inference (truly empty hardpoints)
                if max_size == 0 {
                    continue;
                }

                // Derive category from port_name and control_type
                let category = Self::derive_hardpoint_category(&port_name, &control_type);

                let hardpoint = WeaponHardpoint {
                    slot_number: record.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
                    port_name: port_name.clone(),
                    max_size,
                    gimbal_type: record.get(4).unwrap_or("Unknown").to_string(),
                    control_type: control_type.clone(),
                    category,
                    default_weapon: record.get(6).unwrap_or("").to_string(),
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

                // CSV columns: filename,display_name,hull_hp_normalized,fuse_penetration_mult,
                // component_penetration_mult,critical_explosion_chance,armor_hp,
                // armor_resist_physical,armor_resist_energy,armor_resist_distortion,
                // thruster_count,thruster_main_hp,thruster_retro_hp,thruster_mav_hp,
                // thruster_vtol_hp,thruster_total_hp,turret_count,turret_total_hp,
                // powerplant_count,powerplant_total_hp,cooler_count,cooler_total_hp,
                // shield_gen_count,shield_gen_total_hp,qd_count,qd_total_hp,...
                // Get weapon hardpoints for this ship
                let hardpoints = weapon_hardpoints_lookup.get(&ship_upper)
                    .cloned()
                    .unwrap_or_default();

                let ship = Ship {
                    filename: filename.to_string(),
                    display_name: display_name.clone(),
                    hull_hp: record.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),  // hull_hp_normalized
                    armor_hp: record.get(6).and_then(|s| s.parse().ok()).unwrap_or(0),  // armor_hp
                    armor_resist_physical: record.get(7).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                    armor_resist_energy: record.get(8).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                    armor_resist_distortion: record.get(9).and_then(|s| s.parse().ok()).unwrap_or(1.0),
                    thruster_main_hp: record.get(11).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_retro_hp: record.get(12).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_mav_hp: record.get(13).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_vtol_hp: record.get(14).and_then(|s| s.parse().ok()).unwrap_or(0),
                    thruster_total_hp: record.get(15).and_then(|s| s.parse().ok()).unwrap_or(0),
                    turret_total_hp: record.get(17).and_then(|s| s.parse().ok()).unwrap_or(0),
                    powerplant_total_hp: record.get(19).and_then(|s| s.parse().ok()).unwrap_or(0),
                    cooler_total_hp: record.get(21).and_then(|s| s.parse().ok()).unwrap_or(0),
                    shield_gen_total_hp: record.get(23).and_then(|s| s.parse().ok()).unwrap_or(0),
                    qd_total_hp: record.get(25).and_then(|s| s.parse().ok()).unwrap_or(0),
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

        // Skip torpedo and missile hardpoints (not regular weapons)
        if port_lower.contains("torpedo") || port_lower.contains("missile") {
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

        // Generic turret - S4
        if port_lower.contains("turret") {
            return 4;
        }

        // Generic weapon hardpoints - S3 default
        if port_lower.contains("weapon") || port_lower.contains("gun") {
            return 3;
        }

        // Unknown - skip
        0
    }

    /// Derive weapon hardpoint category from port_name and control_type
    fn derive_hardpoint_category(port_name: &str, control_type: &str) -> String {
        let port_lower = port_name.to_lowercase();

        // Check for specialized weapons first (main cannons, chin guns, railguns, or explicit Specialized control type)
        if port_lower.contains("main_cannon") || port_lower.contains("chin") || port_lower.contains("rail")
            || port_lower.contains("spinal") || control_type == "Specialized" {
            return "specialized".to_string();
        }

        // Check for PDC/PDT hardpoints - must have "pdc" in the name
        // Note: "remote" turrets without "pdc" are regular remote-operated turrets, not PDCs
        if port_lower.contains("pdc") || port_lower.contains("pdt") {
            return "auto_pdw".to_string();
        }

        // Check for manned turrets - explicit turret indicators
        if port_lower.contains("turret") || control_type == "Turret" {
            return "manned_turret".to_string();
        }

        // Capital ship pattern detection:
        // Capital ships often have hardpoints named "hardpoint_weapon_left/right" with numbered slots
        // These are typically turret-mounted, not pilot-controlled, even if data says "Pilot"
        // Heuristic: if port name is just "hardpoint_weapon_left" or "hardpoint_weapon_right"
        // (generic pattern used by capital ships), treat as manned turret
        if (port_lower == "hardpoint_weapon_left" || port_lower == "hardpoint_weapon_right")
            || (port_lower.starts_with("hardpoint_weapon_") &&
                (port_lower.ends_with("_left") || port_lower.ends_with("_right"))) {
            return "manned_turret".to_string();
        }

        // Default to pilot-controlled for actual pilot control types
        if control_type == "Pilot" {
            // Check for typical pilot weapon port names (nose guns, wing guns, etc.)
            if port_lower.contains("nose") || port_lower.contains("wing")
                || port_lower.contains("gun_") || port_lower.contains("hardpoint_gun") {
                return "pilot".to_string();
            }
        }

        // Fallback for unknown - treat as pilot if it has "gun" in name (typically pilot weapons)
        if port_lower.contains("gun") {
            return "pilot".to_string();
        }

        // Generic "weapon" without "gun" - likely a turret on larger ships
        if port_lower.contains("weapon") {
            return "manned_turret".to_string();
        }

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
        let weapons_path = data_dir.join("ship_weapons.csv");
        let power_path = data_dir.join("weapon_power_data.csv");

        // Build power lookup
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

        if weapons_path.exists() {
            let mut rdr = csv::Reader::from_path(&weapons_path)?;
            // CSV columns: display_name,filename,manufacturer,damage_type,size,
            //              fire_rate_rpm,fire_rate,damage_per_shot,dps,sustained_dps,...
            for result in rdr.records() {
                let record = result?;
                let display_name = record.get(0).unwrap_or("Unknown").to_string();
                let filename = record.get(1).unwrap_or("").to_string();
                let size: i32 = record.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);

                if size == 0 {
                    continue;
                }

                let weapon = Weapon {
                    display_name: display_name.clone(),
                    filename: filename.clone(),
                    size,
                    damage_type: record.get(3).unwrap_or("Unknown").to_string(),
                    sustained_dps: record.get(9).and_then(|s| s.parse().ok()).unwrap_or(0.0),
                    power_consumption: power_lookup.get(&filename.to_lowercase()).copied().unwrap_or(0.0),
                };

                self.weapons.insert(display_name, weapon);
            }
        }

        Ok(())
    }

    fn load_shields(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let shields_path = data_dir.join("shields.csv");

        let mfr_codes: HashMap<&str, &str> = [
            ("godi", "Gorgon Defender"), ("asas", "ASAS"), ("basl", "Basilisk"),
            ("seco", "Seal Corp"), ("banu", "Banu"), ("behr", "Behring"),
        ].into_iter().collect();

        if shields_path.exists() {
            let mut rdr = csv::Reader::from_path(&shields_path)?;
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

                // Format display name
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
                    resist_physical: record.get(9).and_then(|s| s.parse().ok()).unwrap_or(0.0),  // resist_physical_avg
                    resist_energy: record.get(12).and_then(|s| s.parse().ok()).unwrap_or(0.0),  // resist_energy_avg
                    resist_distortion: record.get(15).and_then(|s| s.parse().ok()).unwrap_or(0.0),  // resist_distortion_avg
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
