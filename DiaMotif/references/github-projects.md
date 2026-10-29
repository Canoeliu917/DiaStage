# DiaMotif：GitHub 戏剧与交互叙事项目调研

核查日期：2026-10-29。按戏剧语料、剧本结构、交互叙事、AI 协作、舞台制作检索，并读取候选仓库的 README、具体文件及许可。以下是首轮高相关筛选，不是穷尽 GitHub 的清单。

## 优先学习与收录

| 项目 | 与书目、DiaMotif 的联系 | 本轮收录与限制 |
| --- | --- | --- |
| [DraCor Schema](https://github.com/dracor-org/dracor-schema) | 幕／场、舞台提示、说话人和台词的结构；适合《从剧本到舞台》及剧本解析方向 | 收录自写结构规则卡。CC BY 4.0，保留署名、固定来源和改写说明；不是舞台几何求解器 |
| [RusDraCor](https://github.com/dracor-org/rusdracor) | 可分析的真实戏剧语料，与已有《海鸥》案例衔接 | 收录《海鸥》第一幕两段舞台提示及来源记录。该文件自身明确 CC0 1.0；不由此推断所有其他戏剧库都同样授权 |
| [ink](https://github.com/inkle/ink) | 分支、后果、状态与道具需求；对应交互／跨媒体叙事 | 收录“道具需求与视觉替身分开”的机制卡。MIT；它不负责识图、坐标或碰撞 |
| [Yarn Spinner](https://github.com/YarnSpinnerTool/YarnSpinner) | 台词、选项与命令分开；对应戏剧交互、人机控制 | 收录命令边界卡。核心仓库 MIT；不等于外部游戏内容、商业集成包或素材全部开放 |
| [Dramatron](https://github.com/google-deepmind/dramatron) | 从总体到角色、情节、地点、对白的分层生成及人工改稿；对应 AI 辅助编剧重点书 | 收录方法卡，不导入其完整故事模板。代码 Apache-2.0，README 说明其他材料 CC BY 4.0；第三方故事材料另看来源。研究 notebook 不直接充当生产后端 |
| [Twine](https://github.com/klembot/twinejs) | 分支可视化、新手可学、默认值与撤销；适合人机交互原型研究 | 收录原创比较说明和链接；编辑器 GPL-3.0，未复制源码。故事格式独立授权，Twee 规范仓库未找到明确许可证，不整份转载 |

ink 的[运行文档第 115—130 行](https://github.com/inkle/ink/blob/35c63e52f1d36060930dc7ed3cfba38ea224b528/Documentation/RunningYourInk.md#L115)明确演示通过道具列表声明场景需求，再生成占位物或核对布置。**DiaMotif 推论：**剧本中的“钢琴”等需求可保留语义，再映射为现有 21 件道具中的排练替身；不能据此声称 ink 本身实现了这种映射。

Dramatron 的研究有专业编剧参与，但其 `Custom` 模板明确未用于论文用户研究；不能把该模板声称为已通过同一研究验证。README 与 notebook 的接口状态有差异：当前文件已有旧模型接口示例，需重新适配。生成新故事的方法也不能直接代替忠实的剧本解析。

与 Brenda Laurel 或用户所列教材的联系是本项目的比较推论；未发现证据表明这些仓库直接实现或收录了那些教材全文。未找到可确认的《大型戏剧编剧实务》配套同名开源仓库。

## 制作工具：学习工程边界

| 项目 | 可借鉴内容 | 不混淆的边界 |
| --- | --- | --- |
| [Figure53 / QLabKit.objc](https://github.com/Figure53/QLabKit.objc) | 稳定 cue ID、目标、运行状态；预览、试听与启动的区别。MIT，官方 OSC 客户端库 | QLab 的输出 `stageSize` 不等于真实剧场尺寸；不是通用戏剧词典，也不是可直接装入网页的后端。本轮不启用 OSC、投影或复台 |
| [QLC+](https://github.com/mcallegari/qlcplus) | 类型拒绝、关联对象删除、保存重开一致性等工程测试。所核 `COPYING` 为 Apache-2.0 | 其 `Scene` 是灯具通道值集合，不能当作剧本“场”或 DIA 三维场景；fixture 不等于 21 件道具。独立素材与依赖需另看授权 |

## 仅登记参考

[ShakeDraCor](https://github.com/dracor-org/shakedracor) 的 README、语料声明与已核 Macbeth 文件标为 **CC BY-NC 3.0**。本轮只保留学习链接，不把这套 Folger 编辑／编码文本并入商业候选语料。原作年代久远不等于某个编辑版本的使用条件自动消失。

## 固定版本与许可证据

| 仓库 | 核查 commit | 具体证据 |
| --- | --- | --- |
| dracor-org/dracor-schema | `185d8ee155695a4cd15c126f6a038d84491b2b77` | [LICENSE](https://github.com/dracor-org/dracor-schema/blob/185d8ee155695a4cd15c126f6a038d84491b2b77/LICENSE)、[dracor.odd](https://github.com/dracor-org/dracor-schema/blob/185d8ee155695a4cd15c126f6a038d84491b2b77/dracor.odd#L1618) |
| dracor-org/rusdracor | `cb06b3a211cc36ed0806c9ae85a94ede5da99557` | [《海鸥》文件：授权与原文](https://github.com/dracor-org/rusdracor/blob/cb06b3a211cc36ed0806c9ae85a94ede5da99557/tei/chekhov-chaika.xml)；原文件 blob `1279b28aea0bf66311bc7210f96047769df25d2a` |
| inkle/ink | `35c63e52f1d36060930dc7ed3cfba38ea224b528` | [MIT LICENSE](https://github.com/inkle/ink/blob/35c63e52f1d36060930dc7ed3cfba38ea224b528/LICENSE.txt)、[运行与道具列表](https://github.com/inkle/ink/blob/35c63e52f1d36060930dc7ed3cfba38ea224b528/Documentation/RunningYourInk.md) |
| YarnSpinnerTool/YarnSpinner | `c5215f86dd5a6761aecbdc9f60f6a6108f91f919` | [MIT LICENSE](https://github.com/YarnSpinnerTool/YarnSpinner/blob/c5215f86dd5a6761aecbdc9f60f6a6108f91f919/LICENSE.md)、[README](https://github.com/YarnSpinnerTool/YarnSpinner/blob/c5215f86dd5a6761aecbdc9f60f6a6108f91f919/README.md)、[命令样例](https://github.com/YarnSpinnerTool/YarnSpinner/blob/c5215f86dd5a6761aecbdc9f60f6a6108f91f919/Tests/TestCases/Commands.yarn) |
| google-deepmind/dramatron | `2e7c36afadacf8321b77a468940024371b7a8c7a` | [README 与材料许可](https://github.com/google-deepmind/dramatron/blob/2e7c36afadacf8321b77a468940024371b7a8c7a/README.md)、[notebook](https://github.com/google-deepmind/dramatron/blob/2e7c36afadacf8321b77a468940024371b7a8c7a/colab/dramatron.ipynb) |
| klembot/twinejs | `2c3b80144ba6f1fe9d8a4e5e11a2349ba55fc310` | [GPL-3.0 LICENSE](https://github.com/klembot/twinejs/blob/2c3b80144ba6f1fe9d8a4e5e11a2349ba55fc310/LICENSE)、[DESIGN_GOALS](https://github.com/klembot/twinejs/blob/2c3b80144ba6f1fe9d8a4e5e11a2349ba55fc310/DESIGN_GOALS.md) |
| Figure53/QLabKit.objc | `76214b3e4bb828fdee2887b635d328f671244d42` | [MIT LICENSE](https://github.com/Figure53/QLabKit.objc/blob/76214b3e4bb828fdee2887b635d328f671244d42/LICENSE.txt)、[QLKCue.h](https://github.com/Figure53/QLabKit.objc/blob/76214b3e4bb828fdee2887b635d328f671244d42/lib/QLKCue.h) |
| mcallegari/qlcplus | `302a18c98761495aaccbb8f4d1012aa56a88d2c2` | [COPYING](https://github.com/mcallegari/qlcplus/blob/302a18c98761495aaccbb8f4d1012aa56a88d2c2/COPYING)、[scene.h](https://github.com/mcallegari/qlcplus/blob/302a18c98761495aaccbb8f4d1012aa56a88d2c2/engine/src/scene.h)、[scene 测试](https://github.com/mcallegari/qlcplus/blob/302a18c98761495aaccbb8f4d1012aa56a88d2c2/engine/test/scene/scene_test.cpp) |
| dracor-org/shakedracor | `7381f58e9d81c222461ee24533e1dbe8e89c6197` | [Macbeth 授权头部](https://github.com/dracor-org/shakedracor/blob/7381f58e9d81c222461ee24533e1dbe8e89c6197/tei/macbeth.xml#L27) |

维护信号仅用于选择学习材料：ink 发布 v1.2.1（2026-05-05）；Yarn v3.2.1（2026-05-05），但其仓库 `Yarn-Spec.md` 仍明确是 v2 文档；Twine v2.12.1（2026-10-07）；QLC+ v5.3.0（2026-10-05）。Dramatron 当前核查提交来自 2024 年。版本新旧不等于适配 DIA 的质量验收。

## 已直接收录的最小材料

- [5 条结构／方法知识卡](../knowledge/github-reference-cards.jsonl)：自写中文释义、正反例、适用范围、来源 commit 和许可。状态为 `reviewed_reference`，尚未自动送入线上千问请求。
- [《海鸥》两段俄文舞台提示](../sources/rusdracor-seagull-opening.xml)及[来源和四项检查点](../sources/rusdracor-seagull-opening.json)：CC0 明示语料；未复制未知许可的中文译本。XML 结构可机器验证，语义检查点由本项目整理，真实模型解析待测。

没有安装或执行这些外部项目，也没有批量灌入整库。当前最值得落地的是 **剧本层级与原文证据 → 道具需求 → 21 件道具映射 → 布局预览 → 人工采用**；先以小样本检验，再扩充知识。
