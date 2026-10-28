// network-security/index.js — Network Security Agent
// Audits this machine's own exposure: does every fleet agent actually bind to
// localhost only, is anything reachable from the LAN, and is Windows Firewall on.
// Scope is deliberately local-only — this agent never scans other hosts or networks.
import 'dotenv/config'
import express from 'express'
import net from 'net'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import schedule from 'node-schedule'
import { callLLM } from '../shared/llm.js'
import { writeNote, today } from '../shared/obsidian.js'
import { AgentState } from '../shared/agent-state.js'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENTS_ROOT = path.join(__dirname, '..')

const PORT = process.env.NETWORK_SECURITY_PORT || 3012
const app = express()
app.use(express.json())

const state = new AgentState('network-security', 'Local network exposure audits')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Network Security Agent in a personal Agent OS.
You are given raw findings from a local network-exposure audit (port bindings, LAN reachability, firewall state).
Summarize what's safe, what's risky, and exactly what to do about anything risky — in plain language, no jargon dump.
Never recommend scanning or contacting any host other than this machine. Use markdown formatting.`

// Every fleet port this OS is expected to run — kept here so a live reachability
// check doesn't depend on the fleet actually being up.
const FLEET_PORTS = {
  orchestrator: 3001, 'life-admin': 3002, fitness: 3003, learning: 3004,
  memory: 3005, 'vault-manager': 3006, researcher: 3007, builder: 3008,
  'business-expert': 3009, 'manufacturing-expert': 3010, 'career-expert': 3011,
  'network-security': 3012, 'it-security': 3013, maintenance: 3014
}

function tryConnect(host, port, timeoutMs = 800) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let done = false
    const finish = open => { if (!done) { done = true; socket.destroy(); resolve(open) } }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

function getLanAddresses() {
  const ifaces = os.networkInterfaces()
  const addrs = []
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) addrs.push(i.address)
    }
  }
  return addrs
}

async function checkPortBindings() {
  // Static check: every agent's index.js should call app.listen(PORT, '127.0.0.1', ...)
  const results = []
  let entries
  try { entries = await fs.readdir(AGENTS_ROOT, { withFileTypes: true }) } catch { return results }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'shared' || entry.name === 'node_modules') continue
    const file = path.join(AGENTS_ROOT, entry.name, 'index.js')
    try {
      const src = await fs.readFile(file, 'utf-8')
      const listenMatch = src.match(/app\.listen\(PORT[^)]*\)/)
      if (!listenMatch) continue
      const boundLocal = listenMatch[0].includes("'127.0.0.1'") || listenMatch[0].includes('"127.0.0.1"')
      results.push({ agent: entry.name, boundLocal, snippet: listenMatch[0] })
    } catch { /* no index.js in this folder — skip */ }
  }
  return results
}

async function checkLiveReachability() {
  const lanAddrs = getLanAddresses()
  const rows = []
  for (const [name, port] of Object.entries(FLEET_PORTS)) {
    const localhostOpen = await tryConnect('127.0.0.1', port)
    let lanOpen = false
    for (const addr of lanAddrs) {
      if (await tryConnect(addr, port, 500)) { lanOpen = true; break }
    }
    rows.push({ name, port, localhostOpen, lanOpen })
  }
  return { lanAddrs, rows }
}

async function checkFirewall() {
  try {
    const { stdout } = await execAsync('netsh advfirewall show allprofiles state')
    return stdout
  } catch (err) {
    return `Could not read firewall state: ${err.message}`
  }
}

async function runAudit() {
  await state.setTask('Running network exposure audit')
  try {
    const [bindings, reachability, firewall] = await Promise.all([
      checkPortBindings(), checkLiveReachability(), checkFirewall()
    ])

    const unboundAgents = bindings.filter(b => !b.boundLocal)
    const lanExposed = reachability.rows.filter(r => r.lanOpen)

    const findings = `
## Port bindings (static source check)
${bindings.map(b => `- **${b.agent}**: ${b.boundLocal ? '✅ localhost-only' : '🔴 NOT bound to localhost — ' + b.snippet}`).join('\n') || '_No agents found._'}

## Live reachability
LAN addresses on this machine: ${reachability.lanAddrs.join(', ') || 'none detected'}
${reachability.rows.map(r => `- **${r.name}** (${r.port}): localhost ${r.localhostOpen ? 'open' : 'closed'} | LAN ${r.lanOpen ? '🔴 OPEN — reachable from the network' : 'closed'}`).join('\n')}

## Windows Firewall
\`\`\`
${firewall.trim()}
\`\`\`
`

    const summary = await callLLM(SYSTEM_PROMPT, `Audit findings:\n${findings}`).catch(
      err => `_LLM summary unavailable: ${err.message}_`
    )

    const noteContent = `---
date: ${today()}
type: security-audit
agent: network-security
unbound_agents: ${unboundAgents.length}
lan_exposed_ports: ${lanExposed.length}
---

# 🛡️ Network Security Audit — ${today()}

${summary}

---
## Raw findings
${findings}

---
*Generated by Network Security Agent at ${new Date().toLocaleTimeString()}*`

    await writeNote(`Logs/security/network-${today()}.md`, noteContent)
    await state.setIdle()
    return { summary, unboundAgents, lanExposed, findings }
  } catch (err) {
    await state.setIdle()
    throw err
  }
}

// Daily audit — 4:00am, quiet hours
schedule.scheduleJob('0 4 * * *', () => runAudit().catch(err => console.error('[Network Security] Scheduled audit failed:', err.message)))

app.post('/trigger/audit', async (req, res) => {
  try {
    const result = await runAudit()
    res.json({ success: true, result: result.summary, unboundAgents: result.unboundAgents, lanExposed: result.lanExposed })
  } catch (err) {
    res.status(500).json({ error: `Network security audit failed: ${err.message}` })
  }
})

app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'No message provided' })
    await state.setTask(`Answering: ${message.slice(0, 60)}`)
    const result = await callLLM(SYSTEM_PROMPT, message)
    await state.setIdle()
    res.json({ success: true, result })
  } catch (err) {
    await state.setIdle()
    res.status(500).json({ error: `Network Security agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'network-security', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Network Security] 🚀 Agent running on port ${PORT} (localhost only)`))
