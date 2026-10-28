// knowledge-graph-3d.js — the vault as an explorable 3D graph.
// Implements KNOWLEDGE_BASE_3D_NETWORK_CONCEPT.md: every node is a real note,
// edges are real [[wikilinks]], node size = link count, colour = folder, and
// Home sits at the centre as the core. The layout is solved once before the
// first frame (no live physics, so nothing ever jitters), then idles with a
// slow orbit and a gentle per-node bob.
//
// Exposes window.KnowledgeGraph3D = { open(focusPath?), close() }.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

const overlay = document.getElementById('kg-overlay')
const stage = document.getElementById('kg-stage')

const FOLDER_COLORS = {
  Root: '#ffd9a0', MOCs: '#ffb547', Projects: '#4fc3f7', Notes: '#8b9dff', Agents: '#3ecf8e',
  System: '#00d4ff', Skills: '#c084fc', MCP: '#f472b6', Tasks: '#facc15', Templates: '#94a3b8', Logs: '#6b7f99',
  CodeGraph: '#10b981'
}
const EXTRA_COLORS = ['#fb923c', '#2dd4bf', '#a3e635', '#e879f9', '#38bdf8']
const HUB_DEGREE = 7       // notes with this many links always show their label
const CORE_NAME = 'home'   // the vault's natural root sits at the centre

if (overlay && stage) {
  // ── Renderer, scene, camera ─────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  stage.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.className = 'kg-labels'
  stage.appendChild(labelRenderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x05070d, 0.012)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 3
  controls.maxDistance = 45
  controls.autoRotateSpeed = 0.35

  const haloTexture = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.25, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()
  const sphereGeo = new THREE.SphereGeometry(1, 20, 16)
  const pickGeo = new THREE.SphereGeometry(1, 8, 6)
  const pickMat = new THREE.MeshBasicMaterial({ visible: false })

  // Graph state (rebuilt on every open so it reflects the vault right now)
  let graphGroup = null
  let nodes = []          // { note, color, degree, r, base, pos, phase, mesh, halo, pick, label, neighbors:Set }
  let byPath = new Map()
  let baseEdges = null
  let focusEdges = null
  let hovered = null
  let selected = null
  let includeCode = false // generated code-map folders (graphify) are hidden until toggled on
  let query = ''
  let running = false
  let frameId = null
  let tween = null
  let frameCount = 0
  const clock = new THREE.Clock()

  const colorFor = (() => {
    const extra = new Map()
    return (cat) => FOLDER_COLORS[cat] || extra.get(cat) || (extra.set(cat, EXTRA_COLORS[extra.size % EXTRA_COLORS.length]), extra.get(cat))
  })()
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

  // ── Layout: solve once, up front ──────────────────────────────────────────
  function solveLayout(list, links, coreIndex) {
    const n = list.length
    const cats = [...new Set(list.map(x => x.note.category))]
    const catDir = new Map(cats.map((c, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / cats.length)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      return [c, new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))]
    }))
    const pos = list.map(x => catDir.get(x.note.category).clone().multiplyScalar(4 + Math.random() * 2)
      .add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)))
    const vel = list.map(() => new THREE.Vector3())
    if (coreIndex >= 0) pos[coreIndex].set(0, 0, 0)

    const d = new THREE.Vector3()
    const centroid = new Map()
    // All-pairs repulsion is O(n²) per step: keep the full 420 steps for a normal vault,
    // scale down when the code maps are shown (~1,200 notes) so opening stays near-instant
    const STEPS = n <= 300 ? 420 : Math.max(110, Math.round(420 * 300 / n))
    for (let step = 0; step < STEPS; step++) {
      const alpha = 1 - step / STEPS
      // Repulsion (all pairs) — plain arithmetic, no Vector3 calls in the hot loop
      const k = 0.9 * alpha
      for (let i = 0; i < n; i++) {
        const pi = pos[i], vi = vel[i], xi = pi.x, yi = pi.y, zi = pi.z
        let ax = 0, ay = 0, az = 0
        for (let j = i + 1; j < n; j++) {
          const pj = pos[j], dx = xi - pj.x, dy = yi - pj.y, dz = zi - pj.z
          const dist2 = Math.max(dx * dx + dy * dy + dz * dz, 0.09)
          const f = k / (dist2 * Math.sqrt(dist2))
          const fx = dx * f, fy = dy * f, fz = dz * f, vj = vel[j]
          ax += fx; ay += fy; az += fz
          vj.x -= fx; vj.y -= fy; vj.z -= fz
        }
        vi.x += ax; vi.y += ay; vi.z += az
      }
      // Springs along real links
      for (const [a, b] of links) {
        d.subVectors(pos[b], pos[a])
        const dist = d.length() || 0.001
        d.multiplyScalar(((dist - 2.6) / dist) * 0.05 * alpha)
        vel[a].add(d)
        vel[b].sub(d)
      }
      // Folder cohesion + gentle gravity so unlinked notes still cluster
      centroid.clear()
      list.forEach((x, i) => {
        const c = centroid.get(x.note.category) || { sum: new THREE.Vector3(), count: 0 }
        c.sum.add(pos[i]); c.count++
        centroid.set(x.note.category, c)
      })
      list.forEach((x, i) => {
        const c = centroid.get(x.note.category)
        d.copy(c.sum).divideScalar(c.count).sub(pos[i]).multiplyScalar(0.012 * alpha)
        vel[i].add(d)
        vel[i].addScaledVector(pos[i], -0.004 * alpha)
      })
      for (let i = 0; i < n; i++) {
        if (i === coreIndex) { vel[i].set(0, 0, 0); continue }
        vel[i].clampLength(0, 0.6).multiplyScalar(0.82)
        pos[i].add(vel[i])
      }
    }
    return pos
  }

  // ── Build the scene from vault data ─────────────────────────────────────
  function disposeGraph() {
    if (!graphGroup) return
    nodes.forEach(x => { x.mesh.material.dispose(); x.halo.material.dispose(); x.label.element.remove() })
    graphGroup.traverse(o => { if (o.geometry && o.geometry !== sphereGeo && o.geometry !== pickGeo) o.geometry.dispose() })
    scene.remove(graphGroup)
    graphGroup = null
    nodes = []
    byPath = new Map()
  }

  function buildGraph(data) {
    disposeGraph()
    graphGroup = new THREE.Group()
    scene.add(graphGroup)

    const index = new Map(data.nodes.map((n, i) => [n.path, i]))
    const links = data.links.map(l => [index.get(l.source), index.get(l.target)]).filter(([a, b]) => a != null && b != null)
    const degree = data.nodes.map(() => 0)
    links.forEach(([a, b]) => { degree[a]++; degree[b]++ })
    const coreIndex = data.nodes.findIndex(n => n.name.toLowerCase() === CORE_NAME)

    nodes = data.nodes.map((note, i) => ({
      note,
      index: i,
      degree: degree[i],
      isCore: i === coreIndex,
      color: new THREE.Color(i === coreIndex ? '#ffd9a0' : colorFor(note.category)),
      r: i === coreIndex ? 0.6 : Math.min(0.18 + 0.09 * Math.sqrt(degree[i]), 0.55), // capped: code-map hubs have hundreds of links
      phase: Math.random() * Math.PI * 2,
      neighbors: new Set()
    }))
    links.forEach(([a, b]) => { nodes[a].neighbors.add(b); nodes[b].neighbors.add(a) })

    const positions = solveLayout(nodes, links, coreIndex)
    nodes.forEach((x, i) => {
      x.base = positions[i]
      x.pos = positions[i].clone()

      x.mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: x.color, transparent: true }))
      x.mesh.scale.setScalar(x.r)
      x.halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture, color: x.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }))
      x.halo.scale.setScalar(x.r * (x.isCore ? 7 : 4.5))
      x.pick = new THREE.Mesh(pickGeo, pickMat)
      x.pick.scale.setScalar(Math.max(x.r * 2.2, 0.38))
      x.pick.userData.index = i

      const el = document.createElement('div')
      el.className = 'kg-label' + (x.isCore ? ' core' : x.degree >= HUB_DEGREE ? ' hub' : '')
      el.textContent = x.note.title.length > 34 ? `${x.note.title.slice(0, 32).trim()}…` : x.note.title
      el.title = x.note.title
      el.style.setProperty('--kg-color', `#${x.color.getHexString()}`)
      x.label = new CSS2DObject(el)
      x.label.position.set(0, x.r + 0.18, 0)

      x.holder = new THREE.Group()
      x.holder.add(x.mesh, x.halo, x.pick, x.label)
      graphGroup.add(x.holder)
      byPath.set(x.note.path, x)
    })

    // Edges: one dim layer for everything, one bright layer for the focused node
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(links.length * 6), 3))
    baseEdges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
      color: 0x8fb4ff, transparent: true, opacity: 0.22, depthWrite: false
    }))
    baseEdges.userData.links = links
    graphGroup.add(baseEdges)

    const focusGeo = new THREE.BufferGeometry()
    focusGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(links.length * 6), 3))
    focusEdges = new THREE.LineSegments(focusGeo, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
    }))
    focusEdges.userData.links = []
    graphGroup.add(focusEdges)

    // Frame the main cluster, not the outliers — a few unlinked notes drift
    // far out and would otherwise push the camera back until everything is tiny.
    const dists = nodes.map(x => x.base.length()).sort((a, b) => a - b)
    // 80th percentile keeps a small vault framed tight; a big graph (code maps on) needs the camera
    // outside the whole cloud or nearby nodes balloon in front of the lens
    const radius = Math.max(dists[Math.floor(dists.length * (nodes.length > 300 ? 0.97 : 0.8))] || 4, 4)
    const distance = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05
    controls.target.set(0, 0, 0)
    controls.maxDistance = Math.max(45, distance * 1.6) // a fixed limit would clamp big graphs and crop them
    camera.far = Math.max(200, distance * 4); camera.updateProjectionMatrix()
    camera.position.set(0, distance * 0.18, distance)
    controls.autoRotate = true

    renderLegend()
    document.getElementById('kgStats').textContent =
      `${nodes.length} notes · ${links.length} links · ${new Set(nodes.map(x => x.note.category)).size} folders`

    // Code-map toggle: only offered when the vault actually has generated code graphs
    const hiddenCount = Object.values(data.hidden || {}).reduce((a, b) => a + b, 0)
    const shownCode = nodes.filter(x => /CodeGraph$/.test(x.note.category)).length
    const toggle = document.getElementById('kgCodeToggle')
    toggle.hidden = !hiddenCount && !shownCode
    toggle.setAttribute('aria-pressed', String(includeCode))
    document.getElementById('kgCodeLabel').textContent = includeCode ? `Hide code maps (${shownCode})` : `Code maps (${hiddenCount})`
  }

  function renderLegend() {
    const counts = new Map()
    nodes.forEach(x => counts.set(x.note.category, (counts.get(x.note.category) || 0) + 1))
    document.getElementById('kgLegend').innerHTML = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, c]) => `<span><i style="background:${colorFor(cat)}"></i>${cat === 'Root' ? 'Vault root' : cat} <b>${c}</b></span>`)
      .join('')
  }

  // ── Focus / dimming ───────────────────────────────────────────────────────
  function applyFocus() {
    if (!nodes.length) return
    const focus = hovered || selected
    const q = query.trim().toLowerCase()
    const matches = q
      ? new Set(nodes.filter(x => `${x.note.title} ${x.note.name} ${x.note.excerpt}`.toLowerCase().includes(q)).map(x => x.index))
      : null

    nodes.forEach(x => {
      const inFocus = !focus || x === focus || focus.neighbors.has(x.index)
      const inSearch = !matches || matches.has(x.index)
      const lit = inFocus && inSearch
      x.mesh.material.opacity = lit ? 1 : 0.12
      x.halo.material.opacity = lit ? (x === focus ? 1 : 0.7) : 0.06
      x.label.visible = (focus ? inFocus : (matches ? inSearch : (x.isCore || x.degree >= HUB_DEGREE))) && inSearch
      x.label.element.classList.toggle('focus', x === focus)
    })
    baseEdges.material.opacity = focus || matches ? 0.06 : 0.22
    focusEdges.userData.links = focus
      ? baseEdges.userData.links.filter(([a, b]) => a === focus.index || b === focus.index)
      : []
    focusEdges.material.color.copy(focus ? focus.color : new THREE.Color(0xffffff)).lerp(new THREE.Color(0xffffff), 0.35)
  }

  // Screen-space declutter: when labels collide, keep the more important one.
  // Uses opacity (not display) so every label still has a measurable box.
  function declutterLabels() {
    const focus = hovered || selected
    const priority = (x) => (x === focus ? 1e6 : 0) + (x.isCore ? 1e5 : 0) + x.degree
    const kept = []
    nodes
      .filter(x => x.label.visible)
      .sort((a, b) => priority(b) - priority(a))
      .forEach(x => {
        const r = x.label.element.getBoundingClientRect()
        const clash = r.width && kept.some(k => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2)
        x.label.element.classList.toggle('kg-collide', clash)
        if (!clash && r.width) kept.push(r)
      })
  }

  function writeEdges(lines, list) {
    const arr = lines.geometry.attributes.position.array
    list.forEach(([a, b], k) => {
      const pa = nodes[a].pos, pb = nodes[b].pos
      arr.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], k * 6)
    })
    lines.geometry.setDrawRange(0, list.length * 2)
    lines.geometry.attributes.position.needsUpdate = true
  }

  // ── Selection panel + camera fly-to ───────────────────────────────────────
  function select(x, fly = true) {
    selected = x
    controls.autoRotate = !x
    const panel = document.getElementById('kgPanel')
    if (!x) {
      panel.hidden = true
      applyFocus()
      return
    }
    document.getElementById('kgPanelCat').textContent = x.note.category === 'Root' ? 'Vault root' : x.note.category
    document.getElementById('kgPanelCat').style.color = `#${x.color.getHexString()}`
    document.getElementById('kgPanelTitle').textContent = x.note.title
    document.getElementById('kgPanelPath').textContent = x.note.path
    document.getElementById('kgPanelExcerpt').textContent = x.note.excerpt || 'No summary line in this note.'
    const linksEl = document.getElementById('kgPanelLinks')
    linksEl.replaceChildren(...[...x.neighbors]
      .map(i => nodes[i])
      .sort((a, b) => b.degree - a.degree)
      .map(n => {
        const b = document.createElement('button')
        b.className = 'kg-chip'
        b.style.setProperty('--kg-color', `#${n.color.getHexString()}`)
        b.textContent = n.note.title
        b.onclick = () => select(n)
        return b
      }))
    if (!x.neighbors.size) linksEl.innerHTML = '<span class="kg-muted">No links — this note isn\'t referenced yet.</span>'
    panel.hidden = false
    applyFocus()

    if (fly) {
      // Pull back far enough that the node's linked notes stay in frame.
      const spread = [...x.neighbors].reduce((m, i) => Math.max(m, nodes[i].base.distanceTo(x.base)), 0)
      const fit = Math.max(6, (spread / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.9)
      const dir = camera.position.clone().sub(controls.target).normalize()
      tween = {
        t0: clock.getElapsedTime(), dur: 0.9,
        fromCam: camera.position.clone(), toCam: x.base.clone().addScaledVector(dir, fit),
        fromTarget: controls.target.clone(), toTarget: x.base.clone()
      }
    }
  }

  // ── Pointer: hover + click (ignoring drags) ──────────────────────────────
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downAt = null

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(nodes.map(x => x.pick), false)[0]
    return hit ? nodes[hit.object.userData.index] : null
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!nodes.length) return
    const x = pick(e)
    if (x !== hovered) {
      hovered = x
      renderer.domElement.style.cursor = x ? 'pointer' : ''
      applyFocus()
    }
  })
  renderer.domElement.addEventListener('pointerleave', () => {
    if (hovered) { hovered = null; applyFocus() }
  })
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY } })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
    select(pick(e))
  })
  controls.addEventListener('start', () => { controls.autoRotate = false; tween = null })

  // ── Toolbar / panel / keyboard ────────────────────────────────────────────
  const search = document.getElementById('kgSearch')
  search.addEventListener('input', () => { query = search.value; applyFocus() })
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !query.trim()) return
    const q = query.trim().toLowerCase()
    const hit = nodes
      .filter(x => `${x.note.title} ${x.note.name} ${x.note.excerpt}`.toLowerCase().includes(q))
      .sort((a, b) => b.degree - a.degree)[0]
    if (!hit) return
    // Clear the filter so the node's neighbourhood isn't dimmed as non-matches.
    search.value = ''
    query = ''
    select(hit)
  })
  document.getElementById('kgClose').addEventListener('click', close)
  document.getElementById('kgCodeToggle').addEventListener('click', () => {
    includeCode = !includeCode
    open(selected?.note.path)
  })
  document.getElementById('kgPanelClose').addEventListener('click', () => select(null))
  document.getElementById('kgOpenNote').addEventListener('click', () => {
    const path = selected?.note.path
    close()
    if (path) window.showNoteInKnowledgeBase?.(path)
  })
  window.addEventListener('keydown', (e) => {
    if (overlay.hidden || e.key !== 'Escape') return
    if (document.activeElement === search && search.value) { search.value = ''; query = ''; applyFocus(); return }
    if (selected) select(null)
    else close()
  })

  // ── Resize & loop ─────────────────────────────────────────────────────────
  function resize() {
    const w = stage.clientWidth || window.innerWidth
    const h = stage.clientHeight || window.innerHeight
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(stage)

  function tick() {
    if (!running) return
    try {
      const t = clock.getElapsedTime()
      nodes.forEach(x => {
        x.pos.copy(x.base)
        if (!x.isCore) x.pos.y += Math.sin(t * 0.6 + x.phase) * 0.06
        x.holder.position.copy(x.pos)
      })
      if (nodes.length) {
        writeEdges(baseEdges, baseEdges.userData.links)
        writeEdges(focusEdges, focusEdges.userData.links)
        const core = nodes.find(x => x.isCore)
        if (core) core.halo.material.opacity = 0.75 + Math.sin(t * 1.4) * 0.2
      }
      if (tween) {
        const k = easeInOutQuad(Math.min((t - tween.t0) / tween.dur, 1))
        camera.position.lerpVectors(tween.fromCam, tween.toCam, k)
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k)
        if (k >= 1) tween = null
      }
      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
      if (frameCount++ % 4 === 0) declutterLabels()
      frameId = requestAnimationFrame(tick)
    } catch (err) {
      // Never take the app down — stop drawing and say why.
      console.error('Knowledge graph render failed:', err)
      running = false
      document.getElementById('kgStats').textContent = 'Graph failed to render — see console'
    }
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  async function open(focusPath) {
    overlay.hidden = false
    search.value = ''
    query = ''
    hovered = null
    select(null, false)
    resize()
    try {
      document.getElementById('kgStats').textContent = includeCode ? 'Loading vault + code maps…' : 'Loading vault…'
      buildGraph(await window.agentOS.getVaultGraph({ includeCode }))
      applyFocus()
      if (!running) { running = true; tick() }
      const focus = typeof focusPath === 'string' && byPath.get(focusPath)
      if (focus) select(focus)
    } catch (err) {
      console.error('Knowledge graph failed to load:', err)
      document.getElementById('kgStats').textContent = 'Could not load the vault graph'
    }
  }

  function close() {
    overlay.hidden = true
    running = false
    if (frameId) cancelAnimationFrame(frameId)
    frameId = null
    window.AICore3D?.resume()
  }

  window.KnowledgeGraph3D = { open, close }
}
