import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// Type definitions matching Rust structs
// Weapon hardpoint with category information
interface WeaponHardpoint {
  slot_number: number;
  port_name: string;
  max_size: number;
  gimbal_type: string;
  control_type: string;
  category: 'pilot' | 'manned_turret' | 'auto_pdw' | 'specialized';
  default_weapon: string;  // filename of default weapon
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
  "Fixed": 0.7,
  "Gimballed": 0.85,
  "Turret": 0.9,
  "Auto-Gimbal": 0.95,
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
    this.searchInput.addEventListener("input", () => {
      this.filterOptions(this.searchInput.value);
      this.showDropdown();
    });
    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target as Node)) this.hideDropdown();
    });
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideDropdown();
        this.searchInput.blur();
      } else if (e.key === "Enter") {
        const firstVisible = this.dropdown.querySelector(".select-option:not(.no-results):not(.group-header)") as HTMLElement;
        if (firstVisible) {
          if (firstVisible.dataset.presetId) {
            this.selectPreset(firstVisible.dataset.presetId);
          } else {
            this.selectOption(firstVisible.dataset.value || "");
          }
        }
      }
    });
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

  private showDropdown() { this.dropdown.classList.add("open"); }
  private hideDropdown() { this.dropdown.classList.remove("open"); }
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
  'auto_pdw': { title: 'AUTO PDW', cssClass: 'auto-pdw', order: 3 },
  'specialized': { title: 'SPECIALIZED', cssClass: 'specialized', order: 4 },
};

// Weapon slot with category info
interface CategorySlot {
  hardpoint: WeaponHardpoint;
  dropdown: SearchableDropdown | null;
  slotIndex: number;
}

// Weapon slot manager with category support
class WeaponSlotManager {
  private container: HTMLElement;
  private weaponsBySize: Map<number, Weapon[]> = new Map();
  private categorySlots: Map<string, CategorySlot[]> = new Map();
  private enabledCategories: Set<string> = new Set(['pilot']); // Default: only pilot enabled
  private collapsedCategories: Set<string> = new Set(); // Track collapsed sections
  private onChangeCallback: (() => void) | null = null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
  }

  setWeapons(weapons: Weapon[]) {
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
        const slotId = `weapon-slot-${globalSlotIndex}`;
        slotsContainer.insertAdjacentHTML("beforeend", `
          <div class="weapon-slot">
            <span class="weapon-slot-size">S${hp.max_size}</span>
            <div class="searchable-select" id="${slotId}-container">
              <input type="text" class="search-input" id="${slotId}-search" placeholder="Select weapon..." autocomplete="off">
              <div class="select-dropdown" id="${slotId}-dropdown"></div>
              <input type="hidden" id="${slotId}" value="">
            </div>
          </div>
        `);

        const dropdown = new SearchableDropdown(`${slotId}-container`);
        let weapons = this.weaponsBySize.get(hp.max_size) || [];

        // Filter weapons based on hardpoint type
        const isPdcHardpoint = hp.port_name.toLowerCase().includes('pdc');
        const isSpecializedHardpoint = hp.category === 'specialized';

        if (isSpecializedHardpoint && hp.default_weapon) {
          // Specialized hardpoints are bespoke - only allow the designated weapon
          weapons = weapons.filter(w => w.filename === hp.default_weapon);
        } else if (isPdcHardpoint) {
          // PDC hardpoints can only mount PDC weapons
          weapons = weapons.filter(w => w.filename.toLowerCase().includes('pdc'));
        }

        const options = weapons.map(w => ({ value: w.display_name, label: `${w.display_name} (${Math.round(w.sustained_dps)} DPS)` }));
        dropdown.setOptions(options);

        // Pre-select default weapon if available, otherwise use first option (highest DPS)
        let selectedWeapon: string | null = null;

        if (hp.default_weapon && hp.default_weapon.length > 0) {
          const defaultWeapon = weapons.find(w => w.filename === hp.default_weapon);
          if (defaultWeapon) {
            selectedWeapon = defaultWeapon.display_name;
            console.log(`Slot ${globalSlotIndex}: default weapon "${hp.default_weapon}" found -> "${selectedWeapon}"`);
          } else {
            console.log(`Slot ${globalSlotIndex}: default weapon "${hp.default_weapon}" NOT found in ${weapons.length} S${hp.max_size} weapons`);
          }
        }

        // If no default found, use the first option (already sorted by DPS)
        if (!selectedWeapon && options.length > 0) {
          selectedWeapon = options[0].value;
          console.log(`Slot ${globalSlotIndex}: no default, using first option "${selectedWeapon}"`);
        }

        if (!selectedWeapon) {
          console.warn(`Slot ${globalSlotIndex} S${hp.max_size}: NO weapon selected! options.length=${options.length}, weaponsBySize has sizes: [${Array.from(this.weaponsBySize.keys()).join(', ')}]`);
        }

        if (selectedWeapon) {
          dropdown.setValue(selectedWeapon);
        } else if (options.length > 0) {
          // Extra safety: if we somehow got here without selectedWeapon but have options, use first
          console.warn(`Slot ${globalSlotIndex}: Forcing first option selection`);
          dropdown.setValue(options[0].value);
        }
        dropdown.onChange(() => { if (this.onChangeCallback) this.onChangeCallback(); });

        categorySlotsList.push({ hardpoint: hp, dropdown, slotIndex: globalSlotIndex });
        globalSlotIndex++;
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
      default_weapon: '',
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

  // Get selected weapons only from enabled categories
  getSelectedWeapons(): string[] {
    const weapons: string[] = [];
    this.categorySlots.forEach((slots, category) => {
      if (this.enabledCategories.has(category)) {
        slots.forEach(slot => {
          if (slot.dropdown) {
            const value = slot.dropdown.getValue();
            if (value) weapons.push(value);
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

  getTotalDps(weapons: Weapon[]): number {
    return this.getSelectedWeapons().reduce((total, name) => {
      const weapon = weapons.find(w => w.display_name === name);
      return total + (weapon?.sustained_dps || 0);
    }, 0);
  }

  getPowerDraw(weapons: Weapon[]): number {
    return this.getSelectedWeapons().reduce((total, name) => {
      const weapon = weapons.find(w => w.display_name === name);
      return total + (weapon?.power_consumption || 0);
    }, 0);
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
const hullHpEl = document.getElementById("hull-hp") as HTMLElement;
const armorHpEl = document.getElementById("armor-hp") as HTMLElement;
const thrusterHpEl = document.getElementById("thruster-hp") as HTMLElement;
const powerplantHpEl = document.getElementById("powerplant-hp") as HTMLElement;
const coolerHpEl = document.getElementById("cooler-hp") as HTMLElement;
const shieldGenHpEl = document.getElementById("shield-gen-hp") as HTMLElement;
const qdHpEl = document.getElementById("qd-hp") as HTMLElement;
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
let currentAttackerShip: Ship | null = null;
let currentTargetShip: Ship | null = null;

const maxValues = { hull: 100000, armor: 50000, shield: 50000 };

function formatNumber(num: number): string { return num.toLocaleString(); }

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 0.1) return "<0.1";
  if (seconds >= 1000) return ">1000";
  return seconds.toFixed(1);
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

// Calculate hit rate based on scenario and mount type
// Excel formula: Hit Rate = MIN(Pilot Accuracy × Mount Accuracy, 1)
function getHitRate(): number {
  const scenario = scenarioDropdown.getValue() || "dogfight";
  const mountType = mountTypeDropdown.getValue() || "Gimballed";
  const scenarioMod = SCENARIO_MODIFIERS[scenario] || SCENARIO_MODIFIERS["dogfight"];
  const mountAccuracy = MOUNT_TYPE_ACCURACY[mountType] || 0.85;
  return Math.min(scenarioMod.accuracy * mountAccuracy, 1);
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
  const totalShieldHp = (selectedShield?.max_hp || 0) * shieldCount;
  shieldBarEl.style.width = `${Math.min(100, (totalShieldHp / maxValues.shield) * 100)}%`;
  hullBarEl.style.width = `${Math.min(100, (currentTargetShip.hull_hp / maxValues.hull) * 100)}%`;
  armorBarEl.style.width = `${Math.min(100, (currentTargetShip.armor_hp / maxValues.armor) * 100)}%`;
}

function updateTimeline(shieldTime: number, armorTime: number, hullTime: number) {
  const total = shieldTime + armorTime + hullTime || 1;
  timelineShieldEl.style.flex = String(Math.max(0.1, shieldTime / total));
  timelineArmorEl.style.flex = String(Math.max(0.1, armorTime / total));
  timelineHullEl.style.flex = String(Math.max(0.1, hullTime / total));
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
    weaponSlotManager.setWeapons(allWeapons);
  } catch (e) { console.error("Failed to load weapons:", e); }
}

async function loadShields() {
  try {
    allShields = await invoke("get_shields");
  } catch (e) { console.error("Failed to load shields:", e); }
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

function calculateTTK() {
  updateLoadoutSummary();

  if (!currentAttackerShip || !currentTargetShip) return;

  const totalRawDps = weaponSlotManager.getTotalDps(allWeapons);
  const hitRate = getHitRate();
  const fireModeMod = getFireModeMod();
  const timeOnTarget = getTimeOnTarget();
  const powerMult = getPowerMultiplier();
  const zoneMod = getZoneModifiers();

  // Excel formula: Eff DPS = Raw DPS × Hit Rate × Fire Mode Factor × Time-on-Target × Power Multiplier
  const effectiveDps = totalRawDps * hitRate * fireModeMod * timeOnTarget * powerMult;

  // Get shield data - Excel multiplies by ship's shield count
  const selectedShieldName = shieldDropdown.getValue();
  const shieldData = allShields.find(s => s.display_name === selectedShieldName);
  const shieldCount = currentTargetShip.shield_count || 1;
  const singleShieldHp = shieldData?.max_hp || 0;
  const singleShieldRegen = shieldData?.regen || 0;
  // Total shield HP and regen = single shield × shield count (per Excel formula)
  const totalShieldHp = singleShieldHp * shieldCount;
  const totalShieldRegen = singleShieldRegen * shieldCount;

  shieldHpEl.textContent = shieldData ? formatNumber(Math.round(totalShieldHp)) : "0";
  updateBars();

  // Shield phase: Net DPS = Effective DPS - Total Shield Regen
  const netShieldDps = Math.max(0, effectiveDps - totalShieldRegen);
  const shieldTime = netShieldDps > 0 ? totalShieldHp / netShieldDps : (totalShieldHp > 0 ? 9999 : 0);

  // Hull phase: Calculate zone-specific HP
  const zoneHullHp = currentTargetShip.hull_hp * zoneMod.hull;
  const zoneArmorHp = currentTargetShip.armor_hp * zoneMod.armor;
  const zoneThrusterHp = currentTargetShip.thruster_total_hp * zoneMod.thruster;
  const zoneComponentHp = (currentTargetShip.powerplant_total_hp + currentTargetShip.cooler_total_hp + currentTargetShip.shield_gen_total_hp) * zoneMod.component;

  // Split hull phase into armor time and hull time (armor comes first)
  const armorTime = effectiveDps > 0 ? zoneArmorHp / effectiveDps : 0;
  const hullTime = effectiveDps > 0 ? (zoneHullHp + zoneThrusterHp + zoneComponentHp) / effectiveDps : 0;

  const totalTtk = shieldTime + armorTime + hullTime;

  // Animated TTK update
  animateTextValue(ttkValueEl, formatTime(totalTtk));
  // Animated DPS counter
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

// Initialize Update modal and check for updates
async function checkForUpdates(manual: boolean = false) {
  const checkBtn = document.getElementById("check-updates-btn");
  const statusEl = document.getElementById("update-status");

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
    const update = await check();
    if (update) {
      console.log(`Update available: ${update.version}`);
      if (manual && statusEl) {
        statusEl.textContent = `Update available: v${update.version}`;
        statusEl.className = "update-status available";
      }
      showUpdateModal(update);
    } else {
      console.log("No updates available");
      if (manual && statusEl) {
        statusEl.textContent = "You're up to date!";
        statusEl.className = "update-status success";
      }
    }
  } catch (e) {
    console.warn("Failed to check for updates:", e);
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

  // Detect if we're on Linux (system install can't auto-update)
  const isLinux = navigator.platform.toLowerCase().includes("linux");

  // Update the version display
  if (updateVersion) {
    updateVersion.textContent = `Version ${update.version}`;
  }

  // For Linux, change button to open releases page instead of auto-update
  if (isLinux && updateInstall instanceof HTMLButtonElement) {
    updateInstall.textContent = "View on GitHub";
    if (updateProgress) {
      updateProgress.style.display = "block";
      updateProgress.textContent = "Linux: Re-run the install command from the README to update.";
    }
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
    // On Linux, open GitHub releases page instead of trying to auto-update
    if (isLinux) {
      window.open("https://github.com/CapCeph/ship-lens/releases/latest", "_blank");
      updateModal.classList.remove("open");
      return;
    }

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

      // Download and install the update
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

  // Load data
  await loadWeapons();
  await loadShields();
  await Promise.all([loadShips(), loadStats()]);

  // Load fleet presets
  await fleetPresetManager.loadPresets();
  updateFleetPresetsInDropdowns();

  // Restore saved settings
  await restoreSavedSettings();

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

init();
