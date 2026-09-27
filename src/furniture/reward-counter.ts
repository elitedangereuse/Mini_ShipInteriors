import * as THREE from 'three'
import { animatedScreen, box, cylinder, drawnTexture, glow, holoMaterial, lit, mesh, part, pointCloud, type Builder } from './kit'
import { counterStaff } from './counter-staff'
import { tr } from '../i18n'

/*
 * Les deux comptoirs de la salle des machines, où l'on récupère les crédits gagnés sur le site :
 * - Weekly : le bureau des missions de l'officier de liaison, or sur bleu nuit, comme un tableau
 *   de missions d'Elite ; un hologramme de la récompense tourne sur le bureau ;
 * - LJPC : le comptoir de la scientifique de la Chasse galactique, un bureau de labo blanc et
 *   sarcelle ; la carte de la galaxie pointe la cible, une galaxie holographique tourne à côté
 *   des éprouvettes.
 * Même emprise pour les deux (adossés au mur, dos à -z, 1,42 × 1,14) : le socle réserve la place
 * du personnel.
 */

interface CounterTheme {
  accent: string
  /** Fond des écrans. */
  deep: string
  /** Panneau du fond et montants. */
  panel: string
  /** Caisson du bureau. */
  desk: string
  /** Plateau. */
  top: string
  name: string
  sub: string
}

const THEMES: Record<'weekly' | 'hunt', CounterTheme> = {
  weekly: {
    accent: '#ffc270', deep: '#0f1c29', panel: '#1d2c3a', desk: '#2b3b4b', top: '#c9d3db',
    name: 'WEEKLY', sub: tr('OFFICIER DE LIAISON', 'LIAISON OFFICER'),
  },
  hunt: {
    accent: '#57e6c1', deep: '#0a1f24', panel: '#28444b', desk: '#dfe8ea', top: '#f4f8f8',
    name: 'LJPC', sub: tr('RECHERCHE GALACTIQUE', 'GALACTIC RESEARCH'),
  },
}

const W = 1.42
/** Hauteur du plateau du bureau. */
const TOP = 0.43

/** Coins coupés, à la façon des interfaces d'Elite. */
function chamfer(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number) {
  c.beginPath()
  c.moveTo(x + cut, y)
  c.lineTo(x + w, y)
  c.lineTo(x + w, y + h - cut)
  c.lineTo(x + w - cut, y + h)
  c.lineTo(x, y + h)
  c.lineTo(x, y + cut)
  c.closePath()
}

/** Petit générateur déterministe : le dessin des écrans est le même chez tout le monde. */
function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// ---------------------------------------------------------------- écrans du fond

/** Tableau des missions de la semaine : une ligne après l'autre passe en surbrillance. */
function missionBoard(th: CounterTheme) {
  const missions = [
    tr('Livraison de données · Jameson Memorial', 'Data delivery · Jameson Memorial'),
    tr('Exploration · trois systèmes inconnus', 'Exploration · three unknown systems'),
    tr('Minage · 20 t de platine', 'Mining · 20 t of platinum'),
    tr('Soutien · un appel des Fuel Rats', 'Support · a Fuel Rats call'),
  ]
  return animatedScreen(768, 320, 3, (c, t) => {
    const g = c.createLinearGradient(0, 0, 768, 320)
    g.addColorStop(0, '#17324a'); g.addColorStop(1, th.deep)
    c.fillStyle = g; c.fillRect(0, 0, 768, 320)
    c.strokeStyle = th.accent; c.lineWidth = 4
    chamfer(c, 8, 8, 752, 304, 28); c.stroke()
    // Bandeau de titre, texte découpé dedans.
    c.fillStyle = th.accent
    chamfer(c, 26, 24, 716, 50, 16); c.fill()
    c.fillStyle = th.deep; c.font = 'bold 30px sans-serif'; c.textBaseline = 'middle'
    c.fillText(tr('BUREAU DES MISSIONS', 'MISSION BOARD'), 48, 50)
    c.textAlign = 'right'; c.fillText('WEEKLY', 720, 50); c.textAlign = 'left'
    const active = Math.floor(t / 1.6) % missions.length
    missions.forEach((m, i) => {
      const y = 104 + i * 44
      if (i === active) {
        c.fillStyle = 'rgba(255, 194, 112, 0.2)'; c.fillRect(26, y - 18, 716, 38)
        c.fillStyle = th.accent; c.fillRect(26, y - 18, 5, 38)
      }
      c.strokeStyle = th.accent; c.lineWidth = 3; c.strokeRect(46, y - 11, 22, 22)
      if (i < 2) {
        c.beginPath(); c.moveTo(50, y); c.lineTo(56, y + 7); c.lineTo(66, y - 8); c.stroke()
      }
      c.fillStyle = i === active ? '#ffffff' : '#c8d8e6'; c.font = '24px sans-serif'
      c.fillText(m, 84, y + 1)
      c.fillStyle = th.accent; c.font = 'bold 24px sans-serif'; c.textAlign = 'right'
      c.fillText('10 000 CR', 724, y + 1); c.textAlign = 'left'
    })
    // Avancée de la semaine.
    c.fillStyle = '#9fb6c8'; c.font = '18px sans-serif'
    c.fillText(tr('PROGRESSION DE LA SEMAINE', 'WEEKLY PROGRESS'), 46, 290)
    c.fillStyle = 'rgba(255, 194, 112, 0.25)'; c.fillRect(330, 283, 394, 12)
    c.fillStyle = th.accent; c.fillRect(330, 283, 197 + Math.sin(t * 0.5) * 6, 12)
  })
}

/** Carte de la galaxie : les bras spiraux, et la cible de la chasse qu'un anneau pointe. */
function huntMap(th: CounterTheme) {
  const random = seeded(3310)
  const stars: [number, number, number][] = []
  for (let i = 0; i < 260; i++) {
    const arm = i % 2, r = Math.pow(random(), 0.7) * 118
    const a = arm * Math.PI + r * 0.05 + (random() - 0.5) * 0.7
    stars.push([Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.62, random()])
  }
  const target = { x: 244 + 58, y: 180 - 22 }
  return animatedScreen(768, 320, 6, (c, t) => {
    c.fillStyle = th.deep; c.fillRect(0, 0, 768, 320)
    c.strokeStyle = 'rgba(87, 230, 193, 0.12)'; c.lineWidth = 1
    for (let x = 20; x < 768; x += 32) { c.beginPath(); c.moveTo(x, 70); c.lineTo(x, 310); c.stroke() }
    for (let y = 86; y < 310; y += 32) { c.beginPath(); c.moveTo(12, y); c.lineTo(756, y); c.stroke() }
    c.strokeStyle = th.accent; c.lineWidth = 4
    chamfer(c, 8, 8, 752, 304, 28); c.stroke()
    c.fillStyle = th.accent
    chamfer(c, 26, 24, 716, 44, 14); c.fill()
    c.fillStyle = th.deep; c.font = 'bold 28px sans-serif'; c.textBaseline = 'middle'
    c.fillText(tr('LJPC · CHASSE GALACTIQUE', 'LJPC · GALACTIC HUNT'), 46, 47)
    // La galaxie, vue de biais, et son bulbe.
    const glowCore = c.createRadialGradient(244, 180, 0, 244, 180, 60)
    glowCore.addColorStop(0, 'rgba(255, 230, 190, 0.9)'); glowCore.addColorStop(1, 'rgba(255, 230, 190, 0)')
    c.fillStyle = glowCore; c.fillRect(160, 120, 170, 120)
    for (const [x, y, k] of stars) {
      c.fillStyle = k < 0.6 ? 'rgba(160, 240, 220, 0.85)' : 'rgba(255, 210, 160, 0.85)'
      c.fillRect(244 + x, 180 + y, k < 0.9 ? 2 : 3, k < 0.9 ? 2 : 3)
    }
    // La cible : réticule fixe, anneau qui s'élargit.
    const k = (t * 0.6) % 1
    c.strokeStyle = `rgba(87, 230, 193, ${1 - k})`; c.lineWidth = 3
    c.beginPath(); c.arc(target.x, target.y, 8 + k * 46, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = '#eafff8'; c.lineWidth = 2
    c.beginPath(); c.arc(target.x, target.y, 10, 0, Math.PI * 2); c.stroke()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.beginPath(); c.moveTo(target.x + dx * 14, target.y + dy * 14); c.lineTo(target.x + dx * 24, target.y + dy * 24); c.stroke()
    }
    // Relevés.
    c.fillStyle = '#9fded0'; c.font = '20px sans-serif'
    c.fillText(tr('SIGNAL INCONNU', 'UNKNOWN SIGNAL'), 470, 110)
    c.fillStyle = '#eafff8'; c.font = 'bold 30px sans-serif'
    c.fillText(tr('22 000 AL', '22,000 LY'), 470, 148)
    c.fillStyle = '#9fded0'; c.font = '20px sans-serif'
    c.fillText(tr('RÉCOMPENSE', 'REWARD'), 470, 200)
    c.fillStyle = th.accent; c.font = 'bold 30px sans-serif'
    c.fillText('10 000 CR', 470, 238)
    c.fillStyle = 'rgba(87, 230, 193, 0.25)'; c.fillRect(470, 272, 250, 10)
    c.fillStyle = th.accent; c.fillRect(470, 272, 250 * ((t * 0.08) % 1), 10)
  })
}

/** Façade du bureau : le nom en grand, entre deux séries de chevrons. */
function frontPrint(th: CounterTheme): THREE.CanvasTexture {
  return drawnTexture(768, 192, (c) => {
    c.fillStyle = th.deep; c.fillRect(0, 0, 768, 192)
    c.fillStyle = th.accent
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = 384 + side * (230 + i * 30)
        c.beginPath()
        c.moveTo(x + 12, 50); c.lineTo(x + 28, 50); c.lineTo(x - 12, 142); c.lineTo(x - 28, 142)
        c.closePath()
        c.globalAlpha = 1 - i * 0.2
        c.fill()
      }
    }
    c.globalAlpha = 1
    c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = 'bold 76px sans-serif'; c.fillText(th.name, 384, 86)
    c.fillStyle = '#d6e4ee'; c.font = '26px sans-serif'; c.fillText(th.sub, 384, 146)
  })
}

// ---------------------------------------------------------------- le meuble

/** Bureau à façade inclinée : le profil (z, y) extrudé sur la largeur. */
function deskShell(width: number, m: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape()
  s.moveTo(-0.08, 0); s.lineTo(0.27, 0); s.lineTo(0.27, 0.05); s.lineTo(0.37, 0.39); s.lineTo(-0.08, 0.39)
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false })
  // Profil tracé dans le plan XY, extrudé selon z : x devient la profondeur, z la largeur.
  geo.rotateY(-Math.PI / 2)
  geo.translate(width / 2, 0, 0)
  return mesh(geo, m)
}

const counter: Builder = ({ label, random }) => {
  const hunt = label === 'hunt'
  const th = THEMES[hunt ? 'hunt' : 'weekly']
  const g = new THREE.Group()
  const panel = lit(th.panel), dark = lit('#1a2530'), accent = glow(th.accent)

  // Socle : réserve la place du personnel ; liseré lumineux au bord, côté clients.
  g.add(box(W, 0.04, 1.14, lit('#243340'), 0, 0.02, -0.12, 0.012), box(W - 0.12, 0.006, 0.02, accent, 0, 0.043, 0.43))

  // Fond : panneau aux coins supérieurs coupés, et son écran.
  const back = new THREE.Shape()
  back.moveTo(-W / 2, 0); back.lineTo(W / 2, 0); back.lineTo(W / 2, 0.84); back.lineTo(W / 2 - 0.1, 0.94)
  back.lineTo(-W / 2 + 0.1, 0.94); back.lineTo(-W / 2, 0.84); back.closePath()
  g.add(mesh(new THREE.ExtrudeGeometry(back, { depth: 0.05, bevelEnabled: false }), panel, 0, 0, -0.69))
  // Dos du panneau (on le voit quand le mur s'estompe) : nervures et liseré.
  for (const y of [0.25, 0.5, 0.75]) g.add(box(W - 0.12, 0.03, 0.012, dark, 0, y, -0.694))
  g.add(box(W - 0.24, 0.01, 0.012, accent, 0, 0.9, -0.636))
  g.add(box(1.24, 0.52, 0.02, dark, 0, 0.64, -0.635, 0.01))
  const board = hunt ? huntMap(th) : missionBoard(th)
  board.texture.magFilter = THREE.LinearFilter
  // Montants latéraux, un néon vertical sur leur face avant.
  for (const s of [-1, 1]) {
    g.add(box(0.07, 0.86, 0.22, panel, s * (W / 2 - 0.035), 0.43, -0.56, 0.01))
    g.add(box(0.012, 0.66, 0.01, accent, s * (W / 2 - 0.035), 0.45, -0.447))
  }

  // Bureau : caisson à façade inclinée, plateau débordant, néons sous le rebord et au pied.
  const shell = deskShell(1.3, lit(th.desk))
  g.add(shell)
  g.add(box(1.36, 0.04, 0.54, lit(th.top), 0, TOP - 0.02, 0.15, 0.015))
  g.add(box(1.28, 0.01, 0.01, accent, 0, 0.385, 0.372), box(1.2, 0.012, 0.006, accent, 0, 0.03, 0.274))
  for (const s of [-1, 1]) g.add(box(0.03, 0.34, 0.03, lit(hunt ? '#9fb4b8' : '#c9a24a'), s * 0.64, 0.22, 0.33))
  // Façade imprimée, dans la pente.
  const slope = Math.atan2(0.1, 0.34)
  const front = mesh(new THREE.PlaneGeometry(1.18, 0.3), new THREE.MeshBasicMaterial({ map: frontPrint(th) }), 0, 0.215, 0.327)
  front.rotation.x = slope
  front.position.z += Math.cos(slope) * 0.004
  g.add(front)

  // Terminal tourné vers les clients.
  g.add(box(0.06, 0.07, 0.07, lit('#344958'), -0.43, TOP + 0.035, 0.2, 0.006))
  const terminal = new THREE.Group(); terminal.position.set(-0.43, TOP + 0.11, 0.19); terminal.rotation.x = -0.32
  terminal.add(box(0.36, 0.15, 0.028, dark, 0, 0, 0, 0.009), box(0.09, 0.005, 0.005, accent, 0, -0.068, 0.016))
  const map = drawnTexture(512, 208, (c) => {
    c.fillStyle = th.deep; c.fillRect(0, 0, 512, 208)
    c.fillStyle = th.accent; c.fillRect(0, 0, 5, 208)
    c.font = '600 20px sans-serif'; c.fillText(tr('RÉCOMPENSES EN ATTENTE', 'PENDING REWARDS'), 26, 42)
    c.fillStyle = '#f0f8ff'; c.font = 'bold 44px sans-serif'; c.fillText('10 000 CR', 26, 108)
    c.fillStyle = th.accent; c.font = 'bold 22px sans-serif'; c.fillText(tr('▶ À RÉCUPÉRER AU COMPTOIR', '▶ COLLECT AT THE COUNTER'), 26, 168)
  })
  terminal.add(mesh(new THREE.PlaneGeometry(0.34, 0.135), new THREE.MeshBasicMaterial({ map }), 0, 0, 0.015))
  g.add(terminal)

  // Projecteur holographique, de l'autre côté du bureau.
  const px = 0.4, pz = 0.16
  // Socle sombre : une lentille au centre, un anneau lumineux autour.
  g.add(cylinder(0.085, 0.095, 0.03, dark, px, TOP + 0.015, pz, 20), cylinder(0.03, 0.03, 0.006, accent, px, TOP + 0.033, pz, 14))
  const halo = mesh(new THREE.TorusGeometry(0.068, 0.006, 4, 24), accent, px, TOP + 0.032, pz)
  halo.rotation.x = Math.PI / 2
  g.add(halo)
  const live = new THREE.Group()
  // L'écran du fond, redessiné : il reste à part (cf. animatedScreen).
  live.add(part(new THREE.PlaneGeometry(1.18, 0.47), new THREE.MeshBasicMaterial({ map: board.texture }), 0, 0.64, -0.624))
  const holo = new THREE.Group(); holo.position.set(px, TOP + 0.04, pz)
  live.add(holo)
  holo.add(part(new THREE.CylinderGeometry(0.13, 0.07, 0.3, 20, 1, true), holoMaterial(null, th.accent, 0.16, 1, true), 0, 0.15, 0))
  let spin: THREE.Object3D
  let bob: THREE.Object3D | null = null
  if (hunt) {
    // Petite galaxie qui tourne, et les éprouvettes d'échantillons.
    const N = 900
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N)
    const cyan = new THREE.Color(th.accent), warm = new THREE.Color('#ffe2b0'), c = new THREE.Color()
    const gauss = () => (random() + random() + random() - 1.5) / 1.5
    for (let i = 0; i < N; i++) {
      // Un bulbe, puis deux bras qui s'enroulent d'un tour et demi.
      const bulb = i < N * 0.25
      const r = bulb ? Math.abs(gauss()) * 0.035 : 0.02 + Math.pow(random(), 1.3) * 0.15
      const a = bulb ? random() * Math.PI * 2 : (i % 2) * Math.PI + r * 11 + gauss() * 0.35
      pos.set([Math.cos(a) * r, gauss() * (bulb ? 0.012 : 0.004), Math.sin(a) * r], i * 3)
      c.copy(bulb ? warm : cyan).lerp(warm, random() * 0.35)
      col.set([c.r, c.g, c.b], i * 3)
      size[i] = 0.005 + random() * 0.008
    }
    const galaxy = new THREE.Group(); galaxy.position.y = 0.24; galaxy.rotation.x = 0.45
    galaxy.add(pointCloud(pos, col, size))
    // La cible de la chasse, sur un bras.
    const mark = part(new THREE.OctahedronGeometry(0.014), glow('#ffffff'), Math.cos(0.1 * 11 + 0.2) * 0.1, 0.01, Math.sin(0.1 * 11 + 0.2) * 0.1)
    galaxy.add(mark)
    holo.add(galaxy)
    spin = galaxy
    g.add(box(0.2, 0.025, 0.1, lit('#9fb4b8'), 0.08, TOP + 0.012, 0.2, 0.006))
    for (let i = 0; i < 4; i++) {
      const x = 0.02 + i * 0.04
      g.add(cylinder(0.014, 0.014, 0.1, lit('#cfe9ec'), x, TOP + 0.075, 0.2, 10),
        cylinder(0.012, 0.012, 0.045 + (i % 3) * 0.015, glow(i % 2 ? th.accent : '#9df0ff'), x, TOP + 0.05 + (i % 3) * 0.008, 0.2, 10),
        cylinder(0.016, 0.016, 0.014, lit(i % 2 ? '#e25b5b' : th.accent), x, TOP + 0.13, 0.2, 10))
    }
  } else {
    // Hexagone de mission qui tourne autour de la récompense, qui flotte.
    const ring = part(new THREE.TorusGeometry(0.13, 0.008, 4, 6), holoMaterial(null, th.accent, 0.95, 0, true), 0, 0.14, 0)
    ring.rotation.x = Math.PI / 2
    const inner = part(new THREE.TorusGeometry(0.09, 0.005, 4, 6), holoMaterial(null, th.accent, 0.7, 0, true), 0, 0.14, 0)
    inner.rotation.x = Math.PI / 2
    const hex = new THREE.Group(); hex.add(ring, inner)
    holo.add(hex)
    spin = hex
    const reward = drawnTexture(256, 96, (c) => {
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.font = 'bold 44px sans-serif'; c.fillText('10 000 CR', 128, 40)
      c.font = '22px sans-serif'; c.fillText(tr('PAR VALIDATION', 'PER COMPLETION'), 128, 80)
    })
    const card = part(new THREE.PlaneGeometry(0.3, 0.11), holoMaterial(reward, th.accent, 1), 0, 0.27, 0)
    holo.add(card)
    bob = card
    // Pile de tablettes de mission et tampon de validation.
    for (let i = 0; i < 3; i++) g.add(box(0.15, 0.008, 0.11, lit(i % 2 ? '#3f5264' : '#566c80'), 0.09 + i * 0.006, TOP + 0.005 + i * 0.009, 0.2 - i * 0.004, 0.003))
    g.add(box(0.1, 0.004, 0.07, glow('#8fd6ff'), 0.1, TOP + 0.03, 0.19))
  }

  const staff = counterStaff(hunt, random() * 12)
  live.add(staff.root)
  return {
    solid: g,
    live,
    update: (t) => {
      board.tick(t)
      spin.rotation.y = t * (hunt ? 0.35 : 0.8)
      if (bob) bob.position.y = 0.27 + Math.sin(t * 1.6) * 0.012
      staff.update(t)
    },
  }
}

export const REWARD_COUNTER = { 'reward-counter': counter } satisfies Record<string, Builder>
