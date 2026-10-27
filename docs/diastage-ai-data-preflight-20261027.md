# DiaStage AI 与数据政策接入审阅稿

日期：2026-10-27（北京时间）。本稿用于决定下一阶段方案，不表示功能已接入或上线。

用户已选择按功能兼容性和费用择优，并授权离线代码/模拟试验；这不包含服务计费开通、充值或真实 API 调用许可。[阿里离线试验](diastage-aliyun-offline-trial-20261027.md)已通过39项、301次断言，生产调用方供应商未切换，邮件/AI仍关闭。先推进四核心功能及 Dia 拖入图片/PDF 的入口，语音入口待隐藏、代码保留，苹果端测试后置。

**优先候选：阿里百炼北京部署的 Qwen3.7-Flash 固定快照。**

- 建议优先评估 `qwen3.7-flash-2026-07-15`，首轮使用非思考模式。官方列明文本、图像与结构化输出能力；固定快照便于复现，不能据此承诺效果或称其“最稳定”。[模型说明](https://help.aliyun.com/zh/model-studio/qwen3-7-flash)
- 已核每百万 token 输入/输出价格：输入长度 ≤32K 为 0.2/0.8 元，>32K–256K 为 0.6/2.4 元，>256K–1M 为 1.2/4.8 元。纯文本算例：3,000 输入 + 800 输出为 0.00124 元，不含图片、缓存、思考或重试，不能转换成可承诺的调用次数。[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)
- Chat 接口的 `response_format` 严格 `json_schema` 已有 Qwen3.7-Flash 官方支持说明。Responses 接口虽可用，本次在其参数说明中未找到 `text.format/json_schema` 的支持依据，因此不能声称现有 `responses.parse` 可直接换 host；这也不等于断言 Responses 不支持该能力。[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- 北京业务空间的专属 API Host、API Key 及可用模型须从实际账户读取；不能混用其他地域密钥或把地域选择等同数据零留存承诺。[地域说明](https://help.aliyun.com/zh/model-studio/regions)
- 语音暂不使用、不作为当前首发前置，下一步隐藏入口但保留代码。Qwen3 ASR 仍只是候选，其接口采用 Chat 型 `input_audio` URL/Base64，不是 OpenAI multipart；Base64 编码后 ≤10MB，而现代码允许 ≤12MiB/90 秒、MP4/AAC 与 WebM/Opus，后续需独立核验协议、大小、格式和术语。[ASR 接口](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)

**腾讯保留备用，不能把“同一家云”当作功能兼容保证。**

- 国内 TokenHub 的 `hy3`、`hy4-preview` 均列明支持 Responses，不能沿用“腾讯只有 Chat”的旧判断。[协议总览](https://cloud.tencent.com/document/product/1823/130079)
- Responses 有 JSON Schema 输出说明，Hy3 要求 `additionalProperties:false`；通用协议支持 `input_image`，但这不代表所有模型具备视觉能力。缓存用量详情部分模型不返回，缺失不能解释为零。[Responses 字段](https://cloud.tencent.com/document/product/1823/135873)
- 当前 Hy3/Hy4 能力表未确认图片理解；Hy3 可作为非 preview 文本候选，但本轮未核到不可变快照保证。照片仍需另选并验证明确具备视觉能力的模型。[模型列表](https://cloud.tencent.com/document/product/1823/130051)
- 广州按量价每百万 token：Hy3 输入/输出/缓存命中为 1/4/0.25 元，Hy4 preview 为 6/18/0.3 元；不得套用现有 GPT 缓存写入价格。[模型价格](https://cloud.tencent.com/document/product/1823/130055)
- 已核腾讯 ASR 极速版需独立开通，使用 AppID、SecretID/Key 签名与原始音频 body，不能直接替换 OpenAI multipart。[ASR 接口](https://cloud.tencent.com/document/product/1093/52097)
- 普通极速版后付费首档 3.10 元/小时，大模型1.0版 5 元/小时；普通版每月5小时免费，大模型版不适用该免费额度。新版计费文档说明后付费默认关闭，实际账户状态仍需核对。[ASR 计费](https://cloud.tencent.com/document/product/1093/35686)

就本项目已核的纯 token 价格、图像能力及快照可控性，优先评估阿里是项目判断，不是全平台稳定性排名。文本、照片、语音可分别选型；未经验证不承诺单个模型覆盖全部功能。

**接入需要改协议与预算，不能只换 Key。**

- 六类 AI 入口中，文本/照片走 Responses 严格结构化输出，音频走 multipart 转写。应逐一确认所需 schema、拒答、截断、错误与 usage 语义；若改走官方已确认的 Chat 结构化输出，需要相应适配及回归，不能只替换 base URL。
- 共享价格/预算代码已增加 Qwen 试验分支及人民币 usage 跳过汇率换算，缓存按普通输入价保守计算；单图固定 `vl_high_resolution_images:true` 并预留16384图像 token、输出额外10 token。五类生产 caller 的供应商仍原样，默认仍为 GPT-5.6 Luna；K/M整数边界采用内部保守值而非精确账单承诺，文本字节估算也不是已证明上界。异常usage拒绝并保留预留；全站100元/月、每人1元/日及5元/月额度不变。
- real-eval 已补缺少 `userId` 时的 guard；真实评估需设置 `DIASTAGE_REAL_EVAL_USER_ID` 并匹配既有邀请名单。本地最终 7/7 测试、90 次断言、tsgo、Biome 及 diff 检查通过，独立代码审阅无阻断项；这不批准费用、不改变额度，也不代表已执行真实评估。
- 最终 Nginx 源模板已改用不含 URI/Referer 的专用 access log 格式；隔离夹具 `nginx -t`、6 请求及日志核对通过，原 URI 仍透传，伪造代理头被覆盖。自签证书、临时日志与进程已清理，未 reload 正式服务；error log 等其他日志仍需复核，不能承诺全部日志已无泄漏风险。

本轮基于 `8bfc287` 的评估工具/测试及 Nginx 模板修补尚未部署；已构建应用仍为 `3c740c8`，不能把本地检查记为新应用构建。Nginx 隔离报告保存在服务器 `/home/ubuntu/diastage-release-20261027-3c740c8/review/log-validation/report.json`，本机副本为工作区 `outputs/diastage-safe-access-log-validation-20261027.json`。报告 SHA-256：`028fc858502ce1de7a38eef701f1b99f11fa7c3738df78cab5304b2a289a8acc`；规范化模板 SHA-256：`2327bb41dc80303614435c32b57daa49fa1031f1b3557eaff1d7179c7ae3385b`。

后续基于 `2e4632b` 的独立阿里 prototype 已完成39项/301断言、两份tsgo及8文件Biome，独立审阅无阻断项。五个真实 schema、实际 SDK+fake fetch、独立进程 SQLite 通过；仅修复剧本既有 schema 构造错误，三处生产调用与试验共享 `scriptModelFormat()`/`StageModelPlanSchema`，运行时 `StagePlanSchema` 和证据校验不变。未测连接抛错、真实质量或账单，未构建新应用/部署，真实API为0；详见离线试验记录。

**数据处理事实与待定政策。**

- 账号注销尚未启用；剧目 DELETE 后端已有，但 UI 没有删除按钮。备份、预算账本尚无定期清理机制，不能把单个剧目删除描述为所有副本已删除。
- 排演请求可含最多12,000字符剧本、用户意图、最多8条/6,000字符近期对话，以及上一轮提案反馈。不得承诺“只上传一句话”或“零留存”；供应商处理与保留安排也需核实。
- 删除方式可选人工、自助或先人工后自助；建议先人工后自助，但用户尚未选择。若首发采用 `21@diastage.art` 人工受理，须先确定身份核验、执行负责人、实际删除范围、备份例外和回复流程。邮箱入口不等于删除功能已完成。
- 活跃账号/剧目、备份、预算账本及日志的保留期限与删除边界分别待用户决定；本稿不自行设天数，不新增未证实的法律或合规承诺。

**仍需落实的决定。**

1. 继续准备北京实际业务空间 Host/Key、首个受邀 userId 及最多20名名单，并落实限定费用/范围的真实文本/照片小测；离线已通过不等于真实调用获准，AI继续关闭。语音暂缓，不阻塞当前四核心功能。
2. 明确是否允许计费开通及一次小额真实验证，并限定模型、功能、数量和总费用；本次“择优”不替代该许可。
3. 选择人工、自助或先人工后自助的删除流程，并决定各类数据期限、备份与账本例外及公开说明，再完善隐私与使用条款。

**下一步验收门槛。**

1. 五类文本/照片的真实 schema、SDK契约及预算离线证据已完成，保持原范围，进入获准的私有账户与限额小测准备；Dia 拖入剧目图片/PDF的入口尚待实现，语音隐藏入口不删除代码。
2. 保留已通过的 real-eval guard 与日志模板离线证据，继续复核 error log；未来配置、稳定密钥及名单仅保存在服务器私有位置，不得因适配扩大可信 origin 或默认开启真实 AI。
3. 在明确真实验证许可后，小量核对文本指令、照片舞台还原、舞台术语转写、延迟、usage 和供应商账单；实测未完成前不保证效果、次数或费用。
4. 按用户顺序后置 Mac/Safari 及实际浏览器 TLS/Secure Cookie 检查。正式应用配置安装、公开切换及真实回滚演练仍待验收与适用授权；本稿不触发部署。
