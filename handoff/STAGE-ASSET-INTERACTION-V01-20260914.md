# DiaStage Stage Asset Interaction V0.1

完成日期：2026-09-14。开发分支：`codex/stage-asset-interaction-v01-20260914`。
从现场 Camera 工作检查点 `dd0e1d3` 建立独立分支，保留前序工作；未修改 main、merge 或 deploy。

## 实现

- 分类显示：空间围合/景片 → 台块与支撑 → 门窗 → 沙发 → 桌 → 椅凳。canonicalId、资产资源及持久化类别不变。
- scenic-flat/window-flat/door-flat 不作为堆叠对象或支撑对象。其余标准资产可互相堆叠。
- 复用舞台 placement policy，对现有碰撞体执行 Y 方向接触计算，选择最高有效支撑；包含旋转后的面和边。检测容差不加入保存位置。
- 三维及分屏三维区域提供 XYZ 移动杆、XYZ 旋转环。每次只修改对应 position / Euler rotation 分量。
- 复用 `useHandleDrag` 的 live override、Esc 和单次历史提交。锁定、只读、过期场景快照不可提交；没有实际变化不产生更新。
- Y 轴可抬升/下降；“边缘与支撑面贴合”使用已有磁吸模式和 8 cm 高度检测阈值，最终保存精确 contact。
- 旋转沿用现有 `DEFAULT_ANGLE_STEP`（15°）；按住 Shift 自由旋转。移动保留现有网格/磁吸模式，不引入新 modifier。
- 操作杆约 100 CSS px，独立于模型 scale；扩大命中几何，保留原有选择与普通放置路径。
- 未修改 Dia 解析、提案或正式场景权限。

## 验证

| 检查 | 结果 |
| --- | --- |
| 相关自动测试 | 24 PASS / 0 FAIL，7 文件，250 assertions |
| check-types | 9/9 tasks PASS |
| build | 8/8 tasks PASS |
| 新增实现/测试 6 文件 Biome check | PASS |
| git diff --check | PASS |
| 全仓 bun run check | FAIL：1334 errors，1 info；未全仓格式化 |

全仓 check 不通过，不能将此检查点表述为全仓 CI 全绿。本轮没有运行或声称全仓 test 全绿。

A–E、H：`packages/core/src/stage/stacking.test.ts`，包含十层无累计 clearance、所有允许种类互叠、三个景片种类双向排除及倾斜资产接触。
F–G：`apps/editor/lib/stage/axis-transform.test.ts`，包含已有复合向量的分量隔离。
I–J：真实浏览器脚本验证 pointer down/move 时保存场景不变、Esc 取消、一次 undo 还原整个 drag、redo 恢复。既有 `handle-drag-history.test.ts` 同时回归。
分类资产、原生 placement policy、景片贴边测试同时回归。

实际启动新构建，在 **4329** 使用独立 Chrome 浏览器页面进行鼠标交互并检查保存结果；不是只调用变换函数。

- XYZ move：三轴均通过；live 不保存；每轴一次 undo/redo。
- XYZ rotation：三轴均通过；只改对应分量；保存 30°（现有 15° 步长）；一次 undo。
- Esc cancel：通过。
- 一号台块 → 二号 → 三号 → 桌子 → 椅子：通过。
- 保存的堆叠 Y 分别为 0.15、0.30000000000000004、0.4500000000000001、1.2 m；仅有 IEEE 浮点尾数，没有叠加 clearance。
- Y 自由抬高至 1.5 m，再磁吸到桌面 1.2 m：通过。
- 分屏三维操作杆与取消：通过。
- 固定/解锁后移动、旋转按钮状态：通过。
- 平面视图添加椅子到台块，保存 Y=0.15 m：通过。
- 浏览器 pageerror：0。

截图与 JSON 结果位于工作区 `work/stage-interaction/`：`move.png`、`rotate.png`、`stack.png`、`split.png`、`chair-platform-plan.png`、`results.json`、`extra-results.json`。

## 数据保护

执行前备份：`.local/backups/2026-09-14T07-52-46-112Z`（SQLite、全部 scenes、全部 revisions、SHA-256 manifest）。
浏览器验收使用三个自建临时场景，验收后精确按其 ID 退休；未清空浏览器站点数据。
当前数据库：**3 scenes / 300 revisions**；SQLite integrity_check = ok。
三个正式 scene 完整 SQLite 记录 SHA-256 前后相同（包含场景数据及元数据）：

| Scene | Before = After |
| --- | --- |
| 8537cf7594fb | `2c6c472f0ca867acf4b7456a33ac81674ccfc106ebd87e13eac88991ab3dba44` |
| fcc2fff436ea | `eeeb185a688145eb5bc0ef6178f4ee358cb70f85d75fb437a4958a2412aea965` |
| 71de52238204 | `f80fb1880f1fd898abfba9916d83641959aac22c4c57f98a43989809e9ef7749` |

全部原有 revisions 的序列哈希前后相同：`0e3083d8c78a42f8d0b91bace91050a1a7c3cb4208b6124b7c95fb6fc08b6380`。
完整校验结果：`.local/stage-interaction-data-check.json`。

## 修改文件

产品实现：

- `packages/core/src/stage/object-registry.ts`：类别显示顺序。
- `packages/core/src/stage/stacking.ts`：接触位置、支撑候选与磁吸高度。
- `packages/core/src/stage/index.ts`：导出支撑计算。
- `packages/editor/src/index.tsx`：导出现有 useHandleDrag。
- `apps/editor/lib/stage/placement-snap.ts`：接入普通放置支撑计算。
- `apps/editor/lib/stage/axis-transform.ts`：单轴分量修改。
- `apps/editor/components/stage-entry/manual-stage-panel.tsx`：库显示排序与同步现有吸附模式。
- `apps/editor/components/stage-entry/placement-system.tsx`：挂载操作杆。
- `apps/editor/components/stage-entry/transform-mode.ts`：工具栏模式偏好；gesture 仍由已有 interaction scope 管理。
- `apps/editor/components/stage-entry/transform-gizmo.tsx`：三轴操作与 live/commit。
- `apps/editor/components/stage-entry/stage-viewport-controls.tsx`：磁吸入口说明与模式切换。
- `apps/editor/components/viewer-toolbar.tsx`：移动/旋转入口。

测试：

- `packages/core/src/stage/stacking.test.ts`
- `packages/core/src/stage/object-registry.test.ts`
- `apps/editor/lib/stage/axis-transform.test.ts`
- `apps/editor/components/stage-entry/manual-stage-panel.test.tsx`

验收脚本/报告：`handoff/stage-interaction-fixture.ts`、`stage-interaction-acceptance.mjs`、`stage-interaction-extra.mjs`、`stage-interaction-data-check.ts`、本报告。
脚本是本次本地验收工具，依赖现场 `work/browser` Playwright 与临时场景，不是网站产品能力。

## 已知边界

- 三轴 gizmo 用于 3D/分屏的 3D 区域；纯平面视图仍使用原有落位与精确属性旋转入口。
- 支撑基于现有凸碰撞体/资产 bounds；不会把模型孔洞、凹槽或每根细框都重新构建为精确物理支撑面。
- 这是放置辅助，不是重力模拟：移动底层物件不会自动搬运上面的物件。
- 沿用既有接触提示规则，正确贴合也可能呈红色接触提示；未改写碰撞提示或 Dia 行为。
- Desktop 鼠标已验收；命中区域为后续触控扩大，但未进行真实 iPad/多指验收。
- 本轮没有改写 Pascal move/snapping 架构，也没有修改资产文件、schema、历史兼容或旧 renderer。
