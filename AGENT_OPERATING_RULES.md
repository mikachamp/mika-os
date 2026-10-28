# Agent Operating Rules — one queue, many agents

Created 2026-10-23 (agreed by Mika and Claude). Every agent (Mika OS agents, Antigravity, Claude Code, any other) follows this file.
If anything here conflicts with an older brief, this file wins. Ask Mika if unsure.

## 1. One control centre: the Obsidian vault
Vault: `<workspace>/obsidian` (agents reach it through `agents/shared/obsidian.js`).
- **Project hubs**: `Projects/<Project>.md`, one per project. Frontmatter: `status`, `code` (folder path), `github`, `graph` (link to the Graphify report), `portfolio` (page path), `owner`.
- **Task queue**: `Tasks/Queue/`, ONE FILE PER TASK. Never keep live tasks in one big shared list.
- **Results**: `Tasks/Results/T-xxxx.md` (what was done, files changed, how it was tested, what is left).
- **Graph reports**: `Graphs/<Project>.md` = copy of that repo's `graphify-out/GRAPH_REPORT.md`. Do not export one note per dependency into the vault.
- **Code** lives outside the vault, in `<home>/Projects/<Project>`. Each repo's `AGENTS.md` points to its hub note and says "take tasks only from the vault queue".
- `Tasks/portfolio-projects-backlog.md` is the current human-readable backlog. It is converted into queue files in Phase A below, then becomes a view.

## 2. Task file format (`Tasks/Queue/T-0012 Short title.md`)
```yaml
---
id: T-0012
title: Polish the Example Site hero
project: "[[Example Site]]"
assignee: builder            # agent name, or "mika"
status: queued               # queued | claimed | working | blocked | review | done
priority: 2                  # 1 high · 2 normal · 3 low
depends_on: [T-0010]
touches: [<home>/Projects/example-site/]   # files/folders it may change
done_test: "Opens on a 390 px phone with no sideways scroll; logo and colours in use"
claimed_by:
claimed_at:
lease_until:
result:
created: 2026-10-23
---
What to do, in plain steps. Links to source files.
```

## 3. Rules for every agent
1. Only the **orchestrator** creates and assigns tasks (Mika can too). Agents never invent their own tasks; they may *propose* one in their result note.
2. Take only tasks where `assignee` is you and `status: queued` and every `depends_on` task is `done`.
3. **Claim before working** (see section 4). No claim, no work.
4. Stay inside `touches`. Need to change something else? Set `status: blocked` and explain.
5. Finish = write `Tasks/Results/T-xxxx.md`, set `status: review`, put the link in `result`. Only **Mika** sets `done`.
6. **Human gates — always stop at `review`, never do these yourself:** publishing a site or artifact, sending any message or email, pushing to GitHub, deleting files, spending money, submitting forms or job applications, changing security settings.
7. Never claim something works without running it. Write in the result exactly what you ran and what you saw.
8. Facts about Mika or clients come only from his notes and files. Do not invent numbers, clients or dates.
9. If `Tasks/PAUSE.md` exists, finish your current step, write a result note, and stop.

## 4. Running agents in parallel without collisions
Agents already run side by side under PM2 (`agents/ecosystem.config.cjs`). Parallel is safe only with these rules:
- **Claim lock (atomic)**: create `Tasks/locks/T-xxxx.lock` with exclusive-create (`fs.open(path, 'wx')`). If it already exists, someone else has it: skip. Write agent name + time inside. Then update the task's `claimed_by`, `claimed_at`, `lease_until` (now + 30 min).
- **Heartbeat**: while working, extend `lease_until` every 10 min. A lock whose lease expired more than 10 min ago may be taken over by the orchestrator (it sets the task back to `queued` and logs it).
- **One writer per file**: two tasks whose `touches` overlap must not run at the same time; the orchestrator makes the later one `depends_on` the earlier.
- **Code tasks get their own git worktree and branch**: `git worktree add ../_worktrees/T-xxxx -b task/T-xxxx`. Work and commit there. Merging into main happens only after Mika approves the review.
- **Model capacity is the real limit**: all agents share one LM Studio model on one GPU (default `google/gemma-4-e4b`), so local calls are effectively one at a time. Use a shared semaphore: max **1** concurrent local call (raise only after testing LM Studio's parallel setting), max **3** concurrent cloud (Gemini) calls. More agents than that just queue and time out.
- **Concurrency cap**: at most **3 tasks in `working`** at once across all agents to start with. Raise later if results stay good.
- The orchestrator polls `Tasks/Queue/` every 60 s, dispatches queued tasks to idle agents via their HTTP ports, and writes one line per change to `Logs/orchestrator-activity.md`.

## 5. Rollout order
(Removed from the public copy: it listed private project paths. The phases were: notes only, then backups, then moving projects, then parallel dispatch with lock files.)

## 6. Antigravity parallel mode (added 2026-10-23)
Antigravity's main agent acts as the **lead**; it spawns sub-agents that build different apps/sites at the same time.
Check your Antigravity version first: per InfoWorld's review (19 Oct 2026), Antigravity 2 runs sub-agents in the background, each in its own isolated workspace, and has a **worktree mode** that gives each conversation its own git worktree. If your version lacks it, make the worktrees yourself (`git worktree add ../_worktrees/T-xxxx -b task/T-xxxx`).

**Lead agent rules**
1. Read `Tasks/Queue/`. Pick up to **3** tasks that are `queued`, have their `depends_on` done, and whose `touches` do not overlap.
2. Claim each one (lock file + lease, section 4), then spawn one sub-agent per task.
3. Give each sub-agent: the full task file, the project hub note, this rules file, and its own folder or worktree. One sub-agent = one task = one folder/branch.
4. Different projects (e.g. a shop site vs a blog) can run side by side in their own folders. Two tasks in the same repo always get separate worktrees and branches.
5. Each sub-agent finishes by writing `Tasks/Results/T-xxxx.md`, setting `status: review`, and stopping. No merging, pushing, publishing or deleting.
6. The lead checks each result against its `done_test`, then reports one summary to Mika: what finished, what is blocked, what needs his OK. Mika approves merges.
7. Start at 3 sub-agents. All of them share one model quota, and every result needs review, so more agents mostly create a review queue. Raise the limit only once reviews keep up.
8. Spread big jobs across model providers where possible (Gemini, Claude, GPT in Antigravity), because each bills from its own quota.

## 7. Sub-agent roles (added 2026-10-24)
- Every task file has a `role:` (web-builder, motion-3d-builder, app-builder, engine-developer, case-study-writer, design-librarian, researcher, reviewer, or mika). The lead launches a sub-agent of that role, with the role's reading list, limits and test standard from `agents/shared/subagent-roles.json` (human version: `obsidian/Agents/Sub-Agent Roles.md`).
- **Same role, several targets:** when work covers several apps or websites (or several variants), split it into one task per target with the same role and launch one sub-agent per task in parallel. The cap stays at 3 in `working`. Overlapping `touches` run in sequence.
- **Run mode for now:** Antigravity with Claude and Gemini. The local/offline PM2 agents stay off until Mika says otherwise. The Mika OS orchestrator adopts the same registry in Phase D.
- **New roles:** the lead or orchestrator may add more instances of active roles freely (within the cap). It may draft a *new* role as `status: proposed` in `subagent-roles.json`, which may only do read-only or notes-only work until Mika approves it once. No role can change the common limits or raise the cap.

## 8. Claude sub-agent files and the standard pipeline (added 2026-10-27)
- Each active role in `agents/shared/subagent-roles.json` has a Claude Code agent file in `<workspace>/.claude/agents/<role>.md` (name, description, tools, model, reading list, role rules, test standard, common limits). The JSON stays the single source; regenerate the files when a role changes.
- New roles approved by Mika on 2026-10-27: **explorer** (Haiku, read-only search), **scribe** (Haiku, vault records, status to review), **privacy-guard** (Haiku, read-only check before anything is seen by others), **applications** (Sonnet, job-application drafts, never submits), **git-keeper** (Haiku, backup planner: scans and writes commands for Mika; never commits or pushes, per the common limits).
- **Models:** the lead runs on Opus; builders, reviewer, researcher and applications on Sonnet; explorer, scribe, privacy-guard and git-keeper on Haiku.
- **Standard pipeline per task:** lead reads the queue → explorer → builder role → reviewer → privacy-guard (if anyone else will see the result) → scribe. A failed review goes back to the builder, never to Mika. git-keeper runs on request or weekly, not per task.

## 9. Naming (added 2026-10-27)
- **Task titles must be plain English, saying what changes and why.** Never use "Phase N" or "migration" without saying what it does. Example: "Let the orchestrator answer domain questions itself (behind an off switch)", not "Migration Phase 2".
- **The AI project's public name is Mika OS.** Use it in all new notes, task titles and portfolio text. Keep existing folder and file names (Ai_Agent, app/, mika-os/) as they are.
