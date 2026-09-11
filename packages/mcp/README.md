# DiaStage MCP 读取接口

包名 `@pascal-app/mcp` 为兼容现有 imports 保留。咫台默认服务只读取当前舞台，或导出 JSON，不执行自动置景和人物排演修改。

## 默认能力

`createPascalMcpServer({ bridge })` 只注册戏剧读取能力：

| 工具 | 用途 |
| --- | --- |
| `get_scene` | 读取当前场景节点、根节点 ID 和分组 |
| `get_node` | 按 ID 读取节点 |
| `export_json` | 返回完整场景的 JSON 字符串 |

资源只有 `diastage://agent-guide` 和 `diastage://scene/current`。不注册 prompts，不注册生成、修改、视觉分析或伪实现工具。读取结果中的旧节点字段供数据兼容，不构成产品生成入口。AI 计划、预览、确认、执行与一次撤销闭环属于阶段 F。

## 使用

```ts
import { createPascalMcpServer, SceneBridge } from '@pascal-app/mcp'

const bridge = new SceneBridge()
bridge.loadJSON(sceneJson)
const server = createPascalMcpServer({ bridge })
```

构建当前仓库后启动本地二进制：

```sh
bun run --cwd packages/mcp build
node packages/mcp/dist/bin/pascal-mcp.js --stdio --scene ./my-scene.json
```

该场景由宿主或 `--scene` 明确加载。仅设置数据库目录并不意味着读取服务已经绑定浏览器当前场景。

## 兼容边界

`storage` 和 `operations` 子路径仍供应用场景 API、保存及事件流使用。存储位置、SQLite 版本检查和原有数据不变。

原 Pascal 生成、修改、住宅资源和视觉分析工具已从本 package 物理删除，不存在隐藏 profile 或运行时开关。历史参考全文位于 [MCP_README.md](../../docs/history/2026-09-10-before-theatre/MCP_README.md)。

## 验证

```sh
bun test packages/mcp/src/theatre-profile.test.ts packages/mcp/src/tools packages/mcp/src/transports
node node_modules/typescript/bin/tsc --build packages/mcp
```

回归检查读取白名单、JSON 导出、未注册写入拒绝、HTTP 认证与会话隔离。

## 来源与许可

原始版权 Copyright (c) 2026 Pascal Group Inc.。本 package 继续保留 [MIT 许可证](LICENSE)。完整来源见仓库根目录 `THIRD_PARTY_NOTICES.md`。
