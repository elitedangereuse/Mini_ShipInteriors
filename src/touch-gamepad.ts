import type { GamepadInput } from '../shared/gamepad.js'

type Button = 'interact' | 'action' | 'cancel' | 'flare'

/** Course : part du débattement du stick au-delà de laquelle le personnage court. */
const RUN_REACH = 0.85

/** Manette tactile du mode paysage : stick analogique et boutons indépendants des pointeurs du décor. */
export class TouchGamepad {
  private x = 0
  private y = 0
  private stickId: number | null = null
  private pending = new Set<Button>()
  private direction = 0
  private flareButton = document.getElementById('touch-flare')!
  private flareShown = ''
  private contextShown = ''
  /** Un doigt par bouton : un second contact ne doit pas relâcher le premier. */
  private buttonPointers = new Map<string, number>()

  constructor() {
    const stick = document.getElementById('touch-stick')!
    const knob = stick.querySelector<HTMLElement>('.touch-stick-knob')!
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return
      const rect = stick.getBoundingClientRect()
      const radius = rect.width * 0.32
      const dx = e.clientX - (rect.left + rect.width / 2)
      const dy = e.clientY - (rect.top + rect.height / 2)
      const scale = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)))
      this.x = dx * scale / radius
      this.y = dy * scale / radius
      knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`
      e.preventDefault()
    }
    stick.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return
      this.stickId = e.pointerId
      stick.setPointerCapture(e.pointerId)
      move(e)
    })
    stick.addEventListener('pointermove', move)
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return
      this.stickId = null
      this.x = this.y = 0
      this.direction = 0
      knob.style.transform = ''
    }
    stick.addEventListener('pointerup', release)
    stick.addEventListener('pointercancel', release)
    stick.addEventListener('lostpointercapture', release)

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
    this.x = this.y = 0
    this.stickId = null
    this.pending.clear()
    this.buttonPointers.clear()
    this.direction = 0
    document.querySelector<HTMLElement>('.touch-stick-knob')!.style.transform = ''
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
   * Les boutons suivent ce qu'ils feraient : interagir (ou se relever, `stand`), estompé quand il
   * n'y a rien à portée ; l'action du siège et « fermer » n'apparaissent que lorsqu'ils servent.
   */
  show(context: { stand: boolean; ready: boolean; action: boolean; cancel: boolean }) {
    const shown = `${context.stand}:${context.ready}:${context.action}:${context.cancel}`
    if (shown === this.contextShown) return
    this.contextShown = shown
    const interact = document.getElementById('touch-interact')!
    interact.classList.toggle('standing', context.stand)
    interact.classList.toggle('idle', !context.ready)
    document.getElementById('touch-action')!.hidden = !context.action
    document.getElementById('touch-cancel')!.hidden = !context.cancel
  }

  poll(enabled: boolean): GamepadInput & { flare: boolean; run: boolean } {
    if (!enabled && (this.stickId !== null || this.pending.size || this.buttonPointers.size)) this.reset()
    const pressed = this.pending
    this.pending = new Set()
    const direction = this.y < -0.55 ? -1 : this.y > 0.55 ? 1 : 0
    const up = direction === -1 && this.direction !== -1
    const down = direction === 1 && this.direction !== 1
    this.direction = direction
    const active = !!(this.x || this.y || pressed.size)
    return {
      connected: true, active: enabled && active,
      moveX: enabled ? this.x : 0, moveY: enabled ? this.y : 0,
      lookX: 0, lookY: 0, zoom: 0,
      sprint: false,
      interact: enabled && pressed.has('interact'), action: enabled && pressed.has('action'), cancel: enabled && pressed.has('cancel'),
      next: false, turn: false, rotateLeft: false, rotateRight: false, help: false,
      up: enabled && up, down: enabled && down,
      flare: enabled && pressed.has('flare'),
      // Stick poussé à fond : on court (il n'y a plus de bouton à tenir du pouce de la caméra).
      run: enabled && Math.hypot(this.x, this.y) > RUN_REACH,
    }
  }
}
