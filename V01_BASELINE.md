# DiaStage V0.1 Rehearsal Intelligence baseline

Frozen on 2026-09-11, on `codex/mobile-voice-stage-link`, following remote baseline `83fdcea7`. This is an engineering baseline, not a Public Beta release.

The product contract is Proposal → Ghost Preview → Human Decision → Formal Rehearsal → Feedback. AI proposes; humans choose, edit, partially adopt or reject. Formal writes require a human decision after preview.

## Re-run before freezing

| Command | Result |
| --- | --- |
| `bun run check` | PASS, 1,383 files, zero errors; one existing informational dependency diagnostic |
| `bun run check-types` | PASS, 9 tasks |
| `bun test apps/editor/lib/rehearsal-intelligence/rehearsal-intelligence.test.ts` | PASS, 11 tests, 262 assertions |
| `bun run test --concurrency=1` | PASS, 2,707 tests, zero failures, one existing skip; 14 tasks |
| `bun run build` | PASS, 8 tasks |
| `bun apps/editor/lib/rehearsal-intelligence/eval.ts --manifest` | PASS, 100 original unreviewed candidates |

Validation used Bun 1.3.14 on desktop Windows. Cached tasks are included where Turbo verified unchanged inputs. No tests or assertions were removed to pass this baseline.

## Privacy scope

The pending baseline diff was reviewed: 18 synthetic screenshots and text evidence contain no real scripts, recordings, scans, identities, accounts or API keys. Detector file references are repository-relative. Temporary files, private evaluation outputs and local databases are ignored. The existing `data/pascal.db` was removed from the Git index only; the user's disk file remains intact.

That database already existed in the remote baseline's history. This commit does **not** remove historical Git objects. No history rewrite, main modification, merge or deployment was performed.

## Release gates remain open

- Ontology: 8 / 38, `complete = false`. The remaining dimensions require product definitions; they do not block engineering.
- Candidates: 100; human reviewed: 0; Gold: 0.
- Real model evaluation and iPhone Safari, iPad Safari, Android Chrome acceptance: NOT_RUN.
- Screenshots and synthetic browser interactions are not mobile device or model-quality evidence.
- Public Beta: NOT READY. Requires Gold Alpha 20 with human-reviewed real outputs, three actual device runs, and 1–3 independent usability sessions.
- No model training, automatic preference pairs or automatic adoption.
