# DiaStage local CLI

This package starts the local DiaStage editor, manages local projects, and connects MCP clients. The published package name and `pascal` executable remain compatibility identifiers for the existing portable runtime; the user-facing application is DiaStage.

```sh
npx @pascal-app/cli editor
```

Useful commands:

```text
pascal editor [--foreground] [--no-open] [--port <n>]
pascal stop | restart | status
pascal open [project]
pascal projects [--json]
pascal logs [--follow]
pascal doctor [--json]
pascal mcp connect | status | config | setup <client>
```

The editor and MCP service bind to loopback by default. Project data is stored outside the installed runtime so an update does not replace scenes. The packaged runtime excludes source files, build configuration, source maps, native rendering modules, and development-only dependencies.

DiaStage does not load Pascal community presets or hosted asset catalogs. The CLI keeps only the open-source runtime needed by local stage editing, saving, script extraction, and MCP scene queries.

## Requirements

- Node.js 22.13 or newer
- npm for global installation and packed-runtime smoke tests
- A browser unless `--no-open` is used

## Validation

```sh
cd packages/cli
bun run check-types
bun run build
bun run test
```

The release smoke additionally builds the editor with `PASCAL_PORTABLE_BUILD=1`, stages the runtime, packs it, starts it on an available loopback port, exercises PDF extraction and MCP, and checks that no native `.node` module is present.

## License

MIT. The original Pascal notice is retained in this directory and in `LICENSES/PASCAL-MIT.txt` at the repository root.
