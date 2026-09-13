# DiaStage V0.1 — Real Device Acceptance

Date: 2026-09-11. Public Beta = **NOT READY**.

Real devices are a Public Beta release gate, not an engineering development blocker. All device checks below are **NOT_RUN**. A Chromium viewport, simulated touch, headless run, screenshot or desktop stress test cannot change these statuses. Only testing on the named physical device and browser may change NOT_RUN to PASS / FAIL.

Use an explicitly synthetic rehearsal project. Store private observations, account details, recordings, scans and device evidence in ignored `.local/`; commit only synthetic screenshots and measurements without user data. Record the tested commit, date, device model, OS/browser versions, result and a sanitized evidence reference for each actual run. Do not record account identifiers or private network addresses.

| Device | Status | Tested commit / device / OS / browser / date / evidence |
| --- | --- | --- |
| Physical iPhone, Safari | NOT_RUN | NOT_RUN |
| Physical iPad, Safari | NOT_RUN | NOT_RUN |
| Physical Android phone, Chrome | NOT_RUN | NOT_RUN |

## Shared core flow

Run the full sequence on each device. Simple and Professional must use the same saved rehearsal. AI proposes; the stage previews; humans decide.

| Step | Action and expected result | iPhone Safari | iPad Safari | Android Chrome |
| --- | --- | --- | --- | --- |
| 1 | Open DiaStage; controls and stage load without an unrecoverable error. | NOT_RUN | NOT_RUN | NOT_RUN |
| 2 | Enter a synthetic production; the correct scene and saved data appear. | NOT_RUN | NOT_RUN | NOT_RUN |
| 3 | Enter rehearsal; Simple / Professional share the same rehearsal data. | NOT_RUN | NOT_RUN | NOT_RUN |
| 4 | Add a performer; exactly one visible performer is saved. | NOT_RUN | NOT_RUN | NOT_RUN |
| 5 | Drag a performer in 2D and 3D; pointer release saves once, cancellation does not save. | NOT_RUN | NOT_RUN | NOT_RUN |
| 6 | Record a route; playback and refreshed saved route agree. | NOT_RUN | NOT_RUN | NOT_RUN |
| 7 | Request an AI Proposal using original candidate text; record real-model or synthetic provenance honestly, with no formal scene mutation. | NOT_RUN | NOT_RUN | NOT_RUN |
| 8 | Open Ghost Preview; distinguish it from the formal performers, which stay unchanged. | NOT_RUN | NOT_RUN | NOT_RUN |
| 9 | Switch proposals; only the selected temporary Ghost is visible. | NOT_RUN | NOT_RUN | NOT_RUN |
| 10 | Partial: deselect a suggestion; require compile and a fresh Ghost before Adopt. | NOT_RUN | NOT_RUN | NOT_RUN |
| 11 | Edit: change a proposal; require compile and a fresh Ghost before Adopt. | NOT_RUN | NOT_RUN | NOT_RUN |
| 12 | Reject; formal rehearsal stays unchanged and the decision is recorded. | NOT_RUN | NOT_RUN | NOT_RUN |
| 13 | Adopt by explicit human action; only selected performers change, once. | NOT_RUN | NOT_RUN | NOT_RUN |
| 14 | Undo adoption; formal rehearsal restores and feedback reflects the new final state. | NOT_RUN | NOT_RUN | NOT_RUN |
| 15 | Redo; scene and journal agree with feedback, without duplicate adoption. | NOT_RUN | NOT_RUN | NOT_RUN |
| 16 | Refresh; saved scene recovers, stale Ghost cannot be adopted and pending feedback can reconcile. | NOT_RUN | NOT_RUN | NOT_RUN |
| 17 | Send the browser to the background during idle, preview and a pending request. | NOT_RUN | NOT_RUN | NOT_RUN |
| 18 | Return; rehearsal remains usable, no automatic adoption or hidden duplicate write occurs. | NOT_RUN | NOT_RUN | NOT_RUN |
| 19 | Open/dismiss the soft keyboard; intention input, actions and focused field stay reachable. | NOT_RUN | NOT_RUN | NOT_RUN |
| 20 | Rotate to landscape; scene, scroll and action controls remain usable. | NOT_RUN | NOT_RUN | NOT_RUN |
| 21 | Rotate to portrait; preserve rehearsal state and usable controls. | NOT_RUN | NOT_RUN | NOT_RUN |
| 22 | Check Safe Area; no critical action is hidden behind a notch, home indicator or browser chrome. | NOT_RUN | NOT_RUN | NOT_RUN |
| 23 | Use two fingers; camera gestures and actor dragging do not conflict or produce unintended saves. | NOT_RUN | NOT_RUN | NOT_RUN |
| 24 | Disconnect the network, including during an AI request; formal scene is unchanged and manual rehearsal, save, Undo and Redo remain usable. | NOT_RUN | NOT_RUN | NOT_RUN |
| 25 | Restore the network; recover gracefully without duplicate writes or automatic adoption. | NOT_RUN | NOT_RUN | NOT_RUN |

## iPad Safari additions

| Check | Expected result | Status |
| --- | --- | --- |
| Larger touch canvas | Actors and Ghosts remain distinguishable and touch targets reachable. | NOT_RUN |
| Split View | Resize both ways; stage, panels and decision controls remain usable. | NOT_RUN |
| Landscape | Expanded layout preserves the same scene and readable evidence. | NOT_RUN |
| Multiple fingers | No stuck drag, accidental adoption or camera/performer gesture conflict. | NOT_RUN |
| Apple Pencil, if available | Pen drag, cancellation and finger switching do not duplicate saves. Without Pencil, keep NOT_RUN and record unavailable. | NOT_RUN |

## Android Chrome additions

| Check | Expected result | Status |
| --- | --- | --- |
| MediaRecorder | Permission, start/stop, cancellation and supported recording format work; no real recording is committed. | NOT_RUN |
| Pointer Event | Pointer capture, release and cancellation preserve the correct final performer state. | NOT_RUN |
| Touch | Scrolling, actor drag and stage navigation do not interfere. | NOT_RUN |
| IndexedDB | Reopen restores local feedback; blocked/quota/write failure does not roll back formal rehearsal. | NOT_RUN |
| Soft keyboard | Input and action controls remain visible through keyboard resize. | NOT_RUN |
| File picker | Synthetic file selection and cancellation work; rejected inputs leave the scene unchanged. | NOT_RUN |
| WebGL | Stage and Ghost render; background/foreground or context loss does not leave Adopt enabled for an invalid preview. | NOT_RUN |

## Public Beta gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| Intelligence | At least 20 Gold Alpha cases, real model output and human dramatic review meeting a defined quality bar. Candidate, schema validity and model confidence do not establish dramatic accuracy. | NOT_RUN |
| Device | One complete core flow on each physical iPhone Safari, iPad Safari and Android Chrome. | NOT_RUN |
| Usability | 1–3 people uninvolved in development complete: new production → add actor → move → AI Proposal → Ghost → choose → Adopt → Undo, without coaching. | NOT_RUN |

Desktop 1000-object / 30-minute testing is Desktop Stress Test evidence only. It cannot substitute for low-end Windows or any physical mobile-device result. Public Beta remains NOT READY until the gates have actual evidence.
