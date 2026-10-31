# 预发目录与每日收录

主服务器上的收录是每天可再跑的日课。自动高量抓取保持关闭。社区投稿和主动打开的网页都先进入审核，不直接进入公开检索。

## 每天怎么跑

在仓库根目录：

```sh
bun scripts/diamotif-daily-intake.ts
bun scripts/diamotif-contribution-queue.ts
```

第一条打印最近一轮主动收录：发现、已读、待审、不收、已在库中、正式新增。默认不改正式目录。`--write-public` 在没有合格完整剧本时也不会写入。

第二条打印投稿队列：时间、状态、权利声明、作者、题名、编号。不打印邮箱和微信。

```sh
bun scripts/diamotif-contribution-queue.ts --mark-reviewed=投稿编号
bun scripts/diamotif-contribution-queue.ts --reject=投稿编号
```

标记已读或不收只改队列状态。`--write-public` 会拒绝把投稿写入公开检索。

百部书目卡：

```sh
bun scripts/diamotif-manual-intake.ts
```

## 两路如何汇合

- 主动收录写在 `DiaMotif/knowledge/daily-intake-20261031.json`。合格且核过完整正文的条目，才用手改 `domestic-discovery.json` 和 `search-publication-reviews.json`。
- 社区投稿写在数据目录的 `motif-contributions/`，不在 Git 里。审核人若采用一条投稿，只把核对过的题名、作者、链接和短摘要抄进日课队列，再按上一条手工登记。
- 两条都不自动进入公开检索。

## 2026-10-31 晚这一轮

打开已准入站点上的公开页。发现 13，已读 11，只见索引 2，待审 1，不收 10，已在库中 2，正式新增 0，托管全文 0。待审的是老舍人物页：能核对《茶馆》《龙须沟》等剧名，没有读到剧本正文。

## 预发要带上的目录

正式检索会读这些已在仓库里的文件，部署代码时它们会一起过去：

- `DiaMotif/knowledge/domestic-discovery.json`
- `DiaMotif/knowledge/search-publication-reviews.json`
- `DiaMotif/knowledge/theatre-resources.json`
- `DiaMotif/knowledge/theatre-regional-intake-20261030.json`

不要把下面当成公开语料：

- `DiaMotif/knowledge/daily-intake-20261031.json`
- `DiaMotif/knowledge/hundred-play-cards.json`
- `DiaMotif/knowledge/pending-sources.json`
- 数据目录里的 `motif-contributions/`

投稿目录跟场景库放在一起：`PASCAL_DATA_DIR/motif-contributions/`，或 `PASCAL_DB_PATH` 所在目录下的 `motif-contributions/`。换机器时单独复制这个目录，不要放进网站公开静态目录，也不要提交进 Git。

## 环境变量

```dotenv
DIASTAGE_AI_PROVIDER=aliyun
DASHSCOPE_API_KEY=服务端密钥
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DIASTAGE_AI_BETA_USER_IDS=已核对的受邀账号用户ID
DIASTAGE_MOTIF_BETA=1
PASCAL_DATA_DIR=/本机私有数据目录
```

不要使用 `NEXT_PUBLIC_` 前缀，不要把真实密钥写进仓库。千问三条提示的核对步骤见 [qwen-search-ops.md](qwen-search-ops.md)。

## 确认未审投稿不在公共搜索

1. `bun test apps/editor/lib/diamotif-search/contributions.test.ts apps/editor/lib/diamotif-search/daily-intake.test.ts`
2. 从队列抄一条题名，在首页搜索，结果应为 0。
3. 日课输出里的正式新增为 0 时，公开检索的剧本条数不应因这一轮增加。
