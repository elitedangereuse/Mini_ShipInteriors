import * as THREE from 'three'
import { BLASTER_PACK } from '../assets'
import { tr } from '../i18n'
import { WEAPONS } from '../range-weapons'
import { ARENA_TEAMS } from '../../shared/arena.js'
import { animatedScreen, box, cylinder, decal, drawnTexture, glow, lit, mesh, type Builder } from './kit'
import { kitModel } from './nature'

/*
 * Le lobby de l'arène (cale, pièce 'y', cf. src/arena/) : pris sur le coin sud-est du lobby de la
 * zone thargoïde, derrière une cloison vitrée. Là où le lobby de la zone est vert et ambre, celui-ci
 * est aux couleurs des deux équipes, orange et bleu : le sol peint (une moitié par équipe, le rond
 * central), le guichet de l'arbitre, le classement des joueurs en face de lui, le râtelier des cinq armes, et, côté
 * zone thargoïde, le marquage qui mène à la porte. Le terminal, lui, est dans range.ts.
 */

const C = {
  steel: '#4a4f58',
  steelDark: '#2a2d33',
  deep: '#14161a',
  line: '#e6e9ee',
  orange: ARENA_TEAMS[0].color,
  blue: ARENA_TEAMS[1].color,
}
const FONT = 'bold 64px system-ui, sans-serif'

/**
 * Ce que le tableau du classement affiche (cf. arenaBoard) : les premiers du classement tenu par le
 * site, que le jeu relit au démarrage et après chaque partie (cf. src/arena/client.ts). `stamp`
 * change à chaque relecture.
 */
export const arenaRanks: { rows: { name: string; wins: number }[]; stamp: number } = { rows: [], stamp: 0 }

/** Le sol du lobby (`label` : « largeur,profondeur ») : une moitié par équipe, le rond central, les chevrons de l'entrée. */
const arenaFloor: Builder = ({ label }) => {
  const [w, d] = (label ?? '2.7,4.7').split(',').map(Number)
  const W = 512, H = Math.round((512 * d) / w)
  const texture = drawnTexture(W, H, (c) => {
    c.fillStyle = '#2a2e37'
    c.fillRect(0, 0, W, H)
    // Une moitié par équipe, séparées par la ligne médiane.
    c.globalAlpha = 0.5
    c.fillStyle = C.orange
    c.fillRect(0, 0, W / 2, H)
    c.fillStyle = C.blue
    c.fillRect(W / 2, 0, W / 2, H)
    c.globalAlpha = 1
    c.lineWidth = 10
    for (const [color, x] of [[C.orange, 14], [C.blue, W - 14]] as const) {
      c.strokeStyle = color
      c.beginPath()
      c.moveTo(x, 14)
      c.lineTo(x, H - 14)
      c.stroke()
    }
    c.strokeStyle = C.line
    c.lineWidth = 6
    c.setLineDash([26, 18])
    c.beginPath()
    c.moveTo(W / 2, 20)
    c.lineTo(W / 2, H - 20)
    c.stroke()
    c.setLineDash([])
    // Le rond central, et son « VS ».
    c.fillStyle = '#14161a'
    c.beginPath()
    c.arc(W / 2, H * 0.42, 92, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    c.font = FONT
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = C.orange
    c.fillText('V', W / 2 - 24, H * 0.42 + 4)
    c.fillStyle = C.blue
    c.fillText('S', W / 2 + 24, H * 0.42 + 4)
    // Les chevrons de l'entrée, au nord.
    c.lineWidth = 12
    c.lineCap = 'square'
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = i % 2 ? C.blue : C.orange
      const y = 40 + i * 30
      c.beginPath()
      c.moveTo(W / 2 - 70, y)
      c.lineTo(W / 2, y + 34)
      c.lineTo(W / 2 + 70, y)
      c.stroke()
    }
  })
  // Dans un groupe : c'est lui que le pont tourne, la plaque reste à plat.
  return { solid: new THREE.Group().add(decal(texture, w, d, 0.008)) }
}

/** Marquage au sol devant la porte, côté zone thargoïde : « ARÈNE », et la flèche. */
const arenaEntry: Builder = () => {
  const texture = drawnTexture(512, 200, (c) => {
    c.clearRect(0, 0, 512, 200)
    c.fillStyle = '#14161acc'
    c.fillRect(0, 0, 512, 200)
    c.fillStyle = C.orange
    c.fillRect(0, 0, 256, 14)
    c.fillStyle = C.blue
    c.fillRect(256, 0, 256, 14)
    c.font = 'bold 92px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = C.line
    c.fillText(tr('ARÈNE', 'ARENA'), 256, 92)
    c.fillStyle = C.orange
    c.beginPath()
    c.moveTo(216, 150)
    c.lineTo(256, 192)
    c.lineTo(296, 150)
    c.fill()
  })
  return { solid: new THREE.Group().add(decal(texture, 1.8, 0.7, 0.009)) }
}

/**
 * Le guichet de l'arbitre : un petit box vitré adossé à la cloison (l'arbitre s'y tient, cf.
 * src/arena/referee.ts), son comptoir, son enseigne, et derrière la vitre le tableau des deux
 * équipes. On lui parle au comptoir.
 */
const arenaBooth: Builder = () => {
  const g = new THREE.Group()
  const steel = lit(C.steel, 'metal'), dark = lit(C.steelDark, 'metal')
  const W = 2, front = 0.45, back = -0.3
  // Une vitre à peine teintée, sans reflets : on doit voir l'arbitre derrière. Translucide, elle
  // reste à part (`live`) : fusionnée avec le reste du meuble, elle deviendrait opaque.
  const live = new THREE.Group()
  const pane = new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })
  // Le fond du box : il s'adosse à une cloison vitrée.
  g.add(box(W, 1.1, 0.05, dark, 0, 0.55, back))
  // Comptoir : une moitié par équipe.
  g.add(box(W, 0.42, 0.24, steel, 0, 0.21, front, 0.01))
  g.add(box(W + 0.04, 0.03, 0.3, dark, 0, 0.435, front + 0.01))
  g.add(box(W / 2, 0.05, 0.01, glow(C.orange), -W / 4, 0.3, front + 0.125))
  g.add(box(W / 2, 0.05, 0.01, glow(C.blue), W / 4, 0.3, front + 0.125))
  // La vitre, ses montants, les flancs du box.
  live.add(mesh(new THREE.PlaneGeometry(W - 0.06, 0.56), pane, 0, 0.73, front))
  for (const x of [-W / 2 + 0.03, 0, W / 2 - 0.03]) g.add(box(0.05, 0.6, 0.06, dark, x, 0.74, front))
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) {
    g.add(box(0.04, 0.42, front - back, steel, x, 0.21, (front + back) / 2))
    const side = mesh(new THREE.PlaneGeometry(front - back, 0.56), pane, x, 0.73, (front + back) / 2)
    side.rotation.y = Math.PI / 2
    live.add(side)
    g.add(box(0.05, 0.6, 0.05, dark, x, 0.74, back + 0.02))
  }
  g.add(box(W + 0.04, 0.09, 0.1, dark, 0, 1.06, front))
  // L'hygiaphone, et la fente sous la vitre.
  g.add(cylinder(0.06, 0.06, 0.012, lit('#5a616b'), -0.5, 0.64, front + 0.004, 16).rotateX(Math.PI / 2))
  g.add(box(0.4, 0.03, 0.18, lit('#101215'), -0.5, 0.45, front + 0.02))
  // L'enseigne.
  const sign = drawnTexture(512, 64, (c) => {
    c.fillStyle = '#17120c'
    c.fillRect(0, 0, 512, 64)
    c.font = 'bold 36px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = C.orange
    c.fillText(tr('ARBITRE · INSCRIPTIONS', 'REFEREE · SIGN-UP'), 256, 34)
  })
  g.add(mesh(new THREE.PlaneGeometry(1.3, 0.16), new THREE.MeshLambertMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.7 }), 0, 1.06, front + 0.052))
  // Derrière la vitre : le pupitre, et le tableau des équipes qui défile.
  g.add(box(0.7, 0.34, 0.24, dark, 0.55, 0.17, front - 0.2))
  const screen = animatedScreen(256, 160, 2, (c, t) => {
    c.fillStyle = '#0b0d10'
    c.fillRect(0, 0, 256, 160)
    const beat = Math.floor(t) % 4
    c.font = 'bold 54px ui-monospace, Menlo, monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = C.orange
    c.fillText(String(7 + beat), 70, 70)
    c.fillStyle = C.blue
    c.fillText(String(9 - (beat % 2)), 186, 70)
    c.fillStyle = C.line
    c.font = 'bold 26px ui-monospace, Menlo, monospace'
    c.fillText('–', 128, 68)
    c.fillStyle = beat % 2 ? '#39d98a' : '#5c6470'
    c.fillText(tr('EN DIRECT', 'LIVE'), 128, 132)
  })
  const face = mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ map: screen.texture }), 0.55, 0.52, front - 0.3)
  face.rotation.x = -0.25
  live.add(face)
  return { solid: g, live, update: (t) => screen.tick(t) }
}

/** Le râtelier (dos au mur) : les cinq armes de l'arène, chacune sur son liseré de couleur. */
const arenaRack: Builder = () => {
  const g = new THREE.Group()
  const W = 1.15
  g.add(box(W, 0.78, 0.04, lit(C.deep), 0, 0.6, 0.02))
  g.add(box(W + 0.06, 0.04, 0.08, lit(C.steelDark, 'metal'), 0, 0.2, 0.04))
  g.add(box(W + 0.06, 0.04, 0.08, lit(C.steelDark, 'metal'), 0, 1, 0.04))
  WEAPONS.forEach((w, i) => {
    const y = 0.9 - i * 0.15
    g.add(box(W - 0.1, 0.012, 0.01, glow(w.color), 0, y - 0.055, 0.045))
    const gun = kitModel(w.model, 0.3, 0, 0, Math.PI / 2, 0, { pack: BLASTER_PACK })
    gun.position.set((i % 2 ? 0.12 : -0.12), y - 0.045, 0.07)
    g.add(gun)
  })
  return { solid: g }
}

/**
 * Le classement des joueurs (dos au mur), face au guichet de l'arbitre : un grand écran, les cinq
 * premiers et leurs victoires, les trois marches du podium en tête.
 */
const arenaBoard: Builder = () => {
  const g = new THREE.Group()
  const W = 1.5, H = 0.84
  g.add(box(W + 0.08, H + 0.08, 0.05, lit(C.steelDark, 'metal'), 0, 0.66, 0.025, 0.01))
  g.add(box(W + 0.08, 0.03, 0.07, glow(C.orange), -0.0, 0.2, 0.035))
  let drawn = -1
  const MEDALS = ['#ffd23f', '#d9dde3', '#d08a4a']
  const screen = animatedScreen(512, 288, 1, (c) => {
    drawn = arenaRanks.stamp
    c.fillStyle = '#0b0d10'
    c.fillRect(0, 0, 512, 288)
    c.fillStyle = C.orange
    c.fillRect(0, 0, 256, 6)
    c.fillStyle = C.blue
    c.fillRect(256, 0, 256, 6)
    c.textBaseline = 'middle'
    c.textAlign = 'left'
    c.font = 'bold 30px system-ui, sans-serif'
    c.fillStyle = C.line
    c.fillText(tr('CLASSEMENT', 'RANKING'), 22, 36)
    c.textAlign = 'right'
    c.font = 'bold 15px system-ui, sans-serif'
    c.fillStyle = '#8d96a3'
    c.fillText(tr('VICTOIRES', 'WINS'), 490, 38)
    if (!arenaRanks.rows.length) {
      c.textAlign = 'center'
      c.font = '22px system-ui, sans-serif'
      c.fillText(tr('La première place est à prendre', 'First place is up for grabs'), 256, 160)
      return
    }
    arenaRanks.rows.forEach((r, i) => {
      const y = 82 + i * 42
      c.fillStyle = i % 2 ? '#14171c' : '#1a1e25'
      c.fillRect(14, y - 18, 484, 36)
      c.fillStyle = MEDALS[i] ?? '#5c6470'
      c.fillRect(14, y - 18, 6, 36)
      c.textAlign = 'left'
      c.font = 'bold 22px system-ui, sans-serif'
      c.fillText(String(i + 1), 32, y + 1)
      c.fillStyle = C.line
      c.font = `${i ? '' : 'bold '}22px system-ui, sans-serif`
      c.fillText(r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, 66, y + 1)
      c.textAlign = 'right'
      c.font = 'bold 24px ui-monospace, Menlo, monospace'
      c.fillStyle = MEDALS[i] ?? C.line
      c.fillText(String(r.wins), 486, y + 1)
    })
  })
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  live.add(mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.66, 0.052))
  // L'écran ne se redessine que quand le classement a été relu.
  return { solid: g, live, update: (t) => { if (drawn !== arenaRanks.stamp) screen.tick(t) } }
}

export const ARENA = {
  'arena-board': arenaBoard,
  'arena-floor': arenaFloor,
  'arena-entry': arenaEntry,
  'arena-booth': arenaBooth,
  'arena-rack': arenaRack,
} satisfies Record<string, Builder>
