# 千问检索：本地与腾讯云

DiaMotif 的智能检索使用阿里云百炼北京的通义千问。模型固定为 `qwen3.7-flash-2026-07-15`。兼容接口用来做已审资料的引用回答；原生检索接口用来做联网候选。原生地址由 `DASHSCOPE_BASE_URL` 的主机名接上 `/api/v1/services/aigc/multimodal-generation/generation`，默认主机是 `dashscope.aliyuncs.com`。

## 环境变量

只写在服务器环境或根目录 `.env.local`，不要加 `NEXT_PUBLIC_`，不要提交真实密钥。

```dotenv
DIASTAGE_AI_PROVIDER=aliyun
DASHSCOPE_API_KEY=服务端密钥
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DIASTAGE_AI_BETA_USER_IDS=已核对的受邀账号用户ID
```

`DASHSCOPE_BASE_URL` 只接受 `https://dashscope.aliyuncs.com/compatible-mode/v1`，或北京 MaaS 主机 `https://ws-<id>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。缺少 `DASHSCOPE_API_KEY` 时不会改用 OpenAI 密钥。

改完后重启 Node 进程。腾讯云上把上述变量配在云服务器或容器的环境变量里，不要写进镜像层或网页。

## 用户能看到的三种结果

- 已审资料库没有匹配：页面写明「暂无」，不编造答案。联网候选若出现，只作未审核线索，不进入公开检索。
- 密钥未配置：页面写明「千问尚未配置」，并点名 `DIASTAGE_AI_PROVIDER` 与 `DASHSCOPE_API_KEY`。已有资料仍可打开。
- 调用失败：页面写明「千问调用没有完成」。这和密钥缺失、资料库为空不是同一句。

有已审样本时，回答必须带上这些样本的引用编号。引用对不上、或回答里出现自行编写的链接，答案不显示。

千问回答仍使用现有登录与受邀名单。未登录或未受邀时不会发起付费调用。余额充足也不能跳过引用校验。
