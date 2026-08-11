<!-- eslint-disable vue/block-lang -->
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const viewportRef = ref(null)

let renderer
let scene
let camera
let controls
let clock
let resizeObserver
let animationId = 0
let workspace
let screenGlow
const animatedParts = []

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.52,
    metalness: options.metalness ?? 0.2,
    emissive: options.emissive ?? 0x000000,
  })
}

function createLabelTexture(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 180
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'rgba(8, 18, 32, 0.88)'
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)'
  ctx.lineWidth = 5
  ctx.roundRect(16, 16, 608, 148, 24)
  ctx.fill()
  ctx.stroke()

  ctx.font = '600 54px sans-serif'
  ctx.fillStyle = '#e0f2fe'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 320, 92)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeLabel(text, position, scale = [1.3, 0.36, 1]) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createLabelTexture(text),
      transparent: true,
      depthWrite: false,
    }),
  )
  sprite.position.copy(position)
  sprite.scale.set(...scale)
  return sprite
}

function makePanel(title, lines, color) {
  const group = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.08, 1.24),
    mat(0x111827, { roughness: 0.62, metalness: 0.1 }),
  )
  group.add(body)

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.026, 0.12),
    mat(color, { roughness: 0.25, metalness: 0.35, emissive: color === 0xa3e635 ? 0x365314 : 0x082f49 }),
  )
  bar.position.set(0, 0.06, -0.48)
  group.add(bar)

  lines.forEach((line, index) => {
    const row = new THREE.Mesh(
      new THREE.BoxGeometry(line, 0.02, 0.045),
      mat(index % 2 ? 0x64748b : color, { roughness: 0.35, metalness: 0.08, emissive: index % 2 ? 0x000000 : 0x082f49 }),
    )
    row.position.set(-0.78 + line / 2, 0.07, -0.22 + index * 0.19)
    group.add(row)
  })

  group.add(makeLabel(title, new THREE.Vector3(0, 0.38, -0.76), [1.18, 0.32, 1]))
  return group
}

function makePhonePreview() {
  const group = new THREE.Group()

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.16, 2.9),
    mat(0x020617, { roughness: 0.34, metalness: 0.72 }),
  )
  group.add(frame)

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(1.46, 0.18, 2.5),
    mat(0x0f172a, { roughness: 0.24, metalness: 0.24, emissive: 0x07162c }),
  )
  screen.position.y = 0.03
  group.add(screen)

  screenGlow = new THREE.PointLight(0x38bdf8, 2.2, 5)
  screenGlow.position.set(0, 0.35, 0.12)
  group.add(screenGlow)

  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.036, 0.56),
    mat(0x2563eb, { roughness: 0.25, metalness: 0.18, emissive: 0x082f49 }),
  )
  banner.position.set(0, 0.15, 0.72)
  group.add(banner)

  const cards = [
    [-0.36, -0.56, 0x60a5fa],
    [0.36, -0.56, 0xf97316],
    [-0.36, 0.1, 0xa3e635],
    [0.36, 0.1, 0x22d3ee],
  ]
  cards.forEach(([x, z, color]) => {
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.038, 0.34),
      mat(color, { roughness: 0.3, metalness: 0.18, emissive: color === 0xa3e635 ? 0x365314 : 0x082f49 }),
    )
    card.position.set(x, 0.155, z)
    group.add(card)
  })

  group.rotation.x = -0.42
  group.position.set(0, 0.82, 0.04)
  group.add(makeLabel('实时预览', new THREE.Vector3(0, 1.68, -0.18), [1.22, 0.34, 1]))
  return group
}

function makeAssetShelf() {
  const group = new THREE.Group()
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.2, 0.72), mat(0x334155, { roughness: 0.58 }))
  group.add(shelf)

  const assets = [
    ['box', -0.72, 0x38bdf8],
    ['sphere', -0.24, 0xfacc15],
    ['sphere', 0.24, 0xf97316],
    ['box', 0.72, 0xa3e635],
  ]

  assets.forEach(([type, x, color], index) => {
    const geometry = type === 'sphere'
      ? new THREE.SphereGeometry(0.2, 28, 18)
      : new THREE.BoxGeometry(0.36, 0.36, 0.36)
    const mesh = new THREE.Mesh(geometry, mat(color, { roughness: 0.34, metalness: 0.25, emissive: color === 0xa3e635 ? 0x365314 : 0x000000 }))
    mesh.position.set(x, 0.36, 0)
    animatedParts.push({ mesh, type: 'bob', offset: index * 0.45 })
    group.add(mesh)
  })

  group.add(makeLabel('资源库', new THREE.Vector3(0, 0.92, -0.36), [1, 0.3, 1]))
  return group
}

function makeLogicFlow() {
  const group = new THREE.Group()
  const positions = [
    new THREE.Vector3(-0.78, 0.24, -0.16),
    new THREE.Vector3(0, 0.24, 0.24),
    new THREE.Vector3(0.78, 0.24, -0.16),
  ]

  positions.forEach((position, index) => {
    const node = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.28, 0.34),
      mat(index === 1 ? 0xf97316 : 0x22d3ee, { roughness: 0.3, metalness: 0.3, emissive: index === 1 ? 0x431407 : 0x083344 }),
    )
    node.position.copy(position)
    group.add(node)
  })

  for (let index = 0; index < positions.length - 1; index += 1) {
    const curve = new THREE.CatmullRomCurve3([
      positions[index],
      new THREE.Vector3((positions[index].x + positions[index + 1].x) / 2, 0.4, 0.26),
      positions[index + 1],
    ])
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 8), mat(0x38bdf8, { emissive: 0x082f49 })))
  }

  group.add(makeLabel('逻辑编排', new THREE.Vector3(0, 0.86, -0.44), [1.18, 0.32, 1]))
  return group
}

function makePublishPortal() {
  const group = new THREE.Group()

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.92, 0.18, 52), mat(0x1d4ed8, { metalness: 0.45 }))
  pad.position.y = 0.09
  group.add(pad)

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.52, 4), mat(0xfacc15, { emissive: 0x713f12 }))
  arrow.position.y = 0.62
  arrow.rotation.x = Math.PI
  animatedParts.push({ mesh: arrow, type: 'rise', offset: 1.2 })
  group.add(arrow)

  group.add(makeLabel('一键发布', new THREE.Vector3(0, 1.22, -0.3), [1.1, 0.32, 1]))
  return group
}

function createWorkspace() {
  workspace = new THREE.Group()

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.22, 4.8),
    mat(0x334155, { roughness: 0.72, metalness: 0.08 }),
  )
  table.position.y = -0.06
  workspace.add(table)

  const tableEdge = new THREE.Mesh(
    new THREE.BoxGeometry(7.86, 0.14, 5.06),
    mat(0x0f172a, { roughness: 0.56, metalness: 0.2 }),
  )
  tableEdge.position.y = -0.19
  workspace.add(tableEdge)

  workspace.add(makePhonePreview())

  const publish = makePublishPortal()
  publish.position.set(-2.65, 0.1, -1.1)
  workspace.add(publish)

  const assets = makeAssetShelf()
  assets.position.set(2.55, 0.24, -1.18)
  workspace.add(assets)

  const scenePanel = makePanel('场景编辑器', [1.5, 1.15, 1.34, 0.9], 0xa3e635)
  scenePanel.position.set(-2.55, 0.38, 1.25)
  scenePanel.rotation.set(-0.5, 0.24, 0.02)
  workspace.add(scenePanel)

  const promptPanel = makePanel('提示词面板', [1.55, 0.82, 1.32, 1.12], 0x38bdf8)
  promptPanel.position.set(2.58, 0.38, 1.22)
  promptPanel.rotation.set(-0.5, -0.24, -0.02)
  workspace.add(promptPanel)

  const logic = makeLogicFlow()
  logic.position.set(0, 0.22, 1.45)
  workspace.add(logic)

  workspace.rotation.y = Math.PI
  return workspace
}

function createScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07111f)
  scene.fog = new THREE.Fog(0x07111f, 9, 25)

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80)
  camera.position.set(0.45, 3.15, 6.35)

  scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x111827, 1.55))

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.55)
  keyLight.position.set(-4.5, 7, 4.5)
  scene.add(keyLight)

  const cyanLight = new THREE.PointLight(0x38bdf8, 2.15, 9)
  cyanLight.position.set(-3, 2.4, 2.5)
  scene.add(cyanLight)

  const amberLight = new THREE.PointLight(0xf97316, 1.55, 8)
  amberLight.position.set(3.2, 2.1, 1.8)
  scene.add(amberLight)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    mat(0x0b1220, { roughness: 0.86, metalness: 0.04 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.31
  scene.add(floor)

  const grid = new THREE.GridHelper(16, 32, 0x1d4ed8, 0x1f2937)
  grid.position.y = -0.3
  scene.add(grid)

  scene.add(createWorkspace())
}

function applyViewportLayout() {
  if (!viewportRef.value || !renderer || !camera) return

  const { width, height } = viewportRef.value.getBoundingClientRect()
  const isMobile = width < 720

  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.fov = isMobile ? 50 : 42
  camera.position.set(isMobile ? 0.22 : 0.45, isMobile ? 4.65 : 3.15, isMobile ? 8.25 : 6.35)
  camera.updateProjectionMatrix()

  workspace?.scale.setScalar(isMobile ? 0.74 : 1)
  workspace?.position.set(0, isMobile ? -0.06 : 0, isMobile ? 0.28 : 0)

  if (controls) {
    controls.target.set(0, isMobile ? 0.32 : 0.42, isMobile ? 0.18 : 0.05)
    controls.minDistance = isMobile ? 6.2 : 4.8
    controls.maxDistance = isMobile ? 12 : 10
    controls.rotateSpeed = isMobile ? 0.58 : 0.82
    controls.zoomSpeed = isMobile ? 0.65 : 0.9
    controls.update()
  }
}

function animate() {
  animationId = requestAnimationFrame(animate)

  const elapsed = clock.getElapsedTime()
  screenGlow.intensity = 1.85 + Math.sin(elapsed * 2.2) * 0.35

  animatedParts.forEach(({ mesh, type, offset }) => {
    if (type === 'bob') {
      mesh.position.y = 0.36 + Math.sin(elapsed * 1.6 + offset) * 0.08
      mesh.rotation.y += 0.012
    }
    if (type === 'rise') {
      mesh.position.y = 0.62 + Math.sin(elapsed * 1.8 + offset) * 0.12
    }
  })

  controls.update()
  renderer.render(scene, camera)
}

onMounted(async () => {
  await nextTick()

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  viewportRef.value.appendChild(renderer.domElement)

  clock = new THREE.Clock()
  createScene()

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.35
  controls.minPolarAngle = Math.PI * 0.2
  controls.maxPolarAngle = Math.PI * 0.68
  controls.target.set(0, 0.42, 0.05)

  applyViewportLayout()
  resizeObserver = new ResizeObserver(applyViewportLayout)
  resizeObserver.observe(viewportRef.value)

  animate()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  controls?.dispose()

  scene?.traverse((object) => {
    object.geometry?.dispose?.()
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        material.map?.dispose?.()
        material.dispose?.()
      })
    } else {
      object.material?.map?.dispose?.()
      object.material?.dispose?.()
    }
  })
  renderer?.dispose()
})
</script>

<template>
  <main class="fixed inset-0 overflow-hidden bg-[#07111f] text-white">
    <div ref="viewportRef" class="absolute inset-0 touch-none select-none" />

    <section class="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-3 sm:px-7 sm:pt-6">
      <div class="max-w-[620px]">
        <p class="text-xs tracking-[0.2em] text-cyan-200/75">AI 3D 项目模板</p>
        <h1 class="mt-1 text-[clamp(1.35rem,6vw,4rem)] font-semibold leading-none">
          AI 构建工作台
        </h1>
        <p class="mt-3 hidden max-w-[520px] text-sm leading-6 text-slate-200/76 sm:block sm:text-base">
          把提示词、资源库、逻辑编排、场景编辑、实时预览和发布流程放在一个可旋转的 3D 工作台里。
        </p>
      </div>
    </section>

    <section class="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-3 sm:px-7 sm:pb-6">
      <div class="flex items-center justify-between gap-3 text-xs text-slate-200/72 sm:text-sm">
        <span>拖动旋转 · 双指/滚轮缩放</span>
        <span class="hidden rounded-full border border-cyan-300/30 bg-cyan-950/35 px-3 py-1 text-cyan-100 sm:inline">
          移动端全屏适配
        </span>
      </div>
    </section>
  </main>
</template>
