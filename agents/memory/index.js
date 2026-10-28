// memory/index.js — Memory Agent
// Watches the Obsidian vault for new/changed notes and indexes them
import 'dotenv/config'
import express from 'express'
import chokidar from 'chokidar'
import { callLLM } from '../shared/llm.js'
import { readNote, appendNote, today, VAULT } from '../shared/obsidian.js'
import path from 'path'
import { AgentState } from '../shared/agent-state.js'

const PORT = process.env.MEMORY_PORT || 3005

const app = express()
app.use(express.json())

const state = new AgentState('memory', 'Vault indexing')
state.injectControlEndpoints(app)

const SYSTEM_PROMPT = `You are the Memory Agent in a personal Agent OS.
When a new note is added to the Obsidian vault, you summarise it and extract key facts.
Output a brief 2-3 sentence summary and 3-5 bullet point key facts.
This helps build a searchable semantic index of the user's knowledge.`

const INDEX_NOTE = 'Notes/Memory Index.md'
// Local models run with an 8k context: keep prompts well under it (~4 chars per token)
const MAX_NOTE_CHARS = 12000
const MAX_CONTEXT_CHARS = 9000

// Track recently processed files to avoid duplicate processing
const recentlyProcessed = new Set()

// Pick the index entries most relevant to the query, newest first on ties,
// within a character budget — the full index is far larger than the context window.
function relevantEntries(index, query, budget = MAX_CONTEXT_CHARS) {
  const entries = index.split('\n### ').slice(1).map((e, i) => ({ text: `### ${e.trim()}`, i }))
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
  const scored = entries.map(e => {
    const t = e.text.toLowerCase()
    return { ...e, score: words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0) }
  }).sort((a, b) => b.score - a.score || b.i - a.i)
  const out = []
  let used = 0
  for (const e of scored) {
    if (used + e.text.length > budget) continue
    out.push(e); used += e.text.length
  }
  return out.sort((a, b) => a.i - b.i).map(e => e.text).join('\n\n')
}

async function processNote(filePath) {
  const relativePath = path.relative(VAULT, filePath).replace(/\\/g, '/')

  // Skip system files, logs, and already-processed files
  if (
    relativePath.startsWith('.obsidian') ||
    relativePath.startsWith('Logs/') ||
    relativePath === INDEX_NOTE || // writing the index must not re-trigger indexing
    /(^|\/)[^/]*CodeGraph\//.test(relativePath) || // generated code maps, not knowledge

    recentlyProcessed.has(filePath)
  ) return

  recentlyProcessed.add(filePath)
  setTimeout(() => recentlyProcessed.delete(filePath), 30000) // clear after 30s

  console.log(`[Memory] 📝 Processing new/changed note: ${relativePath}`)
  await state.setTask(`Indexing: ${relativePath}`)

  try {
    const content = await readNote(relativePath)
    if (!content || content.length < 100) {
      await state.setIdle()
      return // skip tiny files
    }

    const summary = await callLLM(
      SYSTEM_PROMPT,
      `Summarise this note from my Obsidian vault:\n\nFile: ${relativePath}\n\n${content.slice(0, MAX_NOTE_CHARS)}`,
      { maxTokens: 600 }
    )

    const indexEntry = `
### ${relativePath}
*Indexed: ${new Date().toLocaleString()}*

${summary}

---`

    await appendNote(INDEX_NOTE, indexEntry)
    console.log(`[Memory] ✅ Indexed: ${relativePath}`)
    await state.setIdle()
  } catch (err) {
    console.error(`[Memory] Error processing ${relativePath}:`, err.message)
    await state.setIdle()
  }
}

// Watch the vault for new/changed .md files
const watcher = chokidar.watch(`${VAULT}/**/*.md`, {
  ignored: [
    /(^|[\/\\])\../, // dotfiles
    /\.obsidian/,
    /[\/\\]Logs[\/\\]/, // Windows paths use backslashes
    /Memory Index\.md$/,
    /[\/\\][^\/\\]*CodeGraph[\/\\]/ // generated code maps: a graphify run rewrites ~1,100 notes at once
  ],
  persistent: true,
  ignoreInitial: true, // don't process existing files on startup
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
})

watcher
  .on('add', processNote)
  .on('change', processNote)
  .on('ready', () => console.log('[Memory] 👁️ Watching vault for changes...'))

app.post('/index', async (req, res) => {
  try {
    const { notePath } = req.body
    await processNote(path.join(VAULT, notePath))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: `Indexing failed: ${err.message}` })
  }
})

// Query the memory index
app.post('/ask', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'No message provided' })

    // Only the index entries relevant to the query fit in the context window
    const memoryIndex = await readNote(INDEX_NOTE)
    const entries = memoryIndex ? relevantEntries(memoryIndex, message) : ''
    const context = entries
      ? `Here are the most relevant entries from the vault's memory index:\n\n${entries}`
      : 'The memory index is currently empty.'

    const result = await callLLM(
      SYSTEM_PROMPT,
      `${context}\n\nUser query: ${message}`,
      { maxTokens: 1024 }
    )
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: `Memory agent error: ${err.message}` })
  }
})

app.get('/health', (req, res) => {
  res.json({ agent: 'memory', status: state.status, currentTask: state.currentTask, watching: VAULT, time: new Date().toISOString() })
})

app.listen(PORT, '127.0.0.1', () => console.log(`[Memory] 🚀 Agent running on port ${PORT} (localhost only)`))

