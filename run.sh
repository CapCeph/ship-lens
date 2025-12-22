#!/bin/bash
# Ship Lens launcher script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check for PyQt6
if ! python3 -c "import PyQt6" 2>/dev/null; then
    echo "Installing PyQt6..."
    pip install PyQt6
fi

# Run the application
python3 "$SCRIPT_DIR/src/ship_lens.py"
