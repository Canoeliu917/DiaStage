# 首批戏剧资源收录说明

核验日期：2026-10-30。数据文件：[theatre-resources.json](../knowledge/theatre-resources.json)。

本批收录 **25 条官方资源入口或具体资源**，用于有限目录检索。不是全网搜索覆盖、全国院校／剧团名录、实时票务服务，也不表示已经读完所有剧本、教材或视频。既有 31 项登记书目保留在原参考资料中，没有混入本批“已核验入口”计数。

## 内容与访问范围

| 分类 | 条数 | 本批范围 |
| --- | ---: | --- |
| scripts | 3 | 莎士比亚文本、DraCor 语料目录、一个明确版本的《玩偶之家》 |
| knowledge | 3 | 戏剧课堂、人物关系、舞美与表演艺术藏品 |
| videos | 5 | 歌剧／戏剧片段、制作纪录片、个人或机构演出录像平台 |
| people | 2 | 由剧团／剧院确认的专业人员目录；没有拼接个人履历 |
| venues | 3 | 官方剧场及舞台空间介绍 |
| events | 3 | 官方排期与售票来源入口；没有具体场次库存 |
| admissions | 4 | 戏剧院校招生或戏剧表演课程申请入口 |
| opportunities | 2 | 官方选角说明与剧院岗位来源；不代表当下开放招募 |
| **合计** | **25** | **每条唯一 ID、唯一来源 URL** |

遵守 [DiaMotif 收录边界](../README.md)：只收戏剧专业信息。目录关联演员、导演、编剧、舞美、剧团、剧场、教师及课堂；不以影视流量、明星热度、私生活或八卦作为收录依据。综合艺术网站只选戏剧关联栏目；后续读取其中子页面仍须逐条核查，不能将整个域名自动视为合格内容。

本批没有商业艺考机构、付费推广或未经核实的演员自荐。未来如增加机构宣传、剧目推广、演员招募，须单独标识并核实专业关联、发布方和适用时间，不混入中立知识答案，也不自动授予“认证”或“推荐”。

## 数据字段与边界

JSON 顶层是数组；每条含 `id/title/category/topics/summary/organization/url/verifiedAt/access/rights/recordType/theatreEvidence/status`。标题与摘要为本项目自编或必要资源名称，来源定位保存在 `theatreEvidence`。未采集私人联系方式、报名账号、申请材料、演员私生活或未授权全文。

- `recordType=directory` 配 `status=source-directory`：表示目录或长期查询入口，**不能解释为具体演出、招生或岗位正在开放**。本批 23 条。
- `recordType=resource` 配 `status=verified`：表示具体资源的官方来源与页面内容已核对，不表示全文入库、可自由转载或网页永远有效。本批 2 条。没有伪造 `production` 或 `person` 记录。
- `verifiedAt` 是本次入口核验日期，不是文章发布日期、招生年份或演出日期。动态页面的后续内容需要重新核验。
- `access` 描述资料访问方式：`public` 为公开页面；`subscription` 为个人订阅／租看；`institution` 为机构资格或机构许可；`mixed` 为公开与付费／会员内容并存。`public` 不表示课程、入场、试镜或演出票免费。
- 本批 `rights` 全部为 `metadata-only`，只保存必要元数据、原链接及自编短摘要。这是本批实际收录范围，不是对来源全部内容的许可证结论。没有导入剧本、视频转录、图片或教案全文，也没有进行模型微调。
- 人物目录只证明已核实的剧团／剧院关联。某人参演哪一版本、哪一角色、是否仍在团、是否可接受招募，须有新的官方证据；本批没有推断这些信息。

票讯仅保留官方来源入口，不填价格、余票、当前阵容、日期时区或退改条件。后续要发布具体场次，须按 DiaMotif 规则补齐这些字段及最后核验时间；缺项保持未知，不通过名称或旧海报推测。招生与招募同样须逐年度／专业／考生类别或逐岗位核对，过期说明不可作为当前报名依据。

## 核验方式与证据定位

按 agent-reach 技能执行官方来源检索。本机没有 mcporter／Exa 可执行入口，本轮使用现有网页搜索与官方页读取；中戏招生、DraCor 目录和 Folger 教学资源在直接读取失败后使用该技能的 Jina Reader 后备取得正文。只把搜索摘要用于发现页面，不用其独立构造演员履历、票价或招生要求。

以下为逐条官方链接与定位；没有保存或提交页面全文：

| 数据 ID | 官方来源 | 核验定位 |
| --- | --- | --- |
| `dm-resource-folger-plays` | [Folger 莎士比亚剧本与作品导读](https://www.folger.edu/explore/shakespeares-works/) | 官方 Shakespeare's works 页面提供戏剧类别、逐部剧作和完整文本入口。 |
| `dm-resource-dracor-corpora` | [DraCor 戏剧语料库目录](https://dracor.org/doc/corpora) | 官方目录逐项列出戏剧语料库、维护机构及部分许可证，包括 Ibsen、German 和 Shakespeare Drama Corpus。 |
| `dm-resource-gutenberg-dolls-house` | [《玩偶之家》英文剧本：Project Gutenberg](https://www.gutenberg.org/ebooks/2542) | 官方书目将作品标为 play，列出作者、译者、英语版本和在线文本入口。 |
| `dm-resource-rsc-learning-zone` | [RSC 莎士比亚戏剧学习区](https://www.rsc.org.uk/shakespeare-learning-zone) | 官方说明明确涵盖剧作关键场景、演出照片、演员导演工作及角色关系。 |
| `dm-resource-va-theatre-performance` | [V&A 戏剧与表演艺术藏品](https://www.vam.ac.uk/collections/theatre-performance) | 馆方将戏剧、歌剧、偶戏、音乐剧、服装和布景设计列入 Theatre & Performance 收藏范围。 |
| `dm-resource-folger-teaching` | [Folger 戏剧课堂教案与活动](https://www.folger.edu/teach/resources/) | 官方教学入口按剧作组织 lesson plans 和课堂活动，并区分教师会员权益。 |
| `dm-resource-rsc-associate-artists` | [RSC 合作艺术家目录](https://www.rsc.org.uk/about-us/whos-who/associate-artists) | 官方页面说明艺术家因对剧团工作的贡献获邀，并直接列出 Associate Artists 名单。 |
| `dm-resource-ncpa-opera-artists` | [国家大剧院歌剧演员队](https://www.chncpa.org/jmsc_237/zytt/gjyyd/) | 国家大剧院官方导航“艺术生产”直接链接至“国家大剧院歌剧演员队”页面。 |
| `dm-resource-ncpa-theatres` | [国家大剧院剧场与舞台空间](https://www.chncpa.org/cgylx/jyjg/) | 官方剧院景观页逐项介绍歌剧院、戏剧场、小剧场及舞台机械等设施。 |
| `dm-resource-globe-theatres` | [莎士比亚环球剧场空间与参观资料](https://www.shakespearesglobe.com/visit/) | 官方参观页明确列出两座剧场，并介绍 Globe Theatre 的露天木结构空间。 |
| `dm-resource-royal-shakespeare-theatre` | [Royal Shakespeare Theatre 场地介绍](https://www.rsc.org.uk/your-visit/royal-shakespeare-theatre/) | 官方页面说明该场地为常演莎士比亚及其他作品的主剧场，并链接虚拟导览和座位图。 |
| `dm-resource-ncpa-events` | [国家大剧院演出查询与官方票讯](https://www.chncpa.org/ycgp_220/) | 官方演出购票页包含演出日历与戏剧、戏曲、歌剧、舞蹈、音乐剧分类。 |
| `dm-resource-rsc-events` | [RSC 剧目排期与官方售票入口](https://www.rsc.org.uk/whats-on/) | 官方 What's On 页面列出舞台作品、演出场地和 BOOK TICKETS 入口。 |
| `dm-resource-globe-events` | [环球剧场演出排期与票讯](https://www.shakespearesglobe.com/whats-on/) | 官方 What's On 页面按剧场列示 PERFORMANCES，并提供剧目详情与票务链接。 |
| `dm-resource-zhongxi-admissions` | [中央戏剧学院本科招生入口](https://zhaosheng.zhongxi.cn/) | 学校招生网列有本科章程、校考与统考对应表，以及戏剧学、舞台美术史论和戏剧教育等专业资料。 |
| `dm-resource-sta-admissions` | [上海戏剧学院本科招生简章](https://zs.sta.edu.cn/1181/list.htm) | 学校官方本科招生简章栏目将艺术类校考、统考、戏曲省际联考和普通批次分别列出。 |
| `dm-resource-nacta-admissions` | [中国戏曲学院招生信息](https://www.nacta.edu.cn/xwgg/zsxx/index.htm) | 学院官方招生信息页面分本科生、研究生、留学生等入口，所属院校专门开展戏曲人才培养。 |
| `dm-resource-rada-acting-admissions` | [RADA 戏剧表演本科课程与申请](https://www.rada.ac.uk/courses/ba-hons-acting/) | 官方课程页明确列出古典与当代戏剧、台词、形体、文本分析、舞台项目及申请试镜流程。 |
| `dm-resource-rsc-casting` | [RSC 演员选角与试镜说明](https://www.rsc.org.uk/about-us/how-we-make-theatre/casting) | 剧团官方选角页说明导演和创作团队如何选择演出角色，并提供试镜与演员提交资料的常见问题。 |
| `dm-resource-nt-theatre-jobs` | [National Theatre 戏剧制作与舞台岗位](https://jobs.nationaltheatre.org.uk/) | 官方招聘页列有制作管理、舞台技术等剧院岗位，并由 National Theatre 说明其演出制作工作。 |


开放文本也须逐项看许可：[DraCor 语料目录](https://dracor.org/doc/corpora)列有 CC0、含非商业限制等不同许可；[《玩偶之家》书目](https://www.gutenberg.org/ebooks/2542)仅标注该版本在美国的公版状态。因此本批没有把整个资源库标成可任意商用全文。

本次没有收录读取失败的中国国家话剧院页面、只得到 JavaScript 占位内容的北京人艺页面及返回访问拒绝的 NYPL 录像档案页面。它们仍可作为以后复核线索；这不代表机构不可靠或内容永久不可访问。

## 后续维护与验收

1. 核验链接、页面标题、发布机构和戏剧关联；页面失效或转向不相关内容时撤下或标待核验，不静默保留为有效来源。
2. 搜索只命中实际入库的 25 条元数据。标题、摘要和 topics 可检索；目录命中不等于其全部子页面已被索引。
3. 收藏只保存资源身份与来源信息。将资料用于舞台时另经用户选择片段、置景解析、预览和采用，不由资源收录直接修改正式舞台。
4. Codex 每日候选跟进与此静态目录分开。候选发现不自动更新此文件，不自动抓取受限全文，不自动写入正式知识或训练数据。
5. 发布前继续分别验证数据结构、检索命中、访问标识及引用跳转。本文件只证明数据核验范围，不替代后端、首页或浏览器验收。
