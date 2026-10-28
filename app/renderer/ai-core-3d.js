// ai-core-3d.js — Mika OS AI Core: a procedurally generated armored AI
// figure, modeled against a private reference render
// (not included in this repo) (amber neon linework, segmented armor,
// open hands). Solid dark surfaces sit under the linework so back-facing
// lines are hidden like a real render, and UnrealBloom supplies the neon glow.
//
// Brightness hierarchy: outline lines are slightly dimmed, while the eyes,
// chest core and joint lights are pushed above 1.0 so the bloom pass makes
// them the clear focal points (as in the reference) instead of glowing evenly.
//
// Interaction: hovering a hand (raycast, not DOM) raises that arm forward,
// palm up, and grows a small knowledge-graph orb out of the palm. Clicking
// the core opens the 3D knowledge graph (handled in renderer.js).
//
// Exposes window.AICore3D = { setActivity(0..1), pause(), resume() }.

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const frame = document.querySelector('.core-3d-frame')
const canvas = document.getElementById('ai-core-3d')

if (canvas && frame) {
  const AMBER = 0xff8a2a
  const GOLD = 0xffc27a
  const HOT = 0xfff0d0

  // Transparent canvas (no scene background) so the figure stands directly on
  // the dashboard's starfield instead of inside a dark circle.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(0, 0.42, 6.7)
  camera.lookAt(0, 0.42, 0)

  scene.add(new THREE.AmbientLight(0x2a1408, 1.2))
  const keyLight = new THREE.PointLight(GOLD, 18, 20)
  keyLight.position.set(2, 3, 4)
  const rimLight = new THREE.PointLight(0xff5a10, 14, 20)
  rimLight.position.set(-3, -1, 2)
  scene.add(keyLight, rimLight)

  // ── Materials & helpers ──────────────────────────────────────────────────
  const fillMat = new THREE.MeshStandardMaterial({
    color: 0x1a0d06, emissive: 0x0a0402, roughness: 0.5, metalness: 0.4,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  })
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(0.82) })
  const seamMat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.45 })
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.5) })
  const eyeMat = new THREE.MeshBasicMaterial({ color: HOT })

  // Solid dark body + amber crease lines — the "neon wireframe over armor" look.
  function part(geo, threshold = 25) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(geo, fillMat))
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, threshold), lineMat))
    return g
  }
  function plate(points, depth = 0.05) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
    return part(new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1
    }), 30)
  }
  const hex = (w, h, cut = 0.25) => [
    [-w / 2 + w * cut, h / 2], [w / 2 - w * cut, h / 2], [w / 2, 0],
    [w / 2 - w * cut, -h / 2], [-w / 2 + w * cut, -h / 2], [-w / 2, 0]
  ]
  function at(obj, x, y, z, rx = 0, ry = 0, rz = 0) {
    obj.position.set(x, y, z)
    obj.rotation.set(rx, ry, rz)
    return obj
  }
  function ringLine(r, mat = lineMat, segs = 16) {
    const pts = []
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
    }
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat)
  }
  const glowBox = (w, h, d = 0.015) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMat)

  const rig = new THREE.Group()
  scene.add(rig)
  const body = new THREE.Group()
  rig.add(body)
  const chest = new THREE.Group() // scaled gently for the idle "breathing"
  body.add(chest)

  // ── Torso: broad V chest → defined waist → hips (shorter than before) ────
  const torsoGeo = new THREE.LatheGeometry(
    [[0.2, 1.12], [0.72, 1.02], [0.92, 0.74], [0.84, 0.3], [0.56, -0.18], [0.5, -0.48], [0.6, -0.78], [0.36, -1.1], [0.1, -1.2]]
      .map(([x, y]) => new THREE.Vector2(x, y)),
    10
  )
  torsoGeo.scale(1, 1, 0.58)
  chest.add(part(torsoGeo, 25))

  for (const s of [-1, 1]) {
    // Pectoral plates following the chest curve
    const pec = plate([[0.05, 0.98], [0.55, 1.0], [0.8, 0.78], [0.72, 0.42], [0.42, 0.3], [0.05, 0.36]])
    pec.scale.x = s
    chest.add(at(pec, 0, 0, 0.47, 0, s * 0.3, 0))

    // Chest circuitry — light dashes branching off the sternum
    ;[[0.68, 0.3], [0.62, 0.2], [0.56, 0.12]].forEach(([y, w]) => {
      chest.add(at(glowBox(w, 0.011), s * (0.1 + w / 2), y, 0.55 - (0.1 + w / 2) * 0.3, 0, s * 0.3, 0))
    })

    // Angled hexagonal ab plates, narrowing toward the waist
    ;[[0.06, 0.25, 0.2, 0.42], [-0.17, 0.22, 0.19, 0.35], [-0.39, 0.19, 0.17, 0.31]].forEach(([y, w, h, z]) => {
      const ab = plate(hex(w, h), 0.045)
      chest.add(at(ab, s * 0.14, y, z, 0, s * 0.2, s * -0.06))
    })

    // Side-rib seams
    ;[0.2, 0.0, -0.2].forEach((y, i) => {
      const seg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(s * (0.5 - i * 0.04), y + 0.05, 0.3),
        new THREE.Vector3(s * (0.72 - i * 0.07), y - 0.06, 0.1)
      ])
      chest.add(new THREE.Line(seg, seamMat))
    })

    // Chunky shoulder armour + outward-facing joint light
    const pauldronGeo = new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
    pauldronGeo.scale(1, 0.72, 0.9)
    body.add(at(part(pauldronGeo, 18), s * 1.0, 0.98, 0, 0, 0, s * -0.4))
    const capGeo = new THREE.SphereGeometry(0.3, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.45)
    capGeo.scale(1, 0.6, 0.85)
    body.add(at(part(capGeo, 18), s * 1.06, 1.08, 0, 0, 0, s * -0.4))
    body.add(at(new THREE.Mesh(new THREE.RingGeometry(0.07, 0.11, 16), glowMat), s * 1.22, 0.84, 0, 0, s * Math.PI / 2, 0))
    body.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), eyeMat), s * 1.225, 0.84, 0, 0, s * Math.PI / 2, 0))
  }

  // Sternum light + glowing hex chest core — the main body focal point
  chest.add(at(glowBox(0.045, 0.4, 0.02), 0, 0.77, 0.58))
  chest.add(at(new THREE.Mesh(new THREE.RingGeometry(0.065, 0.1, 6), glowMat), 0, 0.5, 0.56))
  chest.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.055, 6), eyeMat), 0, 0.5, 0.565))

  // Belt seam + pelvis shield
  const belt = ringLine(0.5, seamMat, 20)
  belt.scale.set(1, 1, 0.58)
  chest.add(at(belt, 0, -0.5, 0))
  chest.add(at(plate([[-0.46, -0.6], [0.46, -0.6], [0.42, -0.86], [0.14, -1.14], [-0.14, -1.14], [-0.42, -0.86]]), 0, 0, 0.3, 0.1, 0, 0))
  chest.add(at(new THREE.Mesh(new THREE.RingGeometry(0.035, 0.06, 6), glowMat), 0, -0.82, 0.39))

  // ── Neck & head ──────────────────────────────────────────────────────────
  body.add(at(part(new THREE.CylinderGeometry(0.15, 0.2, 0.26, 8), 25), 0, 1.2, 0))
  ;[[1.12, 0.2], [1.2, 0.18], [1.28, 0.17]].forEach(([y, r]) => body.add(at(ringLine(r), 0, y, 0)))
  for (const s of [-1, 1]) {
    body.add(at(part(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), 25), s * 0.11, 1.22, 0.1, 0, 0, s * 0.25))
  }

  const head = new THREE.Group()
  head.position.set(0, 1.66, 0)
  head.scale.setScalar(1.3)
  body.add(head)

  const skullGeo = new THREE.SphereGeometry(0.36, 10, 8)
  skullGeo.scale(0.84, 1.1, 0.95)
  head.add(part(skullGeo, 10))
  // Seam over the top of the skull, front to back
  const crest = ringLine(0.365, seamMat, 24)
  crest.scale.set(1.1, 1, 0.95)
  head.add(at(crest, 0, 0, 0, 0, 0, Math.PI / 2))
  // Face plate, cheek plates, brow and jaw lights
  head.add(at(plate([[-0.22, 0.2], [0.22, 0.2], [0.26, 0.0], [0.18, -0.24], [0.07, -0.38], [-0.07, -0.38], [-0.18, -0.24], [-0.26, 0.0]], 0.05), 0, -0.02, 0.3))
  for (const s of [-1, 1]) {
    const cheek = plate([[0, 0.06], [0.11, 0.02], [0.1, -0.13], [0, -0.17]], 0.03)
    cheek.scale.x = s
    head.add(at(cheek, s * 0.15, -0.07, 0.32, 0, s * 0.5, 0))

    const eye = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(
      [[-0.07, 0.015], [0.05, 0.025], [0.075, -0.01], [-0.05, -0.025]].map(([x, y]) => new THREE.Vector2(x, y))
    )), eyeMat)
    eye.scale.x = s
    head.add(at(eye, s * 0.105, 0.05, 0.372))

    head.add(at(part(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12).rotateZ(Math.PI / 2), 25), s * 0.31, 0, -0.02))
    head.add(at(new THREE.Mesh(new THREE.RingGeometry(0.04, 0.065, 12), glowMat), s * 0.365, 0, -0.02, 0, s * Math.PI / 2, 0))
  }
  head.add(at(glowBox(0.26, 0.01, 0.005), 0, 0.12, 0.355))
  head.add(at(new THREE.Mesh(new THREE.RingGeometry(0.035, 0.06, 6), glowMat), 0, 0.25, 0.31, -0.3, 0, 0))
  head.add(at(glowBox(0.1, 0.008, 0.005), 0, -0.2, 0.37))

  // ── Knowledge orb — a tiny node graph that grows out of the palm ─────────
  function buildOrb() {
    const g = new THREE.Group()
    const N = 26
    const R = 0.2
    const pts = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const a = i * 2.39996
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(R * (0.85 + Math.random() * 0.3)))
    }
    const seg = []
    pts.forEach((p, i) => {
      pts.map((q, j) => ({ j, d: p.distanceTo(q) }))
        .filter(o => o.j > i).sort((a, b) => a.d - b.d).slice(0, 2)
        .forEach(o => seg.push(p, pts[o.j]))
    })
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg),
      new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.75 })))
    g.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.PointsMaterial({ color: HOT, size: 0.035 })))
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), eyeMat))
    g.scale.setScalar(0.001)
    return g
  }

  // ── Arms: shoulder → elbow → wrist → hand, each a pivot group ────────────
  function buildHand(s) {
    const hand = new THREE.Group()
    hand.add(at(part(new THREE.BoxGeometry(0.3, 0.3, 0.08), 20), 0, -0.17, 0))
    hand.add(at(new THREE.Mesh(new THREE.RingGeometry(0.03, 0.055, 12), glowMat), 0, -0.17, 0.046))
    const fingers = []
    ;[0.25, 0.3, 0.28, 0.22].forEach((len, i) => {
      const base = at(new THREE.Group(), -0.112 + 0.075 * i, -0.32, 0, 0, 0, (i - 1.5) * 0.09)
      base.add(at(part(new THREE.BoxGeometry(0.055, len * 0.55, 0.055), 20), 0, -len * 0.27, 0))
      const knuckle = at(new THREE.Group(), 0, -len * 0.55, 0)
      knuckle.add(at(part(new THREE.BoxGeometry(0.048, len * 0.45, 0.048), 20), 0, -len * 0.22, 0))
      base.add(knuckle)
      hand.add(base)
      fingers.push(knuckle)
    })
    // Thumb sits laterally (palm-forward pose)
    const thumb = at(new THREE.Group(), s * 0.15, -0.07, 0.02, 0, 0, s * 0.75)
    thumb.add(at(part(new THREE.BoxGeometry(0.06, 0.15, 0.06), 20), 0, -0.07, 0))
    thumb.add(at(part(new THREE.BoxGeometry(0.052, 0.12, 0.052), 20), 0, -0.19, 0, 0, 0, s * -0.3))
    hand.add(thumb)
    return { hand, fingers }
  }

  function buildArm(s) {
    const upper = at(new THREE.Group(), s * 1.0, 0.86, 0)
    upper.add(part(new THREE.SphereGeometry(0.19, 10, 8), 25))
    upper.add(at(part(new THREE.CylinderGeometry(0.19, 0.15, 0.72, 8), 25), 0, -0.44, 0))
    upper.add(at(part(new THREE.BoxGeometry(0.15, 0.4, 0.06), 20), 0, -0.42, 0.17))
    upper.add(at(glowBox(0.022, 0.32, 0.022), s * 0.19, -0.44, 0))

    const elbow = at(new THREE.Group(), 0, -0.84, 0)
    upper.add(elbow)
    elbow.add(part(new THREE.SphereGeometry(0.15, 10, 8), 25))
    elbow.add(at(new THREE.Mesh(new THREE.RingGeometry(0.045, 0.07, 12), glowMat), s * 0.155, 0, 0, 0, s * Math.PI / 2, 0))
    elbow.add(at(part(new THREE.CylinderGeometry(0.17, 0.12, 0.74, 8), 25), 0, -0.42, 0))
    elbow.add(at(part(new THREE.BoxGeometry(0.13, 0.46, 0.06), 20), 0, -0.38, 0.15))
    elbow.add(at(glowBox(0.026, 0.38, 0.015), 0, -0.4, 0.19))
    elbow.add(at(part(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 10), 25), 0, -0.78, 0))

    const wrist = at(new THREE.Group(), 0, -0.84, 0)
    elbow.add(wrist)
    const { hand, fingers } = buildHand(s)
    wrist.add(hand)

    const orb = buildOrb()
    orb.position.set(0, -0.2, 0.38)
    hand.add(orb)

    // Invisible pick targets: palm + where the orb appears
    const pickMat = new THREE.MeshBasicMaterial({ visible: false })
    const engage = at(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), pickMat), 0, -0.2, 0)
    const orbHit = at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), pickMat), 0, -0.2, 0.38)
    engage.userData.side = s
    orbHit.userData.side = s
    hand.add(engage, orbHit)

    body.add(upper)
    return { s, upper, elbow, wrist, fingers, orb, engage, orbHit, level: 0, hold: null }
  }

  const arms = [buildArm(-1), buildArm(1)]

  // Rest pose matches the reference (arms out and down, palms forward);
  // reach raises the arm forward with the palm turned up to present the orb.
  const REST = { sx: -0.1, sz: 0.34, ex: -0.22, wx: 0.05, curl: 0.12 }
  const REACH = { sx: -1.05, sz: 0.2, ex: -0.75, wx: 0.45, curl: 0.35 }
  const mix = (a, b, k) => a + (b - a) * k

  function poseArm(arm, k) {
    arm.upper.rotation.set(mix(REST.sx, REACH.sx, k), 0, arm.s * mix(REST.sz, REACH.sz, k))
    arm.elbow.rotation.x = mix(REST.ex, REACH.ex, k)
    arm.wrist.rotation.x = mix(REST.wx, REACH.wx, k)
    arm.fingers.forEach(f => { f.rotation.x = mix(REST.curl, REACH.curl, k) })
    arm.orb.scale.setScalar(Math.max(0.001, k))
  }

  // A "hold" zone spanning both the resting hand and the raised orb, so the
  // arm doesn't drop back the instant it moves out from under the cursor.
  const tmpA = new THREE.Vector3()
  const tmpB = new THREE.Vector3()
  arms.forEach(arm => {
    poseArm(arm, 0)
    rig.updateMatrixWorld(true)
    arm.engage.getWorldPosition(tmpA)
    poseArm(arm, 1)
    rig.updateMatrixWorld(true)
    arm.orbHit.getWorldPosition(tmpB)
    poseArm(arm, 0)
    const hold = new THREE.Mesh(
      new THREE.SphereGeometry(tmpA.distanceTo(tmpB) / 2 + 0.4, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    hold.position.copy(tmpA).add(tmpB).multiplyScalar(0.5)
    hold.userData.side = arm.s
    rig.add(hold)
    arm.hold = hold
  })

  // ── Holographic scan line — sweeps head-to-hip every few seconds ─────────
  const scanMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(GOLD).multiplyScalar(1.3), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.018), scanMat)
  scan.position.z = 0.75
  rig.add(scan)
  const SCAN_PERIOD = 6.5
  const SCAN_SWEEP = 2.6

  // ── Ambient dust ─────────────────────────────────────────────────────────
  const DUST = 220
  const dustPos = new Float32Array(DUST * 3)
  for (let i = 0; i < DUST; i++) {
    const r = 2.4 + Math.random() * 1.8
    const a = Math.random() * Math.PI * 2
    dustPos[i * 3] = Math.cos(a) * r
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 5
    dustPos[i * 3 + 2] = Math.sin(a) * r - 1
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: AMBER, size: 0.02, transparent: true, opacity: 0.6 }))
  scene.add(dust)

  // ── Post-processing ──────────────────────────────────────────────────────
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(380, 380, { type: THREE.HalfFloatType, samples: 4 }))
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(380, 380), 0.6, 0, 0.26)
  // Keep only the tight blur levels — the widest ones smear an orange haze
  // over the whole frame instead of a neon glow hugging the lines.
  bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.7, 0.25, 0.0, 0.0]
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  function resize() {
    const w = frame.clientWidth || 380
    const h = frame.clientHeight || 380
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloom.resolution.set(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(frame)
  resize()

  // ── Pointer: head follows the cursor, raycast picks hands ────────────────
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hovered = 0 // -1 left hand, 1 right hand, 0 none
  let lookX = 0
  let lookY = 0

  function sideHit(objs) {
    const hits = raycaster.intersectObjects(objs, false)
    return hits.length ? hits[0].object.userData.side : 0
  }

  frame.addEventListener('mousemove', (e) => {
    const rect = frame.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    lookX = nx
    lookY = ny

    pointer.set(nx, -ny)
    raycaster.setFromCamera(pointer, camera)
    if (hovered && sideHit([arms[hovered < 0 ? 0 : 1].hold]) !== hovered) hovered = 0
    if (!hovered) hovered = sideHit(arms.flatMap(a => [a.engage, a.orbHit]))
    frame.style.cursor = hovered ? 'pointer' : ''
  })
  frame.addEventListener('mouseleave', () => {
    hovered = 0
    lookX = 0
    lookY = 0
  })

  // ── Animation loop ───────────────────────────────────────────────────────
  let activity = 0.3
  let running = false
  let frameId = null
  let t = 0

  function tick() {
    if (!running) return
    try {
      t += 0.016

      let preview = 0
      arms.forEach(arm => {
        arm.level += ((hovered === arm.s ? 1 : 0) - arm.level) * 0.08
        poseArm(arm, arm.level)
        arm.orb.rotation.y += 0.02
        arm.orb.rotation.x = Math.sin(t * 0.7) * 0.3
        preview = Math.max(preview, arm.level)
      })

      // Idle life: slow breathing in the chest, slight float, head drift
      const breath = Math.sin(t * 1.1) * 0.012
      chest.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath)
      body.position.y = Math.sin(t * 1.2) * 0.015
      head.rotation.y += (lookX * 0.35 + Math.sin(t * 0.4) * 0.05 - head.rotation.y) * 0.06
      head.rotation.x += (lookY * 0.18 - head.rotation.x) * 0.06
      rig.rotation.y += (lookX * 0.12 - rig.rotation.y) * 0.04

      // Scan line sweep
      const phase = t % SCAN_PERIOD
      if (phase < SCAN_SWEEP) {
        const k = phase / SCAN_SWEEP
        scan.position.y = 2.35 - k * 3.75
        scanMat.opacity = Math.sin(k * Math.PI) * 0.55
      } else {
        scanMat.opacity = 0
      }

      // Eyes + chest core pulse together and flare while a hand is raised
      const eye = 1.05 + Math.sin(t * 2.2) * 0.12 + preview * 0.45
      eyeMat.color.setRGB(1 * eye, 0.94 * eye, 0.82 * eye)
      bloom.strength = 0.68 + activity * 0.2 + preview * 0.3

      keyLight.position.x = 2 + Math.sin(t * 0.4) * 0.8
      rimLight.position.x = -3 + Math.cos(t * 0.35) * 0.8
      dust.rotation.y += 0.0008

      composer.render()
      frameId = requestAnimationFrame(tick)
    } catch (err) {
      // A decorative scene must never take the dashboard down.
      console.error('AI Core render failed:', err)
      running = false
    }
  }

  function pause() {
    running = false
    if (frameId) cancelAnimationFrame(frameId)
    frameId = null
  }

  function resume() {
    if (running) return
    running = true
    tick()
  }

  resume()

  window.AICore3D = {
    setActivity: (level) => { activity = Math.max(0, Math.min(1, level)) },
    pause,
    resume
  }
}
