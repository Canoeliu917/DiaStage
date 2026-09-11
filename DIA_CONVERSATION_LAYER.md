# Dia Conversation Layer

Implemented on 2026-09-12 over `2c91f0e7`, on `codex/mobile-voice-stage-link`. This is an engineering increment to the frozen V0.1 baseline, not a public release or a real-model quality evaluation.

**AI proposes. The stage previews. Humans decide.**

## Results

| Requested item | Status | Evidence / limit |
| --- | --- | --- |
| Dia Conversation | PARTIAL | Complete engineering and synthetic flow; real-model quality and first-time independent user acceptance remain untested |
| Desktop | PASS | Chrome 1440 × 1000, real app, scene store, server and IndexedDB |
| Mobile Assistant | PARTIAL | Real paired browser sessions work; Chromium touch SIMULATION only |
| Default Mode | PASS | “一起排”, ordinary-language cards, Why, preview and human decisions |
| Professional Mode | PASS | Same data; evidence, eight dimensions, exact positions, routes, model self-confidence and versions |
| Continuous Context | PASS | Manual movement changes the next request's actual position and sceneVersion |
| Proposal Revision | PASS | “第二个可以，但A不要动” references proposal 2, preserves it, produces a linked revision and explicit hold |
| Human Authority | PASS | Ghost/reject do not write formal scenes; Adopt passes the shared durable gate; partial/edit require a fresh preview |
| Feedback Lineage | PASS | Input → immutable proposal → preview → decision → final state → later manual change/Undo |
| Training Safety | PASS | Private defaults; no automatic eligibility, training, rewards, preference-pair generation or Gold promotion |
| Real Model | NOT_RUN | No configured API key used; synthetic outputs visibly identified |
| iPhone Safari | NOT_RUN | No physical-device session |
| iPad Safari | NOT_RUN | No physical-device session |
| Android Chrome | NOT_RUN | No physical-device session |
| Ontology | 8 / 38 | Unchanged |
| Gold Alpha | 0 / 20 | Unchanged; 100 candidates remain unreviewed |

## Audit and implementation boundary

The existing app already had proposal validation, deterministic compilation, Ghost rendering, human authority, feedback IndexedDB, durable scene transactions, paired remote tokens and lazy voice transcription. Those paths were reused. No dependency, renderer, geometry package, online catalog, architectural workflow, user lighting feature or model-training pipeline was added.

The former one-shot `RehearsalPartner` lived inside `SimulationPanel`. It is now a separate right-hand Dia dock composed in `SceneLoader`; manual controls remain left of the stage. Tablet opens with the left sidebar collapsed while Dia is visible, leaving the viewer at least 500 px wide in the tested layout. Capture, first-person and immersive preview hide the Dia dock. Its failures retain the independent editor/save systems. Ghost time and playback controls have their own component subscriptions; a 24 FPS Ghost does not rerender the entire conversation.

The root initially had two unrelated untracked V0.1 screenshots. They were preserved and excluded from this change. The current branch and Draft PR #1 were verified against the remote; main remained `4170d1919a8eb25a7bc96503dfb55098b71bbbfe` before publishing this increment. Required Pascal MIT notices and compatibility data remain intact.

## Data and continuity

- One versioned `RehearsalThread` per scene, with typed messages, current interaction, selection, scene version and all 12 requested states. Additive feedback DB v2 creates `threads` and `product-events` without replacing existing stores. Compare-and-swap revisions reject a second tab overwriting newer conversation data.
- Every send reads the live stage. Context includes performers, current positions/routes, selection, script excerpt, director intention, eight active dimensions, venue bounds and obstacles. Recent history is capped at eight messages / 6,000 characters; previous context is not recursively embedded. GLB, recordings, unrelated assets and the full chat history are excluded.
- Scene version is a deterministic checksum of current stage facts, not a model estimate or an authorization credential. Adoption still compares the complete validated current context, so checksum equality cannot authorize a stale edit.
- Revised proposals retain parent/root IDs, revision number, human message and instruction, held performers and the current scene version. Old records using `rehearsal-partner-0.1` remain readable; new prompt version is `rehearsal-partner-0.2`. Ontology is unchanged.
- An epoch plus AbortSignal stops late generation/preview/rejection callbacks. Stage changes invalidate proposals with “舞台已经变化，请重新生成。” Duplicate send has a synchronous guard. A removed/failed Ghost cannot be adopted.
- Refresh restores durable messages, interaction, selection and decision; it never silently restores a live Ghost. Interrupted operations are explicitly marked failed and must be retried. Legacy completed feedback without a new Thread is read using its own interaction version; uncommitted or failed attempts do not become previous human decisions.
- Minimal product events contain IDs, type, time and scene version, not script or chat text. Actual temporal history proves Undo; successive adoptions and Redo are not miscounted as Undo. The existing private feedback retains exact original/previewed proposals, edits, reasons and the latest durable final state.

## Phone connection

`PhoneVoiceLink` exposes its existing authorized owner session to `DiaRemoteBridge`. The `/api/remote-voice/sessions/[id]/dia` projection shares messages, interaction/selection, preview state and decision using the existing token roles, expiry, revocation and scene binding. Only message/select/preview/reject/cancel commands are accepted; arbitrary scene writes and remote Adopt are rejected. A single pending request uses sequence + request ID for retries. A reserved cancel slot remains available at the session request limit.

Phone previews remain requests until the desktop has actually prepared a Ghost. Stale versions, wrong proposal IDs, offline owners and expired sessions cannot report a successful preview. The phone renders a small SVG stage and bounded transcript. VoiceRecorder loads only when requested, transcribes into an editable draft, and never automatically sends or executes a recording.

Threads and full private feedback remain in the owner's browser, not a cloud chat account. The paired display uses the existing server session; revocation/expiry removes access. This does not enable public scene permissions or a new authentication system.

## Try it

1. Open the home page and choose **打开原创示例**. Each opening creates an isolated original two-person farewell scene. The label **演示数据 · 非真实模型输出** stays visible. Optional homepage text is passed through tab-local storage, never the URL.
2. Enter **他们现在太近了，我想让关系更克制**. Read the two directions and expand **为什么？**.
3. Choose **在舞台上试试**. Only numbered translucent performers and dashed routes change. Choose **采用**, **采用一部分**, **调整后采用**, or **不成立**. Editing suggestions requires another preview.
4. Manually move A, then ask **现在呢？**. Next ask **第二个可以，但A不要动** to create a linked revision.
5. In the Dia panel, expand **连接手机舞台助手**, generate a pairing code, and open `/remote-voice` on a phone at the same already-authorized reachable site. Enter that code. The phone can request **预演到舞台**; the desktop remains the place for explicit adoption.
6. **专业排演** changes information density only. Private records can be exported or deleted from the panel; training consent remains a separate, reversible future intent, with eligibility still false.

Local review server: `http://127.0.0.1:4326/`, production build with an isolated synthetic database. Loopback works on this computer only; this report does not claim phone reachability, TLS or Tailscale deployment at that address. Existing user services were not replaced.

## Validation

| Check | Result |
| --- | --- |
| `bun run check` | PASS, 1,409 files, zero errors; one pre-existing informational dependency diagnostic in camera-studio/dock.tsx |
| `bun run check-types` | PASS, 9 / 9 tasks; 8 unchanged tasks cached |
| `bun run test --concurrency=1` | PASS, 2,780 tests, zero failures, one existing skip; 14 / 14 tasks, 13 cached. Editor: 360 tests / 27,425 assertions freshly run |
| `bun run build` | PASS, 8 / 8 tasks, 7 cached; fresh Next production build includes `/demo` and the Dia session route |
| Controller/authority regressions | PASS, includes cancellation during asynchronous persistence, old feedback without Thread, successive adoption/Undo/Redo, exact partial/edit preview and lineage |
| Full browser sequence | PASS, real app + IndexedDB + scene API, synthetic proposals only; zero uncaught page errors |
| Production startup smoke | PASS, homepage → new synthetic scene → two proposals → Ghost; an ordinary scene without a key shows the disconnected-model notice; zero page errors |
| Phone pairing | PASS, two independent browser contexts using real session API; phone preview reaches desktop Ghost and returns actual status |
| Phone edge/voice tests | PASS within SIMULATION: duplicate send, retry IDs after refresh, loss of owner, lazy recording, fake microphone/transcription into draft only |
| Layout review | PASS after one correction pass: phone contrast, tablet visible A/B, phone primary action and lightweight navigation in first viewport |
| Impeccable detector | 0 anti-patterns; 43 advisory palette/type-ramp differences against the older design document, not blocking errors |

No physical phone, actual microphone recording, real-model response, independent beginner usability session, 1,000-object 30-minute run, power-loss or OS-kill test was performed in this increment. Browser refresh is not a power-loss test. No tests/assertions were removed; the existing scene-loader test double was extended for the sidebar dependency.

## Reproduce and evidence

Run the four root commands above with Bun 1.3.14. Start a local server against an **isolated** `PASCAL_DB_PATH`, with no API key for this synthetic exercise. Then run `node scripts/dia-conversation-browser.mjs`. It defaults to `http://127.0.0.1:4326`; set `BASE_URL` for another loopback server, and `PLAYWRIGHT_MODULE` to an already-installed Playwright module if not resolvable. No new dependency is required by the app. The script creates new synthetic scenes and uses browser interaction plus durable data assertions for the entire requested sequence.

- [Desktop 1440 × 1000](.impeccable/review/conversation/desktop.png)
- [Tablet SIMULATION 1024 × 1366](.impeccable/review/conversation/tablet.png)
- [Phone SIMULATION 390 × 844, full-page capture](.impeccable/review/conversation/phone.png)
- [Phone homepage SIMULATION 390 × 844, full-page capture](.impeccable/review/conversation/phone-home.png)
- [Sanitized browser results](.impeccable/review/conversation/browser-result.json)

Evidence contains synthetic content only. Keys, tokens, environment files, real scripts, recordings, scans, browser profiles, IndexedDB exports and temporary databases are excluded from Git. No merge, main change, deployment, release, training or automatic Gold promotion is part of this delivery.

## Changed files

- `.impeccable/review/conversation/browser-result.json`
- `.impeccable/review/conversation/desktop.png`
- `.impeccable/review/conversation/phone-home.png`
- `.impeccable/review/conversation/phone.png`
- `.impeccable/review/conversation/tablet.png`
- `apps/editor/app/api/remote-voice/sessions/[id]/dia/route.ts`
- `apps/editor/app/demo/demo-entry.tsx`
- `apps/editor/app/demo/page.tsx`
- `apps/editor/app/page.tsx`
- `apps/editor/app/scene/[id]/page.tsx`
- `apps/editor/components/scene-loader.test.tsx`
- `apps/editor/components/scene-loader.tsx`
- `apps/editor/components/stage-entry/dia-home-entry.tsx`
- `apps/editor/components/stage-entry/dia-home.css`
- `apps/editor/components/stage-entry/mobile-assistant.test.tsx`
- `apps/editor/components/stage-entry/mobile-dia.css`
- `apps/editor/components/stage-entry/mobile-dia.tsx`
- `apps/editor/components/stage-entry/phone-voice-link.tsx`
- `apps/editor/components/stage-entry/remote-voice-controller.tsx`
- `apps/editor/components/theatre/dia-conversation.css`
- `apps/editor/components/theatre/dia-remote-bridge.tsx`
- `apps/editor/components/theatre/rehearsal-partner.tsx`
- `apps/editor/components/theatre/simulation-panel.tsx`
- `apps/editor/lib/rehearsal-intelligence/authority.ts`
- `apps/editor/lib/rehearsal-intelligence/context.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-controller.test.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-controller.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation-storage.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation.test.ts`
- `apps/editor/lib/rehearsal-intelligence/conversation.ts`
- `apps/editor/lib/rehearsal-intelligence/dimensions.ts`
- `apps/editor/lib/rehearsal-intelligence/feedback.ts`
- `apps/editor/lib/rehearsal-intelligence/observer-recovery.test.ts`
- `apps/editor/lib/rehearsal-intelligence/openai-server.ts`
- `apps/editor/lib/rehearsal-intelligence/proposal-generator.ts`
- `apps/editor/lib/rehearsal-intelligence/proposal-validator.ts`
- `apps/editor/lib/rehearsal-intelligence/schema.ts`
- `apps/editor/lib/rehearsal-intelligence/synthetic-demo-intention.ts`
- `apps/editor/lib/rehearsal-intelligence/synthetic-demo.test.ts`
- `apps/editor/lib/rehearsal-intelligence/synthetic-demo.ts`
- `apps/editor/lib/remote-voice/api.ts`
- `apps/editor/lib/remote-voice/dia-protocol.ts`
- `apps/editor/lib/remote-voice/dia-store.test.ts`
- `apps/editor/lib/remote-voice/dia-store.ts`
- `DESIGN.md`
- `DIA_CONVERSATION_LAYER.md`
- `PRODUCT.md`
- `scripts/dia-conversation-browser.mjs`
