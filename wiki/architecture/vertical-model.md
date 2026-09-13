# Vertical Model

DiaStage uses a stage coordinate model: X/Z form the floor plane, Y points upward, distances are metres, and rotations are radians.

## Active vertical data

- A level provides the local stage frame used by its child nodes.
- Walls have an authored base and height.
- Platforms (`slab`) have an elevation and thickness that extends downward.
- Floor-placed objects and stage steps resolve their support height from the active platform or the level plane.
- Doors, windows, shelves, and wall-mounted objects use wall-local vertical offsets.

Stage steps keep only total width, tread height, tread depth, step count, position, and orientation in the editing workflow. They do not cut floors, follow building storeys, or open ceilings.

## Invariants

- Creation and movement write explicit finite values.
- Missing legacy values are resolved conservatively; compatibility loading must not mutate and resave the source scene on first open.
- Live drag state stays in viewer/editor overrides. The store receives one update when the gesture ends.
- Collision, measurement, undo, saving, and remount use the same metre-based coordinates regardless of FPS, DPR, shadows, or post-processing.

## Removed building semantics

Roof, ceiling, terrain, automatic room enclosure, automatic floor/ceiling generation, and stair opening logic are not active systems. Old fields required to parse an existing project stay in the architecture archive only. They are hidden from rendering and editing until the user explicitly migrates or removes them.
