import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const smokeRoot = await mkdtemp(path.join(os.tmpdir(), 'pascal-cli-smoke-'))
let tarballPath: string | null = null
let smokeExecutable: string | null = null
const defaultPortBlocker = http.createServer((_request, response) => {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ status: 'ok', app: 'foreign' }))
})
const smokeEnvironment = {
  ...process.env,
  OPENAI_API_KEY: '',
  PASCAL_HOME: path.join(smokeRoot, 'home'),
  PASCAL_NO_OPEN: '1',
}

try {
  await listen(defaultPortBlocker)
  const pack = await run('npm', ['pack', '--json', '--ignore-scripts'], packageDirectory)
  const packResult = JSON.parse(pack.stdout) as
    | Array<PackedArtifact>
    | Record<string, PackedArtifact>
  const artifact = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0]
  if (!artifact) throw new Error('npm pack did not return an artifact')
  tarballPath = path.join(packageDirectory, artifact.filename)
  enforceArtifactBudget(artifact)

  const installDirectory = path.join(smokeRoot, 'install')
  await run('npm', ['install', '--ignore-scripts', '--prefix', installDirectory, tarballPath])
  smokeExecutable = path.join(installDirectory, 'node_modules/@pascal-app/cli/dist/bin/pascal.js')

  const started = JSON.parse(
    (
      await run(
        process.execPath,
        [smokeExecutable, 'editor', '--no-open', '--json'],
        undefined,
        smokeEnvironment,
      )
    ).stdout,
  ) as { pid: number; port: number; url: string }
  if (started.port === 3000) throw new Error('editor reused the occupied default port')
  const rootResponse = await fetch(`http://127.0.0.1:${started.port}/`)
  if (!rootResponse.ok) throw new Error(`editor root returned ${rootResponse.status}`)
  const scenesResponse = await fetch(`${started.url}/scenes`)
  if (!scenesResponse.ok) throw new Error(`editor scenes returned ${scenesResponse.status}`)
  // Exercise the packed document worker after removing native canvas modules.
  const form = new FormData()
  form.set('file', new Blob([textPdf()], { type: 'application/pdf' }), 'stage.pdf')
  const script = await fetch(`http://127.0.0.1:${started.port}/api/script/stage-plan`, {
    method: 'POST',
    headers: { Origin: `http://127.0.0.1:${started.port}` },
    body: form,
  })
  const extracted = (await script.json()) as { file?: { pageCount: number }; error?: unknown }
  if (!script.ok || extracted.file?.pageCount !== 1)
    throw new Error(`packed PDF text extraction failed: ${JSON.stringify(extracted)}`)
  const repeatedStart = JSON.parse(
    (
      await run(
        process.execPath,
        [smokeExecutable, 'editor', '--no-open', '--port', '0', '--json'],
        undefined,
        smokeEnvironment,
      )
    ).stdout,
  ) as { alreadyRunning: boolean; pid: number; port: number }
  if (
    !repeatedStart.alreadyRunning ||
    repeatedStart.pid !== started.pid ||
    repeatedStart.port !== started.port
  ) {
    throw new Error('a repeated editor command did not reuse the managed process')
  }
  const humanStart = await run(
    process.execPath,
    [smokeExecutable, 'editor', '--no-open'],
    undefined,
    smokeEnvironment,
  )
  if (
    !humanStart.stdout.includes('pascal status') ||
    humanStart.stdout.includes('npm install --global @pascal-app/cli')
  ) {
    throw new Error('direct CLI start output did not use the persistent pascal command')
  }
  await run(
    process.execPath,
    [smokeExecutable, 'project', 'list', '--json'],
    undefined,
    smokeEnvironment,
  )
  const mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [smokeExecutable, 'mcp', 'connect'],
    env: smokeEnvironment as Record<string, string>,
    stderr: 'pipe',
  })
  const mcpClient = new Client({ name: 'pascal-cli-smoke', version: '0.0.0' })
  try {
    await mcpClient.connect(mcpTransport)
    const tools = await mcpClient.listTools()
    if (!tools.tools.some((tool) => tool.name === 'save_scene')) {
      throw new Error('managed MCP did not expose save_scene')
    }
    const saved = await mcpClient.callTool({
      name: 'save_scene',
      arguments: { id: 'smoke-project', name: 'Smoke project' },
    })
    if (saved.isError) throw new Error(`managed MCP save_scene failed: ${JSON.stringify(saved)}`)
  } finally {
    await mcpClient.close()
  }
  const resumed = JSON.parse(
    (
      await run(
        process.execPath,
        [smokeExecutable, 'resume', 'Smoke project', '--json'],
        undefined,
        smokeEnvironment,
      )
    ).stdout,
  ) as { project: { id: string }; url: string }
  if (resumed.project.id !== 'smoke-project' || !resumed.url.endsWith('/scene/smoke-project')) {
    throw new Error('CLI project resume did not resolve the MCP-saved project')
  }
  await run(process.execPath, [smokeExecutable, 'doctor', '--json'], undefined, smokeEnvironment)
  await run(process.execPath, [smokeExecutable, 'stop', '--json'], undefined, smokeEnvironment)
  smokeExecutable = null

  console.log(
    `Packed runtime smoke passed (${formatMb(artifact.size)} MB compressed, ${formatMb(artifact.unpackedSize)} MB unpacked, ${artifact.entryCount} files).`,
  )
} finally {
  await close(defaultPortBlocker)
  if (smokeExecutable) {
    await run(
      process.execPath,
      [smokeExecutable, 'stop', '--force', '--json'],
      undefined,
      smokeEnvironment,
    ).catch(() => undefined)
  }
  if (tarballPath) await rm(tarballPath, { force: true })
  await rm(smokeRoot, { recursive: true, force: true })
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      error.code === 'EADDRINUSE' ? resolve() : reject(error),
    )
    server.listen({ host: '::', port: 3000, ipv6Only: false }, resolve)
  })
}

async function close(server: http.Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

interface PackedArtifact {
  filename: string
  size: number
  unpackedSize: number
  entryCount: number
}

function enforceArtifactBudget(artifact: {
  size: number
  unpackedSize: number
  entryCount: number
}): void {
  // This branch already ships the offline catalog, audio, materials and Chinese font.
  // CI measures 188.6 / 251.8 MiB and 5,195 files after removing native PDF renderers.
  const maximumSize = 200 * 1024 * 1024
  const maximumUnpackedSize = 275 * 1024 * 1024
  const maximumEntryCount = 5_500
  if (
    artifact.size > maximumSize ||
    artifact.unpackedSize > maximumUnpackedSize ||
    artifact.entryCount > maximumEntryCount
  ) {
    throw new Error(
      `packed CLI exceeds its release budget: ${formatMb(artifact.size)} MB compressed, ${formatMb(artifact.unpackedSize)} MB unpacked, ${artifact.entryCount} files`,
    )
  }
}

async function run(
  command: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string }> {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
  const result = {
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${exitCode}): ${result.stderr}`)
  }
  return result
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

function textPdf(): string {
  const text = '建立一个宽8米深6米的镜框式舞台。'
  const hex = Array.from(text)
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
  const stream = `BT /F1 12 Tf 20 700 Td <${hex}> Tj ET`
  const cmap =
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /IdentityUCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>',
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  return `${pdf}xref\n0 8\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
}
