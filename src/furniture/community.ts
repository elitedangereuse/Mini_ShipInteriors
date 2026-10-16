import * as THREE from 'three'
import { animatedScreen, box, drawnTexture, glow, keepShared, lit, part, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le cœur communautaire du pont principal : le bandeau « En direct » de la salle commune, un ruban
 * lumineux tout le long de la mezzanine, qui fait défiler les nouvelles du site et du bord, et le Tableau d'honneur de la Promenade, un tableau à
 * palettes, comme ceux des grandes gares, entre deux stèles de marbre noir et de laiton, qui fait
 * défiler les classements de l'équipage. Le jeu leur fournit leurs données (cf. setCommunityFeed) :
 * le mobilier ne parle pas au site.
 */

/** Un classement du Tableau d'honneur : son nom, son unité, ses premiers. */
export interface HonourBoardData {
  label: string
  unit: string
  rows: { rank: number; name: string; score: number; avatar?: string }[]
}

export interface CommunityFeed {
  /** Les nouvelles du bandeau, la plus récente d'abord. */
  ticker(): string[]
  /** Les classements du Tableau d'honneur ; vide tant que le site n'a pas répondu. */
  boards(): HonourBoardData[]
  /** Le portrait d'un CMDR (adresse de son avatar), s'il est chargé. */
  avatar(url: string): CanvasImageSource | null
}

let feed: CommunityFeed | null = null
/** Les données du bandeau et du Tableau d'honneur : le jeu les fournit, et les met à jour quand il veut. */
export function setCommunityFeed(f: CommunityFeed) {
  feed = f
}

// ---------------------------------------------------------------- le bandeau « En direct »

/** Le bandeau : un ruban à LED, fin, dans un caisson sombre liseré d'orange ; sa longueur est son `label`. */
const TH = 0.2
/** Défilement du texte (pixels de l'écran par seconde) : à peu près 0,8 m/s. */
const SPEED = 280
/** Densité de l'écran (pixels par mètre). */
const DENSITY = 340

/**
 * Bandeau « En direct » (face à +z), comme le ruban lumineux d'un balcon de stade, tout le long du
 * garde-corps de la mezzanine (`label` : sa longueur, en mètres) : à gauche, le voyant rouge
 * « EN DIRECT » ; puis les nouvelles qui défilent sans fin en lettres ambre, séparées d'un losange,
 * répétées d'un bout à l'autre. Le texte change à la fin d'un tour.
 */
const liveTicker: Builder = ({ label }) => {
  const TW = Number(label) || 2
  const g = new THREE.Group()
  g.add(box(TW + 0.04, TH + 0.04, 0.04, lit('#101217', 'metal'), 0, 0, -0.01, 0.01))
  for (const s of [-1, 1]) g.add(box(TW + 0.04, 0.01, 0.012, glow('#ff8a1c'), 0, s * (TH / 2 + 0.02), 0.012))
  const PW = Math.min(4096, Math.round(TW * DENSITY)), PH = Math.round((PW * TH) / TW)
  const tagText = tr('EN DIRECT', 'LIVE')
  const font = (k: number) => `700 ${Math.round(PH * k)}px "DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif`
  /** Largeur du voyant : mesurée au premier dessin, à la taille de son texte. */
  let tag = 0
  let text = ''
  let start = 0
  let width = 0
  const screen = animatedScreen(PW, PH, 30, (c, t) => {
    if (!tag) {
      c.font = font(0.42)
      tag = Math.ceil(PH * 0.55 + c.measureText(tagText).width + PH * 0.2)
    }
    c.fillStyle = '#07080b'
    c.fillRect(0, 0, PW, PH)
    c.font = font(0.62)
    // Un tour fini (ou pas encore commencé) : on reprend les nouvelles du moment.
    if (!text || (t - start) * SPEED >= width) {
      start = t
      const items = feed?.ticker() ?? []
      text = (items.length ? items.join('   ◆   ') : tr('Le fil du bord est calme. Revenez dans un instant.', 'The ship\'s feed is quiet. Check back in a moment.')) + '   ◆   '
      width = Math.max(1, c.measureText(text).width)
    }
    // Les nouvelles, de droite à gauche, bout à bout sur toute la longueur.
    c.save()
    c.beginPath()
    c.rect(tag, 0, PW - tag, PH)
    c.clip()
    c.textBaseline = 'middle'
    c.fillStyle = '#ffb366'
    c.shadowColor = '#ff8a1c'
    c.shadowBlur = 8
    for (let x = tag - (t - start) * SPEED; x < PW; x += width) c.fillText(text, x, PH / 2 + 2)
    c.restore()
    // Les LED : une trame sombre par-dessus.
    c.fillStyle = 'rgba(0, 0, 0, 0.28)'
    for (let x = tag; x < PW; x += 6) c.fillRect(x, 0, 2, PH)
    for (let y = 0; y < PH; y += 6) c.fillRect(tag, y, PW - tag, 2)
    // Le voyant « EN DIRECT ».
    c.fillStyle = '#c62828'
    c.fillRect(0, 0, tag, PH)
    c.fillStyle = Math.floor(t * 1.5) % 2 ? '#ffffff' : '#ffb4b4'
    c.beginPath()
    c.arc(PH * 0.28, PH / 2, PH * 0.13, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#ffffff'
    c.font = font(0.42)
    c.textBaseline = 'middle'
    c.fillText(tagText, PH * 0.52, PH / 2 + 2)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(TW, TH), keepShared(new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false })), 0, 0, 0.012))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

// ---------------------------------------------------------------- le Tableau d'honneur

const BRASS = '#d8b062'
const SERIF = 'Georgia, "Times New Roman", serif'
const FLAP = '"DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif'
/** Un classement reste affiché tant de secondes, puis les palettes tournent jusqu'au suivant. */
const HOLD = 9
/** Caractères des palettes, dans l'ordre où elles défilent. */
const FLAPS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.'

/** Le texte d'une rangée de palettes : en capitales, sans accents, à sa longueur. */
const flapText = (text: string, n: number) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().slice(0, n).padEnd(n, ' ')

/**
 * Le tableau à palettes (face à +z, 1,3 × 0,8, dans un cadre de laiton) : « TABLEAU D'HONNEUR »,
 * le nom du classement, puis ses cinq premiers, rang, portrait, nom et score. À chaque classement,
 * les palettes tournent une à une jusqu'à leur lettre.
 */
const honourBoard: Builder = () => {
  const g = new THREE.Group()
  const BW = 1.3, BH = 0.8, BY = 0.6
  const brass = lit('#b48a3c', 'metal')
  g.add(box(BW + 0.08, BH + 0.08, 0.06, brass, 0, BY, -0.01, 0.012))
  g.add(box(BW + 0.02, BH + 0.02, 0.02, lit('#0d0d10', 'metal'), 0, BY, 0.02))
  // Un fronton de laiton, et sa lampe de tableau.
  g.add(box(0.5, 0.04, 0.05, brass, 0, BY + BH / 2 + 0.07, 0.01, 0.01))
  g.add(box(0.36, 0.02, 0.08, glow('#ffe2a8'), 0, BY + BH / 2 + 0.1, 0.05))
  const PW = 1300, PH = 800
  const COLS = 18
  let shown = -1
  let switchedAt = -100
  let previous: string[] = []
  const screen = animatedScreen(PW, PH, 20, (c, t) => {
    const boards = feed?.boards() ?? []
    const index = boards.length ? Math.floor(t / HOLD) % boards.length : -1
    const board = index >= 0 ? boards[index] : null
    if (index !== shown) {
      shown = index
      switchedAt = t
    }
    // Le fond : un noir profond, un filet de laiton, le titre gravé.
    c.fillStyle = '#0b0b0e'
    c.fillRect(0, 0, PW, PH)
    c.strokeStyle = BRASS
    c.lineWidth = 3
    c.strokeRect(18, 18, PW - 36, PH - 36)
    c.fillStyle = BRASS
    c.font = `700 52px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'alphabetic'
    c.fillText(tr('TABLEAU D’HONNEUR', 'HALL OF HONOUR'), PW / 2, 92)
    c.fillRect(PW / 2 - 260, 112, 520, 2)
    // Les rangées de palettes : le nom du classement, puis ses cinq premiers.
    const lines = board
      ? [flapText(board.label, COLS), ...[0, 1, 2, 3, 4].map((i) => (board.rows[i] ? flapText(board.rows[i].name, 14) : ''.padEnd(14)))]
      : [flapText(tr('Le site ne répond pas', 'The site is not answering'), COLS), ...[0, 1, 2, 3, 4].map(() => ''.padEnd(14))]
    if (shown !== -2 && lines.join() !== previous.join() && t - switchedAt > 4) {
      // Les données ont changé sous le même classement : les palettes tournent à nouveau.
      switchedAt = t
    }
    const settle = (row: number, col: number) => switchedAt + 0.35 + col * 0.045 + row * 0.12
    const cell = (x: number, y: number, w: number, h: number, ch: string, settled: boolean, size: number, color = '#f3f0e6') => {
      c.fillStyle = '#1b1b20'
      c.fillRect(x, y, w, h)
      c.fillStyle = '#26262c'
      c.fillRect(x, y, w, h / 2)
      c.fillStyle = color
      c.font = `700 ${size}px ${FLAP}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(ch, x + w / 2, y + h / 2 + 2)
      // La fente au milieu de la palette ; une palette qui tourne a son ombre.
      c.fillStyle = settled ? '#050506' : 'rgba(0, 0, 0, 0.55)'
      c.fillRect(x, y + h / 2 - 1, w, 2)
    }
    const row = (text: string, r: number, x: number, y: number, w: number, h: number, size: number, color?: string) => {
      for (let i = 0; i < text.length; i++) {
        const done = t >= settle(r, i)
        const ch = done ? text[i] : FLAPS[Math.floor((t * 24 + i * 7 + r * 3) % FLAPS.length)]
        cell(x + i * (w + 4), y, w, h, ch, done, size, color)
      }
    }
    row(lines[0], 0, 120, 150, 54, 70, 44, BRASS)
    for (let i = 0; i < 5; i++) {
      const y = 250 + i * 104
      const entry = board?.rows[i]
      // Le rang, dans un médaillon de laiton.
      c.fillStyle = i < 3 ? BRASS : '#5a5040'
      c.beginPath()
      c.arc(92, y + 38, 34, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#0b0b0e'
      c.font = `700 36px ${SERIF}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(String(entry?.rank ?? i + 1), 92, y + 40)
      // Le portrait des trois premiers, quand il est arrivé.
      const img = entry?.avatar && i < 3 ? feed?.avatar(entry.avatar) : null
      c.save()
      c.beginPath()
      c.arc(176, y + 38, 34, 0, Math.PI * 2)
      c.clip()
      c.fillStyle = '#202027'
      c.fillRect(140, y, 72, 76)
      if (img) c.drawImage(img, 142, y + 4, 68, 68)
      c.restore()
      c.strokeStyle = i < 3 ? BRASS : '#5a5040'
      c.lineWidth = 3
      c.beginPath()
      c.arc(176, y + 38, 35, 0, Math.PI * 2)
      c.stroke()
      row(lines[i + 1], i + 1, 232, y + 4, 46, 68, 40)
      // Le score, gravé à droite.
      if (entry && t >= settle(i + 1, 14)) {
        c.fillStyle = '#f3f0e6'
        c.font = `700 40px ${FLAP}`
        c.textAlign = 'right'
        c.fillText(entry.score.toLocaleString(), PW - 56, y + 30)
        c.fillStyle = BRASS
        c.font = `600 22px ${FLAP}`
        c.fillText(board?.unit ?? '', PW - 56, y + 60)
      }
    }
    previous = lines
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(BW, BH), keepShared(new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false })), 0, BY, 0.032))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

/** Stèle de marbre noir veiné, coiffée de laiton, une couronne de laurier et un mot gravés (face à +z). `label` : le mot. */
const honourStele: Builder = ({ label = '' }) => {
  const g = new THREE.Group()
  const brass = lit('#b48a3c', 'metal')
  const map = keepShared(drawnTexture(160, 600, (c) => {
    c.fillStyle = '#0e0e11'
    c.fillRect(0, 0, 160, 600)
    // Les veines du marbre.
    c.strokeStyle = 'rgba(200, 200, 215, 0.12)'
    c.lineWidth = 2
    for (let i = 0; i < 9; i++) {
      c.beginPath()
      c.moveTo(-10, 40 + i * 70)
      c.bezierCurveTo(40, 10 + i * 70, 110, 90 + i * 66, 170, 50 + i * 72)
      c.stroke()
    }
    // La couronne de laurier, en laiton.
    c.strokeStyle = BRASS
    c.fillStyle = BRASS
    c.lineWidth = 4
    c.beginPath()
    c.arc(80, 120, 44, Math.PI * 0.65, Math.PI * 2.35)
    c.stroke()
    for (let k = 0; k < 9; k++) {
      for (const side of [-1, 1]) {
        const a = Math.PI / 2 + side * (0.5 + k * 0.28)
        c.beginPath()
        c.ellipse(80 + Math.cos(a) * 44, 120 + Math.sin(a) * 44, 9, 4, a + side * 0.9, 0, Math.PI * 2)
        c.fill()
      }
    }
    // Le mot, lettre à lettre, de haut en bas.
    c.font = `700 40px ${SERIF}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const word = label.toUpperCase()
    for (let i = 0; i < word.length; i++) c.fillText(word[i], 80, 210 + i * (330 / Math.max(1, word.length)))
  }))
  g.add(box(0.36, 0.06, 0.18, brass, 0, 0.03, 0, 0.01))
  g.add(box(0.3, 1.04, 0.12, lit('#0e0e11', 'metal'), 0, 0.58, -0.01, 0.01))
  g.add(part(new THREE.PlaneGeometry(0.28, 1.02), keepShared(new THREE.MeshLambertMaterial({ map })), 0, 0.58, 0.051))
  g.add(box(0.34, 0.05, 0.16, brass, 0, 1.12, -0.01, 0.01))
  return { solid: g }
}

// ---------------------------------------------------------------- le comptoir d'accueil

/**
 * Comptoir d'accueil du hall (face à +z, 1,4 × 0,7) : un bureau en demi-lune, blanc, ceint d'un
 * bandeau orange, son écran, et au-dessus, l'enseigne holographique « ACCUEIL » et un anneau de
 * lumière qui tourne.
 */
const welcomeDesk: Builder = () => {
  const g = new THREE.Group()
  const shell = new THREE.CylinderGeometry(0.66, 0.7, 0.44, 28, 1, false, Math.PI / 2, Math.PI)
  g.add(part(shell, lit('#e9edf3'), 0, 0.22, -0.3))
  g.add(part(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 28, 1, false, Math.PI / 2, Math.PI), lit('#cfd6e0', 'metal'), 0, 0.46, -0.3))
  g.add(part(new THREE.CylinderGeometry(0.705, 0.705, 0.03, 28, 1, true, Math.PI / 2, Math.PI), glow('#ff8a1c'), 0, 0.3, -0.3))
  g.add(box(0.36, 0.2, 0.02, lit('#12151c', 'metal'), 0, 0.6, -0.42))
  g.add(box(0.32, 0.16, 0.005, glow('#59d8ff'), 0, 0.6, -0.407))
  // L'enseigne : une plaque de verre où flotte « ACCUEIL ».
  const map = keepShared(drawnTexture(512, 128, (c) => {
    c.clearRect(0, 0, 512, 128)
    c.fillStyle = 'rgba(255, 138, 28, 0.16)'
    c.fillRect(0, 0, 512, 128)
    c.strokeStyle = '#ffb066'
    c.lineWidth = 4
    c.strokeRect(4, 4, 504, 120)
    c.fillStyle = '#ffd2a1'
    c.font = '700 64px "DIN Alternate", "Bahnschrift", "Roboto Condensed", system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('ACCUEIL', 'WELCOME'), 256, 68)
  }))
  g.add(box(0.03, 0.5, 0.03, lit('#2a2e36', 'metal'), 0.5, 0.71, -0.55))
  const sign = part(new THREE.PlaneGeometry(0.72, 0.18), keepShared(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })), 0.2, 1.02, -0.55)
  const live = new THREE.Group()
  live.add(sign)
  const ring = part(new THREE.TorusGeometry(0.12, 0.01, 6, 36), glow('#59d8ff'), -0.36, 0.74, -0.28)
  ring.rotation.x = Math.PI / 2
  live.add(ring)
  return { solid: g, live, update: (t) => { ring.rotation.z = t * 1.2; ring.position.y = 0.74 + Math.sin(t * 1.6) * 0.02 } }
}

export const COMMUNITY = {
  'live-ticker': liveTicker,
  'honour-board': honourBoard,
  'honour-stele': honourStele,
  'welcome-desk': welcomeDesk,
} satisfies Record<string, Builder>
