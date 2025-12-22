#!/usr/bin/env python3
"""
Ship Lens - Star Citizen Damage Calculator
A desktop application for calculating Time-To-Kill between ships.
"""

import sys
import csv
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QComboBox, QGroupBox, QGridLayout, QFrame, QScrollArea,
    QSplitter, QTabWidget, QSlider, QSpinBox, QDoubleSpinBox
)
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QFont, QPalette, QColor, QFontDatabase

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Star Citizen color palette
SC_COLORS = {
    'bg_dark': '#0a0e14',
    'bg_panel': '#0d1117',
    'bg_card': '#161b22',
    'border': '#30363d',
    'border_highlight': '#58a6ff',
    'text_primary': '#e6edf3',
    'text_secondary': '#8b949e',
    'text_muted': '#6e7681',
    'accent_blue': '#58a6ff',
    'accent_cyan': '#39c5cf',
    'accent_orange': '#f0883e',
    'accent_red': '#f85149',
    'accent_green': '#3fb950',
    'accent_purple': '#a371f7',
    'shield_blue': '#4493f8',
    'hull_orange': '#d29922',
    'armor_red': '#da3633',
    'component_green': '#238636',
}


# Stylesheet for Star Citizen theme
SC_STYLESHEET = f"""
QMainWindow {{
    background-color: {SC_COLORS['bg_dark']};
}}

QWidget {{
    background-color: transparent;
    color: {SC_COLORS['text_primary']};
    font-family: 'Orbitron', 'Rajdhani', 'Share Tech Mono', 'Segoe UI', sans-serif;
}}

QLabel {{
    color: {SC_COLORS['text_primary']};
    font-size: 12px;
}}

QLabel[class="title"] {{
    color: {SC_COLORS['accent_cyan']};
    font-size: 24px;
    font-weight: bold;
    letter-spacing: 2px;
}}

QLabel[class="section"] {{
    color: {SC_COLORS['accent_blue']};
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
}}

QLabel[class="value"] {{
    color: {SC_COLORS['accent_cyan']};
    font-size: 16px;
    font-weight: bold;
}}

QLabel[class="ttk"] {{
    color: {SC_COLORS['accent_orange']};
    font-size: 32px;
    font-weight: bold;
}}

QGroupBox {{
    background-color: {SC_COLORS['bg_card']};
    border: 1px solid {SC_COLORS['border']};
    border-radius: 6px;
    margin-top: 12px;
    padding: 15px;
    padding-top: 25px;
}}

QGroupBox::title {{
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 8px;
    color: {SC_COLORS['accent_blue']};
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
}}

QComboBox {{
    background-color: {SC_COLORS['bg_panel']};
    border: 1px solid {SC_COLORS['border']};
    border-radius: 4px;
    padding: 8px 12px;
    min-width: 200px;
    color: {SC_COLORS['text_primary']};
}}

QComboBox:hover {{
    border-color: {SC_COLORS['accent_blue']};
}}

QComboBox:focus {{
    border-color: {SC_COLORS['accent_cyan']};
    border-width: 2px;
}}

QComboBox::drop-down {{
    border: none;
    width: 30px;
}}

QComboBox::down-arrow {{
    image: none;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid {SC_COLORS['accent_blue']};
    margin-right: 10px;
}}

QComboBox QAbstractItemView {{
    background-color: {SC_COLORS['bg_panel']};
    border: 1px solid {SC_COLORS['border']};
    selection-background-color: {SC_COLORS['accent_blue']};
    selection-color: {SC_COLORS['bg_dark']};
}}

QScrollArea {{
    border: none;
    background-color: transparent;
}}

QScrollBar:vertical {{
    background-color: {SC_COLORS['bg_panel']};
    width: 10px;
    border-radius: 5px;
}}

QScrollBar::handle:vertical {{
    background-color: {SC_COLORS['border']};
    border-radius: 5px;
    min-height: 30px;
}}

QScrollBar::handle:vertical:hover {{
    background-color: {SC_COLORS['accent_blue']};
}}

QFrame[class="divider"] {{
    background-color: {SC_COLORS['border']};
    max-height: 1px;
}}

QFrame[class="stat-card"] {{
    background-color: {SC_COLORS['bg_card']};
    border: 1px solid {SC_COLORS['border']};
    border-radius: 6px;
    padding: 10px;
}}

QSlider::groove:horizontal {{
    background-color: {SC_COLORS['bg_panel']};
    height: 6px;
    border-radius: 3px;
}}

QSlider::handle:horizontal {{
    background-color: {SC_COLORS['accent_cyan']};
    width: 16px;
    height: 16px;
    margin: -5px 0;
    border-radius: 8px;
}}

QSlider::sub-page:horizontal {{
    background-color: {SC_COLORS['accent_blue']};
    border-radius: 3px;
}}

QTabWidget::pane {{
    border: 1px solid {SC_COLORS['border']};
    border-radius: 6px;
    background-color: {SC_COLORS['bg_card']};
}}

QTabBar::tab {{
    background-color: {SC_COLORS['bg_panel']};
    color: {SC_COLORS['text_secondary']};
    padding: 10px 20px;
    border: 1px solid {SC_COLORS['border']};
    border-bottom: none;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
}}

QTabBar::tab:selected {{
    background-color: {SC_COLORS['bg_card']};
    color: {SC_COLORS['accent_cyan']};
    border-bottom: 2px solid {SC_COLORS['accent_cyan']};
}}

QTabBar::tab:hover:!selected {{
    background-color: {SC_COLORS['bg_card']};
    color: {SC_COLORS['text_primary']};
}}
"""


@dataclass
class Ship:
    """Ship data container."""
    filename: str
    display_name: str
    hull_hp: int
    armor_hp: int
    armor_resist_physical: float
    armor_resist_energy: float
    armor_resist_distortion: float
    thruster_main_hp: int
    thruster_retro_hp: int
    thruster_mav_hp: int
    thruster_vtol_hp: int
    thruster_total_hp: int
    turret_total_hp: int
    powerplant_total_hp: int
    cooler_total_hp: int
    shield_gen_total_hp: int
    qd_total_hp: int
    pilot_weapon_count: int
    pilot_weapon_sizes: str


@dataclass
class Weapon:
    """Weapon data container."""
    display_name: str
    filename: str
    size: int
    damage_type: str
    sustained_dps: float
    power_consumption: float


@dataclass
class Shield:
    """Shield data container."""
    display_name: str
    internal_name: str
    size: int
    max_hp: float
    regen: float
    resist_physical: float
    resist_energy: float
    resist_distortion: float


class DataLoader:
    """Loads and manages game data."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.ships: dict[str, Ship] = {}
        self.weapons: dict[str, Weapon] = {}
        self.shields: dict[str, Shield] = {}
        self._load_all()

    def _load_csv(self, filename: str) -> list[dict]:
        """Load a CSV file and return list of dicts."""
        filepath = self.data_dir / filename
        if not filepath.exists():
            print(f"Warning: {filepath} not found")
            return []
        with open(filepath, 'r', encoding='utf-8') as f:
            return list(csv.DictReader(f))

    def _load_all(self):
        """Load all data files."""
        self._load_ships()
        self._load_weapons()
        self._load_shields()

    def _load_ships(self):
        """Load ship data with filtering."""
        # Filter patterns for AI variants
        filter_patterns = ['_ai_', '_pu_ai', '_ea_ai', '_teach', '_tutorial',
                          '_hijacked', '_derelict', '_wreck', 'fleetweek',
                          'citizencon', 'indestructible', 'gamemaster']

        parts_data = self._load_csv("ship_parts_comprehensive.csv")
        hardpoint_data = self._load_csv("ship_hardpoint_summary.csv")

        # Build hardpoint lookup
        hp_lookup = {}
        for hp in hardpoint_data:
            hp_lookup[hp.get('ship_name', '').upper()] = hp

        for row in parts_data:
            filename = row.get('filename', '')

            # Filter AI variants
            if any(p in filename.lower() for p in filter_patterns):
                continue

            ship_upper = filename.upper()
            hp_info = hp_lookup.get(ship_upper, {})

            pilot_count = int(hp_info.get('pilot_weapon_count', 0) or 0)
            if pilot_count == 0:
                continue

            display_name = self._format_ship_name(filename)

            ship = Ship(
                filename=filename,
                display_name=display_name,
                hull_hp=int(row.get('hull_hp_normalized', 0) or 0),
                armor_hp=int(row.get('armor_hp', 0) or 0),
                armor_resist_physical=float(row.get('armor_resist_physical', 1) or 1),
                armor_resist_energy=float(row.get('armor_resist_energy', 1) or 1),
                armor_resist_distortion=float(row.get('armor_resist_distortion', 1) or 1),
                thruster_main_hp=int(row.get('thruster_main_hp', 0) or 0),
                thruster_retro_hp=int(row.get('thruster_retro_hp', 0) or 0),
                thruster_mav_hp=int(row.get('thruster_mav_hp', 0) or 0),
                thruster_vtol_hp=int(row.get('thruster_vtol_hp', 0) or 0),
                thruster_total_hp=int(row.get('thruster_total_hp', 0) or 0),
                turret_total_hp=int(row.get('turret_total_hp', 0) or 0),
                powerplant_total_hp=int(row.get('powerplant_total_hp', 0) or 0),
                cooler_total_hp=int(row.get('cooler_total_hp', 0) or 0),
                shield_gen_total_hp=int(row.get('shield_gen_total_hp', 0) or 0),
                qd_total_hp=int(row.get('qd_total_hp', 0) or 0),
                pilot_weapon_count=pilot_count,
                pilot_weapon_sizes=hp_info.get('pilot_weapon_sizes', ''),
            )
            self.ships[display_name] = ship

    def _format_ship_name(self, filename: str) -> str:
        """Format ship filename into display name."""
        MANUFACTURERS = {
            'AEGS': 'Aegis', 'ANVL': 'Anvil', 'ARGO': 'Argo', 'BANU': 'Banu',
            'CNOU': 'Consolidated Outland', 'CRUS': 'Crusader', 'DRAK': 'Drake',
            'ESPR': 'Esperia', 'GAMA': 'Gatac', 'GLSN': 'Gallenson', 'KRIG': 'Kruger',
            'MISC': 'MISC', 'MRAI': 'Mirai', 'ORIG': 'Origin', 'RSI': 'RSI',
            'TMBL': 'Tumbril', 'VNCL': 'Vanduul', 'XIAN': "Xi'An",
        }

        NAME_FIXES = {
            'avenger': 'Avenger', 'stalker': 'Stalker', 'titan': 'Titan',
            'gladius': 'Gladius', 'eclipse': 'Eclipse', 'hammerhead': 'Hammerhead',
            'sabre': 'Sabre', 'vanguard': 'Vanguard', 'hornet': 'Hornet',
            'arrow': 'Arrow', 'hawk': 'Hawk', 'hurricane': 'Hurricane',
            'valkyrie': 'Valkyrie', 'carrack': 'Carrack', 'pisces': 'Pisces',
            'gladiator': 'Gladiator', 'terrapin': 'Terrapin', 'redeemer': 'Redeemer',
            'mole': 'MOLE', 'raft': 'RAFT', 'mpuv': 'MPUV', 'srv': 'SRV',
            'f7a': 'F7A', 'f7c': 'F7C', 'f7cm': 'F7C-M', 'f7cr': 'F7C-R',
            'f7cs': 'F7C-S', 'f8': 'F8', 'f8c': 'F8C', 'mk1': 'Mk I', 'mk2': 'Mk II',
            'c8': 'C8', 'c8r': 'C8R', 'c8x': 'C8X', 'a1': 'A1', 'a2': 'A2',
            'c1': 'C1', 'c2': 'C2', 'm2': 'M2', 'p52': 'P-52', 'p72': 'P-72',
            'mustang': 'Mustang', 'aurora': 'Aurora', 'constellation': 'Constellation',
            'freelancer': 'Freelancer', 'starfarer': 'Starfarer', 'prospector': 'Prospector',
            'cutlass': 'Cutlass', 'caterpillar': 'Caterpillar', 'corsair': 'Corsair',
            'buccaneer': 'Buccaneer', 'herald': 'Herald', 'vulture': 'Vulture',
            'defender': 'Defender', 'prowler': 'Prowler', 'talon': 'Talon',
            'nox': 'Nox', 'dragonfly': 'Dragonfly', 'razor': 'Razor', 'reliant': 'Reliant',
        }

        parts = filename.lower().split('_')
        if len(parts) < 2:
            return filename

        mfr_code = parts[0].upper()
        mfr_name = MANUFACTURERS.get(mfr_code, mfr_code)

        model_parts = []
        for part in parts[1:]:
            if part in NAME_FIXES:
                model_parts.append(NAME_FIXES[part])
            else:
                model_parts.append(part.title())

        return f"{mfr_name} {' '.join(model_parts)}"

    def _load_weapons(self):
        """Load weapon data."""
        weapons_data = self._load_csv("ship_weapons.csv")
        power_data = self._load_csv("weapon_power_data.csv")

        power_lookup = {}
        for p in power_data:
            power_lookup[p.get('filename', '').lower()] = float(p.get('power_consumption', 0) or 0)

        for row in weapons_data:
            display = row.get('display_name', row.get('filename', 'Unknown'))
            weapon = Weapon(
                display_name=display,
                filename=row.get('filename', ''),
                size=int(row.get('size', 0) or 0),
                damage_type=row.get('damage_type', 'Unknown'),
                sustained_dps=float(row.get('sustained_dps', 0) or 0),
                power_consumption=power_lookup.get(row.get('filename', '').lower(), 0),
            )
            if weapon.size > 0:
                self.weapons[display] = weapon

    def _load_shields(self):
        """Load shield data."""
        shields_data = self._load_csv("shields.csv")

        MFR_CODES = {
            'godi': 'Gorgon Defender', 'asas': 'ASAS', 'basl': 'Basilisk',
            'seco': 'Seal Corp', 'banu': 'Banu', 'behr': 'Behring',
        }

        for row in shields_data:
            name = row.get('name', '')
            if 'Template' in name:
                continue

            max_hp = float(row.get('shield_max_hp', 0) or 0)
            if max_hp <= 0:
                continue

            parts = name.lower().replace('_scitem', '').split('_')
            if len(parts) >= 4 and parts[0] == 'shld':
                mfr = MFR_CODES.get(parts[1], parts[1].title())
                model = ' '.join(p.title() for p in parts[3:])
                display = f"{mfr} {model}"
            else:
                display = name

            shield = Shield(
                display_name=display,
                internal_name=name,
                size=int(row.get('size', 0) or 0),
                max_hp=max_hp,
                regen=float(row.get('shield_regen', 0) or 0),
                resist_physical=float(row.get('resist_physical_avg', 0) or 0),
                resist_energy=float(row.get('resist_energy_avg', 0) or 0),
                resist_distortion=float(row.get('resist_distortion_avg', 0) or 0),
            )
            self.shields[display] = shield

    def get_ships_sorted(self) -> list[str]:
        """Get sorted list of ship names."""
        return sorted(self.ships.keys())

    def get_weapons_by_size(self, size: int) -> list[str]:
        """Get weapons of a specific size, sorted by DPS."""
        weapons = [(n, w) for n, w in self.weapons.items() if w.size == size]
        weapons.sort(key=lambda x: -x[1].sustained_dps)
        return [n for n, _ in weapons]

    def get_shields_by_size(self, size: int) -> list[str]:
        """Get shields of a specific size, sorted by HP."""
        shields = [(n, s) for n, s in self.shields.items() if s.size == size]
        shields.sort(key=lambda x: -x[1].max_hp)
        return [n for n, _ in shields]


class StatCard(QFrame):
    """A styled card for displaying a stat."""

    def __init__(self, label: str, value: str = "0", unit: str = "", color: str = None):
        super().__init__()
        self.setProperty("class", "stat-card")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 8, 12, 8)
        layout.setSpacing(4)

        self.label = QLabel(label)
        self.label.setStyleSheet(f"color: {SC_COLORS['text_secondary']}; font-size: 10px;")

        value_layout = QHBoxLayout()
        self.value = QLabel(value)
        color = color or SC_COLORS['accent_cyan']
        self.value.setStyleSheet(f"color: {color}; font-size: 18px; font-weight: bold;")

        self.unit = QLabel(unit)
        self.unit.setStyleSheet(f"color: {SC_COLORS['text_muted']}; font-size: 12px;")

        value_layout.addWidget(self.value)
        value_layout.addWidget(self.unit)
        value_layout.addStretch()

        layout.addWidget(self.label)
        layout.addLayout(value_layout)

    def set_value(self, value: str):
        self.value.setText(value)


class ShipLensWindow(QMainWindow):
    """Main application window."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ship Lens - Star Citizen Damage Calculator")
        self.setMinimumSize(1400, 900)

        # Load data
        self.data = DataLoader(DATA_DIR)

        # Setup UI
        self._setup_ui()

    def _setup_ui(self):
        """Setup the main UI."""
        central = QWidget()
        self.setCentralWidget(central)

        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(20)

        # Left panel - Configuration
        left_panel = self._create_config_panel()
        main_layout.addWidget(left_panel, stretch=1)

        # Right panel - Results
        right_panel = self._create_results_panel()
        main_layout.addWidget(right_panel, stretch=1)

    def _create_config_panel(self) -> QWidget:
        """Create the configuration panel."""
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setSpacing(15)

        # Title
        title = QLabel("SHIP LENS")
        title.setProperty("class", "title")
        layout.addWidget(title)

        subtitle = QLabel("Star Citizen Damage Calculator")
        subtitle.setStyleSheet(f"color: {SC_COLORS['text_secondary']}; font-size: 12px;")
        layout.addWidget(subtitle)

        layout.addSpacing(10)

        # Your Ship section
        your_ship_group = QGroupBox("YOUR SHIP")
        your_ship_layout = QGridLayout(your_ship_group)

        your_ship_layout.addWidget(QLabel("Ship:"), 0, 0)
        self.your_ship_combo = QComboBox()
        self.your_ship_combo.addItems(self.data.get_ships_sorted())
        self.your_ship_combo.currentTextChanged.connect(self._on_your_ship_changed)
        your_ship_layout.addWidget(self.your_ship_combo, 0, 1)

        your_ship_layout.addWidget(QLabel("Weapon Slots:"), 1, 0)
        self.weapon_slots_label = QLabel("--")
        self.weapon_slots_label.setStyleSheet(f"color: {SC_COLORS['accent_cyan']};")
        your_ship_layout.addWidget(self.weapon_slots_label, 1, 1)

        layout.addWidget(your_ship_group)

        # Combat Scenario section
        scenario_group = QGroupBox("COMBAT SCENARIO")
        scenario_layout = QGridLayout(scenario_group)

        scenario_layout.addWidget(QLabel("Scenario:"), 0, 0)
        self.scenario_combo = QComboBox()
        self.scenario_combo.addItems(["Dogfight", "Synthetic Test", "Jousting", "Custom"])
        scenario_layout.addWidget(self.scenario_combo, 0, 1)

        scenario_layout.addWidget(QLabel("Mount Type:"), 1, 0)
        self.mount_combo = QComboBox()
        self.mount_combo.addItems(["Fixed", "Gimballed", "Turret", "Auto-Gimbal"])
        self.mount_combo.setCurrentText("Gimballed")
        scenario_layout.addWidget(self.mount_combo, 1, 1)

        scenario_layout.addWidget(QLabel("Fire Mode:"), 2, 0)
        self.fire_combo = QComboBox()
        self.fire_combo.addItems(["Sustained", "Burst", "Staggered"])
        scenario_layout.addWidget(self.fire_combo, 2, 1)

        layout.addWidget(scenario_group)

        # Target section
        target_group = QGroupBox("TARGET")
        target_layout = QGridLayout(target_group)

        target_layout.addWidget(QLabel("Target Ship:"), 0, 0)
        self.target_ship_combo = QComboBox()
        self.target_ship_combo.addItems(self.data.get_ships_sorted())
        self.target_ship_combo.currentTextChanged.connect(self._on_target_ship_changed)
        target_layout.addWidget(self.target_ship_combo, 0, 1)

        target_layout.addWidget(QLabel("Target Zone:"), 1, 0)
        self.zone_combo = QComboBox()
        self.zone_combo.addItems(["Center Mass", "Engines", "Cockpit", "Wings/Extremities", "Turrets"])
        target_layout.addWidget(self.zone_combo, 1, 1)

        target_layout.addWidget(QLabel("Shield:"), 2, 0)
        self.shield_combo = QComboBox()
        target_layout.addWidget(self.shield_combo, 2, 1)

        layout.addWidget(target_group)

        layout.addStretch()

        # Trigger initial update
        if self.data.get_ships_sorted():
            self._on_your_ship_changed(self.data.get_ships_sorted()[0])
            self._on_target_ship_changed(self.data.get_ships_sorted()[0])

        return panel

    def _create_results_panel(self) -> QWidget:
        """Create the results panel."""
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setSpacing(15)

        # TTK Header
        ttk_group = QGroupBox("TIME TO KILL")
        ttk_layout = QVBoxLayout(ttk_group)

        self.ttk_label = QLabel("--")
        self.ttk_label.setProperty("class", "ttk")
        self.ttk_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ttk_layout.addWidget(self.ttk_label)

        ttk_sub = QLabel("seconds")
        ttk_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ttk_sub.setStyleSheet(f"color: {SC_COLORS['text_secondary']};")
        ttk_layout.addWidget(ttk_sub)

        layout.addWidget(ttk_group)

        # Stats grid
        stats_group = QGroupBox("TARGET BREAKDOWN")
        stats_layout = QGridLayout(stats_group)
        stats_layout.setSpacing(10)

        self.shield_hp_card = StatCard("Shield HP", "0", "HP", SC_COLORS['shield_blue'])
        self.hull_hp_card = StatCard("Hull HP", "0", "HP", SC_COLORS['hull_orange'])
        self.armor_hp_card = StatCard("Armor HP", "0", "HP", SC_COLORS['armor_red'])
        self.thruster_hp_card = StatCard("Thruster HP", "0", "HP", SC_COLORS['accent_cyan'])

        stats_layout.addWidget(self.shield_hp_card, 0, 0)
        stats_layout.addWidget(self.hull_hp_card, 0, 1)
        stats_layout.addWidget(self.armor_hp_card, 1, 0)
        stats_layout.addWidget(self.thruster_hp_card, 1, 1)

        layout.addWidget(stats_group)

        # Components
        comp_group = QGroupBox("COMPONENTS")
        comp_layout = QGridLayout(comp_group)
        comp_layout.setSpacing(10)

        self.pp_card = StatCard("Power Plants", "0", "HP", SC_COLORS['component_green'])
        self.cooler_card = StatCard("Coolers", "0", "HP", SC_COLORS['component_green'])
        self.shield_gen_card = StatCard("Shield Gens", "0", "HP", SC_COLORS['component_green'])
        self.qd_card = StatCard("Quantum Drive", "0", "HP", SC_COLORS['component_green'])

        comp_layout.addWidget(self.pp_card, 0, 0)
        comp_layout.addWidget(self.cooler_card, 0, 1)
        comp_layout.addWidget(self.shield_gen_card, 1, 0)
        comp_layout.addWidget(self.qd_card, 1, 1)

        layout.addWidget(comp_group)

        layout.addStretch()

        return panel

    def _on_your_ship_changed(self, ship_name: str):
        """Handle your ship selection change."""
        ship = self.data.ships.get(ship_name)
        if ship:
            self.weapon_slots_label.setText(f"{ship.pilot_weapon_count} ({ship.pilot_weapon_sizes})")

    def _on_target_ship_changed(self, ship_name: str):
        """Handle target ship selection change."""
        ship = self.data.ships.get(ship_name)
        if ship:
            self.hull_hp_card.set_value(f"{ship.hull_hp:,}")
            self.armor_hp_card.set_value(f"{ship.armor_hp:,}")
            self.thruster_hp_card.set_value(f"{ship.thruster_total_hp:,}")
            self.pp_card.set_value(f"{ship.powerplant_total_hp:,}")
            self.cooler_card.set_value(f"{ship.cooler_total_hp:,}")
            self.shield_gen_card.set_value(f"{ship.shield_gen_total_hp:,}")
            self.qd_card.set_value(f"{ship.qd_total_hp:,}")

            # Update shield dropdown based on ship's shield size
            # For now just show all shields
            self.shield_combo.clear()
            all_shields = sorted(self.data.shields.keys())
            self.shield_combo.addItems(all_shields)


def main():
    """Application entry point."""
    app = QApplication(sys.argv)
    app.setStyleSheet(SC_STYLESHEET)

    # Try to load a sci-fi font
    font_dirs = [
        "/usr/share/fonts/google-orbitron",
        "/usr/share/fonts/truetype/orbitron",
        Path.home() / ".fonts",
    ]
    for font_dir in font_dirs:
        if Path(font_dir).exists():
            for font_file in Path(font_dir).glob("*.ttf"):
                QFontDatabase.addApplicationFont(str(font_file))

    window = ShipLensWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
