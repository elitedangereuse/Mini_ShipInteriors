import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BASE } from '../assets'
import { tr } from '../i18n'
import { ROSTER } from '../arena/roster'
import { ARENA_MAPS, ARENA_TEAMS, CHARACTER_IDS, arenaZone } from '../../shared/arena.js'
import { animatedScreen, box, cylinder, decal, drawnTexture, glow, holoMaterial, lit, mesh, type Builder } from './kit'

/*
 * Le lobby de l'arène (cale, pièce 'y', cf. src/arena/) : au coin sud-est du hall de la cale,
 * derrière une cloison vitrée, en face du lobby de la zone thargoïde. Là où celui de la zone est sombre, celui-ci
 * est aux couleurs des deux équipes, orange et bleu : le sol peint (une moitié par équipe, le rond
 * central), le guichet de l'arbitre, le classement des joueurs au milieu du mur d'en face, entre les
 * bannières des deux équipes, le tableau des six personnages, et, côté hall, le marquage qui
 * mène à la porte. À l'entrée, un projecteur fait tourner l'hologramme de l'arène : il
 * passe au rouge quand une partie se joue, et c'est de là qu'on la regarde. Autour : le trophée, le
 * banc des spectateurs, les fanions. Le terminal, lui, est dans range.ts.
 *
 * Le jeu s'appelle CMDR Arena, et son logo (public/assets/arena/cmdr-arena.svg : le titre, deux
 * combattants que la foudre sépare) est sur l'enseigne lumineuse au-dessus de la porte, côté
 * hall, et peint au sol au milieu du lobby, sans son fond (cmdr-arena-floor.svg).
 */

const C = {
  steel: '#4a4f58',
  steelDark: '#2a2d33',
  deep: '#14161a',
  line: '#e6e9ee',
  orange: ARENA_TEAMS[0].color,
  blue: ARENA_TEAMS[1].color,
}
/** Le logo de CMDR Arena, et sa version sans fond (pour le sol) : le fichier, l'image une fois chargée (cf. logoTexture). */
const LOGOS = {
  full: { file: 'cmdr-arena.svg', image: null as HTMLImageElement | null, asked: null as Promise<HTMLImageElement> | null },
  floor: { file: 'cmdr-arena-floor.svg', image: null as HTMLImageElement | null, asked: null as Promise<HTMLImageElement> | null },
}

/**
 * Texture où figure le logo : `paint` la dessine tout de suite sans lui (`null`), puis de nouveau
 * quand l'image est là.
 */
export function logoTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D, logo: HTMLImageElement | null) => void, which: keyof typeof LOGOS = 'full'): THREE.CanvasTexture {
  const logo = LOGOS[which]
  const texture = drawnTexture(w, h, (c) => paint(c, logo.image))
  if (logo.image || typeof Image === 'undefined') return texture
  logo.asked ??= new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve((logo.image = img))
    img.src = `${BASE}arena/${logo.file}`
  })
  void logo.asked.then((img) => {
    paint((texture.image as HTMLCanvasElement).getContext('2d')!, img)
    texture.needsUpdate = true
  })
  return texture
}

/**
 * Ce que le tableau du classement affiche (cf. arenaBoard) : les premiers du classement tenu par le
 * site, que le jeu relit au démarrage et après chaque partie (cf. src/arena/client.ts). `stamp`
 * change à chaque relecture.
 */
export const arenaRanks: { rows: { name: string; wins: number }[]; stamp: number } = { rows: [], stamp: 0 }

/**
 * Les parties en cours (cf. src/arena/client.ts, à chaque nouvelle du relais) : le tableau en donne
 * le score sur sa dernière ligne, et l'hologramme de l'entrée passe au rouge. `stamp`
 * change avec elles.
 */
export const arenaLive: { games: { lobby: number; map: string; rounds: [number, number]; score: [number, number] }[]; stamp: number } = { games: [], stamp: 0 }

/** Le sol du lobby (`label` : « largeur,profondeur ») : une moitié par équipe, la ligne médiane ; au milieu, le logo (cf. arenaLogo). */
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
    // Des dalles : un quadrillage à peine marqué, un boulon à chaque coin.
    const tile = W / 6
    c.strokeStyle = '#0b0d1055'
    c.lineWidth = 2
    c.fillStyle = '#0b0d1066'
    for (let y = 0; y <= H; y += tile) {
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(W, y)
      c.stroke()
      for (let x = 0; x <= W; x += tile) {
        c.beginPath()
        c.arc(x + 9, y + 9, 2.5, 0, Math.PI * 2)
        c.arc(x - 9, y + 9, 2.5, 0, Math.PI * 2)
        c.fill()
      }
    }
    for (let x = 0; x <= W; x += tile) {
      c.beginPath()
      c.moveTo(x, 0)
      c.lineTo(x, H)
      c.stroke()
    }
    // Le nom de chaque camp, au pochoir, le long de son bord ; et l'usure du passage, vers le terminal.
    c.save()
    c.font = 'bold 54px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.globalAlpha = 0.5
    for (const [text, color, x, turn] of [[tr('ORANGE', 'ORANGE'), C.orange, 58, -1], [tr('BLEUE', 'BLUE'), C.blue, W - 58, 1]] as const) {
      c.save()
      c.translate(x, H * 0.76)
      c.rotate((turn * Math.PI) / 2)
      c.fillStyle = color
      c.fillText(text, 0, 0)
      c.restore()
    }
    c.restore()
    // Les coins : des hachures de chantier.
    c.save()
    c.globalAlpha = 0.85
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]] as const) {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? '#14161a' : '#ffd23f'
        c.beginPath()
        c.moveTo(cx + sx * (i * 16), cy)
        c.lineTo(cx + sx * ((i + 1) * 16), cy)
        c.lineTo(cx, cy + sy * ((i + 1) * 16))
        c.lineTo(cx, cy + sy * (i * 16))
        c.fill()
      }
    }
    c.restore()
    c.strokeStyle = C.line
    c.lineWidth = 6
    c.setLineDash([26, 18])
    c.beginPath()
    c.moveTo(W / 2, 20)
    c.lineTo(W / 2, H - 20)
    c.stroke()
    c.setLineDash([])
  })
  // Dans un groupe : c'est lui que le pont tourne, la plaque reste à plat.
  return { solid: new THREE.Group().add(decal(texture, w, d, 0.008)) }
}

/** Marquage au sol devant la porte, côté zone thargoïde : « CMDR ARENA », et la flèche. */
const arenaEntry: Builder = () => {
  const texture = drawnTexture(512, 200, (c) => {
    c.clearRect(0, 0, 512, 200)
    c.fillStyle = '#14161acc'
    c.fillRect(0, 0, 512, 200)
    c.fillStyle = C.orange
    c.fillRect(0, 0, 256, 14)
    c.fillStyle = C.blue
    c.fillRect(256, 0, 256, 14)
    c.font = 'bold 76px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = C.line
    c.fillText('CMDR ARENA', 256, 90, 480)
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
 * Le logo peint au sol (`label` : son côté, en mètres), le titre vers le nord : il se lit vu de
 * dessus. C'est sa version sans fond : entre les combattants et l'anneau, on voit le sol de la pièce.
 */
const arenaLogo: Builder = ({ label }) => {
  const side = Number(label) || 1.4
  const texture = logoTexture(512, 512, (c, logo) => {
    c.clearRect(0, 0, 512, 512)
    if (!logo) return
    // De la peinture : un rien passée, pour ne pas flotter au-dessus des dalles.
    c.globalAlpha = 0.94
    c.drawImage(logo, 0, 0, 512, 512)
    c.globalAlpha = 1
  }, 'floor')
  // Il est peint sur le sol de la pièce, lui-même un décalque translucide : sans écrire dans le tampon
  // de profondeur, et dessiné après lui. Sinon ses parties vides masquent ce sol, et laissent voir
  // dans un carré les dalles sombres du pont.
  const paint = decal(texture, side, side, 0.01)
  ;(paint.material as THREE.Material).depthWrite = false
  paint.renderOrder = 1
  return { live: new THREE.Group().add(paint) }
}

/**
 * L'enseigne lumineuse (dos au mur), au-dessus de la porte du lobby : un caisson à la largeur de la
 * porte double, le logo au milieu, une aile par équipe. Elle a deux faces : celle qu'on voit en
 * arrivant du hall de la cale, et son dos, que montre la vue de dessus. Elle tient entre le haut
 * de la porte et le plafond ; deux potences la portent.
 */
const arenaSign: Builder = () => {
  const W = 1.9, H = 0.7, Y = 1.81, D = 0.09
  const TW = 1024, TH = Math.round((1024 * H) / W)
  const texture = logoTexture(TW, TH, (c, logo) => {
    c.fillStyle = '#0d0f13'
    c.fillRect(0, 0, TW, TH)
    // Une aile par équipe : sa lueur, et ses chevrons qui pointent vers le logo.
    for (const [color, from, to, dir] of [[C.orange, 0, TW * 0.42, 1], [C.blue, TW, TW * 0.58, -1]] as const) {
      const wing = c.createLinearGradient(from, 0, to, 0)
      wing.addColorStop(0, `${color}cc`)
      wing.addColorStop(1, `${color}00`)
      c.fillStyle = wing
      c.fillRect(Math.min(from, to), 0, Math.abs(to - from), TH)
      c.strokeStyle = color
      c.lineWidth = 22
      c.lineCap = 'square'
      for (let i = 0; i < 3; i++) {
        const x = from + dir * (70 + i * 78)
        c.globalAlpha = 0.45 + i * 0.25
        c.beginPath()
        c.moveTo(x, TH * 0.24)
        c.lineTo(x + dir * 58, TH / 2)
        c.lineTo(x, TH * 0.76)
        c.stroke()
      }
      c.globalAlpha = 1
    }
    c.strokeStyle = '#2a2d33'
    c.lineWidth = 10
    c.strokeRect(5, 5, TW - 10, TH - 10)
    const side = TH - 14
    if (logo) c.drawImage(logo, (TW - side) / 2, 7, side, side)
    else {
      c.font = 'bold 96px system-ui, sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = C.line
      c.fillText('CMDR ARENA', TW / 2, TH / 2)
    }
  })
  const g = new THREE.Group()
  const dark = lit(C.steelDark, 'metal')
  g.add(box(W + 0.06, H + 0.06, D, dark, 0, Y, D / 2 + 0.005))
  // Les potences, du haut de la cloison au caisson, et un liseré jaune (la foudre du logo) sur les chants.
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) g.add(box(0.05, Y - H / 2 - 1.02, 0.05, dark, x, (Y - H / 2 + 1.02) / 2, 0.03))
  for (const x of [-W / 2 - 0.035, W / 2 + 0.035]) g.add(box(0.02, H, D + 0.01, glow('#ffd23f'), x, Y, D / 2 + 0.005))
  const face = new THREE.MeshLambertMaterial({ map: texture, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.85 })
  g.add(mesh(new THREE.PlaneGeometry(W, H), face, 0, Y, D + 0.011))
  g.add(mesh(new THREE.PlaneGeometry(W, H).rotateY(Math.PI), face, 0, Y, -0.001))
  return { solid: g }
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

/**
 * Le tableau des personnages (dos au mur) : les six membres de l'équipage qu'on joue dans l'arène,
 * sur deux rangées, chacun dans sa case à sa couleur, avec son nom, son rôle et son arme.
 */
const arenaRoster: Builder = () => {
  const g = new THREE.Group()
  const W = 1.15, H = 0.78, Y = 0.62
  g.add(box(W + 0.06, H + 0.06, 0.04, lit(C.steelDark, 'metal'), 0, Y, 0.02))
  const texture = drawnTexture(768, 520, (c) => {
    c.fillStyle = '#101216'
    c.fillRect(0, 0, 768, 520)
    c.fillStyle = '#e6e9ee'
    c.font = '800 34px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText(tr('CHOISISSEZ VOTRE PERSONNAGE', 'PICK YOUR CHARACTER'), 384, 50)
    CHARACTER_IDS.forEach((id, i) => {
      const who = ROSTER[id]
      const x = 16 + (i % 3) * 248, y = 74 + Math.floor(i / 3) * 222
      c.fillStyle = '#1b1e25'
      c.fillRect(x, y, 240, 210)
      c.fillStyle = who.color
      c.fillRect(x, y, 240, 8)
      // Sa pastille : un rond à sa couleur, l'initiale dedans.
      c.beginPath()
      c.arc(x + 120, y + 72, 46, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#101216'
      c.font = '900 52px system-ui, sans-serif'
      c.fillText(who.name[0], x + 120, y + 91)
      c.fillStyle = who.color
      c.font = '800 28px system-ui, sans-serif'
      c.fillText(who.name, x + 120, y + 152, 224)
      c.fillStyle = '#c5cbd4'
      c.font = '600 19px system-ui, sans-serif'
      c.fillText(who.role, x + 120, y + 178, 224)
      c.fillStyle = '#8d96a3'
      c.font = 'italic 17px system-ui, sans-serif'
      c.fillText(who.weapon, x + 120, y + 199, 224)
    })
  })
  g.add(mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: texture }), 0, Y, 0.042))
  return { solid: g }
}

/**
 * Le classement des joueurs (dos au mur), au milieu du mur du hangar : un grand écran, les cinq
 * premiers et leurs victoires, les trois marches du podium en tête ; sur sa dernière ligne, le score
 * des parties en cours.
 */
const arenaBoard: Builder = () => {
  const g = new THREE.Group()
  const W = 2.1, H = 1.05, Y = 0.82
  const dark = lit(C.steelDark, 'metal')
  g.add(box(W + 0.1, H + 0.1, 0.05, dark, 0, Y, 0.025, 0.01))
  // Deux pattes le tiennent au mur ; un liseré par équipe, de chaque côté.
  for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) g.add(box(0.06, 0.2, 0.04, dark, x, Y - H / 2 - 0.14, 0.02))
  g.add(box(0.025, H + 0.1, 0.07, glow(C.orange), -W / 2 - 0.06, Y, 0.035))
  g.add(box(0.025, H + 0.1, 0.07, glow(C.blue), W / 2 + 0.06, Y, 0.035))
  let drawn = ''
  const MEDALS = ['#ffd23f', '#d9dde3', '#d08a4a']
  const stamp = () => `${arenaRanks.stamp}:${arenaLive.stamp}`
  const screen = animatedScreen(640, 320, 1, (c) => {
    drawn = stamp()
    c.fillStyle = '#0b0d10'
    c.fillRect(0, 0, 640, 320)
    c.fillStyle = C.orange
    c.fillRect(0, 0, 320, 6)
    c.fillStyle = C.blue
    c.fillRect(320, 0, 320, 6)
    c.textBaseline = 'middle'
    c.textAlign = 'left'
    c.font = 'bold 30px system-ui, sans-serif'
    c.fillStyle = C.line
    c.fillText(tr('CMDR ARENA · CLASSEMENT', 'CMDR ARENA · RANKING'), 24, 36)
    c.textAlign = 'right'
    c.font = 'bold 15px system-ui, sans-serif'
    c.fillStyle = '#8d96a3'
    c.fillText(tr('VICTOIRES', 'WINS'), 616, 38)
    if (!arenaRanks.rows.length) {
      c.textAlign = 'center'
      c.font = '24px system-ui, sans-serif'
      c.fillText(tr('La première place est à prendre', 'First place is up for grabs'), 320, 150)
    }
    arenaRanks.rows.forEach((r, i) => {
      const y = 80 + i * 40
      c.fillStyle = i % 2 ? '#14171c' : '#1a1e25'
      c.fillRect(16, y - 17, 608, 34)
      c.fillStyle = MEDALS[i] ?? '#5c6470'
      c.fillRect(16, y - 17, 6, 34)
      c.textAlign = 'left'
      c.font = 'bold 22px system-ui, sans-serif'
      c.fillText(String(i + 1), 34, y + 1)
      c.fillStyle = C.line
      c.font = `${i ? '' : 'bold '}22px system-ui, sans-serif`
      c.fillText(r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name, 70, y + 1)
      c.textAlign = 'right'
      c.font = 'bold 24px ui-monospace, Menlo, monospace'
      c.fillStyle = MEDALS[i] ?? C.line
      c.fillText(String(r.wins), 612, y + 1)
    })
    // La dernière ligne : les parties en cours, les manches gagnées par chaque camp.
    c.fillStyle = '#14171c'
    c.fillRect(0, 280, 640, 40)
    c.textAlign = 'left'
    c.font = 'bold 18px system-ui, sans-serif'
    if (!arenaLive.games.length) {
      c.fillStyle = '#5c6470'
      c.fillText(tr('Aucune partie en cours', 'No match in progress'), 24, 301)
      return
    }
    c.fillStyle = '#ff5a4a'
    c.beginPath()
    c.arc(30, 300, 7, 0, Math.PI * 2)
    c.fill()
    c.fillText(tr('EN DIRECT', 'LIVE'), 46, 301)
    let x = 170
    for (const game of arenaLive.games.slice(0, 3)) {
      c.fillStyle = '#8d96a3'
      c.font = '16px system-ui, sans-serif'
      c.fillText(`Lobby ${game.lobby}`, x, 301)
      c.font = 'bold 20px ui-monospace, Menlo, monospace'
      c.fillStyle = C.orange
      c.fillText(String(game.rounds[0]), x + 70, 301)
      c.fillStyle = C.line
      c.fillText('–', x + 86, 300)
      c.fillStyle = C.blue
      c.fillText(String(game.rounds[1]), x + 104, 301)
      x += 150
    }
  })
  screen.texture.magFilter = THREE.LinearFilter
  const live = new THREE.Group()
  live.add(mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, Y, 0.052))
  // L'écran ne se redessine que quand le classement a été relu, ou qu'une partie commence ou finit.
  return { solid: g, live, update: (t) => { if (drawn !== stamp()) screen.tick(t) } }
}

/** La bannière d'une équipe (`label` : « orange » ou « blue »), dos au mur : sa couleur, son emblème, son nom. */
const arenaBanner: Builder = ({ label }) => {
  const blue = label === 'blue'
  const color = blue ? C.blue : C.orange
  const texture = drawnTexture(160, 384, (c) => {
    c.clearRect(0, 0, 160, 384)
    // Une oriflamme : la pointe en bas.
    c.fillStyle = color
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(160, 0)
    c.lineTo(160, 320)
    c.lineTo(80, 384)
    c.lineTo(0, 320)
    c.fill()
    c.fillStyle = '#0b0d1033'
    c.fillRect(0, 0, 160, 14)
    c.fillStyle = '#14161a'
    c.fillRect(14, 30, 132, 6)
    c.fillRect(14, 296, 132, 6)
    // L'emblème : un chevron pour l'une, une étoile pour l'autre, dans un disque sombre.
    c.beginPath()
    c.arc(80, 150, 54, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = color
    c.beginPath()
    if (blue) {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 17 : 40, a = -Math.PI / 2 + (i * Math.PI) / 5
        c.lineTo(80 + Math.cos(a) * r, 150 + Math.sin(a) * r)
      }
    } else {
      for (const y of [128, 158]) {
        c.moveTo(46, y + 14)
        c.lineTo(80, y - 16)
        c.lineTo(114, y + 14)
        c.lineTo(114, y + 30)
        c.lineTo(80, y)
        c.lineTo(46, y + 30)
      }
    }
    c.fill()
    c.fillStyle = '#14161a'
    c.font = 'bold 30px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(blue ? tr('BLEUE', 'BLUE') : 'ORANGE', 80, 250)
  })
  const g = new THREE.Group()
  g.add(box(0.5, 0.035, 0.035, lit(C.steelDark, 'metal'), 0, 1.5, 0.03))
  for (const x of [-0.22, 0.22]) g.add(box(0.02, 0.05, 0.02, lit(C.steel, 'metal'), x, 1.52, 0.015))
  const live = new THREE.Group()
  live.add(mesh(new THREE.PlaneGeometry(0.44, 1.05), new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), 0, 0.965, 0.04))
  return { solid: g, live }
}

/** Le trophée de l'arène, sur son socle : une coupe dorée, basse (on la voit de partout). */
const arenaTrophy: Builder = () => {
  const g = new THREE.Group()
  const gold = new THREE.MeshLambertMaterial({ color: '#ffc93a', emissive: '#6b4300' })
  g.add(box(0.36, 0.26, 0.36, lit(C.steelDark, 'metal'), 0, 0.13, 0, 0.015))
  g.add(box(0.4, 0.03, 0.4, lit(C.deep), 0, 0.015, 0))
  g.add(box(0.37, 0.02, 0.37, glow('#ffd23f'), 0, 0.2, 0))
  g.add(cylinder(0.07, 0.085, 0.03, gold, 0, 0.275, 0, 16))
  g.add(cylinder(0.018, 0.03, 0.08, gold, 0, 0.33, 0, 10))
  g.add(cylinder(0.1, 0.045, 0.13, gold, 0, 0.435, 0, 18))
  g.add(cylinder(0.105, 0.105, 0.012, gold, 0, 0.5, 0, 18))
  for (const side of [-1, 1]) {
    const handle = mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI), gold, side * 0.1, 0.44, 0)
    handle.rotation.z = (-side * Math.PI) / 2
    g.add(handle)
  }
  return { solid: g }
}

/** Le banc des spectateurs (dos au mur) : bas, un coussin par équipe. */
const arenaBench: Builder = () => {
  const g = new THREE.Group()
  const W = 2.2, steel = lit(C.steel, 'metal')
  g.add(box(W, 0.05, 0.36, lit(C.steelDark, 'metal'), 0, 0.24, 0.2, 0.01))
  for (const x of [-W / 2 + 0.12, 0, W / 2 - 0.12]) g.add(box(0.06, 0.22, 0.3, steel, x, 0.11, 0.2))
  g.add(box(W / 2 - 0.06, 0.05, 0.3, lit(C.orange), -W / 4, 0.29, 0.2, 0.02))
  g.add(box(W / 2 - 0.06, 0.05, 0.3, lit(C.blue), W / 4, 0.29, 0.2, 0.02))
  return { solid: g }
}

/** Une guirlande de fanions (`label` : sa longueur), tendue d'un mur à l'autre, aux couleurs des deux équipes. */
const arenaGarland: Builder = ({ label }) => {
  const length = Number(label) || 2.9
  const Y = 1.62, sag = 0.12, n = Math.round(length / 0.21)
  const at = (k: number) => new THREE.Vector3((k - 0.5) * length, Y - sag * 4 * k * (1 - k), 0)
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => at(i / 8))), 24, 0.006, 5), lit(C.deep))
  const flags: Record<string, THREE.BufferGeometry[]> = { [C.orange]: [], [C.blue]: [], [C.line]: [] }
  const colors = [C.orange, C.line, C.blue, C.line]
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n)
    const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.07, 0, 0), new THREE.Vector3(0.07, 0, 0), new THREE.Vector3(0, -0.16, 0)])
    flag.setIndex([0, 2, 1])
    flag.computeVertexNormals()
    flag.rotateY(((i % 3) - 1) * 0.25)
    flag.translate(p.x, p.y, p.z)
    flags[colors[i % colors.length]].push(flag)
  }
  const live = new THREE.Group().add(cord)
  for (const [color, parts] of Object.entries(flags)) {
    if (parts.length) live.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })))
    for (const part of parts) part.dispose()
  }
  return { live }
}

/** Le plan d'une arène en hologramme, de `size` de large au plus : son sol, ses obstacles en relief, ses buissons, ses deux bases. */
function holoPlan(id: string, size: number): THREE.Group {
  const zone = arenaZone(id)
  const T = size / Math.max(zone.width, zone.height)
  const floor: THREE.BufferGeometry[] = [], blocks: THREE.BufferGeometry[] = [], bushes: THREE.BufferGeometry[] = [], bases: THREE.BufferGeometry[][] = [[], []]
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const c = zone.plan[z][x]
      if (c === ' ' || c === 'v') continue
      const px = (x - (zone.width - 1) / 2) * T, pz = (z - (zone.height - 1) / 2) * T
      // Le haut (un sol surélevé) : une dalle en relief.
      const lift = zone.top ? (zone.elev[z * zone.width + x] / zone.top) * T * 0.7 : 0
      floor.push(new THREE.PlaneGeometry(T, T).rotateX(-Math.PI / 2).translate(px, lift, pz))
      if (lift > 0 && !zone.blocked[z * zone.width + x]) blocks.push(new THREE.BoxGeometry(T * 0.98, lift, T * 0.98).translate(px, lift / 2, pz))
      if (zone.blocked[z * zone.width + x]) blocks.push(new THREE.BoxGeometry(T * 0.92, T * 0.8, T * 0.92).translate(px, lift + T * 0.4, pz))
      else if (c === 'g' || c === 'G') bushes.push(new THREE.BoxGeometry(T * 0.8, T * 0.3, T * 0.8).translate(px, lift + T * 0.15, pz))
      if (x < 3) bases[0].push(new THREE.PlaneGeometry(T, T).rotateX(-Math.PI / 2).translate(px, 0.002, pz))
      if (x >= zone.width - 3) bases[1].push(new THREE.PlaneGeometry(T, T).rotateX(-Math.PI / 2).translate(px, 0.002, pz))
    }
  }
  const plan = new THREE.Group()
  plan.add(new THREE.Mesh(mergeGeometries(floor), holoMaterial(null, '#7fefff', 0.16)))
  plan.add(new THREE.Mesh(mergeGeometries(blocks), holoMaterial(null, '#bff6ff', 0.85)))
  if (bushes.length) plan.add(new THREE.Mesh(mergeGeometries(bushes), holoMaterial(null, '#6dff9a', 0.7)))
  bases.forEach((tiles, team) => plan.add(new THREE.Mesh(mergeGeometries(tiles), holoMaterial(null, team ? C.blue : C.orange, 0.45))))
  for (const part of [...floor, ...blocks, ...bushes, ...bases.flat()]) part.dispose()
  plan.userData.id = id
  return plan
}

/**
 * Le projecteur de l'entrée, à côté du râtelier : l'hologramme de l'arène (son plan, cf. ARENA_MAPS),
 * qui tourne lentement au-dessus de sa base. Cyan au repos, il passe d'un plan à l'autre ; quand
 * une partie se joue, il montre le sien, l'anneau de la base passe au rouge et bat, et « EN DIRECT »
 * s'affiche : c'est là qu'on vient la regarder.
 */
const arenaHolo: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.4, 0.44, 0.05, lit(C.steelDark, 'metal'), 0, 0.025, 0, 28))
  g.add(cylinder(0.3, 0.3, 0.02, lit(C.deep), 0, 0.06, 0, 28))
  const ring = new THREE.MeshBasicMaterial({ color: '#7fefff' })
  g.add(mesh(new THREE.TorusGeometry(0.36, 0.014, 6, 40).rotateX(Math.PI / 2), ring, 0, 0.062, 0))
  const live = new THREE.Group()
  // Le faisceau, et les plans (un seul paraît à la fois).
  live.add(mesh(new THREE.CylinderGeometry(0.46, 0.26, 0.5, 28, 1, true), holoMaterial(null, '#7fefff', 0.1, 1, true), 0, 0.32, 0))
  const plans = ARENA_MAPS.map((m) => holoPlan(m.id, 0.85))
  const plan = new THREE.Group().add(...plans)
  // Le plan tourne à plat dans un cadre penché une fois pour toutes vers la vue de dessus (le
  // sud-est) : penché avec lui, il montrait son dessous à la caméra la moitié du tour.
  const tilt = new THREE.Group().add(plan)
  tilt.rotation.x = 0.22
  const lean = new THREE.Group().add(tilt)
  lean.position.y = 0.52
  lean.rotation.y = Math.PI / 4
  live.add(lean)
  const turn = new THREE.Group()
  live.add(turn)
  // « EN DIRECT » : au-dessus du plan, des deux côtés, seulement quand une partie se joue.
  const sign = drawnTexture(256, 64, (c) => {
    c.clearRect(0, 0, 256, 64)
    c.fillStyle = '#ff5a4a'
    c.beginPath()
    c.arc(26, 32, 12, 0, Math.PI * 2)
    c.fill()
    c.font = 'bold 34px system-ui, sans-serif'
    c.textBaseline = 'middle'
    c.fillText(tr('EN DIRECT', 'LIVE'), 48, 34)
  })
  const onAir = mesh(new THREE.PlaneGeometry(0.5, 0.125), holoMaterial(sign, '#ff5a4a', 1), 0, 0.86, 0)
  turn.add(onAir)
  const idle = new THREE.Color('#7fefff'), hot = new THREE.Color('#ff5a4a')
  return {
    solid: g,
    live,
    // Sa base seule arrête les pas : on traverse l'hologramme.
    extent: new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 0.9, 0.4)),
    update: (t) => {
      plan.rotation.y = turn.rotation.y = t * 0.22
      const shown = arenaLive.games[0]?.map ?? ARENA_MAPS[Math.floor(t / 9) % ARENA_MAPS.length].id
      for (const p of plans) p.visible = p.userData.id === shown
      const on = arenaLive.games.length > 0
      onAir.visible = on
      ring.color.copy(on ? hot : idle).multiplyScalar(on ? 0.65 + 0.35 * Math.sin(t * 5) : 1)
    },
  }
}

export const ARENA = {
  'arena-banner': arenaBanner,
  'arena-bench': arenaBench,
  'arena-board': arenaBoard,
  'arena-garland': arenaGarland,
  'arena-holo': arenaHolo,
  'arena-trophy': arenaTrophy,
  'arena-floor': arenaFloor,
  'arena-entry': arenaEntry,
  'arena-logo': arenaLogo,
  'arena-sign': arenaSign,
  'arena-booth': arenaBooth,
  'arena-roster': arenaRoster,
} satisfies Record<string, Builder>
