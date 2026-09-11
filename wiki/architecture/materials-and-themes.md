# Materials and Themes

DiaStage materials describe stage surfaces. The active surface roles are `wall`, `floor`, `joinery`, `glazing`, and `furnishing`.

## Ownership

- Core stores material references and role metadata.
- Registered node renderers apply materials to their own geometry.
- Viewer utilities load textures, reuse materials, and dispose GPU resources.
- The editor exposes material paint inside the Set workflow.

No runtime path requests the Pascal online catalog. DiaStage loads bundled stage assets or user-owned uploads from the current origin. Community presets and residential material packs are removed.

## Rendering rules

- A missing texture falls back to the role colour without changing scene geometry.
- Texture and material caches are keyed by normalized local references and cleared on viewer teardown.
- Material changes are scene transactions; hover and paint previews remain transient.
- Internal neutral lighting may shade a material, but users cannot add or edit lights.
- Disabling textures, shadows, or post-processing changes presentation only. It must not change dimensions, coordinates, collision, stage orientation, or Remount results.

## Compatibility

Old roof, ceiling, terrain, and building-finish references may survive inside the hidden compatibility archive so old scenes open safely. They are not registered as active roles, listed in the material UI, rendered, or rewritten automatically.
