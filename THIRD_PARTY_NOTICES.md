# Third-Party Notices

DiaStage includes software derived from
[Pascal Editor](https://github.com/pascalorg/editor). Files copied or modified
from Pascal Editor remain available under the MIT License and retain the
original copyright notice:

> Copyright (c) 2026 Pascal Group Inc.

The complete license is in
[`LICENSES/PASCAL-MIT.txt`](LICENSES/PASCAL-MIT.txt).

Pascal-derived code is present in these areas:

- `apps/editor/`, including the editor shell and files modified for DiaStage
- `packages/core/`
- `packages/viewer/`
- `packages/editor/`
- `packages/nodes/`
- `packages/mcp/`
- `packages/cli/`
- `packages/capture-viewer/`
- `packages/capture-protocol/`
- upstream build, tooling, workflow, and architecture files retained from
  Pascal Editor

Each distributed Pascal package keeps its own `LICENSE` file. Original
DiaStage additions within these directories are covered by
[`DIASTAGE_COPYRIGHT.md`](DIASTAGE_COPYRIGHT.md) unless a file states otherwise.

## Other third-party components

- Source Han Sans is licensed under the SIL Open Font License 1.1. Its notice
  is retained at `apps/editor/app/fonts/source-han-sans/LICENSE.txt`.
- Installed packages and patched dependencies retain the licenses supplied by
  their respective authors. Their versions and sources are recorded in the
  package manifests, lockfile, and `patches/` directory.
