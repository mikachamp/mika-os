# How I built Mika OS (and what I got wrong on the way)

This is the long version. The README is the 30-second one.

## Step 1: a fleet of small agents

I wanted a command centre for my own work: briefings, notes, research, security checks, a builder, and a chat window that routes to the right one. So I wrote a fleet of small Node services and ran them under PM2 on ports 3001 to 3015, with an Electron app on top that deploys them on launch (`npx pm2 start ecosystem.config.cjs`).

Choices I would still make:
- **Context-isolated Electron.** `contextIsolation: true`, `nodeIntegration: false`, and a small, explicit IPC surface in `preload.js`. A frameless window with a tray icon, so it lives in the background.
- **Real telemetry.** The dashboard gauges read Node's `os` module, not made-up numbers.
- **UI and engine apart.** Reloading the UI never kills a job.

## Step 2: it worked, and that was the problem

By late October 2026 I had 15 always-on processes, one laptop GPU, and a nagging feeling. Five of the "expert" agents were the same server with different system prompts. An executive-director loop kept re-reading status files that had not changed. One agent's memory ran away until the host sat at 99% RAM; restarting it brought the machine to 78%.

On **2026-10-24** I agreed a new direction with my lead agent, and we wrote it down as an ADR before touching any code (the rule: notes only until I approve). The decision:

| Before | After |
|---|---|
| orchestrator (always on) | stays, plus a queue poller |
| life-admin, fitness, learning, business, manufacturing, career | domain profile notes (planned: the orchestrator will read them) |
| memory, vault-manager | shared library code |
| researcher, builder | role sub-agents (`researcher`, `web-builder`, `motion-3d-builder`, `app-builder`, `engine-developer`) |
| network-security, it-security, maintenance | run-and-exit scripts |
| offline-llm | on-demand bridge |

The migration is four small, reversible phases: (1) profiles and queue helpers, (2) the orchestrator reads profiles itself behind a `USE_LOCAL_PROFILES` feature flag, (3) scheduled jobs as scripts, (4) retire the redundant daemons. Phase 1 is done: the profile notes exist and the helpers are written. Phase 2 is queued. I am not claiming phases 3 and 4.

## Step 3: one queue, many agents (the operating rules)

On **2026-10-23** I wrote `AGENT_OPERATING_RULES.md`. Its core ideas:

1. **One control centre**, the Obsidian vault.
2. **One file per task.** Never a big shared to-do list.
3. **Claim before working.** Lock file, lease, heartbeat.
4. **Stay inside `touches`.** Need something else? Set `blocked` and say why.
5. **Finish at `review`.** Only I set `done`.
6. **Human gates.** Publishing, sending, pushing, deleting, spending, submitting and security changes are mine.
7. **Never claim it works without running it.**
8. **Facts only from my notes and files.**

Rollout was in phases A to D: notes only first (folders, task files from the backlog, project hubs, a Bases board, graph reports), then backups, then moving projects, then parallel dispatch code. I deliberately did the boring notes phase first so that the system had a shape before it had code.

## Step 4: a role registry

The orchestrator should not hard-code "who does what". `agents/shared/subagent-roles.json` lists each role: what it does, extra reading, a test standard, and whether it can run in parallel. Every task file names one `role:`.

Rules I like:
- More copies of an existing role are free, up to the cap of 3 working tasks.
- A *new* role can be drafted as `status: proposed`, but a proposed role may only do read-only or notes-only work until I approve it once.
- No role can change the common limits or raise the cap. Only I can.

On 2026-10-27 I approved five more roles: `explorer`, `scribe`, `privacy-guard`, `applications`, `git-keeper`. Models are split by job: the lead on Opus, builders and reviewers on Sonnet, the cheap read-only roles on Haiku.

## Step 5: the queue helpers, and the review that found 10 bugs

A lead agent wrote `claimTask`, `heartbeat` and `finishTask` (about 120 lines) without a task file. I reopened that as a proper task and had an `engine-developer` sub-agent review and test it. It found ten problems. The ones that would have hurt:

- Empty frontmatter fields **swallowed the next line**: `\s*` matches a newline, so a fresh claim deleted `claimed_at:` and `result:`.
- Edits ran over the whole file, not just the frontmatter.
- `finishTask` **did not release the lock**, so a finished task could never be claimed again.
- No stale-lease takeover existed at all.
- The heartbeat had **no ownership check**, and with a 10-minute lease and a 10-minute heartbeat it expired exactly when the next one was due. The lease is now 30 minutes from each heartbeat.
- `releaseLock` could overwrite an old released lock, losing history.
- A short id like `T-001` would have matched the file for `T-0010`.

The fix kept the old exports and the same function signatures, added an `opts = { vault, now }` argument so tests can run in a temp folder, and added 18 tests. Highlights: two simultaneous claims via `Promise.all` and exactly one wins; takeover refused at 5 and 10 minutes, allowed at 11; folders with spaces; CRLF preserved. Before and after the run, the real vault's locks and queue were hashed and identical.

Nothing calls the helpers yet. That is the next job, and I would rather say so than imply the queue is fully automatic.

## Step 6: let agents check each other

The standard pipeline is `explorer -> builder -> reviewer -> privacy-guard -> scribe`. The reason is a comparison I wrote on 2026-10-24: one lead (Gemini) finished two writing tasks in about eight minutes, but only checked its own work. A second lead (Claude) was slower but ran sub-agents in parallel and had a separate reviewer check each one.

The review notes on 2026-10-27 proved the point. In one batch, a reviewer found that:
- a Mika OS write-up named the wrong Electron major version;
- one case study's claims had no source file;
- the ADR said 14 agents and listed 15;
- a "done" test was marked as met when the result did not meet it.

Each went back to the builder. That is the system working, not failing.

## Step 7: two leads, one queue

I use more than one AI lead (Claude, Gemini). Rule: **the lock file decides who owns a task**; never work on a task whose lock exists. Max 3 `working` tasks across both leads. When tasks edit existing files, the sub-agent works on a copy in a `_worktrees/` folder and it only goes back after I approve. A multi-lead lock sounds fancy; it is `fs.open(path, 'wx')`.

## Step 8: naming

I forced plain English into task titles (no "Phase 2" without saying what it does) and chose a public name, **Mika OS**. The old name, CHAMP OS, survives in a few folder names so nothing breaks.

## Lessons

- **Markdown is a good message bus** when humans must read it too. No schema migrations, and git shows every change.
- **Ephemeral workers beat idle daemons** for knowledge work.
- **Review catches more than tests.** Reviewers found factual drift, wrong versions and bad counts that no test would have.
- **Write the ADR first.** Cheap to change, expensive to rewrite.
- **Small and reversible.** Every migration phase has a rollback.
- **State what isn't done.** Phase 2 onward is not shipped, and the README says so.

## Tools

Electron 31 and `three` 0.186 (`app/package.json`), Node.js, Express, PM2, Obsidian (with Bases), LM Studio / llama.cpp for local models, Gemini and Claude for cloud, headless Chrome with `puppeteer-core` for tests.
