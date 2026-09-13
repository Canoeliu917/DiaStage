# 手机语音、连续制景与人民币预算实施记录

验收日期：2026-09-10。分支 `codex/mobile-voice-stage-link`，草稿 PR #1；本轮基线 `a5f6d03`。
用户已明确选择“先完成本机版，公网授权保持禁用”。使用独立 worktree 和临时验收数据库，原工作区场景数据及日志未带入提交。

## P0 实际行为

- 保留音频容器、编码、时长检查，为已安装 OpenAI 7.13 SDK 的 `prompt` 字段加入戏剧空间词汇。
- 普通口令输出默认6000、最大8000；剧本独立12000，可配置8000–12000；最多12次剧本模型调用。
- 详细上下文最多100对象，按选中、名称、门和邻近程度确定性筛选，其余仅发ID、名称和类型索引。必需对象超过100时要求缩小范围，最终执行仍校验完整场景。
- 调用记录采用白名单字段，包含真实API usage、音频时长、请求ID、延迟、路径和错误类型，不记录原始音频、原文口令或完整剧本。未知用量为null，不用字符数冒充真实token。
- `evaluate-stage.ts` 提供18条合成黄金口令和重复评测；停止、取消、撤销由本地优先处理。

## P1 实际行为

- 建议模式默认不写入；桌面明确授权后，HttpOnly / SameSite=Strict Cookie绑定项目与会话，最多30分钟空闲过期。公网和手机令牌不能领取权限。
- 连续制景的安全命令经过白名单、版本、锁定、边界、碰撞与入口校验后自动执行。删除、舞台尺寸、超20对象、外部资产和超费用软限额请求仍需确认。
- 草台的普通StagePlan新增与变换先累积为临时方案，最后一个事务提交，预览不污染正式节点。
- 增加旋转外框对齐、指定净距分布、缩放、批量复制、已有collection分组、登记库同类模型替换。库模型替换保持原ID和尺寸；体块跨类型替换明确拒绝，保护排演引用。
- 本地组合、复制、替换口令用确定性规则识别，不授予模型任意命令执行能力。草台内这些元操作尚未实现虚拟编排，使用前应先结束草台；它们需要独立确认。
- 锁定对象及门通道约束沿用场景保存和撤销。“保持1.2米通道”明确指所有门景片前后各保留1.2米，后续手动和AI调整共用检查。
- 手机只发送校对文字，连续制景按授权自动载入，显示实际处理回执和当前模式。回执重试复用结果。主动断开关闭会话，异常离线由6秒心跳超时和桌面轮询发现后停止授权。
- 关闭桌面面板、切换项目、停止或到期都会中止规划。每轮一步撤销，不越过后续手动修改。复制撤销后清理失效选区。

新增口令示例：

```text
选中布景沿台口对齐
选中布景横向按30厘米净距分布
选中布景缩放到0.5倍
复制选中布景两个沿横向按30厘米净距排列
把这组保存为门前一组
选中布景替换为<舞台库准确名称或ID>
门景片的位置不能动
保持1.2米通道
删除刚才添加的椅子
撤销上一步
停止
```

## P2 实际行为

- 价格集中在 `model-pricing.ts`，生效日期2026-09-10，来源为用户附件的内部预算参考，汇率默认7.00；不是核验后的供应商实时价或实际账单。
- 调用前保守估算并预留金额，调用后按真实usage重新计算参考费用。缓存输入从总输入中扣除后按缓存价计算，避免重复收费；不编造未返回的缓存写入计数。
- 独立SQLite账本复用MCP已有Node/Bun驱动，以数据库事务保护并发预留。默认口令¥0.05、音频¥0.10、剧本¥0.50软限额；剧本¥1.00硬限额；本机工作区每月¥10.00。
- 超软限额原生确认后才调用。硬限额停止后续剧本分块，保留已生成的证据预览并阻止编译落位。无usage的失败/取消保守保留预留，不声称发生实际供应商扣款。
- 月预算范围是本机工作区，尚非公网每用户额度。额度只停止付费调用，手动置景、本地口令、复台可继续。
- 费用置于可收起的“AI使用详情与隐私”；隐私页说明传输范围并链接OpenAI政策，不将 `store:false` 宣传成供应商绝不保留数据。

## 验证结果

| 检查 | 实际结果 |
| --- | --- |
| Core完整回归 | 1467通过，0失败 |
| Editor完整回归 | 221通过，0失败 |
| 最后权限/撤销定向回归 | 12通过，0失败 |
| Editor TypeScript | 通过 |
| MCP build | 通过 |
| Biome（本轮修改TS/TSX） | 通过 |
| Next.js 16.3生产构建 | 通过 |
| 冻结依赖安装 | 通过；清除5条已删插件的锁文件残留 |
| 真实本地HTTP冒烟 | 22项通过，包含配对、重复请求、错误权限、撤销、无密钥503、本地口令及账本 |
| 桌面Chrome UI和独立临时场景数据库 | 连续制景、删除确认、撤销、建议不写入、草台最终提交、手机真实HTTP回执、断线撤权7条流程通过，0个pageerror |
| 合成黄金集 | 18/18，20个字段核对通过，本批已知空间错误放行0，付费调用0 |

合成集本次本地解析P50约0.38ms、P95约5.46ms，只衡量上述有限本地口令，不代表真实录音、网络或模型语义准确率。脚本公开错误样例，失败时返回非零退出码。事务、越权、默认不写入均由store测试及浏览器数据库核对，不推断生产零故障率。

可重复执行：

```powershell
bun test packages/core/src
bun test apps/editor/lib
bun run --cwd apps/editor check-types
bun run --cwd packages/mcp build
bun run --cwd apps/editor build
bun apps/editor/lib/ai/evaluate-stage.ts
# 先以空OPENAI_API_KEY、独立PASCAL_DB_PATH和DIASTAGE_AI_LEDGER_PATH启动4320服务
bun apps/editor/lib/ai/smoke-local.ts http://127.0.0.1:4320
```

## 未实测、未实现及限制

- **未实测**：真实付费API、导演/演员录音、iPhone Safari实机、来电/锁屏/弱网。手机截图仅为桌面Chrome的390×844视口。
- **未实测**：指定模型在实际账号的可用性、转写正确率、真实模型字段准确率、端到端延迟和实际平均账单，真实统计均保留null。
- **未实现，按用户选择暂缓**：公网拥有者登录/授权、Redis/KV共享配对与限流、多用户预算。公网连续制景禁用，本机服务绑定127.0.0.1。
- **未实现**：草台中组合/资产替换的虚拟编排、任意形状通道、多方案自动比较、人工Terra升级按钮；没有自动升级模型。
- 资产替换限ItemNode同类库模型，体块到模型不做静默节点类型转换。
- 失败无usage时的保守预留可能高于实际费用。参考估算采用标准短上下文；长上下文价格已集中保留，供应商实际阈值未实测。
- 配对及授权仍为单进程会话，服务重启后重新配对、授权；不宣称公网生产能力。

## 参考成本

| 场景 | 假设 | 人民币参考值 |
| --- | --- | ---: |
| 文字口令 | Luna标准短上下文，3000输入+800输出 | ¥0.01092 |
| 30秒转写 | 0.5分钟 | ¥0.01575 |
| 30秒语音与规划 | 上述两项 | ¥0.02667 |
| 十段剧本 | 每段8000输入+1500输出 | ¥0.23800 |

## 修改文件

精确清单：`git diff --name-only a5f6d03 HEAD`，不包括本轮前PR已存在的内容。

- 根目录：`.env.defaults`、`.gitignore`、`bun.lock`、本记录。
- `packages/core/src/stage/`：`schema.ts`、`plan.ts`、`parser.ts`。
- `packages/mcp/src/storage/index.ts`：导出现有SQLite驱动。
- `apps/editor/lib/ai/`：`config.ts`、`api.ts`、`openai-server.ts`、`stage-planner.ts`、`voice-transcriber.ts`、`usage.ts`、`p0.test.ts`、`creation-permission.ts`、`model-pricing.ts`、`usage-ledger.ts`、`model-budget.ts`、`budget-client.ts`、`model-budget.test.ts`、`evaluate-stage.ts`、`smoke-local.ts`。
- `apps/editor/lib/stage/`：`relevant-context.ts`、`ai-controls.ts`、对应测试、`creation-policy.ts`、对应测试、`context.ts`、`command-executor.ts`。
- `apps/editor/lib/remote-voice/`：`client.ts`、`session-store.ts`、对应测试。
- `apps/editor/lib/`：`scene-api-security.ts`及对应测试、`scripts/script-planner.ts`。
- `apps/editor/components/stage-entry/`：`creation-mode.tsx`、`command-input.tsx`、`phone-voice-link.tsx`、`remote-voice-controller.tsx`、`script-input.tsx`、`voice-recorder.tsx`。
- `apps/editor/app/`：`api/ai/creation-permission/route.ts`、`api/ai/usage/route.ts`、`api/remote-voice/sessions/[id]/route.ts`及`commands/route.ts`、`privacy/page.tsx`。

未合并、未部署、未修改main。原工作区未提交场景数据保持原样。
