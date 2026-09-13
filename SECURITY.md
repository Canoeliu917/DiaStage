# Security policy

## Reporting a vulnerability

Do not publish a security problem in an issue, pull request, or discussion. Use the private vulnerability reporting form in the [DiaStage repository security tab](https://github.com/Canoeliu917/DiaStage/security/advisories/new).

Include the affected route or package, version or commit, reproduction steps, and expected impact. A proof of concept helps but is not required.

## Supported versions

Only the latest DiaStage release receives security fixes. Internal package names that still use the `@pascal-app/*` namespace are compatibility identifiers and do not identify a separately hosted Pascal service.

## Scope

In scope:

- The local DiaStage editor in `apps/editor`.
- Scene persistence, mobile pairing, script extraction, scan upload, recording, and MCP boundaries.
- Parsers, renderers, migrations, and stored graphs that accept untrusted scene data.

Out of scope:

- Code a user deliberately runs in the browser console.
- Automated scanner output with no demonstrated impact.

DiaStage does not operate or test the separately hosted `editor.pascal.app` service.
