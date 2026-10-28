// Tests for the task-queue helpers in ../obsidian.js (AGENT_OPERATING_RULES.md section 4).
// Every test uses a throw-away vault made with fs.mkdtemp; the real vault is never touched.
// Run from agents/shared:  node --test
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as obsidian from '../obsidian.js'
const {
  VAULT, claimTask, heartbeat, extendLease, finishTask, releaseLock, takeOverStaleTask,
  findTaskFile, isoTimestamp, parseTimestamp, isLeaseStale, getFrontmatterField, setFrontmatterField,
} = obsidian

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ID = 'T-0099'
const NOW = new Date('2026-10-27T20:00:00Z')
const MIN = 60 * 1000
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

const TEMPLATE = `---
id: ${ID}
title: "Test task"
assignee: builder
status: queued
priority: 2
claimed_by:
claimed_at:
lease_until:
result:
created: 2026-10-27
---
Body text. These body lines must never be edited:
status: body-status
result: body-result
`

let root      // mkdtemp dir (name contains spaces to exercise Windows paths)
let vault     // root/vault
let opts

const taskPath = () => path.join(vault, 'Tasks', 'Queue', `${ID} Test task with spaces.md`)
const lockPath = () => path.join(vault, 'Tasks', 'locks', `${ID}.lock`)
const releasedPath = () => path.join(vault, 'Tasks', 'locks', 'released', `${ID}.lock`)
const readTask = () => fs.readFile(taskPath(), 'utf-8')
const exists = p => fs.access(p).then(() => true, () => false)
const field = async k => getFrontmatterField(await readTask(), k)

async function writeTask(content = TEMPLATE) {
  await fs.writeFile(taskPath(), content, 'utf-8')
}

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian tasks test '))
  // safety: the temp vault must not be inside the real vault
  assert.ok(!path.resolve(root).startsWith(path.resolve(VAULT)), 'temp vault must be outside the real vault')
})

after(async () => {
  await fs.rm(root, { recursive: true, force: true })   // only ever the mkdtemp dir
})

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(root, 'vault '))
  await fs.mkdir(path.join(vault, 'Tasks', 'Queue'), { recursive: true })
  opts = { vault, now: NOW }
  await writeTask()
})

// ── existing exports ─────────────────────────────────────────────────────────
test('existing exports still exist and VAULT default is unchanged', async () => {
  for (const name of ['readNote', 'writeNote', 'appendNote', 'readFolder', 'today', 'VAULT']) {
    assert.ok(name in obsidian, `missing export ${name}`)
  }
  assert.match(obsidian.today(), /^\d{4}-\d{2}-\d{2}$/)
  if (!process.env.OBSIDIAN_VAULT_PATH) {
    assert.equal(VAULT, path.join(__dirname, '..', '..', '..', 'obsidian'))
  }
})

// ── timestamps ───────────────────────────────────────────────────────────────
test('timestamps: written as UTC Z without ms; parsing handles Z, +02:00 and quotes', () => {
  assert.equal(isoTimestamp(new Date('2026-10-27T20:21:07.456Z')), '2026-10-27T20:21:07Z')
  assert.equal(parseTimestamp('2026-10-24T02:20:00+02:00').toISOString(), '2026-10-24T00:20:00.000Z')
  assert.equal(parseTimestamp('"2026-10-24T02:20:00+02:00"').toISOString(), '2026-10-24T00:20:00.000Z')
  assert.equal(parseTimestamp('2026-10-23T13:17:12Z').toISOString(), '2026-10-23T13:17:12.000Z')
  assert.equal(parseTimestamp(''), null)
  assert.equal(parseTimestamp(null), null)
  assert.equal(parseTimestamp('not a date'), null)
})

// ── frontmatter helpers ──────────────────────────────────────────────────────
test('frontmatter: empty fields do not swallow the next line; body untouched', () => {
  let c = setFrontmatterField(TEMPLATE, 'claimed_by', '"a"')
  assert.equal(getFrontmatterField(c, 'claimed_by'), 'a')
  assert.equal(getFrontmatterField(c, 'claimed_at'), '')      // still present
  c = setFrontmatterField(c, 'lease_until', 'X')
  assert.equal(getFrontmatterField(c, 'result'), '')          // still present
  c = setFrontmatterField(c, 'new_field', 'y')                // inserted when missing
  assert.equal(getFrontmatterField(c, 'new_field'), 'y')
  assert.ok(c.endsWith('status: body-status\nresult: body-result\n'))
})

test('frontmatter: CRLF files keep CRLF', () => {
  const crlf = TEMPLATE.replace(/\n/g, '\r\n')
  const c = setFrontmatterField(setFrontmatterField(crlf, 'status', 'working'), 'missing', 'z')
  assert.equal(getFrontmatterField(c, 'status'), 'working')
  assert.equal(getFrontmatterField(c, 'missing'), 'z')
  assert.ok(!/[^\r]\n/.test(c), 'no bare LF introduced')
})

// ── Windows paths / findTaskFile ─────────────────────────────────────────────
test('findTaskFile works with spaces in vault path and title; T-001 does not match T-0010', async () => {
  const p = await findTaskFile(ID, opts)
  assert.equal(p, taskPath())
  assert.ok(path.isAbsolute(p))
  if (process.platform === 'win32') assert.ok(p.includes('\\'), 'native Windows separators')
  await fs.writeFile(path.join(vault, 'Tasks', 'Queue', 'T-0010 Other.md'), TEMPLATE)
  await assert.rejects(findTaskFile('T-001', opts), /not found/)
  await assert.rejects(findTaskFile('T-0404', opts), /not found/)
})

// ── claim ────────────────────────────────────────────────────────────────────
test('atomic claim: two simultaneous claims -> exactly one wins; a later claim fails', async () => {
  const results = await Promise.all([
    claimTask(ID, 'agent-a', 30, opts),
    claimTask(ID, 'agent-b', 30, opts),
  ])
  assert.equal(results.filter(Boolean).length, 1)
  const winner = results[0] ? 'agent-a' : 'agent-b'
  assert.equal(await field('claimed_by'), winner)
  assert.equal(await claimTask(ID, 'agent-c', 30, opts), false)
  assert.equal(await field('claimed_by'), winner)
  const lock = await fs.readFile(lockPath(), 'utf-8')
  assert.match(lock, new RegExp(`claimed_by: ${winner}`))
  assert.match(lock, /claimed_at: 2026-10-27T20:00:00Z/)
})

test('claim writes status working, claimed_by, claimed_at, lease_until = now + 30 min', async () => {
  assert.equal(await claimTask(ID, 'agent-a', undefined, opts), true)
  const c = await readTask()
  assert.equal(getFrontmatterField(c, 'status'), 'working')
  assert.equal(getFrontmatterField(c, 'claimed_by'), 'agent-a')
  assert.equal(getFrontmatterField(c, 'claimed_at'), '2026-10-27T20:00:00Z')
  assert.equal(getFrontmatterField(c, 'lease_until'), '2026-10-27T20:30:00Z')
  assert.match(getFrontmatterField(c, 'lease_until'), ISO_Z)
  assert.equal(getFrontmatterField(c, 'result'), '')          // not eaten
  assert.ok(c.endsWith('status: body-status\nresult: body-result\n'), 'body untouched')
})

test('claim inserts lease fields when the task file has none', async () => {
  await writeTask(TEMPLATE.replace('claimed_by:\nclaimed_at:\nlease_until:\n', ''))
  assert.equal(await claimTask(ID, 'agent-a', 30, opts), true)
  assert.equal(await field('claimed_by'), 'agent-a')
  assert.equal(await field('lease_until'), '2026-10-27T20:30:00Z')
})

test('claim refuses tasks that are not queued/claimed and leaves no lock', async () => {
  for (const s of ['review', 'done', 'blocked', 'working']) {
    await writeTask(TEMPLATE.replace('status: queued', `status: ${s}`))
    assert.equal(await claimTask(ID, 'agent-a', 30, opts), false, s)
    assert.equal(await exists(lockPath()), false, s)
  }
})

test('claim of a missing task throws and leaves no lock', async () => {
  await assert.rejects(claimTask('T-0404', 'agent-a', 30, opts), /not found/)
  assert.equal(await exists(path.join(vault, 'Tasks', 'locks', 'T-0404.lock')), false)
})

// ── heartbeat ────────────────────────────────────────────────────────────────
test('heartbeat extends lease_until (owner only, lock required)', async () => {
  await claimTask(ID, 'agent-a', 30, opts)
  const later = new Date(NOW.getTime() + 20 * MIN)
  assert.equal(await heartbeat(ID, 'agent-a', { vault, now: later }), '2026-10-27T20:50:00Z')
  assert.equal(await field('lease_until'), '2026-10-27T20:50:00Z')

  assert.equal(await heartbeat(ID, 'agent-b', { vault, now: later }), false)   // not the owner
  assert.equal(await field('lease_until'), '2026-10-27T20:50:00Z')

  await fs.rename(lockPath(), lockPath() + '.moved')                          // lock gone
  assert.equal(await heartbeat(ID, 'agent-a', { vault, now: later }), false)
})

test('extendLease (back-compat) extends active tasks, refuses queued ones', async () => {
  assert.equal(await extendLease(ID, 30, opts), false)                        // still queued
  await claimTask(ID, 'agent-a', 30, opts)
  const later = new Date(NOW.getTime() + 10 * MIN)
  assert.equal(await extendLease(ID, 30, { vault, now: later }), '2026-10-27T20:40:00Z')
  assert.equal(await extendLease(ID, 30, { vault, now: later, agentName: 'agent-b' }), false)
})

// ── finish ───────────────────────────────────────────────────────────────────
test('finishTask sets review + result link and moves the lock to locks/released/', async () => {
  await claimTask(ID, 'agent-a', 30, opts)
  const r = await finishTask(ID, 'Tasks/Results/T-0099', { ...opts, agentName: 'agent-a' })
  const c = await readTask()
  assert.equal(getFrontmatterField(c, 'status'), 'review')
  assert.equal(getFrontmatterField(c, 'result'), '[[Tasks/Results/T-0099]]')
  assert.match(c, /^result: "\[\[Tasks\/Results\/T-0099\]\]"$/m)
  assert.equal(await exists(lockPath()), false)
  assert.equal(await exists(releasedPath()), true)                            // moved, not deleted
  assert.equal(r.releasedTo, releasedPath())
  assert.ok(c.endsWith('status: body-status\nresult: body-result\n'), 'body untouched')
})

test('finishTask accepts [[link]] / .md forms and refuses another agent', async () => {
  await claimTask(ID, 'agent-a', 30, opts)
  await assert.rejects(finishTask(ID, 'Tasks/Results/T-0099', { ...opts, agentName: 'agent-b' }), /claimed by/)
  assert.equal(await field('status'), 'working')
  assert.equal(await exists(lockPath()), true)
  await finishTask(ID, '[[Tasks/Results/T-0099.md]]', opts)
  assert.equal(await field('result'), '[[Tasks/Results/T-0099]]')
})

test('releaseLock keeps history when released/<id>.lock already exists', async () => {
  await fs.mkdir(path.dirname(releasedPath()), { recursive: true })
  await fs.writeFile(releasedPath(), 'old lock\n')
  await claimTask(ID, 'agent-a', 30, opts)
  const to = await releaseLock(ID, opts)
  assert.equal(await fs.readFile(releasedPath(), 'utf-8'), 'old lock\n')     // not overwritten
  assert.equal(path.basename(to), `${ID}.2026-10-27T20-00-00Z.lock`)          // no ':' (Windows)
  assert.equal(await releaseLock(ID, opts), null)                             // nothing left
})

// ── stale takeover ───────────────────────────────────────────────────────────
test('stale takeover: only orchestrator, only when lease expired > 10 min', async () => {
  await claimTask(ID, 'agent-a', 30, opts)                    // lease 20:30Z
  const at = m => ({ vault, now: new Date(Date.parse('2026-10-27T20:30:00Z') + m * MIN) })

  assert.equal((await takeOverStaleTask(ID, 'agent-b', at(60))).ok, false)   // not orchestrator
  assert.equal((await takeOverStaleTask(ID, 'orchestrator', at(5))).ok, false)
  assert.equal((await takeOverStaleTask(ID, 'orchestrator', at(10))).ok, false) // exactly 10: not yet
  assert.equal(await field('status'), 'working')
  assert.equal(await exists(lockPath()), true)

  const r = await takeOverStaleTask(ID, 'orchestrator', at(11))
  assert.equal(r.ok, true)
  const c = await readTask()
  assert.equal(getFrontmatterField(c, 'status'), 'queued')
  assert.equal(getFrontmatterField(c, 'claimed_by'), '')
  assert.equal(getFrontmatterField(c, 'lease_until'), '')
  assert.equal(await exists(lockPath()), false)
  assert.equal(await exists(releasedPath()), true)
  const log = await fs.readFile(path.join(vault, 'Logs', 'orchestrator-activity.md'), 'utf-8')
  assert.match(log, /takeover T-0099: lease 2026-10-27T20:30:00Z \(claimed_by agent-a\) expired; set back to queued/)

  // task is claimable again
  assert.equal(await claimTask(ID, 'agent-c', 30, at(12)), true)
})

test('stale takeover understands +02:00 leases written by hand', async () => {
  await writeTask(TEMPLATE
    .replace('status: queued', 'status: working')
    .replace('claimed_by:', 'claimed_by: "gemini-lead"')
    .replace('lease_until:', 'lease_until: "2026-10-24T02:20:00+02:00"'))  // = 00:20Z
  await fs.mkdir(path.dirname(lockPath()), { recursive: true })
  await fs.writeFile(lockPath(), 'gemini lead 2026-10-24T01:50:00+02:00\n')
  assert.equal(isLeaseStale('"2026-10-24T02:20:00+02:00"', new Date('2026-10-24T00:29:00Z')), false)
  assert.equal(isLeaseStale('"2026-10-24T02:20:00+02:00"', new Date('2026-10-24T00:31:00Z')), true)
  assert.equal((await takeOverStaleTask(ID, 'orchestrator', { vault, now: new Date('2026-10-24T00:29:00Z') })).ok, false)
  assert.equal((await takeOverStaleTask(ID, 'orchestrator', { vault, now: new Date('2026-10-24T00:31:00Z') })).ok, true)
  assert.equal(await field('status'), 'queued')
})

test('stale takeover refuses tasks without a lease or not active', async () => {
  await writeTask(TEMPLATE.replace('status: queued', 'status: working'))       // empty lease
  assert.equal((await takeOverStaleTask(ID, 'orchestrator', opts)).ok, false)
  await writeTask(TEMPLATE.replace('status: queued', 'status: review').replace('lease_until:', 'lease_until: 2020-01-01T00:00:00Z'))
  assert.equal((await takeOverStaleTask(ID, 'orchestrator', opts)).ok, false)
})
