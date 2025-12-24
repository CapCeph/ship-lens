//! Ship Lens - Star Citizen Damage Calculator
//!
//! Rust backend for calculating combat dynamics between ships.

mod data;
mod ttk;

use data::{GameData, Ship, Shield, Weapon};
use ttk::{CombatScenario as TTKScenario, EquippedWeapon, TTKResult, ZoneModifiers};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(target_os = "linux")]
use std::io::Write;

/// Application state holding all game data
pub struct AppState {
    pub data: Mutex<GameData>,
}

/// Get the data directory path (for pre-Tauri initialization)
fn get_data_dir() -> PathBuf {
    // In development, use relative path from src-tauri
    let dev_path = PathBuf::from("../data");
    if dev_path.exists() && has_data_files(&dev_path) {
        return dev_path;
    }

    // Try current directory
    let current_path = PathBuf::from("data");
    if current_path.exists() && has_data_files(&current_path) {
        return current_path;
    }

    // Try APPDIR for AppImage FIRST (resources bundled in usr/lib/Ship Lens/data)
    if let Ok(appdir) = std::env::var("APPDIR") {
        // Tauri bundles resources to usr/lib/<app-name>/data
        let appimage_data = PathBuf::from(&appdir).join("usr/lib/Ship Lens/data");
        if appimage_data.exists() && has_data_files(&appimage_data) {
            return appimage_data;
        }
        // Also try usr/share path (older convention)
        let appimage_share = PathBuf::from(&appdir).join("usr/share/ship-lens/data");
        if appimage_share.exists() && has_data_files(&appimage_share) {
            return appimage_share;
        }
    }

    // Try next to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_data_path = exe_dir.join("data");
            if exe_data_path.exists() && has_data_files(&exe_data_path) {
                return exe_data_path;
            }
        }
    }

    // Try installed location (Linux: /usr/share/ship-lens/data)
    let installed_path = PathBuf::from("/usr/share/ship-lens/data");
    if installed_path.exists() && has_data_files(&installed_path) {
        return installed_path;
    }

    // Fallback
    PathBuf::from("../data")
}

/// Check if a directory has data files (not just empty)
fn has_data_files(path: &PathBuf) -> bool {
    // Check for actual data files used by the app
    path.join("shields.csv").exists() || path.join("ship_parts_comprehensive.csv").exists()
}

/// Get all ships sorted by name
#[tauri::command]
fn get_ships(state: State<AppState>) -> Vec<String> {
    let data = state.data.lock().unwrap();
    data.get_ships_sorted()
}

/// Get a specific ship by name
#[tauri::command]
fn get_ship(state: State<AppState>, name: String) -> Option<Ship> {
    let data = state.data.lock().unwrap();
    data.ships.get(&name).cloned()
}

/// Get all weapons
#[tauri::command]
fn get_weapons(state: State<AppState>) -> Vec<Weapon> {
    let data = state.data.lock().unwrap();
    data.weapons.values().cloned().collect()
}

/// Get weapons by size
#[tauri::command]
fn get_weapons_by_size(state: State<AppState>, size: i32) -> Vec<Weapon> {
    let data = state.data.lock().unwrap();
    data.weapons.values()
        .filter(|w| w.size == size)
        .cloned()
        .collect()
}

/// Get all shields
#[tauri::command]
fn get_shields(state: State<AppState>) -> Vec<Shield> {
    let data = state.data.lock().unwrap();
    data.shields.values().cloned().collect()
}

/// Get shields by size
#[tauri::command]
fn get_shields_by_size(state: State<AppState>, size: i32) -> Vec<Shield> {
    let data = state.data.lock().unwrap();
    data.shields.values()
        .filter(|s| s.size == size)
        .cloned()
        .collect()
}

/// Calculate TTK between ships (legacy - kept for backwards compatibility)
#[tauri::command]
fn calculate_ttk(
    state: State<AppState>,
    attacker_ship: String,
    target_ship: String,
    shield_name: Option<String>,
    mount_type: String,
    accuracy_modifier: f64,
) -> Option<data::DamageResult> {
    let data = state.data.lock().unwrap();

    let _attacker = data.ships.get(&attacker_ship)?;
    let target = data.ships.get(&target_ship)?;

    // Get attacker weapons (simplified - uses first available of each size)
    let weapon_sizes: Vec<i32> = _attacker.pilot_weapon_sizes
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    let weapons: Vec<&Weapon> = weapon_sizes.iter()
        .filter_map(|&size| {
            data.weapons.values()
                .filter(|w| w.size == size)
                .max_by(|a, b| a.sustained_dps.partial_cmp(&b.sustained_dps).unwrap())
        })
        .collect();

    if weapons.is_empty() {
        return None;
    }

    let shield = shield_name.and_then(|n| data.shields.get(&n));

    let scenario = data::CombatScenario {
        scenario_type: "Dogfight".to_string(),
        mount_type,
        fire_mode: "Sustained".to_string(),
        target_zone: "Center Mass".to_string(),
        accuracy_modifier,
    };

    Some(data::calculate_damage(&weapons, target, shield, &scenario))
}

/// Calculate TTK with full 4.5 damage model
///
/// Parameters:
/// - weapon_names: List of weapon display names to use
/// - weapon_counts: Corresponding count for each weapon (parallel array)
/// - target_ship: Display name of target ship
/// - shield_name: Display name of shield to use (or null for target's default)
/// - scenario: Combat scenario configuration
/// - zone: Target zone modifiers (hull, armor, thruster, component percentages)
#[tauri::command]
fn calculate_ttk_v2(
    state: State<AppState>,
    weapon_names: Vec<String>,
    weapon_counts: Vec<i32>,
    target_ship: String,
    shield_name: Option<String>,
    mount_accuracy: f64,
    scenario_accuracy: f64,
    time_on_target: f64,
    fire_mode: f64,
    power_multiplier: f64,
    zone_hull: f64,
    zone_armor: f64,
    zone_thruster: f64,
    zone_component: f64,
) -> Result<TTKResult, String> {
    let data = state.data.lock().unwrap();

    // Get target ship
    let target = data.ships.get(&target_ship)
        .ok_or_else(|| format!("Target ship '{}' not found", target_ship))?;

    // Build equipped weapons list
    let mut equipped_weapons = Vec::new();
    for (i, name) in weapon_names.iter().enumerate() {
        let count = weapon_counts.get(i).copied().unwrap_or(1);
        if count <= 0 {
            continue;
        }

        if let Some(weapon) = data.weapons.get(name) {
            equipped_weapons.push(EquippedWeapon {
                weapon: weapon.clone(),
                count,
            });
        } else {
            return Err(format!("Weapon '{}' not found", name));
        }
    }

    if equipped_weapons.is_empty() {
        return Err("No weapons equipped".to_string());
    }

    // Get shield (use specified, or look up target's default)
    let shield = if let Some(ref name) = shield_name {
        data.shields.get(name)
            .ok_or_else(|| format!("Shield '{}' not found", name))?
    } else {
        // Try to find default shield by internal name reference
        let default_ref = &target.default_shield_ref;
        if !default_ref.is_empty() {
            data.shields.values()
                .find(|s| s.internal_name.to_lowercase().contains(&default_ref.to_lowercase()))
                .ok_or_else(|| "Could not find default shield".to_string())?
        } else {
            // Fall back to first shield of matching size
            data.shields.values()
                .find(|s| s.size == target.max_shield_size)
                .ok_or_else(|| "No compatible shield found".to_string())?
        }
    };

    // Build scenario
    let scenario = TTKScenario {
        mount_accuracy,
        scenario_accuracy,
        time_on_target,
        fire_mode,
        power_multiplier,
    };

    // Build zone modifiers
    let zone = ZoneModifiers {
        hull: zone_hull,
        armor: zone_armor,
        thruster: zone_thruster,
        component: zone_component,
    };

    // Calculate TTK using new model
    let result = ttk::calculate_ttk(&equipped_weapons, target, shield, &scenario, &zone);

    Ok(result)
}

/// Get a weapon by name
#[tauri::command]
fn get_weapon(state: State<AppState>, name: String) -> Option<Weapon> {
    let data = state.data.lock().unwrap();
    data.weapons.get(&name).cloned()
}

/// Get a shield by name
#[tauri::command]
fn get_shield(state: State<AppState>, name: String) -> Option<Shield> {
    let data = state.data.lock().unwrap();
    data.shields.get(&name).cloned()
}

/// Get statistics summary
#[tauri::command]
fn get_stats(state: State<AppState>) -> serde_json::Value {
    let data = state.data.lock().unwrap();
    serde_json::json!({
        "ship_count": data.ships.len(),
        "weapon_count": data.weapons.len(),
        "shield_count": data.shields.len(),
    })
}

/// Save settings to file
#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    // Create directory if it doesn't exist
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let settings_path = config_dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Load settings from file
#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Option<serde_json::Value> {
    let config_dir = app.path().app_config_dir().ok()?;
    let settings_path = config_dir.join("settings.json");

    if !settings_path.exists() {
        return None;
    }

    let json = fs::read_to_string(&settings_path).ok()?;
    serde_json::from_str(&json).ok()
}

/// Save a fleet preset
#[tauri::command]
fn save_fleet_preset(app: tauri::AppHandle, preset: serde_json::Value) -> Result<(), String> {
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let presets_path = config_dir.join("fleet_presets.json");

    // Load existing presets or create empty array
    let mut presets: Vec<serde_json::Value> = if presets_path.exists() {
        let json = fs::read_to_string(&presets_path)
            .map_err(|e| format!("Failed to read presets: {}", e))?;
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Check if preset with same ID exists and update, otherwise add
    let preset_id = preset.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(pos) = presets.iter().position(|p| {
        p.get("id").and_then(|v| v.as_str()).unwrap_or("") == preset_id
    }) {
        presets[pos] = preset;
    } else {
        presets.push(preset);
    }

    let json = serde_json::to_string_pretty(&presets)
        .map_err(|e| format!("Failed to serialize presets: {}", e))?;

    fs::write(&presets_path, json)
        .map_err(|e| format!("Failed to write presets: {}", e))?;

    Ok(())
}

/// Load all fleet presets
#[tauri::command]
fn load_fleet_presets(app: tauri::AppHandle) -> Vec<serde_json::Value> {
    let config_dir = match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(_) => return Vec::new(),
    };

    let presets_path = config_dir.join("fleet_presets.json");

    if !presets_path.exists() {
        return Vec::new();
    }

    match fs::read_to_string(&presets_path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Delete a fleet preset by ID
#[tauri::command]
fn delete_fleet_preset(app: tauri::AppHandle, preset_id: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    let presets_path = config_dir.join("fleet_presets.json");

    if !presets_path.exists() {
        return Ok(());
    }

    let json = fs::read_to_string(&presets_path)
        .map_err(|e| format!("Failed to read presets: {}", e))?;

    let mut presets: Vec<serde_json::Value> = serde_json::from_str(&json).unwrap_or_default();

    // Remove preset with matching ID
    presets.retain(|p| {
        p.get("id").and_then(|v| v.as_str()).unwrap_or("") != preset_id
    });

    let json = serde_json::to_string_pretty(&presets)
        .map_err(|e| format!("Failed to serialize presets: {}", e))?;

    fs::write(&presets_path, json)
        .map_err(|e| format!("Failed to write presets: {}", e))?;

    Ok(())
}

/// Detect Linux package manager type
#[cfg(target_os = "linux")]
fn detect_package_manager() -> Option<&'static str> {
    // Check for DNF (Fedora, RHEL 8+)
    if PathBuf::from("/usr/bin/dnf").exists() {
        return Some("dnf");
    }
    // Check for APT (Debian, Ubuntu)
    if PathBuf::from("/usr/bin/apt").exists() {
        return Some("apt");
    }
    // Fallback: check for rpm vs dpkg
    if PathBuf::from("/usr/bin/rpm").exists() {
        return Some("rpm");
    }
    if PathBuf::from("/usr/bin/dpkg").exists() {
        return Some("dpkg");
    }
    None
}

/// Install a Linux update using pkexec for privilege elevation
/// Downloads the appropriate package and installs via system package manager
#[cfg(target_os = "linux")]
#[tauri::command]
fn install_linux_update(version: String) -> Result<String, String> {
    let pkg_manager = detect_package_manager()
        .ok_or_else(|| "Could not detect package manager".to_string())?;

    // Determine package type and URL based on package manager
    let (pkg_type, pkg_url) = match pkg_manager {
        "dnf" | "rpm" => {
            let filename = format!("Ship.Lens-{}-1.x86_64.rpm", version);
            let url = format!(
                "https://github.com/CapCeph/ship-lens/releases/download/v{}/{}",
                version, filename
            );
            ("rpm", url)
        },
        "apt" | "dpkg" => {
            let filename = format!("Ship.Lens_{}_amd64.deb", version);
            let url = format!(
                "https://github.com/CapCeph/ship-lens/releases/download/v{}/{}",
                version, filename
            );
            ("deb", url)
        },
        _ => return Err(format!("Unsupported package manager: {}", pkg_manager)),
    };

    // Download package to temp directory
    let temp_dir = std::env::temp_dir();
    let pkg_filename = if pkg_type == "rpm" {
        format!("ship-lens-{}.rpm", version)
    } else {
        format!("ship-lens-{}.deb", version)
    };
    let pkg_path = temp_dir.join(&pkg_filename);

    eprintln!("Downloading {} to {:?}", pkg_url, pkg_path);

    // Download the package using ureq
    let response = ureq::get(&pkg_url)
        .call()
        .map_err(|e| format!("Failed to download package: {}", e))?;

    let mut file = fs::File::create(&pkg_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    std::io::copy(&mut response.into_reader(), &mut file)
        .map_err(|e| format!("Failed to write package: {}", e))?;

    file.flush()
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    drop(file); // Close file before installing

    eprintln!("Downloaded package to {:?}, installing via pkexec...", pkg_path);

    // Build the install command based on package manager
    let install_cmd = match pkg_manager {
        "dnf" => format!("dnf install -y '{}'", pkg_path.display()),
        "apt" => format!("apt install -y '{}'", pkg_path.display()),
        "rpm" => format!("rpm -U '{}'", pkg_path.display()),
        "dpkg" => format!("dpkg -i '{}'", pkg_path.display()),
        _ => return Err("Unknown package manager".to_string()),
    };

    // Run via pkexec for privilege elevation
    let output = Command::new("pkexec")
        .arg("sh")
        .arg("-c")
        .arg(&install_cmd)
        .output()
        .map_err(|e| format!("Failed to run pkexec: {}", e))?;

    // Clean up temp file
    let _ = fs::remove_file(&pkg_path);

    if output.status.success() {
        Ok("Update installed successfully. Please restart the application.".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("Install failed:\n{}\n{}", stdout, stderr))
    }
}

/// Stub for non-Linux platforms
#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn install_linux_update(_version: String) -> Result<String, String> {
    Err("Linux update only available on Linux".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load game data
    let data_dir = get_data_dir();
    eprintln!("Looking for data in: {:?}", data_dir);
    let game_data = GameData::load(&data_dir).unwrap_or_else(|e| {
        eprintln!("Warning: Could not load game data from {:?}: {}", data_dir, e);
        GameData::default()
    });

    println!("Loaded {} ships, {} weapons, {} shields",
        game_data.ships.len(),
        game_data.weapons.len(),
        game_data.shields.len()
    );

    let app_state = AppState {
        data: Mutex::new(game_data),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app_state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_ships,
            get_ship,
            get_weapons,
            get_weapons_by_size,
            get_weapon,
            get_shields,
            get_shields_by_size,
            get_shield,
            calculate_ttk,
            calculate_ttk_v2,
            get_stats,
            save_settings,
            load_settings,
            save_fleet_preset,
            load_fleet_presets,
            delete_fleet_preset,
            install_linux_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
