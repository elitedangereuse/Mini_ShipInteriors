import * as THREE from 'three'
import { animatedScreen, barX, box, cylinder, decal, drawnTexture, glow, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * Le poste de surveillance, sous la Promenade (pont principal, cf. levels.ts) : la pièce que le
 * sergent Rourke ne montre à personne, et qu'ouvre la quête « Tour de garde ». Des écrans partout :
 * deux murs de moniteurs, le pupitre d'où l'on prend la main sur les caméras du bord (cf.
 * src/cctv.ts), la baie d'enregistrement, le tableau de liège du sergent, et son lit de camp.
 * Mêmes conventions que decor.ts : face à +z, posé au sol, centré sur l'origine ; ce qui
 * s'accroche a le dos à -z.
 */

const C = {
  shell: '#1b2029',
  shellLight: '#2c333f',
  steel: '#59616e',
  desk: '#262b35',
  deskTop: '#151920',
  phosphor: '#9fe8ff',
  phosphorDim: '#2a5566',
  tube: '#061018',
  amber: '#ffb03a',
  red: '#ff4a3d',
  green: '#7dffa8',
  cork: '#a9794a',
  canvas: '#5d6b4f',
  blanket: '#8a2f2a',
}

/** Les pièces que montrent les moniteurs : leur nom à l'écran, et de quoi les reconnaître. */
const FEEDS = ['MESS', 'ARCADE', 'HANGAR', 'COURSIVE', 'SERRE', 'SOUTE', 'CINEMA', 'INFIRM.', 'PROMENADE', 'ATELIER', 'FOYER', 'LOBBY', 'S. COMMUNE', 'RAFFIN.', 'PALIER', 'STUDIO']

/**
 * Une planche de moniteurs dessinée d'un seul tenant (une seule texture pour tout un mur) : sur
 * chacun, une pièce vue de haut en traits de phosphore, deux ou trois silhouettes qui s'y
 * promènent, le numéro de la caméra, le point « REC » ; de temps en temps, un écran décroche.
 */
function feedBoard(cols: number, rows: number, first: number, seed: number) {
  const cw = 128, ch = 80
  let s = seed
  const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const rooms = Array.from({ length: cols * rows }, () => ({
    blocks: Array.from({ length: 3 + Math.floor(random() * 4) }, () => ({ x: 14 + random() * 90, y: 22 + random() * 40, w: 8 + random() * 22, h: 6 + random() * 12 })),
    walkers: Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({ phase: random() * 40, speed: 0.04 + random() * 0.05, y: 26 + random() * 40, span: 30 + random() * 60, x: 14 + random() * 30 })),
    drop: random() * 60,
  }))
  return animatedScreen(cw * cols, ch * rows, 6, (c, t) => {
    c.fillStyle = C.tube
    c.fillRect(0, 0, cw * cols, ch * rows)
    c.font = 'bold 9px monospace'
    c.textBaseline = 'top'
    rooms.forEach((room, i) => {
      const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch
      c.save()
      c.translate(ox, oy)
      // Un écran qui décroche : de la neige, puis l'image revient.
      if ((t + room.drop) % 47 < 1.4) {
        for (let n = 0; n < 220; n++) {
          c.fillStyle = `rgba(190, 230, 245, ${0.15 + ((n * 31 + Math.floor(t * 6) * 7) % 10) / 14})`
          c.fillRect((n * 53 + Math.floor(t * 6) * 29) % cw, (n * 17 + Math.floor(t * 6) * 11) % ch, 3, 1)
        }
        c.fillStyle = C.phosphor
        c.fillText('NO SIGNAL', 38, 34)
        c.restore()
        return
      }
      // La pièce : son contour, ses meubles.
      c.strokeStyle = C.phosphorDim
      c.lineWidth = 1
      c.strokeRect(8.5, 16.5, cw - 17, ch - 25)
      c.fillStyle = 'rgba(60, 130, 155, 0.35)'
      for (const b of room.blocks) c.fillRect(b.x, b.y, b.w, b.h)
      // Qui s'y promène.
      c.fillStyle = C.phosphor
      for (const w of room.walkers) {
        const k = Math.sin((t + w.phase) * w.speed * 6)
        c.fillRect(w.x + (k + 1) * 0.5 * w.span, w.y + Math.sin((t + w.phase) * 0.7) * 3, 3, 5)
      }
      c.fillText(`CAM ${String(first + i).padStart(2, '0')}`, 6, 4)
      c.fillStyle = C.phosphorDim
      c.fillText(FEEDS[(first + i - 1) % FEEDS.length], 52, 4)
      if (Math.floor(t * 1.5 + i) % 2) {
        c.fillStyle = C.red
        c.fillRect(cw - 12, 5, 5, 5)
      }
      // Lignes de balayage, et la barre qui descend.
      c.fillStyle = 'rgba(0, 0, 0, 0.28)'
      for (let y = 0; y < ch; y += 3) c.fillRect(0, y, cw, 1)
      c.fillStyle = 'rgba(160, 230, 255, 0.07)'
      c.fillRect(0, ((t * 22 + i * 13) % (ch + 20)) - 10, cw, 9)
      c.restore()
    })
  })
}

/** Plan d'écran qui ne montre qu'une case de la planche (colonne, rangée). */
function feedPlane(w: number, h: number, texture: THREE.Texture, cols: number, rows: number, col: number, row: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / cols, 1 - (row + 1 - uv.getY(i)) / rows)
  return part(geo, new THREE.MeshBasicMaterial({ map: texture }))
}

/**
 * Mur de moniteurs (2,8 de large, adossé au mur, dos à -z) : huit tubes cathodiques sur deux
 * rangées, dans une baie d'acier sombre. `label` : le numéro de sa première caméra.
 */
const monitorWall: Builder = ({ label }) => {
  const first = Number(label) || 1
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(2.8, 0.82, 0.1, lit(C.shell, 'metal'), 0, 0.6, -0.07, 0.012))
  g.add(box(2.8, 0.17, 0.2, lit(C.shellLight, 'metal'), 0, 0.085, -0.02, 0.012), box(2.86, 0.03, 0.14, lit(C.steel, 'metal'), 0, 1.02, -0.05))
  const board = feedBoard(4, 2, first, 9100 + first * 131)
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4)
    const x = -1.035 + col * 0.69, y = 0.8 - row * 0.4
    // Le coffre du tube, bombé vers la pièce, et sa petite diode.
    g.add(box(0.64, 0.36, 0.09, lit('#0e1116'), x, y, -0.01, 0.02))
    const plane = feedPlane(0.56, 0.29, board.texture, 4, 2, col, row)
    plane.position.set(x, y + 0.01, 0.038)
    live.add(plane, part(new THREE.BoxGeometry(0.02, 0.012, 0.01), glow(i % 3 ? C.green : C.amber), x + 0.27, y - 0.158, 0.036))
  }
  // Le bandeau de voyants de la baie, en bas.
  const leds: THREE.Mesh[] = []
  for (let i = 0; i < 14; i++) {
    const led = part(new THREE.BoxGeometry(0.03, 0.02, 0.012), glow(i % 5 === 2 ? C.amber : C.phosphor), -1.2 + i * 0.185, 0.11, 0.085)
    leds.push(led)
    live.add(led)
  }
  return {
    solid: g, live,
    update: (t) => {
      board.tick(t)
      leds.forEach((led, i) => (led.visible = Math.sin(t * (2 + (i % 4)) + i * 1.7) > -0.4))
    },
  }
}

/**
 * Le pupitre de l'opérateur (2 de large, face à +z : on s'y tient au sud, face au mur d'écrans) :
 * un plan de travail en arc, trois moniteurs inclinés, un clavier, le manche des caméras, un
 * téléphone rouge. C'est d'ici qu'on prend la main sur les caméras du bord.
 */
const operatorDesk: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(2, 0.4, 0.5, lit(C.desk, 'metal'), 0, 0.2, 0, 0.02), box(2.08, 0.035, 0.6, lit(C.deskTop), 0, 0.418, 0.02, 0.012))
  for (const s of [-1, 1]) g.add(box(0.06, 0.4, 0.5, lit(C.steel, 'metal'), s * 0.98, 0.2, 0))
  const board = feedBoard(3, 1, 17, 7331)
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.6
    const tube = box(0.52, 0.34, 0.2, lit('#0e1116'), x, 0.62, -0.14, 0.03)
    tube.rotation.set(-0.16, (1 - i) * 0.3, 0)
    const plane = feedPlane(0.44, 0.26, board.texture, 3, 1, i, 0)
    plane.position.set(x + (i - 1) * 0.03, 0.622, -0.034)
    plane.rotation.copy(tube.rotation)
    g.add(tube)
    live.add(plane)
  }
  // Clavier, manche des caméras, tasse oubliée, téléphone rouge.
  g.add(box(0.46, 0.022, 0.15, lit('#0c0e12'), -0.1, 0.447, 0.2, 0.006))
  g.add(cylinder(0.05, 0.06, 0.025, lit('#0c0e12'), 0.42, 0.448, 0.2, 14), cylinder(0.012, 0.012, 0.12, lit(C.steel, 'metal'), 0.42, 0.51, 0.2, 8), sphere(0.026, lit(C.red), 0.42, 0.578, 0.2, 10))
  g.add(cylinder(0.035, 0.03, 0.07, lit('#e8e2d2'), -0.72, 0.47, 0.2, 12))
  g.add(box(0.17, 0.045, 0.12, lit(C.red), 0.78, 0.458, 0.18, 0.012), barX(0.02, 0.19, lit(C.red), 0.78, 0.5, 0.18, 8))
  const rec = part(new THREE.SphereGeometry(0.016, 8, 6), glow(C.red), 0.98, 0.46, 0.27)
  live.add(rec)
  return { solid: g, live, update: (t) => { board.tick(t); rec.visible = Math.floor(t * 1.4) % 2 === 0 } }
}

/** Le fauteuil de l'opérateur : à roulettes, dossier haut, assise creusée par des années de garde. */
const operatorChair: Builder = () => {
  const g = new THREE.Group()
  const leather = lit('#22262e')
  g.add(cylinder(0.03, 0.03, 0.2, lit(C.steel, 'metal'), 0, 0.13, 0, 8))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const leg = box(0.22, 0.025, 0.04, lit(C.steel, 'metal'), Math.cos(a) * 0.11, 0.04, Math.sin(a) * 0.11)
    leg.rotation.y = -a
    g.add(leg)
  }
  g.add(box(0.4, 0.07, 0.4, leather, 0, 0.27, 0, 0.03), box(0.38, 0.46, 0.07, leather, 0, 0.52, -0.19, 0.03))
  for (const s of [-1, 1]) g.add(box(0.04, 0.03, 0.26, lit(C.steel, 'metal'), s * 0.22, 0.39, -0.02))
  return { solid: g }
}

/**
 * La baie d'enregistrement (0,7 de large, contre un mur) : une armoire de serveurs, ses bandes
 * magnétiques qui tournent derrière une vitre, ses diodes.
 */
const recorderRack: Builder = ({ random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(box(0.7, 1.05, 0.5, lit(C.shell, 'metal'), 0, 0.525, 0, 0.015))
  for (let i = 0; i < 4; i++) g.add(box(0.6, 0.16, 0.02, lit(C.shellLight, 'metal'), 0, 0.14 + i * 0.2, 0.25))
  g.add(box(0.6, 0.2, 0.02, lit('#0b0e13'), 0, 0.92, 0.25))
  const hubs: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const reel = part(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16), lit('#c9ccd2', 'metal'), s * 0.15, 0.92, 0.268)
    reel.rotation.x = Math.PI / 2
    // Le moyeu : c'est lui qu'on voit tourner.
    const hub = part(new THREE.BoxGeometry(0.12, 0.022, 0.018), lit('#3a3f49'), s * 0.15, 0.92, 0.272)
    hubs.push(hub)
    live.add(reel, hub)
  }
  const leds: { led: THREE.Mesh; rate: number; phase: number }[] = []
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 6; i++) {
      const led = part(new THREE.BoxGeometry(0.022, 0.022, 0.01), glow(random() < 0.2 ? C.amber : random() < 0.5 ? C.green : C.phosphor), -0.24 + i * 0.05, 0.14 + row * 0.2, 0.263)
      leds.push({ led, rate: 1.5 + random() * 6, phase: random() * 6 })
      live.add(led)
    }
  }
  return {
    solid: g, live, emitter: 'hum',
    update: (t) => {
      hubs.forEach((hub, i) => (hub.rotation.z = t * (i ? 1.6 : 1.1)))
      for (const l of leds) l.led.visible = Math.sin(t * l.rate + l.phase) > -0.2
    },
  }
}

/**
 * Le tableau de liège du sergent (1,5 de large, accroché, dos à -z) : des photos de l'équipage
 * et du bord, des fils rouges tendus entre elles, des notes ; au centre, le distributeur de café.
 */
const corkBoard: Builder = () => {
  const texture = drawnTexture(384, 256, (c) => {
    c.fillStyle = C.cork
    c.fillRect(0, 0, 384, 256)
    let s = 51
    const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(${60 + random() * 60}, ${35 + random() * 30}, 15, 0.25)`
      c.fillRect(random() * 384, random() * 256, 2, 2)
    }
    const pins: [number, number][] = [[62, 58], [182, 48], [318, 66], [92, 186], [300, 184], [192, 132]]
    // Les fils rouges : tout mène au milieu.
    c.strokeStyle = '#c0281f'
    c.lineWidth = 2
    for (const [x, y] of pins.slice(0, 5)) {
      c.beginPath(); c.moveTo(x, y - 22); c.lineTo(192, 110); c.stroke()
    }
    pins.forEach(([x, y], i) => {
      c.save()
      c.translate(x, y)
      c.rotate((random() - 0.5) * 0.24)
      c.fillStyle = '#f1ecdf'
      c.fillRect(-30, -26, 60, 54)
      c.fillStyle = i === 5 ? '#3d2a1c' : '#27323f'
      c.fillRect(-25, -21, 50, 36)
      c.fillStyle = i === 5 ? '#d8c9a8' : '#8fb6c9'
      // Au centre : le distributeur de café ; autour, des silhouettes.
      if (i === 5) { c.fillRect(-10, -17, 20, 30); c.fillStyle = '#c0281f'; c.fillRect(-6, -12, 12, 8) } else { c.beginPath(); c.arc(0, -8, 7, 0, Math.PI * 2); c.fill(); c.fillRect(-9, 0, 18, 14) }
      c.fillStyle = '#c0281f'
      c.beginPath(); c.arc(0, -24, 4, 0, Math.PI * 2); c.fill()
      c.restore()
    })
    c.fillStyle = '#ffe36b'
    c.fillRect(232, 110, 46, 40)
    c.fillStyle = '#3a3212'
    c.font = 'bold 11px system-ui, sans-serif'
    c.fillText('QUI ?', 240, 128)
    c.fillText('→ 03:12', 236, 143)
  })
  const g = new THREE.Group()
  g.add(box(1.56, 1.04, 0.035, lit('#3b2a1b'), 0, 0.72, -0.1))
  g.add(part(new THREE.PlaneGeometry(1.5, 0.98), new THREE.MeshLambertMaterial({ map: texture }), 0, 0.72, -0.08))
  return { solid: g }
}

/** Le lit de camp du sergent : toile kaki, couverture pliée au carré, casque posé au pied. */
const campBed: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steel, 'metal')
  for (const [x, z] of [[-0.38, -0.85], [0.38, -0.85], [-0.38, 0.85], [0.38, 0.85], [-0.38, 0], [0.38, 0]]) g.add(cylinder(0.018, 0.018, 0.22, steel, x, 0.11, z, 6))
  g.add(box(0.84, 0.035, 1.84, lit(C.canvas), 0, 0.235, 0, 0.012))
  g.add(box(0.5, 0.07, 0.3, lit('#d8d3c4'), 0, 0.29, -0.7, 0.03), box(0.62, 0.09, 0.42, lit(C.blanket), 0, 0.3, 0.55, 0.02))
  // Son casque, au pied du lit : il ne dort jamais loin.
  g.add(sphere(0.13, lit('#2d3a4a', 'metal'), 0.62, 0.11, 0.7, 12), box(0.15, 0.05, 0.02, glow(C.amber), 0.62, 0.12, 0.826))
  return { solid: g }
}

/** Câbles qui courent au sol, de la baie aux écrans. */
const floorCables: Builder = () => {
  const texture = drawnTexture(256, 128, (c) => {
    c.clearRect(0, 0, 256, 128)
    c.lineCap = 'round'
    for (const [color, y, wob] of [['#0c0e12', 40, 14], ['#1d2530', 64, -18], ['#7a1e18', 84, 10]] as const) {
      c.strokeStyle = color
      c.lineWidth = 5
      c.beginPath()
      c.moveTo(0, y)
      c.bezierCurveTo(70, y + wob, 150, y - wob, 256, y + wob * 0.4)
      c.stroke()
    }
  })
  return { live: decal(texture, 2, 1, 0.01) }
}

/**
 * Une caméra de surveillance (accrochée en haut d'un mur, dos à -z) : celles qu'on croise dans le
 * vaisseau sans les voir. Sa diode rouge bat ; `label` : de combien elle regarde de côté (-1 à 1).
 */
const wallCamera: Builder = ({ label }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const turn = (Number(label) || 0) * 0.7
  g.add(box(0.07, 0.07, 0.05, lit(C.steel, 'metal'), 0, 0.93, -0.12), barX(0.012, 0.01, lit(C.steel, 'metal'), 0, 0.93, -0.08))
  const head = new THREE.Group()
  head.position.set(0, 0.9, -0.03)
  head.rotation.set(0.42, turn, 0)
  head.add(box(0.09, 0.08, 0.2, lit('#e9edf2'), 0, 0, 0.02, 0.012), cylinder(0.032, 0.032, 0.03, lit('#0c0e12'), 0, 0, 0.13, 12))
  head.children[1].rotation.x = Math.PI / 2
  g.add(head)
  const led = mesh(new THREE.SphereGeometry(0.009, 6, 5), glow(C.red), 0.03, 0.03, 0.12)
  const holder = new THREE.Group()
  holder.position.copy(head.position)
  holder.rotation.copy(head.rotation)
  holder.add(led)
  live.add(holder)
  return { solid: g, live, update: (t) => (led.visible = Math.floor(t * 1.2) % 2 === 0) }
}

export const SECURITY = {
  'cctv-wall': monitorWall,
  'cctv-desk': operatorDesk,
  'cctv-chair': operatorChair,
  'cctv-rack': recorderRack,
  'cctv-board': corkBoard,
  'cctv-cot': campBed,
  'cctv-cables': floorCables,
  'cctv-camera': wallCamera,
}
