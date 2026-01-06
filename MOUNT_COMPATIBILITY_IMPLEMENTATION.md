# Mount-to-Hardpoint Compatibility System

## Overview

Implemented proper mount-to-hardpoint compatibility filtering using explicit `compatible_mounts` lists in ship JSON files. This ensures that only appropriate mounts are shown for each hardpoint.

## Implementation Details

### 1. Ship JSON Schema Update

Added `compatible_mounts` field to weapon hardpoints:

```json
{
  "port_name": "hardpoint_class_4_nose",
  "max_size": 4,
  "gimbal_type": "Turret",
  "category": "pilot",
  "compatible_mounts": ["anvl_hornet_f7c_nose_turret"],
  "sub_ports": [...]
}
```

**Example: Anvil F7C Hornet**
- **S4 Nose Hardpoint**: Only accepts `anvl_hornet_f7c_nose_turret` (2x S1 weapons)
- **S5 Center Ball Turret**: Accepts `anvl_hornet_f7c_ball_turret` (2x S2) or `anvl_fixed_mount_hornet_ball_s4` (1x S4 fixed)

### 2. Backend Updates (Rust)

**File: `src-tauri/src/data.rs`**
```rust
pub struct WeaponHardpoint {
    // ... existing fields ...
    #[serde(default)]
    pub compatible_mounts: Vec<String>,  // explicit list of compatible mount refs
    pub sub_ports: Vec<SubPort>,
}
```

**File: `src-tauri/src/lib.rs`**
```rust
fn get_mounts_by_max_size(
    state: State<AppState>,
    max_size: i32,
    ship_ref: Option<String>,
    compatible_mounts: Option<Vec<String>>  // NEW PARAMETER
) -> Vec<Mount> {
    // If compatible_mounts list provided, use explicit filtering
    // Otherwise, fall back to legacy ship_ref-based filtering
}
```

**Filtering Logic:**
1. **Explicit List** (highest priority): If `compatible_mounts` is provided, return only those exact mounts
2. **Ship-Based Filtering** (fallback): If no explicit list, use manufacturer/model matching + generic mounts
3. **Size Check**: Always enforce `mount.size <= hardpoint.max_size`

### 3. Frontend Updates (TypeScript)

**File: `src/main.ts`**

Updated `WeaponHardpoint` interface:
```typescript
interface WeaponHardpoint {
  // ... existing fields ...
  compatible_mounts?: string[];  // explicit list of compatible mount refs
  sub_ports: SubPort[];
}
```

Updated `getMountsByMaxSize` function:
```typescript
async function getMountsByMaxSize(
  maxSize: number,
  shipRef?: string,
  compatibleMounts?: string[]  // NEW PARAMETER
): Promise<Mount[]>
```

Updated mount selection popup:
```typescript
// Use explicit compatible_mounts list if available, otherwise fall back to ship-based filtering
const compatibleMounts = hardpoint.compatible_mounts && hardpoint.compatible_mounts.length > 0
  ? hardpoint.compatible_mounts
  : undefined;
const mounts = await getMountsByMaxSize(maxSize, shipRef, compatibleMounts);
```

## Benefits

1. **Precise Control**: Ship designers can explicitly define which mounts are compatible with each hardpoint
2. **No Type/SubType Complexity**: Avoids needing to extract and match P4K Type/SubType/Tags data
3. **Erkul-Compatible**: Matches the approach used by Erkul (explicit whitelist per hardpoint)
4. **Backward Compatible**: Falls back to ship-ref filtering if no `compatible_mounts` specified
5. **Easy to Maintain**: Simple JSON arrays are easier to update than complex tag matching logic

## Testing

**Test Case: Anvil F7C Hornet**

1. Select "Anvil F7C Hornet Mk I" as attacker ship
2. Click mount selector for S4 Nose hardpoint
3. **Expected**: Only "Anvil Hornet F7C Nose Turret" should appear
4. Click mount selector for S5 Center hardpoint
5. **Expected**: Only "C4-160f S5 Hornet Ball Turret" and "Specialty Hornet S5 VariPuck Mount" should appear

## Future Work

For ships without `compatible_mounts` defined, the system falls back to generic filtering:
- Generic mounts: `mount_gimbal_s*`, `mount_fixed_s*`, `entityclassdefinition.mount_*`, VariPuck, TMSB
- Ship-specific mounts: manufacturer + model name matching

Eventually, all ship JSON files should be updated with explicit `compatible_mounts` lists for full P4K accuracy.

## Files Modified

### Data Files
- `/home/kengonza/Documents/ShipLens/data/ships/anvl_hornet_f7c.json`

### Rust Backend
- `/home/kengonza/Documents/ShipLens/src-tauri/src/data.rs`
- `/home/kengonza/Documents/ShipLens/src-tauri/src/lib.rs`

### TypeScript Frontend
- `/home/kengonza/Documents/ShipLens/src/main.ts`

## Notes

- The `compatible_mounts` field is optional and defaults to an empty list if not present
- Mounts in the `compatible_mounts` list must exist in `data/mounts.json`
- Size validation (`mount.size <= hardpoint.max_size`) is always enforced regardless of explicit lists
