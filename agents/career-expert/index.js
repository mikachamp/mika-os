// career-expert/index.js — Career Expert Agent
// Advises on career strategy, resume/CV positioning, interview prep, skill gaps,
// and drafting tailored applications — grounded in the user's Personal Context note.
import 'dotenv/config'
import express from 'express'
import { callLLM } from '../shared/llm.js'
import { readNote } from '../shared/obsidian.js'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.CAREER_EXPERT_PORT || 3011
const app = express()
app.use(express.json())

const state = new AgentState('career-expert', 'Career strategy & job search')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Career Expert Agent in a personal Agent OS.
You advise on career strategy, CV/resume positioning, interview preparation, skill-gap analysis,
job search strategy, and concrete next steps from where the user is now —
grounded in the user's actual background and direction (below), not generic career advice.
Be direct and specific: name concrete next steps, not platitudes. Use markdown formatting.`

app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'No message provided' })
    await state.setTask(`Advising: ${message.slice(0, 60)}`)
    const context = await readNote('Notes/Personal Context.md')
    const prompt = `My background and career direction:\n${context}\n\nQuestion: ${message}`
    const result = await callLLM(SYSTEM_PROMPT, prompt)
    await state.setIdle()
    res.json({ success: true, result })
  } catch (err) {
    await state.setIdle()
    res.status(500).json({ error: `Career Expert agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'career-expert', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Career Expert] 🚀 Agent running on port ${PORT} (localhost only)`))
