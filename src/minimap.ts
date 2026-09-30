import { DIRS, type ShipMap } from './map'

/*
 * Mini-carte de la vue subjective, en haut à droite sous la barre d'outils : un disque centré sur
 * le joueur, tourné selon son regard (devant soi = vers le haut). Le plan du pont (pièces, murs,
 * portes) est dessiné une fois dans une image hors écran, redessinée quand le pont, la pièce
 * courante ou le plan changent ; chaque image, on la pose, tournée, et on ajoute les repères.
 */

/** Pixels (CSS) par tuile sur la carte. */
const TILE = 11
/** Marge autour du plan dans l'image hors écran (en tuiles). */
const PAD = 1
const COLORS = {
  floor: '#262c3f',
  here: '#3a4666',
  wall: '#aab4e8',
  door: '#59d8ff',
  locked: '#ff5a4a',
  lift: '#59d8ff',
  player: '#ffb03a',
  other: '#59d8ff',
}

export interface MinimapMarker {
  x: number
  z: number
}

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D
  private readonly plan = document.createElement('canvas')
  private planKey = ''
  /** Prochain redessin forcé du plan (portes verrouillées, pièces d'extension). */
  private refresh = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  /**
   * @param yaw azimut du regard (cf. FirstPersonCamera.yaw) : on regarde vers (-sin yaw, -cos yaw)
   * @param lift tuile de l'ascenseur, s'il y en a un sur ce pont
   */
  draw(map: ShipMap, deckId: number, x: number, z: number, yaw: number, lift: MinimapMarker | null, others: MinimapMarker[], now: number) {
    const size = this.canvas.clientWidth
    if (!size) return
    const dpr = Math.min(devicePixelRatio, 2)
    const px = Math.round(size * dpr)
    if (this.canvas.width !== px) this.canvas.width = this.canvas.height = px

    const room = map.room(Math.round(x), Math.round(z)) ?? ''
    const key = `${deckId}|${room}|${map.width}x${map.height}|${dpr}`
    if (key !== this.planKey || now > this.refresh) {
      this.planKey = key
      this.refresh = now + 1
      this.drawPlan(map, room, dpr)
    }

    const g = this.ctx
    const r = px / 2
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, px, px)
    g.save()
    g.beginPath()
    g.arc(r, r, r - dpr, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = 'rgba(8, 10, 22, 0.55)'
    g.fillRect(0, 0, px, px)

    // Le plan, tourné autour du joueur : son regard pointe vers le haut.
    g.translate(r, r)
    g.rotate(yaw)
    const s = TILE * dpr
    g.drawImage(this.plan, -(x + PAD + 0.5) * s, -(z + PAD + 0.5) * s)
    const dot = (m: MinimapMarker, color: string, radius: number) => {
      g.fillStyle = color
      g.beginPath()
      g.arc((m.x - x) * s, (m.z - z) * s, radius * dpr, 0, Math.PI * 2)
      g.fill()
    }
    if (lift) {
      g.strokeStyle = COLORS.lift
      g.lineWidth = 1.5 * dpr
      g.beginPath()
      g.arc((lift.x - x) * s, (lift.z - z) * s, 3.5 * dpr, 0, Math.PI * 2)
      g.stroke()
    }
    for (const o of others) dot(o, COLORS.other, 3)
    g.restore()

    // Le joueur, au centre : son champ de vision, et une flèche vers l'avant.
    g.setTransform(1, 0, 0, 1, r, r)
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.7)
    cone.addColorStop(0, 'rgba(255, 176, 58, 0.35)')
    cone.addColorStop(1, 'rgba(255, 176, 58, 0)')
    g.fillStyle = cone
    g.beginPath()
    g.moveTo(0, 0)
    g.arc(0, 0, r * 0.7, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62)
    g.closePath()
    g.fill()
    g.fillStyle = COLORS.player
    g.strokeStyle = 'rgba(0, 0, 0, 0.6)'
    g.lineWidth = dpr
    g.beginPath()
    g.moveTo(0, -6 * dpr)
    g.lineTo(4.5 * dpr, 5 * dpr)
    g.lineTo(0, 2.5 * dpr)
    g.lineTo(-4.5 * dpr, 5 * dpr)
    g.closePath()
    g.fill()
    g.stroke()
  }

  /** Pièces, murs et portes du pont, la pièce courante éclaircie. */
  private drawPlan(map: ShipMap, here: string, dpr: number) {
    const s = TILE * dpr
    this.plan.width = Math.ceil((map.width + PAD * 2) * s)
    this.plan.height = Math.ceil((map.height + PAD * 2) * s)
    const g = this.plan.getContext('2d')!
    g.clearRect(0, 0, this.plan.width, this.plan.height)
    // Coin haut-gauche de la tuile (x, z), qui s'étend de x - 0,5 à x + 0,5.
    const at = (v: number) => (v + PAD) * s
    for (let z = 0; z < map.height; z++) {
      for (let x = 0; x < map.width; x++) {
        const room = map.room(x, z)
        if (!room) continue
        g.fillStyle = room === here ? COLORS.here : COLORS.floor
        g.fillRect(at(x), at(z), s + 0.5, s + 0.5)
      }
    }
    g.lineCap = 'round'
    for (let z = 0; z < map.height; z++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.room(x, z)) continue
        for (let dir = 0; dir < 4; dir++) {
          const kind = map.edge(x, z, dir)
          if (kind === 'open') continue
          const d = DIRS[dir]
          // Chaque arête une seule fois : depuis la tuile de gauche ou du haut, ou si l'autre côté est vide.
          if ((d.dx < 0 || d.dz < 0) && map.room(x + d.dx, z + d.dz)) continue
          const cx = at(x) + s / 2 + (d.dx * s) / 2
          const cz = at(z) + s / 2 + (d.dz * s) / 2
          const half = s / 2
          const [x0, z0, x1, z1] = d.dz !== 0 ? [cx - half, cz, cx + half, cz] : [cx, cz - half, cx, cz + half]
          g.beginPath()
          if (kind === 'wall') {
            g.strokeStyle = COLORS.wall
            g.lineWidth = 1.6 * dpr
            g.moveTo(x0, z0)
            g.lineTo(x1, z1)
          } else {
            // Porte : les montants, et l'ouverture en couleur (rouge si elle est verrouillée).
            g.strokeStyle = COLORS.wall
            g.lineWidth = 1.6 * dpr
            const q = 0.25
            g.moveTo(x0, z0)
            g.lineTo(x0 + (x1 - x0) * q, z0 + (z1 - z0) * q)
            g.moveTo(x1, z1)
            g.lineTo(x1 - (x1 - x0) * q, z1 - (z1 - z0) * q)
            g.stroke()
            g.beginPath()
            g.strokeStyle = map.isLocked(x, z, dir) ? COLORS.locked : COLORS.door
            g.lineWidth = 1.2 * dpr
            g.moveTo(x0 + (x1 - x0) * q, z0 + (z1 - z0) * q)
            g.lineTo(x1 - (x1 - x0) * q, z1 - (z1 - z0) * q)
          }
          g.stroke()
        }
      }
    }
  }
}
