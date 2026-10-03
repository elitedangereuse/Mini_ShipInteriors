import * as THREE from 'three'
import { drawnTexture } from './furniture/kit'

/*
 * Couvercle d'une pièce réservée (le labo du L.J.P.C., le sanctuaire de la Voie, le Zorb, Chez
 * Jacques), tant qu'on n'y a pas accès : une plaque de blindage fine, posée au ras du haut des
 * murs. Des tôles jointives et rivetées, un liseré lumineux à la couleur de la pièce, qui
 * respire, et un cadenas en son centre. Sans couleur (`glow`), la plaque reste nue et se fond
 * dans le noir : le sanctuaire de la Voie ne se signale pas.
 */

/** Épaisseur de la plaque, et hauteur de son dessous (le haut des murs). */
const THICKNESS = 0.03
const WALL_TOP = 1.06
/** Retrait du liseré par rapport au bord, et sa largeur. */
const INSET = 0.24
const STRIP = 0.035
/** Pixels par tuile de la texture des tôles. */
const PX = 64

/** Tôles de blindage : un joint par tuile, des rivets aux croisements, un métal brossé, sombre. */
function platingTexture(w: number, d: number, tint: THREE.Color): THREE.CanvasTexture {
  const scale = Math.min(1, 1024 / (Math.max(w, d) * PX))
  const px = PX * scale
  return drawnTexture(Math.ceil(w * px), Math.ceil(d * px), (g) => {
    const W = g.canvas.width, H = g.canvas.height
    const shade = (k: number) => `#${tint.clone().multiplyScalar(k).getHexString()}`
    g.fillStyle = shade(1)
    g.fillRect(0, 0, W, H)
    // Métal brossé : de fines stries, plus claires ou plus sombres.
    for (let i = 0; i < W * 1.5; i++) {
      g.fillStyle = shade(0.75 + ((i * 7919) % 100) / 180)
      g.globalAlpha = 0.22
      g.fillRect(0, ((i * 104729) % (H * 10)) / 10, W, 1)
    }
    g.globalAlpha = 1
    // Un joint tous les deux mètres, décalé d'une rangée sur l'autre, et ses rivets.
    const m = px * 0.15
    g.strokeStyle = shade(0.45)
    g.lineWidth = Math.max(1, px * 0.035)
    g.fillStyle = shade(1.7)
    for (let row = 0, z = m; z < H; z += px * 2, row++) {
      g.beginPath()
      g.moveTo(0, z)
      g.lineTo(W, z)
      g.stroke()
      for (let x = m + (row % 2) * px; x < W; x += px * 2) {
        g.beginPath()
        g.moveTo(x, z)
        g.lineTo(x, Math.min(H, z + px * 2))
        g.stroke()
        for (const [rx, rz] of [[0.12, 0.12], [-0.12, 0.12]]) {
          g.beginPath()
          g.arc(x + rx * px, z + rz * px, Math.max(1, px * 0.028), 0, Math.PI * 2)
          g.fill()
        }
      }
    }
    // Le bord, plus clair : un chanfrein.
    g.strokeStyle = shade(1.9)
    g.lineWidth = Math.max(1, px * 0.05)
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth)
  })
}

/** Cadenas dans un hexagone, tracé à la couleur de la pièce. */
function lockTexture(color: string): THREE.CanvasTexture {
  return drawnTexture(256, 256, (g) => {
    g.strokeStyle = g.fillStyle = color
    g.lineJoin = 'round'
    g.lineWidth = 7
    g.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      g[k ? 'lineTo' : 'moveTo'](128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112)
    }
    g.closePath()
    g.stroke()
    // L'anse, puis le corps et son trou de serrure.
    g.lineWidth = 12
    g.beginPath()
    g.arc(128, 108, 30, Math.PI, 0)
    g.lineTo(158, 126)
    g.moveTo(98, 108)
    g.lineTo(98, 126)
    g.stroke()
    g.beginPath()
    g.roundRect(80, 122, 96, 70, 10)
    g.fill()
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.arc(128, 150, 10, 0, Math.PI * 2)
    g.fill()
    g.fillRect(123, 152, 10, 24)
  })
}

/**
 * @param w largeur (x) et `d` profondeur (z) de la plaque, murs compris
 * @param tint couleur des tôles
 * @param glow couleur du liseré et du cadenas ; sans elle, une plaque nue
 * @returns la plaque, centrée sur l'origine, et de quoi faire respirer son liseré
 */
export function roomCover(w: number, d: number, tint: string, glow?: string): { cover: THREE.Group; update?: (t: number) => void } {
  const cover = new THREE.Group()
  const base = new THREE.Color(tint)
  const side = new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.6) })
  const top = new THREE.MeshLambertMaterial({ map: platingTexture(w, d, base) })
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, THICKNESS, d), [side, side, top, side, side, side])
  plate.position.y = WALL_TOP + THICKNESS / 2
  plate.receiveShadow = true
  cover.add(plate)
  if (!glow) return { cover }

  const y = WALL_TOP + THICKNESS + 0.004
  const light = new THREE.MeshBasicMaterial({ color: glow })
  const iw = w - INSET * 2, id = d - INSET * 2
  for (const s of [-1, 1]) {
    const along = new THREE.Mesh(new THREE.BoxGeometry(iw + STRIP, 0.008, STRIP), light)
    along.position.set(0, y, (s * id) / 2)
    const across = new THREE.Mesh(new THREE.BoxGeometry(STRIP, 0.008, id + STRIP), light)
    across.position.set((s * iw) / 2, y, 0)
    cover.add(along, across)
  }
  const size = Math.min(1.5, Math.min(iw, id) * 0.5)
  const lockMaterial = new THREE.MeshBasicMaterial({ map: lockTexture(glow), transparent: true, depthWrite: false })
  const lock = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lockMaterial)
  lock.rotation.x = -Math.PI / 2
  lock.position.y = y
  cover.add(lock)
  const lit = new THREE.Color(glow)
  return {
    cover,
    update: (t) => {
      // Le liseré respire, lentement ; le cadenas reste en retrait.
      const k = 0.62 + 0.38 * Math.sin(t * 1.4)
      light.color.copy(lit).multiplyScalar(0.55 + 0.45 * k)
      lockMaterial.opacity = 0.5 + 0.2 * k
    },
  }
}
