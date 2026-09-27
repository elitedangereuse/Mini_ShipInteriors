import * as THREE from 'three'
import { station, themes, type StationModel } from '../assets'
import { buildFurniture, disposeFurniture, isCustomModel, type CustomModel } from '../furniture'
import { builderLabel, type CatalogEntry } from './catalog'
import { prepareArtwork } from '../furniture/site'
import { petPreview } from '../pets'

/*
 * Vignettes du catalogue : chaque objet rendu seul, en vue isométrique, dans un petit rendu
 * hors écran (son propre contexte WebGL, libéré une fois la file vidée). Un objet accroché est
 * montré sur un pan de mur. Les images sont gardées en mémoire (une par objet et variante).
 */

const SIZE = 176
const cache = new Map<string, string>()
const waiting = new Map<string, ((url: string) => void)[]>()
const queue: { key: string; entry: CatalogEntry; variant: string | undefined }[] = []

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.OrthographicCamera
let wall: THREE.Mesh
let idle = 0
let running = false

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffe6cc', '#3a2a20', 1.6))
  const sun = new THREE.DirectionalLight('#fff1dd', 2.4)
  sun.position.set(3, 6, 4)
  scene.add(sun)
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50)
  // Pan de mur crème derrière les objets accrochés (le dos des objets est en z = 0).
  wall = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.1), new THREE.MeshLambertMaterial({ color: '#e7d9c2' }))
  wall.position.set(0, 0.5, -0.05)
  scene.add(wall)
}

const corners = Array.from({ length: 8 }, () => new THREE.Vector3())

async function render(entry: CatalogEntry, variant: string | undefined): Promise<string> {
  const preview = entry.model === 'site-art' && variant
    ? await prepareArtwork(variant) : undefined
  // Un panier se montre avec son habitant, dans sa robe.
  const pet = entry.model === 'pet-bed' ? await petPreview(builderLabel(entry, variant)) : null
  if (!renderer) setup()
  const holder = new THREE.Group()
  const custom = isCustomModel(entry.model)
  if (custom) {
    const f = buildFurniture(entry.model as CustomModel, builderLabel(entry, variant), 17)
    if (f.solid) holder.add(f.solid)
    if (f.live) holder.add(f.live)
    // Pièces animées (poissons, flammes…) : on les place comme en cours de jeu.
    f.update?.(1.7)
    if (pet) holder.add(pet)
  } else {
    const o = station(entry.model as StationModel)
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = themes.cozy.furniture
    })
    holder.add(o)
  }
  if (preview) holder.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial && object.material.map) {
      object.material = preview
    }
  })
  scene.add(holder)
  holder.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(holder)
  wall.visible = entry.mount === 'wall'

  // Vue isométrique, cadrée sur la boîte de l'objet.
  const center = box.getCenter(new THREE.Vector3())
  const angle = entry.model === 'site-art' ? new THREE.Vector3(0.55, 0.35, 1) : new THREE.Vector3(1, 0.85, 1)
  camera.position.copy(center).add(angle.normalize().multiplyScalar(10))
  camera.lookAt(center)
  camera.updateMatrixWorld(true)
  const { min, max } = box
  let half = 0.05
  corners.forEach((c, i) => {
    c.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(camera.matrixWorldInverse)
  })
  const cx = (Math.min(...corners.map((c) => c.x)) + Math.max(...corners.map((c) => c.x))) / 2
  const cy = (Math.min(...corners.map((c) => c.y)) + Math.max(...corners.map((c) => c.y))) / 2
  for (const c of corners) half = Math.max(half, Math.abs(c.x - cx), Math.abs(c.y - cy))
  half *= 1.12
  camera.left = cx - half
  camera.right = cx + half
  camera.top = cy + half
  camera.bottom = cy - half
  camera.updateProjectionMatrix()

  renderer!.render(scene, camera)
  const url = renderer!.domElement.toDataURL('image/png')
  scene.remove(holder)
  // L'animal partage géométrie et matériaux avec ceux du jeu : on ne les libère pas.
  if (pet) holder.remove(pet)
  if (custom) disposeFurniture(holder)
  return url
}

/** Traite la file une vignette à la fois, entre deux images du jeu. */
async function pump() {
  const job = queue.shift()
  if (!job) {
    running = false
    // File vide depuis un moment : on rend le contexte WebGL.
    idle = window.setTimeout(() => {
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null
    }, 4000)
    return
  }
  let url = ''
  try {
    url = await render(job.entry, job.variant)
  } catch {
    // Vignette ratée : la carte du catalogue garde son icône.
  }
  cache.set(job.key, url)
  for (const cb of waiting.get(job.key) ?? []) cb(url)
  waiting.delete(job.key)
  setTimeout(pump, 0)
}

/** Vignette d'un objet (image PNG en data URL, vide en cas d'échec), rendue à la demande. */
export function thumbnail(entry: CatalogEntry, variant: string | undefined, cb: (url: string) => void) {
  variant = entry.thumbnailVariant ?? variant
  const key = `${entry.id}|${variant ?? ''}`
  const hit = cache.get(key)
  if (hit !== undefined) return cb(hit)
  const list = waiting.get(key)
  if (list) return void list.push(cb)
  waiting.set(key, [cb])
  queue.push({ key, entry, variant })
  clearTimeout(idle)
  if (!running) {
    running = true
    setTimeout(pump, 0)
  }
}
