# 人工核准一轮（2026-10-31）

自动高量抓取保持暂停。这一页只说明怎样做一轮人工、已批准的收录。不恢复定时抓取，不绕过登录、验证码、付费墙或浏览器 cookie。

## 公开检索读什么

公开检索只读已经通过 `publicationReview` 的正式语料，入口仍是 `domestic-discovery.json`、既有资源目录和集中审核表 `search-publication-reviews.json`。下面两类都不进公开检索：

- `DiaMotif/knowledge/hundred-play-cards.json`：话剧百部待核元数据卡。只有剧作家和题名，没有正文，`publicSearch` 固定为 false。清单条数不是已收录数量。
- 网站 `/contribute` 写入数据目录 `motif-contributions/` 的投稿。状态固定为 `pending-review`。权利申报为「尚不明确」时不存文件，只留链接和短摘要。

## 一轮怎么做

1. 在仓库根目录运行 `bun scripts/diamotif-manual-intake.ts`，查看还待核的卡片。`--promote`、`--scrape`、`--index` 会直接拒绝，不会改正式库。
2. 自行打开可公开访问的来源，核对大陆作者、完整原作或已核译本或逐卷核完的剧作集、以及权利。遇登录、付费或 403 就停，换下一条。
3. 只有核对完成的记录，才按现有 schema 写入正式目录，并在 `search-publication-reviews.json` 登记 `approved`。证据 URL 要和 `sourceRefs` 对得上。
4. 运行 `bun test apps/editor/lib/diamotif-search`。测试通过只说明程序门禁仍在，不表示本轮新增了作品。
5. 投稿队列里的私人联系方式留在数据目录，不要提交进 Git。把一条投稿收进正式库时，只搬核对过的题名、作者、链接和短摘要，不搬未授权全文。

没有合格来源就留空。不要用清单、待审或书目把数量凑成一百或一千。
