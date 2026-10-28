// offline-llm/index.js — Offline LLM Agent
// Bridges Mika OS to locally-running models, two ways:
//  (a) "With LM Studio" — the LM Studio app/CLI's own OpenAI-compatible
//      server (http://localhost:1234), started via the app's Developer tab
//      or `lms server start`. This is the primary, best-supported path.
//  (b) "Without LM Studio" — launches the llama.cpp `llama-server.exe`
//      binary that LM Studio itself bundles (under
//      <LM Studio home>/extensions/backends/), pointed directly at a GGUF
//      file. Runs standalone — no LM Studio app/CLI required once started.
// Not part of the cloud orchestrator's LLM-routing classification — this is
// a deliberately separate, local-only capability the user reaches directly.
import 'dotenv/config'
import express from 'express'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.OFFLINE_LLM_PORT || 3015
const app = express()
app.use(express.json())

const state = new AgentState('offline-llm', 'Local model bridge (LM Studio + standalone llama.cpp)')
state.injectControlEndpoints(app)

const LMSTUDIO_BASE = process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234'
const LMSTUDIO_HOME = process.env.LMSTUDIO_HOME || path.join(process.env.USERPROFILE || '', '.lmstudio')

// Standalone servers this agent has launched itself, keyed by port, so they
// can be tracked/stopped without hunting for PIDs manually.
const standaloneServers = new Map() // port -> { process, modelPath, startedAt }

async function isLmStudioReachable() {
  try {
    const res = await fetch(`${LMSTUDIO_BASE}/v1/models`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

// Find every .gguf file under the LM Studio models folder, whether or not
// LM Studio's own index ("lms ls") has picked it up yet.
async function findLocalGgufFiles() {
  const modelsRoot = path.join(LMSTUDIO_HOME, 'models')
  const results = []
  async function walk(dir) {
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.endsWith('.gguf') && !entry.name.startsWith('mmproj-')) {
        results.push({ name: entry.name, path: full, sizeBytes: (await fsp.stat(full).catch(() => null))?.size || 0 })
      }
    }
  }
  await walk(modelsRoot)
  return results
}

app.get('/status', async (req, res) => {
  const lmStudioUp = await isLmStudioReachable()
  res.json({
    lmStudio: { reachable: lmStudioUp, baseUrl: LMSTUDIO_BASE },
    standaloneServers: [...standaloneServers.entries()].map(([port, s]) => ({ port, modelPath: s.modelPath, startedAt: s.startedAt }))
  })
})

// List available models — prefers LM Studio's own index (has real metadata),
// falls back to a raw filesystem scan (works even if LM Studio's app has
// never been opened, e.g. models were only ever downloaded).
app.get('/models', async (req, res) => {
  if (await isLmStudioReachable()) {
    try {
      const r = await fetch(`${LMSTUDIO_BASE}/v1/models`, { signal: AbortSignal.timeout(3000) })
      const data = await r.json()
      return res.json({ source: 'lmstudio', models: data.data.map(m => ({ id: m.id, name: m.id })) })
    } catch { /* fall through to filesystem scan */ }
  }
  const files = await findLocalGgufFiles()
  res.json({ source: 'filesystem', models: files.map(f => ({ id: f.path, name: f.name, sizeBytes: f.sizeBytes })) })
})

// Chat — routes to whichever backend the caller points at: LM Studio's
// server by default, or a standalone server this agent started (pass its
// port). Same OpenAI-compatible shape either way, so the caller doesn't need
// to know which one is actually serving the request.
app.post('/chat', async (req, res) => {
  const { model, message, systemPrompt, standalonePort } = req.body
  if (!message) return res.status(400).json({ error: 'No message provided' })

  const baseUrl = standalonePort ? `http://127.0.0.1:${standalonePort}` : LMSTUDIO_BASE

  await state.setTask(`Chatting via ${standalonePort ? `standalone:${standalonePort}` : 'LM Studio'}`)
  try {
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: message })

    const r = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 1024 }),
      signal: AbortSignal.timeout(120000) // local models can be slow on first load
    })

    if (r.status === 503) {
      // The server process is up but still loading the model into memory —
      // a real, expected, transient state, not a connectivity problem.
      throw new Error('LOADING')
    }
    if (!r.ok) {
      const errBody = await r.text().catch(() => '')
      throw new Error(`Local model server returned ${r.status}: ${errBody.slice(0, 300)}`)
    }

    const data = await r.json()
    const reply = data.choices?.[0]?.message?.content || 'No response received.'
    await state.setIdle()
    res.json({ success: true, result: reply, model: data.model || model })
  } catch (err) {
    await state.setIdle()
    if (err.message === 'LOADING') {
      return res.status(503).json({ error: 'Model is still loading into memory — try again in a few seconds.', loading: true })
    }
    const hint = standalonePort
      ? `Is a standalone server actually running on port ${standalonePort}? Check /status.`
      : `Is LM Studio's server running? Start it from LM Studio's Developer tab, or "lms server start".`
    res.status(500).json({ error: `${err.message} — ${hint}` })
  }
})

// Launch the bundled llama-server.exe directly against a GGUF file — the
// "without LM Studio" path. Runs detached; caller gets the port back and can
// use it as `standalonePort` in /chat calls from then on.
app.post('/standalone/start', async (req, res) => {
  const { modelPath, port } = req.body
  if (!modelPath) return res.status(400).json({ error: 'modelPath is required (see /models for options)' })
  if (!fs.existsSync(modelPath)) return res.status(400).json({ error: `File not found: ${modelPath}` })

  const usePort = port || 8090 + standaloneServers.size
  if (standaloneServers.has(usePort)) {
    return res.json({ success: true, port: usePort, alreadyRunning: true })
  }

  const backendDir = await findNewestLlamaCppBackend()
  if (!backendDir) {
    return res.status(500).json({ error: 'Could not find a bundled llama.cpp backend under LM Studio\'s extensions/backends folder.' })
  }
  const serverExe = path.join(backendDir, 'llama-server.exe')

  const child = spawn(serverExe, ['-m', modelPath, '--port', String(usePort), '--host', '127.0.0.1', '-c', '4096', '--jinja'], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  standaloneServers.set(usePort, { process: child, modelPath, startedAt: new Date().toISOString() })

  res.json({ success: true, port: usePort, pid: child.pid, backend: path.basename(backendDir) })
})

app.post('/standalone/stop', async (req, res) => {
  const { port } = req.body
  const entry = standaloneServers.get(Number(port))
  if (!entry) return res.status(404).json({ error: `No standalone server tracked on port ${port}` })
  try { process.kill(entry.process.pid) } catch { /* already gone */ }
  standaloneServers.delete(Number(port))
  res.json({ success: true })
})

async function findNewestLlamaCppBackend() {
  const backendsDir = path.join(LMSTUDIO_HOME, 'extensions', 'backends')
  try {
    const entries = await fsp.readdir(backendsDir, { withFileTypes: true })
    const candidates = entries
      .filter(e => e.isDirectory() && e.name.startsWith('llama.cpp-') && fs.existsSync(path.join(backendsDir, e.name, 'llama-server.exe')))
      .map(e => e.name)
      .sort() // lexical sort puts higher version numbers last, close enough given consistent naming
    if (!candidates.length) return null
    return path.join(backendsDir, candidates[candidates.length - 1])
  } catch {
    return null
  }
}

app.get('/health', (req, res) => {
  res.json({ agent: 'offline-llm', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Offline LLM] 🚀 Agent running on port ${PORT} (localhost only)`))
