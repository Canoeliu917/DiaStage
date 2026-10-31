# 2026-10-30 第二批戏剧资源收录与检索

核验日期：2026-10-30（Asia/Shanghai）。数据：[正式资源](../knowledge/theatre-resources.json)。本批按用户要求，在首页修改后继续推进资料收录与检索。

## 本次增量

新增13条：3条具体剧本文本入口、5条专业知识原页、1条书目介绍、4条具体舞台影像入口。正式资源从25增至38条：23个目录、14个具体资源、1个已核书目介绍。与145个既有概念、12个登记来源合计195条可检索记录；不是195部完整剧本或全部已核事实。

| 分类 | 当前条数 |
| --- | ---: |
| 剧本 | 6 |
| 戏剧知识 | 9 |
| 演出影像 | 9 |
| 演职人员 | 2 |
| 剧场剧团 | 3 |
| 演出票讯 | 3 |
| 院校招生 | 4 |
| 招募招聘 | 2 |

仅保存元数据、版本、中文检索词、自编短摘要、原始链接及证据定位，全部为 `metadata-only`。未导入剧本、教材、论文、视频字幕或影像全文；公开可读不等于获准转载或商业使用。Gutenberg的美国公版说明不替代其他地区权利核验。

影像只核验官方节目页和观看入口，未实播播放器、验证地域可用性或取得放映许可。《牡丹亭·游园》和《红色娘子军·常青指路》明确标为部分／选段，不当作全剧；2019、2025等是来源版本／发布日期，不能当作近期演出票讯。

学校研讨报道只证明具名发言和研究线索；姜涛书目页只证明出版介绍，不表示已经读取或掌握全书。历史职务不推断为现任职务。

## 逐条来源与定位

使用 agent-reach 网页检索流程；本机没有 mcporter/Exa 可执行入口，改用现有网页搜索与官方原页读取。仅将搜索摘要用于发现，正文、角色／作品关联和版本分别核对。未读取私有材料或下载视频。

| 数据 ID | 官方原页 | 分类 | 核验位置 |
| --- | --- | --- | --- |
| `dm-resource-rsc-voice` | [RSC：演员台词与声音训练](https://www.rsc.org.uk/about-us/how-we-make-theatre/voice) | knowledge | 正文：声音与节奏、身体与呼吸、角色和演前热身；页面未标发布日期。 |
| `dm-resource-rsc-stage-management` | [RSC：舞台监督与演出提示分工](https://www.rsc.org.uk/about-us/how-we-make-theatre/stage-management) | knowledge | 职位清单及 Company Manager、Stage Manager、Deputy Stage Manager、Assistant Stage Manager 说明。 |
| `dm-resource-rsc-making-scenery` | [RSC：从舞美模型到布景制作](https://www.rsc.org.uk/about-us/how-we-make-theatre/making-scenery) | knowledge | Drawing office：1:25 模型与技术图纸；后续工程、木工、绘景和进场分节。 |
| `dm-resource-rsc-making-props` | [RSC：道具选用、制作与演出维护](https://www.rsc.org.uk/about-us/how-we-make-theatre/props) | knowledge | Sourcing props：耐用性、材料、演员使用和存放；Preparing for the show：技术排练、道具定位及维护。 |
| `dm-resource-cad-stanislavski-2024` | [中戏：斯坦尼斯拉夫斯基体系与当代研讨（2024）](https://www.chntheatre.edu.cn/cn/xue/detail/22291.html) | knowledge | 发布日期2024-06-05；刘杏林《特里波列夫的舞台》、易立明和姜涛的发言段落。 |
| `dm-resource-cad-stanislavski-book` | [《斯氏体系在中国》修订本：姜涛著作介绍](https://www.chntheatre.edu.cn/cn/xue/detail/13349.html) | knowledge | 发布日期2019-03-05；旧题名与修订说明段。职务为原文当时标注，不推断现任职务。 |
| `dm-resource-folger-hamlet-text` | [《哈姆雷特》英文剧本｜Folger 版](https://www.folger.edu/explore/shakespeares-works/hamlet/read/) | scripts | Navigate this work → Act and scene list；Characters in the Play；带行号的剧本正文 |
| `dm-resource-gutenberg-cherry-orchard-west` | [《樱桃园》英文剧本｜Julius West 译本](https://www.gutenberg.org/ebooks/7986) | scripts | About this eBook → Translator / Contents / Language / Copyright；CONTENTS → THE CHERRY ORCHARD → ACT ONE 至 ACT FOUR |
| `dm-resource-folger-midsummer-text` | [《仲夏夜之梦》英文剧本｜Folger 版](https://www.folger.edu/explore/shakespeares-works/a-midsummer-nights-dream/read/) | scripts | Navigate this work → Characters in the Play / Act and scene list；Act 1, scene 2；Act 5, scene 1；带行号正文 |

## 检索修正及验证

- 修复“沉浸式戏剧”因共享“戏剧”二字而命中普通目录的问题。明确书名号中的作品名约束候选；碎片匹配要求至少60%双字覆盖，完整查询和较长已登记专业别名仍可命中。没有硬编码这些剧名，也没有新增付费模型调用。
- 这是保守的本地词汇检索，不是语义向量检索或模型训练。大量口语词包围短别名仍可能漏召回，后续须用真实用户查询持续补对照。
- [13条新增资源检索样例](../evals/search-intake-20261030.json)全部命中前三项，且链接、分类、元数据权限和来源定位匹配。
- 完整检索测试：28项通过，477条断言，0失败。包含隔离的模型／账本替身和联网SSE替身，不代表真实千问或真实联网质量通过。TypeScript检查通过。
- 运行中本地API免费GET复核：“仲夏夜之梦”命中1条具体剧本；“RSC 舞台监督”命中该官方说明及舞监概念；“牡丹亭 游园”命中1条央视原页；“沉浸式戏剧”影像在当前无对应资料时返回0条。四项 `aiStatus=disabled`，没有本轮付费模型调用。
- 首页命名、四栏页尾介绍、滚动渐显与顶部账号链接对齐已在提交 `8630818` 中同步。服务端HTML和新CSS返回200；内置浏览器刷新／新页加载持续超时，最终视觉复核仍待用户刷新确认，未以接口成功冒充浏览器验收通过。

## 后续优先级

1. 补中文话剧的正版剧本版本、具体演出录像与授权说明；未核《雷雨》等全文不从未知网盘补入。
2. 补沉浸式、音乐剧与小剧场具体作品，避免只有泛目录；人物仍以剧目和角色证据关联。
3. 对真实问法做“应命中／不应命中”评测，逐步改善短别名、简繁体、跨语言和口语检索。
4. 分别验收原站跳转、播放器可用性及真实千问引用；它们不因资料入库而自动标为通过。

`source=official_page_metadata + synthetic_case + local_api_observation`；不包含用户独立验收，不改变旧舞台待验结果。

