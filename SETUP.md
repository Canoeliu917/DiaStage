# Pascal Editor — Setup

## Prerequisites

- [Bun](https://bun.sh/) 1.3+ and Node.js 22.13+ (account authentication uses `node:sqlite`; verified on Node.js 24.19).

## Quick Start

```bash
bun install
bun dev
```

The editor will be running at **http://localhost:3002**.

## Environment Variables (optional)

Copy `.env.example` to `.env` if you need:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Dev server port (default: 3002) |
| `MINT_PASCAL_HOST_ORIGIN` | No | Public editor origin used by Mint sign-in and request checks. Set it for self-hosted deployments. |

Local development and the official hosted editor work without any environment variables.

## DiaStage private accounts

Accounts use Better Auth 1.7.7 with email/password authentication (minimum 10 characters).
Run the Next.js server with Node.js. This Bun version is used to install/build, not to run
the authentication server. Set `BETTER_AUTH_URL` to the exact website origin; it defaults
to `http://127.0.0.1:4329`. Public origins require HTTPS and a random, server-only
`BETTER_AUTH_SECRET` of at least 32 characters. Keep it stable between restarts.

The authentication database `auth.sqlite` lives beside the scene database, resolved
through `PASCAL_DB_PATH`, then `PASCAL_DATA_DIR`, then the existing per-user Pascal data
directory. A loopback website without an environment secret creates `auth.secret` there.
Keep this directory private and back up the database and secret together. Cookie caching
is disabled, so revoked sessions are checked against the database on subsequent requests.

SMTP, email verification and public password-recovery email are not configured in this
version. Registration does not prove control of an email address and never grants access
to old scenes by matching an email. The initial owner's legacy scenes are assigned only
through the local CLI below. Stop the server while reserving this owner account.

Build the CLI from the repository root, using the same environment/data path as the server:

```sh
bun build scripts/bootstrap-owner.ts --outfile .local/bootstrap-owner.mjs --target node --external better-auth --external 'better-auth/*' --external bun:sqlite
node --env-file=.env.local .local/bootstrap-owner.mjs --email owner@example.com --scene-ids exact-id-1,exact-id-2
node --env-file=.env.local .local/bootstrap-owner.mjs --email owner@example.com --scene-ids exact-id-1,exact-id-2 --apply
```

Omit `--env-file=.env.local` when the environment is already supplied. Without `--apply`,
the CLI only inspects the exact IDs. With `--apply`, it creates consistent SQLite backups
under `<data directory>/backups/owner-bootstrap-*` before changing ownership. It reserves
a new account with an inaccessible random password, updates only `scenes.owner_id`, and
writes a private `owner-setup-*.json` beside the databases. Open the URL in that local file
to choose the owner's password; the console never prints the password or token.

The setup link expires after one hour and can be used once. To reissue it, run the same
CLI with the same email and exact scene IDs; old setup tokens are invalidated. The CLI
refuses an existing account without its matching local bootstrap record, a different
reserved owner, additional scene IDs, or scenes owned by another account. Do not expose
the setup file, bootstrap script or private data directory through the web server.

Authentication integration checks use isolated temporary databases:

```sh
bun build apps/editor/lib/auth/auth.integration.ts --outfile .local/auth.integration.mjs --target node --external better-auth --external 'better-auth/*' --external bun:sqlite
node --test .local/auth.integration.mjs
```

## Docker

```bash
docker compose up -d
```

The editor will be running at **http://localhost:3000**. Saved scenes live in
the `pascal-data` volume, so they survive `docker compose down`.

Docker defaults `MINT_PASCAL_HOST_ORIGIN` to `http://localhost:3000`. Override
it when hosting Pascal at another origin:

```bash
MINT_PASCAL_HOST_ORIGIN=https://pascal.example.com docker compose up -d
```

Keep the container port at 3000: the `/scenes` page fetches its own API through
a base URL that only `NEXT_PUBLIC_APP_URL` can override, and Next inlines that
value at build time, so remapping the port to something else makes the page
return 500.

## CLI-managed editor

Node.js 22.13 or newer can install a persistent local runtime, start it in the
background, and open it in the browser without a repository checkout:

```bash
npx @pascal-app/cli editor
```

The command starts the editor and its authenticated local MCP service together. Configure
an agent to launch `pascal mcp connect`; for example, run `pascal mcp setup codex`.

Use `npx @pascal-app/cli doctor` to check the runtime, storage, editor, and MCP state. Saved
scenes live in `~/.pascal/data/pascal.db` independently from installed runtime versions.
The CLI retains old runtime versions for rollback and warns after more than three have
accumulated. It also replaces a damaged copy of its bundled runtime on the next start;
neither operation modifies the data directory.
The complete command and storage reference is in [Run Pascal
locally](https://editor.pascal.app/docs/developers/local-editor).

## Monorepo Structure

```
├── apps/
│   └── editor/          # Next.js editor application
├── packages/
│   ├── core/            # @pascal-app/core — Scene schema, state, systems
│   ├── viewer/          # @pascal-app/viewer — 3D rendering
│   └── ui/              # Shared UI components
└── tooling/             # Build & release tooling
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start the development server |
| `bun build` | Build all packages |
| `bun check` | Lint and format check (Biome) |
| `bun check:fix` | Auto-fix lint and format issues |
| `bun check-types` | TypeScript type checking |
| `bun run test` | Run every package's test suite |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on submitting PRs and reporting issues.
