# 国内社交、票务与AI影视候选发现 · 2026-10-30

本批只建候选记录，不接入正式检索目录、不放宽域名准入、不自动发布。机器可读记录见[候选JSON](../knowledge/social-discovery-20261030.json)。

## 结果与读取边界

共23条实际URL：5条 `reviewed`、13条 `candidate`、5条 `blocked`。其中2条blocked是公众号验证码阻断，另3条是无充分事实/主体证据的拒收线索。

`reviewed`仅表示读到了原页正文或页面元数据，不代表看过完整视频、认证账号、核验全部事实、确认内容地区或获得转载授权。B站仅核页面元数据；微博仅抽取帖子正文，周边推荐不收。所有条目仅保存元数据、来源链接与自写证据说明，不保存视频、字幕或整篇文章。未执行付费模型调用。

本轮按 agent-reach 的 social/video/web 路由执行。父任务预检显示没有可用的小红书、B站CLI、OpenCLI或Exa后端。B站原页直读两次返回412后，转用文档支持的Jina网页兜底，得到非空元数据；未使用yt-dlp读取B站。未安装后端、读取Cookie、替用户登录或绕过验证码。这里的“全平台已检查”不等于各平台已经抓取成功。

## 平台覆盖

- **bilibili：readable**。公开搜索发现具体视频；原页直连412；agent-reach网页Jina备选读到2条页面元数据，播放仅预览/登录提示，无字幕或全片验真。
- **douyin：index-only**。发现戏剧放映、专业访谈及AI制作具体视频；直读为空或超时，Jina测试为服务器错误。未把索引当原文核验。
- **xiaohongshu：notavailable**。公开检索无合格笔记全文；仅发现活动落地页与二级转载中的裸explore链接，无xsec_token，不按技能规则尝试裸ID读取。未读取Cookie。
- **kuaishou：readable**。已读平台投资者关系AI影像新闻原页；仅找到非遗戏曲官方报道索引，未取得普通short-video原帖。官方新闻可读不等于短视频抓取可用。
- **wechat-official-accounts：notavailable**。从院校原站发现2个实际公众号链接；web不可开，Jina返回环境异常/CAPTCHA，停止，不绕过。
- **wechat-channels：notavailable**。公开channels.weixin.qq.com域限定检索无合格视频号内容页；未配置独立只读后端，不把公众号链接当作视频号覆盖。
- **hongguo：readable**。红果短剧app账号微博正文可读，活动真实规则页/APP内列表未访问；候选来源账号身份、年份和授权还需平台复核。
- **damai：readable**。具体《雷雨》项目页可读，已下架且价格/时间待定；未购票或登录，不能称作在售票讯。
- **weibo：readable**。红果具体帖子正文可读；戏剧节帖子有索引但本轮未逐帖读原文。部分搜索提示robots限制，不能承诺全站抓取。
- **zhihu：notavailable**。尝试舞台调度等公开域限定检索，本轮未得到可复核的具体知乎问答页；未计入候选。
- **professional-media-news：index-only**。取得流媒体网DataEye及北京日报具体原发布URL；本轮仅索引发现，未升为已核原文。

## 五条已读取记录

- [【一席】《十二公民》话剧导演 徐昂：喜剧的忧伤](https://www.bilibili.com/video/BV1as41117c1/)（`sd-bili-yixi-xuang`）。Jina读取原页并转至同站/en路径，正文显示讲座题名、2016-07-25和29:27时长；明确关联话剧导演及《十二公民》。 直连412；仅核页面元数据，未看全片或核账号认证。Jina顶端Published Time与页面日期冲突，采用页面可见日期且不保留时分；版权及地区仍待核。
- [AI短片创作](https://www.bilibili.com/video/BV1WBiSBTE4R/)（`sd-bili-agu-ai-short`）。Jina读取同站原页元数据，题为AI Short Film Creation，显示2026-01-08及01:42时长，关联AI创作系列，注明未经授权禁止转载。 直连412；播放界面要求登录，只核页面元数据而非视频实际生成方式；创作者自述不是独立技术验证，未复制视频。
- [AI短剧创作计划官宣 10.15征稿开启含300万保底金](https://weibo.com/2/detail/5354406397875235)（`sd-weibo-hongguo-ai-plan`）。原页第2至6行可读，账号名为红果短剧app，正文明确AI短剧创作计划、投稿路径及赛道，属于实际AI创作活动自述。 原页仅显示10-15而无明确年份，因此原帖日期留空；账号V图标不替代主体认证，奖励、截止日及IP许可须复核平台活动原规则。推荐区噪声不收。
- [可灵AI新一代模型Kling 4.0正式上线 专业影像模型“卷”出新高度](https://ir.kuaishou.com/zh-hans/news-releases/news-release-details/kelingaixinyidaimoxingklin1g-40zhengshishangxian/)（`sd-kuaishou-kling4`）。快手投资者关系原站第4至8行给出日期与香港发布主体；正文明确视频生成、故事板、角色表演参考与影视制作流程。 这是厂商新闻稿，性能与奖项均为发布方陈述而非本站独立实测；未开通产品、调用API或验证收费。
- [【北京】李六乙导演、胡军主演 话剧《雷雨》](https://detail.damai.cn/item.htm?id=854344259092)（`sd-damai-thunderstorm`）。大麦具体项目原页可读：国家大剧院戏剧场、北京地址、《雷雨》与导演演员；按钮状态为已下架，时间及价格均待定。 只收剧目版本与原平台链接；明确不是在售场次，无余票、价格或将来演出时间承诺，未购买或登录。

可优先复审的两条为大麦具体项目页和快手官方IR新闻页：前者只能作为已下架剧目版本来源；后者只能作为厂商AI工具发布陈述，不包装成独立性能实测。B站两条、红果账号微博还需核账号主体、内容地区和使用许可，不能直接自动晋级正式资源。

B站Jina顶端的 `Published Time` 出现与正文不符的通用时间；不采用该头部时间。仅保留页面可见日期，时区不明确时不保留时分。微博部分原帖仅显示月日，`originalPostDate`留空，不根据作品年份或搜索引擎“几周前”推算。

## 其余实际URL

以下均不是“已核原文”；分类与子类只是待复审提示，不能按用户所选栏目自动归类。

- **candidate**：[我让AI把经典电影改编成了漫剧，结果有点上头【B站AI创造公开赛】](https://www.bilibili.com/video/BV11QgP6JECE/)（`sd-bili-ai-adaptation`）。未独立读取本视频原页、未核作者及参赛身份；影视改编授权和所述产品效果均待核。
- **candidate**：[我用AI做了一个三国电影短片](https://www.bilibili.com/video/BV1gH4y1p7me/)（`sd-bili-ai-three-kingdoms`）。索引相对时间不转成发布日期；未核原片、生成工具、作者、地域或权利，仅待审线索。
- **candidate**：[【人艺｜话剧】- 李白 苏民导演、濮存昕、何冰、郭启宏编剧](https://www.bilibili.com/video/BV1nWwWeaEhS/)（`sd-bili-li-bai-stage`）。未核上传者授权、演出版本、完整度或发布时间；不将个人上传当作人艺官方发布或授权全剧。
- **candidate**：[原汁原味！在家门口重温国话精品剧目《大宅门》！](https://www.douyin.com/video/7678246994527395705)（`sd-douyin-gansu-dazhaimen`）。原页直读0行，Jina显示服务器问题；题名取索引原帖首句，未读取完整原帖。不能据索引确认未来场次、售票或账号归属，地区也待原站核验。
- **candidate**：[田沁鑫：国话“CNT现场”将“现场唯一”定格为“艺术永恒”](https://jingxuan.douyin.com/m/video/7564664718482345265)（`sd-douyin-cnt-tianqinxin`）。原页请求超时；相对时间未换算日期，场次数与覆盖城市等数字不据此入库事实。
- **candidate**：[颤抖吧！这是AI生成的！](https://jingxuan.douyin.com/m/video/7610059817041939750)（`sd-douyin-lewis-ai`）。未读取或播放原片、未核账号；只作制作流程候选，不收效率、质量或替代渲染的宣传结论。
- **candidate**：[2026第十三届乌镇戏剧节青年竞演单元18部剧目入围公告](https://weibo.com/2/detail/5345230930577273)（`sd-weibo-wuzhen-young-2026`）。未独立打开本条正文；9-20仅月日，原帖日期留空，2026为公告内容年份。活动截至10月25日的索引排期已过，不作当前报名推荐。
- **candidate**：[2026第十三届乌镇戏剧节七大单元及活动安排](https://weibo.com/2/detail/5352120674160540)（`sd-weibo-wuzhen-units`）。只核检索发现，原帖正文及账号归属待复核；索引排期已过，七单元说明不作在售或开放状态。
- **candidate**：[第十三届乌镇戏剧节青年竞演18组主创接力直播](https://weibo.com/2/detail/5353603750691922)（`sd-weibo-wuzhen-live`）。未核回放是否仍可看、直播内容或著作权；原页时间仅月日不补全年份。
- **candidate**：[“小屏幕”演绎“大舞台”！快手艺术联合央视文艺打造“非遗戏曲星光夜”直播活动](https://ir.kuaishou.com/zh-hans/news-releases/news-release-details-130)（`sd-kuaishou-opera-night`）。未逐段读取此原页或直播回放；不把平台生态覆盖率统计、传播效果或直播日期作为已核事实。
- **blocked**：[剧场|上海戏剧学院·新空间](https://mp.weixin.qq.com/s/3GGI9s4mmX81ziHfKRkM6w)（`sd-wechat-sta-space`）。web工具不能打开；Jina仅返回环境异常与验证码页。未绕过验证，也未据学校引用推断公众号账号归属、正文或发布日期。
- **blocked**：[2026国际导演大师班（列宁格勒学派）](https://mp.weixin.qq.com/s/OeNW_HYvaRDGsvrXDyq77A)（`sd-wechat-sta-directors`）。原文web不可打开，Jina为验证码页面，未核账号、举办地点、主办及课程原规则；不显示现时可报名。
- **candidate**：[校外人员观演自行报备进校攻略](https://mp.weixin.qq.com/s/frV51pN7Bhg8rYTJLTRs-A)（`sd-wechat-tsinghua-entry`）。未读取本条微信原文；这是历史活动线索，不能套用到2026进校办法；账号和发布日期留空。
- **candidate**：[个人300万保底+450万积分+亿级宣发！红果AI短剧创作计划来了](https://lmtw.com/mzw/content/detail/id/259157/keyword_id/-1)（`sd-lmtw-hongguo-ai`）。未独立逐段读取本条原文；奖金、资格、授权和截止日仍以活动原规则为准，不据媒体转载认证平台。
- **candidate**：[清华第二届哲学-戏剧节启动，校外观众进校看演出攻略——](https://xinwen.bjd.com.cn/content/s673823aee4b0e1ace8a86f31.html)（`sd-news-tsinghua-festival`）。只作发现记录，未独立读原文；不作当前排期或入校预约依据，不复制新闻全文。
- **blocked**：[周冬雨被爆在阿那亚戏剧节演话剧不背台词，观众：对本子读还嘴瓢。](https://www.douyin.com/video/7652728438554389093?source=Baiduspider)（`sd-reject-sensational-stage-claim`）。未经核实的耸动人物指控，缺专业评论依据、原始演出证据和来源归属，不入库或进入公开信息流；不据此判定事件真假。
- **blocked**：[行业动态 - 红果官网](https://ohdnfz.cn/news/)（`sd-reject-unverified-hongguo-news`）。不得因页面自称官网而加入官方来源域或引用其业务数据；仅记拒收线索，不断言其主体违法。
- **blocked**：[红果AI短剧 · AI智能短剧创作与分发平台｜一句灵感，一键成片](https://hongguoaiduanju.com/)（`sd-reject-unverified-hongguo-ai`）。不收其官网或授权身份主张，不推荐注册、付款或提交材料；仅保存内部拒收线索。

公众号原链接的发现依据：
- [上戏教务处：剧场|上海戏剧学院·新空间](https://jwc.sta.edu.cn/75/b5/c1161a95669/page.htm)列出具体微信原文。
- [上戏外事处：当世界戏剧日遇上中俄教育年](https://ws.sta.edu.cn/ea/c1/c985a125633/page.htm)列出导演大师班的微信详情地址。
- [北京日报：清华第二届哲学-戏剧节](https://xinwen.bjd.com.cn/content/s673823aee4b0e1ace8a86f31.html)列出观演报备微信链接。以上引用不证明公众号账号归属；不能将学校/媒体文章发布日期套到微信原帖。

## 晋级与下一步

1. 先确认发布主体、专业关联和大陆/港澳内容地区，再核原始发布日期、版本、活动状态、访问条件及权利。`contentRegion:unknown`不能直接作为地区已核的正式资源。中文、国内平台、某地IP位置均不等于内容地区已经证明。
2. 戏剧资料仍需关联具体剧目、角色、剧团、剧场或创作教学；AI影视资料须有明确AI工具、生成、制作或实验内容，普通影视娱乐资讯不混入。
3. 个人经验、媒体报道、平台自述和官方文件分别显示来源层级；账号名、V图标或自称官网不足以授予官方资质。不得因平台已授权检索就授予全域“官方来源”身份。
4. 大麦已下架条目不当作售票推荐；历史直播与剧节公告不当作当前报名入口。艺考、招聘、票讯和AI创作活动的资格、截止日期、金额须回到最新原规则复核。
5. 小红书、微信视频号、知乎当前没有可验内容页，不虚构覆盖数量。公众号遇验证码停止。未来如用户主动配置合规只读连接，再按公开权限补验，不能借此突破登录或验证码边界。

本批没有把搜索页、平台首页、落地广告页或关键词聚合页计作内容条目；也没有收集推荐区八卦、私人联系方式或评论用户信息。两个“红果官网”相关域仅作为内部拒收线索，不断言违法，也不推荐注册或付款。
