# 千问冒烟记录 · 2026-11-01

本机开发进程监听 `127.0.0.1:4321`。环境里没有 `DASHSCOPE_API_KEY`，也没有 `.env.local`。记录里不写密钥。

## 已跑过的请求

1. `{"query":"二道幕","useAi":true,"useWeb":true,"smart":true}`  
   `total` 1，`answer` null，`aiStatus` unavailable，`webStatus` unavailable。  
   `notice` 含「尚未配置」和 `DASHSCOPE_API_KEY`，不含「调用没有完成」。已审资料仍返回，但没有千问引用，因为密钥未配置。

2. `{"query":"zzzzqqqq999999","useAi":true}`  
   `total` 0，`answer` null。  
   `notice` 为「已审资料库中暂无与这次查询匹配的记录，没有编造答案。」含「暂无」，不含「尚未配置」。

3. 用一个非真实占位密钥直接调用检索函数，在发往百炼之前被受邀名单拦住，提示含「受邀」。没有把占位符写入仓库，也没有拿到引用答案。

## 还不能在这台机器上完成的一步

已审词带真实千问引用，以及「调用没有完成」，都要主服务器配上真实 `DASHSCOPE_API_KEY` 和受邀用户后再按 [qwen-search-ops.md](../references/qwen-search-ops.md) 重跑。离线测试已经把「暂无」「尚未配置」「调用没有完成」分成三句。
