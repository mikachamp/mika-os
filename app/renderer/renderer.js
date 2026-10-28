// renderer.js — JARVIS Command Center Logic
// Particle System · 3D Interactions · HUD Animations
const api = window.agentOS

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENT_DEFS = [
  { id: 'life-admin',   name: 'Life Admin',   icon: 'fact_check', desc: 'Briefings & planning', port: 3002 },
  { id: 'fitness',      name: 'Fitness',      icon: 'fitness_center', desc: 'Workouts & health', port: 3003 },
  { id: 'learning',     name: 'Learning',     icon: 'menu_book', desc: 'Study & courses', port: 3004 },
  { id: 'memory',       name: 'Memory',       icon: 'database', desc: 'Vault indexing', port: 3005 },
  { id: 'vault-manager',name: 'Vault Manager',icon: 'folder_managed', desc: 'Obsidian integration', port: 3006 },
  { id: 'researcher',   name: 'Researcher',   icon: 'travel_explore', desc: 'Web research & synthesis', port: 3007 },
  { id: 'builder',      name: 'Builder',      icon: 'construction', desc: 'Scaffolds small apps', port: 3008 },
  { id: 'business-expert',      name: 'Business Expert',      icon: 'storefront', desc: 'Strategy, pricing & growth', port: 3009 },
  { id: 'manufacturing-expert', name: 'Manufacturing Expert', icon: 'precision_manufacturing', desc: 'CNC, 3D printing & production', port: 3010 },
  { id: 'career-expert',        name: 'Career Expert',        icon: 'work', desc: 'Career strategy & job search', port: 3011 },
  { id: 'network-security',     name: 'Network Security',     icon: 'lan', desc: 'Local exposure & firewall audits', port: 3012 },
  { id: 'it-security',          name: 'IT Security',          icon: 'security', desc: 'Dependency & secrets hygiene', port: 3013 },
  { id: 'maintenance',          name: 'Maintenance',          icon: 'build', desc: 'Keeps dependencies current', port: 3014 },
  { id: 'offline-llm',          name: 'Offline LLM',          icon: 'cloud_off', desc: 'Local models via LM Studio', port: 3015 }
]

// Track app start time for uptime
const APP_START = Date.now()
let onlineAgentCount = 0

// ═══════════════════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM — Floating ambient particles
// ═══════════════════════════════════════════════════════════════════════════════

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.particles = []
    this.mouse = { x: -1000, y: -1000 }
    this.resize()
    this.init()

    window.addEventListener('resize', () => this.resize())
    document.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
    })
  }

  resize() {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }

  init() {
    const count = Math.floor((this.canvas.width * this.canvas.height) / 18000)
    this.particles = []
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.3,
        opacity: Math.random() * 0.4 + 0.05,
        pulse: Math.random() * Math.PI * 2
      })
    }
  }

  update() {
    for (const p of this.particles) {
      p.x += p.vx
      p.y += p.vy
      p.pulse += 0.015

      // Wrap around edges
      if (p.x < 0) p.x = this.canvas.width
      if (p.x > this.canvas.width) p.x = 0
      if (p.y < 0) p.y = this.canvas.height
      if (p.y > this.canvas.height) p.y = 0

      // Subtle mouse repulsion
      const dx = p.x - this.mouse.x
      const dy = p.y - this.mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 120) {
        const force = (120 - dist) / 120 * 0.3
        p.vx += (dx / dist) * force * 0.05
        p.vy += (dy / dist) * force * 0.05
      }

      // Dampen velocity
      p.vx *= 0.995
      p.vy *= 0.995
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw particles
    for (const p of this.particles) {
      const alpha = p.opacity * (0.6 + Math.sin(p.pulse) * 0.4)
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      this.ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`
      this.ctx.fill()
    }

    // Draw connections between nearby particles
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i]
        const b = this.particles[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 100) {
          const alpha = (1 - dist / 100) * 0.08
          this.ctx.beginPath()
          this.ctx.moveTo(a.x, a.y)
          this.ctx.lineTo(b.x, b.y)
          this.ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`
          this.ctx.lineWidth = 0.5
          this.ctx.stroke()
        }
      }
    }
  }

  animate() {
    this.update()
    this.draw()
    requestAnimationFrame(() => this.animate())
  }
}

// Initialize particle system
const particleCanvas = document.getElementById('particleCanvas')
if (particleCanvas) {
  const ps = new ParticleSystem(particleCanvas)
  ps.animate()
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION — Page switching with JARVIS wipe effect
// ═══════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active')
      p.style.animation = 'none'
    })
    btn.classList.add('active')
    const target = document.getElementById(`page-${page}`)
    if (target) {
      // Force reflow to restart animation
      void target.offsetWidth
      target.style.animation = ''
      target.classList.add('active')
    }
    if (page === 'briefings') loadBriefings()
    if (page === 'planner')   loadPlanner()
    if (page === 'agents')    loadAgentsDetail()
    if (page === 'agent-chat') startAgentChatPolling(); else stopAgentChatPolling()
    if (page === 'offline-chat') refreshOfflineStatus()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GREETING — Time-based with glitch effect
// ═══════════════════════════════════════════════════════════════════════════════

function updateGreeting() {
  const hour = new Date().getHours()
  let greeting = 'Good Evening'
  if (hour >= 5 && hour < 12) greeting = 'Good Morning'
  else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon'

  const el = document.getElementById('greetingText')
  if (el) el.textContent = `${greeting}, Mika`

  const sub = document.getElementById('greetingSub')
  if (sub) {
    if (onlineAgentCount === AGENT_DEFS.length) {
      sub.textContent = 'Mika OS Online — All Systems Nominal'
    } else if (onlineAgentCount > 0) {
      sub.textContent = `Mika OS Partial — ${onlineAgentCount}/${AGENT_DEFS.length} Systems Active`
    } else {
      sub.textContent = 'Mika OS Standby — Awaiting Deployment'
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM TICKER — Real-time clock, date, uptime
// ═══════════════════════════════════════════════════════════════════════════════

function updateTicker() {
  const now = new Date()

  // Time
  const time = document.getElementById('tickerTime')
  if (time) time.textContent = now.toLocaleTimeString('en-GB', { hour12: false })

  // Date
  const date = document.getElementById('tickerDate')
  if (date) date.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

  // Uptime
  const uptime = document.getElementById('tickerUptime')
  if (uptime) {
    const elapsed = Math.floor((Date.now() - APP_START) / 1000)
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0')
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
    const s = String(elapsed % 60).padStart(2, '0')
    uptime.textContent = `${h}:${m}:${s}`
  }

  // Agent count
  const agents = document.getElementById('tickerAgents')
  if (agents) agents.textContent = `${onlineAgentCount}/${AGENT_DEFS.length}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT HEALTH — Status polling + orbital node sync
// ═══════════════════════════════════════════════════════════════════════════════

async function refreshHealth() {
  if (!api.getDirectorSummary) return
  let healthArray = []
  
  try {
    const directorData = await api.getDirectorSummary()
    if (!directorData || directorData.error) throw new Error(directorData?.error || 'Offline')
    
    // Update Director Summary UI if on agents page
    const summaryEl = document.getElementById('directorSummaryText')
    if (summaryEl) summaryEl.textContent = directorData.summary
    
    healthArray = directorData.agents || []
    showLlm(directorData.llm)
  } catch (err) {
    // Fallback if orchestrator is offline
    healthArray = AGENT_DEFS.map(a => ({ name: a.id, status: 'offline', currentTask: 'Unreachable' }))
    const summaryEl = document.getElementById('directorSummaryText')
    if (summaryEl) summaryEl.textContent = 'Orchestrator is offline. Start the fleet.'
    showLlm(null)
  }

  // Count online agents
  onlineAgentCount = healthArray.filter(h => h.status !== 'offline').length
  const total = AGENT_DEFS.length
  window.AICore3D?.setActivity(total ? onlineAgentCount / total : 0)

  // Status bar
  const dot = document.getElementById('statusDot')
  const txt = document.getElementById('statusText')
  if (onlineAgentCount === total) {
    dot.className = 'status-dot online'
    txt.textContent = `ALL ${total} AGENTS ONLINE`
  } else if (onlineAgentCount === 0) {
    dot.className = 'status-dot offline'
    txt.textContent = 'ALL AGENTS OFFLINE'
  } else {
    dot.className = 'status-dot partial'
    txt.textContent = `${onlineAgentCount}/${total} AGENTS ACTIVE`
  }

  // Update metric cards

  const metricOnline = document.getElementById('metricAgentsOnline')
  if (metricOnline) {
    metricOnline.textContent = onlineAgentCount
    metricOnline.className = `metric-value ${onlineAgentCount === total ? 'success' : onlineAgentCount > 0 ? 'warning' : 'danger'}`
  }

  const metricStatus = document.getElementById('metricSystemStatus')
  const metricSub = document.getElementById('metricSystemSub')
  if (metricStatus) {
    if (onlineAgentCount === total) {
      metricStatus.textContent = 'NOMINAL'
      metricStatus.className = 'metric-value success'
      if (metricSub) metricSub.textContent = 'All systems go'
    } else if (onlineAgentCount > 0) {
      metricStatus.textContent = 'PARTIAL'
      metricStatus.className = 'metric-value warning'
      if (metricSub) metricSub.textContent = `${total - onlineAgentCount} agents down`
    } else {
      metricStatus.textContent = 'OFFLINE'
      metricStatus.className = 'metric-value danger'
      if (metricSub) metricSub.textContent = 'Run pm2 start'
    }
  }

  // Update greeting subtitle
  updateGreeting()

  const oiAgents = document.getElementById('oi-agents')
  if (oiAgents) oiAgents.textContent = `${onlineAgentCount} / ${total} Running`

  // Agent cards grid
  const grid = document.getElementById('agentsGrid')
  if (grid) {
    grid.innerHTML = AGENT_DEFS.map(agent => {
      const h = healthArray.find(a => a.name === agent.id) || {}
      const running = h.status && h.status !== 'offline'
      const statusClass = h.status === 'Paused' ? 'paused' : running ? 'running' : ''
      const tasks = h.currentTask ? [h.currentTask] : (running ? ['Monitoring systems'] : ['Offline'])
      return `
        <div class="agent-list-item ${statusClass}">
          <div class="agent-list-header">
            <span class="material-symbols-outlined agent-list-icon">${agent.icon}</span>
            <div class="agent-list-info">
              <div class="agent-list-name">${agent.name}</div>
              <div class="agent-list-status">
                <span class="agent-status-dot ${h.status === 'Paused' ? 'paused' : running ? 'running' : 'offline'}"></span>
                ${h.status ? h.status.toUpperCase() : 'OFFLINE'}
              </div>
            </div>
          </div>
          <ul class="agent-task-list">
            ${tasks.map(t => `<li style="font-size:11px"><span class="material-symbols-outlined task-icon" style="font-size:12px">arrow_right</span> ${t}</li>`).join('')}
          </ul>
        </div>`
    }).join('')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3D CARD TILT — Mouse-reactive perspective
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('mousemove', (e) => {
  const cards = document.querySelectorAll('.agent-card, .action-btn, .metric-card')
  cards.forEach(card => {
    const rect = card.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = (e.clientX - cx) / rect.width
    const dy = (e.clientY - cy) / rect.height
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 2) {
      const rx = dy * 4
      const ry = -dx * 4
      card.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`
    }
  })
})

document.addEventListener('mouseleave', () => {
  const cards = document.querySelectorAll('.agent-card, .action-btn, .metric-card')
  cards.forEach(card => { card.style.transform = '' })
})

// ═══════════════════════════════════════════════════════════════════════════════
// QUICK ACTIONS — Trigger agent + show output
// ═══════════════════════════════════════════════════════════════════════════════

// The drawer lives on <body>: inside the dashboard grid a transformed/overflow ancestor clips position:fixed
{ const d = document.getElementById('outputSection'); if (d) document.body.appendChild(d) }
// Settings paths: allow line breaks only after a path separator, never mid-name
document.querySelectorAll('.settings-path').forEach(el => {
  const SEP = String.fromCharCode(92) // backslash
  el.replaceChildren(...el.textContent.split(SEP).flatMap((part, i, all) => i < all.length - 1 ? [part + SEP, document.createElement('wbr')] : [part]))
})
const closeOutput = () => { document.getElementById('outputSection').style.display = 'none' }
document.getElementById('outputClose')?.addEventListener('click', closeOutput)
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOutput() })

// Small toasts for background results (uploads etc.)
function showToast(message, kind = 'ok') {
  const stack = document.getElementById('toastStack')
  if (!stack) return
  const t = document.createElement('div')
  t.className = `toast ${kind}`
  t.textContent = message
  stack.appendChild(t)
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300) }, 3800)
}

async function uploadFiles(files) {
  let ok = 0
  for (const file of files) {
    try {
      const res = await api.uploadToVault(file.path, file.name)
      if (res.success) ok++
      else showToast(`Couldn't upload ${file.name}: ${res.error || 'unknown error'}`, 'err')
    } catch (err) {
      showToast(`Couldn't upload ${file.name}: ${err.message}`, 'err')
    }
  }
  if (ok) showToast(`Uploaded ${ok} file${ok > 1 ? 's' : ''} to the vault (raw files)`)
}

window.triggerAction = async function(agent, trigger, label) {
  const section = document.getElementById('outputSection')
  const loading = document.getElementById('outputLoading')
  const content = document.getElementById('outputActionContent')

  section.style.display = 'block' // a drawer over the dashboard — the Director feed stays where it is
  loading.style.display = 'flex'
  content.style.display = 'none'

  const result = await api.triggerAgent(agent, trigger)

  loading.style.display = 'none'
  content.style.display = 'block'

  if (result.error) {
    content.innerHTML = `<div style="font-size:10px;color:var(--jarvis-cyan);margin-bottom:6px;">— ${label}</div>
      <div style="color: var(--danger)">⚠ ${result.error}<br><br>
      <span style="color: var(--text-muted)">Ensure agents are deployed:<br>
      <code>pm2 start ecosystem.config.cjs</code></span></div>`
  } else {
    const text = result.result || JSON.stringify(result, null, 2)
    content.innerHTML = `<div style="font-size:10px;color:var(--jarvis-cyan);margin-bottom:6px;">— ${label}</div>` + markdownToHtml(text)
    loadLatestBriefing()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT — Voice-waveform aesthetic
// ═══════════════════════════════════════════════════════════════════════════════

window.sendChat = async function() {
  const input = document.getElementById('chatInput')
  const sendBtn = document.getElementById('chatSend')
  const messages = document.getElementById('chatMessages')
  const text = input.value.trim()
  if (!text) return

  // Add user message
  messages.innerHTML += `
    <div class="chat-message user">
      <div class="message-bubble">${escapeHtml(text)}</div>
      <div class="message-meta">${new Date().toLocaleTimeString('en-GB', { hour12: false })}</div>
    </div>`

  input.value = ''
  sendBtn.disabled = true

  // Waveform thinking indicator
  const thinkingId = `thinking-${Date.now()}`
  messages.innerHTML += `
    <div class="chat-message agent" id="${thinkingId}">
      <div class="message-bubble">
        <div class="waveform">
          <div class="waveform-bar"></div>
          <div class="waveform-bar"></div>
          <div class="waveform-bar"></div>
          <div class="waveform-bar"></div>
          <div class="waveform-bar"></div>
        </div>
        Processing request...
      </div>
    </div>`
  messages.scrollTop = messages.scrollHeight

  const result = await api.ask(text)
  document.getElementById(thinkingId)?.remove()

  const reply = result.result || result.reply || result.error || JSON.stringify(result)
  const agentTag = result.agent ? `<span style="color:var(--jarvis-cyan)">[${result.agent}]</span> · ` : ''
  messages.innerHTML += `
    <div class="chat-message agent">
      <div class="message-bubble markdown-body">${markdownToHtml(reply)}</div>
      <div class="message-meta">${agentTag}${new Date().toLocaleTimeString('en-GB', { hour12: false })}</div>
    </div>`

  messages.scrollTop = messages.scrollHeight
  sendBtn.disabled = false

  if (api.saveChat) await api.saveChat(text, reply)
}

document.getElementById('chatInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
})

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CHAT — the Director's live feed; posts here when an agent's status
// changes, and the user can post into the same feed (routed via the
// orchestrator, same as Conversations, but shared/ambient rather than 1:1).
// ═══════════════════════════════════════════════════════════════════════════════

let agentChatPollInterval = null

function renderAgentChatMessages(messages) {
  const container = document.getElementById('agentChatMessages')
  if (!container || !messages) return
  const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 20
  container.innerHTML = messages.map(m => {
    const isYou = m.from === 'you'
    const cls = isYou ? 'user' : 'agent'
    const tag = !isYou ? `<span style="color:var(--jarvis-cyan)">[${m.from}]</span> · ` : ''
    return `
      <div class="chat-message ${cls}">
        <div class="message-bubble markdown-body">${isYou ? escapeHtml(m.text) : markdownToHtml(m.text)}</div>
        <div class="message-meta">${tag}${new Date(m.time).toLocaleTimeString('en-GB', { hour12: false })}</div>
      </div>`
  }).join('') || '<div class="chat-message system"><div class="message-bubble">No messages yet.</div></div>'
  if (atBottom) container.scrollTop = container.scrollHeight
}

async function pollAgentChat() {
  const result = await api.getAgentChat()
  renderAgentChatMessages(result?.messages)
}

function startAgentChatPolling() {
  pollAgentChat()
  if (!agentChatPollInterval) agentChatPollInterval = setInterval(pollAgentChat, 5000)
}

function stopAgentChatPolling() {
  if (agentChatPollInterval) { clearInterval(agentChatPollInterval); agentChatPollInterval = null }
}

window.sendAgentChat = async function() {
  const input = document.getElementById('agentChatInput')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  const result = await api.sendAgentChat(text)
  if (result?.messages) renderAgentChatMessages(result.messages)
  else await pollAgentChat()
}
document.getElementById('agentChatInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentChat() }
})

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTOR FEED — the Director's check-ins / progress reports / questions on the
// dashboard. Polled on every page so the Agent Chat badge and desktop
// notifications work even when the dashboard isn't showing.
// ═══════════════════════════════════════════════════════════════════════════════

const DIRECTOR_KINDS = new Set(['checkin', 'report', 'reply', 'action'])
let directorSeenUpTo = (() => { try { return Number(localStorage.getItem('directorSeenUpTo')) || 0 } catch { return 0 } })()
let directorNotifiedUpTo = Date.now()
let directorAwaiting = false

function currentPage() {
  return document.querySelector('.nav-item.active')?.dataset.page
}

function renderDirectorFeed(messages) {
  const box = document.getElementById('directorMsgs')
  if (!box) return
  // Show the latest check-in/report and everything said after it.
  const lastReport = messages.reduce((idx, m, i) => (m.kind === 'checkin' || m.kind === 'report' ? i : idx), -1)
  const thread = (lastReport >= 0 ? messages.slice(lastReport) : messages.filter(m => DIRECTOR_KINDS.has(m.kind))).slice(-8)
  if (!thread.length) return
  box.innerHTML = thread.map(m => {
    const time = new Date(m.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (m.from === 'you') return `<div class="dmsg dmsg-you">${escapeHtml(m.text)}</div>`
    if (m.from === 'director') {
      return `<div class="dmsg dmsg-director"><div class="dmsg-from">Director · ${time}</div>${escapeHtml(m.text)}</div>`
    }
    const text = m.text.replace(/[#*_`>]/g, '').replace(/\n{2,}/g, '\n').trim()
    return `<div class="dmsg dmsg-agent"><div class="dmsg-from">${escapeHtml(m.from)} · ${time}</div>${escapeHtml(text.length > 260 ? text.slice(0, 260) + '…' : text)}</div>`
  }).join('') + (directorAwaiting || thread[thread.length - 1]?.from === 'you'
    ? '<div class="dmsg-thinking">Director is thinking…</div>' : '')
  box.scrollTop = box.scrollHeight
}

function updateDirectorBadge(messages) {
  const page = currentPage()
  const latest = messages.reduce((t, m) => Math.max(t, Date.parse(m.time) || 0), 0)
  if (page === 'dashboard' || page === 'agent-chat') {
    directorSeenUpTo = Math.max(directorSeenUpTo, latest)
    try { localStorage.setItem('directorSeenUpTo', String(directorSeenUpTo)) } catch {}
  }
  const unread = messages.filter(m => m.from === 'director' && DIRECTOR_KINDS.has(m.kind) && Date.parse(m.time) > directorSeenUpTo).length
  const badge = document.getElementById('agentChatBadge')
  if (badge) { badge.hidden = !unread; badge.textContent = unread }
}

function notifyDirector(messages) {
  const fresh = messages.filter(m => m.from === 'director' && (m.kind === 'checkin' || m.kind === 'report') && Date.parse(m.time) > directorNotifiedUpTo)
  if (!fresh.length) return
  directorNotifiedUpTo = Math.max(...fresh.map(m => Date.parse(m.time)))
  if (document.hasFocus() && currentPage() === 'dashboard') return
  try {
    const n = new Notification('Mika OS · Director', { body: fresh[fresh.length - 1].text.slice(0, 180), silent: false })
    n.onclick = () => { window.focus(); document.getElementById('nav-dashboard')?.click() }
  } catch {}
}

async function pollDirector() {
  const result = await api.getAgentChat().catch(() => null)
  const live = document.getElementById('directorLive')
  if (!result || result.error) {
    if (live) { live.textContent = 'offline'; live.classList.remove('on') }
    return
  }
  if (live) { live.textContent = 'live'; live.classList.add('on') }
  const messages = result.messages || []
  renderDirectorFeed(messages)
  updateDirectorBadge(messages)
  notifyDirector(messages)
}

async function sendDirectorReply() {
  const input = document.getElementById('directorInput')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  directorAwaiting = true
  const box = document.getElementById('directorMsgs')
  box?.insertAdjacentHTML('beforeend', `<div class="dmsg dmsg-you">${escapeHtml(text)}</div><div class="dmsg-thinking">Director is thinking…</div>`)
  if (box) box.scrollTop = box.scrollHeight
  await api.sendAgentChat(text).catch(() => null)
  directorAwaiting = false
  await pollDirector()
}

document.getElementById('directorSend')?.addEventListener('click', sendDirectorReply)
document.getElementById('directorInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendDirectorReply() }
})
setInterval(pollDirector, 6000)
pollDirector()

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE_CHAT — local models via LM Studio (or a standalone llama.cpp server),
// entirely separate from the cloud agent fleet — nothing here leaves the machine.
// ═══════════════════════════════════════════════════════════════════════════════

async function refreshOfflineStatus() {
  const pill = document.getElementById('offlineStatusPill')
  const select = document.getElementById('offlineModelSelect')
  const standaloneList = document.getElementById('offlineStandaloneList')

  const [status, modelsResult] = await Promise.all([api.offlineStatus(), api.offlineModels()])

  const lmUp = status?.lmStudio?.reachable
  pill.textContent = lmUp ? 'LM STUDIO: CONNECTED' : 'LM STUDIO: NOT RUNNING'
  pill.className = `offline-status-pill ${lmUp ? 'online' : 'offline'}`

  const models = modelsResult?.models || []
  select.innerHTML = models.length
    ? models.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
    : '<option value="">No models found — open LM Studio or download one</option>'

  const standalone = status?.standaloneServers || []
  standaloneList.innerHTML = standalone.length
    ? standalone.map(s => `<div class="offline-standalone-item"><span>port ${s.port} — ${s.modelPath.split(/[\\/]/).pop()}</span><button class="mini-btn" onclick="stopStandalone(${s.port})">Stop</button></div>`).join('')
    : ''
}

window.startStandalone = async function() {
  const input = document.getElementById('offlinePathInput')
  const modelPath = input.value.trim()
  if (!modelPath) return
  const result = await api.offlineStart(modelPath)
  if (result?.success) { input.value = ''; await refreshOfflineStatus() }
  else alert(result?.error || 'Could not start standalone server.')
}

window.stopStandalone = async function(port) {
  await api.offlineStop(port)
  await refreshOfflineStatus()
}

window.sendOfflineChat = async function() {
  const input = document.getElementById('offlineChatInput')
  const messages = document.getElementById('offlineChatMessages')
  const select = document.getElementById('offlineModelSelect')
  const text = input.value.trim()
  if (!text) return
  const model = select.value

  messages.innerHTML += `<div class="chat-message user"><div class="message-bubble">${escapeHtml(text)}</div></div>`
  input.value = ''
  messages.scrollTop = messages.scrollHeight

  const thinkingId = `ot-${Date.now()}`
  messages.innerHTML += `<div class="chat-message agent" id="${thinkingId}"><div class="message-bubble">Thinking… (local models can be slower than cloud)</div></div>`
  messages.scrollTop = messages.scrollHeight

  const result = await api.offlineChat(model, text)
  document.getElementById(thinkingId)?.remove()

  const reply = result?.result || result?.error || 'No response.'
  messages.innerHTML += `<div class="chat-message agent"><div class="message-bubble markdown-body">${markdownToHtml(reply)}</div></div>`
  messages.scrollTop = messages.scrollHeight
}
document.getElementById('offlineChatInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOfflineChat() }
})

// Which model the agents are actually using, as reported by the orchestrator.
function showLlm(llm) {
  const short = (m) => m.split('/').pop()
  const text = !llm ? 'Fleet offline'
    : llm.provider === 'local' ? `${short(llm.model)} · Local`
    : `${short(llm.model)} · Cloud${llm.note ? ' (LM Studio off)' : ''}`
  const oi = document.getElementById('oi-llm')
  const footer = document.getElementById('footerLlm')
  if (oi) oi.textContent = text
  if (footer) footer.textContent = text
}

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — every vault note, grouped by folder, with [[wikilink]] navigation
// ═══════════════════════════════════════════════════════════════════════════════

const KB_FOLDER_ORDER = ['Root', 'MOCs', 'Projects', 'Notes', 'Agents', 'System', 'Skills', 'MCP', 'Tasks', 'Templates', 'Logs']
const KB_COLLAPSED_BY_DEFAULT = new Set(['Logs'])
let kbNotes = []
let kbByPath = new Map()
let kbByName = new Map()
let kbActivePath = null

const escapeAttr = (s) => escapeHtml(String(s)).replace(/"/g, '&quot;')

function kbResolve(target) {
  const key = target.trim().replace(/\.md$/, '').toLowerCase()
  return kbByPath.get(key) || kbByName.get(key.split('/').pop())
}

async function loadBriefings() {
  try {
    kbNotes = (await api.getVaultGraph())?.nodes || []
  } catch (e) {
    console.error('Could not load vault notes', e)
    kbNotes = []
  }
  kbByPath = new Map(kbNotes.map(n => [n.path.replace(/\.md$/, '').toLowerCase(), n]))
  kbByName = new Map(kbNotes.map(n => [n.name.toLowerCase(), n]))
  const folders = new Set(kbNotes.map(n => n.category)).size
  document.getElementById('kbSubtitle').textContent = `${kbNotes.length} notes across ${folders} folders`
  renderKbList(document.getElementById('kbSearch').value)
  openKbNote(kbActivePath || kbByName.get('home')?.path || kbNotes[0]?.path)
}

function renderKbList(query = '') {
  const list = document.getElementById('briefingsList')
  const q = query.trim().toLowerCase()
  const matches = q
    ? kbNotes.filter(n => `${n.title} ${n.name} ${n.excerpt} ${n.category}`.toLowerCase().includes(q))
    : kbNotes
  if (!matches.length) {
    list.innerHTML = `<div class="empty-state">${kbNotes.length ? 'No notes match' : 'Vault is empty'}</div>`
    return
  }

  const groups = new Map()
  for (const n of matches) {
    if (!groups.has(n.category)) groups.set(n.category, [])
    groups.get(n.category).push(n)
  }
  const rank = (c) => (KB_FOLDER_ORDER.indexOf(c) + 1) || KB_FOLDER_ORDER.length
  const ordered = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

  list.innerHTML = ordered.map(cat => {
    const notes = groups.get(cat).sort((a, b) =>
      cat === 'Logs' ? b.mtime - a.mtime : a.title.localeCompare(b.title))
    const open = q || !KB_COLLAPSED_BY_DEFAULT.has(cat) || notes.some(n => n.path === kbActivePath)
    return `
      <details class="kb-group" ${open ? 'open' : ''}>
        <summary><span>${escapeHtml(cat === 'Root' ? 'Vault root' : cat)}</span><span class="kb-count">${notes.length}</span></summary>
        ${notes.map(n => `
          <div class="kb-item${n.path === kbActivePath ? ' active' : ''}" data-path="${escapeAttr(n.path)}">
            <div class="kb-item-title">${escapeHtml(n.title)}</div>
            ${n.excerpt ? `<div class="kb-item-excerpt">${escapeHtml(n.excerpt)}</div>` : ''}
          </div>`).join('')}
      </details>`
  }).join('')
}

// [[Target|Alias]] → clickable link to the resolved note (or a muted span if it
// doesn't exist), so notes can be browsed the way they are in Obsidian.
function kbLinkify(md) {
  return md.replace(/\[\[([^\]|#\\]+)(#[^\]|\\]*)?(?:\\?\|([^\]]+))?\]\]/g, (_, target, heading, alias) => {
    const label = escapeHtml((alias || target).trim())
    const note = kbResolve(target)
    return note
      ? `<a class="wikilink" data-path="${escapeAttr(note.path)}">${label}</a>`
      : `<span class="wikilink missing" title="Note not found">${label}</span>`
  })
}

async function openKbNote(path) {
  const pane = document.getElementById('briefingContent')
  if (!path) {
    pane.innerHTML = '<div class="empty-state">Select a note</div>'
    return
  }
  kbActivePath = path
  document.querySelectorAll('.kb-item').forEach(el => el.classList.toggle('active', el.dataset.path === path))
  const note = kbNotes.find(n => n.path === path)
  const content = await api.readNote(path)
  if (content == null) {
    pane.innerHTML = '<div class="empty-state">Could not read this note</div>'
    return
  }
  pane.innerHTML = `
    <div class="kb-note-bar">
      <span class="kb-crumb">${escapeHtml(path.replace(/\.md$/, '').split('/').join(' / '))}</span>
      <button class="kb-btn" onclick="openKnowledgeGraph(${escapeAttr(JSON.stringify(path))})">
        <span class="material-symbols-outlined">hub</span> Show in graph
      </button>
    </div>
    ${markdownToHtml(kbLinkify(content))}`
  pane.scrollTop = 0
  if (note && !document.querySelector('.kb-item.active')) renderKbList(document.getElementById('kbSearch').value)
}

document.getElementById('briefingsList')?.addEventListener('click', (e) => {
  const item = e.target.closest('.kb-item')
  if (item) openKbNote(item.dataset.path)
})
document.getElementById('briefingContent')?.addEventListener('click', (e) => {
  const link = e.target.closest('.wikilink[data-path]')
  if (link) openKbNote(link.dataset.path)
})
document.getElementById('kbSearch')?.addEventListener('input', (e) => renderKbList(e.target.value))

// Used by the 3D graph's "Open in Knowledge Base" button.
window.showNoteInKnowledgeBase = function(path) {
  kbActivePath = path
  document.getElementById('nav-briefings').click()
}

window.openKnowledgeGraph = function(focusPath) {
  window.AICore3D?.pause()
  window.KnowledgeGraph3D?.open(focusPath)
}

async function loadLatestBriefing() {
  const files = await api.listNotes('Logs/briefings')
  if (!files.length) return
  const content = await api.readNote(`Logs/briefings/${files[0]}`)
  const el = document.getElementById('latestBriefing')
  if (content) el.innerHTML = `<div class="markdown-body">${markdownToHtml(content)}</div>`
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANNER
// ═══════════════════════════════════════════════════════════════════════════════

async function loadPlanner() {
  const list = document.getElementById('plannerList')
  const files = await api.listNotes('Tasks')

  if (!files.length) {
    list.innerHTML = '<div class="empty-state">No ops plans</div>'
    return
  }

  list.innerHTML = files.map(f => `
    <div class="briefing-item" onclick="openPlan('Tasks/${f}', this)">
      ${f.replace('.md', '')}
    </div>`).join('')
}

window.openPlan = async function(path, el) {
  document.querySelectorAll('#plannerList .briefing-item').forEach(i => i.classList.remove('active'))
  el.classList.add('active')
  const content = await api.readNote(path)
  document.getElementById('plannerContent').innerHTML = content
    ? markdownToHtml(content)
    : '<div class="empty-state">Unable to decrypt file</div>'
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

async function loadAgentsDetail() {
  const el = document.getElementById('agentsDetail')
  if (!el) return
  
  let healthArray = []
  try {
    const directorData = await api.getDirectorSummary()
    healthArray = directorData.agents || []
  } catch (err) {}

  el.innerHTML = AGENT_DEFS.map(agent => {
    const h = healthArray.find(a => a.name === agent.id) || {}
    const running = h.status && h.status !== 'offline'
    
    return `
      <div class="agent-detail-card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="agent-detail-header">
            <div class="agent-detail-name"><span class="material-symbols-outlined agent-detail-icon">${agent.icon}</span>${agent.name}</div>
            <span class="agent-detail-badge ${h.status === 'Paused' ? 'paused' : running ? 'running' : 'offline'}">
              ${h.status === 'Paused' ? '⏸ Paused' : running ? '● Online' : '○ Offline'}
            </span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${agent.desc}</div>
          <div style="font-size:11px;color:var(--jarvis-cyan);margin-top:8px;font-family:'JetBrains Mono',monospace">
            Task: ${h.currentTask || 'Idle'}
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          ${running && h.status !== 'Paused' ? `<button class="action-btn" onclick="triggerAgentAction('${agent.id}', 'pause')">Pause</button>` : ''}
          ${running && h.status === 'Paused' ? `<button class="action-btn" onclick="triggerAgentAction('${agent.id}', 'resume')">Resume</button>` : ''}
        </div>
      </div>`
  }).join('')
}

window.triggerAgentAction = async function(agentId, action) {
  try {
    // Since /pause and /resume are endpoints on the agent itself, we can use triggerAgent if we adapt it.
    // Let's use triggerAgent but we might need to modify it or just fetch directly.
    const port = AGENT_DEFS.find(a => a.id === agentId)?.port
    if (port) {
      await fetch(`http://localhost:${port}/${action}`, { method: 'POST' })
      setTimeout(loadAgentsDetail, 500) // refresh UI
    }
  } catch (e) {
    console.error(e)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function markdownToHtml(md) {
  if (!md) return ''
  return md
    .replace(/^---[\s\S]*?---\n?/m, '')                    // strip frontmatter
    .replace(/^#{1}\s+(.+)/gm, '<h1>$1</h1>')
    .replace(/^#{2}\s+(.+)/gm, '<h2>$1</h2>')
    .replace(/^#{3}\s+(.+)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^\- \[x\] (.+)/gm, '<li style="list-style:none">☑ $1</li>')
    .replace(/^\- \[ \] (.+)/gm, '<li style="list-style:none">☐ $1</li>')
    .replace(/^\- (.+)/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hlpiu]|<li|<hr)(.+)/gm, '<p>$1</p>')
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  updateGreeting()
  updateTicker()
  await refreshHealth()
  await loadLatestBriefing()

  // Update ticker every second
  setInterval(updateTicker, 1000)

  // Poll health every 10 seconds
  setInterval(refreshHealth, 10000)

  // Update greeting every minute
  setInterval(updateGreeting, 60000)

  console.log('[Mika OS] interface initialized')
}

init()

// ═══════════════════════════════════════════════════════════════════════════════
// AI CORE → 3D KNOWLEDGE GRAPH
// ═══════════════════════════════════════════════════════════════════════════════

// The graph itself lives in knowledge-graph-3d.js (a full-window overlay with its
// own close button / Esc) — clicking the core just opens it.
document.getElementById('massiveCore')?.addEventListener('click', () => window.openKnowledgeGraph())

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE SYSTEM STATS FOR HUD GAUGES
// ═══════════════════════════════════════════════════════════════════════════════

async function updateSystemStats() {
  if (!api || !api.getSystemStats) return
  try {
    const stats = await api.getSystemStats()
    const footerRam = document.getElementById('footerRam')
    if (footerRam) footerRam.textContent = `${stats.memPercent}%`
  } catch (err) {
    console.error('Failed to fetch system stats:', err)
  }
}

// Poll every 5 seconds
setInterval(updateSystemStats, 5000)
updateSystemStats()

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL DRAG AND DROP HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const dropzone = document.getElementById('globalDropzone')

if (dropzone) {
  // Prevent default behavior for all drag events on window
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, preventDefaults, false)
  })

  function preventDefaults (e) {
    e.preventDefault()
    e.stopPropagation()
  }

  // Show dropzone on drag enter
  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      dropzone.classList.remove('hidden')
    }
  }, false)

  // Hide dropzone if dragging leaves window
  dropzone.addEventListener('dragleave', (e) => {
    if (e.clientX === 0 || e.clientY === 0) {
      dropzone.classList.add('hidden')
    }
  }, false)

  // Handle dropped files
  dropzone.addEventListener('drop', async (e) => {
    dropzone.classList.add('hidden')
    
    const files = e.dataTransfer.files
    if (files.length > 0 && api.uploadToVault) await uploadFiles(files)
  }, false)
}

const kbFileInput = document.getElementById('kbFileInput')
if (kbFileInput) {
  kbFileInput.addEventListener('change', async (e) => {
    const files = e.target.files
    if (files.length > 0 && api.uploadToVault) await uploadFiles(files)
    e.target.value = ''
  })
}

// Load previous chat history on startup
document.addEventListener('DOMContentLoaded', async () => {
  const chatMessages = document.getElementById('chatMessages')
  if (window.agentOS.loadChat && chatMessages) {
    const history = await window.agentOS.loadChat()
    if (history && history.length > 0) {
      history.forEach(msg => {
        const cls = msg.role === 'user' ? 'user' : 'system'
        chatMessages.innerHTML += `<div class="chat-message ${cls}"><div class="message-bubble">${msg.role === 'user' ? escapeHtml(msg.content) : markdownToHtml(msg.content)}</div></div>`
      })
      chatMessages.scrollTop = chatMessages.scrollHeight
    }
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════════════════
window.deployAllAgents = async function() {
  if (!api || !api.startAgents) return
  try {
    const btn = event.currentTarget
    const originalHtml = btn.innerHTML
    btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;margin-right:10px;"></div> <span style="font-size:11px">Deploying...</span>`
    
    await api.startAgents()
    
    setTimeout(() => {
      btn.innerHTML = originalHtml
      refreshHealth()
    }, 2000) // fake delay for UI feedback
  } catch (err) {
    console.error('Failed to deploy agents via UI:', err)
  }
}
