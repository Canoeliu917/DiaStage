import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneBridge } from './bridge/scene-bridge'
import { createSceneOperations, type SceneOperations } from './operations'
import { registerPrompts } from './prompts'
import { registerResources } from './resources'
import type { SceneStore } from './storage/types'
import { registerTheatreProfile } from './theatre-profile'
import { registerTools } from './tools'
import { registerVisionTools } from './tools/vision'
import { version } from './version'

export type CreatePascalMcpServerOptions = {
  bridge: SceneBridge
  operations?: SceneOperations
  /** Required for persistence tools. Hosted apps and CLIs inject their own store. */
  store?: SceneStore
  name?: string
  version?: string
  /** Legacy tools bypass theatre confirmation; enable only for compatibility hosts. */
  profile?: 'theatre' | 'legacy'
}

export function createPascalMcpServer(opts: CreatePascalMcpServerOptions): McpServer {
  const server = new McpServer({
    name: opts.name ?? 'diastage-mcp-server',
    version: opts.version ?? version,
  })
  const operations =
    opts.operations ?? createSceneOperations({ bridge: opts.bridge, store: opts.store })
  if (opts.profile === 'legacy') {
    registerTools(server, operations)
    registerVisionTools(server, operations)
    registerResources(server, operations)
    registerPrompts(server, operations)
  } else {
    registerTheatreProfile(server, operations)
  }
  return server
}
