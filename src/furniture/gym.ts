import * as THREE from 'three'
import { sportRecords, type SportId } from '../arcade/game'
import { tr } from '../i18n'
import { animatedScreen, barX, barZ, box, cylinder, decal, drawnTexture, glow, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * La salle de sport du pont principal, façon vraie salle : un sol de caoutchouc moucheté, un tapis
 * par zone (dalles de mousse rouges et bleues de la boxe, pistes bleue du tapis de course et
 * orange du vélo, dalles lourdes de la musculation), une enseigne lumineuse au-dessus de chaque
 * zone (avec le record de son appareil), un miroir derrière les haltères, le matériel de boxe
 * (mannequin, speed bag, gants, chrono des rounds), l'arbre à disques, les kettlebells, les
 * serviettes, le coin nettoyage et le règlement. Les appareils eux-mêmes (tapis de course, vélo, sac de frappe, banc, haltères) sont
 * dans leisure.ts : les quartiers les ont aussi.
 */

const C = {
  rubber: '#30333a',
  rubberDark: '#1b1d22',
  steel: '#9aa3ae',
  steelDark: '#3a3f48',
  chrome: '#c3cad3',
  white: '#eef2f5',
  wood: '#b98a55',
  leather: '#c8373a',
}

/** Pixels de texture par mètre : assez pour lire les marquages au sol de près. */
const PX = 200

type Icon = 'run' | 'bike' | 'glove' | 'dumbbell'

/** Zones de la salle : les trois appareils du mini-jeu (cf. src/gym.ts), et la musculation. */
export const GYM_ZONES: Record<SportId | 'weights', { name: string; color: string; dark: string; icon: Icon }> = {
  'gym-run': { name: tr('COURSE', 'RUNNING'), color: '#2fb4ff', dark: '#0b2a40', icon: 'run' },
  'gym-bike': { name: tr('VÉLO', 'CYCLING'), color: '#ff9a2e', dark: '#3d2008', icon: 'bike' },
  'gym-punch': { name: tr('BOXE', 'BOXING'), color: '#ff5050', dark: '#3d1010', icon: 'glove' },
  weights: { name: tr('MUSCU', 'WEIGHTS'), color: '#cfd8e3', dark: '#22262d', icon: 'dumbbell' },
}

const zoneOf = (label: string | undefined) => GYM_ZONES[(label ?? '') as keyof typeof GYM_ZONES] ?? GYM_ZONES['gym-run']

/** Pictogramme d'une zone, dessiné dans un carré de côté `s` centré en (cx, cy). */
function pictogram(c: CanvasRenderingContext2D, kind: Icon, cx: number, cy: number, s: number, color: string) {
  c.save()
  c.translate(cx, cy)
  c.scale(s / 100, s / 100)
  c.strokeStyle = color
  c.fillStyle = color
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.lineWidth = 9
  const line = (...pts: number[]) => {
    c.beginPath()
    c.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1])
    c.stroke()
  }
  if (kind === 'run') {
    // En pleine foulée, penché vers l'avant.
    c.beginPath(); c.arc(14, -36, 10, 0, Math.PI * 2); c.fill()
    line(8, -22, -6, 6)
    line(5, -16, 20, -4, 34, -14)
    line(3, -15, -14, -20, -26, -8)
    line(-6, 6, 14, 18, 8, 40)
    line(-6, 6, -18, 24, -38, 22)
  } else if (kind === 'bike') {
    c.lineWidth = 7
    for (const x of [-27, 29]) { c.beginPath(); c.arc(x, 24, 17, 0, Math.PI * 2); c.stroke() }
    line(-27, 24, 0, 24, -8, -2, -27, 24)
    line(0, 24, 22, -2, 29, 24)
    line(-14, -6, -2, -6)
    line(22, -2, 25, -12, 34, -12)
    // Le cycliste, couché sur son guidon.
    c.beginPath(); c.arc(12, -40, 8, 0, Math.PI * 2); c.fill()
    c.lineWidth = 8
    line(-8, -12, 6, -30, 30, -14)
    line(-8, -12, 6, 4, 0, 24)
  } else if (kind === 'glove') {
    c.beginPath(); c.roundRect(-22, -38, 46, 52, 20); c.fill()
    c.beginPath(); c.ellipse(-24, -4, 10, 17, -0.35, 0, Math.PI * 2); c.fill()
    c.fillRect(-18, 12, 38, 26)
    c.fillStyle = '#ffffff55'
    c.fillRect(-18, 20, 38, 6)
  } else {
    c.fillRect(-36, -4, 72, 8)
    for (const [x, h] of [[-31, 46], [-43, 32], [21, 46], [33, 32]]) { c.beginPath(); c.roundRect(x, -h / 2, 10, h, 3); c.fill() }
  }
  c.restore()
}

/** Grain du caoutchouc recyclé : des milliers de paillettes d'un pixel, couleurs [r, g, b, opacité]. */
function speckle(c: CanvasRenderingContext2D, w: number, h: number, colors: [number, number, number, number][], density: number, random: () => number) {
  const image = c.getImageData(0, 0, w, h)
  const d = image.data
  for (let i = 0; i < w * h; i++) {
    if (random() >= density) continue
    const [r, g, b, a] = colors[Math.floor(random() * colors.length)]
    const k = i * 4
    d[k] += (r - d[k]) * a
    d[k + 1] += (g - d[k + 1]) * a
    d[k + 2] += (b - d[k + 2]) * a
  }
  c.putImageData(image, 0, 0)
}

/** Revêtement plein, posé sur les dalles du pont (même réglage que le parquet de la salle de classe). */
function floorPlane(texture: THREE.Texture, w: number, d: number, y: number): THREE.Mesh {
  const floor = decal(texture, w, d, y)
  const material = floor.material as THREE.MeshLambertMaterial
  material.polygonOffset = false
  material.transparent = false
  return floor
}

// ---------------------------------------------------------------- sols

/**
 * Sol de la salle (`label` : largeur × profondeur, ex. 4.7x3.7) : du caoutchouc graphite moucheté,
 * en dalles d'un demi-mètre.
 */
const gymFloor: Builder = ({ label = '4.7x3.7', random }) => {
  const [w, d] = label.split('x').map(Number)
  const P = 160, W = Math.round(w * P), H = Math.round(d * P)
  const texture = drawnTexture(W, H, (c) => {
    c.fillStyle = C.rubber
    c.fillRect(0, 0, W, H)
    speckle(c, W, H, [[67, 71, 79, 1], [38, 41, 48, 1], [86, 96, 110, 1], [75, 90, 112, 1], [95, 102, 114, 1], [140, 150, 165, 1]], 0.3, random)
    c.fillStyle = 'rgba(0,0,0,0.4)'
    for (let x = P / 2; x < W; x += P / 2) c.fillRect(x, 0, 1, H)
    for (let y = P / 2; y < H; y += P / 2) c.fillRect(0, y, W, 1)
  })
  const g = new THREE.Group()
  g.add(floorPlane(texture, w, d, 0.012))
  return { solid: g }
}

/** Dalles de mousse emboîtées, rouges et bleues, d'un demi-mètre, avec leurs bordures droites. */
function drawPuzzle(c: CanvasRenderingContext2D, W: number, H: number, random: () => number) {
  const T = PX / 2, colors = ['#c63636', '#23468e']
  const at = (x: number, y: number) => colors[(Math.floor(x / T) + Math.floor(y / T)) % 2]
  for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) { c.fillStyle = at(x, y); c.fillRect(x, y, T, T) }
  speckle(c, W, H, [[255, 255, 255, 0.08], [0, 0, 0, 0.12]], 0.1, random)
  // Les tenons : chaque dalle mord dans sa voisine, deux fois par côté.
  const tab = T * 0.16
  for (let y = 0; y < H; y += T) {
    for (let x = T; x < W; x += T) {
      for (const [k, from] of [[0.3, x - T], [0.7, x]] as const) {
        const into = from === x ? -1 : 1
        c.fillStyle = at(from, y)
        c.beginPath(); c.roundRect(x - (into < 0 ? tab : 0), y + T * k - tab / 2, tab, tab, 4); c.fill()
      }
      c.fillStyle = 'rgba(0,0,0,0.3)'
      c.fillRect(x - 1, y, 2, T)
    }
  }
  for (let x = 0; x < W; x += T) {
    for (let y = T; y < H; y += T) {
      for (const [k, from] of [[0.3, y - T], [0.7, y]] as const) {
        const into = from === y ? -1 : 1
        c.fillStyle = at(x, from)
        c.beginPath(); c.roundRect(x + T * k - tab / 2, y - (into < 0 ? tab : 0), tab, tab, 4); c.fill()
      }
      c.fillStyle = 'rgba(0,0,0,0.3)'
      c.fillRect(x, y - 1, T, 2)
    }
  }
  c.strokeStyle = '#1d1f25'
  c.lineWidth = 10
  c.strokeRect(5, 5, W - 10, H - 10)
}

/** Piste d'un appareil : caoutchouc teinté, liseré de la zone, et son nom peint au pied. */
function drawPad(c: CanvasRenderingContext2D, W: number, H: number, zone: (typeof GYM_ZONES)[keyof typeof GYM_ZONES], base: string, random: () => number) {
  c.fillStyle = base
  c.fillRect(0, 0, W, H)
  speckle(c, W, H, [[255, 255, 255, 0.1], [0, 0, 0, 0.16]], 0.14, random)
  c.strokeStyle = zone.color
  c.lineWidth = 8
  c.strokeRect(10, 10, W - 20, H - 20)
  // Le nom de la zone, au pied de l'appareil, lisible depuis l'allée.
  c.fillStyle = 'rgba(255,255,255,0.85)'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  let size = 52
  c.font = `900 ${size}px system-ui, sans-serif`
  while (c.measureText(zone.name).width > W - 44 && size > 20) c.font = `900 ${(size -= 2)}px system-ui, sans-serif`
  c.fillText(zone.name, W / 2, H - 44)
}

/** Dalles lourdes de la musculation, noires, et la consigne au pied. */
function drawWeights(c: CanvasRenderingContext2D, W: number, H: number, random: () => number) {
  c.fillStyle = '#1f2126'
  c.fillRect(0, 0, W, H)
  speckle(c, W, H, [[51, 54, 61, 1], [21, 22, 26, 1], [61, 68, 80, 1]], 0.22, random)
  const T = PX / 2
  c.fillStyle = 'rgba(0,0,0,0.55)'
  for (let x = T; x < W; x += T) c.fillRect(x - 1, 0, 2, H)
  for (let y = T; y < H; y += T) c.fillRect(0, y - 1, W, 2)
  // Bande jaune et noire le long de l'allée.
  for (let y = 0; y < H; y += 24) {
    c.fillStyle = (y / 24) % 2 ? '#1b1c20' : '#e9b51c'
    c.fillRect(0, y, 10, 24)
  }
  // La consigne, au pied, du côté de l'allée (l'arbre à disques est dans l'autre coin).
  c.fillStyle = 'rgba(255,255,255,0.7)'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = '800 22px system-ui, sans-serif'
  c.fillText(tr('RANGEZ', 'RE-RACK'), 112, H - 58)
  c.fillText(tr('VOS POIDS', 'YOUR WEIGHTS'), 112, H - 32)
}

/**
 * Tapis d'une zone (`label` : genre:largeur×profondeur) : `boxing` (dalles de mousse), `gym-run`,
 * `gym-bike` (pistes des appareils), `weights` (dalles lourdes), `yoga` (tapis d'étirement et son
 * rouleau). Une épaisseur au-dessus du sol : on voit leur tranche.
 */
const gymMat: Builder = ({ label = 'gym-run:0.85x1.8', random }) => {
  const [kind, size] = label.split(':')
  const [w, d] = (size ?? '1x1').split('x').map(Number)
  const W = Math.round(w * PX), H = Math.round(d * PX)
  const g = new THREE.Group()
  if (kind === 'yoga') {
    // Un tapis violet aux bouts arrondis, et le rouleau de massage posé au bout.
    const texture = drawnTexture(W, H, (c) => {
      c.fillStyle = '#7b55c7'
      c.beginPath(); c.roundRect(0, 0, W, H, 18); c.fill()
      speckle(c, W, H, [[255, 255, 255, 0.08]], 0.06, random)
      c.strokeStyle = 'rgba(255,255,255,0.25)'
      c.lineWidth = 3
      c.strokeRect(14, 14, W - 28, H - 28)
    })
    g.add(decal(texture, w, d, 0.02))
    g.add(barX(0.045, 0.3, lit('#1d8f86'), w / 2 - 0.22, 0.065, -d / 2 + 0.1, 12), barX(0.047, 0.02, lit('#14605a'), w / 2 - 0.37, 0.065, -d / 2 + 0.1, 12))
    return { solid: g }
  }
  const zone = zoneOf(kind)
  const thick = kind === 'boxing' ? 0.024 : 0.016
  const side = kind === 'boxing' ? '#8f2a2a' : kind === 'weights' ? '#15161a' : zone.dark
  const texture = drawnTexture(W, H, (c) => {
    if (kind === 'boxing') drawPuzzle(c, W, H, random)
    else if (kind === 'weights') drawWeights(c, W, H, random)
    else drawPad(c, W, H, zone, kind === 'gym-bike' ? '#a85a17' : '#1b5a96', random)
  })
  g.add(box(w, thick, d, lit(side), 0, thick / 2, 0))
  g.add(floorPlane(texture, w, d, thick + 0.001))
  return { solid: g }
}

/**
 * Le blason de la salle, peint au sol devant les appareils : un anneau jaune, une haltère, et le
 * nom de la salle en arc de cercle.
 */
const gymLogo: Builder = ({ label = '0.8' }) => {
  const size = Number(label) || 0.8
  const N = Math.round(size * PX)
  const texture = drawnTexture(N, N, (c) => {
    const r = N / 2
    c.translate(r, r)
    c.strokeStyle = 'rgba(242,194,48,0.9)'
    c.lineWidth = N * 0.035
    c.beginPath(); c.arc(0, 0, r * 0.94, 0, Math.PI * 2); c.stroke()
    c.lineWidth = N * 0.012
    c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke()
    pictogram(c, 'dumbbell', 0, -r * 0.08, r * 0.95, 'rgba(242,194,48,0.9)')
    c.fillStyle = 'rgba(242,194,48,0.9)'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `900 ${Math.round(N * 0.1)}px system-ui, sans-serif`
    c.fillText('o7', 0, r * 0.32)
    // Le nom, le long de l'anneau, en haut.
    const text = tr('SALLE DE SPORT', 'SHIP GYM')
    c.font = `800 ${Math.round(N * 0.085)}px system-ui, sans-serif`
    const step = 0.2
    let a = -Math.PI / 2 - ((text.length - 1) * step) / 2
    for (const ch of text) {
      c.save()
      c.rotate(a + Math.PI / 2)
      c.fillText(ch, 0, -r * 0.78)
      c.restore()
      a += step
    }
  })
  const g = new THREE.Group()
  g.add(decal(texture, size, size, 0.016))
  return { solid: g }
}

// ---------------------------------------------------------------- murs

/**
 * Enseigne lumineuse d'une zone (`label` : `gym-run`, `gym-bike`, `gym-punch` ou `weights`), au
 * haut du mur (dos au mur, face à +z) : son pictogramme, son nom, et le record du bord sur son
 * appareil, relu toutes les deux secondes (cf. src/arcade/scores.ts).
 */
const gymSign: Builder = ({ label = 'gym-run' }) => {
  const zone = zoneOf(label)
  const game = label === 'weights' ? null : (label as SportId)
  const W = 0.7, H = 0.27, Y = 1.12
  // Une face seulement, sans caisson : le haut des murs n'est pas dessiné en vue isométrique, et
  // de dos l'enseigne disparaît au lieu de flotter au-dessus du mur.
  const solid = new THREE.Group()
  solid.add(part(new THREE.PlaneGeometry(W + 0.03, 0.014), glow(zone.color), 0, Y - H / 2 - 0.016, 0.02))
  const draw = (c: CanvasRenderingContext2D) => {
    c.fillStyle = '#1b1d22'
    c.fillRect(0, 0, 512, 196)
    c.fillStyle = '#101319'
    c.beginPath(); c.roundRect(6, 6, 500, 184, 12); c.fill()
    c.fillStyle = zone.color
    c.beginPath(); c.roundRect(14, 14, 168, 168, 14); c.fill()
    pictogram(c, zone.icon, 98, 98, 128, zone.dark)
    c.textAlign = 'left'
    c.textBaseline = 'alphabetic'
    c.fillStyle = '#f4f7fb'
    c.font = '800 66px system-ui, sans-serif'
    c.fillText(zone.name, 204, 84)
    const fit = (text: string, max: number) => {
      let t = text
      while (t.length > 2 && c.measureText(t).width > max) t = t.slice(0, -2) + '…'
      return t
    }
    c.fillStyle = zone.color
    c.font = '700 30px system-ui, sans-serif'
    const best = game ? sportRecords[game] : undefined
    c.fillText(game ? (best ? `${tr('RECORD', 'BEST')} ${best.score.toLocaleString()}` : tr('RECORD À PRENDRE', 'RECORD UP FOR GRABS')) : tr('POIDS LIBRES', 'FREE WEIGHTS'), 204, 130)
    c.fillStyle = '#9fb0c2'
    c.font = '26px system-ui, sans-serif'
    c.fillText(fit(game ? (best ? best.cmdr.toUpperCase() : tr('À vous de jouer !', 'Your turn!')) : tr('Rangez vos haltères !', 'Re-rack your dumbbells!'), 296), 204, 168)
  }
  const plane = new THREE.PlaneGeometry(W, H)
  if (!game) {
    solid.add(part(plane, new THREE.MeshBasicMaterial({ map: drawnTexture(512, 196, draw) }), 0, Y, 0.02))
    return { solid }
  }
  const screen = animatedScreen(512, 196, 0.5, draw)
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  live.add(part(plane, new THREE.MeshBasicMaterial({ map: screen.texture }), 0, Y, 0.02))
  return { solid, live, update: (t) => screen.tick(t) }
}

/**
 * Miroir mural (`label` : sa largeur), en panneaux jointifs dans un cadre d'alu : un dégradé
 * argenté, quelques reflets en biais, le sol sombre qui s'y reflète en bas.
 */
const gymMirror: Builder = ({ label = '1.3' }) => {
  const w = Number(label) || 1.3
  const bottom = 0.12, top = 0.95, h = top - bottom
  const W = Math.round(w * 160), H = Math.round(h * 160)
  const texture = drawnTexture(W, H, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#d3dee9')
    sky.addColorStop(0.55, '#a3b4c6')
    sky.addColorStop(0.72, '#5d6878')
    sky.addColorStop(1, '#272b33')
    c.fillStyle = sky
    c.fillRect(0, 0, W, H)
    c.fillStyle = 'rgba(255,255,255,0.32)'
    for (const [x, s] of [[0.18, 0.09], [0.29, 0.03], [0.63, 0.12], [0.8, 0.04]]) {
      c.beginPath()
      c.moveTo(x * W, 0); c.lineTo((x + s) * W, 0); c.lineTo((x + s - 0.18) * W, H); c.lineTo((x - 0.18) * W, H)
      c.closePath(); c.fill()
    }
    c.fillStyle = 'rgba(40,48,60,0.45)'
    const panels = Math.max(1, Math.round(w / 0.65))
    for (let i = 1; i < panels; i++) c.fillRect(Math.round((i * W) / panels) - 1, 0, 2, H)
  })
  const g = new THREE.Group()
  const frame = lit(C.chrome, 'metal')
  g.add(box(w + 0.04, 0.025, 0.025, frame, 0, top + 0.012, 0.012), box(w + 0.04, 0.025, 0.025, frame, 0, bottom - 0.012, 0.012))
  for (const x of [-w / 2 - 0.008, w / 2 + 0.008]) g.add(box(0.025, h + 0.05, 0.025, frame, x, (top + bottom) / 2, 0.012))
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texture, emissive: '#2a313c' }), 0, (top + bottom) / 2, 0.014))
  return { solid: g }
}

/**
 * Speed bag au mur (dos au mur) : la plaque de fixation, le plateau de rebond rond, et la poire de
 * cuir qui pend dessous, encore secouée de temps en temps.
 */
const speedBag: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steelDark, 'metal')
  const Y = 0.95
  g.add(box(0.26, 0.3, 0.025, steel, 0, Y - 0.13, 0.013, 0.01), box(0.05, 0.035, 0.2, steel, 0, Y - 0.03, 0.11))
  g.add(cylinder(0.15, 0.15, 0.035, lit('#4a2e1a', 'wood'), 0, Y, 0.2, 24), cylinder(0.155, 0.155, 0.012, lit(C.leather), 0, Y - 0.022, 0.2, 24))
  const live = new THREE.Group()
  const pivot = new THREE.Group()
  pivot.position.set(0, Y - 0.03, 0.2)
  const bag = new THREE.Group()
  const pear = mesh(new THREE.SphereGeometry(0.07, 14, 10), lit(C.leather, 'leather'), 0, -0.16, 0)
  pear.scale.set(1, 1.5, 1)
  bag.add(part(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 4), lit(C.chrome, 'metal'), 0, -0.025, 0), mesh(new THREE.SphereGeometry(0.035, 10, 8), lit(C.leather, 'leather'), 0, -0.06, 0), pear)
  pivot.add(bag)
  live.add(pivot)
  return {
    solid: g,
    live,
    update: (t) => {
      // Toutes les neuf secondes, une rafale : la poire bat contre le plateau, puis se calme.
      const u = t % 9
      const burst = u < 1.6 ? Math.sin(u * 38) * 0.9 * (1 - u / 1.6) : 0
      pivot.rotation.x = burst + Math.sin(t * 1.7) * 0.04
      pivot.rotation.z = Math.sin(t * 1.1) * 0.05
    },
  }
}

/**
 * Mannequin de frappe (face à +z) : un buste et une tête de caoutchouc couleur chair sur sa colonne,
 * le socle lesté d'eau, et la mine impassible de celui qui en a vu d'autres.
 */
const boxingDummy: Builder = () => {
  const g = new THREE.Group()
  const skin = lit('#d9a07a', 'leather'), black = lit('#1c1d21')
  g.add(cylinder(0.16, 0.18, 0.13, black, 0, 0.065, 0, 20), cylinder(0.12, 0.15, 0.03, lit('#2a2c31'), 0, 0.145, 0, 20))
  g.add(cylinder(0.055, 0.065, 0.2, black, 0, 0.25, 0, 14))
  // Le buste : les pectoraux, les abdos, les épaules.
  g.add(box(0.26, 0.2, 0.14, skin, 0, 0.44, 0, 0.05), box(0.3, 0.07, 0.12, skin, 0, 0.52, -0.005, 0.03))
  for (const x of [-0.055, 0.055]) g.add(box(0.1, 0.06, 0.02, lit('#c98e68', 'leather'), x, 0.49, 0.068, 0.01))
  for (const y of [0.37, 0.41]) for (const x of [-0.03, 0.03]) g.add(box(0.045, 0.03, 0.015, lit('#c98e68', 'leather'), x, y, 0.069, 0.006))
  g.add(cylinder(0.04, 0.045, 0.05, skin, 0, 0.575, 0, 10))
  // La tête : le crâne rasé, les sourcils froncés, la bouche serrée.
  g.add(sphere(0.075, skin, 0, 0.65, 0, 14))
  for (const x of [-0.026, 0.026]) g.add(box(0.016, 0.012, 0.01, black, x, 0.66, 0.068), box(0.032, 0.008, 0.01, black, x, 0.683, 0.066))
  g.add(box(0.04, 0.008, 0.01, lit('#8a4a3a'), 0, 0.622, 0.07), box(0.014, 0.022, 0.016, lit('#c98e68', 'leather'), 0, 0.645, 0.074))
  return { solid: g }
}

/** Un gant de boxe, pendu par son lacet (le haut du gant au point d'attache). */
function glove(color: string, cuff: string, x: number, y: number, z: number, tilt: number): THREE.Group {
  const g = new THREE.Group()
  g.add(box(0.075, 0.1, 0.07, lit(color, 'leather'), 0, -0.07, 0, 0.03))
  g.add(box(0.03, 0.06, 0.04, lit(color, 'leather'), 0.045, -0.06, 0.012, 0.014))
  g.add(box(0.066, 0.045, 0.062, lit(cuff), 0, -0.14, 0, 0.012))
  g.add(box(0.004, 0.03, 0.004, lit('#e8e8e0'), 0, -0.012, 0))
  g.position.set(x, y, z)
  g.rotation.z = tilt
  return g
}

/**
 * Porte-gants (dos au mur) : une barre de crochets, trois paires de gants (rouge, bleue, noire),
 * deux cordes à sauter et des bandes de mains roulées sur la tablette.
 */
const gloveRack: Builder = () => {
  const g = new THREE.Group()
  const chrome = lit(C.chrome, 'metal')
  g.add(barX(0.01, 0.66, chrome, 0, 0.66, 0.05, 6))
  for (const x of [-0.3, 0.3]) g.add(box(0.025, 0.04, 0.06, chrome, x, 0.66, 0.03))
  const pairs: [string, string][] = [['#c8373a', '#f2f2f2'], ['#2453a8', '#f2f2f2'], ['#1c1d21', '#c8373a']]
  pairs.forEach(([color, cuff], i) => {
    const x = -0.2 + i * 0.16
    g.add(box(0.008, 0.03, 0.03, chrome, x, 0.645, 0.06))
    g.add(glove(color, cuff, x - 0.03, 0.645, 0.075, 0.12), glove(color, cuff, x + 0.03, 0.645, 0.09, -0.1))
  })
  // Deux cordes à sauter : les poignées accrochées, la corde qui pend en boucle.
  for (const [x, color] of [[0.27, '#ffb02e'], [0.32, '#39c6ff']] as const) {
    for (const dx of [-0.018, 0.018]) g.add(cylinder(0.009, 0.009, 0.08, lit('#1c1d21'), x + dx, 0.6, 0.06, 6))
    const loop = part(new THREE.TorusGeometry(0.03, 0.004, 4, 14, Math.PI), lit(color), x, 0.56, 0.06)
    loop.rotation.z = Math.PI
    g.add(loop)
  }
  // La tablette, et les bandes de mains roulées.
  g.add(box(0.66, 0.015, 0.1, lit(C.wood, 'wood'), 0, 0.8, 0.05))
  const wraps = ['#c8373a', '#f2f2f2', '#2453a8', '#1c1d21', '#ffb02e']
  wraps.forEach((color, i) => g.add(barZ(0.022, 0.05, lit(color, 'cloth'), -0.24 + i * 0.07, 0.83, 0.06, 10)))
  return { solid: g }
}

/**
 * Chrono des rounds de boxe (dos au mur) : trois minutes de travail en rouge, une de repos en vert,
 * le numéro du round, et ses deux voyants.
 */
const roundTimer: Builder = () => {
  const g = new THREE.Group()
  const Y = 0.86
  g.add(box(0.3, 0.13, 0.04, lit(C.rubberDark), 0, Y, 0.02, 0.008))
  const screen = animatedScreen(160, 64, 2, (c, t) => {
    const cycle = t % 240
    const work = cycle < 180
    const left = Math.ceil(work ? 180 - cycle : 240 - cycle)
    const round = (Math.floor(t / 240) % 12) + 1
    c.fillStyle = '#07080a'
    c.fillRect(0, 0, 160, 64)
    const color = work ? '#ff3b2f' : '#3dff7a'
    c.fillStyle = color
    c.font = 'bold 34px monospace'
    c.textAlign = 'right'
    c.textBaseline = 'middle'
    c.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 152, 34)
    c.textAlign = 'left'
    c.font = 'bold 18px monospace'
    c.fillText(`R${round}`, 8, 22)
    c.fillStyle = work ? '#ff3b2f' : '#3a1210'
    c.beginPath(); c.arc(14, 46, 5, 0, Math.PI * 2); c.fill()
    c.fillStyle = work ? '#123a1c' : '#3dff7a'
    c.beginPath(); c.arc(30, 46, 5, 0, Math.PI * 2); c.fill()
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.27, 0.105), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, Y, 0.041))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

/**
 * Règlement de la salle (dos au mur), punaisé : un titre, et les cinq règles d'or de la salle de
 * sport du bord.
 */
const gymRules: Builder = () => {
  const texture = drawnTexture(240, 320, (c) => {
    c.fillStyle = '#f4f1e8'
    c.fillRect(0, 0, 240, 320)
    c.fillStyle = '#c8373a'
    c.fillRect(0, 0, 240, 56)
    c.fillStyle = '#ffffff'
    c.font = '800 26px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText(tr('RÈGLEMENT', 'GYM RULES'), 120, 38)
    c.fillStyle = '#2a2c31'
    c.textAlign = 'left'
    c.font = '600 15px system-ui, sans-serif'
    const rules = [
      tr('1. Serviette obligatoire.', '1. Towel required.'),
      tr('2. Rangez vos poids.', '2. Re-rack your weights.'),
      tr('3. Nettoyez l’appareil.', '3. Wipe the machine.'),
      tr('4. Pas de saut FSD', '4. No FSD jumps'),
      tr('    sur le tapis.', '    on the treadmill.'),
      tr('5. Le sac ne riposte pas.', '5. The bag never hits back.'),
      tr('    Le sergent, si.', '    The sergeant does.'),
    ]
    rules.forEach((r, i) => c.fillText(r, 16, 92 + i * 30))
    c.fillStyle = '#8a8f99'
    c.font = 'italic 13px system-ui, sans-serif'
    c.fillText(tr('— La direction. o7', '— The management. o7'), 16, 304)
  })
  const g = new THREE.Group()
  g.add(mesh(new THREE.PlaneGeometry(0.33, 0.44), new THREE.MeshLambertMaterial({ map: texture }), 0, 0.62, 0.012))
  g.add(cylinder(0.012, 0.012, 0.01, lit('#c8373a'), 0, 0.82, 0.02, 8).rotateX(Math.PI / 2))
  return { solid: g }
}

// ---------------------------------------------------------------- sol : rangements

/** Disque de fonte ou de caoutchouc, debout (axe le long de z). */
function plate(r: number, color: string, x: number, y: number, z: number): THREE.Mesh {
  return barZ(r, 0.03, lit(color), x, y, z, 18)
}

/**
 * Arbre à disques : un mât sur son pied, six cornes, et les disques olympiques rangés par poids
 * (rouge 25, bleu 20, jaune 15, vert 10, et la fonte noire).
 */
const plateTree: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steelDark, 'metal'), chrome = lit(C.chrome, 'metal')
  g.add(box(0.4, 0.035, 0.12, steel, 0, 0.018, 0), box(0.12, 0.035, 0.44, steel, 0, 0.018, 0))
  g.add(box(0.06, 0.66, 0.06, steel, 0, 0.36, 0), box(0.07, 0.02, 0.07, chrome, 0, 0.7, 0))
  const stacks: [number, [number, string][]][] = [
    [0.17, [[0.15, '#c8373a'], [0.15, '#c8373a']]],
    [0.37, [[0.14, '#2453a8'], [0.12, '#e3b81e']]],
    [0.56, [[0.1, '#2e9b4f'], [0.08, '#1c1d21'], [0.06, '#1c1d21']]],
  ]
  for (const side of [-1, 1]) {
    for (const [y, plates] of stacks) {
      g.add(barZ(0.018, 0.16, chrome, 0, y, side * 0.1, 8))
      plates.forEach(([r, color], i) => g.add(plate(r, color, 0, y, side * (0.05 + i * 0.035)), barZ(0.03, 0.032, chrome, 0, y, side * (0.05 + i * 0.035), 10)))
    }
  }
  return { solid: g }
}

/** Kettlebell : la boule, le méplat, et l'anse ; la couleur dit le poids. */
function kettlebell(r: number, color: string, x: number, y: number, z: number): THREE.Group {
  const k = new THREE.Group()
  const body = lit(color)
  k.add(sphere(r, body, 0, r, 0, 14), cylinder(r * 0.7, r * 0.7, r * 0.2, body, 0, r * 0.1, 0, 12))
  const handle = mesh(new THREE.TorusGeometry(r * 0.6, r * 0.16, 6, 14, Math.PI), lit('#25272c', 'metal'), 0, r * 1.75, 0)
  k.add(handle)
  k.position.set(x, y, z)
  return k
}

/**
 * Râtelier à kettlebells (dos à -z) : deux étagères d'acier, les petits poids en haut, les gros en
 * bas, et un médecine-ball posé au bout.
 */
const kettlebellRack: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steelDark, 'metal')
  const W = 0.72
  for (const x of [-W / 2, W / 2]) g.add(box(0.035, 0.38, 0.28, steel, x, 0.19, 0))
  for (const y of [0.05, 0.25]) g.add(box(W, 0.02, 0.26, steel, 0, y, 0), box(W, 0.03, 0.012, lit('#e9b51c'), 0, y + 0.005, 0.131))
  const top = [['#ff7eb6', 0.042], ['#2f7de0', 0.046], ['#f2c230', 0.05], ['#8a5cf5', 0.054]] as const
  top.forEach(([color, r], i) => g.add(kettlebell(r, color, -0.26 + i * 0.17, 0.26, 0.01)))
  const bottom = [['#2e9b4f', 0.06], ['#ff8a1c', 0.064], ['#c8373a', 0.068]] as const
  bottom.forEach(([color, r], i) => g.add(kettlebell(r, color, -0.22 + i * 0.22, 0.06, 0.01)))
  return { solid: g }
}

/**
 * Coin nettoyage (dos au mur) : le distributeur d'essuie-tout, deux pulvérisateurs, le gel pour
 * les mains, la petite poubelle, et la consigne.
 */
const cleaningStation: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steelDark, 'metal'), white = lit(C.white)
  g.add(box(0.05, 0.72, 0.04, steel, 0, 0.36, 0.03), box(0.3, 0.03, 0.22, steel, 0, 0.015, 0.11))
  g.add(box(0.2, 0.17, 0.11, white, 0, 0.68, 0.08, 0.02), box(0.12, 0.012, 0.02, lit('#d9dde2'), 0, 0.59, 0.13))
  g.add(box(0.26, 0.015, 0.12, steel, 0, 0.42, 0.08))
  for (const x of [-0.08, 0.08]) {
    g.add(cylinder(0.024, 0.026, 0.1, lit('#39b6ff'), x, 0.48, 0.08, 10))
    g.add(box(0.03, 0.035, 0.05, lit('#f2f2f2'), x, 0.545, 0.085), box(0.01, 0.03, 0.01, lit('#f2f2f2'), x, 0.525, 0.11))
  }
  g.add(box(0.06, 0.1, 0.045, white, 0.14, 0.53, 0.05, 0.01), box(0.012, 0.025, 0.012, lit('#2ecc71'), 0.14, 0.59, 0.06))
  g.add(cylinder(0.08, 0.07, 0.2, lit('#59616e', 'metal'), 0, 0.12, 0.12, 14), cylinder(0.082, 0.082, 0.015, lit('#2a2c31'), 0, 0.225, 0.12, 14))
  const sign = drawnTexture(200, 90, (c) => {
    c.fillStyle = '#2ecc71'
    c.fillRect(0, 0, 200, 90)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.font = '800 20px system-ui, sans-serif'
    c.fillText(tr('APRÈS LA SÉANCE,', 'AFTER YOUR SET,'), 100, 36)
    c.fillText(tr('ON NETTOIE !', 'WIPE IT DOWN!'), 100, 66)
  })
  g.add(mesh(new THREE.PlaneGeometry(0.2, 0.09), new THREE.MeshLambertMaterial({ map: sign }), 0, 0.84, 0.051))
  g.add(box(0.21, 0.1, 0.02, steel, 0, 0.84, 0.04))
  return { solid: g }
}

/** Petite étagère de serviettes roulées, au bout du banc (dos à -z). */
const towelShelf: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.wood, 'wood')
  for (const x of [-0.16, 0.16]) g.add(box(0.025, 0.42, 0.22, wood, x, 0.21, 0))
  for (const y of [0.02, 0.2, 0.4]) g.add(box(0.34, 0.018, 0.22, wood, 0, y, 0))
  const colors = ['#f4f4f0', '#f4f4f0', '#9fd8ff', '#f4f4f0', '#9fd8ff', '#f4f4f0']
  colors.forEach((color, i) => g.add(barZ(0.042, 0.18, lit(color, 'cloth'), -0.095 + (i % 3) * 0.095, i < 3 ? 0.072 : 0.252, 0, 12)))
  return { solid: g }
}

export const GYM = {
  'gym-floor': gymFloor,
  'gym-mat': gymMat,
  'gym-logo': gymLogo,
  'gym-sign': gymSign,
  'gym-mirror': gymMirror,
  'speed-bag': speedBag,
  'boxing-dummy': boxingDummy,
  'glove-rack': gloveRack,
  'round-timer': roundTimer,
  'gym-rules': gymRules,
  'plate-tree': plateTree,
  'kettlebell-rack': kettlebellRack,
  'cleaning-station': cleaningStation,
  'towel-shelf': towelShelf,
} satisfies Record<string, Builder>
