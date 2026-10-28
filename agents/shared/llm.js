// shared/llm.js — Shared LLM caller for every agent.
//
// Local-first: calls the model loaded in LM Studio (OpenAI-compatible server on
// localhost:1234) and only falls back to Google Gemini when LM Studio isn't
// running or the local call fails. Nothing leaves the machine while LM Studio
// is up.
//
//   LLM_PROVIDER     auto (default) = local, then Gemini · local = local only · gemini = cloud only
//   LOCAL_LLM_URL    default http://127.0.0.1:1234
//   LOCAL_LLM_MODEL  default google/gemma-4-e4b (must be loaded in LM Studio)
//   LOCAL_LLM_TIMEOUT_MS  default 120000 (local models are slower than the cloud)
//   LOCAL_LLM_REASONING   default none — "thinking" off so replies aren't empty/slow
//
// Anthropic version backed up at shared/llm.js.anthropic-backup.
import 'dotenv/config'

const PROVIDER = (process.env.LLM_PROVIDER || 'auto').toLowerCase()
const LOCAL_URL = (process.env.LOCAL_LLM_URL || 'http://127.0.0.1:1234').replace(/\/$/, '')
const LOCAL_MODEL = process.env.LOCAL_LLM_MODEL || 'google/gemma-4-e4b'
const LOCAL_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS) || 120000
const LOCAL_REASONING = process.env.LOCAL_LLM_REASONING || 'none' // none | low | medium | high
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
const apiKey = process.env.GEMINI_API_KEY

if (PROVIDER !== 'local' && !apiKey) {
  console.warn('[LLM] ⚠️  GEMINI_API_KEY is not set — no cloud fallback if LM Studio is down.')
}

// Remember LM Studio's availability briefly so a closed LM Studio doesn't
// cost every call a connection attempt.
let localUp = null
let localCheckedAt = 0
async function localAvailable() {
  if (localUp !== null && Date.now() - localCheckedAt < 30000) return localUp
  try {
    const res = await fetch(`${LOCAL_URL}/v1/models`, { signal: AbortSignal.timeout(2000) })
    localUp = res.ok
  } catch {
    localUp = false
  }
  localCheckedAt = Date.now()
  return localUp
}

async function callLocal(systemPrompt, userMessage, maxTokens) {
  const res = await fetch(`${LOCAL_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
      // Gemma 4 / Qwen 3.5 "think" by default and can spend the whole token
      // budget reasoning, returning an empty answer. Agents need the answer.
      reasoning_effort: LOCAL_REASONING
    }),
    signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LM Studio error ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  // Reasoning models put their thinking in a separate field or <think> tags —
  // agents only want the final answer.
  const text = (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (!text) throw new Error('LM Studio returned an empty reply')
  return text
}

async function callGemini(systemPrompt, userMessage, maxTokens, model, timeoutMs) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured. Edit agents/.env to add your key.')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: maxTokens }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const finishReason = data.candidates?.[0]?.finishReason
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text && finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini returned no text (finishReason: ${finishReason})`)
  }
  return text || 'No response received.'
}

const describe = (err) => (err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out' : err.message)

/**
 * Call the LLM with a system prompt + user message.
 * @param {string} systemPrompt - The agent's persona/instructions
 * @param {string} userMessage  - The task or query
 * @param {Object} options      - { maxTokens, timeoutMs, model } — `model` only
 *   applies when it names a Gemini model and the call goes to Gemini.
 * @returns {Promise<string>}
 */
export async function callLLM(systemPrompt, userMessage, options = {}) {
  const { maxTokens = 2048, timeoutMs = 30000 } = options
  const geminiModel = /^gemini/i.test(options.model || '') ? options.model : GEMINI_MODEL

  if (PROVIDER !== 'gemini' && (PROVIDER === 'local' || await localAvailable())) {
    try {
      return await callLocal(systemPrompt, userMessage, maxTokens)
    } catch (err) {
      console.error(`[LLM] Local model failed (${describe(err)})`)
      if (PROVIDER === 'local') throw err
      localUp = null // re-check on the next call
      console.warn('[LLM] Falling back to Gemini for this call')
    }
  }

  try {
    return await callGemini(systemPrompt, userMessage, maxTokens, geminiModel, timeoutMs)
  } catch (err) {
    console.error('[LLM] Error calling Gemini:', describe(err))
    throw err
  }
}

/** Which backend the next call will use — for status displays. */
export async function activeProvider() {
  if (PROVIDER === 'gemini') return { provider: 'gemini', model: GEMINI_MODEL }
  if (PROVIDER === 'local' || await localAvailable()) return { provider: 'local', model: LOCAL_MODEL }
  return { provider: 'gemini', model: GEMINI_MODEL, note: 'LM Studio not reachable' }
}
