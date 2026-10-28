// main.js — Electron main process
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const { buildVaultGraph } = require('./vault-graph')

let mainWindow
let tray

// Resolved relative to this file (app/ sits next to obsidian/ and agents/
// under the project root) instead of a hardcoded personal path, so this keeps
// working if the project folder ever moves.
const VAULT_PATH = path.join(__dirname, '..', 'obsidian')
const AGENTS_PATH = path.join(__dirname, '..', 'agents')

const AGENTS = {
  orchestrator:  'http://localhost:3001',
  'life-admin':  'http://localhost:3002',
  fitness:       'http://localhost:3003',
  learning:      'http://localhost:3004',
  memory:        'http://localhost:3005',
  'vault-manager': 'http://localhost:3006',
  researcher:    'http://localhost:3007',
  builder:       'http://localhost:3008',
  'business-expert':      'http://localhost:3009',
  'manufacturing-expert': 'http://localhost:3010',
  'career-expert':        'http://localhost:3011',
  'network-security':     'http://localhost:3012',
  'it-security':          'http://localhost:3013',
  maintenance:            'http://localhost:3014',
  'offline-llm':          'http://localhost:3015'
}

let agentsDeployed = false

function deployAgents() {
  console.log('Deploying background agents via PM2...')
  exec('npx pm2 start ecosystem.config.cjs', { cwd: AGENTS_PATH }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Failed to start agents: ${error.message}`)
    } else {
      console.log('Agents deployed successfully.')
      agentsDeployed = true
    }
    // Even if PM2 reported an error (e.g. agents already running), the
    // orchestrator may be up — let the Director know a session has started.
    announceSession()
  })
}

// Wait for the orchestrator to answer, then ask the Director for its
// start-of-session check-in (it posts into Agent Chat / the dashboard feed).
async function announceSession(attempt = 0) {
  try {
    const res = await fetch(`${AGENTS.orchestrator}/director/session-start`, {
      method: 'POST', signal: AbortSignal.timeout(3000)
    })
    if (res.ok) return console.log('Director notified of session start.')
  } catch {}
  if (attempt < 40) setTimeout(() => announceSession(attempt + 1), 3000)
}

function stopAgents() {
  if (!agentsDeployed) return
  console.log('Stopping background agents...')
  exec('npx pm2 stop all', { cwd: AGENTS_PATH }, () => {
    console.log('Agents stopped.')
  })
}

let anthropicKey = ''
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
  const keyLine = envContent.split('\n').find(l => l.startsWith('ANTHROPIC_API_KEY='))
  if (keyLine) anthropicKey = keyLine.split('=')[1].trim()
} catch (e) {
  console.warn('Could not read .env file')
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: false,          // custom title bar
    transparent: false,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: true
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()     // minimize to tray instead of closing
  })
}

// ── System Tray ───────────────────────────────────────────────────────────────
function createTray() {
  // Use a default icon if custom one doesn't exist
  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    { label: '🤖 Mika OS', enabled: false },
    { type: 'separator' },
    { label: '🖥️ Open Dashboard', click: () => { mainWindow.show(); mainWindow.focus() } },
    { type: 'separator' },
    { label: '🌅 Morning Briefing', click: () => triggerAgent('life-admin', 'morning-briefing') },
    { label: '🌙 EOD Wrap',         click: () => triggerAgent('life-admin', 'eod-wrap') },
    { label: '📅 Weekly Plan',      click: () => triggerAgent('life-admin', 'weekly-plan') },
    { type: 'separator' },
    { label: '❌ Quit Mika OS', click: () => { app.quit() } }
  ])

  tray.setToolTip('Mika OS — Running')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus() })
}

async function triggerAgent(agentName, trigger) {
  try {
    const port = AGENTS[agentName]?.split(':')[2] || 3002
    await fetch(`http://localhost:${port}/trigger/${trigger}`, { method: 'POST' })
  } catch (e) {
    console.error('Tray trigger failed:', e.message)
  }
}

// ── IPC Handlers (called from renderer) ──────────────────────────────────────

ipcMain.handle('agents:directorSummary', async () => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    // The orchestrator is always at port 3001
    const res = await fetch(`http://localhost:3001/director-summary`, { signal: controller.signal })
    clearTimeout(timeout)
    return await res.json()
  } catch (e) {
    return { error: 'Orchestrator offline', agents: [], summary: 'Director offline.' }
  }
})

ipcMain.handle('agents:health', async () => {
  const results = {}
  await Promise.all(
    Object.entries(AGENTS).map(async ([name, url]) => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)
        const res = await fetch(`${url}/health`, { signal: controller.signal })
        clearTimeout(timeout)
        results[name] = await res.json()
      } catch {
        results[name] = { status: 'offline' }
      }
    })
  )
  return results
})

ipcMain.handle('agents:start', async () => {
  deployAgents()
  return { success: true, message: 'Agents deployment started' }
})

ipcMain.handle('agents:stop', async () => {
  stopAgents()
  return { success: true, message: 'Agents stop sequence initiated' }
})

// Trigger an agent action
ipcMain.handle('agent:trigger', async (event, { agent, trigger, message }) => {
  const url = AGENTS[agent]
  if (!url) return { error: 'Unknown agent' }
  try {
    const res = await fetch(`${url}/trigger/${trigger}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })
    return await res.json()
  } catch (e) {
    return { error: e.message }
  }
})

// Send message to orchestrator
ipcMain.handle('orchestrator:ask', async (event, message) => {
  try {
    const res = await fetch('http://localhost:3001/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })
    return await res.json()
  } catch (e) {
    return { error: 'Orchestrator offline. Start agents with: pm2 start ecosystem.config.cjs' }
  }
})

// ── Agent Chat ──────────────────────────────────────────────────────────────
ipcMain.handle('agents:chatGet', async () => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`${AGENTS.orchestrator}/agent-chat`, { signal: controller.signal })
    clearTimeout(timeout)
    return await res.json()
  } catch {
    return { messages: [], error: 'Orchestrator offline' }
  }
})

ipcMain.handle('agents:chatSend', async (event, message) => {
  try {
    const res = await fetch(`${AGENTS.orchestrator}/agent-chat/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message })
    })
    return await res.json()
  } catch (e) {
    return { success: false, error: 'Orchestrator offline. Deploy the fleet from the dashboard.' }
  }
})

// ── Offline LLM (LM Studio / standalone llama.cpp) ────────────────────────────
ipcMain.handle('offline:status', async () => {
  try {
    const res = await fetch(`${AGENTS['offline-llm']}/status`, { signal: AbortSignal.timeout(3000) })
    return await res.json()
  } catch {
    return { lmStudio: { reachable: false }, standaloneServers: [], error: 'offline-llm agent unreachable' }
  }
})

ipcMain.handle('offline:models', async () => {
  try {
    const res = await fetch(`${AGENTS['offline-llm']}/models`, { signal: AbortSignal.timeout(5000) })
    return await res.json()
  } catch {
    return { source: 'none', models: [], error: 'offline-llm agent unreachable' }
  }
})

ipcMain.handle('offline:chat', async (event, { model, message, standalonePort }) => {
  try {
    const res = await fetch(`${AGENTS['offline-llm']}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, message, standalonePort }),
      signal: AbortSignal.timeout(125000)
    })
    return await res.json()
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('offline:standaloneStart', async (event, { modelPath, port }) => {
  try {
    const res = await fetch(`${AGENTS['offline-llm']}/standalone/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelPath, port })
    })
    return await res.json()
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('offline:standaloneStop', async (event, { port }) => {
  try {
    const res = await fetch(`${AGENTS['offline-llm']}/standalone/stop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port })
    })
    return await res.json()
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Read a file from Obsidian vault
ipcMain.handle('vault:read', async (event, relativePath) => {
  try {
    const fullPath = path.join(VAULT_PATH, relativePath)
    return await fs.promises.readFile(fullPath, 'utf-8')
  } catch (e) {
    return null
  }
})

// List files in a vault folder (Async to prevent freezing)
ipcMain.handle('vault:list', async (event, folderPath) => {
  try {
    const fullPath = path.join(VAULT_PATH, folderPath)
    const files = await fs.promises.readdir(fullPath)
    return files.filter(f => f.endsWith('.md')).reverse()
  } catch (e) {
    return []
  }
})

// Every note in the vault plus the [[wikilinks]] between them — feeds both the
// Knowledge Base page (titles/excerpts grouped by folder) and the 3D graph.
ipcMain.handle('vault:graph', (_e, opts) => buildVaultGraph(VAULT_PATH, { includeCode: !!opts?.includeCode }))

// Upload/copy file to vault's "raw files" directory
ipcMain.handle('vault:upload', async (event, sourcePath, fileName) => {
  try {
    const targetDir = path.join(VAULT_PATH, 'raw files')
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    const targetPath = path.join(targetDir, fileName)
    fs.copyFileSync(sourcePath, targetPath)
    return { success: true, path: targetPath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// Window controls
ipcMain.on('window:minimize', () => mainWindow.minimize())
ipcMain.on('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.on('window:close',    () => mainWindow.hide())
ipcMain.on('window:quit',     () => app.quit())

// AI Chat Integration
ipcMain.handle('ai:chat', async (event, prompt) => {
  if (!anthropicKey) return "API key not configured in .env file."
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      return `Error: ${err.error?.message || response.statusText}`
    }

    const data = await response.json()
    return data.content?.[0]?.text || "No response received."
  } catch (e) {
    return `Exception: ${e.message}`
  }
})

// Save chat exchange to Obsidian vault
ipcMain.handle('chat:save', async (event, { userMessage, aiResponse }) => {
  try {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0] // e.g. 2026-09-04
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false })
    const logDir = path.join(VAULT_PATH, 'Logs', 'conversations')
    const logFile = path.join(logDir, `${dateStr}.md`)

    // Create directory if it doesn't exist
    await fs.promises.mkdir(logDir, { recursive: true })

    // Build the markdown entry
    const entry = `\n---\n**🕐 ${timeStr}**\n\n**You:** ${userMessage}\n\n**Mika OS:** ${aiResponse}\n`

    // If file doesn't exist, add a frontmatter header
    let exists = true
    try { await fs.promises.access(logFile) } catch { exists = false }

    if (!exists) {
      const header = `---\ntitle: Conversation Log — ${dateStr}\ndate: ${dateStr}\ntags: [conversation, ai-chat]\n---\n\n# 💬 Conversation Log — ${dateStr}\n`
      await fs.promises.writeFile(logFile, header + entry, 'utf-8')
    } else {
      await fs.promises.appendFile(logFile, entry, 'utf-8')
    }

    return { success: true, path: logFile }
  } catch (e) {
    console.error('Failed to save chat:', e.message)
    return { success: false, error: e.message }
  }
})

// Load most recent chat from Obsidian vault
ipcMain.handle('chat:load', async () => {
  try {
    const logDir = path.join(VAULT_PATH, 'Logs', 'conversations')
    let files = []
    try {
      files = await fs.promises.readdir(logDir)
    } catch {
      return [] // Directory doesn't exist yet
    }
    
    // Get the most recent markdown file
    // Mika OS transcripts only (YYYY-MM-DD.md, as chat:save writes them) — agent-chat.md
    // and other logs in this folder use different formats
    const mdFiles = files.filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse()
    if (mdFiles.length === 0) return []
    
    const recentFile = path.join(logDir, mdFiles[0])
    const content = await fs.promises.readFile(recentFile, 'utf-8')
    
    // Parse the file back into messages
    const messages = []
    const blocks = content.split('\n---\n**🕐').slice(1) // skip frontmatter/header
    
    for (const block of blocks) {
      const youMatch = block.match(/\*\*You:\*\* ([\s\S]*?)\n\n\*\*Mika OS:\*\*/);
      const aiMatch = block.match(/\*\*Mika OS:\*\* ([\s\S]*?)$/);
      
      if (youMatch && aiMatch) {
        messages.push({ role: 'user', content: youMatch[1].trim() })
        messages.push({ role: 'system', content: aiMatch[1].trim() })
      }
    }
    
    return messages
  } catch (e) {
    console.error('Failed to load chat:', e.message)
    return []
  }
})

// System stats for HUD
ipcMain.handle('system:stats', () => {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemGB: (totalMem / 1073741824).toFixed(1),
    usedMemGB: (usedMem / 1073741824).toFixed(1),
    memPercent: Math.round((usedMem / totalMem) * 100),
    uptime: os.uptime()
  }
})

ipcMain.handle('system:uptime', () => {
  return { uptime: process.uptime(), osUptime: os.uptime() }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
  deployAgents() // Auto-deploy agents on startup
})

app.on('window-all-closed', (e) => e.preventDefault()) // keep running in tray

app.on('before-quit', () => {
  stopAgents() // Clean up PM2 agents when Mika OS actually quits
})
