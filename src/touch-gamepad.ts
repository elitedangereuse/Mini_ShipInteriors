import type { GamepadInput } from '../shared/gamepad.js'

type Button = 'interact' | 'action' | 'cancel' | 'flare'

/** Course : part du débattement du stick au-delà de laquelle le personnage court. */
const RUN_REACH = 0.85

/** Débattement du stick de visée en deçà duquel on ne vise pas encore (un simple toucher). */
const AIM_SLACK = 0.3
/** Durée (ms) au-delà de laquelle un appui sans glisser n'est plus un toucher. */
const TAP_TIME = 350

/** Un stick analogique à l'écran : il capture son doigt, les autres pointeurs restent au décor. */
class TouchStick {
  x = 0
  y = 0
  /**
   * Doigt relevé depuis la dernière lecture : `tap`, un toucher bref sans glisser ; `aimed`, le
   * stick était poussé ; `back`, ramené au centre avant de lâcher (on renonce).
   */
  released: 'tap' | 'aimed' | 'back' | null = null
  private pointer: number | null = null
  private knob: HTMLElement
  private since = 0
  private farthest = 0

  constructor(private el: HTMLElement) {
    this.knob = el.querySelector<HTMLElement>('.touch-stick-knob')!
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return
      const rect = el.getBoundingClientRect()
      const radius = rect.width * 0.32
      const dx = e.clientX - (rect.left + rect.width / 2)
      const dy = e.clientY - (rect.top + rect.height / 2)
      const scale = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)))
      this.x = dx * scale / radius
      this.y = dy * scale / radius
      this.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`
      this.farthest = Math.max(this.farthest, this.reach)
      el.classList.toggle('aiming', this.reach >= AIM_SLACK)
      e.preventDefault()
    }
    el.addEventListener('pointerdown', (e) => {
      if (this.pointer !== null) return
      this.pointer = e.pointerId
      // L'heure du toucher lui-même : celle du traitement arrive en retard sur un appareil lent.
      this.since = e.timeStamp
      this.farthest = 0
      el.setPointerCapture(e.pointerId)
      move(e)
    })
    el.addEventListener('pointermove', move)
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return
      if (e.type === 'pointerup') {
        if (this.reach >= AIM_SLACK) this.released = 'aimed'
        else this.released = this.farthest < AIM_SLACK && e.timeStamp - this.since < TAP_TIME ? 'tap' : 'back'
      }
      this.reset()
    }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('lostpointercapture', release)
  }

  get held(): boolean {
    return this.pointer !== null
  }

  /** Débattement, de 0 (au centre) à 1 (au bord). */
  get reach(): number {
    return Math.hypot(this.x, this.y)
  }

  reset() {
    this.pointer = null
    this.x = this.y = 0
    this.knob.style.transform = ''
    this.el.classList.remove('aiming')
  }
}

/**
 * Manette tactile du mode paysage : stick de marche, boutons indépendants des pointeurs du décor,
 * et, au stand de tir, un second stick qui vise et tire (on glisse pour viser, on lâche pour tirer ;
 * un simple toucher tire au plus près).
 */
export class TouchGamepad {
  private stick = new TouchStick(document.getElementById('touch-stick')!)
  /** Stick de tir, à droite : affiché au stand de tir seulement (cf. mobile.css). */
  private aim = new TouchStick(document.getElementById('touch-aim')!)
  private pending = new Set<Button>()
  private direction = 0
  private flareButton = document.getElementById('touch-flare')!
  private flareShown = ''
  private contextShown = ''
  /** Un doigt par bouton : un second contact ne doit pas relâcher le premier. */
  private buttonPointers = new Map<string, number>()

  constructor() {
    for (const name of ['interact', 'action', 'cancel', 'flare'] as const) {
      const button = document.getElementById(`touch-${name}`)!
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (this.buttonPointers.has(name)) return
        this.buttonPointers.set(name, e.pointerId)
        try { button.setPointerCapture(e.pointerId) } catch { /* Le bouton reste utilisable sans capture. */ }
        this.pending.add(name)
        button.classList.add('pressed')
        button.setAttribute('aria-pressed', 'true')
      })
      const up = (e: PointerEvent) => {
        if (this.buttonPointers.get(name) !== e.pointerId) return
        e.preventDefault()
        e.stopPropagation()
        this.buttonPointers.delete(name)
        button.classList.remove('pressed')
        button.setAttribute('aria-pressed', 'false')
      }
      button.addEventListener('pointerup', up)
      button.addEventListener('pointercancel', up)
      button.addEventListener('lostpointercapture', up)
    }
    addEventListener('blur', () => this.reset())
    addEventListener('resize', () => this.reset())
    addEventListener('orientationchange', () => this.reset())
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset() })
  }

  private reset() {
    this.stick.reset()
    this.aim.reset()
    this.aim.released = null
    this.pending.clear()
    this.buttonPointers.clear()
    this.direction = 0
    for (const b of document.querySelectorAll('#touch-pad .pressed')) {
      b.classList.remove('pressed')
      b.setAttribute('aria-pressed', 'false')
    }
  }

  /**
   * Bouton des fusées de la zone thargoïde : `null` le cache (hors de la baie) ; sinon il montre
   * les fusées en poche, grisé quand il n'y en a plus ou qu'une autre brûle encore.
   */
  showFlares(flares: { count: number; ready: boolean } | null) {
    const shown = flares ? `${flares.count}:${flares.ready}` : ''
    if (shown === this.flareShown) return
    this.flareShown = shown
    this.flareButton.hidden = !flares
    if (!flares) return
    this.flareButton.querySelector('.touch-flare-count')!.textContent = String(flares.count)
    this.flareButton.classList.toggle('empty', flares.count === 0)
    this.flareButton.classList.toggle('ready', flares.ready && flares.count > 0)
  }

  /** Bouton pressé depuis ailleurs que la manette : l'invite au-dessus d'un objet, qu'on touche. */
  press(button: Button) {
    this.pending.add(button)
  }

  /**
   * Les boutons suivent ce qu'ils feraient : interagir (se relever, `stand`), estompé quand il n'y
   * a rien à portée, et caché arme en main loin du mur (`fire` : c'est le stick qui tire) ; l'action
   * (celle du siège, ou recharger, `reload`) et « fermer » n'apparaissent que lorsqu'ils servent.
   */
  show(context: { stand: boolean; fire?: boolean; ready: boolean; action: boolean; reload?: boolean; cancel: boolean }) {
    const shown = `${context.stand}:${context.fire}:${context.ready}:${context.action}:${context.reload}:${context.cancel}`
    if (shown === this.contextShown) return
    this.contextShown = shown
    const interact = document.getElementById('touch-interact')!
    interact.classList.toggle('standing', context.stand)
    interact.classList.toggle('firing', !!context.fire)
    interact.classList.toggle('idle', !context.ready)
    const action = document.getElementById('touch-action')!
    action.hidden = !context.action
    action.classList.toggle('reloading', !!context.reload)
    document.getElementById('touch-cancel')!.hidden = !context.cancel
  }

  poll(enabled: boolean): GamepadInput & { flare: boolean; run: boolean; aiming: boolean; aimReleased: TouchStick['released'] } {
    if (!enabled && (this.stick.held || this.aim.held || this.pending.size || this.buttonPointers.size)) this.reset()
    const pressed = this.pending
    this.pending = new Set()
    const { x, y } = this.stick
    const direction = y < -0.55 ? -1 : y > 0.55 ? 1 : 0
    const up = direction === -1 && this.direction !== -1
    const down = direction === 1 && this.direction !== 1
    this.direction = direction
    const aimReleased = this.aim.released
    this.aim.released = null
    const active = !!(x || y || this.aim.x || this.aim.y || pressed.size)
    return {
      connected: true, active: enabled && active,
      moveX: enabled ? x : 0, moveY: enabled ? y : 0,
      lookX: enabled ? this.aim.x : 0, lookY: enabled ? this.aim.y : 0, zoom: 0,
      sprint: false,
      interact: enabled && pressed.has('interact'), action: enabled && pressed.has('action'), cancel: enabled && pressed.has('cancel'),
      next: false, turn: false, rotateLeft: false, rotateRight: false, help: false,
      up: enabled && up, down: enabled && down,
      flare: enabled && pressed.has('flare'),
      // Stick poussé à fond : on court (il n'y a plus de bouton à tenir du pouce de la caméra).
      run: enabled && Math.hypot(x, y) > RUN_REACH,
      aiming: enabled && this.aim.reach >= AIM_SLACK, aimReleased: enabled ? aimReleased : null,
    }
  }
}
