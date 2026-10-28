import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { AgentState } from '../shared/agent-state.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3006
const OBSIDIAN_PATH = path.join(__dirname, '../../obsidian')
const RAW_FILES_PATH = path.join(OBSIDIAN_PATH, 'raw files')

// Ensure raw files directory exists
if (!fs.existsSync(RAW_FILES_PATH)) {
  fs.mkdirSync(RAW_FILES_PATH, { recursive: true })
}

const state = new AgentState('vault-manager', 'Monitoring raw files directory')
state.injectControlEndpoints(app)

app.get('/health', (req, res) => {
  res.json({
    agent: 'vault-manager',
    status: state.status,
    currentTask: state.currentTask,
    tasks: ['Monitoring raw files directory', 'Awaiting new drops']
  })
})

app.post('/trigger/:action', async (req, res) => {
  const { action } = req.params
  
  if (action === 'process-raw') {
    await state.setTask('Processing raw files...')
    res.json({ message: 'Processing raw files...' })
    // Future logic to process the raw files and move them to their respective folders
    setTimeout(async () => await state.setIdle(), 3000)
  } else {
    res.json({ message: `Action ${action} not recognized.` })
  }
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Vault Manager Agent listening on port ${PORT} (localhost only)`)
})
