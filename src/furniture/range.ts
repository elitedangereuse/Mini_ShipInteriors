import * as THREE from 'three'
import { BLASTER_PACK } from '../assets'
import { tr } from '../i18n'
import { rangeState, weaponById, WEAPONS } from '../range-weapons'
import { box, cylinder, decal, drawnTexture, glass, glow, lit, part, type Builder } from './kit'
import { kitModel } from './nature'

/*
 * Stand de tir de la cale, à la place de l'ancienne baie de réparation : le pas de tir (un comptoir
 * qui traverse la pièce, ses vitres entre les couloirs, ses feux), le couloir de tir (sol, fentes
 * lumineuses des cibles, mousse acoustique, pare-balles, enseigne), le tapis des tireurs, les armes
 * au mur (une par support : on la décroche, cf. main.ts), le règlement, les caisses et les cibles
 * de rechange. Armes et caisses viennent du Blaster Kit de Kenney (cf.
 * scripts/import-kenney-blaster.mjs) ; les cibles, elles, sont sorties par le jeu (cf. src/range.ts).
 *
 * Ce qui change avec la partie (feux rouges, support vide) se lit dans `rangeState`.
 */

const C = {
  steel: '#4a4f58',
  steelDark: '#2a2d33',
  steelDeep: '#1e2126',
  rubber: '#1b1c20',
  top: '#34373e',
  hazard: '#e9a917',
  black: '#17181b',
  plaque: '#23262c',
  panel: '#30343b',
  foam: '#3a3e47',
  foamDark: '#2b2e36',
  orange: '#ff8a1c',
  idle: '#39d98a',
  live: '#ff3b2f',
  led: '#5fd8ff',
}
const MONO = 'ui-monospace, Menlo, monospace'

const blaster = (file: string, s: number, x = 0, z = 0, turn = 0, y = 0) => kitModel(file, s, x, z, turn, y, { pack: BLASTER_PACK })

/** Largeur de la pièce entre ses murs (cf. SHOOTING_RANGE) : le comptoir et le pare-balles vont de l'un à l'autre. */
const WIDTH = 4.7
/** Couloirs de tir. */
const LANES = 4
const LANE = WIDTH / LANES

/** Voyant du stand : vert au repos, rouge et clignotant pendant une partie. */
function statusLamp(size: number): { mesh: THREE.Mesh; tick: (t: number) => void } {
  const material = new THREE.MeshBasicMaterial({ color: C.idle })
  const mesh = part(new THREE.SphereGeometry(size, 10, 8), material)
  return {
    mesh,
    tick: (t) => { material.color.set(!rangeState.live ? C.idle : (t * 1.6) % 1 < 0.65 ? C.live : '#4a1210') },
  }
}

/**
 * Pas de tir : un comptoir bas, d'un mur à l'autre. Côté tireur, un liseré de danger, un bandeau
 * lumineux sous le plateau et le numéro de chaque couloir ; sur le plateau, un tapis par couloir ;
 * entre les couloirs, une vitre teintée sur son montant, coiffée d'un voyant.
 */
const rangeCounter: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  g.add(box(WIDTH, 0.27, 0.22, lit(C.steelDark, 'metal'), 0, 0.135, 0), box(WIDTH, 0.04, 0.34, lit(C.top, 'metal'), 0, 0.29, 0))
  g.add(box(WIDTH, 0.05, 0.26, lit(C.steelDeep, 'metal'), 0, 0.025, 0))
  // Liseré jaune et noir sur le chant, côté tireur ; dessous, le bandeau lumineux.
  const seg = WIDTH / 46
  for (let i = 0; i < 46; i++) g.add(box(seg, 0.04, 0.012, lit(i % 2 ? C.black : C.hazard), -WIDTH / 2 + (i + 0.5) * seg, 0.29, 0.176))
  live.add(box(WIDTH - 0.1, 0.012, 0.01, glow(C.orange), 0, 0.262, 0.116))
  const lamps: ((t: number) => void)[] = []
  for (let i = 0; i < LANES; i++) {
    const x = -WIDTH / 2 + (i + 0.5) * LANE
    // Tapis de caoutchouc du couloir, et sa plaque numérotée sur la façade.
    g.add(box(LANE - 0.22, 0.008, 0.24, lit(C.rubber), x, 0.314, -0.02, 0.003))
    const plate = drawnTexture(128, 64, (c) => {
      c.fillStyle = '#14161a'
      c.fillRect(0, 0, 128, 64)
      c.strokeStyle = C.orange
      c.lineWidth = 4
      c.strokeRect(3, 3, 122, 58)
      c.fillStyle = '#ffe2bd'
      c.font = `700 44px ${MONO}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(String(i + 1).padStart(2, '0'), 64, 35)
    })
    live.add(part(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ map: plate }), x, 0.14, 0.112))
  }
  // Séparations : aux deux bouts et entre les couloirs.
  for (let i = 0; i <= LANES; i++) {
    const x = THREE.MathUtils.clamp(-WIDTH / 2 + i * LANE, -WIDTH / 2 + 0.03, WIDTH / 2 - 0.03)
    g.add(box(0.036, 0.4, 0.036, lit(C.steel, 'metal'), x, 0.51, 0.14), box(0.05, 0.02, 0.3, lit(C.steel, 'metal'), x, 0.32, 0))
    live.add(part(new THREE.BoxGeometry(0.01, 0.34, 0.26), glass('#ffb060', 0.2), x, 0.5, -0.006))
    const lamp = statusLamp(0.022)
    lamp.mesh.position.set(x, 0.73, 0.14)
    live.add(lamp.mesh)
    lamps.push(lamp.tick)
  }
  // Chargeurs oubliés sur le comptoir.
  g.add(blaster('clip-small', 0.42, -1.5, -0.04, 0.5, 0.318), blaster('clip-large', 0.42, 0.95, 0.03, 1.9, 0.318), blaster('clip-small', 0.42, 1.08, -0.05, 0.2, 0.318))
  return { solid: g, live, update: (t) => { for (const tick of lamps) tick(t) } }
}

/**
 * Couloir de tir, côté cibles (origine au pied du mur du fond, contenu vers +z). Au fond, le
 * pare-balles : des plaques d'acier inclinées dans leur cadre, quatre projecteurs, et par-dessus
 * l'enseigne du stand et son voyant. Au sol, un revêtement sombre, les lignes des couloirs, les
 * distances, et les trois fentes lumineuses d'où sortent les cibles (cf. ROWS dans src/range.ts).
 * Le long des murs, de la mousse acoustique.
 */
const rangeLane: Builder = () => {
  const g = new THREE.Group(), live = new THREE.Group()
  const depth = 2.48
  // Pare-balles.
  g.add(box(WIDTH, 0.08, 0.14, lit(C.steelDark, 'metal'), 0, 0.04, 0.07), box(WIDTH, 0.07, 0.14, lit(C.steelDark, 'metal'), 0, 0.965, 0.07))
  for (let i = 0; i < 6; i++) {
    const plate = box(WIDTH - 0.16, 0.17, 0.02, lit(i % 2 ? '#2e3138' : '#3d414a', 'metal'), 0, 0.15 + i * 0.145, 0.06)
    plate.rotation.x = 0.4
    g.add(plate)
  }
  for (const side of [-1, 1]) {
    const x = side * (WIDTH / 2 - 0.05)
    for (let i = 0; i < 9; i++) g.add(box(0.1, 0.1, 0.15, lit(i % 2 ? C.black : C.hazard), x, 0.13 + i * 0.1, 0.075))
  }
  for (let i = 0; i < LANES; i++) {
    const x = -WIDTH / 2 + (i + 0.5) * LANE
    g.add(box(0.16, 0.05, 0.09, lit(C.steel, 'metal'), x, 0.955, 0.17))
    live.add(box(0.12, 0.012, 0.07, glow('#fff3d6'), x, 0.925, 0.175))
  }
  // Enseigne, au-dessus du mur.
  g.add(box(1.74, 0.26, 0.05, lit(C.steelDeep, 'metal'), 0, 1.15, 0.045), box(0.05, 0.06, 0.05, lit(C.steel, 'metal'), -0.6, 1.02, 0.045), box(0.05, 0.06, 0.05, lit(C.steel, 'metal'), 0.6, 1.02, 0.045))
  const sign = drawnTexture(768, 104, (c) => {
    c.fillStyle = '#101216'
    c.fillRect(0, 0, 768, 104)
    c.strokeStyle = C.orange
    c.lineWidth = 5
    c.strokeRect(5, 5, 758, 94)
    c.fillStyle = '#ffd9a8'
    c.font = `800 58px ${MONO}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('STAND DE TIR', 'SHOOTING RANGE'), 384, 56)
  })
  live.add(part(new THREE.PlaneGeometry(1.5, 0.2), new THREE.MeshBasicMaterial({ map: sign }), -0.08, 1.15, 0.072))
  const lamp = statusLamp(0.045)
  lamp.mesh.position.set(0.77, 1.15, 0.075)
  live.add(lamp.mesh)

  // Sol.
  const floor = drawnTexture(1024, 544, (c) => {
    c.fillStyle = '#23262d'
    c.fillRect(0, 0, 1024, 544)
    // Grain du revêtement.
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)'
      c.fillRect((i * 389) % 1024, (i * 211) % 544, 2, 2)
    }
    c.strokeStyle = 'rgba(233,169,23,0.85)'
    c.lineWidth = 4
    for (let i = 1; i < LANES; i++) {
      c.beginPath(); c.moveTo((1024 * i) / LANES, 14); c.lineTo((1024 * i) / LANES, 530); c.stroke()
    }
    c.font = `700 30px ${MONO}`
    c.textBaseline = 'middle'
    ;[[0.2, '25'], [1.0, '15'], [1.8, '10']].forEach(([z, label]) => {
      const y = ((z as number) / depth) * 544
      c.fillStyle = '#050607'
      c.fillRect(22, y - 9, 980, 18)
      c.fillStyle = '#c9ced6'
      for (let i = 0; i < LANES; i++) c.fillText(`${label} m`, (1024 * i) / LANES + 14, y + 34)
    })
    // Bande de danger au pied du comptoir : on ne passe pas.
    for (let x = -40; x < 1024; x += 44) {
      c.fillStyle = C.hazard
      c.beginPath(); c.moveTo(x, 544); c.lineTo(x + 22, 544); c.lineTo(x + 44, 516); c.lineTo(x + 22, 516); c.fill()
    }
    c.strokeStyle = '#c9ced6'
    c.lineWidth = 6
    c.strokeRect(3, 3, 1018, 538)
  })
  const ground = decal(floor, WIDTH, depth)
  ;(ground.material as THREE.MeshLambertMaterial).transparent = false
  ground.position.z = depth / 2 + 0.02
  live.add(ground)
  // Fentes des cibles : un filet de lumière dans chacune.
  for (const z of [0.2, 1.0, 1.8]) live.add(box(WIDTH - 0.24, 0.004, 0.012, glow(C.led), 0, 0.012, z))

  // Mousse acoustique le long des deux murs, sous un bandeau lumineux.
  for (const side of [-1, 1]) {
    const x = side * (WIDTH / 2 - 0.02)
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) g.add(box(0.04, 0.36, 0.36, lit((i + row) % 2 ? C.foam : C.foamDark), x, 0.24 + row * 0.4, 0.34 + i * 0.39))
    }
    live.add(box(0.012, 0.012, depth - 0.3, glow(C.orange), side * (WIDTH / 2 - 0.045), 0.87, depth / 2 + 0.05))
  }
  return { solid: g, live, update: lamp.tick }
}

/**
 * Tapis des tireurs, devant le comptoir : caoutchouc antidérapant bordé de jaune, et pour chaque
 * couloir son numéro et deux semelles peintes.
 */
const rangeMat: Builder = () => {
  const W = 4.5, D = 1.05
  const mat = drawnTexture(1024, 240, (c) => {
    c.fillStyle = '#1a1c21'
    c.fillRect(0, 0, 1024, 240)
    // Pastilles antidérapantes.
    c.fillStyle = 'rgba(255,255,255,0.06)'
    for (let y = 14; y < 240; y += 18) for (let x = (y / 18) % 2 ? 12 : 21; x < 1024; x += 18) c.fillRect(x, y, 6, 6)
    c.strokeStyle = C.hazard
    c.lineWidth = 8
    c.strokeRect(6, 6, 1012, 228)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let i = 0; i < LANES; i++) {
      const x = (1024 * (i + 0.5)) / LANES
      c.fillStyle = 'rgba(233,169,23,0.9)'
      c.font = `800 54px ${MONO}`
      c.fillText(String(i + 1).padStart(2, '0'), x, 176)
      c.fillStyle = 'rgba(233,236,240,0.8)'
      for (const dx of [-26, 26]) { c.beginPath(); c.ellipse(x + dx, 78, 13, 30, 0, 0, Math.PI * 2); c.fill() }
      if (i) {
        c.fillStyle = 'rgba(233,236,240,0.25)'
        c.fillRect((1024 * i) / LANES - 2, 22, 4, 196)
      }
    }
  })
  const live = new THREE.Group()
  const rug = decal(mat, W, D, 0.008)
  ;(rug.material as THREE.MeshLambertMaterial).transparent = false
  live.add(rug)
  return { live }
}

/**
 * Support mural d'une arme (`label` : `pistol`, `smg` ou `rifle` ; dos au mur, contenu vers +z) :
 * une plaque, deux crochets, l'arme couchée dessus, son nom et sa fiche, un liseré à la couleur de
 * son tir. On l'y prend, on l'y remet (cf. main.ts) : le support est vide tant qu'on l'a en main.
 */
const rangeWeapon: Builder = ({ label }) => {
  const w = weaponById(label) ?? WEAPONS[0]
  const g = new THREE.Group(), live = new THREE.Group()
  g.add(box(0.72, 0.62, 0.03, lit(C.plaque), 0, 0.62, 0.015, 0.008), box(0.66, 0.34, 0.006, lit(C.panel), 0, 0.72, 0.032))
  for (const x of [-0.12, 0.14]) g.add(box(0.03, 0.02, 0.09, lit(C.steel, 'metal'), x, 0.655, 0.07), box(0.03, 0.045, 0.014, lit(C.steel, 'metal'), x, 0.668, 0.112))
  const gun = blaster(w.model, w.id === 'rifle' ? 0.42 : 0.5, 0, 0.075, Math.PI / 2)
  gun.position.y = 0.73 - new THREE.Box3().setFromObject(gun).getSize(new THREE.Vector3()).y / 2
  live.add(gun)
  const card = drawnTexture(384, 128, (c) => {
    c.fillStyle = '#121418'
    c.fillRect(0, 0, 384, 128)
    c.fillStyle = w.color
    c.fillRect(0, 0, 10, 128)
    c.fillStyle = '#f3f5f8'
    c.font = `800 44px ${MONO}`
    c.textBaseline = 'middle'
    c.fillText(w.name.toUpperCase(), 28, 44)
    c.fillStyle = '#a9b3c0'
    c.font = `600 24px ${MONO}`
    const mode = w.auto ? tr('automatique', 'automatic') : w.pierce ? tr('perforant', 'piercing') : tr('coup par coup', 'semi-auto')
    c.fillText(`${w.mag} ${tr('coups', 'rounds')} · ${mode}`, 28, 94)
  })
  live.add(part(new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshBasicMaterial({ map: card }), 0, 0.43, 0.034))
  const strip = new THREE.MeshBasicMaterial({ color: w.color })
  live.add(part(new THREE.BoxGeometry(0.66, 0.014, 0.012), strip, 0, 0.905, 0.034))
  const on = new THREE.Color(w.color), off = new THREE.Color(w.color).multiplyScalar(0.22)
  return {
    solid: g,
    live,
    update: () => {
      const taken = rangeState.weapon === w.id
      gun.visible = !taken
      strip.color.copy(taken ? off : on)
    },
  }
}

/** Règlement du stand (dos au mur) : un panneau de sécurité, pictogramme et consignes. */
const rangeRules: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.4, 0.52, 0.02, lit(C.plaque), 0, 0.66, 0.01))
  const sheet = drawnTexture(256, 352, (c) => {
    c.fillStyle = '#e8e4d6'
    c.fillRect(0, 0, 256, 352)
    c.fillStyle = C.hazard
    c.fillRect(0, 0, 256, 64)
    c.fillStyle = '#17181b'
    c.font = `800 30px ${MONO}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('RÈGLEMENT', 'RULES'), 128, 34)
    // Pictogramme : une cible.
    c.strokeStyle = '#b3261e'
    c.lineWidth = 9
    for (const r of [44, 22]) { c.beginPath(); c.arc(128, 132, r, 0, Math.PI * 2); c.stroke() }
    c.fillStyle = '#b3261e'
    c.beginPath(); c.arc(128, 132, 7, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#3a3d44'
    for (let i = 0; i < 6; i++) c.fillRect(28, 206 + i * 22, i % 3 === 2 ? 130 : 200, 8)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.36, 0.48), new THREE.MeshLambertMaterial({ map: sheet }), 0, 0.66, 0.022))
  return { solid: g, live }
}

/** Caisse de munitions du kit, couvercle ouvert (`label` : `medium` pour la courte). */
const rangeCrate: Builder = ({ label }) => ({ solid: blaster(label === 'medium' ? 'crate-medium' : 'crate-wide', 0.62) })

/** Cibles de rechange (dos au mur) : trois disques appuyés contre le mur, un chargeur au pied. */
const rangeSpares: Builder = () => {
  const g = new THREE.Group()
  ;[[-0.14, 'target-large', 0.2], [0.06, 'target-large', 0.26], [0.22, 'target-small', 0.16]].forEach(([x, file, lean], i) => {
    const disc = blaster(file as string, 1, x as number, 0.06 + i * 0.03, Math.PI / 2)
    disc.rotation.x = -(lean as number)
    g.add(disc)
  })
  g.add(cylinder(0.05, 0.05, 0.012, lit(C.steelDark, 'metal'), -0.3, 0.006, 0.1, 12), blaster('clip-large', 0.42, -0.3, 0.1, 0.6, 0.012))
  return { solid: g }
}

export const RANGE = {
  'range-counter': rangeCounter,
  'range-lane': rangeLane,
  'range-mat': rangeMat,
  'range-weapon': rangeWeapon,
  'range-rules': rangeRules,
  'range-crate': rangeCrate,
  'range-spares': rangeSpares,
} satisfies Record<string, Builder>
