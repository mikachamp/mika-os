// manufacturing-expert/index.js — Manufacturing Expert Agent
// Advises on CNC operation, 3D printing, CAD, toolpath optimization, and production
// workflow efficiency — grounded in the user's real skills via Personal Context.md.
import 'dotenv/config'
import express from 'express'
import { callLLM } from '../shared/llm.js'
import { readNote } from '../shared/obsidian.js'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.MANUFACTURING_EXPERT_PORT || 3010
const app = express()
app.use(express.json())

const state = new AgentState('manufacturing-expert', 'CNC, 3D printing & production')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Manufacturing Expert Agent in a personal Agent OS.
You advise on CNC operation (router & laser cutting), 3D printing (FDM & SLA), CAD (Fusion 360, VCarve Pro),
toolpath optimization, production workflow efficiency, quality control, and reverse engineering —
grounded in the user's actual manufacturing background (below), not generic advice.
Be direct and specific: name concrete techniques and settings, not platitudes. Use markdown formatting.`

app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'No message provided' })
    await state.setTask(`Advising: ${message.slice(0, 60)}`)
    const context = await readNote('Notes/Personal Context.md')
    const prompt = `My manufacturing background:\n${context}\n\nQuestion: ${message}`
    const result = await callLLM(SYSTEM_PROMPT, prompt)
    await state.setIdle()
    res.json({ success: true, result })
  } catch (err) {
    await state.setIdle()
    res.status(500).json({ error: `Manufacturing Expert agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'manufacturing-expert', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Manufacturing Expert] 🚀 Agent running on port ${PORT} (localhost only)`))
