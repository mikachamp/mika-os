// shared/obsidian.js — Read and write files in the Obsidian vault
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Defaults to the vault that ships alongside this repo (agents/shared/../../obsidian)
// rather than a hardcoded personal path, so it survives the project being moved.
export const VAULT = process.env.OBSIDIAN_VAULT_PATH ||
  path.join(__dirname, '..', '..', 'obsidian')

/**
 * Read a note from the vault
 * @param {string} notePath - Relative path from vault root e.g. 'Notes/Personal Context.md'
 * @returns {Promise<string>}
 */
export async function readNote(notePath) {
  const fullPath = path.join(VAULT, notePath)
  try {
    return await fs.readFile(fullPath, 'utf-8')
  } catch (err) {
    console.warn(`[Obsidian] Could not read ${notePath}: ${err.message}`)
    return ''
  }
}

/**
 * Write a note to the vault (creates file and parent dirs if needed)
 * @param {string} notePath - Relative path from vault root
 * @param {string} content  - Markdown content to write
 */
export async function writeNote(notePath, content) {
  const fullPath = path.join(VAULT, notePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf-8')
  console.log(`[Obsidian] Written: ${notePath}`)
}

/**
 * Append text to an existing note (creates if missing)
 * @param {string} notePath
 * @param {string} content
 */
export async function appendNote(notePath, content) {
  const fullPath = path.join(VAULT, notePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.appendFile(fullPath, '\n' + content, 'utf-8')
}

/**
 * List all .md files in a vault folder
 * @param {string} folderPath - Relative folder path e.g. 'Tasks'
 * @returns {Promise<string[]>} - Array of full file contents joined
 */
export async function readFolder(folderPath) {
  const fullPath = path.join(VAULT, folderPath)
  try {
    const files = await fs.readdir(fullPath)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    const contents = await Promise.all(
      mdFiles.map(async f => {
        const content = await fs.readFile(path.join(fullPath, f), 'utf-8')
        return `## ${f}\n${content}`
      })
    )
    return contents.join('\n\n---\n\n')
  } catch (err) {
    console.warn(`[Obsidian] Could not read folder ${folderPath}: ${err.message}`)
    return ''
  }
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today() {
  return new Date().toISOString().split('T')[0]
}

// ─── Task queue helpers (AGENT_OPERATING_RULES.md section 4) ─────────────────
// Every helper takes an optional last `opts` object:
//   opts.vault — vault root override (tests use a temp dir; default is VAULT)
//   opts.now   — Date to treat as "now" (tests); default new Date()

const DEFAULT_LEASE_MINUTES = 30   // claim lease: now + 30 min
const STALE_GRACE_MINUTES = 10     // lease expired > 10 min ago = stale
const ACTIVE_STATUSES = ['claimed', 'working']
const CLAIMABLE_STATUSES = ['queued', 'claimed']

function vaultOf(opts = {}) { return opts.vault || VAULT }
function nowOf(opts = {}) { return opts.now ? new Date(opts.now) : new Date() }
function locksDir(opts) { return path.join(vaultOf(opts), 'Tasks', 'locks') }

/**
 * ISO timestamp in UTC, seconds precision, e.g. 2026-10-27T20:21:07Z
 * (same shape the leads write by hand; no milliseconds)
 * @param {Date} [date]
 */
export function isoTimestamp(date = new Date()) {
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Parse a frontmatter timestamp. Accepts quoted or bare values and both
 * UTC "Z" and offset forms ("+02:00"). Returns null when empty/invalid.
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
export function parseTimestamp(value) {
  if (value === null || value === undefined) return null
  const s = String(value).trim().replace(/^["']|["']$/g, '').trim()
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t)
}

/**
 * True when a lease expired more than `graceMinutes` ago (section 4 takeover rule).
 * An empty/unparseable lease is NOT treated as stale (conservative).
 */
export function isLeaseStale(leaseUntil, now = new Date(), graceMinutes = STALE_GRACE_MINUTES) {
  const lease = parseTimestamp(leaseUntil)
  if (!lease) return false
  return new Date(now).getTime() - lease.getTime() > graceMinutes * 60 * 1000
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * Read one field from a note's YAML frontmatter (frontmatter only, never the body).
 * Surrounding quotes are stripped. Missing field -> null, empty field -> ''.
 */
export function getFrontmatterField(content, key) {
  const m = content.match(FM_RE)
  if (!m) return null
  // [ \t]* (not \s*) so an empty value never swallows the next line
  const line = m[1].match(new RegExp(`^${escapeRe(key)}:[ \\t]*(.*?)[ \\t]*\\r?$`, 'm'))
  if (!line) return null
  return line[1].replace(/^["']|["']$/g, '')
}

/**
 * Set (or insert) one field in a note's YAML frontmatter, leaving the body alone.
 * Keeps the file's line endings. value '' writes an empty field ("key:").
 */
export function setFrontmatterField(content, key, value) {
  const m = content.match(FM_RE)
  if (!m) throw new Error(`No YAML frontmatter found (cannot set ${key})`)
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const newLine = value === '' || value === null || value === undefined ? `${key}:` : `${key}: ${value}`
  const fieldRe = new RegExp(`^${escapeRe(key)}:[ \\t]*.*?(?=\\r?$)`, 'm')
  let fm = m[1]
  if (fieldRe.test(fm)) fm = fm.replace(fieldRe, () => newLine)
  else fm = fm + eol + newLine
  const start = content.indexOf('\n') + 1   // FM_RE is anchored at 0: group 1 starts right after the first '---' line
  return content.slice(0, start) + fm + content.slice(start + m[1].length)
}

/**
 * Locate a task file in Tasks/Queue matching a task ID (e.g. 'T-0001').
 * Matches "T-0001.md" or "T-0001 <title>.md" only, so T-001 never hits T-0010.
 * @param {string} taskId
 * @param {{vault?: string}} [opts]
 * @returns {Promise<string>} Full path to the task file
 */
export async function findTaskFile(taskId, opts = {}) {
  const queueDir = path.join(vaultOf(opts), 'Tasks', 'Queue')
  const files = await fs.readdir(queueDir)
  const match = files.find(f => f.endsWith('.md') && (f === `${taskId}.md` || f.startsWith(`${taskId} `)))
  if (!match) throw new Error(`Task file for ${taskId} not found in Tasks/Queue/`)
  return path.join(queueDir, match)
}

/**
 * Claim a task: atomic lock file (exclusive create 'wx') + frontmatter lease.
 * Only tasks with status queued/claimed can be claimed.
 * @param {string} taskId - e.g. 'T-0001'
 * @param {string} agentName - e.g. 'gemini-lead' or 'orchestrator'
 * @param {number} [leaseMinutes=30] - Lease duration in minutes
 * @param {{vault?: string, now?: Date}} [opts]
 * @returns {Promise<boolean>} True if claimed, false if locked or not claimable
 */
export async function claimTask(taskId, agentName, leaseMinutes = DEFAULT_LEASE_MINUTES, opts = {}) {
  if (!agentName || typeof agentName !== 'string') throw new Error('claimTask needs an agentName')
  const taskPath = await findTaskFile(taskId, opts)   // throws before any lock is made

  const status = getFrontmatterField(await fs.readFile(taskPath, 'utf-8'), 'status')
  if (!CLAIMABLE_STATUSES.includes(status)) {
    console.warn(`[Obsidian] Task ${taskId} has status "${status}", not claimable.`)
    return false
  }

  const dir = locksDir(opts)
  await fs.mkdir(dir, { recursive: true })
  const lockPath = path.join(dir, `${taskId}.lock`)
  const now = nowOf(opts)
  const claimedAt = isoTimestamp(now)

  // 1. Exclusive create atomic lock file ('wx')
  let handle
  try {
    handle = await fs.open(lockPath, 'wx')
    await handle.writeFile(`claimed_by: ${agentName}\nclaimed_at: ${claimedAt}\n`, 'utf-8')
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.warn(`[Obsidian] Task ${taskId} is already locked by another agent.`)
      return false
    }
    throw err
  } finally {
    if (handle) await handle.close()
  }

  // 2. We own the lock: re-read (status may have changed) and write the lease
  try {
    let content = await fs.readFile(taskPath, 'utf-8')
    const statusNow = getFrontmatterField(content, 'status')
    if (!CLAIMABLE_STATUSES.includes(statusNow)) {
      await fs.unlink(lockPath)   // roll back our own just-made lock
      console.warn(`[Obsidian] Task ${taskId} changed to "${statusNow}" before claim; lock rolled back.`)
      return false
    }
    const leaseUntil = isoTimestamp(new Date(now.getTime() + leaseMinutes * 60 * 1000))
    content = setFrontmatterField(content, 'status', 'working')
    content = setFrontmatterField(content, 'claimed_by', `"${agentName}"`)
    content = setFrontmatterField(content, 'claimed_at', claimedAt)
    content = setFrontmatterField(content, 'lease_until', leaseUntil)
    await fs.writeFile(taskPath, content, 'utf-8')
    console.log(`[Obsidian] Claimed task ${taskId} for ${agentName} until ${leaseUntil}`)
    return true
  } catch (err) {
    try { await fs.unlink(lockPath) } catch (_) {}   // roll back our own lock
    throw err
  }
}

/**
 * Heartbeat: extend lease_until to now + leaseMinutes. Only the agent named in
 * claimed_by may do this, only while the task is claimed/working and its lock exists.
 * @param {string} taskId
 * @param {string} agentName
 * @param {{leaseMinutes?: number, vault?: string, now?: Date}} [opts]
 * @returns {Promise<string|false>} new lease_until, or false if not allowed
 */
export async function heartbeat(taskId, agentName, opts = {}) {
  const leaseMinutes = opts.leaseMinutes ?? DEFAULT_LEASE_MINUTES
  const taskPath = await findTaskFile(taskId, opts)
  let content = await fs.readFile(taskPath, 'utf-8')
  const owner = getFrontmatterField(content, 'claimed_by')
  const status = getFrontmatterField(content, 'status')
  if (!agentName || owner !== agentName || !ACTIVE_STATUSES.includes(status)) {
    console.warn(`[Obsidian] Heartbeat refused for ${taskId}: owner "${owner}", status "${status}".`)
    return false
  }
  try { await fs.access(path.join(locksDir(opts), `${taskId}.lock`)) } catch {
    console.warn(`[Obsidian] Heartbeat refused for ${taskId}: no lock file.`)
    return false
  }
  const newLease = isoTimestamp(new Date(nowOf(opts).getTime() + leaseMinutes * 60 * 1000))
  content = setFrontmatterField(content, 'lease_until', newLease)
  await fs.writeFile(taskPath, content, 'utf-8')
  console.log(`[Obsidian] Extended lease for ${taskId} until ${newLease}`)
  return newLease
}

/**
 * Back-compat wrapper (original signature). Prefer heartbeat(taskId, agentName).
 * With opts.agentName it does the full ownership check; without it, it only
 * refuses tasks that are not claimed/working.
 * @param {string} taskId
 * @param {number} [additionalMinutes=30] - lease becomes now + this
 * @param {{agentName?: string, vault?: string, now?: Date}} [opts]
 * @returns {Promise<string|false>}
 */
export async function extendLease(taskId, additionalMinutes = DEFAULT_LEASE_MINUTES, opts = {}) {
  if (opts.agentName) return heartbeat(taskId, opts.agentName, { ...opts, leaseMinutes: additionalMinutes })
  const taskPath = await findTaskFile(taskId, opts)
  let content = await fs.readFile(taskPath, 'utf-8')
  const status = getFrontmatterField(content, 'status')
  if (!ACTIVE_STATUSES.includes(status)) {
    console.warn(`[Obsidian] extendLease refused for ${taskId}: status "${status}".`)
    return false
  }
  const newLease = isoTimestamp(new Date(nowOf(opts).getTime() + additionalMinutes * 60 * 1000))
  content = setFrontmatterField(content, 'lease_until', newLease)
  await fs.writeFile(taskPath, content, 'utf-8')
  console.log(`[Obsidian] Extended lease for ${taskId} until ${newLease}`)
  return newLease
}

/**
 * Finish a task: status review, result link, then release the lock (moved to
 * locks/released/, never deleted). Only Mika sets done.
 * @param {string} taskId
 * @param {string} resultNote - e.g. 'Tasks/Results/T-0001' ([[ ]] and .md optional)
 * @param {{agentName?: string, vault?: string, now?: Date}} [opts]
 *   agentName given -> refuse (throw) if the task is claimed by someone else
 * @returns {Promise<{taskPath: string, releasedTo: string|null}>}
 */
export async function finishTask(taskId, resultNote, opts = {}) {
  const note = String(resultNote || '').trim().replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '')
  if (!note) throw new Error('finishTask needs a resultNote')
  const taskPath = await findTaskFile(taskId, opts)
  let content = await fs.readFile(taskPath, 'utf-8')
  if (opts.agentName) {
    const owner = getFrontmatterField(content, 'claimed_by')
    if (owner && owner !== opts.agentName) {
      throw new Error(`finishTask: ${taskId} is claimed by "${owner}", not "${opts.agentName}"`)
    }
  }
  content = setFrontmatterField(content, 'status', 'review')
  content = setFrontmatterField(content, 'result', `"[[${note}]]"`)
  await fs.writeFile(taskPath, content, 'utf-8')
  const releasedTo = await releaseLock(taskId, opts)
  console.log(`[Obsidian] Task ${taskId} set to review with result [[${note}]]`)
  return { taskPath, releasedTo }
}

/**
 * Release a task lock by moving it to Tasks/locks/released/ (never deletes).
 * If released/<id>.lock already exists (task claimed before), the new one gets
 * a timestamp suffix so history is kept.
 * @param {string} taskId
 * @param {{vault?: string, now?: Date}} [opts]
 * @returns {Promise<string|null>} path it was moved to, or null if no lock
 */
export async function releaseLock(taskId, opts = {}) {
  const lockDir = locksDir(opts)
  const releasedDir = path.join(lockDir, 'released')
  const lockPath = path.join(lockDir, `${taskId}.lock`)
  try { await fs.access(lockPath) } catch {
    console.warn(`[Obsidian] No lock to release for ${taskId}`)
    return null
  }
  await fs.mkdir(releasedDir, { recursive: true })
  let targetPath = path.join(releasedDir, `${taskId}.lock`)
  try {
    await fs.access(targetPath)
    const stamp = isoTimestamp(nowOf(opts)).replace(/:/g, '-')   // ':' is invalid in Windows file names
    targetPath = path.join(releasedDir, `${taskId}.${stamp}.lock`)
  } catch { /* target name is free */ }
  await fs.rename(lockPath, targetPath)
  console.log(`[Obsidian] Released lock for ${taskId} -> released/`)
  return targetPath
}

/**
 * Stale-lease takeover (section 4): only the orchestrator, only when lease_until
 * expired more than 10 min ago. Sets the task back to queued, clears the claim,
 * moves the lock to released/ and logs one line to Logs/orchestrator-activity.md.
 * @param {string} taskId
 * @param {string} agentName - must be 'orchestrator'
 * @param {{vault?: string, now?: Date, graceMinutes?: number}} [opts]
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
export async function takeOverStaleTask(taskId, agentName, opts = {}) {
  if (agentName !== 'orchestrator') return { ok: false, reason: 'only the orchestrator may take over a stale task' }
  const grace = opts.graceMinutes ?? STALE_GRACE_MINUTES
  const now = nowOf(opts)
  const taskPath = await findTaskFile(taskId, opts)
  let content = await fs.readFile(taskPath, 'utf-8')
  const status = getFrontmatterField(content, 'status')
  const lease = getFrontmatterField(content, 'lease_until')
  const owner = getFrontmatterField(content, 'claimed_by')
  if (!ACTIVE_STATUSES.includes(status)) return { ok: false, reason: `status is "${status}", not claimed/working` }
  if (!parseTimestamp(lease)) return { ok: false, reason: 'no valid lease_until' }
  if (!isLeaseStale(lease, now, grace)) return { ok: false, reason: `lease ${lease} not expired by more than ${grace} min` }

  content = setFrontmatterField(content, 'status', 'queued')
  content = setFrontmatterField(content, 'claimed_by', '')
  content = setFrontmatterField(content, 'claimed_at', '')
  content = setFrontmatterField(content, 'lease_until', '')
  await fs.writeFile(taskPath, content, 'utf-8')
  await releaseLock(taskId, opts)
  const logPath = path.join(vaultOf(opts), 'Logs', 'orchestrator-activity.md')
  await fs.mkdir(path.dirname(logPath), { recursive: true })
  await fs.appendFile(logPath,
    `- ${isoTimestamp(now)} takeover ${taskId}: lease ${lease} (claimed_by ${owner || '?'}) expired; set back to queued\n`, 'utf-8')
  console.log(`[Obsidian] Orchestrator took over stale ${taskId}; set back to queued`)
  return { ok: true, reason: `lease ${lease} expired; set back to queued` }
}
