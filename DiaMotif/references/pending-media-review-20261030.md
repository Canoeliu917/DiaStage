# 待核媒体候选复审 · 2026-10-30

本轮只复核[社会发现批次](../knowledge/social-discovery-20261030.json)中指定8条。逐条结果与可审资源见[复审JSON](../knowledge/pending-media-review-20261030.json)。未修改原候选、canonical、程序或其他人的文件，未提交。

## 结果

8条逐条结案：7条原始正文可读，1条微信受验证码阻断。输出8份符合当前SearchResourceSchema的可审元数据，其中微信对应的是同届闭幕相关报道，不是原微信复原，也不等同入校指南。

- **红果AI计划微博**：正文可读；另读账号资料页，显示北京笔墨留香科技有限公司及官方微博身份。作为平台AI创作活动公告，不推断已生成作品或个人报名资格。原帖只显示月日，发布日期留空。
- **乌镇青年竞演入围微博**：正文可读；官方账号资料经Jina可读。图片名单未OCR，不补写18组成员履历。2026届活动排期已过，不能作为当前征集。
- **乌镇七大单元微博**：正文可读；仅记录该届活动结构及历史状态，不当作单场购票或当前预约。
- **微博戏剧主创直播**：正文及04:27:33视频元数据可读；是平台节目页，不称主办方公告、完整舞台录像或已观看全片。
- **快手非遗戏曲星光夜**：原IR转载页正文可读，明确来源中国网娱乐、日期2024-11-25。归历史线上戏曲演出资料，不归可播放影像。中国网原发点击超时，未称读到原发正文。
- **清华入校微信**：web不可读，Jina返回CAPTCHA即停止。保留受阻候选；另读清华大学新闻网同届闭幕报道作为相关历史资料，明确不能替代原微信入校规则。
- **流媒体网红果报道**：公开正文、DataEye署名、2026-10-19日期和版权声明可读。作为专业媒体资料与平台公告交叉核对，不替代平台规则。
- **北京日报清华报道**：记者、日期及正文可读；与清华闭幕原文交叉验证为2024届历史活动。文中原微信访问受阻，不把旧观演办法套用到当前。

所有摘要为简短自写说明，rights为metadata-only。没有保存文章全文、视频、字幕、评论、推荐区噪声或私人联系方式；不绕过登录或验证码。账号显示的官方身份只用于对应账号和具体条目，不授予整个微博域“官方资料”属性。

## 原候选与资料关系

- `sd-weibo-hongguo-ai-plan`：[原候选](https://weibo.com/2/detail/5354406397875235) → `reviewed-for-admission` → `dm-resource-hongguo-ai-creation-plan-weibo-2026`。正文可读；另读取账号主页，显示红果官方微博及北京笔墨留香科技有限公司认证主体。原帖日期只有月日，publishedAt留空；AI创作活动信息按平台公告/reference处理，非既有AI作品。
- `sd-weibo-wuzhen-young-2026`：[原候选](https://weibo.com/2/detail/5345230930577273) → `reviewed-for-admission` → `dm-resource-wuzhen-young-selection-weibo-2026`。原帖全文可读、活动届次明确；官方微博主页经Jina返回非空账号信息，中国旅游报原文证明第十三届位于浙江嘉兴乌镇。保留原帖日期空值，不把已过排期当当前征集。
- `sd-weibo-wuzhen-units`：[原候选](https://weibo.com/2/detail/5352120674160540) → `reviewed-for-admission` → `dm-resource-wuzhen-seven-units-weibo-2026`。原帖七单元及2026.10.15—10.25可读，原发日期只有月日留空；核验时为历史活动，非当前票务。
- `sd-weibo-wuzhen-live`：[原候选](https://weibo.com/2/detail/5353603750691922) → `reviewed-for-admission` → `dm-resource-wuzhen-creators-live-weibo-2026`。原页正文及04:27:33视频元数据可读；仅作为微博戏剧平台节目页，不称主办方原始公告，也不称已观看直播全片。
- `sd-kuaishou-opera-night`：[原候选](https://ir.kuaishou.com/zh-hans/news-releases/news-release-details-130) → `reviewed-for-admission` → `dm-resource-kuaishou-opera-starlight-2024`。原IR页全文可读，来源明确为中国网娱乐转载；正文有具体戏曲直播活动、剧种及2024日期。分类历史线上演出活动，非影像回放。
- `sd-wechat-tsinghua-entry`：[原候选](https://mp.weixin.qq.com/s/frV51pN7Bhg8rYTJLTRs-A) → `blocked-original-related-source-admitted` → `dm-resource-tsinghua-philosophy-drama-close-2024`。web不可打开；Jina返回环境异常/CAPTCHA即停止。未登录、未绕过。主办院校新闻页提供同届已闭幕的相关历史回顾，不能替代或复原原微信入校规则。
- `sd-lmtw-hongguo-ai`：[原候选](https://lmtw.com/mzw/content/detail/id/259157/keyword_id/-1) → `reviewed-for-admission` → `dm-resource-lmtw-hongguo-ai-plan-20261019`。行业媒体正文公开可读，作者、日期、转载与版权声明齐全。页脚北京公司主体和京备案可核；仅登记元数据与简短说明，不复制正文。
- `sd-news-tsinghua-festival`：[原候选](https://xinwen.bjd.com.cn/content/s673823aee4b0e1ace8a86f31.html) → `reviewed-for-admission` → `dm-resource-bjd-tsinghua-philosophy-drama-20241116`。北京日报原报道全文、记者及2024-11-16日期可读，具体剧目与活动可定位；与清华该届闭幕报道交叉核实历史状态。

微信关系必须保留：
- [原入校微信](https://mp.weixin.qq.com/s/frV51pN7Bhg8rYTJLTRs-A)：当前正文受阻，不作事实依据。
- [北京日报历史报道](https://xinwen.bjd.com.cn/content/s673823aee4b0e1ace8a86f31.html)：证明该链接当年曾被列为观演报备入口。
- [清华同届闭幕报道](https://www.tsinghua.edu.cn/info/1182/116238.htm)：证明同届活动已闭幕，只是相关背景替代，不支持当前入校规则。

## 新来源域与地域依据

- `lmtw.com`，mainland：[核验页](https://lmtw.com/mzw/content/detail/id/259157/keyword_id/-1)。原页页脚北京创世路信息技术有限公司、京ICP备05059178号-1；文章署名流媒体网/DataEye。仅准许逐条核验的专业媒体来源，不给全站官方身份。
- `bjd.com.cn`，mainland：[核验页](https://xinwen.bjd.com.cn/content/s673823aee4b0e1ace8a86f31.html)。具体原报道署北京日报客户端及记者何蕊，内容是清华第二届校园戏剧节；原始新闻机构为北京日报。按professional-media收录。
- `tsinghua.edu.cn`，mainland：[核验页](https://www.tsinghua.edu.cn/info/1182/116238.htm)。清华大学新闻网/清华大学新闻中心原站，正文明确同届闭幕式在京举办；该页署源光明日报，按媒体转载层级显示。
- `ctnews.com.cn`，mainland：[核验页](https://www.ctnews.com.cn/dongtai/m/content/2026-10/19/content_193345.html)。原文署中国旅游报，首段明确浙江嘉兴乌镇；页脚中国旅游报社有限公司及京备案。本批仅作地域佐证，不另加第9条资源。

`ir.kuaishou.com`及`weibo.com`沿用已有来源域，本轮仍逐条核账号/正文。节目内容地区与网站发布机构地区分别判断；国内平台不等于所有内容都在大陆举办。乌镇条目的地域另用[中国旅游报原文](https://www.ctnews.com.cn/dongtai/m/content/2026-10/19/content_193345.html)首段“浙江嘉兴乌镇西栅”交叉核验。

## 状态与使用限制

- 日期：微博仅有月日，`publishedAt:null`；不根据活动年份、帖子编号或检索时间反推完整发帖日期。`applicableYear`来自正文及交叉报道，不是原帖发布日期。
- 时效：2024戏曲直播、2024清华第二届、2026乌镇届次均为历史记录；不提供现时余票、报名名额、入校资格或活动仍开放的承诺。
- 红果：仅核活动存在及资料类型；未进入APP核完整规则，不直接推荐用户按旧金额、截止日或IP授权参与。
- 来源层级：快手IR该页实际转载中国网娱乐、清华该页实际转载光明日报，均按professional-media显示；不因官方域名包装成原创公告。微博戏剧按platform显示。
- 版权：流媒体网页脚明确限制未经授权转载、摘编、复制；仅保留书目信息、原始链接和简短自写说明，不镜像正文。其他资源同样没有转载或下载授权。

父任务导入前仍需核对新增域与证据、ID/URL去重以及当前产品方向。此文件提供可审数据，不表示已经进入公开索引或已完成公网部署。
