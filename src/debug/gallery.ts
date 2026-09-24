// Page de debug : affiche chaque modèle du kit sur une grille, avec son nom,
// une flèche +Z (rouge) pour repérer l'orientation d'origine et une tuile 1x1.
// Avec ?mobilier : le mobilier fait main (src/furniture/), animé.
import * as THREE from 'three'
import { preload, station, STATION_MODELS } from '../assets'
import { buildFurniture, CUSTOM_MODELS, tickFurniture, type CustomModel } from '../furniture'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(devicePixelRatio)
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1b1d2a')
scene.add(new THREE.HemisphereLight('#ffffff', '#444466', 2))
const sun = new THREE.DirectionalLight('#ffffff', 2)
sun.position.set(5, 10, 3)
scene.add(sun)

const params = new URLSearchParams(location.search)
const COLS = +(params.get('cols') ?? 8)
const ZOOM = +(params.get('zoom') ?? 12)
const aspect = innerWidth / innerHeight
const cam = new THREE.OrthographicCamera(-ZOOM * aspect, ZOOM * aspect, ZOOM, -ZOOM, -100, 100)
cam.position.set(params.has('back') ? -1 : 1, 1, params.has('back') ? -1 : 1).multiplyScalar(20)
cam.lookAt(0, 0, 0)

function label(text: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 48
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.font = '22px sans-serif'; g.textAlign = 'center'
  g.fillText(text, 128, 32)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
  s.scale.set(2.4, 0.45, 1)
  return s
}

await preload([], () => {})
const only = params.get('only')
const custom = params.has('mobilier')
const models: string[] = only ? only.split(',') : custom ? [...CUSTOM_MODELS] : [...STATION_MODELS]
const updates: ((t: number) => void)[] = []
const rows = Math.ceil(models.length / COLS)
models.forEach((name, i) => {
  const x = (i % COLS) * 2.2 - COLS * 1.1
  const z = Math.floor(i / COLS) * 2.2 - rows * 1.1
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#3a3f5c' }))
  tile.rotation.x = -Math.PI / 2
  tile.position.set(x, -0.01, z)
  scene.add(tile)
  if (custom) {
    const f = buildFurniture(name as CustomModel, params.get('label') ?? undefined, i + 1)
    for (const part of [f.solid, f.live]) {
      if (!part) continue
      part.position.set(x, 0, z)
      scene.add(part)
    }
    if (f.update) updates.push(f.update)
  } else {
    const m = station(name as (typeof STATION_MODELS)[number])
    m.position.set(x, 0, z)
    scene.add(m)
  }
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(x, 0.02, z), 0.8, 0xff3344))
  const l = label(name)
  l.position.set(x + 0.9, 0, z + 0.9)
  scene.add(l)
})
const clock = new THREE.Timer()
function frame() {
  clock.update()
  const t = clock.getElapsed() + 1
  tickFurniture(t)
  for (const u of updates) u(t)
  renderer.render(scene, cam)
  if (updates.length) requestAnimationFrame(frame)
}
frame()
