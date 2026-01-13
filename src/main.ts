import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// Type definitions matching Rust structs
// Individual sub-port within a hardpoint
interface SubPort {
  size: number;
  default_weapon: string | null;
}

// Weapon hardpoint with category information
interface WeaponHardpoint {
  slot_number: number;
  port_name: string;
  max_size: number;
  gimbal_type: string;
  control_type: string;
  category: 'pilot' | 'manned_turret' | 'remote_turret' | 'pdc' | 'missile' | 'torpedo' | 'bomb' | 'spinal' | 'specialized';
  mount_name: string;  // gimbal/turret mount name
  sub_ports: SubPort[];  // individual weapon ports with size and default weapon
  compatible_mounts?: string[];  // optional list of compatible mount refs
}

interface Mount {
  ref: string;
  display_name: string;
  size: number;
  ports: number;
  port_size: number;
  hp: number;
  mount_type: string;
}

interface Ship {
  filename: string;
  display_name: string;
  hull_hp: number;
  armor_hp: number;
  armor_resist_physical: number;
  armor_resist_energy: number;
  armor_resist_distortion: number;
  thruster_main_hp: number;
  thruster_retro_hp: number;
  thruster_mav_hp: number;
  thruster_vtol_hp: number;
  thruster_total_hp: number;
  turret_total_hp: number;
  powerplant_total_hp: number;
  cooler_total_hp: number;
  shield_gen_total_hp: number;
  qd_total_hp: number;
  pilot_weapon_count: number;
  pilot_weapon_sizes: string;
  max_shield_size: number;
  shield_count: number;
  default_shield_ref: string;
  weapon_hardpoints: WeaponHardpoint[];
}

interface Weapon {
  display_name: string;
  filename: string;
  size: number;
  damage_type: string;
  sustained_dps: number;
  power_consumption: number;
  weapon_type: string;  // "gun", "missile", "torpedo", "bomb"
  ship_exclusive?: boolean;  // True if weapon can only be used on specific ships (e.g., Vanduul weapons)
  // 4.5 damage breakdown
  damage_physical: number;
  damage_energy: number;
  damage_distortion: number;
  // Penetration data
  base_penetration_distance: number;
  near_radius: number;
  far_radius: number;
}

interface Missile {
  name: string;
  display_name: string;
  size: number;
  missile_type: string;  // "missile", "torpedo", "bomb"
  tracking_type: string;  // "IR", "EM", "CS", "Unknown"
  damage_physical: number;
  damage_energy: number;
  damage_distortion: number;
  explosion_min_radius: number;
  explosion_max_radius: number;
  max_lifetime: number;
  arm_time: number;
  lock_time: number;
}

interface Shield {
  display_name: string;
  internal_name: string;
  size: number;
  max_hp: number;
  regen: number;
  resist_physical: number;
  resist_energy: number;
  resist_distortion: number;
  // 4.5 absorption values
  absorb_physical: number;
  absorb_energy: number;
  absorb_distortion: number;
  // Regen delay mechanics
  damaged_regen_delay: number;  // Seconds after damage before regen starts
  downed_regen_delay: number;   // Seconds after depletion before regen starts
}

// 4.5 TTK calculation result from backend
interface DamageBreakdown {
  physical: number;
  energy: number;
  distortion: number;
}

interface WeaponEffectiveness {
  weapon_name: string;
  hardpoint_label: string | null;
  damage_type: string;
  count: number;
  raw_dps: number;
  effective_dps: number;
  shield_dps: number;
  passthrough_dps: number;
  armor_dps: number;
  hull_dps: number;
  solo_ttk: number;
  is_effective: boolean;
  ineffective_reason: string | null;
  shield_time: number;
  armor_time: number;
  hull_time: number;
}

interface MissileEffectiveness {
  missile_name: string;
  hardpoint_label: string | null;
  damage_type: string;
  count: number;
  total_damage: number;
  shield_damage: number;
  passthrough_damage: number;
  armor_damage: number;
  hull_damage: number;
  is_effective: boolean;
  ineffective_reason: string | null;
  time_saved: number;
}

interface TTKResult {
  shield_time: number;
  armor_time: number;
  hull_time: number;
  total_ttk: number;
  damage_breakdown: DamageBreakdown;
  effective_dps: number;
  shield_dps: number;
  passthrough_dps: number;
  armor_damage_during_shields: number;
  shield_failover_phases: number;
  shields_breakable: boolean;
  weapon_breakdown: WeaponEffectiveness[];
  missile_breakdown: MissileEffectiveness[];
}

interface Stats {
  ship_count: number;
  weapon_count: number;
  shield_count: number;
}

// Saved settings interface
interface SavedSettings {
  attackerShip: string;
  targetShip: string;
  shield: string;
  scenario: string;
  mountType: string;
  fireMode: string;
  targetZone: string;
  weaponPower: string;
  weapons: string[];  // Selected weapon names per slot
  enabledCategories: string[];  // Enabled weapon categories
  theme: string;  // UI theme (crusader, drake, origin, aegis, misc)
}

// Fleet preset interface
interface FleetPreset {
  id: string;           // Unique ID (timestamp-based)
  name: string;         // Custom name with emoji support
  shipName: string;     // Base ship name
  weapons: string[];    // Selected weapons per slot
  shield: string;       // Selected shield
  enabledCategories: string[];  // Enabled weapon categories
  createdAt: string;    // ISO timestamp
}

// Debounce timer for saving settings
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// Current theme
let currentTheme: string = 'crusader';

function saveSettings() {
  // Debounce saves to avoid too many file writes
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const settings: SavedSettings = {
      attackerShip: attackerShipDropdown?.getValue() || "",
      targetShip: targetShipDropdown?.getValue() || "",
      shield: shieldDropdown?.getValue() || "",
      scenario: scenarioDropdown?.getValue() || "dogfight",
      mountType: mountTypeDropdown?.getValue() || "Gimballed",
      fireMode: fireModeDropdown?.getValue() || "sustained",
      targetZone: targetZoneDropdown?.getValue() || "center-mass",
      weaponPower: weaponPowerDropdown?.getValue() || "0.33",
      weapons: weaponSlotManager?.getAllSelectedWeapons() || [],  // Save all weapons, not just enabled
      enabledCategories: weaponSlotManager?.getEnabledCategories() || ['pilot'],
      theme: currentTheme,
    };
    try {
      await invoke("save_settings", { settings });
      console.log("Settings saved");
    } catch (e) {
      console.warn("Failed to save settings:", e);
    }
  }, 500);
}

async function loadSavedSettings(): Promise<SavedSettings | null> {
  try {
    const saved = await invoke<SavedSettings | null>("load_settings");
    return saved;
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  return null;
}

// Combat modifiers from Excel _Modifiers sheet
const MOUNT_TYPE_ACCURACY: Record<string, number> = {
  "Fixed": 0.60,
  "Gimballed": 0.75,
  "Auto-Gimbal": 0.80,
  "Turret": 0.70,
};

const FIRE_MODE_DPS_MOD: Record<string, number> = {
  "sustained": 1.0,
  "burst": 0.85,
  "staggered": 0.75,
};

const SCENARIO_MODIFIERS: Record<string, { accuracy: number; tot: number }> = {
  "dogfight": { accuracy: 0.75, tot: 0.65 },
  "synthetic": { accuracy: 0.95, tot: 0.95 },
  "jousting": { accuracy: 0.85, tot: 0.35 },
  "custom": { accuracy: 0.8, tot: 0.8 },
};

const ZONE_MODIFIERS: Record<string, { hull: number; armor: number; thruster: number; component: number }> = {
  "center-mass": { hull: 0.6, armor: 0.3, thruster: 0.05, component: 0.05 },
  "engines": { hull: 0.2, armor: 0.1, thruster: 0.6, component: 0.1 },
  "cockpit": { hull: 0.5, armor: 0.2, thruster: 0.0, component: 0.3 },
  "wings": { hull: 0.3, armor: 0.4, thruster: 0.2, component: 0.1 },
  "turrets": { hull: 0.1, armor: 0.1, thruster: 0.0, component: 0.0 },
};

// Power level multipliers from Excel _Modifiers sheet
const POWER_LEVEL_MULTIPLIER: Record<string, number> = {
  "0": 1.0,      // 0% power
  "0.33": 1.0,   // 33% power (default)
  "0.5": 1.07,   // 50% power
  "0.66": 1.13,  // 66% power
  "1": 1.2,      // 100% power
};

// Searchable dropdown class with fleet preset support
class SearchableDropdown {
  private container: HTMLElement;
  private searchInput: HTMLInputElement;
  private dropdown: HTMLElement;
  private hiddenInput: HTMLInputElement;
  private options: { value: string; label: string }[] = [];
  private filteredOptions: { value: string; label: string }[] = [];
  private fleetPresets: { value: string; label: string; presetId: string }[] = [];
  private filteredPresets: { value: string; label: string; presetId: string }[] = [];
  private selectedValue: string = "";
  private selectedPresetId: string = "";
  private onChangeCallback: ((value: string) => void) | null = null;
  private onPresetSelectCallback: ((presetId: string) => void) | null = null;
  private supportsFleetPresets: boolean = false;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    this.searchInput = this.container.querySelector(".search-input") as HTMLInputElement;
    this.dropdown = this.container.querySelector(".select-dropdown") as HTMLElement;
    this.hiddenInput = this.container.querySelector('input[type="hidden"]') as HTMLInputElement;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.searchInput.addEventListener("focus", () => this.showDropdown());
    this.searchInput.addEventListener("click", () => this.showDropdown());
    this.searchInput.addEventListener("input", () => {
      this.filterOptions(this.searchInput.value);
      this.showDropdown();
    });
    document.addEventListener("click", (e) => {
      // Check both container and dropdown (which may be portaled to body)
      if (!this.container.contains(e.target as Node) && !this.dropdown.contains(e.target as Node)) {
        this.hideDropdown();
      }
    });
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideDropdown();
        this.searchInput.blur();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.cycleSelection(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.cycleSelection(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Close dropdown on Enter if open
        if (this.dropdown.classList.contains("open")) {
          this.hideDropdown();
        }
      }
    });
  }

  private cycleSelection(direction: number) {
    // Use filtered options if dropdown is open with a search, otherwise use all options
    const optionsList = this.filteredOptions.length > 0 ? this.filteredOptions : this.options;
    if (optionsList.length === 0) return;

    // Find current selection index
    let currentIndex = optionsList.findIndex(opt => opt.value === this.selectedValue);

    // Calculate new index
    if (currentIndex === -1) {
      currentIndex = direction > 0 ? 0 : optionsList.length - 1;
    } else {
      currentIndex += direction;
      if (currentIndex < 0) currentIndex = optionsList.length - 1;
      if (currentIndex >= optionsList.length) currentIndex = 0;
    }

    // Select the new option immediately (triggers onChange for live updates)
    const newOption = optionsList[currentIndex];
    this.selectOption(newOption.value);

    // If dropdown is open, scroll the selected item into view
    if (this.dropdown.classList.contains("open")) {
      const selectedEl = this.dropdown.querySelector(`.select-option[data-value="${newOption.value}"]`);
      selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  enableFleetPresets() {
    this.supportsFleetPresets = true;
  }

  setFleetPresets(presets: { value: string; label: string; presetId: string }[]) {
    this.fleetPresets = presets;
    this.filteredPresets = presets;
    this.renderOptions();
  }

  setOptions(options: { value: string; label: string }[]) {
    console.log(`[Dropdown.setOptions] received ${options.length} options`);
    this.options = options;
    this.filteredOptions = options;
    this.renderOptions();
  }

  private filterOptions(query: string) {
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery) {
      this.filteredOptions = this.options.filter(opt => opt.label.toLowerCase().includes(lowerQuery));
      this.filteredPresets = this.fleetPresets.filter(opt => opt.label.toLowerCase().includes(lowerQuery));
    } else {
      this.filteredOptions = this.options;
      this.filteredPresets = this.fleetPresets;
    }
    this.renderOptions();
  }

  private renderOptions() {
    let html = "";

    // Render fleet presets section if enabled and has presets
    if (this.supportsFleetPresets && this.filteredPresets.length > 0) {
      html += '<div class="select-option group-header">MY FLEET</div>';
      html += this.filteredPresets.map(opt =>
        `<div class="select-option preset-option${opt.presetId === this.selectedPresetId ? ' selected' : ''}" data-value="${opt.value}" data-preset-id="${opt.presetId}">${opt.label}</div>`
      ).join("");
      html += '<div class="select-option group-header">ALL SHIPS</div>';
    }

    // Render regular options
    if (this.filteredOptions.length === 0 && this.filteredPresets.length === 0) {
      html = '<div class="select-option no-results">No matches found</div>';
    } else {
      html += this.filteredOptions.map(opt =>
        `<div class="select-option${opt.value === this.selectedValue && !this.selectedPresetId ? ' selected' : ''}" data-value="${opt.value}">${opt.label}</div>`
      ).join("");
    }

    this.dropdown.innerHTML = html;

    // Attach event listeners - use mousedown to fire before focus changes
    this.dropdown.querySelectorAll(".select-option:not(.no-results):not(.group-header)").forEach(el => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent focus loss
        const presetId = (el as HTMLElement).dataset.presetId;
        if (presetId) {
          this.selectPreset(presetId);
        } else {
          this.selectOption((el as HTMLElement).dataset.value || "");
        }
      });
    });
  }

  private selectOption(value: string) {
    this.selectedValue = value;
    this.selectedPresetId = "";
    const option = this.options.find(o => o.value === value);
    this.searchInput.value = option?.label || "";
    this.hiddenInput.value = value;
    this.hideDropdown();
    if (this.onChangeCallback) this.onChangeCallback(value);
  }

  private selectPreset(presetId: string) {
    const preset = this.fleetPresets.find(p => p.presetId === presetId);
    if (preset) {
      this.selectedPresetId = presetId;
      this.selectedValue = preset.value;
      this.searchInput.value = preset.label;
      this.hiddenInput.value = preset.value;
      this.hideDropdown();
      if (this.onPresetSelectCallback) this.onPresetSelectCallback(presetId);
    }
  }

  private showDropdown() {
    // Move dropdown to body as a portal to escape overflow:hidden containers
    if (this.dropdown.parentElement !== document.body) {
      document.body.appendChild(this.dropdown);
    }
    // Position dropdown using fixed positioning relative to input
    const rect = this.searchInput.getBoundingClientRect();
    const dropdownHeight = 200; // max-height from CSS
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    this.dropdown.style.left = `${rect.left}px`;
    this.dropdown.style.width = `${rect.width}px`;

    // Open upward if not enough space below, but enough above
    if (spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow) {
      this.dropdown.style.top = 'auto';
      this.dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      this.dropdown.classList.add("open", "open-up");
    } else {
      this.dropdown.style.bottom = 'auto';
      this.dropdown.style.top = `${rect.bottom + 4}px`;
      this.dropdown.classList.remove("open-up");
      this.dropdown.classList.add("open");
    }
  }
  private hideDropdown() {
    this.dropdown.classList.remove("open", "open-up");
    // Move dropdown back to container
    if (this.dropdown.parentElement === document.body) {
      this.container.appendChild(this.dropdown);
    }
  }
  getValue(): string { return this.selectedValue; }
  getSelectedPresetId(): string { return this.selectedPresetId; }

  setValue(value: string) {
    this.selectedValue = value;
    this.selectedPresetId = "";
    const option = this.options.find(o => o.value === value);
    const newInputValue = option?.label || "";
    console.log(`[Dropdown.setValue] value="${value}", options.length=${this.options.length}, found=${!!option}, setting input to "${newInputValue}"`);
    this.searchInput.value = newInputValue;
    this.hiddenInput.value = value;
    this.renderOptions();
  }

  setValueFromPreset(presetId: string, displayLabel: string, shipValue: string) {
    this.selectedPresetId = presetId;
    this.selectedValue = shipValue;
    this.searchInput.value = displayLabel;
    this.hiddenInput.value = shipValue;
    this.renderOptions();
  }

  onChange(callback: (value: string) => void) { this.onChangeCallback = callback; }
  onPresetSelect(callback: (presetId: string) => void) { this.onPresetSelectCallback = callback; }
}

// Category display names and order
const CATEGORY_CONFIG: Record<string, { title: string; cssClass: string; order: number }> = {
  'pilot': { title: 'PILOT WEAPONS', cssClass: 'pilot', order: 1 },
  'manned_turret': { title: 'MANNED TURRETS', cssClass: 'manned-turret', order: 2 },
  'remote_turret': { title: 'REMOTE TURRETS', cssClass: 'remote-turret', order: 3 },
  'pdc': { title: 'POINT DEFENSE', cssClass: 'pdc', order: 4 },
  'missile': { title: 'MISSILES', cssClass: 'missile', order: 5 },
  'torpedo': { title: 'TORPEDOES', cssClass: 'torpedo', order: 6 },
  'bomb': { title: 'BOMBS', cssClass: 'bomb', order: 7 },
  'spinal': { title: 'SPINAL WEAPONS', cssClass: 'spinal', order: 8 },
  'specialized': { title: 'SPECIALIZED', cssClass: 'specialized', order: 9 },
};

// Weapon slot with category info
interface CategorySlot {
  hardpoint: WeaponHardpoint;
  dropdown: SearchableDropdown | null;
  slotIndex: number;
  isEnabled: boolean;
}

// Weapon slot manager with category support
class WeaponSlotManager {
  private container: HTMLElement;
  private weaponsBySize: Map<number, Weapon[]> = new Map();
  private missilesBySize: Map<number, Missile[]> = new Map();
  private categorySlots: Map<string, CategorySlot[]> = new Map();
  private enabledCategories: Set<string> = new Set(['pilot']); // Default: only pilot enabled
  private collapsedCategories: Set<string> = new Set(); // Track collapsed sections
  private onChangeCallback: (() => void) | null = null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
  }

  async setWeapons(weapons: Weapon[]) {
    console.log("[WeaponSlotManager] setWeapons called with", weapons.length, "weapons");
    this.weaponsBySize.clear();
    weapons.forEach(w => {
      if (!this.weaponsBySize.has(w.size)) this.weaponsBySize.set(w.size, []);
      this.weaponsBySize.get(w.size)!.push(w);
    });
    this.weaponsBySize.forEach((weps, size) => {
      weps.sort((a, b) => b.sustained_dps - a.sustained_dps);
      this.weaponsBySize.set(size, weps);
    });
    console.log("weaponsBySize:", Array.from(this.weaponsBySize.entries()).map(([size, weps]) => `S${size}: ${weps.length} weapons`));

    // Load missiles from backend
    try {
      const missiles: Missile[] = await invoke("get_missiles");
      this.missilesBySize.clear();
      missiles.forEach(m => {
        if (!this.missilesBySize.has(m.size)) this.missilesBySize.set(m.size, []);
        this.missilesBySize.get(m.size)!.push(m);
      });
      this.missilesBySize.forEach((msls, size) => {
        // Sort by total damage (descending)
        msls.sort((a, b) => (b.damage_physical + b.damage_energy + b.damage_distortion) - (a.damage_physical + a.damage_energy + a.damage_distortion));
        this.missilesBySize.set(size, msls);
      });
      console.log("missilesBySize:", Array.from(this.missilesBySize.entries()).map(([size, msls]) => `S${size}: ${msls.length} missiles`));
    } catch (e) {
      console.error("Failed to load missiles:", e);
    }
  }

  // New method: update using detailed hardpoints with categories
  updateSlotsFromHardpoints(hardpoints: WeaponHardpoint[]) {
    console.log(`[WeaponSlotManager] updateSlotsFromHardpoints called with ${hardpoints.length} hardpoints, weaponsBySize has ${this.weaponsBySize.size} sizes`);
    this.container.innerHTML = "";
    this.categorySlots.clear();

    if (hardpoints.length === 0) {
      this.container.innerHTML = '<p class="no-weapons-message">No weapon hardpoints available</p>';
      return;
    }

    // Group hardpoints by category
    const categorizedHardpoints: Map<string, WeaponHardpoint[]> = new Map();
    hardpoints.forEach(hp => {
      const category = hp.category || 'pilot';
      if (!categorizedHardpoints.has(category)) {
        categorizedHardpoints.set(category, []);
      }
      categorizedHardpoints.get(category)!.push(hp);
    });

    // Sort categories by configured order
    const sortedCategories = Array.from(categorizedHardpoints.keys()).sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a]?.order ?? 99;
      const orderB = CATEGORY_CONFIG[b]?.order ?? 99;
      return orderA - orderB;
    });

    let globalSlotIndex = 0;

    // Render each category
    sortedCategories.forEach(category => {
      const categoryHardpoints = categorizedHardpoints.get(category)!;
      const config = CATEGORY_CONFIG[category] || { title: category.toUpperCase(), cssClass: 'pilot', order: 99 };
      const isEnabled = this.enabledCategories.has(category);
      const categoryId = `weapon-category-${category}`;

      // Check if category should be collapsed
      const isCollapsed = this.collapsedCategories.has(category);

      // Create category section
      this.container.insertAdjacentHTML("beforeend", `
        <div class="weapon-category ${config.cssClass}${isEnabled ? '' : ' disabled'}${isCollapsed ? ' collapsed' : ''}" id="${categoryId}">
          <div class="weapon-category-header">
            <div class="weapon-category-info">
              <span class="collapse-indicator"></span>
              <span class="weapon-category-title">${config.title}</span>
              <span class="weapon-category-count">(${categoryHardpoints.length})</span>
            </div>
            <label class="category-toggle" onclick="event.stopPropagation()">
              <input type="checkbox" ${isEnabled ? 'checked' : ''} data-category="${category}">
              <span class="category-toggle-slider"></span>
            </label>
          </div>
          <div class="weapon-category-slots" id="${categoryId}-slots"></div>
        </div>
      `);

      // Set up collapse toggle on header click
      const categoryHeader = this.container.querySelector(`#${categoryId} .weapon-category-header`) as HTMLElement;
      categoryHeader.addEventListener('click', (e) => {
        // Don't toggle collapse if clicking on the toggle switch
        if ((e.target as HTMLElement).closest('.category-toggle')) return;
        this.toggleCategoryCollapse(category);
      });

      // Set up enabled toggle handler
      const toggleInput = this.container.querySelector(`#${categoryId} .category-toggle input`) as HTMLInputElement;
      toggleInput.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.setCategoryEnabled(category, checked);
      });

      // Create slots for this category
      const slotsContainer = document.getElementById(`${categoryId}-slots`) as HTMLElement;
      const categorySlotsList: CategorySlot[] = [];

      categoryHardpoints.forEach((hp) => {
        // Get sub-ports (new format) or create single port from max_size
        const subPorts = hp.sub_ports && hp.sub_ports.length > 0
          ? hp.sub_ports
          : [{ size: hp.max_size, default_weapon: null }];

        // Skip camera turrets (remote/torpedo turrets with no default weapon and single port)
        // These are observation turrets, not weapon turrets
        const hasAnyDefault = subPorts.some(sp => sp.default_weapon);
        const isCameraTurret = (hp.category === 'remote_turret' || hp.category === 'torpedo')
          && !hasAnyDefault
          && subPorts.length === 1;
        if (isCameraTurret) {
          return;
        }

        // Skip hardpoints where NO mount is equipped AND all sub_ports have empty default weapons
        // These are truly unequipped slots (e.g., door gunners with no weapon)
        // But if a mount IS equipped (like gimbals on 85X), show weapon selectors even if empty
        const allSubPortsEmpty = subPorts.every(sp => !sp.default_weapon || sp.default_weapon === 'empty');
        const hasMount = hp.mount_name && hp.mount_name.trim() !== '';
        if (allSubPortsEmpty && !hasMount) {
          return;
        }

        let subPortCount = subPorts.length;

        // For dual/multi mounts, create a grouped container
        const isDualMount = subPortCount > 1;

        if (isDualMount) {
          // Create a container for the dual mount group
          const groupId = `weapon-group-${globalSlotIndex}`;
          
          // Check if this hardpoint has swappable mounts

          // Check if user has selected a different mount for this hardpoint
          const selectedMountData = selectedMounts.get(hp.port_name);
          // Use display_name for selected mounts (already formatted), format raw names otherwise
          const effectiveMountName = selectedMountData
            ? selectedMountData.mount.display_name
            : formatHardpointLabel(hp.mount_name || hp.port_name);

          // If mount was selected, update sub_ports to match the selected mount's configuration
          let effectiveSubPorts = subPorts;
          if (selectedMountData) {
            effectiveSubPorts = Array(selectedMountData.mount.ports).fill(null).map(() => ({
              size: selectedMountData.mount.port_size,
              default_weapon: 'empty'
            }));
          subPortCount = effectiveSubPorts.length;
          }
          const hasSwappableMounts = hp.mount_name && hp.compatible_mounts && hp.compatible_mounts.length > 1;
          
          slotsContainer.insertAdjacentHTML("beforeend", `
            <div class="weapon-slot-group dual-mount" id="${groupId}">
              <span class="weapon-group-label ${hasSwappableMounts ? 'swappable-mount' : ''}"
                    title="${hp.port_name}"
                    ${hasSwappableMounts ? 'data-swappable="true"' : ''}>
                ${effectiveMountName}
                ${hasSwappableMounts ? '<span class="swap-mount-badge">SWAP</span>' : ''}
              </span>
              <div class="weapon-group-slots"></div>
            </div>
          `);
          const groupSlotsContainer = document.querySelector(`#${groupId} .weapon-group-slots`) as HTMLElement;
          
          // Add click handler for swappable mounts
          if (hasSwappableMounts) {
            setTimeout(() => {
              const labelEl = document.querySelector(`#${groupId} .swappable-mount`) as HTMLElement;
              if (labelEl) {
                labelEl.addEventListener('click', () => showMountSelectionPopup(hp.max_size, hp));
              }
            }, 0);
          }

          // Check for bespoke weapon (any sub-port with bespoke in default_weapon filename)
          const hasBespokeWeapon = effectiveSubPorts.some(sp =>
            sp.default_weapon && sp.default_weapon.toLowerCase().includes('bespoke')
          );

          // For bespoke dual mounts, render entire group as locked
          if (hasBespokeWeapon) {
            let allBespoke = true;
            for (let subIdx = 0; subIdx < subPortCount; subIdx++) {
              const subPort = effectiveSubPorts[subIdx];
              const subPortSize = subPort.size;
              const subPortDefault = subPort.default_weapon;
              const isBespoke = subPortDefault && subPortDefault.toLowerCase().includes('bespoke');

              if (isBespoke) {
                const bespokeWeapon = (this.weaponsBySize.get(subPortSize) || [])
                  .find(w => w.filename === subPortDefault);

                if (bespokeWeapon) {
                  const subPortLabel = subPortCount === 2 ? (subIdx === 0 ? 'Left' : 'Right') : `#${subIdx + 1}`;
                  groupSlotsContainer.insertAdjacentHTML("beforeend", `
                    <div class="weapon-slot sub-port">
                      <span class="weapon-slot-size" data-slot-index="${globalSlotIndex}" title="Click to toggle">${subPortLabel}</span>
                      <span class="weapon-slot-size-badge">S${subPortSize}</span>
                      <div class="weapon-bespoke">
                        <span class="weapon-bespoke-name">${bespokeWeapon.display_name}</span>
                        <span class="weapon-bespoke-badge">BESPOKE</span>
                      </div>
                    </div>
                  `);

                  // Create a "virtual" dropdown that always returns the bespoke weapon
                  const virtualDropdown = {
                    getValue: () => bespokeWeapon.display_name,
                    setValue: () => {},
                    onChange: () => {},
                  } as any;

                  // Create a modified hardpoint for this sub-port
                  const subPortHardpoint: WeaponHardpoint = {
                    ...hp,
                    max_size: subPortSize,
                    sub_ports: [subPort],
                  };
                  categorySlotsList.push({ hardpoint: subPortHardpoint, dropdown: virtualDropdown, slotIndex: globalSlotIndex, isEnabled: true });
                  globalSlotIndex++;
                } else {
                  allBespoke = false;
                }
              } else {
                allBespoke = false;
              }
            }
            if (allBespoke) {
              return; // Skip normal dropdown creation if all are bespoke
            }
          }

          // Create individual slots for each sub-port
          for (let subIdx = 0; subIdx < subPortCount; subIdx++) {
            const subPort = effectiveSubPorts[subIdx];
            const subPortSize = subPort.size;
            const subPortDefault = subPort.default_weapon;
            const slotId = `weapon-slot-${globalSlotIndex}`;
            const subPortLabel = subPortCount === 2 ? (subIdx === 0 ? 'Left' : 'Right') : `#${subIdx + 1}`;

            groupSlotsContainer.insertAdjacentHTML("beforeend", `
              <div class="weapon-slot sub-port">
                <span class="weapon-slot-size" data-slot-index="${globalSlotIndex}" title="Click to toggle">${subPortLabel}</span>
                <span class="weapon-slot-size-badge">S${subPortSize}</span>
                <div class="searchable-select" id="${slotId}-container">
                  <input type="text" class="search-input" id="${slotId}-search" placeholder="Select weapon..." autocomplete="off">
                  <div class="select-dropdown" id="${slotId}-dropdown"></div>
                  <input type="hidden" id="${slotId}" value="">
                </div>
              </div>
            `);

            const dropdown = new SearchableDropdown(`${slotId}-container`);
            
            // Use missiles for missile/torpedo/bomb categories, weapons for everything else
            let options: { value: string; label: string }[];
            let defaultLookup: { filename: string; display_name: string }[] = [];
            
            if (hp.category === 'missile' || hp.category === 'torpedo' || hp.category === 'bomb') {
              // Use missiles from missilesBySize
              const allMissiles = this.missilesBySize.get(subPortSize) || [];
              const missiles = allMissiles.filter(m => m.missile_type === hp.category);
              options = missiles.map(m => {
                const totalDamage = Math.round(m.damage_physical + m.damage_energy + m.damage_distortion);
                return { value: m.display_name, label: `${m.display_name} (${totalDamage} dmg)` };
              });
              defaultLookup = missiles.map(m => ({ filename: m.name, display_name: m.display_name }));
            } else {
              // Use weapons from weaponsBySize
              let weapons = this.weaponsBySize.get(subPortSize) || [];

              // Filter by weapon type
              if (hp.category === 'pdc') {
                weapons = weapons.filter(w => w.weapon_type === 'pdc');
              } else {
                weapons = weapons.filter(w => w.weapon_type === 'gun');
              }

              // Filter out ship_exclusive weapons unless they are the default weapon for this slot
              weapons = weapons.filter(w => !w.ship_exclusive || w.filename === subPortDefault);

              options = weapons.map(w => {
                return { value: w.display_name, label: `${w.display_name} (${Math.round(w.sustained_dps)} DPS)` };
              });
              defaultLookup = weapons.map(w => ({ filename: w.filename, display_name: w.display_name }));
            }

            // Add "Empty" option at the beginning for non-missile hardpoints
            if (hp.category !== 'missile' && hp.category !== 'torpedo' && hp.category !== 'bomb') {
              options.unshift({ value: 'Empty', label: 'Empty (0 DPS)' });
            }

            dropdown.setOptions(options);

            // Pre-select default weapon if available (per-sub-port)
            let selectedWeapon: string | null = null;
            const isEmptyDefault = !subPortDefault || subPortDefault === '' || subPortDefault === 'empty';
            if (isEmptyDefault) {
              // Empty default - select "Empty" option
              selectedWeapon = 'Empty';
            } else if (subPortDefault && subPortDefault.length > 0) {
              const defaultItem = defaultLookup.find(item => item.filename === subPortDefault);
              if (defaultItem) selectedWeapon = defaultItem.display_name;
            }
            // Only fall back to first weapon if no empty option and no match found
            if (!selectedWeapon && options.length > 0 && hp.category !== 'pilot') {
              selectedWeapon = options[0].value;
            }
            if (selectedWeapon) {
              dropdown.setValue(selectedWeapon);
            }
            dropdown.onChange(() => { if (this.onChangeCallback) this.onChangeCallback(); });

            // Create a modified hardpoint for this sub-port
            const subPortHardpoint: WeaponHardpoint = {
              ...hp,
              max_size: subPortSize,
              sub_ports: [subPort],  // Individual sub-port
            };
            categorySlotsList.push({ hardpoint: subPortHardpoint, dropdown, slotIndex: globalSlotIndex, isEnabled: true });
            globalSlotIndex++;
          }
        } else {
          // Single weapon slot
          const subPort = subPorts[0];
          const weaponSize = subPort.size;
          const displaySize = subPort.size;
          const subPortDefault = subPort.default_weapon;

          // Check for bespoke weapon
          const isBespokeWeapon = subPortDefault && subPortDefault.toLowerCase().includes('bespoke');

          // Determine if we should use missiles or weapons
          const useMissiles = !isBespokeWeapon && hp.category !== 'specialized' && 
                             (hp.category === 'missile' || hp.category === 'torpedo' || hp.category === 'bomb');

          let items: { filename: string; display_name: string; damage_total?: number; sustained_dps?: number }[] = [];
          
          if (useMissiles) {
            // Use missiles
            const allMissiles = this.missilesBySize.get(weaponSize) || [];
            const missiles = allMissiles.filter(m => m.missile_type === hp.category);
            items = missiles.map(m => ({
              filename: m.name,
              display_name: m.display_name,
              damage_total: m.damage_physical + m.damage_energy + m.damage_distortion
            }));
          } else {
            // Use weapons
            let weapons = this.weaponsBySize.get(weaponSize) || [];

            // Filter weapons based on category
            if (isBespokeWeapon && subPortDefault) {
              weapons = weapons.filter(w => w.filename === subPortDefault);
            } else if (hp.category === 'specialized' && subPortDefault) {
              weapons = weapons.filter(w => w.filename === subPortDefault);
            } else if (hp.category === 'pdc') {
              weapons = weapons.filter(w => w.weapon_type === 'pdc');
            } else {
              weapons = weapons.filter(w => w.weapon_type === 'gun');
            }

            // Filter out ship_exclusive weapons unless they are the default weapon for this slot
            weapons = weapons.filter(w => !w.ship_exclusive || w.filename === subPortDefault);

            items = weapons.map(w => ({
              filename: w.filename,
              display_name: w.display_name,
              sustained_dps: w.sustained_dps
            }));
          }

          // Skip hardpoints with no matching items
          if (items.length === 0) {
            return;
          }

          // Skip hardpoints where default_weapon doesn't match any available item
          if (subPortDefault && subPortDefault !== 'empty' && !isBespokeWeapon) {
            const hasMatchingItem = items.some(item => item.filename === subPortDefault);
            if (!hasMatchingItem) {
              return;
            }
          }

          // For bespoke weapons, render as plain text (no dropdown)
          if (isBespokeWeapon && items.length === 1) {
            const bespokeItem = items[0];
            const slotId = `weapon-slot-${globalSlotIndex}`;
            slotsContainer.insertAdjacentHTML("beforeend", `
              <div class="weapon-slot">
                <span class="weapon-slot-size" data-slot-index="${globalSlotIndex}" title="Click to toggle">S${displaySize}</span>
                <div class="weapon-bespoke" id="${slotId}-bespoke">
                  <span class="weapon-bespoke-name">${bespokeItem.display_name}</span>
                  <span class="weapon-bespoke-badge">BESPOKE</span>
                </div>
              </div>
            `);

            const virtualDropdown = {
              getValue: () => bespokeItem.display_name,
              setValue: () => {},
              onChange: () => {},
            } as any;

            categorySlotsList.push({ hardpoint: hp, dropdown: virtualDropdown, slotIndex: globalSlotIndex, isEnabled: true });
            globalSlotIndex++;
            return;
          }

          const slotId = `weapon-slot-${globalSlotIndex}`;
          slotsContainer.insertAdjacentHTML("beforeend", `
            <div class="weapon-slot">
              <span class="weapon-slot-size" data-slot-index="${globalSlotIndex}" title="Click to toggle">S${displaySize}</span>
              <div class="searchable-select" id="${slotId}-container">
                <input type="text" class="search-input" id="${slotId}-search" placeholder="Select weapon..." autocomplete="off">
                <div class="select-dropdown" id="${slotId}-dropdown"></div>
                <input type="hidden" id="${slotId}" value="">
              </div>
            </div>
          `);

          const dropdown = new SearchableDropdown(`${slotId}-container`);

          const options = items.map(item => {
            if (item.damage_total !== undefined) {
              // Missile/torpedo/bomb
              const totalDamage = Math.round(item.damage_total);
              return { value: item.display_name, label: `${item.display_name} (${totalDamage} dmg)` };
            } else {
              // Weapon (gun/pdc)
              return { value: item.display_name, label: `${item.display_name} (${Math.round(item.sustained_dps || 0)} DPS)` };
            }
          });

          // Add "Empty" option at the beginning for non-missile hardpoints
          if (hp.category !== 'missile' && hp.category !== 'torpedo' && hp.category !== 'bomb') {
            options.unshift({ value: 'Empty', label: 'Empty (0 DPS)' });
          }

          dropdown.setOptions(options);

          // Pre-select default item if available
          let selectedWeapon: string | null = null;
          const isEmptyDefault = !subPortDefault || subPortDefault === '' || subPortDefault === 'empty';
          if (isEmptyDefault && hp.category !== 'missile' && hp.category !== 'torpedo' && hp.category !== 'bomb') {
            // Empty default - select "Empty" option
            selectedWeapon = 'Empty';
          } else if (subPortDefault && subPortDefault.length > 0) {
            const defaultItem = items.find(item => item.filename === subPortDefault);
            if (defaultItem) selectedWeapon = defaultItem.display_name;
          }
          // Only fall back to first option if no empty option and no match found
          if (!selectedWeapon && options.length > 0 && hp.category !== 'pilot') {
            selectedWeapon = options[0].value;
          }
          if (selectedWeapon) {
            dropdown.setValue(selectedWeapon);
          }

          dropdown.onChange(() => { if (this.onChangeCallback) this.onChangeCallback(); });

          categorySlotsList.push({ hardpoint: hp, dropdown, slotIndex: globalSlotIndex, isEnabled: true });
          globalSlotIndex++;
        }
      });

      this.categorySlots.set(category, categorySlotsList);
    });

    if (this.onChangeCallback) this.onChangeCallback();
  }

  // Legacy method for backward compatibility
  updateSlots(weaponSizes: string) {
    console.log("updateSlots (legacy) called with:", weaponSizes);
    const sizes = weaponSizes.split(",").map(s => parseInt(s.trim())).filter(s => !isNaN(s) && s > 0);

    if (sizes.length === 0) {
      this.container.innerHTML = '<p class="no-weapons-message">No weapon hardpoints available</p>';
      return;
    }

    // Convert to hardpoints with 'pilot' category for backward compatibility
    const hardpoints: WeaponHardpoint[] = sizes.map((size, index) => ({
      slot_number: index + 1,
      port_name: `gun_${index + 1}`,
      max_size: size,
      gimbal_type: 'Gimbal',
      control_type: 'Pilot',
      category: 'pilot' as const,
      mount_name: '',
      sub_ports: [{ size, default_weapon: null }],
    }));

    this.updateSlotsFromHardpoints(hardpoints);
  }

  setCategoryEnabled(category: string, enabled: boolean) {
    if (enabled) {
      this.enabledCategories.add(category);
    } else {
      this.enabledCategories.delete(category);
    }

    // Update UI
    const categoryEl = document.getElementById(`weapon-category-${category}`);
    if (categoryEl) {
      if (enabled) {
        categoryEl.classList.remove('disabled');
      } else {
        categoryEl.classList.add('disabled');
      }
    }

    if (this.onChangeCallback) this.onChangeCallback();
  }

  toggleCategoryCollapse(category: string) {
    const categoryEl = document.getElementById(`weapon-category-${category}`);
    if (!categoryEl) return;

    if (this.collapsedCategories.has(category)) {
      this.collapsedCategories.delete(category);
      categoryEl.classList.remove('collapsed');
    } else {
      this.collapsedCategories.add(category);
      categoryEl.classList.add('collapsed');
    }
  }

  getCollapsedCategories(): string[] {
    return Array.from(this.collapsedCategories);
  }

  setCollapsedCategories(categories: string[]) {
    this.collapsedCategories = new Set(categories);
    // Update UI for all categories
    this.categorySlots.forEach((_, category) => {
      const categoryEl = document.getElementById(`weapon-category-${category}`);
      if (categoryEl) {
        if (this.collapsedCategories.has(category)) {
          categoryEl.classList.add('collapsed');
        } else {
          categoryEl.classList.remove('collapsed');
        }
      }
    });
  }

  getEnabledCategories(): string[] {
    return Array.from(this.enabledCategories);
  }

  setEnabledCategories(categories: string[]) {
    this.enabledCategories = new Set(categories);

    // Update UI for all categories
    this.categorySlots.forEach((_, category) => {
      const isEnabled = this.enabledCategories.has(category);
      const categoryEl = document.getElementById(`weapon-category-${category}`);
      const toggleInput = categoryEl?.querySelector('.category-toggle input') as HTMLInputElement | null;

      if (categoryEl) {
        if (isEnabled) {
          categoryEl.classList.remove('disabled');
        } else {
          categoryEl.classList.add('disabled');
        }
      }
      if (toggleInput) {
        toggleInput.checked = isEnabled;
      }
    });
  }

  // Get selected weapons only from enabled categories (excludes "Empty")
  getSelectedWeapons(): string[] {
    const weapons: string[] = [];
    this.categorySlots.forEach((slots, category) => {
      if (this.enabledCategories.has(category)) {
        slots.forEach(slot => {
          if (slot.isEnabled && slot.dropdown) {
            const value = slot.dropdown.getValue();
            if (value && value !== 'Empty') weapons.push(value);
          }
        });
      }
    });
    return weapons;
  }

  // Get all selected weapons (regardless of category enabled state) for saving
  getAllSelectedWeapons(): string[] {
    const weapons: string[] = [];
    this.categorySlots.forEach(slots => {
      slots.forEach(slot => {
        if (slot.dropdown) {
          weapons.push(slot.dropdown.getValue() || '');
        }
      });
    });
    return weapons;
  }

  onChange(callback: () => void) { this.onChangeCallback = callback; }

  // Get enabled weapons grouped by hardpoint for weapon effectiveness display
  getEnabledWeaponsGroupedByHardpoint(): { hardpointLabel: string; weaponName: string; count: number; category: string }[] {
    const groups: Map<string, { weaponName: string; count: number; category: string }> = new Map();

    this.categorySlots.forEach((slots, category) => {
      if (!this.enabledCategories.has(category)) return;

      slots.forEach(slot => {
        if (!slot.isEnabled || !slot.dropdown) return;

        const weaponName = slot.dropdown.getValue();
        if (!weaponName || weaponName === 'Empty') return;

        // Use mount_name if available, otherwise port_name
        const hardpointLabel = slot.hardpoint.mount_name || slot.hardpoint.port_name;

        // Create unique key for (hardpoint, weapon) combo
        const key = `${hardpointLabel}::${weaponName}`;

        const existing = groups.get(key);
        if (existing) {
          existing.count++;
        } else {
          groups.set(key, { weaponName, count: 1, category });
        }
      });
    });

    return Array.from(groups.entries()).map(([key, data]) => ({
      hardpointLabel: key.split('::')[0],
      weaponName: data.weaponName,
      count: data.count,
      category: data.category,
    }));
  }

  // Get ALL weapons grouped by hardpoint (including disabled) with enabled state
  getAllWeaponsGroupedByHardpoint(): { hardpointLabel: string; weaponName: string; count: number; category: string; isEnabled: boolean }[] {
    const groups: Map<string, { weaponName: string; count: number; category: string; isEnabled: boolean; minSlotIndex: number }> = new Map();

    this.categorySlots.forEach((slots, category) => {
      const categoryEnabled = this.enabledCategories.has(category);

      slots.forEach(slot => {
        if (!slot.dropdown) return;

        const weaponName = slot.dropdown.getValue();
        if (!weaponName || weaponName === 'Empty') return;

        // Use mount_name if available, otherwise port_name
        const hardpointLabel = slot.hardpoint.mount_name || slot.hardpoint.port_name;

        // Weapon is enabled only if category is enabled AND slot is enabled
        const isEnabled = categoryEnabled && slot.isEnabled;

        // Create unique key for (hardpoint, weapon, enabled) combo
        // Separate enabled and disabled so they show separately
        const key = `${hardpointLabel}::${weaponName}::${isEnabled}`;

        const existing = groups.get(key);
        if (existing) {
          existing.count++;
          // Track minimum slot index to preserve visual order
          existing.minSlotIndex = Math.min(existing.minSlotIndex, slot.slotIndex);
        } else {
          groups.set(key, { weaponName, count: 1, category, isEnabled, minSlotIndex: slot.slotIndex });
        }
      });
    });

    // Sort by slot index to match attacker weapons panel order
    const result = Array.from(groups.entries()).map(([key, data]) => {
      const parts = key.split('::');
      return {
        hardpointLabel: parts[0],
        weaponName: data.weaponName,
        count: data.count,
        category: data.category,
        isEnabled: data.isEnabled,
        minSlotIndex: data.minSlotIndex,
      };
    });

    // Sort by slot index (visual order) instead of alphabetically
    // This ensures Weapon Effectiveness section matches the Attacker Weapons panel order
    result.sort((a, b) => a.minSlotIndex - b.minSlotIndex);

    return result;
  }

  getTotalDps(weapons: Weapon[]): number {
    let total = 0;
    this.categorySlots.forEach((slots, category) => {
      if (this.enabledCategories.has(category)) {
        slots.forEach(slot => {
          if (slot.dropdown) {
            const weaponName = slot.dropdown.getValue();
            const weapon = weapons.find(w => w.display_name === weaponName);
            if (weapon) {
              // Each slot represents one weapon (sub-ports are now individual slots)
              total += weapon.sustained_dps;
            }
          }
        });
      }
    });
    return total;
  }

  getPowerDraw(weapons: Weapon[]): number {
    let total = 0;
    this.categorySlots.forEach((slots, category) => {
      if (this.enabledCategories.has(category)) {
        slots.forEach(slot => {
          if (slot.dropdown) {
            const weaponName = slot.dropdown.getValue();
            const weapon = weapons.find(w => w.display_name === weaponName);
            if (weapon) {
              // Each slot represents one weapon (sub-ports are now individual slots)
              total += weapon.power_consumption || 0;
            }
          }
        });
      }
    });
    return total;
  }

  getDamageTypes(weapons: Weapon[]): string[] {
    const types = new Set<string>();
    this.getSelectedWeapons().forEach(name => {
      const weapon = weapons.find(w => w.display_name === name);
      if (weapon) types.add(weapon.damage_type);
    });
    return Array.from(types);
  }

  restoreWeapons(weaponNames: string[]) {
    // Restore weapon selections to slots by global index
    let globalIndex = 0;
    this.categorySlots.forEach(slots => {
      slots.forEach(slot => {
        if (slot.dropdown && weaponNames[globalIndex]) {
          slot.dropdown.setValue(weaponNames[globalIndex]);
        }
        globalIndex++;
      });
    });
  }

  toggleSlotEnabled(globalSlotIndex: number) {
    let found = false;
    this.categorySlots.forEach((slots) => {
      slots.forEach(slot => {
        if (slot.slotIndex === globalSlotIndex) {
          slot.isEnabled = !slot.isEnabled;
          // Update UI - size label has data-slot-index, parent is weapon-slot
          const sizeLabel = document.querySelector(`[data-slot-index="${globalSlotIndex}"]`);
          const slotWrapper = sizeLabel?.closest('.weapon-slot');
          slotWrapper?.classList.toggle('slot-disabled', !slot.isEnabled);
          found = true;
        }
      });
    });
    if (found && this.onChangeCallback) this.onChangeCallback();
  }

  getEnabledSlots(): boolean[] {
    const states: boolean[] = [];
    this.categorySlots.forEach(slots => {
      slots.forEach(slot => {
        states.push(slot.isEnabled);
      });
    });
    return states;
  }

  setEnabledSlots(states: boolean[]) {
    let index = 0;
    this.categorySlots.forEach(slots => {
      slots.forEach(slot => {
        if (index < states.length) {
          slot.isEnabled = states[index];
          const sizeLabel = document.querySelector(`[data-slot-index="${slot.slotIndex}"]`);
          const slotWrapper = sizeLabel?.closest('.weapon-slot');
          if (slotWrapper) {
            slotWrapper.classList.toggle('slot-disabled', !slot.isEnabled);
          }
        }
        index++;
      });
    });
  }
}

// Fleet preset manager
class FleetPresetManager {
  private presets: FleetPreset[] = [];
  private onChangeCallback: (() => void) | null = null;

  async loadPresets(): Promise<FleetPreset[]> {
    try {
      const presets = await invoke<FleetPreset[]>("load_fleet_presets");
      this.presets = presets || [];
      return this.presets;
    } catch (e) {
      console.warn("Failed to load fleet presets:", e);
      return [];
    }
  }

  async savePreset(preset: FleetPreset): Promise<void> {
    try {
      await invoke("save_fleet_preset", { preset });
      await this.loadPresets();
      if (this.onChangeCallback) this.onChangeCallback();
    } catch (e) {
      console.error("Failed to save fleet preset:", e);
      throw e;
    }
  }

  async deletePreset(presetId: string): Promise<void> {
    try {
      await invoke("delete_fleet_preset", { presetId });
      await this.loadPresets();
      if (this.onChangeCallback) this.onChangeCallback();
    } catch (e) {
      console.error("Failed to delete fleet preset:", e);
      throw e;
    }
  }

  getPresets(): FleetPreset[] {
    return this.presets;
  }

  getPresetById(id: string): FleetPreset | undefined {
    return this.presets.find(p => p.id === id);
  }

  createPreset(name: string, shipName: string, weapons: string[], shield: string, enabledCategories: string[]): FleetPreset {
    return {
      id: `preset_${Date.now()}`,
      name,
      shipName,
      weapons,
      shield,
      enabledCategories,
      createdAt: new Date().toISOString(),
    };
  }

  onChange(callback: () => void) {
    this.onChangeCallback = callback;
  }
}

// DOM Elements
let attackerShipDropdown: SearchableDropdown;
let targetShipDropdown: SearchableDropdown;
let shieldDropdown: SearchableDropdown;
let scenarioDropdown: SearchableDropdown;
let mountTypeDropdown: SearchableDropdown;
let fireModeDropdown: SearchableDropdown;
let targetZoneDropdown: SearchableDropdown;
let weaponPowerDropdown: SearchableDropdown;
let weaponSlotManager: WeaponSlotManager;
let fleetPresetManager: FleetPresetManager;

const attackerHardpointsEl = document.getElementById("attacker-hardpoints") as HTMLElement;
const statsInfoEl = document.getElementById("stats-info") as HTMLElement;
const ttkValueEl = document.getElementById("ttk-value") as HTMLElement;
const effectiveDpsEl = document.getElementById("effective-dps") as HTMLElement;
const totalRawDpsEl = document.getElementById("total-raw-dps") as HTMLElement;
const accuracyPctEl = document.getElementById("accuracy-pct") as HTMLElement;
const damageTypesEl = document.getElementById("damage-types") as HTMLElement;
const powerDrawEl = document.getElementById("power-draw") as HTMLElement;
const shieldHpEl = document.getElementById("shield-hp") as HTMLElement;
const shieldDetailEl = document.getElementById("shield-detail") as HTMLElement;
const hullHpEl = document.getElementById("hull-hp") as HTMLElement;
const armorHpEl = document.getElementById("armor-hp") as HTMLElement;
const thrusterHpEl = document.getElementById("thruster-hp") as HTMLElement;
const powerplantHpEl = document.getElementById("powerplant-hp") as HTMLElement;
const coolerHpEl = document.getElementById("cooler-hp") as HTMLElement;
const shieldGenHpEl = document.getElementById("shield-gen-hp") as HTMLElement;
const qdHpEl = document.getElementById("qd-hp") as HTMLElement;
const componentsSectionEl = document.getElementById("components-section") as HTMLElement;
const timelineShieldEl = document.getElementById("timeline-shield") as HTMLElement;
const timelineArmorEl = document.getElementById("timeline-armor") as HTMLElement;
const timelineHullEl = document.getElementById("timeline-hull") as HTMLElement;
const timelineShieldTimeEl = document.getElementById("timeline-shield-time") as HTMLElement;
const timelineArmorTimeEl = document.getElementById("timeline-armor-time") as HTMLElement;
const timelineHullTimeEl = document.getElementById("timeline-hull-time") as HTMLElement;
const shieldBarEl = document.getElementById("shield-bar") as HTMLElement;
const hullBarEl = document.getElementById("hull-bar") as HTMLElement;
const armorBarEl = document.getElementById("armor-bar") as HTMLElement;

// Settings elements
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsModal = document.getElementById("settings-modal") as HTMLElement;
const settingsClose = document.getElementById("settings-close") as HTMLButtonElement;

// Data cache
let allWeapons: Weapon[] = [];
let allShields: Shield[] = [];
let allMissiles: Missile[] = [];
let currentAttackerShip: Ship | null = null;
let currentTargetShip: Ship | null = null;

const maxValues = { hull: 100000, armor: 50000, shield: 50000 };

function formatNumber(num: number): string { return num.toLocaleString(); }

// Format technical hardpoint names to user-friendly labels
// e.g., "rsi_polaris_turret_front" → "Front Turret"
// e.g., "entityclassdefinition.mount_gimbal_s2" → "Gimbal S2"
function formatHardpointLabel(rawLabel: string): string {
  if (!rawLabel) return "";

  let label = rawLabel.toLowerCase();

  // Strip common technical prefixes
  label = label.replace(/^entityclassdefinition\./i, '');
  label = label.replace(/^mount_/i, '');

  // Common manufacturer/ship prefixes to strip
  const prefixPatterns = [
    /^[a-z]{3,4}_[a-z0-9_]+?_(turret|gun|pdc|missile|weapon|hardpoint)/i,
    /^[a-z]{3,4}_[a-z0-9]+_/i,  // Generic manufacturer_model_ prefix
  ];

  // Try to strip manufacturer/ship prefix
  for (const pattern of prefixPatterns) {
    const match = label.match(pattern);
    if (match) {
      // Keep the matched type word if present
      const typeMatch = match[0].match(/(turret|gun|pdc|missile|weapon|hardpoint)/i);
      if (typeMatch) {
        label = label.slice(match.index! + match[0].length - typeMatch[0].length);
      } else {
        label = label.slice(match.index! + match[0].length);
      }
      break;
    }
  }

  // Replace underscores with spaces
  label = label.replace(/_/g, ' ').trim();

  // Position words to recognize
  const positions = ['front', 'rear', 'back', 'left', 'right', 'top', 'bottom', 'upper', 'lower',
                     'center', 'centre', 'side', 'inner', 'outer', 'forward', 'aft', 'port', 'starboard',
                     'nose', 'tail', 'wing', 'dorsal', 'ventral'];

  // Type words to recognize
  const types = ['turret', 'gun', 'pdc', 'missile', 'torpedo', 'weapon', 'hardpoint', 'ball', 'chin', 'remote', 'gimbal', 'fixed'];

  // Split into words
  const words = label.split(/\s+/).filter(w => w.length > 0);

  // Categorize words
  const positionWords: string[] = [];
  const typeWords: string[] = [];
  const otherWords: string[] = [];

  for (const word of words) {
    if (positions.includes(word)) {
      positionWords.push(word);
    } else if (types.includes(word)) {
      typeWords.push(word);
    } else if (!/^\d+$/.test(word)) {  // Skip pure numbers
      otherWords.push(word);
    }
  }

  // Build readable label: [Position] [Other] [Type]
  const parts: string[] = [];

  // Add position words
  if (positionWords.length > 0) {
    parts.push(...positionWords);
  }

  // Add other descriptive words
  if (otherWords.length > 0) {
    parts.push(...otherWords);
  }

  // Add type words (default to "Turret" if no type found)
  if (typeWords.length > 0) {
    parts.push(...typeWords);
  } else if (parts.length > 0) {
    parts.push('turret');  // Default type
  }

  // Title case each word
  const formatted = parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // If we couldn't parse anything meaningful, return a cleaned version of the original
  if (!formatted) {
    return rawLabel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return formatted;
}

function formatTime(seconds: number): string {
  // Handle null/undefined (from JSON infinity serialization) and non-finite values
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return "∞";
  if (seconds < 0.1) return "<0.1";

  // Under 60 seconds: show decimal seconds
  if (seconds < 60) {
    return seconds.toFixed(1);
  }

  // Under 1 hour: show minutes and seconds
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  // 1 hour or more: show hours and minutes
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// Animated value update with pulse effect
const animatedValues: Map<HTMLElement, { current: number; target: number; animating: boolean }> = new Map();

function animateValue(element: HTMLElement, newValue: number, formatter: (n: number) => string, duration: number = 300) {
  const state = animatedValues.get(element) || { current: 0, target: 0, animating: false };
  const oldValue = state.current;

  // Skip animation if value hasn't changed significantly
  if (Math.abs(newValue - oldValue) < 0.01) {
    element.textContent = formatter(newValue);
    return;
  }

  state.target = newValue;
  animatedValues.set(element, state);

  // Add pulse animation class
  element.classList.add('value-changed');
  setTimeout(() => element.classList.remove('value-changed'), 400);

  // If already animating, just update target
  if (state.animating) return;

  state.animating = true;
  const startValue = oldValue;
  const startTime = performance.now();

  function update(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentValue = startValue + (state.target - startValue) * eased;
    state.current = currentValue;
    element.textContent = formatter(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      state.current = state.target;
      state.animating = false;
      element.textContent = formatter(state.target);
    }
  }

  requestAnimationFrame(update);
}

function animateTextValue(element: HTMLElement, newText: string) {
  if (element.textContent === newText) return;

  element.classList.add('value-changed');
  element.textContent = newText;
  setTimeout(() => element.classList.remove('value-changed'), 400);
}

// Calculate effective accuracy based on scenario, mount type, and time on target
// This represents the percentage of raw DPS that actually lands on target
function getHitRate(): number {
  const scenario = scenarioDropdown.getValue() || "dogfight";
  const mountType = mountTypeDropdown.getValue() || "Gimballed";
  const scenarioMod = SCENARIO_MODIFIERS[scenario] || SCENARIO_MODIFIERS["dogfight"];
  const mountAccuracy = MOUNT_TYPE_ACCURACY[mountType] || 0.75;
  // Include time on target in the displayed accuracy
  return Math.min(scenarioMod.accuracy * mountAccuracy * scenarioMod.tot, 1);
}

// Get time-on-target from scenario (separate from hit rate)
function getTimeOnTarget(): number {
  const scenario = scenarioDropdown.getValue() || "dogfight";
  const scenarioMod = SCENARIO_MODIFIERS[scenario] || SCENARIO_MODIFIERS["dogfight"];
  return scenarioMod.tot;
}

// Get fire mode DPS modifier
function getFireModeMod(): number {
  const fireMode = fireModeDropdown.getValue() || "sustained";
  return FIRE_MODE_DPS_MOD[fireMode] || 1.0;
}

// Get power level multiplier
function getPowerMultiplier(): number {
  const powerLevel = weaponPowerDropdown.getValue() || "0.33";
  return POWER_LEVEL_MULTIPLIER[powerLevel] || 1.0;
}

// Get zone modifiers
function getZoneModifiers(): { hull: number; armor: number; thruster: number; component: number } {
  const zone = targetZoneDropdown.getValue() || "center-mass";
  return ZONE_MODIFIERS[zone] || ZONE_MODIFIERS["center-mass"];
}

function updateBars() {
  if (!currentTargetShip) return;
  const selectedShield = allShields.find(s => s.display_name === shieldDropdown.getValue());
  const shieldCount = currentTargetShip.shield_count || 1;
  const activeShields = Math.min(shieldCount, 2);  // Rule of Two
  const totalShieldHp = (selectedShield?.max_hp || 0) * activeShields;
  shieldBarEl.style.width = `${Math.min(100, (totalShieldHp / maxValues.shield) * 100)}%`;
  hullBarEl.style.width = `${Math.min(100, (currentTargetShip.hull_hp / maxValues.hull) * 100)}%`;
  armorBarEl.style.width = `${Math.min(100, (currentTargetShip.armor_hp / maxValues.armor) * 100)}%`;
}

function updateTimeline(shieldTime: number, armorTime: number, hullTime: number, shieldsBreakable?: boolean) {
  // Use shields_breakable flag if available, otherwise fall back to old logic
  const isInfinite = (shieldsBreakable !== undefined && !shieldsBreakable) || shieldTime === null || !isFinite(shieldTime);
  const safeShield = isInfinite ? 0 : shieldTime;
  const safeArmor = armorTime ?? 0;
  const safeHull = hullTime ?? 0;

  const total = safeShield + safeArmor + safeHull || 1;

  // If shields are infinite, show shield bar as full width
  if (isInfinite) {
    timelineShieldEl.style.flex = "1";
    timelineArmorEl.style.flex = "0.1";
    timelineHullEl.style.flex = "0.1";
  } else {
    timelineShieldEl.style.flex = String(Math.max(0.1, safeShield / total));
    timelineArmorEl.style.flex = String(Math.max(0.1, safeArmor / total));
    timelineHullEl.style.flex = String(Math.max(0.1, safeHull / total));
  }

  timelineShieldTimeEl.textContent = `${formatTime(shieldTime)}s`;
  timelineArmorTimeEl.textContent = `${formatTime(armorTime)}s`;
  timelineHullTimeEl.textContent = `${formatTime(hullTime)}s`;
}

async function loadShips() {
  try {
    const shipNames: string[] = await invoke("get_ships");
    const shipOptions = shipNames.map(name => ({ value: name, label: name }));
    attackerShipDropdown.setOptions(shipOptions);
    targetShipDropdown.setOptions(shipOptions);
    if (shipNames.length > 0) {
      attackerShipDropdown.setValue(shipNames[0]);
      targetShipDropdown.setValue(shipNames[0]);
      await updateAttackerShip(shipNames[0]);
      await updateTargetShip(shipNames[0]);
    }
  } catch (e) { console.error("Failed to load ships:", e); }
}

async function loadWeapons() {
  try {
    allWeapons = await invoke("get_weapons");
    console.log("loadWeapons: received", allWeapons.length, "weapons");
    if (allWeapons.length > 0) {
      console.log("Sample weapon:", JSON.stringify(allWeapons[0]));
    }
    await weaponSlotManager.setWeapons(allWeapons);
  } catch (e) { console.error("Failed to load weapons:", e); }
}

async function loadShields() {
  try {
    allShields = await invoke("get_shields");
  } catch (e) { console.error("Failed to load shields:", e); }
}

async function loadMissiles() {
  try {
    allMissiles = await invoke("get_missiles");
    console.log("loadMissiles: received", allMissiles.length, "missiles");
  } catch (e) { console.error("Failed to load missiles:", e); }
}

function updateShieldOptions() {
  if (!currentTargetShip) {
    shieldDropdown.setOptions([{ value: "", label: "No Shield" }]);
    return;
  }
  const maxSize = currentTargetShip.max_shield_size;
  const validShields = allShields.filter(s => s.size <= maxSize && s.size > 0);
  const options = [
    { value: "", label: "No Shield" },
    ...validShields.map(s => ({ value: s.display_name, label: `${s.display_name} (S${s.size} - ${formatNumber(Math.round(s.max_hp))} HP)` }))
  ];
  shieldDropdown.setOptions(options);
  const currentValue = shieldDropdown.getValue();
  if (currentValue && !validShields.find(s => s.display_name === currentValue)) shieldDropdown.setValue("");
}

async function loadStats() {
  try {
    const stats: Stats = await invoke("get_stats");
    statsInfoEl.textContent = `${stats.ship_count} ships | ${stats.weapon_count} weapons | ${stats.shield_count} shields`;
  } catch (e) {
    console.error("Failed to load stats:", e);
    statsInfoEl.textContent = "Failed to load data";
  }
}

async function updateAttackerShip(name: string) {
  try {
    console.log("updateAttackerShip called with name:", name);
    currentAttackerShip = await invoke("get_ship", { name });
    console.log("get_ship returned:", currentAttackerShip ? {
      display_name: currentAttackerShip.display_name,
      pilot_weapon_count: currentAttackerShip.pilot_weapon_count,
      pilot_weapon_sizes: currentAttackerShip.pilot_weapon_sizes,
      weapon_hardpoints: currentAttackerShip.weapon_hardpoints?.length || 0,
    } : "null");
    if (currentAttackerShip) {
      // Update hardpoints summary display
      const totalHardpoints = currentAttackerShip.weapon_hardpoints?.length || 0;
      attackerHardpointsEl.textContent = `${totalHardpoints} hardpoints`;

      // Use detailed hardpoints if available, otherwise fall back to legacy sizes
      if (currentAttackerShip.weapon_hardpoints && currentAttackerShip.weapon_hardpoints.length > 0) {
        weaponSlotManager.updateSlotsFromHardpoints(currentAttackerShip.weapon_hardpoints);
      } else if (currentAttackerShip.pilot_weapon_sizes) {
        weaponSlotManager.updateSlots(currentAttackerShip.pilot_weapon_sizes);
      } else {
        weaponSlotManager.updateSlotsFromHardpoints([]);
      }
    }
  } catch (e) { console.error("Failed to get attacker ship:", e); }
}

async function updateTargetShip(name: string) {
  try {
    currentTargetShip = await invoke("get_ship", { name });
    if (currentTargetShip) {
      hullHpEl.textContent = formatNumber(currentTargetShip.hull_hp);
      armorHpEl.textContent = formatNumber(currentTargetShip.armor_hp);
      thrusterHpEl.textContent = formatNumber(currentTargetShip.thruster_total_hp);
      powerplantHpEl.textContent = formatNumber(currentTargetShip.powerplant_total_hp);
      coolerHpEl.textContent = formatNumber(currentTargetShip.cooler_total_hp);
      shieldGenHpEl.textContent = formatNumber(currentTargetShip.shield_gen_total_hp);
      qdHpEl.textContent = formatNumber(currentTargetShip.qd_total_hp);

      // Hide components section if no component data is available
      const hasComponentData = currentTargetShip.thruster_total_hp > 0
        || currentTargetShip.powerplant_total_hp > 0
        || currentTargetShip.cooler_total_hp > 0
        || currentTargetShip.shield_gen_total_hp > 0
        || currentTargetShip.qd_total_hp > 0;
      componentsSectionEl.style.display = hasComponentData ? '' : 'none';

      updateShieldOptions();

      // Auto-select default shield if ship has one
      if (currentTargetShip.default_shield_ref) {
        const defaultShield = allShields.find(s =>
          s.internal_name.toLowerCase() === currentTargetShip!.default_shield_ref.toLowerCase()
        );
        if (defaultShield) {
          shieldDropdown.setValue(defaultShield.display_name);
        }
      }

      updateBars();
    }
    calculateTTK();
  } catch (e) { console.error("Failed to get target ship:", e); }
}

function updateLoadoutSummary() {
  const totalDps = weaponSlotManager.getTotalDps(allWeapons);
  const hitRate = getHitRate();
  const damageTypes = weaponSlotManager.getDamageTypes(allWeapons);
  const powerDraw = weaponSlotManager.getPowerDraw(allWeapons);

  animateValue(totalRawDpsEl, Math.round(totalDps), (n) => formatNumber(Math.round(n)));
  animateTextValue(accuracyPctEl, `${Math.round(hitRate * 100)}%`);
  animateTextValue(damageTypesEl, damageTypes.length > 0 ? damageTypes.join(", ") : "--");
  animateTextValue(powerDrawEl, powerDraw > 0 ? `${formatNumber(Math.round(powerDraw))} pwr/s` : "--");
}

function updateWeaponBreakdown(
  weaponBreakdown: WeaponEffectiveness[],
  missileBreakdown: MissileEffectiveness[],
  shieldsBreakable: boolean
) {
  const container = document.getElementById('weapon-breakdown');
  if (!container) return;

  // Get ALL weapons including disabled ones
  const allWeapons = weaponSlotManager?.getAllWeaponsGroupedByHardpoint() || [];

  // If no weapons at all (even disabled), hide section
  if (allWeapons.length === 0 && missileBreakdown.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  let html = `<div class="section-title">WEAPON EFFECTIVENESS</div>`;

  // Display all weapons (including disabled ones)
  // First, create a map of backend effectiveness data keyed by hardpoint::weapon
  const effectivenessMap = new Map<string, WeaponEffectiveness>();
  weaponBreakdown.forEach(w => {
    const key = `${w.hardpoint_label || ''}::${w.weapon_name}`;
    effectivenessMap.set(key, w);
  });

  // Now iterate over enabled weapons only
  allWeapons.forEach(weaponInfo => {
    // Skip disabled weapons - the count (×3 vs ×4) already reflects what's enabled
    if (!weaponInfo.isEnabled) return;

    // Skip missiles/torpedoes/bombs - they're handled separately in missileBreakdown loop
    if (weaponInfo.category === 'missile' || weaponInfo.category === 'torpedo' || weaponInfo.category === 'bomb') {
      return;
    }

    const key = `${weaponInfo.hardpointLabel}::${weaponInfo.weaponName}`;
    const w = effectivenessMap.get(key);

    const formattedHardpoint = formatHardpointLabel(weaponInfo.hardpointLabel);
    const displayLabel = formattedHardpoint
      ? `${formattedHardpoint}: ${weaponInfo.weaponName}`
      : weaponInfo.weaponName;
    const countSuffix = weaponInfo.count > 1 ? ` ×${weaponInfo.count}` : '';

    if (w) {
      // Enabled weapon with effectiveness data from backend
      const badgeClass = w.is_effective ? 'effective' : 'ineffective';
      const badgeText = w.is_effective ? 'EFFECTIVE' : 'INEFFECTIVE';

      const isCollapsible = !w.is_effective;
      const collapsedClass = isCollapsible ? 'collapsed' : '';

      html += `
        <div class="weapon-breakdown-item ${badgeClass} ${collapsedClass}" ${isCollapsible ? 'data-collapsible="true"' : ''}>
          <div class="weapon-breakdown-header">
            ${isCollapsible ? '<span class="expand-indicator"></span>' : ''}
            <span class="weapon-breakdown-name">${displayLabel}${countSuffix}</span>
            <span class="weapon-breakdown-type">${w.damage_type}</span>
            <span class="effectiveness-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="weapon-breakdown-content">
            <div class="weapon-breakdown-stats">
              <div class="breakdown-stat">
                <span class="breakdown-label">Shield</span>
                <span class="breakdown-value">${Math.round(w.shield_dps)} DPS absorbed${w.passthrough_dps > 0 ? `, ${Math.round(w.passthrough_dps)} DPS passthrough` : ''}</span>
              </div>
              <div class="breakdown-stat">
                <span class="breakdown-label">Armor</span>
                <span class="breakdown-value">${Math.round(w.armor_dps)} DPS</span>
              </div>
              <div class="breakdown-stat">
                <span class="breakdown-label">Hull</span>
                <span class="breakdown-value">${Math.round(w.hull_dps)} DPS</span>
              </div>
              <div class="breakdown-stat solo-ttk">
                <span class="breakdown-label">Solo TTK</span>
                <span class="breakdown-value">${formatTime(w.solo_ttk)}</span>
              </div>
              ${w.ineffective_reason ? `<div class="breakdown-reason">${w.ineffective_reason}</div>` : ''}
            </div>
            ${w.shield_time !== undefined ? `
            <div class="weapon-mini-timeline">
              <div class="mini-timeline-bar">
                <div class="mini-segment shield" style="flex: ${!isFinite(w.shield_time) ? 1 : Math.max(0.05, w.shield_time / (w.shield_time + w.armor_time + w.hull_time || 1))}">
                  <span class="mini-time">${formatTime(w.shield_time)}</span>
                </div>
                ${isFinite(w.shield_time) ? `
                <div class="mini-segment armor" style="flex: ${Math.max(0.05, w.armor_time / (w.shield_time + w.armor_time + w.hull_time || 1))}">
                  <span class="mini-time">${formatTime(w.armor_time)}</span>
                </div>
                <div class="mini-segment hull" style="flex: ${Math.max(0.05, w.hull_time / (w.shield_time + w.armor_time + w.hull_time || 1))}">
                  <span class="mini-time">${formatTime(w.hull_time)}</span>
                </div>
                ` : ''}
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      // Enabled weapon but no effectiveness data from backend (e.g., missiles or backend error)
      // Show as active with minimal info
      html += `
        <div class="weapon-breakdown-item effective collapsed" data-collapsible="true">
          <div class="weapon-breakdown-header">
            <span class="expand-indicator"></span>
            <span class="weapon-breakdown-name">${displayLabel}${countSuffix}</span>
            <span class="weapon-breakdown-type">--</span>
            <span class="effectiveness-badge effective">ACTIVE</span>
          </div>
          <div class="weapon-breakdown-content">
            <div class="weapon-breakdown-stats">
              <div class="breakdown-reason">Contributing to TTK calculation</div>
            </div>
          </div>
        </div>
      `;
    }
  });

  // Display missiles
  missileBreakdown.forEach(m => {
    const badgeClass = m.is_effective ? 'effective' : 'ineffective';
    const badgeText = m.is_effective ? 'EFFECTIVE' : 'INEFFECTIVE';
    const countSuffix = m.count > 1 ? ` ×${m.count}` : '';
    const formattedHardpoint = m.hardpoint_label ? formatHardpointLabel(m.hardpoint_label) : null;
    const displayLabel = formattedHardpoint
      ? `${formattedHardpoint}: ${m.missile_name}`
      : m.missile_name;

    const isCollapsible = !m.is_effective;
    const collapsedClass = isCollapsible ? 'collapsed' : '';

    html += `
      <div class="weapon-breakdown-item ${badgeClass} ${collapsedClass}" ${isCollapsible ? 'data-collapsible="true"' : ''}>
        <div class="weapon-breakdown-header">
          ${isCollapsible ? '<span class="expand-indicator"></span>' : ''}
          <span class="weapon-breakdown-name">${displayLabel}${countSuffix}</span>
          <span class="weapon-breakdown-type">${m.damage_type} • BURST</span>
          <span class="effectiveness-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="weapon-breakdown-content">
          <div class="weapon-breakdown-stats">
            <div class="breakdown-stat">
              <span class="breakdown-label">Total Damage</span>
              <span class="breakdown-value">${formatNumber(Math.round(m.total_damage))}</span>
            </div>
            <div class="breakdown-stat">
              <span class="breakdown-label">Shield</span>
              <span class="breakdown-value">${formatNumber(Math.round(m.shield_damage))} absorbed${m.passthrough_damage > 0 ? `, ${formatNumber(Math.round(m.passthrough_damage))} passthrough` : ''}</span>
            </div>
            <div class="breakdown-stat">
              <span class="breakdown-label">Armor</span>
              <span class="breakdown-value">${formatNumber(Math.round(m.armor_damage))}</span>
            </div>
            <div class="breakdown-stat">
              <span class="breakdown-label">Hull</span>
              <span class="breakdown-value">${formatNumber(Math.round(m.hull_damage))}</span>
            </div>
            ${m.ineffective_reason ? `<div class="breakdown-reason">${m.ineffective_reason}</div>` : ''}
          </div>
          <div class="missile-damage-timeline">
            <div class="damage-bar">
              <div class="damage-segment shield" style="flex: ${Math.max(0.05, m.shield_damage / (m.shield_damage + m.armor_damage + m.hull_damage || 1))}">
                <span class="damage-label">${formatNumber(Math.round(m.shield_damage))}</span>
              </div>
              <div class="damage-segment armor" style="flex: ${Math.max(0.05, m.armor_damage / (m.shield_damage + m.armor_damage + m.hull_damage || 1))}">
                <span class="damage-label">${formatNumber(Math.round(m.armor_damage))}</span>
              </div>
              <div class="damage-segment hull" style="flex: ${Math.max(0.05, m.hull_damage / (m.shield_damage + m.armor_damage + m.hull_damage || 1))}">
                <span class="damage-label">${formatNumber(Math.round(m.hull_damage))}</span>
              </div>
            </div>
            <div class="time-saved">
              Saves <span class="time-saved-value">${formatTime(m.time_saved)}</span> off TTK
            </div>
          </div>
        </div>
      </div>
    `;
  });

  // Add insight based on effectiveness
  const ineffectiveCount = weaponBreakdown.filter(w => !w.is_effective).length;
  const effectiveCount = weaponBreakdown.filter(w => w.is_effective).length;
  const hasBallisticEffective = weaponBreakdown.some(w => w.is_effective && w.damage_type === 'Ballistic');
  const hasEnergyEffective = weaponBreakdown.some(w => w.is_effective && w.damage_type === 'Energy');

  if (!shieldsBreakable && hasBallisticEffective && !hasEnergyEffective) {
    html += `<div class="weapon-insight">Shields cannot be depleted. Only ballistic passthrough contributes damage.</div>`;
  } else if (ineffectiveCount > 0 && effectiveCount > 0) {
    if (hasBallisticEffective && !hasEnergyEffective) {
      html += `<div class="weapon-insight">Only ballistic weapons contribute damage. Consider all-ballistic loadout for capital ships.</div>`;
    }
  } else if (ineffectiveCount === weaponBreakdown.length && weaponBreakdown.length > 0) {
    html += `<div class="weapon-insight warning">No weapons can overcome shield regeneration. Target is effectively invulnerable to this loadout.</div>`;
  }

  container.innerHTML = html;

  // Add click handlers for collapsible items
  container.querySelectorAll('[data-collapsible="true"]').forEach(item => {
    const header = item.querySelector('.weapon-breakdown-header');
    if (header) {
      header.addEventListener('click', () => {
        item.classList.toggle('collapsed');
      });
    }
  });
}

async function calculateTTK() {
  updateLoadoutSummary();

  if (!currentAttackerShip || !currentTargetShip) return;

  // Get equipped weapons from slot manager
  const equippedWeapons = weaponSlotManager?.getAllSelectedWeapons() || [];
  if (equippedWeapons.length === 0 || equippedWeapons.every(w => !w)) {
    // No weapons equipped - show zeros
    animateTextValue(ttkValueEl, "∞");
    animateValue(effectiveDpsEl, 0, (n) => formatNumber(Math.round(n)));
    updateTimeline(0, 0, 0);
    updateWeaponBreakdown([], [], true);  // Update breakdown to show all weapons as disabled
    return;
  }

  // Build weapon names and counts grouped by hardpoint
  const hardpointGroups = weaponSlotManager?.getEnabledWeaponsGroupedByHardpoint() || [];
  const weaponEntries: { hardpointLabel: string; weaponName: string; count: number }[] = [];
  const missileEntries: { hardpointLabel: string; missileName: string; count: number }[] = [];

  for (const group of hardpointGroups) {
    const isWeapon = allWeapons.some(w => w.display_name === group.weaponName);
    const isMissile = allMissiles.some(m => m.display_name === group.weaponName);

    if (isWeapon) {
      weaponEntries.push({
        hardpointLabel: group.hardpointLabel,
        weaponName: group.weaponName,
        count: group.count,
      });
    } else if (isMissile) {
      missileEntries.push({
        hardpointLabel: group.hardpointLabel,
        missileName: group.weaponName,
        count: group.count,
      });
    }
  }

  // Prepare arrays for backend call - include hardpoint label in weapon name
  const weaponNames = weaponEntries.map(e => `${e.hardpointLabel}::${e.weaponName}`);
  const weaponCounts = weaponEntries.map(e => e.count);
  const missileNames = missileEntries.map(e => `${e.hardpointLabel}::${e.missileName}`);
  const missileCounts = missileEntries.map(e => e.count);

  // If all enabled weapons are empty, show infinity TTK
  if (weaponNames.length === 0 && missileNames.length === 0) {
    animateTextValue(ttkValueEl, "∞");
    animateValue(effectiveDpsEl, 0, (n) => formatNumber(Math.round(n)));
    updateTimeline(0, 0, 0);
    updateWeaponBreakdown([], [], true);  // Update breakdown to show all weapons as disabled
    return;
  }

  // Get shield - dropdown value is display_name, but backend needs internal_name
  const selectedShieldDisplayName = shieldDropdown.getValue();
  const shieldData = allShields.find(s => s.display_name === selectedShieldDisplayName);
  const selectedShieldName = shieldData?.internal_name || null;

  // Get scenario modifiers
  const mountAccuracy = getMountAccuracy();
  const scenarioMod = getScenarioModifiers();
  const fireModeMod = getFireModeMod();
  const powerMult = getPowerMultiplier();
  const zoneMod = getZoneModifiers();

  try {
    // Call backend for 4.5 damage model calculation
    const result = await invoke<TTKResult>("calculate_ttk_v2", {
      weaponNames,
      weaponCounts,
      missileNames,
      missileCounts,
      targetShip: currentTargetShip.display_name,
      shieldName: selectedShieldName || null,
      mountAccuracy,
      scenarioAccuracy: scenarioMod.accuracy,
      timeOnTarget: scenarioMod.tot,
      fireMode: fireModeMod,
      powerMultiplier: powerMult,
      zoneHull: zoneMod.hull,
      zoneArmor: zoneMod.armor,
      zoneThruster: zoneMod.thruster,
      zoneComponent: zoneMod.component,
    });

    // Update shield HP display (uses Rule of Two now)
    const shieldCount = currentTargetShip.shield_count || 1;
    const activeShields = Math.min(shieldCount, 2);
    const totalShieldHp = shieldData ? shieldData.max_hp * activeShields : 0;
    shieldHpEl.textContent = shieldData ? formatNumber(Math.round(totalShieldHp)) : "0";

    // Update shield detail (inline display)
    if (shieldData) {
      const regenRate = shieldData.regen || 0;
      const regenDelay = shieldData.damaged_regen_delay || 0;
      const fireMode = fireModeDropdown?.getValue() || "sustained";
      const regenSuppressed = fireMode === "sustained" && regenDelay > 0;
      const regenStatus = regenSuppressed ? "(suppressed)" : "";
      shieldDetailEl.textContent = `${activeShields}/${shieldCount} Shields • ${formatNumber(Math.round(regenRate))} HP/s ${regenStatus}`;
    } else {
      shieldDetailEl.textContent = "";
    }
    updateBars();

    // Animated TTK update
    animateTextValue(ttkValueEl, formatTime(result.total_ttk));
    // Animated DPS counter
    animateValue(effectiveDpsEl, Math.round(result.effective_dps), (n) => formatNumber(Math.round(n)));
    updateTimeline(result.shield_time, result.armor_time, result.hull_time, result.shields_breakable);

    // Always update weapon breakdown - it will show disabled weapons even if backend returns empty
    updateWeaponBreakdown(
      result.weapon_breakdown || [],
      result.missile_breakdown || [],
      result.shields_breakable
    );

  } catch (e) {
    console.error("TTK calculation failed:", e);
    // Fallback to legacy local calculation
    calculateTTKLegacy();
    // Still update weapon breakdown to show disabled state correctly
    updateWeaponBreakdown([], [], true);
  }
}

// Helper to get mount accuracy value
function getMountAccuracy(): number {
  const mountType = mountTypeDropdown?.getValue() || "Gimballed";
  // Map to new accuracy values (slightly different from old MOUNT_TYPE_ACCURACY)
  const accuracyMap: Record<string, number> = {
    "Fixed": 0.60,
    "Gimballed": 0.75,
    "Auto-Gimbal": 0.80,
    "Turret": 0.70,
  };
  return accuracyMap[mountType] || 0.75;
}

// Helper to get scenario modifiers
function getScenarioModifiers(): { accuracy: number; tot: number } {
  const scenario = scenarioDropdown?.getValue() || "dogfight";
  return SCENARIO_MODIFIERS[scenario] || SCENARIO_MODIFIERS["dogfight"];
}

// Legacy local calculation as fallback
function calculateTTKLegacy() {
  if (!currentAttackerShip || !currentTargetShip) return;

  const totalRawDps = weaponSlotManager.getTotalDps(allWeapons);
  const hitRate = getHitRate();
  const fireModeMod = getFireModeMod();
  const timeOnTarget = getTimeOnTarget();
  const powerMult = getPowerMultiplier();
  const zoneMod = getZoneModifiers();

  const effectiveDps = totalRawDps * hitRate * fireModeMod * timeOnTarget * powerMult;

  const selectedShieldDisplayName = shieldDropdown.getValue();
  const shieldData = allShields.find(s => s.display_name === selectedShieldDisplayName);
  const shieldCount = currentTargetShip.shield_count || 1;
  const activeShields = Math.min(shieldCount, 2);  // Rule of Two
  const singleShieldHp = shieldData?.max_hp || 0;
  const singleShieldRegen = shieldData?.regen || 0;
  const totalShieldHp = singleShieldHp * activeShields;
  const totalShieldRegen = singleShieldRegen * activeShields;

  shieldHpEl.textContent = shieldData ? formatNumber(Math.round(totalShieldHp)) : "0";

  // Update shield detail (inline display)
  if (shieldData) {
    shieldDetailEl.textContent = `${activeShields}/${shieldCount} Shields • ${formatNumber(Math.round(singleShieldRegen))} HP/s`;
  } else {
    shieldDetailEl.textContent = "";
  }
  updateBars();

  const netShieldDps = Math.max(0, effectiveDps - totalShieldRegen);
  const shieldTime = netShieldDps > 0 ? totalShieldHp / netShieldDps : (totalShieldHp > 0 ? 9999 : 0);

  const zoneHullHp = currentTargetShip.hull_hp * zoneMod.hull;
  const zoneArmorHp = currentTargetShip.armor_hp * zoneMod.armor;
  const zoneThrusterHp = currentTargetShip.thruster_total_hp * zoneMod.thruster;
  const zoneComponentHp = (currentTargetShip.powerplant_total_hp + currentTargetShip.cooler_total_hp + currentTargetShip.shield_gen_total_hp) * zoneMod.component;

  const armorTime = effectiveDps > 0 ? zoneArmorHp / effectiveDps : 0;
  const hullTime = effectiveDps > 0 ? (zoneHullHp + zoneThrusterHp + zoneComponentHp) / effectiveDps : 0;

  const totalTtk = shieldTime + armorTime + hullTime;

  animateTextValue(ttkValueEl, formatTime(totalTtk));
  animateValue(effectiveDpsEl, Math.round(effectiveDps), (n) => formatNumber(Math.round(n)));
  updateTimeline(shieldTime, armorTime, hullTime);
}

function initStaticDropdowns() {
  scenarioDropdown.setOptions([
    { value: "dogfight", label: "Dogfight" },
    { value: "synthetic", label: "Synthetic Test" },
    { value: "jousting", label: "Jousting" },
    { value: "custom", label: "Custom" },
  ]);
  scenarioDropdown.setValue("dogfight");

  mountTypeDropdown.setOptions([
    { value: "Fixed", label: "Fixed" },
    { value: "Gimballed", label: "Gimballed" },
    { value: "Auto-Gimbal", label: "Auto-Gimbal" },
    { value: "Turret", label: "Turret" },
  ]);
  mountTypeDropdown.setValue("Gimballed");

  fireModeDropdown.setOptions([
    { value: "sustained", label: "Sustained" },
    { value: "burst", label: "Burst" },
    { value: "staggered", label: "Staggered" },
  ]);
  fireModeDropdown.setValue("sustained");

  targetZoneDropdown.setOptions([
    { value: "center-mass", label: "Center Mass" },
    { value: "engines", label: "Engines" },
    { value: "cockpit", label: "Cockpit" },
    { value: "wings", label: "Wings/Extremities" },
    { value: "turrets", label: "Turrets" },
  ]);
  targetZoneDropdown.setValue("center-mass");

  weaponPowerDropdown.setOptions([
    { value: "0", label: "0% (×1.0)" },
    { value: "0.33", label: "33% (×1.0)" },
    { value: "0.5", label: "50% (×1.07)" },
    { value: "0.66", label: "66% (×1.13)" },
    { value: "1", label: "100% (×1.2)" },
  ]);
  weaponPowerDropdown.setValue("0.33");
}

const THEME_LABELS: Record<string, string> = {
  'crusader': 'Crusader Industries (Default)',
  'drake': 'Drake Interplanetary',
  'misc': 'MISC',
  'origin': 'Origin Jumpworks (Light)',
  'aegis': 'Aegis Dynamics (Light)',
};

function setTheme(theme: string, skipSave: boolean = false) {
  currentTheme = theme;

  // Apply theme to document
  if (theme === 'crusader') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Update dropdown display
  const searchInput = document.getElementById('theme-picker-search') as HTMLInputElement;
  const hiddenInput = document.getElementById('theme-picker') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = THEME_LABELS[theme] || theme;
  }
  if (hiddenInput) {
    hiddenInput.value = theme;
  }

  // Update selected state in dropdown
  document.querySelectorAll('#theme-picker-dropdown .select-option').forEach(opt => {
    const optTheme = (opt as HTMLElement).dataset.theme;
    if (optTheme === theme) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });

  if (!skipSave) {
    saveSettings();
  }
}

function initThemePicker() {
  const container = document.getElementById('theme-picker-container');
  const searchInput = document.getElementById('theme-picker-search') as HTMLInputElement;
  const dropdown = document.getElementById('theme-picker-dropdown');

  if (!container || !searchInput || !dropdown) return;

  // Toggle dropdown on input click
  searchInput.addEventListener('click', () => {
    dropdown.classList.toggle('open');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      dropdown.classList.remove('open');
    }
  });

  // Handle option selection
  dropdown.querySelectorAll('.select-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const theme = (opt as HTMLElement).dataset.theme;
      if (theme) {
        setTheme(theme);
        dropdown.classList.remove('open');
      }
    });
  });

  // Set initial theme display (don't save on init)
  setTheme(currentTheme, true);
}

function initSettings() {
  // Settings button
  settingsBtn.addEventListener("click", () => settingsModal.classList.add("open"));
  settingsClose.addEventListener("click", () => settingsModal.classList.remove("open"));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove("open");
  });

  // Initialize theme picker
  initThemePicker();
}

// Initialize About modal
function initAboutModal() {
  const aboutBtn = document.getElementById("about-btn");
  const aboutModal = document.getElementById("about-modal");
  const aboutClose = document.getElementById("about-close");

  if (!aboutBtn || !aboutModal) return;

  aboutBtn.addEventListener("click", () => aboutModal.classList.add("open"));
  aboutClose?.addEventListener("click", () => aboutModal.classList.remove("open"));
  aboutModal.addEventListener("click", (e) => {
    if (e.target === aboutModal) aboutModal.classList.remove("open");
  });
}

// Check GitHub releases API for latest version (fallback for Linux)
async function checkGitHubRelease(currentVersion: string): Promise<{ version: string } | null> {
  try {
    const response = await fetch("https://api.github.com/repos/CapCeph/ship-lens/releases/latest");
    if (!response.ok) return null;

    const release = await response.json();
    const latestVersion = release.tag_name?.replace(/^v/, "") || "";

    // Simple version comparison (works for semver x.y.z)
    if (latestVersion && latestVersion !== currentVersion) {
      // Compare versions
      const current = currentVersion.split(".").map(Number);
      const latest = latestVersion.split(".").map(Number);

      for (let i = 0; i < 3; i++) {
        if ((latest[i] || 0) > (current[i] || 0)) {
          return { version: latestVersion };
        } else if ((latest[i] || 0) < (current[i] || 0)) {
          return null;
        }
      }
    }
    return null;
  } catch (e) {
    console.warn("GitHub release check failed:", e);
    return null;
  }
}

// Initialize Update modal and check for updates
async function checkForUpdates(manual: boolean = false) {
  const checkBtn = document.getElementById("check-updates-btn");
  const statusEl = document.getElementById("update-status");
  const isLinux = navigator.platform.toLowerCase().includes("linux");

  // Update UI for manual check
  if (manual && checkBtn) {
    checkBtn.classList.add("checking");
    if (checkBtn instanceof HTMLButtonElement) {
      checkBtn.disabled = true;
    }
    if (statusEl) {
      statusEl.textContent = "Checking...";
      statusEl.className = "update-status";
    }
  }

  try {
    // Try Tauri's built-in updater first (works for Windows)
    const update = await check();
    if (update) {
      console.log(`Update available: ${update.version}`);
      if (manual && statusEl) {
        statusEl.textContent = `Update available: v${update.version}`;
        statusEl.className = "update-status available";
      }
      showUpdateModal(update);
      return;
    }

    // Tauri updater returned null - might be up to date OR Linux with no platform entry
    // On Linux, fall back to checking GitHub releases directly
    if (isLinux) {
      const currentVersion = await getVersion();
      const githubUpdate = await checkGitHubRelease(currentVersion);

      if (githubUpdate) {
        console.log(`Update available (GitHub): ${githubUpdate.version}`);
        if (manual && statusEl) {
          statusEl.textContent = `Update available: v${githubUpdate.version}`;
          statusEl.className = "update-status available";
        }
        // Show modal with a minimal update object for Linux
        showUpdateModalLinux(githubUpdate.version);
        return;
      }
    }

    console.log("No updates available");
    if (manual && statusEl) {
      statusEl.textContent = "You're up to date!";
      statusEl.className = "update-status success";
    }
  } catch (e) {
    console.warn("Failed to check for updates:", e);

    // On Linux, if Tauri updater fails, try GitHub fallback
    if (isLinux) {
      try {
        const currentVersion = await getVersion();
        const githubUpdate = await checkGitHubRelease(currentVersion);

        if (githubUpdate) {
          console.log(`Update available (GitHub fallback): ${githubUpdate.version}`);
          if (manual && statusEl) {
            statusEl.textContent = `Update available: v${githubUpdate.version}`;
            statusEl.className = "update-status available";
          }
          showUpdateModalLinux(githubUpdate.version);
          return;
        } else {
          if (manual && statusEl) {
            statusEl.textContent = "You're up to date!";
            statusEl.className = "update-status success";
          }
          return;
        }
      } catch (e2) {
        console.warn("GitHub fallback also failed:", e2);
      }
    }

    if (manual && statusEl) {
      statusEl.textContent = "Could not check for updates";
      statusEl.className = "update-status error";
    }
  } finally {
    // Reset button state
    if (manual && checkBtn) {
      checkBtn.classList.remove("checking");
      if (checkBtn instanceof HTMLButtonElement) {
        checkBtn.disabled = false;
      }
    }
  }
}

// Show update modal for Linux (when using GitHub API fallback)
function showUpdateModalLinux(version: string) {
  const updateModal = document.getElementById("update-modal");
  const updateClose = document.getElementById("update-close");
  const updateVersion = document.getElementById("update-version");
  const updateInstall = document.getElementById("update-install");
  const updateLater = document.getElementById("update-later");
  const updateProgress = document.getElementById("update-progress");

  if (!updateModal) return;

  // Update the version display
  if (updateVersion) {
    updateVersion.textContent = `Version ${version}`;
  }

  // Show note about password prompt
  if (updateProgress) {
    updateProgress.style.display = "block";
    updateProgress.textContent = "You'll be prompted for your password to install.";
  }

  // Show the modal
  updateModal.classList.add("open");

  // Close button handler
  const closeHandler = () => updateModal.classList.remove("open");
  updateClose?.addEventListener("click", closeHandler, { once: true });
  updateLater?.addEventListener("click", closeHandler, { once: true });

  // Close on overlay click
  updateModal.addEventListener("click", (e) => {
    if (e.target === updateModal) updateModal.classList.remove("open");
  }, { once: true });

  // Install button handler
  updateInstall?.addEventListener("click", async () => {
    try {
      if (updateInstall instanceof HTMLButtonElement) {
        updateInstall.disabled = true;
        updateInstall.textContent = "Downloading...";
      }
      if (updateProgress) {
        updateProgress.style.display = "block";
        updateProgress.textContent = "Downloading package... (this may take a moment)";
      }

      const result = await invoke<string>("install_linux_update", { version });
      console.log("Linux update result:", result);

      if (updateProgress) {
        updateProgress.textContent = "Update installed! Restarting...";
      }

      setTimeout(async () => {
        await relaunch();
      }, 1500);
    } catch (e) {
      console.error("Linux update failed:", e);
      if (updateInstall instanceof HTMLButtonElement) {
        updateInstall.disabled = false;
        updateInstall.textContent = "Download & Install";
      }
      if (updateProgress) {
        const errorStr = String(e);
        if (errorStr.includes("126") || errorStr.includes("cancelled") || errorStr.includes("dismissed")) {
          updateProgress.textContent = "Update cancelled.";
        } else {
          updateProgress.textContent = `Update failed: ${e}`;
        }
      }
    }
  }, { once: true });
}

// Initialize manual update check button
function initUpdateCheckButton() {
  const checkBtn = document.getElementById("check-updates-btn");
  checkBtn?.addEventListener("click", () => checkForUpdates(true));
}

function showUpdateModal(update: Awaited<ReturnType<typeof check>>) {
  if (!update) return;

  const updateModal = document.getElementById("update-modal");
  const updateClose = document.getElementById("update-close");
  const updateVersion = document.getElementById("update-version");
  const updateInstall = document.getElementById("update-install");
  const updateLater = document.getElementById("update-later");
  const updateProgress = document.getElementById("update-progress");

  if (!updateModal) return;

  // Detect if we're on Linux
  const isLinux = navigator.platform.toLowerCase().includes("linux");

  // Update the version display
  if (updateVersion) {
    updateVersion.textContent = `Version ${update.version}`;
  }

  // For Linux, show note about password prompt
  if (isLinux && updateProgress) {
    updateProgress.style.display = "block";
    updateProgress.textContent = "You'll be prompted for your password to install.";
  }

  // Show the modal
  updateModal.classList.add("open");

  // Close button handler
  updateClose?.addEventListener("click", () => {
    updateModal.classList.remove("open");
  });

  // "Remind Me Later" button handler
  updateLater?.addEventListener("click", () => {
    updateModal.classList.remove("open");
  });

  // Close on overlay click
  updateModal.addEventListener("click", (e) => {
    if (e.target === updateModal) updateModal.classList.remove("open");
  });

  // Install button handler
  updateInstall?.addEventListener("click", async () => {
    try {
      // Disable button and show progress
      if (updateInstall instanceof HTMLButtonElement) {
        updateInstall.disabled = true;
        updateInstall.textContent = "Downloading...";
      }
      if (updateProgress) {
        updateProgress.style.display = "block";
        updateProgress.textContent = "Downloading update...";
      }

      // On Linux, use custom pkexec-based update
      if (isLinux) {
        if (updateProgress) {
          updateProgress.textContent = "Downloading package... (this may take a moment)";
        }

        try {
          const result = await invoke<string>("install_linux_update", { version: update.version });
          console.log("Linux update result:", result);

          if (updateProgress) {
            updateProgress.textContent = "Update installed! Restarting...";
          }

          // Give user a moment to see the success message
          setTimeout(async () => {
            await relaunch();
          }, 1500);
        } catch (e) {
          console.error("Linux update failed:", e);
          if (updateInstall instanceof HTMLButtonElement) {
            updateInstall.disabled = false;
            updateInstall.textContent = "Download & Install";
          }
          if (updateProgress) {
            // Check if user cancelled the pkexec dialog
            const errorStr = String(e);
            if (errorStr.includes("126") || errorStr.includes("cancelled") || errorStr.includes("dismissed")) {
              updateProgress.textContent = "Update cancelled.";
            } else {
              updateProgress.textContent = `Update failed: ${e}`;
            }
          }
        }
        return;
      }

      // Windows/Mac: Use Tauri's built-in updater
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && updateProgress) {
          const contentLength = event.data.contentLength;
          updateProgress.textContent = contentLength
            ? `Downloading: 0 / ${Math.round(contentLength / 1024)} KB`
            : "Downloading...";
        } else if (event.event === "Progress" && updateProgress) {
          updateProgress.textContent = `Downloading: ${Math.round(event.data.chunkLength / 1024)} KB received`;
        } else if (event.event === "Finished" && updateProgress) {
          updateProgress.textContent = "Download complete. Installing...";
        }
      });

      // Relaunch the app
      if (updateProgress) {
        updateProgress.textContent = "Restarting application...";
      }
      await relaunch();
    } catch (e) {
      console.error("Failed to install update:", e);
      if (updateInstall instanceof HTMLButtonElement) {
        updateInstall.disabled = false;
        updateInstall.textContent = "Download & Install";
      }
      if (updateProgress) {
        updateProgress.textContent = `Update failed: ${e}`;
      }
    }
  });
}

// Update fleet presets in ship dropdowns
function updateFleetPresetsInDropdowns() {
  const presets = fleetPresetManager.getPresets();
  const presetOptions = presets.map(p => ({
    value: p.shipName,
    label: p.name,
    presetId: p.id,
  }));

  attackerShipDropdown.setFleetPresets(presetOptions);
  targetShipDropdown.setFleetPresets(presetOptions);
}

// Apply a fleet preset to the attacker panel
async function applyPresetToAttacker(presetId: string) {
  const preset = fleetPresetManager.getPresetById(presetId);
  if (!preset) return;

  // Update ship and display
  attackerShipDropdown.setValueFromPreset(presetId, preset.name, preset.shipName);
  await updateAttackerShip(preset.shipName);

  // Restore weapon selections and enabled categories after slots are created
  setTimeout(() => {
    if (preset.weapons && preset.weapons.length > 0) {
      weaponSlotManager.restoreWeapons(preset.weapons);
    }
    // Restore enabled categories (or default to pilot if not saved in preset)
    if (preset.enabledCategories && preset.enabledCategories.length > 0) {
      weaponSlotManager.setEnabledCategories(preset.enabledCategories);
    }
    calculateTTK();
    saveSettings();
  }, 100);
}

// Apply a fleet preset to the target panel
async function applyPresetToTarget(presetId: string) {
  const preset = fleetPresetManager.getPresetById(presetId);
  if (!preset) return;

  // Update ship and display
  targetShipDropdown.setValueFromPreset(presetId, preset.name, preset.shipName);
  await updateTargetShip(preset.shipName);

  // Set shield if available
  if (preset.shield) {
    shieldDropdown.setValue(preset.shield);
  }

  calculateTTK();
  saveSettings();
}

// Save current attacker configuration as a fleet preset
async function saveCurrentAsPreset(name: string) {
  if (!currentAttackerShip) return;

  const preset = fleetPresetManager.createPreset(
    name,
    currentAttackerShip.display_name,
    weaponSlotManager.getAllSelectedWeapons(),  // Save all weapons, not just enabled
    shieldDropdown.getValue(),
    weaponSlotManager.getEnabledCategories()
  );

  await fleetPresetManager.savePreset(preset);
  updateFleetPresetsInDropdowns();
}

// Initialize save preset modal
function initSavePresetModal() {
  const savePresetBtn = document.getElementById("save-preset-btn");
  const savePresetModal = document.getElementById("save-preset-modal");
  const savePresetClose = document.getElementById("save-preset-close");
  const savePresetConfirm = document.getElementById("save-preset-confirm");
  const presetNameInput = document.getElementById("preset-name-input") as HTMLInputElement;
  const presetShipPreview = document.getElementById("preset-ship-preview");
  const presetWeaponsPreview = document.getElementById("preset-weapons-preview");

  if (!savePresetBtn || !savePresetModal) return;

  savePresetBtn.addEventListener("click", () => {
    // Pre-fill with ship name
    if (currentAttackerShip) {
      presetNameInput.value = currentAttackerShip.display_name;
      if (presetShipPreview) presetShipPreview.textContent = currentAttackerShip.display_name;
      if (presetWeaponsPreview) presetWeaponsPreview.textContent = weaponSlotManager.getSelectedWeapons().join(", ") || "None";
    }
    savePresetModal.classList.add("open");
    presetNameInput.focus();
    presetNameInput.select();
  });

  savePresetClose?.addEventListener("click", () => {
    savePresetModal.classList.remove("open");
  });

  savePresetModal.addEventListener("click", (e) => {
    if (e.target === savePresetModal) savePresetModal.classList.remove("open");
  });

  savePresetConfirm?.addEventListener("click", async () => {
    const name = presetNameInput.value.trim();
    if (name) {
      await saveCurrentAsPreset(name);
      savePresetModal.classList.remove("open");
    }
  });

  // Allow Enter key to save
  presetNameInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const name = presetNameInput.value.trim();
      if (name) {
        await saveCurrentAsPreset(name);
        savePresetModal.classList.remove("open");
      }
    }
  });
}

// Initialize fleet management modal
function initFleetManagementModal() {
  const fleetBtn = document.getElementById("fleet-btn");
  const fleetModal = document.getElementById("fleet-modal");
  const fleetClose = document.getElementById("fleet-close");
  const fleetList = document.getElementById("fleet-list");

  if (!fleetBtn || !fleetModal) return;

  const renderFleetList = () => {
    const presets = fleetPresetManager.getPresets();
    if (!fleetList) return;

    if (presets.length === 0) {
      fleetList.innerHTML = '<p class="placeholder-text">No fleet presets saved yet. Use "Save as Preset" to add your first ship configuration.</p>';
      return;
    }

    fleetList.innerHTML = presets.map(preset => `
      <div class="fleet-preset-card" data-preset-id="${preset.id}">
        <div class="preset-info">
          <span class="preset-name">${preset.name}</span>
          <span class="preset-ship">${preset.shipName}</span>
        </div>
        <div class="preset-actions">
          <button class="preset-delete-btn" data-preset-id="${preset.id}" title="Delete preset">×</button>
        </div>
      </div>
    `).join("");

    // Attach click handlers to load preset as attacker
    fleetList.querySelectorAll(".fleet-preset-card").forEach(card => {
      card.addEventListener("click", async () => {
        const presetId = (card as HTMLElement).dataset.presetId;
        if (presetId) {
          await applyPresetToAttacker(presetId);
          fleetModal?.classList.remove("open");
        }
      });
    });

    // Attach delete handlers
    fleetList.querySelectorAll(".preset-delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const presetId = (btn as HTMLElement).dataset.presetId;
        if (presetId && confirm("Delete this fleet preset?")) {
          await fleetPresetManager.deletePreset(presetId);
          updateFleetPresetsInDropdowns();
          renderFleetList();
        }
      });
    });
  };

  fleetBtn.addEventListener("click", () => {
    renderFleetList();
    fleetModal.classList.add("open");
  });

  fleetClose?.addEventListener("click", () => {
    fleetModal.classList.remove("open");
  });

  fleetModal.addEventListener("click", (e) => {
    if (e.target === fleetModal) fleetModal.classList.remove("open");
  });
}

// Update version display from Tauri config
async function updateVersionDisplay() {
  try {
    const version = await getVersion();
    const aboutVersion = document.getElementById("about-version");
    const footerVersion = document.getElementById("footer-version");

    if (aboutVersion) {
      aboutVersion.textContent = `Ship Lens v${version}`;
    }
    if (footerVersion) {
      footerVersion.textContent = `Ship Lens v${version}`;
    }
  } catch (error) {
    console.error("Failed to get app version:", error);
  }
}

async function init() {
  console.log("Ship Lens initializing...");

  // Update version display from Tauri config
  updateVersionDisplay();

  // Create searchable dropdowns
  attackerShipDropdown = new SearchableDropdown("attacker-ship-container");
  targetShipDropdown = new SearchableDropdown("target-ship-container");
  shieldDropdown = new SearchableDropdown("shield-container");
  scenarioDropdown = new SearchableDropdown("scenario-container");
  mountTypeDropdown = new SearchableDropdown("mount-type-container");
  fireModeDropdown = new SearchableDropdown("fire-mode-container");
  targetZoneDropdown = new SearchableDropdown("target-zone-container");
  weaponPowerDropdown = new SearchableDropdown("weapon-power-container");
  weaponSlotManager = new WeaponSlotManager("weapon-slots-container");
  fleetPresetManager = new FleetPresetManager();

  // Enable fleet presets on ship dropdowns
  attackerShipDropdown.enableFleetPresets();
  targetShipDropdown.enableFleetPresets();

  initStaticDropdowns();
  initSettings();
  initAboutModal();
  initUpdateCheckButton();
  initSavePresetModal();
  initFleetManagementModal();

  // Set up event handlers with auto-save
  attackerShipDropdown.onChange((value) => { updateAttackerShip(value); saveSettings(); });
  attackerShipDropdown.onPresetSelect(applyPresetToAttacker);
  targetShipDropdown.onChange((value) => { updateTargetShip(value); saveSettings(); });
  targetShipDropdown.onPresetSelect(applyPresetToTarget);
  shieldDropdown.onChange(() => { calculateTTK(); saveSettings(); });
  scenarioDropdown.onChange(() => { calculateTTK(); saveSettings(); });
  mountTypeDropdown.onChange(() => { calculateTTK(); saveSettings(); });
  fireModeDropdown.onChange(() => { calculateTTK(); saveSettings(); });
  targetZoneDropdown.onChange(() => { calculateTTK(); saveSettings(); });
  weaponPowerDropdown.onChange(() => { calculateTTK(); saveSettings(); });
  weaponSlotManager.onChange(() => { calculateTTK(); saveSettings(); });

  // Click handler for weapon slot size labels to toggle slots
  document.getElementById('weapon-slots-container')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const sizeLabel = target.closest('[data-slot-index]') as HTMLElement;
    if (sizeLabel) {
      const slotIndex = parseInt(sizeLabel.dataset.slotIndex || '', 10);
      if (!isNaN(slotIndex)) {
        weaponSlotManager.toggleSlotEnabled(slotIndex);
      }
    }
  });

  // Load data
  await loadWeapons();
  await loadShields();
  await loadMissiles();
  await Promise.all([loadShips(), loadStats()]);

  // Load fleet presets
  await fleetPresetManager.loadPresets();
  updateFleetPresetsInDropdowns();

  // Restore saved settings
  await restoreSavedSettings();

  // Silent refresh after all data is loaded to ensure proper processing
  // This fixes an issue where the initial ship selection doesn't fully process
  setTimeout(async () => {
    const attackerShip = attackerShipDropdown.getValue();
    const targetShip = targetShipDropdown.getValue();
    if (attackerShip) await updateAttackerShip(attackerShip);
    if (targetShip) await updateTargetShip(targetShip);
    calculateTTK();
  }, 200);

  // Check for updates (non-blocking)
  checkForUpdates();

  console.log("Ship Lens ready!");
}

async function restoreSavedSettings() {
  const saved = await loadSavedSettings();
  if (!saved) return;

  console.log("Restoring saved settings...");

  // Restore theme first (instant visual feedback)
  if (saved.theme) {
    currentTheme = saved.theme;
    setTheme(saved.theme);
  }

  // Restore combat settings first (these don't trigger async operations)
  if (saved.scenario) scenarioDropdown.setValue(saved.scenario);
  if (saved.mountType) mountTypeDropdown.setValue(saved.mountType);
  if (saved.fireMode) fireModeDropdown.setValue(saved.fireMode);
  if (saved.targetZone) targetZoneDropdown.setValue(saved.targetZone);
  if (saved.weaponPower) weaponPowerDropdown.setValue(saved.weaponPower);

  // Restore attacker ship (this will update weapon slots)
  if (saved.attackerShip) {
    attackerShipDropdown.setValue(saved.attackerShip);
    await updateAttackerShip(saved.attackerShip);

    // Restore weapon selections and enabled categories after slots are created
    if (saved.weapons && saved.weapons.length > 0) {
      // Wait a tick for weapon slots to be created
      setTimeout(() => {
        weaponSlotManager.restoreWeapons(saved.weapons);
        // Restore enabled categories after weapons
        if (saved.enabledCategories && saved.enabledCategories.length > 0) {
          weaponSlotManager.setEnabledCategories(saved.enabledCategories);
        }
        calculateTTK();
      }, 100);
    } else if (saved.enabledCategories && saved.enabledCategories.length > 0) {
      // Restore enabled categories even if no weapons saved
      setTimeout(() => {
        weaponSlotManager.setEnabledCategories(saved.enabledCategories);
        calculateTTK();
      }, 100);
    }
  }

  // Restore target ship
  if (saved.targetShip) {
    targetShipDropdown.setValue(saved.targetShip);
    await updateTargetShip(saved.targetShip);
  }

  // Restore shield selection
  if (saved.shield) {
    shieldDropdown.setValue(saved.shield);
  }

  calculateTTK();
}

// Get mounts by max size from backend
async function getMountsByMaxSize(maxSize: number, _shipRef?: string, compatibleMounts?: string[]): Promise<Mount[]> {
  try {
    const allMounts: Mount[] = await invoke("get_mounts");
    let filtered = allMounts.filter(m => m.size <= maxSize);
    
    if (compatibleMounts && compatibleMounts.length > 0) {
      filtered = filtered.filter(m => compatibleMounts.includes(m.ref));
    }
    
    return filtered;
  } catch (error) {
    console.error("Failed to get mounts:", error);
    return [];
  }
}

// Track selected mounts per hardpoint
const selectedMounts: Map<string, { mount: Mount; hardpoint: WeaponHardpoint }> = new Map();

// Mount Selection Popup for swappable mounts
function showMountSelectionPopup(maxSize: number, hardpoint: WeaponHardpoint) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay mount-selection-overlay';
  overlay.style.display = 'flex';

  const modal = document.createElement('div');
  modal.className = 'modal mount-selection-modal';

  modal.innerHTML = `
    <div class="modal-header">
      <h3>SELECT MOUNT (S${maxSize} max)</h3>
      <button class="modal-close mount-selection-close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="mount-list" id="mount-selection-list">
        <div class="mount-loading">Loading mounts...</div>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  setTimeout(() => overlay.classList.add('open'), 10);

  const closeBtn = modal.querySelector('.mount-selection-close') as HTMLElement;
  const closePopup = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  };

  closeBtn.addEventListener('click', closePopup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });

  (async () => {
    const shipRef = currentAttackerShip?.filename;
    const compatibleMounts = hardpoint.compatible_mounts && hardpoint.compatible_mounts.length > 0
      ? hardpoint.compatible_mounts
      : undefined;
    const mounts = await getMountsByMaxSize(maxSize, shipRef, compatibleMounts);
    const listEl = modal.querySelector('#mount-selection-list') as HTMLElement;
    const currentMountRef = hardpoint.mount_name;

    listEl.innerHTML = mounts.map((m: Mount) => `
      <div class="mount-option ${m.ref === currentMountRef ? 'current-mount' : ''}" data-mount-ref="${m.ref}">
        <div class="mount-info">
          <span class="mount-name">${m.display_name}</span>
          <span class="mount-type-badge">${m.mount_type}</span>
        </div>
        <div class="mount-stats">
          <span class="mount-stat">${m.ports}x S${m.port_size}</span>
          <span class="mount-stat">${m.hp} HP</span>
        </div>
      </div>
    `).join('');

    listEl.addEventListener('click', (e: Event) => {
      const mountOption = (e.target as HTMLElement).closest('.mount-option') as HTMLElement;
      if (!mountOption) return;

      const mountRef = mountOption.dataset.mountRef;
      if (mountRef) {
        const selectedMount = mounts.find((m: Mount) => m.ref === mountRef);
        if (selectedMount) {
          applyMountToHardpoint(selectedMount, hardpoint);
          closePopup();
        }
      }
    });
  })();
}

function applyMountToHardpoint(mount: Mount, hardpoint: WeaponHardpoint) {
  selectedMounts.set(hardpoint.port_name, { mount, hardpoint });
  
  if (currentAttackerShip && currentAttackerShip.weapon_hardpoints) {
    weaponSlotManager.updateSlotsFromHardpoints(currentAttackerShip.weapon_hardpoints);
  }
  
  calculateTTK();
  saveSettings();
}


init();
