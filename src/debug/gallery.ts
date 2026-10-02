// Page de debug : affiche chaque modèle du kit sur une grille, avec son nom,
// une flèche +Z (rouge) pour repérer l'orientation d'origine et une tuile 1x1.
// Avec ?mobilier : le mobilier fait main (src/furniture/), animé.
// Avec ?catalogue : les vignettes du catalogue des cabines, toutes variantes (&variantes), ou de quelques
// catégories (&cats=bath,kitchen).
// Avec ?revetements : les motifs des murs et des sols, dans deux de leurs teintes (&x2 : répétés).
// Avec ?poses : chaque meuble où l'on s'installe, un personnage à chacune de ses places
// (&look=robot.g pour un autre modèle, &only=sofa,cozy-bed).
// Avec ?emote=o7 : une emote jouée en boucle par plusieurs apparences (&looks=…, &at=0.8 : figée à 0,8 s ;
// &salute=x,y,z : l'angle du bras pour le salut ; &plaster : avec le pansement de Betty).
// Avec ?thargoid : le Thargoïde de la zone thargoïde dans chacune de ses humeurs, sur place, à côté
// d'un CMDR pour l'échelle (&dark : dans le noir, à la lampe frontale ; &at=1.2 : figé ; &only=chase,attack).
// Avec ?mechanic : Nico, le mécano du hangar, et le Mini Character dont il est fait (mêmes options que ?nurse).
// Avec ?nurse : Betty, l'infirmière, à côté du modèle d'origine (&walk : en marche ; &emote=interact ;
// &cam=0,0.3,1&target=0,0.1,0&zoom=0.5 : de face, de près).
// Avec ?parcelle : la parcelle du pont des quartiers (housing v2) : les types de murs et de portes,
// des papiers peints et des sols, trois plans tout faits, sous la bulle (&zoom=15 par défaut).
// Avec ?holo : les styles du Holo-Me (cf. src/holo-style.ts) : &looks=human.female.b.mo-pk-sm--,… (par
// défaut : chaque coupe sur un même modèle), &style=--sm-- : ce style sur toutes, &play=joie : une emote
// en boucle (son expression). window.snap() rend l'image (PNG en data URL).
import * as THREE from 'three'
import { preload, station, STATION_MODELS, type StationModel } from '../assets'
import { Avatar, SALUTE } from '../avatar'
import { CATALOG, CATEGORIES } from '../cabin/catalog'
import { drawFinish, stylesOf } from '../cabin/finishes'
import { thumbnail } from '../cabin/thumbs'
import { buildFurniture, CUSTOM_MODELS, isCustomModel, tickFurniture, type CustomModel } from '../furniture'
import { lookRig, parseLook } from '../looks'
import { placeSeats, SEATS } from '../seats'
import { tempo } from '../tempo'
import { ThargoidBody, type ThargoidMood } from '../salvage/thargoid'
import { nurseRig } from '../nurse'
import { mechanicRig } from '../mechanic'
import { Plasters } from '../infirmary'
import { HAIR_STYLES } from '../../shared/look-style.js'
import { Deck } from '../deck'
import { QUARTERS_DECK } from '../levels'
import { PARTITION_KINDS } from '../cabin/partitions'
import { cellIndex, CELLS, type HomePlan, type PlanWall } from '../../shared/housing-home.js'
import { PLOT_ORIGIN, plotRect } from '../../shared/housing-plot.js'
import { placeTemplate, templateOf, templateSize } from '../../shared/housing-templates.js'

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
const ZOOM = +(params.get('zoom') ?? (params.has('parcelle') ? 15 : 12))
const aspect = innerWidth / innerHeight
const cam = new THREE.OrthographicCamera(-ZOOM * aspect, ZOOM * aspect, ZOOM, -ZOOM, -100, 100)
cam.position.set(params.has('back') ? -1 : 1, 1, params.has('back') ? -1 : 1).multiplyScalar(20)
// &side : de profil (depuis +x), presque à l'horizontale, pour juger des hauteurs.
if (params.has('side')) cam.position.set(20, 3, 0.01)
// &cam=x,y,z : n'importe quelle direction de vue.
if (params.get('cam')) cam.position.set(...(params.get('cam')!.split(',').map(Number) as [number, number, number])).setLength(20)
// &target=x,y,z : point visé (pour cadrer un seul objet de près).
const target = new THREE.Vector3(...((params.get('target') ?? '0,0,0').split(',').map(Number) as [number, number, number]))
cam.position.add(target)
cam.lookAt(target)

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

// window.snap(w, h) : l'image, à une taille donnée (la page peut être cachée, de taille nulle).
;(window as unknown as { snap: (w?: number, h?: number) => string }).snap = (w = 1200, h = 800) => {
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  cam.left = -ZOOM * (w / h)
  cam.right = ZOOM * (w / h)
  cam.updateProjectionMatrix()
  renderer.render(scene, cam)
  return renderer.domElement.toDataURL('image/png')
}

await preload([], () => {})
if (params.has('catalogue')) showCatalogue()
else if (params.has('revetements')) showFinishes()
else if (params.has('poses')) await showPoses()
else if (params.has('nurse')) await showNurse()
else if (params.has('mechanic')) await showNurse(true)
else if (params.has('emote')) await showEmote(params.get('emote')!)
else if (params.has('thargoid')) await showThargoid()
else if (params.has('holo')) await showHolo()
else if (params.has('parcelle')) showPlot()
else showModels()

/** Styles du Holo-Me côte à côte, en grille. */
async function showHolo() {
  const base = params.get('base') ?? 'human.female.b'
  const style = params.get('style')
  const looks = (params.get('looks')?.split(',') ?? HAIR_STYLES.map((h) => `${base}.${h}----`)).map((id) => (style ? `${id.split('.').filter((p) => !p.includes('-')).join('.')}.${style}` : id))
  const avatars: Avatar[] = []
  const play = params.get('play')
  for (const [i, id] of looks.entries()) {
    const a = new Avatar(await lookRig(parseLook(id)))
    a.root.position.set(((i % COLS) - (COLS - 1) / 2) * 0.8, -Math.floor(i / COLS) * 1.1, 0)
    scene.add(a.root)
    avatars.push(a)
    const l = label(id.split('.').slice(-2).join('.'))
    l.scale.multiplyScalar(0.35)
    l.position.set(a.root.position.x, a.root.position.y - 0.08, 0.4)
    scene.add(l)
  }
  const clock = new THREE.Timer()
  // Avance les animations de `t` secondes (une page cachée n'a pas d'images d'animation).
  ;(window as unknown as { tick: (t: number) => void }).tick = (t) => {
    for (let k = 0; k < t * 30; k++) for (const a of avatars) {
      if (play && !a.emoteId) a.playEmote(play)
      a.update(1 / 30)
    }
  }
  function frame() {
    clock.update()
    const dt = Math.min(clock.getDelta(), 0.05)
    for (const a of avatars) {
      if (play && !a.emoteId) a.playEmote(play)
      a.update(dt)
    }
    renderer.render(scene, cam)
    requestAnimationFrame(frame)
  }
  frame()
}

/** Betty, l'infirmière (cf. src/nurse.ts), et le Mini Character dont elle est faite. */
async function showNurse(mechanic = false) {
  const betty = new Avatar(mechanic ? await mechanicRig() : await nurseRig())
  const base = new Avatar(await lookRig(parseLook(mechanic ? 'human.male.d' : 'human.female.f')))
  betty.root.position.set(-0.45, -0.35, 0)
  base.root.position.set(0.45, -0.35, 0)
  scene.add(betty.root, base.root)
  const emote = params.get('emote')
  const clock = new THREE.Timer()
  function frame() {
    clock.update()
    const dt = Math.min(clock.getDelta(), 0.05)
    for (const a of [betty, base]) {
      a.setLocomotion(params.has('walk') ? 'walk' : 'idle', params.has('walk') ? 0.8 : 0)
      if (emote && !a.emoteId) a.playEmote(emote)
      a.update(dt)
    }
    renderer.render(scene, cam)
    requestAnimationFrame(frame)
  }
  frame()
}

/** Une emote, jouée en boucle par plusieurs apparences côte à côte. */
async function showEmote(id: string) {
  const looks = (params.get('looks') ?? 'human.male.a,human.female.c,suit.female.b.maverick,alien.male.d,robot.d,creature.orc').split(',')
  if (params.get('salute')) SALUTE.set(...(params.get('salute')!.split(',').map(Number) as [number, number, number]))
  const at = params.get('at')
  const avatars: Avatar[] = []
  for (const [i, id] of looks.entries()) {
    const a = new Avatar(await lookRig(parseLook(id)))
    if (params.has('plaster')) new Plasters().show(a, true)
    a.root.position.set((i - (looks.length - 1) / 2) * 1.1, -0.35, 0)
    scene.add(a.root)
    avatars.push(a)
    const l = label(id)
    l.position.set(a.root.position.x, -0.25, 0.4)
    scene.add(l)
  }
  const play = () => { for (const a of avatars) { a.playEmote(id); if (at) a.update(+at) } }
  play()
  const clock = new THREE.Timer()
  function frame() {
    clock.update()
    const dt = Math.min(clock.getDelta(), 0.05)
    if (!at) {
      for (const a of avatars) a.update(dt)
      if (!avatars[0].emoteId) play()
    } else for (const a of avatars) a.update(0)
    renderer.render(scene, cam)
    requestAnimationFrame(frame)
  }
  frame()
}

/** Le Thargoïde, une silhouette par humeur, sur place (vitesse simulée), et un CMDR pour l'échelle. */
async function showThargoid() {
  const only = params.get('only')?.split(',')
  const moods = ([['patrol', 1], ['investigate', 1.55], ['chase', 2.45], ['search', 0], ['attack', 0], ['lured', 0], ['look', 0]] as [ThargoidMood, number][])
    .filter(([m]) => !only || only.includes(m))
  if (params.has('dark')) {
    scene.background = new THREE.Color('#020303')
    for (const l of [...scene.children]) if ((l as THREE.Light).isLight) (l as THREE.Light).intensity *= 0.18
    const lamp = new THREE.PointLight('#ffe7c4', 6, 7, 1.4)
    lamp.position.set(0, 1.2, 1.6)
    scene.add(lamp)
  }
  const bodies: { body: ThargoidBody; mood: ThargoidMood; speed: number }[] = []
  const x0 = -(moods.length - 1) / 2 * 1.1
  moods.forEach(([mood, speed], i) => {
    const body = new ThargoidBody()
    body.root.position.set(x0 + i * 1.1, -0.35, 0)
    scene.add(body.root)
    bodies.push({ body, mood, speed })
    const l = label(mood)
    l.position.set(body.root.position.x, -0.3, 0.55)
    scene.add(l)
  })
  const cmdr = new Avatar(await lookRig(parseLook('suit.male.c.maverick')))
  cmdr.root.position.set(x0 - (only ? 0.7 : 1.1), -0.35, 0)
  scene.add(cmdr.root)
  const at = params.get('at')
  let loop = 0
  const clock = new THREE.Timer()
  function frame() {
    clock.update()
    const dt = at ? 0 : Math.min(clock.getDelta(), 0.05)
    loop += dt
    for (const b of bodies) {
      // L'attaque se rejoue toutes les deux secondes et demie.
      const mood = b.mood === 'attack' && loop % 2.5 > 1.9 ? 'look' : b.mood
      b.body.update(dt, mood, b.speed)
    }
    cmdr.update(dt)
    renderer.render(scene, cam)
    requestAnimationFrame(frame)
  }
  if (at) for (const b of bodies) for (let k = 0; k < 40; k++) b.body.update(+at / 40, b.mood, b.speed)
  frame()
}

/** Meubles où l'on s'installe, un personnage à chaque place : hauteurs et orientations à l'œil. */
async function showPoses() {
  const only = params.get('only')
  const models = Object.keys(SEATS).filter((m) => !only || only.split(',').includes(m))
  const rows = Math.ceil(models.length / COLS)
  const avatars: Avatar[] = []
  const look = parseLook(params.get('look') ?? 'human.female.b')
  // &pose=lie : une pose seule, au sol, avec une règle graduée tous les 10 cm.
  const lone = params.get('pose')
  if (lone) {
    const a = new Avatar(await lookRig(look))
    a.setPose(lone as keyof typeof SEATS & never)
    scene.add(a.root)
    avatars.push(a)
    for (let i = 0; i <= 10; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, i % 5 ? 0.05 : 0.12), new THREE.MeshBasicMaterial({ color: i % 5 ? '#888' : '#ff3355' }))
      tick.position.set(0, i * 0.1, -0.5)
      scene.add(tick)
      const tz = tick.clone()
      tz.rotation.x = Math.PI / 2
      tz.position.set(0, 0.002, -1 + i * 0.2)
      scene.add(tz)
    }
    models.length = 0
  }
  for (const [i, name] of models.entries()) {
    const x = ((i % COLS) - (COLS - 1) / 2) * 2.2
    const z = (Math.floor(i / COLS) - (rows - 1) / 2) * 2.2
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ color: '#3a3f5c' }))
    tile.rotation.x = -Math.PI / 2
    tile.position.set(x, -0.01, z)
    scene.add(tile)
    if (isCustomModel(name)) {
      const f = buildFurniture(name, undefined, i + 1)
      for (const part of [f.solid, f.live]) {
        if (!part) continue
        part.position.set(x, 0, z)
        scene.add(part)
      }
    } else {
      const m = station(name as StationModel)
      m.position.set(x, 0, z)
      scene.add(m)
    }
    for (const spot of placeSeats(SEATS[name as CustomModel]!, x, z, 0, { x: x + 1, z: z + 1 })) {
      const a = new Avatar(await lookRig(look))
      a.root.position.set(spot.x, spot.y, spot.z)
      a.root.rotation.y = spot.yaw
      a.setPose(spot.pose)
      scene.add(a.root)
      avatars.push(a)
      // Abord de la place : où l'on se tient avant de s'installer.
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: '#ffb03a' }))
      dot.rotation.x = -Math.PI / 2
      dot.position.set(spot.from.x, 0.005, spot.from.z)
      scene.add(dot)
    }
    const l = label(name)
    l.position.set(x + 0.9, 0, z + 0.9)
    scene.add(l)
  }
  const clock = new THREE.Timer()
  function frame() {
    clock.update()
    const dt = Math.min(clock.getDelta(), 0.05)
    tempo.now = clock.getElapsed()
    for (const a of avatars) a.update(dt)
    renderer.render(scene, cam)
    requestAnimationFrame(frame)
  }
  frame()
}

/** Motifs des revêtements, en grand : première teinte de la palette, puis une autre. */
function showFinishes() {
  renderer.domElement.remove()
  document.body.style.cssText = 'margin:0;padding:16px;background:#1b1d2a;color:#e6e8ff;font:12px system-ui;overflow:auto;height:auto'
  document.documentElement.style.overflow = 'auto'
  const repeat = params.has('x2') ? 2 : 1
  for (const slot of ['wall', 'floor'] as const) {
    const h = document.createElement('h3')
    h.textContent = slot === 'wall' ? 'Murs' : 'Sols'
    const grid = document.createElement('div')
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'
    for (const style of stylesOf(slot)) {
      for (const color of [style.palette[0], style.palette[Math.min(style.palette.length - 1, 3)]]) {
        const card = document.createElement('div')
        card.style.cssText = 'text-align:center;background:#262a3d;border-radius:8px;padding:6px'
        const tile = document.createElement('canvas')
        drawFinish(tile, slot, { style: style.id, color })
        const view = document.createElement('canvas')
        view.width = view.height = 256
        const g = view.getContext('2d')!
        const pattern = g.createPattern(tile, 'repeat')!
        pattern.setTransform(new DOMMatrix().scale(1 / repeat, 1 / repeat))
        g.fillStyle = pattern
        g.fillRect(0, 0, 256, 256)
        const name = document.createElement('div')
        name.textContent = `${style.name} · ${color} · ${style.size} m`
        card.append(view, name)
        grid.append(card)
      }
    }
    document.body.append(h, grid)
  }
}

/** Vignettes du catalogue des cabines, par catégorie (toutes les variantes avec &variantes). */
function showCatalogue() {
  renderer.domElement.remove()
  document.body.style.cssText = 'margin:0;padding:16px;background:#1b1d2a;color:#e6e8ff;font:12px system-ui;overflow:auto;height:auto'
  document.documentElement.style.overflow = 'auto'
  const cats = params.get('cats')?.split(',')
  for (const cat of [...CATEGORIES, { id: undefined, label: 'Hors catalogue' }]) {
    if (cats && !cats.includes(cat.id ?? '')) continue
    const h = document.createElement('h3')
    h.textContent = cat.label
    const grid = document.createElement('div')
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'
    for (const e of CATALOG.filter((x) => x.category === cat.id)) {
      for (const v of params.has('variantes') && e.variants ? e.variants.map((x) => x.id) : [e.variants?.[0]?.id]) {
        const card = document.createElement('div')
        card.style.cssText = 'width:132px;text-align:center;background:#262a3d;border-radius:8px;padding:6px'
        const img = document.createElement('img')
        img.width = img.height = 120
        thumbnail(e, v, (url) => (img.src = url))
        const name = document.createElement('div')
        name.textContent = `${e.name}${v ? ` · ${v}` : ''}`
        const meta = document.createElement('div')
        meta.style.color = '#9aa0d0'
        meta.textContent = `${e.id} · ${e.mount}${e.surface ? ` · dessus ${e.surface}` : ''}`
        card.append(img, name, meta)
        grid.append(card)
      }
    }
    if (grid.children.length) document.body.append(h, grid)
  }
}

function showModels() {
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
}

/**
 * La parcelle du pont des quartiers, en 20 × 20 : sur deux rangées, chaque type de mur et de porte
 * (son nom au-dessus), habillé d'un papier peint différent sur chaque face, sur un sol différent ;
 * plus bas, une suite, une véranda et un coin salon. Le champ de force court sur le reste du bord.
 */
function showPlot() {
  const deck = new Deck(QUARTERS_DECK)
  deck.group.position.y = 0
  scene.add(deck.group)
  const O = PLOT_ORIGIN
  const papers = stylesOf('wall'), floors = stylesOf('floor')
  const paper = (i: number) => ({ style: papers[i % papers.length].id, color: papers[i % papers.length].palette[1] ?? papers[i % papers.length].palette[0] })
  const flooring = (i: number) => ({ style: floors[i % floors.length].id, color: floors[i % floors.length].palette[0] })
  const plan: HomePlan = { walls: [], floor: Array(CELLS).fill(null), items: [] }
  const kinds = ['wall', 'half', 'window', 'arch', 'sliding', 'wood', 'saloon', 'airlock', 'shoji', 'glass', 'beads']
  const names: Record<string, string> = { wall: 'Mur', half: 'Demi-mur', window: 'Mur à hublot', ...Object.fromEntries(PARTITION_KINDS.map((k) => [k.id, k.name])) }
  kinds.forEach((k, i) => {
    const row = i < 6 ? 0 : 1
    const x = O.x + 2 + (row ? i - 6 : i) * 3, z = O.z + 3 + row * 5
    const wall: PlanWall = { x, z, e: 'h', a: paper(i), b: paper(i + 5) }
    if (k !== 'wall') wall.k = k
    plan.walls.push(wall)
    for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) plan.floor[cellIndex(x + dx, z + dz)] = flooring(i)
    const l = label(names[k] ?? k)
    l.scale.multiplyScalar(1.25)
    l.position.set(x + 0.5, 1.6, z + 0.5)
    scene.add(l)
  })
  // Trois plans tout faits, habillés dedans comme dehors.
  ;([['suite', 2, 12, 3], ['veranda', 12, 12, 7], ['coin-salon', 13, 17, 9]] as const).forEach(([id, x, z, n]) => {
    const t = templateOf(id)!
    for (const w of placeTemplate(t, { x: O.x + x, z: O.z + z })) plan.walls.push({ ...w, a: paper(n), b: paper(n + 1) })
    const [w, h] = templateSize(t)
    for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) plan.floor[cellIndex(O.x + x + dx, O.z + z + dz)] = flooring(n)
  })
  deck.home!.set(1, plan)
  const r = plotRect(1)
  const center = new THREE.Vector3((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2)
  cam.position.sub(target).add(center)
  cam.lookAt(center)
  const toCamera = cam.position.clone().sub(center).setY(0).normalize()
  const clock = new THREE.Timer()
  function frame() {
    clock.update()
    deck.update(clock.getDelta(), [], center, toCamera)
    renderer.render(scene, cam)
    requestAnimationFrame(frame)
  }
  frame()
}
