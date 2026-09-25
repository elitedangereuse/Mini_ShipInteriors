import * as THREE from 'three'
import { tr } from './i18n'
import { icon, type IconName } from './icons'

/*
 * Mode photo : l'interface s'efface, on cadre (caméra libre, zoom rapproché, poses avec les
 * emotes), et le déclencheur rend la scène seule, en haute définition (jusqu'à 4K), sur le fond
 * du jeu. Options : les noms des CMDR (dessinés dans la photo), son propre personnage caché,
 * l'instant figé, une grille des tiers pour cadrer (elle, jamais dans la photo). Les photos de la
 * séance restent à portée : aperçu, téléchargement, copie.
 */

export interface PhotoTag {
  /** Position monde au-dessus de la tête. */
  at: THREE.Vector3
  name: string
  verified: boolean
}

export interface PhotoHost {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: () => THREE.Camera
  /** Repères à cacher pendant la prise de vue (tuile survolée, destination). */
  helpers: THREE.Object3D[]
  /** Personnage du joueur (caché sur demande). */
  me: () => THREE.Object3D
  /** Noms des personnages visibles. */
  tags: () => PhotoTag[]
  /** Bruit du déclencheur. */
  shutter: () => void
  /** Commandes de la caméra reprises dans la barre du mode photo. */
  rotate: (step: 1 | -1) => void
  zoom: (factor: number) => void
  onToggle?: (on: boolean) => void
}

interface Shot {
  blob: Blob
  url: string
  name: string
}

/** Définition de la photo : la fenêtre agrandie jusqu'à ~4K de large, 12 mégapixels au plus. */
function captureScale(w: number, h: number): number {
  return Math.max(1, Math.min(3, 3840 / w, Math.sqrt(12e6 / (w * h))))
}

const two = (n: number) => String(n).padStart(2, '0')

export class PhotoMode {
  active = false
  /** L'instant est figé : personnages, meubles et étoiles ne bougent plus (la caméra, si). */
  frozen = false
  private names = false
  private hideMe = false
  private grid = false
  private readonly bar: HTMLDivElement
  private readonly gridEl: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly preview: HTMLDivElement
  private readonly buttons = new Map<string, HTMLButtonElement>()
  private shots: Shot[] = []
  private busy = false

  constructor(private readonly host: PhotoHost) {
    this.gridEl = document.createElement('div')
    this.gridEl.className = 'photo-grid'
    this.gridEl.hidden = true
    this.hint = document.createElement('div')
    this.hint.className = 'photo-hint'
    this.hint.textContent = tr(
      'Clic droit + glisser : tourner et incliner · Maj : déplacer la vue · molette : zoom · 1…7 : poses · Espace : photo · Échap : quitter',
      'Right-drag: orbit and tilt · Shift: pan · wheel: zoom · 1…7: poses · Space: take photo · Esc: leave',
    )
    this.bar = document.createElement('div')
    this.bar.className = 'photo-bar panel'
    const button = (id: string, glyph: IconName, label: string, key: string, onClick: () => void, cls = '') => {
      const b = document.createElement('button')
      b.className = cls
      b.title = `${label} (${key})`
      b.setAttribute('aria-label', label)
      b.append(icon(glyph))
      if (cls.includes('photo-shutter')) {
        const span = document.createElement('span')
        span.textContent = tr('Photo', 'Photo')
        b.append(span)
      }
      b.onclick = onClick
      this.buttons.set(id, b)
      return b
    }
    const sep = () => {
      const s = document.createElement('span')
      s.className = 'photo-sep'
      return s
    }
    this.bar.append(
      button('rot-left', 'arrow-counter-clockwise', tr('Pivoter la vue', 'Rotate the view'), 'Maj+R', () => host.rotate(-1)),
      button('rot-right', 'arrow-clockwise', tr('Pivoter la vue', 'Rotate the view'), 'R', () => host.rotate(1)),
      button('zoom-in', 'magnifying-glass-plus', tr('Rapprocher', 'Zoom in'), tr('molette', 'wheel'), () => host.zoom(0.8)),
      button('zoom-out', 'magnifying-glass-minus', tr('Éloigner', 'Zoom out'), tr('molette', 'wheel'), () => host.zoom(1.25)),
      sep(),
      button('names', 'tag', tr('Noms des CMDR', 'CMDR names'), 'N', () => this.toggleNames()),
      button('me', 'user-focus', tr('Cacher mon personnage', 'Hide my character'), 'C', () => this.toggleMe()),
      button('freeze', 'snowflake', tr('Figer l\'instant', 'Freeze time'), 'F', () => this.toggleFreeze()),
      button('grid', 'grid-four', tr('Grille des tiers', 'Rule-of-thirds grid'), 'G', () => this.toggleGrid()),
      sep(),
      button('shutter', 'camera', tr('Prendre la photo', 'Take the photo'), tr('Espace', 'Space'), () => void this.capture(), 'photo-shutter'),
      button('close', 'x', tr('Quitter le mode photo', 'Leave photo mode'), tr('Échap', 'Esc'), () => this.toggle(false)),
    )
    this.preview = document.createElement('div')
    this.preview.className = 'photo-preview panel'
    this.preview.hidden = true
    this.bar.hidden = this.hint.hidden = true
    document.body.append(this.gridEl, this.hint, this.bar, this.preview)
  }

  toggle(on = !this.active) {
    if (on === this.active) return
    this.active = on
    document.body.classList.toggle('photo', on)
    this.bar.hidden = this.hint.hidden = !on
    this.gridEl.hidden = !on || !this.grid
    if (!on) {
      this.frozen = false
      this.host.me().visible = true
      this.preview.hidden = true
      this.sync()
    }
    document.body.classList.toggle('photo-names', on && this.names)
    this.host.onToggle?.(on)
  }

  /** Touches du mode photo ; true si la touche est prise. */
  keyDown(e: KeyboardEvent): boolean {
    if (!this.active) return false
    switch (e.code) {
      case 'Escape':
      case 'KeyP':
        this.toggle(false)
        break
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        void this.capture()
        break
      case 'KeyN':
        this.toggleNames()
        break
      case 'KeyC':
        this.toggleMe()
        break
      case 'KeyF':
        this.toggleFreeze()
        break
      case 'KeyG':
        this.toggleGrid()
        break
      default:
        return false
    }
    e.preventDefault()
    return true
  }

  private toggleNames() {
    this.names = !this.names
    document.body.classList.toggle('photo-names', this.active && this.names)
    this.sync()
  }

  private toggleMe() {
    this.hideMe = !this.hideMe
    this.host.me().visible = !this.hideMe
    this.sync()
  }

  private toggleFreeze() {
    this.frozen = !this.frozen
    this.sync()
  }

  private toggleGrid() {
    this.grid = !this.grid
    this.gridEl.hidden = !this.active || !this.grid
    this.sync()
  }

  /** État des boutons à bascule. */
  private sync() {
    for (const [id, on] of [['names', this.names], ['me', this.hideMe], ['freeze', this.frozen], ['grid', this.grid]] as const) {
      const b = this.buttons.get(id)!
      b.classList.toggle('on', on)
      b.setAttribute('aria-pressed', String(on))
    }
  }

  /** Le personnage du joueur a changé (nouvelle apparence) : on le recache s'il le faut. */
  refresh() {
    if (this.active) this.host.me().visible = !this.hideMe
  }

  /**
   * Déclencheur : la scène seule, rendue en grand dans un canvas sur le fond du jeu, avec les
   * noms si on les veut ; puis l'éclair, et la photo dans l'aperçu.
   */
  async capture() {
    if (!this.active || this.busy) return
    this.busy = true
    const { renderer, scene } = this.host
    const w = innerWidth, h = innerHeight
    const scale = captureScale(w, h)
    const before = renderer.getPixelRatio()
    const shown = this.host.helpers.map((o) => o.visible)
    for (const o of this.host.helpers) o.visible = false
    const out = document.createElement('canvas')
    out.width = Math.round(w * scale)
    out.height = Math.round(h * scale)
    const g = out.getContext('2d')!
    try {
      renderer.setPixelRatio(scale)
      renderer.render(scene, this.host.camera())
      paintBackground(g, out.width, out.height)
      g.drawImage(renderer.domElement, 0, 0, out.width, out.height)
      if (this.names) this.drawTags(g, out.width, out.height, scale)
    } finally {
      renderer.setPixelRatio(before)
      this.host.helpers.forEach((o, i) => (o.visible = shown[i]))
    }
    this.host.shutter()
    flash()
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92))
    this.busy = false
    if (!blob) return
    const d = new Date()
    const name = `mini-ship-interiors-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.jpg`
    this.shots.push({ blob, url: URL.createObjectURL(blob), name })
    // On garde les douze dernières de la séance.
    while (this.shots.length > 12) URL.revokeObjectURL(this.shots.shift()!.url)
    this.show(this.shots.length - 1)
  }

  /** Noms au-dessus des têtes, dessinés comme ceux du jeu. */
  private drawTags(g: CanvasRenderingContext2D, w: number, h: number, scale: number) {
    const camera = this.host.camera()
    const v = new THREE.Vector3()
    g.font = `600 ${11 * scale}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
    g.textBaseline = 'middle'
    for (const tag of this.host.tags()) {
      v.copy(tag.at).project(camera)
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h
      const badge = tag.verified ? 14 * scale : 0
      const tw = g.measureText(tag.name).width + badge + 12 * scale, th = 17 * scale
      g.fillStyle = 'rgba(10, 12, 28, 0.6)'
      g.beginPath()
      g.roundRect(x - tw / 2, y - th, tw, th, 6 * scale)
      g.fill()
      if (tag.verified) {
        g.fillStyle = '#7dffa8'
        g.beginPath()
        g.arc(x - tw / 2 + 6 * scale + 5 * scale, y - th / 2, 5 * scale, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#0a0c1c'
        g.lineWidth = 1.6 * scale
        g.beginPath()
        g.moveTo(x - tw / 2 + 8.5 * scale, y - th / 2)
        g.lineTo(x - tw / 2 + 10.5 * scale, y - th / 2 + 2 * scale)
        g.lineTo(x - tw / 2 + 13.5 * scale, y - th / 2 - 2 * scale)
        g.stroke()
      }
      g.fillStyle = '#59d8ff'
      g.fillText(tag.name, x - tw / 2 + 6 * scale + badge, y - th / 2 + 0.5 * scale)
    }
  }

  /** Aperçu d'une photo de la séance, et la pellicule des autres. */
  private show(i: number) {
    const shot = this.shots[i]
    if (!shot) return
    const img = document.createElement('img')
    img.src = shot.url
    img.alt = tr('Dernière photo', 'Latest photo')
    const actions = document.createElement('div')
    actions.className = 'photo-actions'
    const save = document.createElement('a')
    save.className = 'photo-save'
    save.href = shot.url
    save.download = shot.name
    save.append(icon('download-simple'), tr('Télécharger', 'Download'))
    actions.append(save)
    if ('ClipboardItem' in window && navigator.clipboard?.write) {
      const copy = document.createElement('button')
      copy.append(icon('copy'), tr('Copier', 'Copy'))
      copy.onclick = async () => {
        try {
          // Le presse-papiers n'accepte que le PNG : on réencode la photo.
          const png = new Promise<Blob>((resolve, reject) => {
            void createImageBitmap(shot.blob).then((bmp) => {
              const c = document.createElement('canvas')
              c.width = bmp.width
              c.height = bmp.height
              c.getContext('2d')!.drawImage(bmp, 0, 0)
              c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png')
            }, reject)
          })
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          copy.replaceChildren(icon('check'), tr('Copiée', 'Copied'))
        } catch {
          copy.replaceChildren(icon('warning-circle'), tr('Copie refusée', 'Copy blocked'))
        }
      }
      actions.append(copy)
    }
    const close = document.createElement('button')
    close.className = 'photo-close'
    close.title = tr('Fermer l\'aperçu', 'Close the preview')
    close.setAttribute('aria-label', close.title)
    close.append(icon('x'))
    close.onclick = () => (this.preview.hidden = true)
    const strip = document.createElement('div')
    strip.className = 'photo-strip'
    this.shots.forEach((s, k) => {
      const thumb = document.createElement('button')
      thumb.className = k === i ? 'on' : ''
      thumb.title = s.name
      const t = document.createElement('img')
      t.src = s.url
      t.alt = ''
      thumb.append(t)
      thumb.onclick = () => this.show(k)
      strip.append(thumb)
    })
    const head = document.createElement('div')
    head.className = 'photo-head'
    const title = document.createElement('span')
    title.textContent = this.shots.length > 1 ? tr(`Photo ${i + 1} sur ${this.shots.length}`, `Photo ${i + 1} of ${this.shots.length}`) : tr('Photo prise', 'Photo taken')
    head.append(title, close)
    this.preview.replaceChildren(head, img, actions, ...(this.shots.length > 1 ? [strip] : []))
    this.preview.hidden = false
  }
}

/** Le fond du jeu (le dégradé de la page, cf. style.css), derrière la scène. */
function paintBackground(g: CanvasRenderingContext2D, w: number, h: number) {
  // radial-gradient(ellipse at 30% 20%, …) : ellipse qui passe par le coin le plus éloigné.
  const cx = w * 0.3, cy = h * 0.2, rx = Math.SQRT2 * w * 0.7, ry = Math.SQRT2 * h * 0.8
  g.save()
  g.fillStyle = '#05060f'
  g.fillRect(0, 0, w, h)
  g.translate(cx, cy)
  g.scale(1, ry / rx)
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx)
  grad.addColorStop(0, '#2a1f4d')
  grad.addColorStop(0.55, '#0e1024')
  grad.addColorStop(1, '#05060f')
  g.fillStyle = grad
  g.fillRect(-cx, -cy * (rx / ry), w, h * (rx / ry))
  g.restore()
}

function flash() {
  const el = document.getElementById('flash')
  if (!el) return
  el.classList.add('soft')
  el.classList.remove('on')
  void el.offsetWidth
  el.classList.add('on')
}
