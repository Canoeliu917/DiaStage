# DiaStage 阿里百炼离线兼容试验

日期：2026-10-27（北京时间）。状态：离线验收 39 项、301 次断言全部通过，真实 API 与模型质量尚未验证。

用户已授权第1项离线代码与模拟试验。独立 prototype 位于 `scripts/ai-compatibility`，五类生产 caller 的供应商不切换，但本轮包含下述共享价格/预算及剧本 schema 的代码修改。不设置真实 Key、不写环境配置、不调用真实 API，也不启动或切换应用。模拟通过不等于真实模型质量、网络、账单或上线验收通过。

**协议与覆盖目标。**

- 目标模型为 `qwen3.7-flash-2026-07-15`；使用 Chat 非流式请求、显式 `enable_thinking:false`，通过 `response_format` 的严格 `json_schema` 输出，不假设现有 Responses caller 可只换 host。[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- 复用项目现有五个真实输出 schema，验证完整嵌套结构与运行时解析，不以简化 schema 代替。试验发现剧本 schema 的 `collisionGeometry` 为 optional、非 nullable，导致 SDK schema 无法构造；已通过 `scriptModelFormat()` 统一复用现有 `StageModelPlanSchema`，供生产三处与试验共享。运行时 `StagePlanSchema` 与证据校验不变，不接入阿里生产调用；音频 multipart 不在这五类适配内。
- 使用实际 OpenAI SDK 注入 fake fetch，核对请求模型、消息/图片、schema、非思考及输出限制参数；SDK 只使用模拟凭据，不依赖真实环境 Key。此项验证 SDK 与模拟 wire 的契约，不能证明服务商实际接受所有 schema。
- 已覆盖严格输出成功、无效 JSON/schema、拒答、截断、缺失/异常及零输入/输出 usage、429、调用前无效输入/取消等路径；未模拟连接抛错，不声称网络失败分支已测。异常 usage 拒绝返回业务结果并保留预算预留，不把未知费用当作零。
- 通过实际 SQLite 预算路径验证预留、结算和额度拒绝，与纯内存金额算例区分；使用独立 fixture，不读取或修改正式账户、剧目及预算账本。

**内部保守预算规则，不是供应商精确账单。**

- 每百万 token 的输入/输出参考价分三档：≤32K 为 0.2/0.8 元，>32K–256K 为 0.6/2.4 元，>256K–1M 为 1.2/4.8 元。[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)
- 本轮尚未取得 K/M 单位的精确整数定义，内部采用 `32000 / 256000 / 1000000` 边界，宁可提前升档；按整次输入所属档计算输入及输出预留，不宣称这些整数就是供应商计费边界，也不将它们解释为官方输入加输出的上下文硬上限。
- 所有金额均为人民币，缓存命中也按普通输入价保守预算，不使用折扣，不乘美元汇率。实际结算需核对 `prompt_tokens`、`completion_tokens` 及 `prompt_tokens_details.cached_tokens`；缓存命中已含在输入用量内，不能重复相加。
- 文本的 UTF-8 字节数加 `1024` 仅为本地估算及缓冲，不是已证明的精确 tokenizer 或任意输入上界；真实 usage 与账单仍待获准后验证。
- 单图显式使用 `vl_high_resolution_images:true`。官方对 Qwen3.7 系列说明其忽略 `max_pixels`，按 `16777216` 像素、`16384` 图像 token 上限处理；本试验按每张 `16384` 预留，不复用 GPT 图片公式。[Chat 图片参数](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)
- 输出使用 `max_completion_tokens`，预留额外 `10` token 容差；官方支持 Qwen3.5-Flash 及之后型号，并提示可能存在最多10个 token 误差。截断结果不作为完整业务输出接受。[Chat 输出参数](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)
- 共享 `model-pricing` / `model-budget` 已增加 Qwen 试验分支及人民币 usage 结算跳过汇率换算的处理，属于代码修改；五类生产 caller 的供应商选择不变，未配置正式 provider。全站100元/月、每人1元/日及5元/月的既定额度不变。

**实际结果与复现。**

- 第一条命令 34 项、266 次断言通过（15 协议、8 价格预算、11 既有剧本）；独立进程 SQLite 5 项、35 次断言通过，合计 39 项、301 次断言。实际 SDK 使用 fake fetch/模拟 Key，fetch 兜底外联尝试为0；SQLite fixture 清理通过。
- 单图真实照片 schema 回调、固定高分辨率参数与 `16384` 输入预留通过；缓存按普通输入全额计费、无效汇率不影响人民币预算。零输入/输出等异常 usage 被拒绝并保留预留。
- `apps/editor` tsgo、临时覆盖3个试验脚本的 tsgo 及8文件复用仓库规则的 Biome 通过；独立审阅无阻断项。本轮基线 `2e4632b`，未构建新应用、未云部署，五类生产 caller 的供应商仍未切换，真实 API 调用为0。
- 日志保存在工作区 `outputs/diastage-aliyun-contracts-20261027.log` 与 `outputs/diastage-aliyun-ledger-20261027.log`；这些本机文件不随仓库自动同步。mock 成功不等于真实模型、网络、账单或效果通过。

在仓库根目录执行以下两条命令；预算测试单独进程运行，以隔离 SQLite singleton：

```sh
bun --no-env-file test scripts/ai-compatibility/aliyun-chat.test.ts apps/editor/lib/ai/model-budget.test.ts apps/editor/lib/scripts/stage-facts.test.ts
bun --no-env-file test scripts/ai-compatibility/aliyun-budget.test.ts
```

**下一步边界。**

1. 离线结果已记录，下一步继续既有私有账户准备：核对北京业务空间的实际 Host/Key、首个受邀 userId 及名单匹配，不重复此前已确定的择优偏好，不在聊天或仓库保存凭据。
2. 真实验证须另有明确的小额范围，限定模型、文本/图片数量及费用上限；本轮离线许可不包含开通计费、充值或真实调用，未验证质量和真实账单。
3. 语音暂不使用：下一步先隐藏入口、保留代码，不作为当前首发前置；后续另行核验协议、编码后大小、格式、时长及术语，不因文本/照片模拟通过就认定音频兼容。
4. 按用户顺序后置苹果端/Mac/Safari 测试。生产配置安装、应用公开及真实回滚演练仍需相应验收与授权，本稿不触发部署。
