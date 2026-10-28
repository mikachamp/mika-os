// fitness/index.js — Fitness Agent (stub — full build coming)
import 'dotenv/config'
import express from 'express'
import schedule from 'node-schedule'
import { callLLM } from '../shared/llm.js'
import { readNote, writeNote, today } from '../shared/obsidian.js'
import { notify } from '../shared/notify.js'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.FITNESS_PORT || 3003
const app = express()
app.use(express.json())

const state = new AgentState('fitness', 'Workouts & health')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Fitness Agent in a personal Agent OS.
You help the user with workout planning, nutrition tracking, recovery, and health optimisation.
Tailor advice to the user's goals in their Personal Context note.
Be specific, data-driven, and practical.`

async function dailyFitnessCheck() {
  await state.setTask('Generating daily fitness check...')
  console.log('[Fitness] 🏋️ Running daily fitness check...')
  
  try {
    const context = await readNote('Notes/Personal Context.md')

  const prompt = `
Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.

User context:
${context}

Generate a daily fitness note with:
1. **Today's suggested workout** (based on advanced training, vary by day of week)
2. **Key nutrition focus** for today
3. **Recovery tip** (sleep, mobility, stress)
4. **One performance metric to track today**

Keep it brief and actionable.`

  const result = await callLLM(SYSTEM_PROMPT, prompt)
  await writeNote(`Logs/fitness/${today()}.md`, `# 🏋️ Fitness — ${today()}\n\n${result}`)
  notify('🏋️ Fitness Check', 'Daily fitness note written to Obsidian.')
  console.log('[Fitness] ✅ Done')
  await state.setIdle()
  } catch (err) {
    await state.setIdle()
    throw err
  }
}

// 6am daily fitness check
schedule.scheduleJob('0 6 * * *', dailyFitnessCheck)

app.post('/trigger/daily-check', async (req, res) => {
  try {
    const result = await dailyFitnessCheck()
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: `Fitness check failed: ${err.message}` })
  }
})

app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    const result = await callLLM(SYSTEM_PROMPT, message)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: `Fitness agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'fitness', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Fitness] 🚀 Agent running on port ${PORT} (localhost only)`))

