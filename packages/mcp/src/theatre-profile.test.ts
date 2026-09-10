import { expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { SceneBridge } from './bridge/scene-bridge'
import { createPascalMcpServer } from './server'
import { THEATRE_AGENT_GUIDE } from './theatre-profile'

test('default theatre MCP exposes only implemented reads and rejects mutations', async () => {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const before = bridge.exportJSON()
  const server = createPascalMcpServer({ bridge })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'theatre-profile-test', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  try {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(['export_json', 'get_node', 'get_scene'])
    expect(client.getServerCapabilities()?.prompts).toBeUndefined()
    const { resources } = await client.listResources()
    expect(resources.map((resource) => resource.uri).sort()).toEqual([
      'diastage://agent-guide',
      'diastage://scene/current',
    ])
    expect(JSON.stringify({ tools, resources, guide: THEATRE_AGENT_GUIDE })).not.toMatch(
      /家装|装修|户型|厨房|卫浴|家电|橱柜|暖通|风管|冷媒|屋顶|地形|道路|apartment|renovation|\bMEP\b|\bHVAC\b/i,
    )
    const read = await client.callTool({ name: 'get_scene', arguments: {} })
    expect(read.isError).toBeFalsy()
    expect(read.structuredContent?.nodes).toEqual(before.nodes)
    const exported = await client.callTool({ name: 'export_json', arguments: {} })
    expect(exported.structuredContent?.json).toBe(JSON.stringify(before))
    const denied = await client.callTool({ name: 'apply_patch', arguments: { patch: [] } })
    expect(denied.isError).toBe(true)
    expect(bridge.exportJSON()).toEqual(before)
  } finally {
    await client.close()
    await server.close()
  }
})

test('legacy registration requires explicit host opt-in', async () => {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const server = createPascalMcpServer({ bridge, profile: 'legacy' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'legacy-profile-test', version: '1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const { tools } = await client.listTools()
    expect(tools.some((tool) => tool.name === 'apply_patch')).toBe(true)
    expect(client.getServerCapabilities()?.prompts).toBeDefined()
  } finally {
    await client.close()
    await server.close()
  }
})
