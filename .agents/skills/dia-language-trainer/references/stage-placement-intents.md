# Stage Placement Intent V0.1

This is a language and action-description boundary, not an XYZ planner or scene executor.

## Frames and contrast pairs
- 台左 / 台右: stage_left / stage_right, actor facing audience; frame=stage.
- 观众左 / 观众右: audience_left / audience_right, audience facing stage; frame=audience. Keep this distinction in the intent and action; do not collapse it during parsing.
- 往左一点 / 放到台左: relative_left (relative translation, amount optional) versus stage_left (region placement).
- 桌子左边 / 台左: left_of_object with an object reference versus stage region. Object-left is not automatically the object's rotated local axis or screen-left.
- 台后 / 台前: upstage / downstage. Region placement differs from an explicitly incremental move.
- 靠近 / 紧贴: near_object requires a non-contact proximity proposal; flush_to_object requires surface contact, not zero center distance.
- 放在台块上 / 叠在台块上: place_on is placement on a named support surface; stack_on explicitly requests stacking. Both delegate geometry to the interaction engine, but the semantic distinction is retained.
- 放在上面 / 放在台块上: missing reference or overhead-versus-surface meaning must be clarified. 上方 is not automatically contact.
- 舞台中央 / 中间留空: center_on_stage moves a subject; preserve_clearance is a constraint and must not invent deletions or move every object.
- 横向对齐 / 纵向对齐: align carries an axis. Bare 对齐 needs clarification.
- 门口留通道: preserve_path constrains a resolved entrance, with an optional stated width; it does not authorize rearrangement by itself.

Each positive family has two direct cases, a paraphrase and a nearby contrast family in the canonical JSONL. Ambiguous/negative/compound cases guard against partial interpretation. Cases are deliberately a compact grammar set rather than a global synonym list.

## Representation and references
StagePlacementIntent retains kind, subject reference, optional target, frame, motion, amountMeters, axis and region. $selection and $stage are references, not IDs.
Parsing never assigns an unstated distance. Parse explicit units using the existing stage number/length parser.
Reference resolution is separate. Reuse the asset catalog and current scene context. Exact names or IDs win; ambiguous nouns require one selected matching object or clarification. Never fabricate a subject ID.
Unqualified left/right remains frame=unspecified. The action mapper must require an explicit stage/audience frame from context before resolving it; it must never guess from camera orientation.
Users can qualify a full utterance with “按舞台方向” or “按观众方向”; this resolves the frame without converting a relative move into region placement.
Negation, alternatives and multi-action prose are clarification-only in V0.1. Do not execute the first recognized substring.

## Independent StageAction mapping
- stage/audience regions and up/down/center -> place_in_region(subjectId, region, frame).
- relative left/right -> move_relative(subjectId, direction, frame, amountMeters?).
- object side -> place_beside(subjectId, targetId, side, frame).
- near / flush -> place_near / place_flush(subjectId, targetId).
- place_on / stack_on -> corresponding distinct action(subjectId, targetId).
- align -> align(subjectIds, axis).
- clearance / path -> preserve_clearance(region, amountMeters?) / preserve_path(targetId, amountMeters?).

Action proposals carry current documentVersion, status=proposal and requiresHumanConfirm=true. No action has position/rotation/transform/XYZ fields. The language layer has no scene-write, stacking-solver or snapping-solver call. Existing Stage Asset Interaction engines remain the only future source of final geometry. An action proposal is not a rendered preview; adopt must remain unavailable until a valid preview and human confirmation exist.

## Remaining scope
Existing asset creation, rotation, fold and camera language retain their existing paths. This iteration intercepts supported placement utterances as language-only proposals. It does not introduce a placement executor, new automatic stage mutations, or new camera vocabulary.
Existing explicit stage-direction incremental commands continue through their established human-preview workflow. The new proposal is held in conversation memory; it is not a persistent scene revision or an adoptable geometry preview. The canonical cases are authored contrast fixtures, not records of human-approved scene decisions.
