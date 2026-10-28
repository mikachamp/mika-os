// shared/agent-state.js — Manage agent state and write to Obsidian
import { writeNote } from './obsidian.js'

export class AgentState {
  constructor(agentName, description) {
    this.agentName = agentName
    this.description = description
    this.status = 'Idle'
    this.currentTask = 'Awaiting commands'
    this.lastUpdated = new Date().toISOString()
    this.isPaused = false
    
    // Write initial state
    this.sync()
  }

  async setTask(task) {
    if (this.isPaused) {
      console.warn(`[${this.agentName}] Blocked from starting task (PAUSED): ${task}`)
      throw new Error(`Agent ${this.agentName} is currently paused by the Director.`)
    }
    this.currentTask = task
    this.status = 'Working'
    this.lastUpdated = new Date().toISOString()
    await this.sync()
  }

  async setIdle() {
    this.currentTask = 'Awaiting commands'
    this.status = this.isPaused ? 'Paused' : 'Idle'
    this.lastUpdated = new Date().toISOString()
    await this.sync()
  }

  async pause() {
    this.isPaused = true
    this.status = 'Paused'
    this.lastUpdated = new Date().toISOString()
    await this.sync()
    console.log(`[${this.agentName}] ⏸️ Agent paused by Director.`)
  }

  async resume() {
    this.isPaused = false
    this.status = this.currentTask === 'Awaiting commands' ? 'Idle' : 'Working'
    this.lastUpdated = new Date().toISOString()
    await this.sync()
    console.log(`[${this.agentName}] ▶️ Agent resumed by Director.`)
  }

  async sync() {
    const md = `---
agent: ${this.agentName}
status: ${this.status}
last_updated: ${this.lastUpdated}
---

# 🤖 Agent: ${this.agentName}
*${this.description}*

## 🟢 Current State
**Status:** ${this.status}
**Active Task:** ${this.currentTask}

## 📝 Recent Logs
- [${new Date().toLocaleTimeString()}] State changed to: ${this.status} | Task: ${this.currentTask}
`
    await writeNote(`Logs/Agents/${this.agentName}.md`, md)
  }
  
  injectControlEndpoints(app) {
    app.post('/pause', async (req, res) => {
      await this.pause()
      res.json({ success: true, message: `Paused ${this.agentName}` })
    })
    
    app.post('/resume', async (req, res) => {
      await this.resume()
      res.json({ success: true, message: `Resumed ${this.agentName}` })
    })
    
    // Wrap the standard /health endpoint if needed, or we just override it in index.js
  }
}
