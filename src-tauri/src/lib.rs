//! Ship Lens - Star Citizen Damage Calculator
//!
//! Rust backend for calculating combat dynamics between ships.

mod data;

use data::{CombatScenario, DamageResult, GameData, Ship, Shield, Weapon};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

/// Application state holding all game data
pub struct AppState {
    pub data: Mutex<GameData>,
}

/// Get the data directory path (for pre-Tauri initialization)
fn get_data_dir() -> PathBuf {
    // In development, use relative path from src-tauri
    let dev_path = PathBuf::from("../data");
    if dev_path.exists() {
        return dev_path;
    }

    // Try current directory
    let current_path = PathBuf::from("data");
    if current_path.exists() {
        return current_path;
    }

    // Try installed location (Linux: /usr/share/ship-lens/data)
    let installed_path = PathBuf::from("/usr/share/ship-lens/data");
    if installed_path.exists() {
        return installed_path;
    }

    // Try next to the executable (works for AppImage)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_data_path = exe_dir.join("data");
            if exe_data_path.exists() {
                return exe_data_path;
            }
        }
    }

    // Try APPDIR for AppImage (resources extracted here)
    if let Ok(appdir) = std::env::var("APPDIR") {
        let appimage_data = PathBuf::from(&appdir).join("usr/share/ship-lens/data");
        if appimage_data.exists() {
            return appimage_data;
        }
        // Also try resources directly in APPDIR
        let appimage_resources = PathBuf::from(&appdir).join("data");
        if appimage_resources.exists() {
            return appimage_resources;
        }
    }

    // Fallback
    PathBuf::from("../data")
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

/// Calculate TTK between ships
#[tauri::command]
fn calculate_ttk(
    state: State<AppState>,
    attacker_ship: String,
    target_ship: String,
    shield_name: Option<String>,
    mount_type: String,
    accuracy_modifier: f64,
) -> Option<DamageResult> {
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

    let scenario = CombatScenario {
        scenario_type: "Dogfight".to_string(),
        mount_type,
        fire_mode: "Sustained".to_string(),
        target_zone: "Center Mass".to_string(),
        accuracy_modifier,
    };

    Some(data::calculate_damage(&weapons, target, shield, &scenario))
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
            get_shields,
            get_shields_by_size,
            calculate_ttk,
            get_stats,
            save_settings,
            load_settings,
            save_fleet_preset,
            load_fleet_presets,
            delete_fleet_preset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
