// Builds the note list + [[wikilink]] graph for the Knowledge Base page and the
// 3D knowledge graph. Plain Node (no Electron) so it can be tested directly.
const fs = require('fs')
const path = require('path')

const SKIP = new Set(['.obsidian'])
const WIKILINK = /\[\[([^\]|#\\]+)/g
// Generated code maps (graphify writes CodeGraph/, …). They outnumber real
// notes ~15:1, so they're left out unless asked for.
const isCodeGraph = (name) => /CodeGraph$/.test(name)

async function countMarkdown(dir) {
  let n = 0
  let entries
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (e.isDirectory()) n += await countMarkdown(path.join(dir, e.name))
    else if (e.name.endsWith('.md')) n++
  }
  return n
}

async function readNotes(vaultPath, includeCode) {
  const notes = [], hidden = {}
  async function walk(dir, topCategory) {
    let entries
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      const category = topCategory || (entry.isDirectory() ? entry.name : 'Root')
      if (entry.isDirectory()) {
        if (!includeCode && isCodeGraph(entry.name)) { hidden[entry.name] = await countMarkdown(full); continue }
        await walk(full, category)
      } else if (entry.name.endsWith('.md')) {
        try {
          const [content, stat] = await Promise.all([fs.promises.readFile(full, 'utf-8'), fs.promises.stat(full)])
          notes.push({ full, category, content, mtime: stat.mtimeMs })
        } catch {}
      }
    }
  }
  await walk(vaultPath, null)
  return { notes, hidden }
}

function describe(vaultPath, note) {
  const id = path.relative(vaultPath, note.full).split(path.sep).join('/')
  const name = path.basename(id, '.md')
  const body = note.content.replace(/^---[\s\S]*?---\s*/, '')
  const heading = body.match(/^#\s+(.+)$/m)
  const title = heading ? heading[1].replace(/[*_`]/g, '').trim() : name
  const prose = body.split('\n').map(l => l.trim()).find(l =>
    l && !/^(#|---|\||>|←|```|<)/.test(l) && l.replace(/[^A-Za-z]/g, '').length > 20)
  const excerpt = (prose || '')
    .replace(/\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
    .replace(/^[-*]\s+/, '')
    .replace(/[*_`]/g, '')
    .slice(0, 220)
  return { id, path: id, name, title, category: note.category, excerpt, mtime: note.mtime }
}

async function buildVaultGraph(vaultPath, { includeCode = false } = {}) {
  const { notes: raw, hidden } = await readNotes(vaultPath, includeCode)
  const nodes = raw.map(n => describe(vaultPath, n))

  // Resolve [[Target]], [[Folder/Target|Alias]], [[Target#Heading]] and the
  // table-escaped [[Target\|Alias]] the way Obsidian does: full path first,
  // then bare note name.
  const byPath = new Map(nodes.map(n => [n.id.replace(/\.md$/, '').toLowerCase(), n.id]))
  const byName = new Map(nodes.map(n => [n.name.toLowerCase(), n.id]))
  const seen = new Set()
  const links = []
  raw.forEach((note, i) => {
    const source = nodes[i].id
    for (const m of note.content.matchAll(WIKILINK)) {
      const key = m[1].trim().replace(/\.md$/, '').toLowerCase()
      const target = byPath.get(key) || byName.get(key.split('/').pop())
      if (!target || target === source) continue
      const pair = [source, target].sort().join('→')
      if (seen.has(pair)) continue
      seen.add(pair)
      links.push({ source, target })
    }
  })

  return { nodes, links, hidden } // hidden: { CodeGraph: 384, … } when code maps are left out
}

module.exports = { buildVaultGraph, isCodeGraph }
