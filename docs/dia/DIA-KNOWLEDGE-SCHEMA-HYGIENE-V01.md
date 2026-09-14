# Dia Knowledge Schema Hygiene V0.1

日期：2026-09-14
概念清单：124（未增加）

## 结果

### conceptKind

| kind | Concept 数量 |
| --- | ---: |
| `stage_term` | 12 |
| `asset` | 18 |
| `spatial_relation` | 13 |
| `operation` | 7 |
| `theory_concept` | 73 |
| `historical_entity` | 1 |
| `example_pattern` | 0（另有 9 个 `sceneExamples`） |

九个剧本场景布局均带有 `conceptKind = example_pattern`、`definitionStatus = descriptive`、`executionEligibility = knowledge_only`，但不混入 124 个 canonical candidate concepts。

### definitionStatus

| status | 数量 |
| --- | ---: |
| `canonical` | 6 |
| `tradition_specific` | 9 |
| `translation_variant` | 5 |
| `contested` | 0 |
| `heuristic` | 1 |
| `operational` | 26 |
| `descriptive` | 77 |

`heuristic` 从 103 降为 1，当前仅 `stage-zone` 的固定九区强弱排序使用该状态。

### authorityTier

| tier | 数量 |
| --- | ---: |
| `primary_source` | 0 |
| `authoritative_reference` | 0 |
| `peer_reviewed` | 1 |
| `institutional_teaching` | 9 |
| `exam_notes` | 114 |

### Dia status

| status | 数量 |
| --- | ---: |
| `ACTIVE` | 50 |
| `OBSERVE` | 41 |
| `FUTURE` | 33 |

### executionEligibility

| eligibility | 数量 |
| --- | ---: |
| `allowed` | 44 |
| `proposal_only` | 46 |
| `knowledge_only` | 34 |

`allowed` 只表示知识概念可解析到已有的确定性 intent；它不授予 Formal Scene mutation 权限，仍受现有 Proposal、Preview 与 Human Confirm 边界约束。

## Definition status 发生变化的 concepts

共 103 个发生 definition status 变化；其余 21 个 Authority Review 分类保持不变。

### `heuristic → operational`（26）

`join`, `splice`, `fold-flat`, `rotate-whole`, `align`, `edge-align`, `angle`, `enclosure`, `opening`, `stage-space`, `audience-direction`, `stage-center`, `entrance`, `exit`, `passage`, `occlusion`, `sightline`, `spatial-relation`, `foreground`, `background`, `stage-within-stage`, `object-layout`, `near`, `far`, `inside`, `outside`。

### `heuristic → descriptive`（76）

- 资产（18）：`stage-object`, `platform`, `chair`, `table`, `stair`, `bench`, `curtain`, `wing-curtain`, `border-curtain`, `scenic-flat`, `single-flat`, `double-fold-flat`, `triple-fold-flat`, `door-flat`, `window-flat`, `flat-panel`, `flat-frame`, `hinge`。
- 导演／剧作／表演／声音普通描述（58）：`focus`, `stage-action`, `dramatic-action`, `stage-task`, `stage-conflict`, `stage-rhythm`, `stage-atmosphere`, `stage-tempo`, `stage-composition`, `stage-picture`, `movement-line`, `center-of-interest`, `dynamic-balance`, `static-balance`, `scene-transition`, `rehearsal`, `stage-synthesis`, `actor-scenery-relation`, `actor-audience-relation`, `spatial-level`, `group-composition`, `action`, `event`, `conflict`, `character-relation`, `stage-situation`, `plot`, `theme`, `dramatic-structure`, `character-objective`, `acting-method`, `subtext`, `monologue-training`, `internal-monologue`, `emotion-memory`, `imagination`, `attention`, `relaxation`, `stage-belief`, `communication`, `adaptation`, `character-image`, `role-analysis`, `score-of-actions`, `impulse`, `emotional-expression`, `observation`, `concentration`, `sense-memory`, `improvisation`, `line-training`, `stress`, `pause`, `intonation`, `breath`, `voice-projection`, `resonance`, `articulation`。

### `canonical → descriptive`（1）

`black-slaves-cry-to-heaven`：改为 `historical_entity + descriptive + knowledge_only`；其改编者、参与者与 source provenance 保留。

## 新增分类与边界校验

- `heuristic` 只能用于带 `disputedNotes` 的 `theory_concept`。
- `allowed` 只能用于 ACTIVE 且具有确定性 `executableIntents` 的概念。
- `theory_concept` 永远不能为 `allowed`。
- `historical_entity` 必须为 `descriptive + knowledge_only`。
- ACTIVE、authorityTier、definitionStatus、executionEligibility 四个维度分别校验，不互相推导。
- `getExecutableIntents` 由 `executionEligibility` 控制，不再仅凭 ACTIVE 放行。

## 示例 ID 映射

在不增加概念的前提下：

- `connect-edge` 作为 alias 归一到更接近“沿边拼接”语义的现有 `splice` operation；不与一般 `join` 静默等同。
- `fold-hinge` 作为 alias 归一到现有 `fold-flat` operation；`hinge` 本身仍是 asset。
- `near-object` 作为 alias 归一到现有 `near` spatial relation。
- 当前 124 个概念中没有安全等价于 `stack-on` 的 concept，因此没有猜测映射；若以后激活堆叠能力，应单独经过来源与 StageAction 边界审计。

## 验证

- 原 Authority Review：13 tests retained and passed。
- Schema Hygiene：8 tests passed。
- 合计：21 passed / 0 failed / 77 assertions。
- Scoped Biome：passed。
- 当前 catalog semantic validation：passed，无 schema/data validation failure。
- 未修改 Stage Runtime、Scene schema、Formal Scene 数据或 Scenic Flat Runtime。
