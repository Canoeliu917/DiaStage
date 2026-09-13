import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneBridge } from './bridge/scene-bridge'
import { createSceneOperations, type SceneOperations } from './operations'
import type { SceneStore } from './storage/types'
import { registerTheatreProfile } from './theatre-profile'
import { version } from './version'

export type CreatePascalMcpServerOptions = {
  bridge: SceneBridge
  operations?: SceneOperations
  /** Required for persistence tools. Hosted apps and CLIs inject their own store. */
  store?: SceneStore
  name?: string
  version?: string
}

export function createPascalMcpServer(opts: CreatePascalMcpServerOptions): McpServer {
  const server = new McpServer({
    name: opts.name ?? 'diastage-mcp-server',
    version: opts.version ?? version,
  })
  const operations =
    opts.operations ?? createSceneOperations({ bridge: opts.bridge, store: opts.store })
  registerTheatreProfile(server, operations)
  return server
}
