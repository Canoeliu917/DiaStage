# DiaStage HTTPS 维护阶段执行记录

核验时间：2026-10-27 11:37（北京时间）。用户明确同意[审阅方案](diastage-deployment-review-20261027.md)中的 CA 协议、品牌联系邮箱、证书、TCP 443、维护页及续期测试。应用仍未切换，公网只提供维护页。

## 已完成

| 项目 | 实际结果 |
| --- | --- |
| CA 与联系地址 | 执行前确认 Let's Encrypt 生产目录仍指向 v1.8（2026-07-06），获准接受；联系邮箱 `21@diastage.art` |
| 正式证书 | `certonly --webroot` 成功；名称 `diastage.art`，SAN 为根域与 `www.diastage.art`；ECDSA，签发者 Let's Encrypt YE1 |
| 有效期 | 2026-10-27 02:04:16 UTC 至 2027-01-25 02:04:15 UTC |
| 私钥 | `/etc/letsencrypt/live/diastage.art/privkey.pem`，权限 `600`；内容未输出、未入仓库 |
| Nginx | 已安装 HTTPS 维护模板到现有 `sites-available/default`，保留 enabled 链接；配置检查与 reload 成功，无 `proxy_pass` |
| 防火墙 | 重新登录后新增且核验 IPv4 `0.0.0.0/0`、TCP `443`、允许；备注 `DiaStage HTTPS maintenance and renewal`。共 4 条，原 22、80、ICMP 保留 |
| 外部 HTTP | 根域与 www 均为 `301`，目标 `https://diastage.art/` |
| 外部 HTTPS | 根域与 www 均为 `503`，文本 `DiaStage is being prepared. Please try again later.`；Windows HttpClient 使用正常系统证书校验，没有绕过验证 |
| ACME | 两域 HTTP 验证路径在签发前从外部取得 `200` 和匹配内容；自建检查文件已清理，webroot 保留 |
| 自动续期 | 既有 `certbot.timer` 为 active/enabled，未新建重复计划；root 拥有、`755` 的 deploy-hook 先检查 Nginx，再 reload 并记录日志 |
| 续期演练 | 单证书 staging dry-run 完整退出 `0`，明确报告所有模拟续期成功；正式证书指纹保持不变 |

正式证书 SHA-256 指纹：`95:E5:07:F7:F4:14:71:D0:24:9A:2C:95:CB:B8:AE:1E:62:B2:8E:44:8B:90:47:AF:8D:4D:43:6F:FD:1B:D7:60`。

当前默认站点文件 SHA-256：`38c71c9c3ef1d86c7e11f33dcf72cf92d87a91e134ed65ed2cd1d06cbe944552`，对应仓库的 [HTTPS 维护模板](../deploy/nginx-https-maintenance.conf)。[最终应用代理模板](../deploy/nginx-https.conf)没有安装。

## 续期演练证据与边界

首次非交互 dry-run 按 Certbot 的默认策略随机等待约 327 秒，完成验证及 deploy-hook；但 SSH 输出连接断开，引发末尾 `BrokenPipeError`，不能将其作为完整退出成功记录。

随后只重复 staging 演练，并将输出保存在服务器文件，禁用本次手动演练的随机等待；没有重新申请正式证书：

```sh
sudo certbot renew --cert-name diastage.art --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

第二次于 11:33:52–11:34:06 完成，returncode `0`，输出 `all simulated renewals succeeded`。Nginx 检查惯常写入 stderr，Certbot 因而显示 `Hook ... ran with error output`；其中内容为 `syntax is ok` 和 `test is successful`，不是 hook 失败。11:34:05 的 `diastage-cert-renewal` journal 确认检查与 reload 均完成。此结果验证模拟续期和真实 deploy-hook，不宣称未来定时任务已经执行或正式证书已经续期。

服务器证据：

- `/var/log/letsencrypt/diastage-renew-check-20261027.log` 与同名 `.json`，私有保留完整输出和退出结果。
- `/home/ubuntu/diastage-release-20261027-3c740c8/review/https-maintenance-validation.json`，保留证书元数据、配置摘要、journal、timer 和服务状态。
- 原站点与应用备份位置见[审阅稿回滚部分](diastage-deployment-review-20261027.md#回滚对象与顺序)，仍保留；本轮未演练最终应用回滚。

## 尚未完成的验收

- 内置浏览器打开 `https://diastage.art` 返回 `net::ERR_BLOCKED_BY_CLIENT`，空白页未加载网站；没有绕过限制，也不将此次尝试计为浏览器通过。外部 HTTPS 请求已成功，但正常浏览器、Safari、Secure Cookie 和真实登录交互仍须分别验收。
- 原应用 `diastage.service` 仍 active、PID `27262`、目录 `/home/ubuntu/diastage-release-20261007/DiaStage`；Nginx PID `27986` 仍 active。新候选未启动，4329 仍只监听回环地址。
- `/etc/diastage/production.env`、生产 drop-in 和新数据目录均未创建。本轮没有新发测试邮件或调用付费 AI。
- 下一步按[待办队列](diastage-release-todo.md)完成正常浏览器核验、候选私有配置与稳定认证密钥准备、运行及回滚验收；最终应用发布仍须另行获准。
