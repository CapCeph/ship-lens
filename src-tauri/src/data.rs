//! Ship Lens Data Structures
//!
//! Contains all the data models for Star Citizen ships, weapons, and shields.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Individual weapon sub-port within a hardpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubPort {
    pub size: i32,
    #[serde(default)]
    pub default_weapon: Option<String>,
}

/// Weapon hardpoint with category information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeaponHardpoint {
    #[serde(default)]
    pub slot_number: i32,
    pub port_name: String,
    pub max_size: i32,
    pub gimbal_type: String,
    #[serde(default)]
    pub control_type: String,
    pub category: String,  // "pilot", "manned_turret", "remote_turret", "pdc", "specialized", "torpedo", "missile", "bomb"
    #[serde(default)]
    pub mount_name: String,  // gimbal/turret mount name (e.g., "crus_spirit_nose_turret_s3")
    #[serde(default)]
    pub compatible_mounts: Vec<String>,  // explicit list of compatible mount refs (e.g., ["anvl_hornet_f7c_nose_turret"])
    pub sub_ports: Vec<SubPort>,  // individual weapon ports with size and default weapon
}

/// Ship data with survivability and loadout information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ship {
    pub filename: String,
    pub display_name: String,
    pub hull_hp: f64,
    pub armor_hp: f64,
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
    pub weapon_type: String,  // "gun", "missile", "torpedo", "bomb", "pdc"
    #[serde(default)]
    pub restricted_to: Vec<String>,  // Manufacturer restrictions (e.g., ["VNCL", "BANU"])
    #[serde(default)]
    pub ship_exclusive: bool,  // True if weapon can only be equipped on specific ships (not swappable)
    // 4.5 damage breakdown by type
    pub damage_physical: f64,
    pub damage_energy: f64,
    pub damage_distortion: f64,
    // Penetration cone data
    pub base_penetration_distance: f64,
    pub near_radius: f64,
    pub far_radius: f64,
}

/// Missile/Torpedo/Bomb data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Missile {
    pub name: String,
    pub display_name: String,
    pub size: i32,
    pub missile_type: String,  // "missile", "torpedo", "bomb"
    pub tracking_type: String, // "IR", "EM", "CS", "Unknown"
    pub damage_physical: f64,
    pub damage_energy: f64,
    pub damage_distortion: f64,
    pub explosion_min_radius: f64,
    pub explosion_max_radius: f64,
    pub max_lifetime: f64,
    pub arm_time: f64,
    pub lock_time: f64,
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

/// Weapon mount data (gimbals, fixed mounts, turrets)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mount {
    #[serde(rename = "ref")]
    pub mount_ref: String,
    pub display_name: String,
    pub size: i32,
    pub ports: i32,
    pub port_size: i32,
    pub hp: i32,
    pub mount_type: String,  // "gimbal", "fixed", "turret"
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
    pub missiles: HashMap<String, Missile>,
    pub mounts: HashMap<String, Mount>,
}

impl GameData {
    /// Load all game data from JSON files in the data directory
    pub fn load(data_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let mut data = GameData::default();

        data.load_ships(data_dir)?;
        data.load_weapons(data_dir)?;
        data.load_shields(data_dir)?;
        data.load_missiles(data_dir)?;
        data.load_mounts(data_dir)?;

        Ok(data)
    }

    fn load_ships(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let ships_dir = data_dir.join("ships");

        if !ships_dir.exists() {
            return Err(format!("Ships directory not found: {:?}", ships_dir).into());
        }

        // JSON structure for per-ship files
        #[derive(Deserialize)]
        struct ShipArmorJson {
            hp: f64,
            resist_physical: f64,
            resist_energy: f64,
            resist_distortion: f64,
            damage_mult_physical: f64,
            damage_mult_energy: f64,
            damage_mult_distortion: f64,
        }

        #[derive(Deserialize)]
        struct ShipThrustersJson {
            main_hp: i32,
            retro_hp: i32,
            mav_hp: i32,
            vtol_hp: i32,
            total_hp: i32,
        }

        #[derive(Deserialize)]
        struct ShipComponentsJson {
            turret_total_hp: i32,
            powerplant_total_hp: i32,
            cooler_total_hp: i32,
            shield_gen_total_hp: i32,
            qd_total_hp: i32,
        }

        #[derive(Deserialize)]
        #[allow(dead_code)]
        struct ShipJson {
            filename: String,
            display_name: String,
            hull_hp: f64,
            armor: ShipArmorJson,
            thrusters: ShipThrustersJson,
            components: ShipComponentsJson,
            #[serde(default)]
            shield_count: i32,
            #[serde(default)]
            max_shield_size: i32,
            #[serde(default)]
            default_shield_ref: String,
            weapon_hardpoints: Vec<WeaponHardpoint>,
        }

        // Read all JSON files from ships directory
        for entry in std::fs::read_dir(&ships_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().map_or(false, |ext| ext == "json") {
                let json_content = std::fs::read_to_string(&path)?;
                let ship_json: ShipJson = match serde_json::from_str(&json_content) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("Failed to parse {:?}: {}", path, e);
                        continue;
                    }
                };

                let display_name = ship_json.display_name.clone();

                // Count pilot weapons and build sizes string
                let pilot_hardpoints: Vec<_> = ship_json.weapon_hardpoints.iter()
                    .filter(|hp| hp.category == "pilot")
                    .collect();
                let pilot_weapon_count = pilot_hardpoints.iter()
                    .map(|hp| hp.sub_ports.len() as i32)
                    .sum();
                let pilot_weapon_sizes: String = pilot_hardpoints.iter()
                    .flat_map(|hp| hp.sub_ports.iter().map(|sp| sp.size.to_string()))
                    .collect::<Vec<_>>()
                    .join(",");


                // Assign slot numbers to hardpoints
                let mut hardpoints = ship_json.weapon_hardpoints;
                for (i, hp) in hardpoints.iter_mut().enumerate() {
                    hp.slot_number = i as i32 + 1;
                    hp.control_type = hp.category.clone();
                }

                let ship = Ship {
                    filename: ship_json.filename,
                    display_name: display_name.clone(),
                    hull_hp: ship_json.hull_hp,
                    armor_hp: ship_json.armor.hp,
                    armor_damage_mult_physical: ship_json.armor.damage_mult_physical,
                    armor_damage_mult_energy: ship_json.armor.damage_mult_energy,
                    armor_damage_mult_distortion: ship_json.armor.damage_mult_distortion,
                    armor_resist_physical: ship_json.armor.resist_physical,
                    armor_resist_energy: ship_json.armor.resist_energy,
                    armor_resist_distortion: ship_json.armor.resist_distortion,
                    thruster_main_hp: ship_json.thrusters.main_hp,
                    thruster_retro_hp: ship_json.thrusters.retro_hp,
                    thruster_mav_hp: ship_json.thrusters.mav_hp,
                    thruster_vtol_hp: ship_json.thrusters.vtol_hp,
                    thruster_total_hp: ship_json.thrusters.total_hp,
                    turret_total_hp: ship_json.components.turret_total_hp,
                    powerplant_total_hp: ship_json.components.powerplant_total_hp,
                    cooler_total_hp: ship_json.components.cooler_total_hp,
                    shield_gen_total_hp: ship_json.components.shield_gen_total_hp,
                    qd_total_hp: ship_json.components.qd_total_hp,
                    pilot_weapon_count,
                    pilot_weapon_sizes,
                    max_shield_size: ship_json.max_shield_size,
                    shield_count: ship_json.shield_count,
                    default_shield_ref: ship_json.default_shield_ref,
                    weapon_hardpoints: hardpoints,
                };

                self.ships.insert(display_name, ship);
            }
        }

        Ok(())
    }
    fn format_ship_name(filename: &str) -> String {
        use std::sync::OnceLock;
        use std::collections::HashMap;

        static MANUFACTURERS: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
        static NAME_FIXES: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();

        let manufacturers = MANUFACTURERS.get_or_init(|| {
            let mut map = HashMap::with_capacity(17);
            map.insert("aegs", "Aegis");
            map.insert("anvl", "Anvil");
            map.insert("argo", "Argo");
            map.insert("banu", "Banu");
            map.insert("cnou", "C.O.");
            map.insert("crus", "Crusader");
            map.insert("drak", "Drake");
            map.insert("espr", "Esperia");
            map.insert("gama", "Gatac");
            map.insert("krig", "Kruger");
            map.insert("misc", "MISC");
            map.insert("mrai", "Mirai");
            map.insert("orig", "Origin");
            map.insert("rsi", "RSI");
            map.insert("tmbl", "Tumbril");
            map.insert("vncl", "Vanduul");
            map.insert("xian", "Xi'An");
            map
        });

        let name_fixes = NAME_FIXES.get_or_init(|| {
            let mut map = HashMap::with_capacity(50);
            map.insert("avenger", "Avenger");
            map.insert("stalker", "Stalker");
            map.insert("titan", "Titan");
            map.insert("gladius", "Gladius");
            map.insert("eclipse", "Eclipse");
            map.insert("hammerhead", "Hammerhead");
            map.insert("sabre", "Sabre");
            map.insert("vanguard", "Vanguard");
            map.insert("hornet", "Hornet");
            map.insert("arrow", "Arrow");
            map.insert("hawk", "Hawk");
            map.insert("hurricane", "Hurricane");
            map.insert("valkyrie", "Valkyrie");
            map.insert("carrack", "Carrack");
            map.insert("pisces", "Pisces");
            map.insert("gladiator", "Gladiator");
            map.insert("terrapin", "Terrapin");
            map.insert("redeemer", "Redeemer");
            map.insert("mole", "MOLE");
            map.insert("raft", "RAFT");
            map.insert("mpuv", "MPUV");
            map.insert("srv", "SRV");
            map.insert("f7a", "F7A");
            map.insert("f7c", "F7C");
            map.insert("f7cm", "F7C-M");
            map.insert("f7cr", "F7C-R");
            map.insert("f7cs", "F7C-S");
            map.insert("f8", "F8");
            map.insert("f8c", "F8C");
            map.insert("mk1", "Mk I");
            map.insert("mk2", "Mk II");
            map.insert("c8", "C8");
            map.insert("c8r", "C8R");
            map.insert("c8x", "C8X");
            map.insert("a1", "A1");
            map.insert("a2", "A2");
            map.insert("c1", "C1");
            map.insert("c2", "C2");
            map.insert("m2", "M2");
            map.insert("p52", "P-52");
            map.insert("p72", "P-72");
            map.insert("mustang", "Mustang");
            map.insert("aurora", "Aurora");
            map.insert("constellation", "Constellation");
            map.insert("freelancer", "Freelancer");
            map.insert("starfarer", "Starfarer");
            map.insert("prospector", "Prospector");
            map.insert("cutlass", "Cutlass");
            map.insert("caterpillar", "Caterpillar");
            map.insert("corsair", "Corsair");
            map.insert("buccaneer", "Buccaneer");
            map.insert("herald", "Herald");
            map.insert("vulture", "Vulture");
            map.insert("defender", "Defender");
            map.insert("prowler", "Prowler");
            map.insert("talon", "Talon");
            map.insert("nox", "Nox");
            map.insert("dragonfly", "Dragonfly");
            map.insert("razor", "Razor");
            map.insert("reliant", "Reliant");
            map.insert("polaris", "Polaris");
            map.insert("idris", "Idris");
            map.insert("javelin", "Javelin");
            map.insert("kraken", "Kraken");
            map.insert("reclaimer", "Reclaimer");
            map.insert("merchantman", "Merchantman");
            map.insert("endeavor", "Endeavor");
            map.insert("genesis", "Genesis");
            map.insert("hull", "Hull");
            map.insert("orion", "Orion");
            map.insert("pioneer", "Pioneer");
            map.insert("nautilus", "Nautilus");
            map.insert("perseus", "Perseus");
            map.insert("liberator", "Liberator");
            map
        });

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
        let json_path = data_dir.join("weapons.json");

        if !json_path.exists() {
            return Err(format!("Weapons file not found: {:?}", json_path).into());
        }

        let json_content = std::fs::read_to_string(&json_path)?;
        let weapons_json: HashMap<String, serde_json::Value> = serde_json::from_str(&json_content)?;

        for (weapon_key, weapon_data) in weapons_json {
            let size: i32 = weapon_data["size"].as_i64().unwrap_or(0) as i32;
            if size == 0 {
                continue;
            }

            let display_name = weapon_data["display_name"].as_str().unwrap_or("Unknown").to_string();
            let sustained_dps = weapon_data["sustained_dps"].as_f64().unwrap_or(0.0);
            let weapon_type = weapon_data["weapon_type"].as_str().unwrap_or("gun").to_string();

            // Get damage breakdown (already in DPS for guns, per-shot for ordnance)
            let damage_physical = weapon_data["damage_physical"].as_f64().unwrap_or(0.0);
            let damage_energy = weapon_data["damage_energy"].as_f64().unwrap_or(0.0);
            let damage_distortion = weapon_data["damage_distortion"].as_f64().unwrap_or(0.0);

            // Parse restricted_to array if present
            let restricted_to: Vec<String> = weapon_data["restricted_to"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            // Parse ship_exclusive flag (true = weapon is ship-specific, cannot be swapped to other ships)
            let ship_exclusive = weapon_data["ship_exclusive"].as_bool().unwrap_or(false);

            let weapon = Weapon {
                display_name: display_name.clone(),
                filename: weapon_key.clone(),
                size,
                damage_type: weapon_data["damage_type"].as_str().unwrap_or("Unknown").to_string(),
                sustained_dps,
                power_consumption: 0.0,  // Power data now in JSON if needed
                weapon_type,
                damage_physical,
                damage_energy,
                damage_distortion,
                base_penetration_distance: 2.0,
                near_radius: 0.1,
                far_radius: 0.2,
                restricted_to,
                ship_exclusive,
            };

            self.weapons.insert(weapon_key.clone(), weapon);
        }

        Ok(())
    }

    fn load_shields(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let json_path = data_dir.join("shields.json");

        if !json_path.exists() {
            return Err(format!("Shields file not found: {:?}", json_path).into());
        }

        let json_content = std::fs::read_to_string(&json_path)?;
        let shields_json: HashMap<String, serde_json::Value> = serde_json::from_str(&json_content)?;

        for (internal_name, shield_data) in shields_json {
            // Case-insensitive template check
            if internal_name.to_lowercase().contains("template") {
                continue;
            }

            let max_hp = shield_data["max_hp"].as_f64().unwrap_or(0.0);
            if max_hp <= 0.0 {
                continue;
            }

            let shield = Shield {
                display_name: shield_data["display_name"].as_str().unwrap_or("Unknown").to_string(),
                internal_name: internal_name.clone(),
                size: shield_data["size"].as_i64().unwrap_or(0) as i32,
                max_hp,
                // JSON uses regen_rate, code uses regen
                regen: shield_data["regen_rate"].as_f64()
                    .or_else(|| shield_data["regen"].as_f64())
                    .unwrap_or(0.0),
                // JSON uses resistance_*, code uses resist_*
                resist_physical: shield_data["resistance_physical"].as_f64()
                    .or_else(|| shield_data["resist_physical"].as_f64())
                    .unwrap_or(0.0),
                resist_energy: shield_data["resistance_energy"].as_f64()
                    .or_else(|| shield_data["resist_energy"].as_f64())
                    .unwrap_or(0.0),
                resist_distortion: shield_data["resistance_distortion"].as_f64()
                    .or_else(|| shield_data["resist_distortion"].as_f64())
                    .unwrap_or(0.0),
                // JSON uses absorption_*, code uses absorb_*
                absorb_physical: shield_data["absorption_physical"].as_f64()
                    .or_else(|| shield_data["absorb_physical"].as_f64())
                    .unwrap_or(0.225),
                absorb_energy: shield_data["absorption_energy"].as_f64()
                    .or_else(|| shield_data["absorb_energy"].as_f64())
                    .unwrap_or(1.0),
                absorb_distortion: shield_data["absorption_distortion"].as_f64()
                    .or_else(|| shield_data["absorb_distortion"].as_f64())
                    .unwrap_or(1.0),
            };

            self.shields.insert(shield.internal_name.clone(), shield);
        }

        Ok(())
    }

    fn load_missiles(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let json_path = data_dir.join("missiles.json");

        if !json_path.exists() {
            // Missiles are optional - don't fail if not found
            eprintln!("Missiles file not found: {:?} (skipping)", json_path);
            return Ok(());
        }

        let json_content = std::fs::read_to_string(&json_path)?;
        let missiles_json: HashMap<String, serde_json::Value> = serde_json::from_str(&json_content)?;

        for (missile_key, missile_data) in missiles_json {
            let size: i32 = missile_data["size"].as_i64().unwrap_or(0) as i32;
            if size == 0 {
                continue;
            }

            let missile = Missile {
                name: missile_key.clone(),
                display_name: missile_data["display_name"].as_str().unwrap_or("Unknown").to_string(),
                size,
                missile_type: missile_data["missile_type"].as_str().unwrap_or("missile").to_string(),
                tracking_type: missile_data["tracking_type"].as_str().unwrap_or("Unknown").to_string(),
                damage_physical: missile_data["damage_physical"].as_f64().unwrap_or(0.0),
                damage_energy: missile_data["damage_energy"].as_f64().unwrap_or(0.0),
                damage_distortion: missile_data["damage_distortion"].as_f64().unwrap_or(0.0),
                explosion_min_radius: missile_data["explosion_min_radius"].as_f64().unwrap_or(0.0),
                explosion_max_radius: missile_data["explosion_max_radius"].as_f64().unwrap_or(0.0),
                max_lifetime: missile_data["max_lifetime"].as_f64().unwrap_or(0.0),
                arm_time: missile_data["arm_time"].as_f64().unwrap_or(0.0),
                lock_time: missile_data["lock_time"].as_f64().unwrap_or(0.0),
            };

            self.missiles.insert(missile_key.clone(), missile);
        }

        Ok(())
    }

    fn load_mounts(&mut self, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let json_path = data_dir.join("mounts.json");

        if !json_path.exists() {
            // Mounts are optional - don't fail if not found
            eprintln!("Mounts file not found: {:?} (skipping)", json_path);
            return Ok(());
        }

        let json_content = std::fs::read_to_string(&json_path)?;
        let mounts_vec: Vec<Mount> = serde_json::from_str(&json_content)?;

        for mount in mounts_vec {
            self.mounts.insert(mount.mount_ref.clone(), mount);
        }

        println!("Loaded {} mounts", self.mounts.len());

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

    /// Get weapon by display name (searches all weapons for matching display_name)
    pub fn get_weapon_by_display_name(&self, display_name: &str) -> Option<&Weapon> {
        self.weapons.values().find(|w| w.display_name == display_name)
    }

    /// Get weapon by filename (direct HashMap lookup)
    pub fn get_weapon_by_filename(&self, filename: &str) -> Option<&Weapon> {
        self.weapons.get(filename)
    }

    /// Get missiles of a specific size, sorted by damage
    pub fn get_missiles_by_size(&self, size: i32) -> Vec<String> {
        let mut missiles: Vec<_> = self.missiles.iter()
            .filter(|(_, m)| m.size == size)
            .map(|(n, m)| (n.clone(), m.damage_physical + m.damage_energy + m.damage_distortion))
            .collect();
        missiles.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        missiles.into_iter().map(|(n, _)| n).collect()
    }

    /// Get missile by display name
    pub fn get_missile_by_display_name(&self, display_name: &str) -> Option<&Missile> {
        self.missiles.values().find(|m| m.display_name == display_name)
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
    let armor_damage_time = if target.armor_hp > 0.0 {
        let armor_effective_hp = target.armor_hp * armor_resist;
        armor_effective_hp / effective_dps
    } else {
        0.0
    };

    // Hull damage time
    let hull_damage_time = target.hull_hp / effective_dps;

    let ttk_seconds = shield_damage_time + armor_damage_time + hull_damage_time;
    let total_hp = shield.map(|s| s.max_hp).unwrap_or(0.0)
        + target.armor_hp
        + target.hull_hp;

    DamageResult {
        ttk_seconds,
        shield_damage_time,
        armor_damage_time,
        hull_damage_time,
        effective_dps,
        total_hp_to_destroy: total_hp,
    }
}
