# DiaStage 0.1 Invite Beta Blockers

此清单在 Product Backbone 冻结后生效。目标是让5–10位真实用户稳定完成现有闭环，不增加新的产品层。

参考流程：创建场地 → 搭台 → 加入人物 → 排演 → Dia Proposal → Ghost → Human Decision → 保存 → 重新打开；可选 Remount Preview / Mapping。正式 Venue 迁移不是本次 Invite Beta 的承诺。

| # | Blocker | 当前边界与通过条件 | 建议独立范围 |
|---|---|---|---|
| 1 | Auth / Tenant Isolation | 本机/配对角色不等于公网用户身份。使用真实登录，验证两名用户无法读写对方项目、资源、对话、反馈与远控会话；未通过前保持公网连续制景授权禁用。 | `beta/auth-tenancy` |
| 2 | Project Ownership | 为正式项目建立可验证的用户归属，所有读、写、导出、删除和人工授权在服务器检查归属；禁止仅凭客户端 sceneId 或显示状态授权。 | `beta/auth-tenancy` |
| 3 | Server Persistence | 现有本机 Journal、SQLite、单请求保存与版本冲突测试不等于生产持久化认证。以实际运行环境验证重启、断网重连、失败重试与恢复，保留证据。 | `beta/persistence-backup` |
| 4 | Backup / Restore | 用隔离副本完成服务器数据库、素材与必要元数据的备份/恢复演练；验证关联、数量与内容一致，明确恢复失败时不覆盖原项目。 | `beta/persistence-backup` |
| 5 | AI Budget / Kill Switch | 复验现有预算、次数/成本上限、服务器 kill switch、失败计费与停用后的零调用；公网每用户预算必须绑定真实身份，不能用本机会话冒充。 | `beta/real-model`，依赖身份隔离 |
| 6 | Staging Deployment | 后续获得明确部署授权后，建立与真实用户数据/生产隔离的 staging，验证 HTTPS、来源限制、环境配置及监控。本轮没有部署。 | 独立 staging 验证 PR |
| 7 | Real Model Smoke | 使用真实 Key、真实小样本与人工审阅验证 Proposal 格式、能力边界、超时/取消/成本和 Ghost→Human Decision；本轮 NOT_RUN，合成测试不代替质量评估。 | `beta/real-model` |
| 8 | Privacy / Export / Delete | 在真实身份边界下验证项目、历史、反馈及素材的导出/删除，核对浏览器与服务器残留及默认不训练。声明、实际行为和用户可操作入口一致。 | 独立隐私验收 PR，复用现有链路 |
| 9 | Release Smoke / Rollback | 在拟发布版本验证创建→保存→重开、旧场景、撤销/恢复、配对权限和版本回退；真实 iPhone/iPad/Android/低配电脑证据需明确分列，不能由 Chromium 模拟代替。 | `beta/device-validation` 与独立 release 验证 |
| 10 | First 5–10 Users | 招募真实导演、学生或戏剧爱好者，用独立项目完成参考流程，记录失败点、保存恢复结果和支持成本；不能由开发者脚本冒充独立用户验收。 | 用户验证批次，问题分主题修复 |

本清单不包含 Feature Backlog。Document → Stage、Card、Timeline、RAG、Constraint runtime、原生 App 等不作为以上 blockers 的附带实现。每个主题独立分支/PR；PR #1 不再承接新产品功能。本轮没有创建这些后续分支、PR、部署或招募行动。
