# UUID LAN P0 repair checkpoint — 2026-09-14

Status: UUID code repair verified locally; LAN restart, LAN authentication, and physical iPad acceptance remain blocked. The remaining 8 Real Device QA cases stay paused.

## Baseline and scope

- Branch: codex/dia-open-language-v01-20260914
- Starting HEAD: b1fdd57e009e80072be45d4c82b1a1343ceca768; clean before edits.
- Remote: https://github.com/Canoeliu917/DiaStage.git
- No merge, deploy, main change, formal Scene writes, or authentication-policy change.
- All 23 existing production files change only UUID calls/imports (plus formatting the shortened UUID ternary). An exact reverse-substitution check matched their original content.
- Scene schema definitions, persisted ID prefixes/formats, revision semantics, runtime transforms, Knowledge catalog, solver, Camera behavior and Proposal authority are unchanged.

## Root cause and complete scope

HTTP LAN origins are not secure contexts. crypto.randomUUID is secure-context-only; crypto.getRandomValues remains available on HTTP in supporting browsers.
References: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID and https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues.

39 browser/shared production calls across 23 files now use apps/editor/lib/uuid.ts, createUUID(). Native crypto methods retain their receiver. The fallback requests 16 secure random bytes, sets version 4 and RFC variant 10, and returns the unchanged 36-character UUID format. No Math.random or dependency. Missing secure randomness throws a clear error.

The new-stage flow is ManualStageEntry -> createManualStageGraph -> createTheatreSceneGraph -> createStageSceneDocument. New production also uses createTheatreSceneGraph. Reviewed-plan creation additionally allocates a client scene ID in command-input.tsx. All use the helper after this patch.

Original browser call sites (line numbers refer to the starting commit):

- apps/editor/components/theatre/versions-panel.tsx — 96, 141
- apps/editor/components/theatre/simulation-panel.tsx — 329, 471
- apps/editor/components/camera-studio/runtime.tsx — 174
- apps/editor/components/camera-studio/presets.ts — 4, 13
- apps/editor/lib/theatre/simulation.ts — 78, 79
- apps/editor/lib/theatre/schema.ts — 282
- apps/editor/components/stage-entry/command-input.tsx — 86, 260
- apps/editor/lib/rehearsal-intelligence/build-feedback.ts — 79
- apps/editor/components/stage-entry/mobile-dia.tsx — 225
- apps/editor/lib/rehearsal-intelligence/authority.ts — 147, 298
- apps/editor/lib/rehearsal-intelligence/conversation-controller.ts — 350, 405, 756, 1347
- apps/editor/lib/stage/command-executor.ts — 89, 90, 381, 532, 533
- apps/editor/components/stage-entry/manual-stage-panel.tsx — 135
- apps/editor/components/stage-entry/scan-transfer.tsx — 115
- apps/editor/lib/rehearsal-intelligence/conversation.ts — 78
- apps/editor/lib/rehearsal-intelligence/desktop-benchmark.ts — 21
- apps/editor/lib/rehearsal-intelligence/open-language-proposal.ts — 80
- apps/editor/components/stage-entry/remote-voice-controller.tsx — 198
- apps/editor/lib/stage/creation-policy.ts — 59
- apps/editor/lib/rehearsal-intelligence/proposal-generator.ts — 31, 50, 54
- apps/editor/lib/stage/stage-presets.ts — 46
- apps/editor/lib/rehearsal-intelligence/knowledge/stage-proposal.ts — 270
- apps/editor/lib/rehearsal-intelligence/synthetic-demo.ts — 36, 44

Server-only native UUID calls remain in lib/ai/api.ts, lib/ai/usage.ts, lib/ai/creation-permission.ts, lib/remote-voice/session-store.ts, lib/rehearsal-intelligence/real-eval.ts, packages/cli, packages/mcp and Node QA harnesses. Test-fixture UUID calls are not product browser entry points.

## Separate first real LAN error

Read-only checks both before and after the repair:
- http://192.168.50.86:4330/api/scenes => 503, {"error":"scene_api_token_required"}
- http://192.168.50.86:4330/scenes => 500
- http://127.0.0.1:4330/api/scenes => 200, empty list
- http://127.0.0.1:4330/scenes => 200

scene-api-security.ts denies a non-loopback Host without PASCAL_SCENE_API_TOKEN. getScenePageOperations enforces the same guard and throws for server-rendered scene pages. This is independent of UUID. Setting a server token alone is insufficient: the browser must also authenticate through a supported flow. No guard was bypassed, LAN was not treated as loopback, and no secret was exposed.

4330 PID 1704 and its parent have Windows-hidden command lines. The exact launch command and PASCAL_DB_PATH were requested from the user; not yet received. The LAN process was not stopped/replaced and its database was not guessed.
Original Desktop 127.0.0.1:4329 PID 17828 remained running and untouched.

## Verification

- Before routing callers: helper tests 5 pass, 2 client-creation tests fail, reproducing the reported error.
- After: UUID suite 8/8 pass, including native receiver/preference, secure fallback, bit/format checks, 10,000 unique IDs, no-crypto failure, throwing entropy source, Desktop/fallback client scene graphs, and static browser-call-site regression guard.
- Targeted regression group: 138 pass, 0 fail (25 files, includes UUID tests, theatre, scene creation, commands, creation policy, conversation/authority and Camera Studio).
- Additional regression group: 394 pass, 0 fail (9 files, includes Camera canonical eval, Knowledge/authority and related requested test filters).
- Total targeted tests: 532 pass, 0 fail. Full repository suite was not rerun for this patch.
- Editor typecheck: PASS.
- Production build: PASS (rerun after final production edits).
- Biome: new helper/test PASS; 25 changed app files checked, 4 existing issues remain. Baseline git-show checks reproduce those failures in manual-stage-panel.tsx (format), conversation-controller.ts, open-language-proposal.ts, command-executor.ts (import order). No unrelated cleanup. scripts/*.mjs is excluded by existing Biome config.
- git diff --check: PASS.

## Browser evidence and data safety

scripts/uuid-browser.mjs runs only against the dedicated empty loopback QA service at 127.0.0.1:4331 and reads 4329 for formal-data snapshots.
Production browser tests use Chromium with a tablet viewport, first native crypto then randomUUID explicitly unavailable. They are not physical iPad/Safari results.

6/6 checks PASS: manual create/open, My Productions list/reopen, and new production client chain, in both modes. pageerror = 0.

Only .local/uuid-p0-qa.db was used for browser mutations. Exact created/deleted IDs:
- 51f9e0326a50
- 00dc0f2748c8
- 7d93625ec9bb
- 661a4ca2d9c7

QA remaining count = 0. Deleted QA scenes are disposable test data; there is no UI recovery guarantee. The temporary 4331 process was stopped after its exact PID/command/port were checked. The original 4329/4330 listeners were left running.

Formal count = 3 before/after; complete API response SHA-256 and versions unchanged:
- fcc2fff436ea: version 122; 832cad1d24c05099f8984db6846e4d3c24909ad8049e15d1d71b0b53fff4c31f
- 71de52238204: version 22; 6e16c2e893ab27b2e03bb12e491a170e0487bca34e8027a6bc21df69ad1c46f0
- 8537cf7594fb: version 190; 55e65d9977f54b7cfdc89749aefbaf0eecb85e38ef5fdb896ab73f5ab31aaf61

No formal data endpoints received writes from this QA harness. Revision history tables were not independently exported.

## Remaining acceptance

Physical iPad new stage, My Productions, reopening QA Scene and pageerror: NOT VERIFIED.
LAN 4330 restart: NOT DONE pending exact launch/QA database configuration.
LAN list: still FAILS with the separate authentication error above.
Do not resume the remaining 8 Real Device QA cases until LAN access is safely configured and the physical device passes.
