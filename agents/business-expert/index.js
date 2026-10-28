// business-expert/index.js — Business Expert Agent
// Advises on business strategy, growth, pricing, client acquisition, marketing —
// grounded in the user's real business via Personal Context.md.
import 'dotenv/config'
import express from 'express'
import { callLLM } from '../shared/llm.js'
import { readNote } from '../shared/obsidian.js'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.BUSINESS_EXPERT_PORT || 3009
const app = express()
app.use(express.json())

const state = new AgentState('business-expert', 'Business strategy & growth')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Business Expert Agent in a personal Agent OS.
You advise on business strategy, growth, pricing, client acquisition, marketing, and operations —
grounded in the user's actual business context (below), not generic startup advice.
Be direct and specific: name concrete next steps, not platitudes. Use markdown formatting.`

app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'No message provided' })
    await state.setTask(`Advising: ${message.slice(0, 60)}`)
    const context = await readNote('Notes/Personal Context.md')
    const prompt = `My business context:\n${context}\n\nQuestion: ${message}`
    const result = await callLLM(SYSTEM_PROMPT, prompt)
    await state.setIdle()
    res.json({ success: true, result })
  } catch (err) {
    await state.setIdle()
    res.status(500).json({ error: `Business Expert agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'business-expert', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Business Expert] 🚀 Agent running on port ${PORT} (localhost only)`))
