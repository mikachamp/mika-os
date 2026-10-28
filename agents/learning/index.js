// learning/index.js — Learning Agent
import 'dotenv/config'
import express from 'express'
import schedule from 'node-schedule'
import { callLLM } from '../shared/llm.js'
import { readNote, writeNote, today } from '../shared/obsidian.js'
import { notify } from '../shared/notify.js'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.LEARNING_PORT || 3004
const app = express()
app.use(express.json())

const state = new AgentState('learning', 'Study & courses')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Learning Agent in a personal Agent OS.
You help the user study effectively, track course progress, and retain knowledge.
Tailor study plans to the courses and goals in the user's Personal Context note.
Be structured, pedagogical, and motivating.`

async function eveningStudyPrompt() {
  await state.setTask('Generating evening study prompt...')
  console.log('[Learning] 📚 Generating evening study prompt...')
  
  try {
    const context = await readNote('Notes/Personal Context.md')

  const prompt = `
Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.

User context:
${context}

Generate an evening study session plan:
1. **Topic to review tonight** (aligned with the courses in the Personal Context note)
2. **3 key concepts to focus on** 
3. **One practice exercise or mini-project**
4. **Spaced repetition reminder** (what to revisit from earlier this week)
5. **Study session length recommendation** (based on day of week, energy levels)`

  const result = await callLLM(SYSTEM_PROMPT, prompt)
  await writeNote(`Logs/learning/${today()}.md`, `# 📚 Learning — ${today()}\n\n${result}`)
  notify('📚 Study Session', 'Your evening study plan is ready in Obsidian.')
  console.log('[Learning] ✅ Done')
  await state.setIdle()
  } catch (err) {
    await state.setIdle()
    throw err
  }
}

// 8pm daily study prompt
schedule.scheduleJob('0 20 * * *', eveningStudyPrompt)

app.post('/trigger/study-prompt', async (req, res) => {
  try {
    const result = await eveningStudyPrompt()
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: `Study prompt failed: ${err.message}` })
  }
})

app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    const result = await callLLM(SYSTEM_PROMPT, message)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: `Learning agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'learning', status: state.status, currentTask: state.currentTask, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Learning] 🚀 Agent running on port ${PORT} (localhost only)`))

