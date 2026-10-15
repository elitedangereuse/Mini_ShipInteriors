import * as THREE from 'three'
import { animatedScreen, box, cylinder, drawnTexture, glass, glow, keepShared, lit, mesh, part, pointCloud, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Les deux bureaux vitrés du hall d'accueil (pont principal), au fond de la salle commune, chacun
 * à son image autour de son comptoir (cf. reward-counter.ts) :
 * - le bureau de liaison du Weekly : moquette bleu nuit, le tableau des missions de la semaine au
 *   mur, les drapeaux d'Élite Dangereuse et de la Pilots' Federation ;
 * - le labo de la Chasse galactique : carrelage blanc, la cuve où flotte un spécimen, et la table
 *   holographique où la galaxie tourne, ses cibles allumées.
 */

const FONT = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif'

/** Les missions du tableau, comme celles des Weekly du site (des activités d'Elite). */
const MISSIONS = [
  ['◆', tr('Livrer 400 t de cargaison', 'Deliver 400 t of cargo')],
  ['✦', tr('Scanner 12 systèmes inexplorés', 'Scan 12 unexplored systems')],
  ['✕', tr('Toucher 3 primes de chasseur', 'Claim 3 bounty vouchers')],
  ['⬢', tr('Miner 50 t de minerai rare', 'Mine 50 t of rare ore')],
  ['➤', tr('Rallier un objectif communautaire', 'Join a community goal')],
  ['★', tr('Terminer une aventure du site', 'Finish a site adventure')],
]

/**
 * Le tableau des missions de la semaine (au mur, face à +z, 1,6 × 0,95) : six missions cochées ou
 * pas, le numéro de la semaine, et la mission en cours qui clignote doucement.
 */
const weeklyBoard: Builder = () => {
  const g = new THREE.Group()
  const W = 1.6, H = 0.95, Y = 1.0
  const frame = lit('#1d2c3a', 'metal'), gold = lit('#d8b062', 'metal')
  g.add(box(W + 0.08, H + 0.08, 0.04, frame, 0, Y, -0.01), box(W + 0.1, 0.02, 0.05, gold, 0, Y + H / 2 + 0.04, 0), box(W + 0.1, 0.02, 0.05, gold, 0, Y - H / 2 - 0.04, 0))
  const PW = 1024, PH = Math.round((PW * H) / W)
  const week = 1 + (Math.floor(Date.now() / 604800000) % 52)
  const screen = animatedScreen(PW, PH, 2, (c, t) => {
    c.fillStyle = '#0f1c29'
    c.fillRect(0, 0, PW, PH)
    c.fillStyle = '#ffc270'
    c.font = `700 46px ${FONT}`
    c.textBaseline = 'middle'
    c.fillText(tr('MISSIONS DE LA SEMAINE', 'THIS WEEK\'S MISSIONS'), 36, 52)
    c.textAlign = 'right'
    c.font = `600 30px ${FONT}`
    c.fillStyle = '#9fb4c8'
    c.fillText(tr(`SEMAINE ${week}`, `WEEK ${week}`), PW - 36, 52)
    c.textAlign = 'left'
    c.fillStyle = '#ffc270'
    c.fillRect(36, 86, PW - 72, 3)
    const current = 2 + (Math.floor(t / 6) % 4)
    MISSIONS.forEach(([icon, text], i) => {
      const y = 128 + i * 72
      const done = i < current
      const blink = i === current && Math.floor(t * 2) % 2 === 0
      c.fillStyle = i === current ? '#1d3248' : '#13222f'
      c.fillRect(36, y - 30, PW - 72, 60)
      c.strokeStyle = i === current ? '#ffc270' : '#2c4256'
      c.lineWidth = 2
      c.strokeRect(36, y - 30, PW - 72, 60)
      c.fillStyle = '#ffc270'
      c.font = `700 32px ${FONT}`
      c.fillText(icon, 56, y + 2)
      c.fillStyle = done ? '#8aa0b4' : '#e8f0f8'
      c.font = `600 30px ${FONT}`
      c.fillText(text, 104, y + 2)
      // La case : cochée, en cours (elle clignote), ou vide.
      c.strokeStyle = done ? '#7ddc8a' : '#ffc270'
      c.strokeRect(PW - 96, y - 16, 32, 32)
      if (done) {
        c.strokeStyle = '#7ddc8a'
        c.lineWidth = 5
        c.beginPath(); c.moveTo(PW - 90, y); c.lineTo(PW - 82, y + 9); c.lineTo(PW - 68, y - 10); c.stroke()
      } else if (blink) {
        c.fillStyle = '#ffc270'
        c.fillRect(PW - 88, y - 8, 16, 16)
      }
    })
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(W, H), keepShared(new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false })), 0, Y, 0.012))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

/** Un drapeau, son emblème dessiné. */
function flagTexture(kind: 'ed' | 'pf') {
  return drawnTexture(256, 384, (c) => {
    c.fillStyle = kind === 'ed' ? '#e0701e' : '#14203a'
    c.fillRect(0, 0, 256, 384)
    c.fillStyle = kind === 'ed' ? '#1c1d22' : '#c9a24a'
    c.fillRect(0, 0, 256, 18)
    c.fillRect(0, 366, 256, 18)
    c.translate(128, 180)
    if (kind === 'ed') {
      // Élite Dangereuse : un vaisseau stylisé, ailes déployées.
      c.fillStyle = '#1c1d22'
      c.beginPath(); c.moveTo(0, -70); c.lineTo(80, 40); c.lineTo(0, 15); c.lineTo(-80, 40); c.closePath(); c.fill()
      c.fillStyle = '#ffd27a'
      c.beginPath(); c.moveTo(0, -40); c.lineTo(22, 10); c.lineTo(-22, 10); c.closePath(); c.fill()
    } else {
      // La Pilots' Federation : deux ailes et une étoile.
      c.strokeStyle = '#c9a24a'
      c.lineWidth = 10
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(s * 14, 26 + k * 18, 70 - k * 14, s > 0 ? -Math.PI * 0.45 : Math.PI * 1.05, s > 0 ? -Math.PI * 0.05 : Math.PI * 1.45); c.stroke() }
      c.fillStyle = '#ffffff'
      c.beginPath()
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 12 : 30; c.lineTo(Math.cos(a) * r, -24 + Math.sin(a) * r) }
      c.fill()
    }
  })
}

/** Les deux drapeaux du bureau de liaison (au sol, 0,6 de large) : Élite Dangereuse et la Pilots' Federation. */
const weeklyFlags: Builder = () => {
  const g = new THREE.Group()
  const brass = lit('#d8b062', 'metal')
  for (const [x, kind] of [[-0.16, 'ed'], [0.16, 'pf']] as const) {
    g.add(cylinder(0.08, 0.1, 0.05, lit('#2a2d33', 'metal'), x, 0.025, 0, 12), cylinder(0.012, 0.012, 1.5, brass, x, 0.77, 0, 6), sphere(0.03, brass, x, 1.54, 0, 8))
    const flag = part(new THREE.PlaneGeometry(0.28, 0.42), new THREE.MeshLambertMaterial({ map: flagTexture(kind), side: THREE.DoubleSide }), x + (x < 0 ? -0.15 : 0.15), 1.24, 0)
    flag.rotation.y = x < 0 ? 0.35 : -0.35
    g.add(flag)
  }
  return { solid: g }
}

/**
 * La cuve à spécimen du labo (au sol, 0,5 de diamètre) : un socle, un cylindre de verre plein
 * d'un liquide vert, où flotte une créature bioluminescente ; des bulles qui montent.
 */
const huntTank: Builder = ({ random }) => {
  const g = new THREE.Group()
  const steel = lit('#c9d3db', 'metal'), dark = lit('#28444b', 'metal')
  g.add(cylinder(0.27, 0.3, 0.16, dark, 0, 0.08, 0, 20), cylinder(0.26, 0.26, 0.03, glow('#57e6c1'), 0, 0.17, 0, 20), cylinder(0.27, 0.27, 0.08, steel, 0, 1.48, 0, 20))
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    g.add(box(0.03, 1.32, 0.03, steel, Math.cos(a) * 0.255, 0.82, Math.sin(a) * 0.255))
  }
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.24, 0.24, 1.28, 24, 1, true), glass('#8fffd8', 0.28), 0, 0.82, 0))
  live.add(part(new THREE.CylinderGeometry(0.23, 0.23, 1.2, 24), new THREE.MeshBasicMaterial({ color: '#2fbf8f', transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.8, 0))
  // Le spécimen : un corps, des tentacules, un cœur qui luit.
  const creature = new THREE.Group()
  creature.add(sphere(0.08, glow('#9dffd9'), 0, 0, 0, 12))
  for (let k = 0; k < 5; k++) {
    const t = mesh(new THREE.CylinderGeometry(0.006, 0.018, 0.22, 5), glow('#57e6c1'), Math.cos(k * 1.26) * 0.04, -0.12, Math.sin(k * 1.26) * 0.04)
    t.rotation.z = Math.cos(k * 1.26) * 0.35
    t.rotation.x = Math.sin(k * 1.26) * 0.35
    creature.add(t)
  }
  creature.position.y = 0.85
  live.add(creature)
  const bubbles = Array.from({ length: 7 }, () => {
    const b = part(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: '#d8fff0', transparent: true, opacity: 0.7 }))
    b.userData = { x: (random() - 0.5) * 0.3, z: (random() - 0.5) * 0.3, phase: random() }
    live.add(b)
    return b
  })
  return {
    solid: g,
    live,
    update: (t) => {
      creature.position.y = 0.85 + Math.sin(t * 0.8) * 0.06
      creature.rotation.y = t * 0.3
      for (const b of bubbles) {
        const p = (t * 0.25 + b.userData.phase) % 1
        b.position.set(b.userData.x, 0.22 + p * 1.15, b.userData.z)
      }
    },
  }
}

/**
 * La table holographique du labo (au sol, 0,7 de diamètre) : une galaxie spirale qui tourne, et
 * trois cibles de la Chasse qui clignotent, reliées au bord de la table.
 */
const huntHolo: Builder = ({ random }) => {
  const g = new THREE.Group()
  const white = lit('#dfe8ea'), teal = glow('#57e6c1')
  g.add(cylinder(0.18, 0.24, 0.62, white, 0, 0.31, 0, 16), cylinder(0.36, 0.34, 0.05, white, 0, 0.64, 0, 24), cylinder(0.33, 0.33, 0.012, teal, 0, 0.67, 0, 24))
  const N = 900
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N)
  const c = new THREE.Color()
  for (let i = 0; i < N; i++) {
    const arm = i % 2, r = Math.pow(random(), 0.7) * 0.3, a = r * 9 + arm * Math.PI + (random() - 0.5) * 0.6
    pos.set([Math.cos(a) * r, (random() - 0.5) * 0.03 * (1 - r * 2), Math.sin(a) * r], i * 3)
    c.set(r < 0.06 ? '#ffe9b0' : random() < 0.5 ? '#9fd8ff' : '#d8c8ff')
    col.set([c.r, c.g, c.b], i * 3)
    size[i] = 0.006 + random() * 0.01
  }
  const galaxy = pointCloud(pos, col, size)
  galaxy.position.y = 0.95
  galaxy.rotation.x = 0.25
  const live = new THREE.Group()
  live.add(galaxy)
  const targets = [[0.18, 0.05], [-0.12, -0.16], [-0.2, 0.12]].map(([x, z]) => {
    const m = part(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff5a5a' }), x, 0.97, z)
    live.add(m)
    return m
  })
  return {
    solid: g,
    live,
    update: (t) => {
      galaxy.rotation.y = t * 0.15
      targets.forEach((m, i) => m.scale.setScalar(1 + 0.6 * Math.max(0, Math.sin(t * 3 + i * 2))))
    },
  }
}

export const OFFICES = {
  'weekly-board': weeklyBoard,
  'weekly-flags': weeklyFlags,
  'hunt-tank': huntTank,
  'hunt-holo': huntHolo,
} satisfies Record<string, Builder>
