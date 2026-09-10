import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneOperations } from './operations'
import { registerExportJson } from './tools/export-json'
import { registerGetNode } from './tools/get-node'
import { registerGetScene } from './tools/get-scene'

export const THEATRE_AGENT_GUIDE = `# 咫台 DiaStage · 戏剧工作区

咫台用于置景、人物行动排演与复台。先理解场次、人物目标、行动与抵抗，再讨论观察方式。

当前 MCP 接口只提供 get_scene、get_node、export_json。它们读取当前场景或导出 JSON，不修改节点。
场景中的旧节点类型仅用于读取兼容；不得将它们当作生成工作流。
场景位置使用米，X/Z 为舞台平面，Y 向上。内部旋转为弧度，用户界面显示度。

人物、走位、行动、道具交接与排演版本请通过应用中的排演面板编辑。
AI 口令规划、预览、确认与单次撤销的工具闭环尚未实现，不得声称能够通过 MCP 执行这些操作。
不要生成待执行代码，不要调用未列出的工具，也不要将读取或导出结果表述为已经保存、复台或完成现场验收。
`

export function registerTheatreProfile(server: McpServer, operations: SceneOperations): void {
  registerGetScene(server, operations)
  registerGetNode(server, operations)
  registerExportJson(server, operations)

  server.registerResource(
    'theatre-agent-guide',
    'diastage://agent-guide',
    { title: '戏剧工作区说明', mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: THEATRE_AGENT_GUIDE }],
    }),
  )
  server.registerResource(
    'theatre-scene-current',
    'diastage://scene/current',
    { title: '当前舞台数据', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(operations.exportJSON()),
        },
      ],
    }),
  )
}
