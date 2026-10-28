// orchestrator/index.js — Orchestrator Agent
// The single entry point. Routes your requests to the right sub-agent.
import 'dotenv/config'
import express from 'express'
import { callLLM, activeProvider } from '../shared/llm.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readNote, readFolder, appendNote, VAULT } from '../shared/obsidian.js'

const PORT = process.env.ORCHESTRATOR_PORT || 3001
const app = express()
app.use(express.json())

// CORS — allow Electron renderer or local dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Stats tracking
const startTime = Date.now()
let requestCount = 0
let lastRoutedAgent = null

// Agent registry — maps domain → port
const AGENTS = {
  'life-admin':   `http://localhost:${process.env.LIFE_ADMIN_PORT || 3002}`,
  'fitness':      `http://localhost:${process.env.FITNESS_PORT    || 3003}`,
  'learning':     `http://localhost:${process.env.LEARNING_PORT   || 3004}`,
  'memory':       `http://localhost:${process.env.MEMORY_PORT     || 3005}`,
  'researcher':   `http://localhost:${process.env.RESEARCHER_PORT || 3007}`,
  'builder':      `http://localhost:${process.env.BUILDER_PORT    || 3008}`,
  'business-expert':       `http://localhost:${process.env.BUSINESS_EXPERT_PORT       || 3009}`,
  'manufacturing-expert':  `http://localhost:${process.env.MANUFACTURING_EXPERT_PORT  || 3010}`,
  'career-expert':         `http://localhost:${process.env.CAREER_EXPERT_PORT         || 3011}`,
  'network-security':      `http://localhost:${process.env.NETWORK_SECURITY_PORT      || 3012}`,
  'it-security':           `http://localhost:${process.env.IT_SECURITY_PORT           || 3013}`,
  'maintenance':           `http://localhost:${process.env.MAINTENANCE_PORT           || 3014}`
}

// Agents included in health/status checks but not in LLM chat routing (no /ask handler)
const NON_ROUTABLE_AGENTS = {
  'vault-manager': `http://localhost:${process.env.VAULT_MANAGER_PORT || 3006}`,
  'offline-llm':   `http://localhost:${process.env.OFFLINE_LLM_PORT || 3015}`
}

// ── System prompt ─────────────────────────────────────────────────────────────
const ROUTER_PROMPT = `You are the Orchestrator of a personal Agent OS.
Your only job is to classify which agent should handle the user's request.

Available agents:
- life-admin: tasks, scheduling, planning, morning briefing, to-dos, priorities, weekly planning, end-of-day
- fitness: workouts, nutrition, health, exercise, body, training, recovery, sleep
- learning: courses, studying, education, skill building, flashcards, retention
- memory: save this, remember this, add to vault, index, store information
- researcher: look up, research, find out, what's the latest on, search the web for, compare options
- builder: build me, make an app, create a script/tool/website, scaffold a project, code this up
- business-expert: pricing, client acquisition, marketing, growth strategy, business model
- manufacturing-expert: CNC, 3D printing, CAD, toolpaths, production workflow, tooling, quality control
- career-expert: CV positioning, interview prep, drafting tailored job applications (never submitted automatically), skill gaps
- network-security: is my network exposed, open ports, firewall status, is anything reachable from the LAN
- it-security: dependency vulnerabilities, npm audit, secrets/gitignore hygiene, is my code safe to commit
- maintenance: outdated packages, updating dependencies, keeping the OS itself current

Respond with ONLY the agent name (e.g. "life-admin"). No explanation.
If ambiguous, default to "life-admin".`

// ── Route request to correct agent ───────────────────────────────────────────
async function routeRequest(userMessage, trigger = 'ask') {
  requestCount++

  // 1. Ask LLM which agent to route to
  let agentName
  try {
    agentName = (await callLLM(ROUTER_PROMPT, userMessage)).trim().toLowerCase()
  } catch (err) {
    return { agent: 'orchestrator', error: `LLM routing failed: ${err.message}` }
  }
  lastRoutedAgent = agentName
  console.log(`[Orchestrator] Routing "${userMessage.slice(0, 50)}..." → ${agentName}`)
  logActivity(`Mika asked ${agentName}: "${userMessage.slice(0, 80)}"`)

  const agentUrl = AGENTS[agentName]
  if (!agentUrl) {
    return { agent: 'orchestrator', reply: `I don't have an agent for "${agentName}" yet.` }
  }

  // 2. Forward to the chosen agent
  try {
    const response = await fetch(`${agentUrl}/trigger/${trigger}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage })
    })
    const data = await response.json()
    return { agent: agentName, ...data }
  } catch (err) {
    // Agent might not have this exact trigger — fall back to direct ask
    try {
      const response = await fetch(`${agentUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      })
      const data = await response.json()
      return { agent: agentName, ...data }
    } catch (err2) {
      return { agent: agentName, error: `Could not reach ${agentName} agent: ${err2.message}` }
    }
  }
}

// ── HTTP endpoints ────────────────────────────────────────────────────────────

// Main entry point — ask anything
app.post('/ask', async (req, res) => {
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'No message provided' })

  const result = await routeRequest(message)
  res.json(result)
})

// Direct triggers (shortcuts)
app.post('/morning', async (req, res) => {
  const result = await routeRequest('Run my morning briefing', 'morning-briefing')
  res.json(result)
})

app.post('/evening', async (req, res) => {
  const result = await routeRequest('Run my end of day wrap', 'eod-wrap')
  res.json(result)
})

app.post('/weekly-plan', async (req, res) => {
  const result = await routeRequest('Create my weekly plan', 'weekly-plan')
  res.json(result)
})

// Health check + agent status
app.get('/health', async (req, res) => {
  const agentStatuses = await getLiveAgentStatuses()
  res.json({
    agent: 'orchestrator',
    status: 'running',
    time: new Date().toISOString(),
    agents: agentStatuses
  })
})

async function getLiveAgentStatuses() {
  return await Promise.all(
    Object.entries({ ...AGENTS, ...NON_ROUTABLE_AGENTS }).map(async ([name, url]) => {
      try {
        const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
        const data = await r.json()
        return { name, ...data } // already contains status, currentTask from AgentState
      } catch {
        return { name, status: 'offline', currentTask: 'Unreachable' }
      }
    })
  )
}

// ── Executive Director Loop ──────────────────────────────────────────────────
let latestEvaluation = "Evaluation pending..."

const DIRECTOR_PROMPT = `You are the Executive Director of the Agent OS.
Your job is to read the live statuses of all agents and make executive decisions.
Are they doing the right tasks? Should any be paused or resumed?

Output a brief 1-2 sentence evaluation summary of the fleet.
Then, if you want to pause an agent, output exactly: [PAUSE: agent-name]
If you want to resume an agent, output exactly: [RESUME: agent-name]

Only pause an agent if it is explicitly doing something wrong or conflicting.`

// Only ask the model to evaluate when an agent's status/task actually changed
// (or as a 30-min safety check). It used to call the LLM every 20s regardless
// — ~4,300 calls a day re-reading unchanged status files.
const DIRECTOR_MAX_QUIET_MS = 30 * 60 * 1000
let lastEvaluatedFingerprint = null
let lastEvaluatedAt = 0

async function directorEvaluateLoop() {
  try {
    const agentsMd = await readFolder('Logs/Agents')

    if (!agentsMd || agentsMd.trim() === '') {
       latestEvaluation = "No agent data to evaluate yet."
       return
    }

    const fingerprint = JSON.stringify(parseAgentSnapshot(agentsMd))
    if (fingerprint === lastEvaluatedFingerprint && Date.now() - lastEvaluatedAt < DIRECTOR_MAX_QUIET_MS) return
    lastEvaluatedFingerprint = fingerprint
    lastEvaluatedAt = Date.now()
    console.log('[Orchestrator] 👔 Director is evaluating the fleet...')

    const evaluation = await callLLM(DIRECTOR_PROMPT, `Here is the current state of the fleet:\n\n${agentsMd}`, { maxTokens: 300 })
    latestEvaluation = evaluation
    console.log('[Orchestrator] 👔 Evaluation complete.')
    
    // Parse commands
    const pauseMatches = [...evaluation.matchAll(/\[PAUSE:\s*([\w-]+)\]/gi)]
    const resumeMatches = [...evaluation.matchAll(/\[RESUME:\s*([\w-]+)\]/gi)]
    
    for (const match of pauseMatches) {
      const agent = match[1].toLowerCase()
      if (AGENTS[agent]) {
        console.log(`[Orchestrator] 👔 Executing PAUSE command on ${agent}`)
        await fetch(`${AGENTS[agent]}/pause`, { method: 'POST' }).catch(() => {})
      }
    }
    
    for (const match of resumeMatches) {
      const agent = match[1].toLowerCase()
      if (AGENTS[agent]) {
        console.log(`[Orchestrator] 👔 Executing RESUME command on ${agent}`)
        await fetch(`${AGENTS[agent]}/resume`, { method: 'POST' }).catch(() => {})
      }
    }
    
  } catch (err) {
    console.error('[Orchestrator] 👔 Evaluation failed:', err.message)
    latestEvaluation = `Evaluation failed: ${err.message}`
  }
}

// Run every 20 seconds
setInterval(directorEvaluateLoop, 30000)
// Run immediately once
setTimeout(directorEvaluateLoop, 3000)

app.get('/director-summary', async (req, res) => {
  const agentStatuses = await getLiveAgentStatuses()
  res.json({
    summary: latestEvaluation,
    agents: agentStatuses,
    llm: await activeProvider(),
    time: new Date().toISOString()
  })
})

// ── Agent Chat ────────────────────────────────────────────────────────────────
// A shared feed: the Director posts short remarks here whenever an agent's
// status/task actually changes (not on a fixed timer — avoids repeating itself
// when nothing happened), and the user can post into the same feed. A user
// message is routed through the normal routeRequest() pipeline and the
// responding agent's reply is appended right after it.
let agentChatLog = []
let previousAgentSnapshot = {}

// kind: 'checkin' | 'report' | 'reply' | 'action' | undefined (plain chatter)
function pushChatMessage(from, text, kind) {
  const msg = { from, text, time: new Date().toISOString(), ...(kind ? { kind } : {}) }
  agentChatLog.push(msg)
  if (agentChatLog.length > 200) agentChatLog.shift()
  if (from === 'director' && /\?\s*$/m.test(text)) openQuestion = { text, askedAt: Date.now() }
  appendNote(
    'Logs/conversations/agent-chat.md',
    `**${from}** (${new Date(msg.time).toLocaleTimeString()}): ${text}`
  ).catch(() => {})
  return msg
}

const CHAT_COMMENTARY_PROMPT = `You are the Executive Director of a personal Agent OS, posting brief, casual
status remarks into a shared chat that the user can see and join at any time.
You'll be given a list of agents whose status just changed. Write ONE short,
natural update (like a teammate giving a quick heads-up) covering all of them —
mention each by name and what changed. Keep it to 1-3 plain sentences, no
bullet points, no headers, no markdown.`

function parseAgentSnapshot(agentsMd) {
  // readFolder() wraps each file as "## <filename>\n<content>" and joins files
  // with "\n\n---\n\n" — but each agent's own content ALSO has nested "## "
  // headers ("## Current State", "## Recent Logs"), so splitting on "## "
  // would separate the filename from its own Status/Task lines. Split on the
  // outer file-join delimiter instead, keeping each agent's full block intact.
  const current = {}
  const fileBlocks = agentsMd.split(/\n\n---\n\n/)
  for (const block of fileBlocks) {
    const nameMatch = block.match(/^##\s+([\w.-]+)\.md/)
    const statusMatch = block.match(/\*\*Status:\*\*\s*(\S+)/)
    const taskMatch = block.match(/\*\*Active Task:\*\*\s*(.+)/)
    if (nameMatch) {
      current[nameMatch[1]] = { status: statusMatch?.[1] || 'Unknown', task: (taskMatch?.[1] || '').trim() }
    }
  }
  return current
}

async function directorChatLoop() {
  try {
    const agentsMd = await readFolder('Logs/Agents')
    if (!agentsMd) return

    const current = parseAgentSnapshot(agentsMd)
    const hadPrevious = Object.keys(previousAgentSnapshot).length > 0

    const changed = Object.entries(current).filter(([name, state]) => {
      const prev = previousAgentSnapshot[name]
      return !prev || prev.status !== state.status || prev.task !== state.task
    })

    // Skip the very first pass — with no prior snapshot, everything looks
    // "changed" and would flood the chat with a message about the whole fleet.
    if (hadPrevious && changed.length) {
      changed.forEach(([name, state]) => logActivity(`${name} → ${state.status}: ${state.task}`))
      const summary = changed.map(([name, state]) => `${name}: ${state.status} — ${state.task}`).join('\n')
      const remark = await callLLM(CHAT_COMMENTARY_PROMPT, `Agents with new status:\n${summary}`, { maxTokens: 150 }).catch(() => null)
      if (remark) pushChatMessage('director', remark.trim())
    }

    previousAgentSnapshot = current
  } catch (err) {
    console.error('[Orchestrator] Agent Chat commentary failed:', err.message)
  }
}

// Check for status changes every 45s — frequent enough to feel live, spaced
// out enough not to spam the chat or burn LLM calls needlessly.
setInterval(directorChatLoop, 45000)
setTimeout(directorChatLoop, 5000)
setTimeout(() => pushChatMessage(
  'director',
  "Agent Chat is online — I'll post here when an agent's status changes. Ask me anything any time."
), 1000)

app.get('/agent-chat', (req, res) => {
  res.json({ messages: agentChatLog })
})

app.post('/agent-chat/send', async (req, res) => {
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'No message provided' })

  pushChatMessage('you', message)

  // A reply to the Director's open question goes to the Director, who can act
  // on it; anything else is routed to the right agent as before.
  const handled = openQuestion && Date.now() - openQuestion.askedAt < 12 * 3600 * 1000
    ? await handleDirectorAnswer(message)
    : false
  if (!handled) {
    const result = await routeRequest(message)
    const replyText = result.result || result.reply || result.error || 'No response.'
    pushChatMessage(result.agent || 'orchestrator', replyText)
  }

  res.json({ success: true, messages: agentChatLog.slice(-10) })
})

// ── Director: check-ins, progress reports, acting on answers ─────────────────
// On every app launch the Director posts a check-in (progress + questions);
// while the app is open it posts a progress report every couple of hours when
// there's something to report. Mika's replies come back to the Director, which
// can start agent jobs it has offered ([RUN: agent/trigger]).
const VAULT_PATH = VAULT
const REPORT_INTERVAL_MS = (Number(process.env.DIRECTOR_REPORT_MINUTES) || 120) * 60 * 1000
const ACTIVE_HOURS = [7, 23] // no unprompted reports outside 07:00–23:00
let openQuestion = null
let lastCheckInAt = 0
let lastReportAt = 0
let activityLog = []

function logActivity(text) {
  activityLog.push({ time: Date.now(), text })
  if (activityLog.length > 100) activityLog.shift()
}

const DIRECTOR_ACTIONS = {
  'life-admin/morning-briefing': "generate today's morning briefing",
  'life-admin/eod-wrap': 'write the end-of-day wrap-up',
  'life-admin/weekly-plan': "create this week's plan",
  'fitness/daily-check': 'run the fitness daily check',
  'learning/study-prompt': "plan tonight's study session",
  'network-security/audit': 'run a network security audit',
  'it-security/audit': 'run an IT security audit (dependencies, secrets)',
  'maintenance/check-updates': 'check all projects for package updates'
}

async function newestIn(folder, pattern = /\.md$/) {
  try {
    const dir = path.join(VAULT_PATH, folder)
    const names = (await fs.readdir(dir)).filter(n => pattern.test(n))
    const stats = await Promise.all(names.map(async n => ({ n, t: (await fs.stat(path.join(dir, n))).mtimeMs })))
    return stats.sort((a, b) => b.t - a.t)[0] || null
  } catch { return null }
}

async function vaultChangesSince(sinceMs) {
  const changed = []
  async function walk(dir) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { if (!/CodeGraph$/.test(e.name)) await walk(full); continue } // skip generated code maps
      if (!e.name.endsWith('.md')) continue
      const rel = path.relative(VAULT_PATH, full).split(path.sep).join('/')
      if (rel.startsWith('Logs/Agents/') || rel === 'Logs/conversations/agent-chat.md') continue
      const t = (await fs.stat(full)).mtimeMs
      if (t > sinceMs) changed.push({ rel, t })
    }
  }
  if (VAULT_PATH) await walk(VAULT_PATH)
  return changed.sort((a, b) => b.t - a.t).slice(0, 12).map(c => c.rel)
}

const daysAgo = (ms) => (ms ? `${Math.floor((Date.now() - ms) / 86400000)} day(s) ago` : 'never')

async function gatherDirectorFacts(sinceMs) {
  const agentsMd = await readFolder('Logs/Agents').catch(() => '')
  const fleet = Object.entries(parseAgentSnapshot(agentsMd || ''))
  const working = fleet.filter(([, s]) => s.status === 'Working')
  const paused = fleet.filter(([, s]) => s.status === 'Paused')
  const [briefing, plan, security] = await Promise.all([
    newestIn('Logs/briefings'), newestIn('Tasks', /^weekly-plan.*\.md$/), newestIn('Logs/security')
  ])
  const llm = await activeProvider()
  return [
    `Now: ${new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
    `Fleet: ${fleet.length} agents reporting · ${working.length} working · ${paused.length} paused · model: ${llm.model} (${llm.provider})`,
    working.length ? `Working now: ${working.map(([n, s]) => `${n} (${s.task})`).join('; ')}` : 'Working now: none',
    paused.length ? `Paused: ${paused.map(([n]) => n).join(', ')}` : '',
    `Activity since last report:\n${activityLog.filter(a => a.time > sinceMs).map(a => `- ${a.text}`).join('\n') || '- none recorded'}`,
    `Vault notes changed since last report: ${(await vaultChangesSince(sinceMs)).join(', ') || 'none'}`,
    `Latest morning briefing: ${briefing ? `${briefing.n} (${daysAgo(briefing.t)})` : 'none'}`,
    `Latest weekly plan: ${plan ? `${plan.n} (${daysAgo(plan.t)})` : 'none'}`,
    `Latest security report: ${security ? `${security.n} (${daysAgo(security.t)})` : 'none'}`,
    `Actions you can offer to run: ${Object.entries(DIRECTOR_ACTIONS).map(([k, v]) => `${k} = ${v}`).join('; ')}`
  ].filter(Boolean).join('\n')
}

const CHECKIN_PROMPT = `You are the Executive Director of Mika's personal AI operating system,
Mika OS, managing a fleet of AI agents. You report to Mika directly in a chat.
Write the requested message from the FACTS only — never invent work that isn't listed.
Format (plain text, no markdown headers, max ~110 words):
- One opening line on the overall state.
- 2-3 short lines starting with "• " covering concrete progress or notable gaps
  (e.g. a briefing or security check that is overdue).
- End with 1-2 direct questions for Mika that help decide what the fleet does next —
  where useful, offer a specific action from the list, described in plain words
  ("generate today's morning briefing"). Never show codes like "agent/trigger" or file names.`

async function directorCheckIn(kind) {
  const since = kind === 'checkin' ? Date.now() - 24 * 3600 * 1000 : lastReportAt || Date.now() - REPORT_INTERVAL_MS
  try {
    const facts = await gatherDirectorFacts(since)
    const task = kind === 'checkin'
      ? 'Write a start-of-session check-in: Mika just opened Mika OS.'
      : 'Write a short progress report since your last one.'
    const text = await callLLM(CHECKIN_PROMPT, `${task}\n\nFACTS:\n${facts}`, { maxTokens: 400 })
    pushChatMessage('director', text.trim(), kind)
    lastReportAt = Date.now()
    if (kind === 'checkin') lastCheckInAt = Date.now()
    await appendNote(`Logs/director/${new Date().toISOString().slice(0, 10)}.md`,
      `### ${kind === 'checkin' ? 'Check-in' : 'Progress report'} — ${new Date().toLocaleTimeString()}\n${text.trim()}`).catch(() => {})
  } catch (err) {
    console.error(`[Director] ${kind} failed:`, err.message)
  }
}

const ANSWER_PROMPT = `You are the Executive Director of Mika's AI operating system (Mika OS).
You asked Mika a question and Mika replied. Decide what to do.
- If Mika's reply is NOT an answer to your question but a separate request for one of
  the agents, output exactly: ROUTE
- Otherwise reply in 1-3 plain sentences confirming what you'll do. For each action
  Mika agreed to, add a separate line exactly like: [RUN: agent/trigger]
  using only the actions listed. If you still need information, ask ONE follow-up question.`

async function runDirectorAction(key, context) {
  const [agent, trigger] = key.split('/')
  if (!DIRECTOR_ACTIONS[key] || !AGENTS[agent]) return
  pushChatMessage('director', `▶ Starting: ${DIRECTOR_ACTIONS[key]} (${agent})`, 'action')
  logActivity(`Director started ${key}`)
  try {
    const res = await fetch(`${AGENTS[agent]}/trigger/${trigger}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: context })
    })
    const data = await res.json().catch(() => ({}))
    const out = String(data.result || data.report || data.message || data.error || 'Done.')
    pushChatMessage(agent, out.length > 700 ? `${out.slice(0, 700)}… (full version saved in the vault)` : out, 'action')
    logActivity(`${key} finished`)
  } catch (err) {
    pushChatMessage('director', `⚠ ${agent} couldn't run ${trigger}: ${err.message}`, 'action')
  }
}

async function handleDirectorAnswer(answer) {
  const question = openQuestion
  openQuestion = null
  try {
    const facts = await gatherDirectorFacts(lastReportAt || Date.now() - REPORT_INTERVAL_MS)
    const reply = (await callLLM(ANSWER_PROMPT,
      `YOUR QUESTION:\n${question.text}\n\nMIKA'S REPLY:\n${answer}\n\nFACTS:\n${facts}`, { maxTokens: 300 })).trim()
    if (/^ROUTE\b/.test(reply)) return false

    const actions = [...reply.matchAll(/\[RUN:\s*([\w-]+\/[\w-]+)\s*\]/gi)].map(m => m[1].toLowerCase())
    const text = reply.replace(/\[RUN:[^\]]*\]/gi, '').trim()
    if (text) pushChatMessage('director', text, 'reply')
    await appendNote(`Logs/director/${new Date().toISOString().slice(0, 10)}.md`,
      `**Q:** ${question.text}\n**Mika:** ${answer}\n**Director:** ${text}${actions.length ? `\n_Actions: ${actions.join(', ')}_` : ''}`).catch(() => {})
    // Run agreed jobs in the background so the chat reply isn't held up.
    for (const key of [...new Set(actions)]) runDirectorAction(key, answer)
    return true
  } catch (err) {
    console.error('[Director] Answer handling failed:', err.message)
    return false
  }
}

// Called by the desktop app when it starts (main.js) — one check-in per launch.
app.post('/director/session-start', (req, res) => {
  const fresh = Date.now() - lastCheckInAt > 20 * 60 * 1000
  if (fresh) directorCheckIn('checkin')
  res.json({ success: true, checkIn: fresh })
})

// Progress reports while the app is open: every REPORT_INTERVAL when there's
// new activity, or twice that if nothing has happened, during active hours.
setInterval(() => {
  const hour = new Date().getHours()
  if (hour < ACTIVE_HOURS[0] || hour >= ACTIVE_HOURS[1] || !lastReportAt) return
  const quiet = !activityLog.some(a => a.time > lastReportAt)
  const due = Date.now() - lastReportAt >= REPORT_INTERVAL_MS * (quiet ? 2 : 1)
  if (due) directorCheckIn('report')
}, 5 * 60 * 1000)


// System status + uptime
app.get('/status', (req, res) => {
  const uptimeMs = Date.now() - startTime
  const h = Math.floor(uptimeMs / 3600000)
  const m = Math.floor((uptimeMs % 3600000) / 60000)
  const s = Math.floor((uptimeMs % 60000) / 1000)
  res.json({
    agent: 'orchestrator',
    status: 'running',
    uptime: `${h}h ${m}m ${s}s`,
    uptimeMs,
    requestCount,
    lastRoutedAgent,
    time: new Date().toISOString()
  })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Orchestrator] 🧠 Agent OS brain running on port ${PORT} (localhost only)`)
  console.log(`[Orchestrator] POST http://localhost:${PORT}/ask — send any request`)
  console.log(`[Orchestrator] GET  http://localhost:${PORT}/health — check all agents`)
  console.log(`[Orchestrator] GET  http://localhost:${PORT}/status — uptime & stats`)
})
