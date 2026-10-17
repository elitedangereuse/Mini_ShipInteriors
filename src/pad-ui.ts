import type { GamepadInput } from '../shared/gamepad.js'
import { EN, tr } from './i18n'

/*
 * La manette dans l'interface : tout ce qui se clique à la souris ou se tape au clavier.
 *
 * - `PadUi`, le « mode interface » : un cadre de sélection qui saute d'un bouton à l'autre, parmi
 *   ceux qu'on voit à l'écran (croix ou stick gauche), A les presse, B fait Échap, le stick droit
 *   fait défiler. Il ne connaît aucun panneau : il lit la page, et ne retient que ce qu'un clic
 *   atteindrait. Un panneau nouveau se pilote donc à la manette sans une ligne de plus.
 * - `PadKeyboard`, son clavier à l'écran : A sur un champ de texte l'ouvre (chat, messages…).
 * - `PadKeys` : la manette joue des touches du clavier, pour ce qui ne se joue qu'au clavier.
 * - `PadCursor` : un curseur à l'écran, pour ce qui se vise à la souris sur le décor.
 */

type Field = HTMLInputElement | HTMLTextAreaElement

/** Ce qui se presse, hors ce qu'on ne reconnaît qu'à son curseur en main (cf. `pointerRoots`). */
const PRESSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="menuitem"], [role="tab"], [role="option"], [role="link"], [data-pad]'
/** Jamais à la manette : ses propres commandes tactiles, et ce que la page a mis hors d'atteinte. */
const SKIPPED = '#touch-pad, [inert], [aria-hidden="true"]'
const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

/** Délai avant répétition d'une direction tenue, puis cadence (secondes). */
const REPEAT_DELAY = 0.34
const REPEAT_RATE = 0.095

const isField = (el: Element | null): el is Field =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type))

function scroller(el: Element | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p && p !== document.body; p = p.parentElement) {
    if (p.scrollHeight <= p.clientHeight + 1 && p.scrollWidth <= p.clientWidth + 1) continue
    const style = getComputedStyle(p)
    if (/(auto|scroll)/.test(style.overflowY + style.overflowX)) return p
  }
  return null
}

function hitAt(x: number, y: number): Element | null {
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
  return document.elementFromPoint(x, y)
}

/** L'élément se voit et se clique ; ou il attend plus loin dans une liste qui défile et qui, elle, se voit. */
function reachable(el: Element, lists: Map<Element, boolean>): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || el.closest(SKIPPED)) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const x = r.left + r.width / 2, y = r.top + r.height / 2
  const hit = hitAt(x, y)
  if (hit && (el.contains(hit) || (hit instanceof HTMLLabelElement && hit.control === el))) return true
  const list = scroller(el)
  if (!list) return false
  const box = list.getBoundingClientRect()
  if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return false
  let seen = lists.get(list)
  if (seen === undefined) {
    const at = hitAt(box.left + box.width / 2, box.top + box.height / 2)
    seen = !!at && list.contains(at)
    lists.set(list, seen)
  }
  return seen
}

/**
 * Ce qui se clique sans le dire : ni bouton ni lien, mais le curseur s'y change en main. On ne
 * garde que l'élément le plus haut de chaque zone, et aucun qui contienne déjà un vrai bouton.
 */
function pointerRoots(root: ParentNode): Element[] {
  const out: Element[] = []
  for (const el of root.querySelectorAll<HTMLElement>('div, span, li, img, label, td, tr, article, section, figure, p, h1, h2, h3')) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue
    if (getComputedStyle(el).cursor !== 'pointer') continue
    const parent = el.parentElement
    if (parent && getComputedStyle(parent).cursor === 'pointer') continue
    if (el.closest(PRESSABLE) || el.querySelector(PRESSABLE)) continue
    out.push(el)
  }
  return out
}

function keyEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  const key = code === 'Space' ? ' ' : /^Key[A-Z]$/.test(code) ? code[3].toLowerCase() : /^Digit\d$/.test(code) ? code[5] : code
  return new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true, composed: true })
}

/** La manette joue des touches du clavier : celles qu'on tient (`hold`), celles qu'on frappe (`tap`). */
export class PadKeys {
  private down = new Set<string>()

  private send(type: 'keydown' | 'keyup', code: string) {
    ;(document.activeElement ?? document.body).dispatchEvent(keyEvent(type, code))
  }

  /** Les touches tenues à cette image : celles qui s'ajoutent s'enfoncent, les autres se relâchent. */
  hold(codes: readonly string[]) {
    for (const code of this.down) {
      if (codes.includes(code)) continue
      this.down.delete(code)
      this.send('keyup', code)
    }
    for (const code of codes) {
      if (this.down.has(code)) continue
      this.down.add(code)
      this.send('keydown', code)
    }
  }

  tap(code: string) {
    this.send('keydown', code)
    this.send('keyup', code)
  }

  get holding(): boolean {
    return this.down.size > 0
  }
}

/** Un curseur à l'écran, mené au stick : il vaut une souris pour qui lit `clientX` et `clientY`. */
export class PadCursor {
  private el = document.createElement('div')
  x = 0
  y = 0

  constructor() {
    this.el.className = 'pad-cursor'
    this.el.hidden = true
    document.body.append(this.el)
  }

  get shown(): boolean {
    return !this.el.hidden
  }

  /** @param speed pixels par seconde, stick à fond */
  move(x: number, y: number, dt: number, speed = 620) {
    if (this.el.hidden) {
      this.el.hidden = false
      this.x = innerWidth / 2
      this.y = innerHeight / 2
    }
    this.x = Math.max(0, Math.min(innerWidth - 1, this.x + x * speed * dt))
    this.y = Math.max(0, Math.min(innerHeight - 1, this.y + y * speed * dt))
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`
  }

  hide() {
    if (!this.el.hidden) this.el.hidden = true
  }

  /** Le curseur, vu comme un événement de souris (bouton gauche). */
  get event(): PointerEvent {
    return { clientX: this.x, clientY: this.y, button: 0, shiftKey: false, pointerType: 'mouse', pointerId: -1 } as PointerEvent
  }
}

const ROWS_FR = ['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn\',.?']
const ROWS_EN = ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.?']
const ROWS_SYMBOLS = ['/!:;()-_@#', 'éèêàâçùûîô', '&+=*%"€$<>', '~[]{}|\\^°§']

/**
 * Clavier à l'écran, pour écrire à la manette : A tape la touche encadrée, X efface, Y fait un
 * espace, LB passe en majuscules, RB aux symboles, Start envoie, B referme. Il écrit dans le champ
 * qui a le focus, comme un vrai clavier : le champ reçoit ses événements `input`, et Entrée.
 */
export class PadKeyboard {
  readonly root = document.createElement('div')
  private preview = document.createElement('div')
  private grid = document.createElement('div')
  private field: Field | null = null
  private layer: 'lower' | 'upper' | 'symbols' = 'lower'
  private mode: string | null = null
  /** Le champ a été validé (Entrée) et a rendu le focus : ce qu'on y faisait est fini. */
  onDone?: () => void

  constructor() {
    this.root.className = 'pad-keyboard'
    this.root.hidden = true
    this.root.setAttribute('role', 'group')
    this.root.setAttribute('aria-label', tr('Clavier de la manette', 'Gamepad keyboard'))
    this.preview.className = 'pad-keyboard-text'
    this.grid.className = 'pad-keyboard-keys'
    this.root.append(this.preview, this.grid)
    // Un clic sur une touche ne reprend pas le focus au champ.
    this.root.addEventListener('pointerdown', (e) => e.preventDefault())
    this.root.addEventListener('mousedown', (e) => e.preventDefault())
    this.root.addEventListener('click', (e) => {
      const key = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-key]') : null
      if (key) this.press(key.dataset.key!)
    })
    document.body.append(this.root)
    this.render()
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(field: Field) {
    if (this.field === field && this.isOpen) return
    this.close()
    this.field = field
    // Pas de clavier du téléphone par-dessus celui-ci.
    this.mode = field.getAttribute('inputmode')
    field.setAttribute('inputmode', 'none')
    if (document.activeElement !== field) field.focus({ preventScroll: true })
    field.addEventListener('blur', this.onBlur)
    field.addEventListener('input', this.sync)
    this.layer = 'lower'
    this.root.hidden = false
    this.render()
    this.sync()
  }

  /** @param blur le champ rend aussi le focus (faux : il l'a déjà perdu) */
  close(blur = true) {
    const field = this.field
    if (!field) return
    this.field = null
    this.root.hidden = true
    field.removeEventListener('blur', this.onBlur)
    field.removeEventListener('input', this.sync)
    if (this.mode === null) field.removeAttribute('inputmode')
    else field.setAttribute('inputmode', this.mode)
    if (blur && document.activeElement === field) field.blur()
  }

  private onBlur = () => this.close(false)

  private sync = () => {
    const field = this.field
    if (!field) return
    const text = field.type === 'password' ? '•'.repeat(field.value.length) : field.value
    // La fin du texte, là où l'on écrit, reste en vue.
    this.preview.textContent = (text.length > 46 ? `…${text.slice(-45)}` : text) || field.placeholder || ''
    this.preview.classList.toggle('empty', !text)
  }

  private render() {
    const rows = this.layer === 'symbols' ? ROWS_SYMBOLS : EN ? ROWS_EN : ROWS_FR
    const key = (id: string, label: string, pad = '', className = '') => {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.key = id
      b.textContent = label
      if (className) b.className = className
      if (pad) {
        const k = document.createElement('kbd')
        k.textContent = pad
        b.append(k)
      }
      return b
    }
    this.grid.replaceChildren(
      ...rows.map((row) => {
        const line = document.createElement('div')
        line.append(...[...row].map((c) => key(c, this.layer === 'upper' ? c.toUpperCase() : c)))
        return line
      }),
    )
    const last = document.createElement('div')
    last.className = 'pad-keyboard-bar'
    last.append(
      key('shift', '⇧', 'LB', this.layer === 'upper' ? 'on' : ''),
      key('symbols', this.layer === 'symbols' ? 'abc' : '#+=', 'RB', this.layer === 'symbols' ? 'on' : ''),
      key('/', '/'),
      key('space', tr('espace', 'space'), 'Y', 'wide'),
      key('back', '⌫', 'X'),
      key('enter', tr('Entrée', 'Enter'), 'Start', 'go'),
      key('close', '✕', 'B'),
    )
    this.grid.append(last)
  }

  /** Une touche du clavier, par son nom : un caractère, ou `shift`, `symbols`, `space`, `back`, `enter`, `close`. */
  press(id: string) {
    if (!this.field) return
    if (id === 'shift') this.layer = this.layer === 'upper' ? 'lower' : 'upper'
    else if (id === 'symbols') this.layer = this.layer === 'symbols' ? 'lower' : 'symbols'
    else if (id === 'close') return this.close()
    else if (id === 'enter') return this.enter()
    else if (id === 'back') return this.erase()
    else {
      this.type(id === 'space' ? ' ' : this.layer === 'upper' ? id.toUpperCase() : id)
      // Une majuscule, puis on revient aux minuscules.
      if (this.layer !== 'upper') return
      this.layer = 'lower'
    }
    this.render()
  }

  private changed(inputType: string, data: string | null) {
    this.field?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }))
    this.sync()
  }

  private type(text: string) {
    const field = this.field!
    if (field.maxLength >= 0 && field.value.length >= field.maxLength) return
    try {
      field.setRangeText(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, 'end')
    } catch {
      // Champ numérique, adresse… : pas de sélection à lire, on écrit au bout.
      field.value += text
    }
    this.changed('insertText', text)
  }

  private erase() {
    const field = this.field!
    try {
      const end = field.selectionEnd ?? field.value.length
      const start = field.selectionStart ?? end
      if (start === end && !start) return
      field.setRangeText('', start === end ? start - 1 : start, end, 'end')
    } catch {
      field.value = field.value.slice(0, -1)
    }
    this.changed('deleteContentBackward', null)
  }

  private enter() {
    const field = this.field!
    const kept = field.dispatchEvent(keyEvent('keydown', 'Enter'))
    field.dispatchEvent(keyEvent('keyup', 'Enter'))
    if (kept && field instanceof HTMLTextAreaElement) this.type('\n')
    else if (kept && field.form) field.form.requestSubmit()
    if (this.field === field && document.activeElement === field) return this.sync()
    this.close()
    this.onDone?.()
  }
}

interface Box {
  el: Element
  left: number
  top: number
  right: number
  bottom: number
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { el, left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

export interface PadUiHost {
  /** B, quand Échap n'a rien refermé : ce que le jeu peut encore replier. Rend false s'il n'y a rien. */
  back?: () => boolean
  /** Le cadre a bougé, un bouton a été pressé. */
  sound?: (kind: 'move' | 'press') => void
}

/**
 * Le mode interface. Il s'allume à la demande (`toggle`, sur Select) ou tant qu'un panneau du jeu
 * tient l'écran (`update` avec `modal`). Rien n'y passe par le focus du navigateur : un champ de
 * texte ne le prend que lorsqu'on l'ouvre.
 */
export class PadUi {
  readonly keyboard = new PadKeyboard()
  private ring = document.createElement('div')
  private hint = document.createElement('div')
  private label = document.createElement('div')
  private target: Element | null = null
  /** Dernière place du cadre : là d'où l'on repart quand son bouton a disparu. */
  private last: Box | null = null
  private manual = false
  /** Mode demandé pour un seul geste (les emotes) : il s'éteint au premier bouton pressé. */
  private once = false
  /** Là où poser le cadre à l'ouverture : un bouton, ou ce qui en contient. */
  private from: Element | null = null
  private shown = false
  private modal = false
  private direction = ''
  private repeat = 0
  private erasing = 0
  private check = 0

  constructor(private host: PadUiHost = {}) {
    this.ring.className = 'pad-ring'
    this.ring.hidden = true
    this.hint.className = 'pad-hint'
    this.hint.hidden = true
    const keys = document.createElement('span')
    keys.className = 'pad-hint-keys'
    const entry = (key: string, text: string) => {
      const k = document.createElement('kbd')
      k.textContent = key
      keys.append(k, text)
    }
    entry('✚', tr('choisir', 'select'))
    entry('A', tr('valider', 'confirm'))
    entry('B', tr('retour', 'back'))
    entry('R', tr('défiler', 'scroll'))
    this.label.className = 'pad-label'
    this.label.hidden = true
    this.hint.append(keys)
    document.body.append(this.ring, this.label, this.hint)
    this.keyboard.onDone = () => (this.manual = false)
  }

  /** Le joueur a demandé le mode interface (Select). */
  get wanted(): boolean {
    return this.manual
  }

  /**
   * La manette se manifeste alors qu'un champ de texte a le focus (ouvert à la souris, ou retrouvé
   * au retour dans la fenêtre) : son clavier s'y ouvre. Rend false si ce n'est pas un champ de texte.
   */
  write(el: Element | null): boolean {
    if (!isField(el)) return false
    this.keyboard.open(el)
    return true
  }

  /**
   * Select : le mode interface s'allume, ou s'éteint.
   * @param start où poser le cadre : un bouton, ou ce qui en contient (le premier qu'on y voit)
   * @param once le mode s'éteint dès qu'un bouton a été pressé
   */
  toggle(on = !this.manual, start: Element | null = null, once = false) {
    this.manual = on
    this.once = on && once
    this.from = on ? start : null
    if (on && start) this.target = null
    if (!on) this.keyboard.close()
  }

  /**
   * Une image du mode interface.
   * @param held boutons tenus (cf. GamepadControls.held)
   * @param o.driving la manette est ce dont le joueur se sert (pas la souris, ni le clavier)
   * @param o.modal un panneau du jeu tient l'écran : le mode reste allumé sans qu'on l'ait demandé
   * @param o.escape B fait Échap (faux : il ne fait que quitter le mode)
   * @returns vrai s'il a pris la manette
   */
  update(pad: GamepadInput, held: ReadonlySet<string>, dt: number, o: { driving: boolean; modal: boolean; escape: boolean }): boolean {
    const on = pad.connected && o.driving && (this.manual || o.modal || this.keyboard.isOpen)
    if (!on) {
      this.hide()
      return false
    }
    // Select referme ce qu'il a ouvert ; devant un panneau, il n'y a rien à quitter.
    if (pad.menu && this.shown && !this.keyboard.isOpen) {
      this.manual = false
      if (!o.modal) {
        this.hide()
        return true
      }
    }
    // Le mode vient de s'allumer : le bouton qui l'a ouvert ne presse pas déjà quelque chose.
    const fresh = !this.shown
    this.shown = true
    // Un panneau vient de s'ouvrir : le cadre repart de lui, et non d'où il était resté.
    if (o.modal && !this.modal) this.target = this.last = null
    this.modal = o.modal
    const typing = this.keyboard.isOpen
    const scope = typing ? this.keyboard.root : document.body

    // Le bouton encadré a pu disparaître (panneau refermé, liste redessinée) : on repart du plus proche.
    this.check -= dt
    if (this.target && (!this.target.isConnected || !scope.contains(this.target))) this.target = null
    if (this.target && this.check <= 0 && !reachable(this.target, new Map())) this.target = null
    if (this.check <= 0) this.check = 0.25
    if (!this.target) {
      const list = this.candidates(scope)
      const first = this.from && !typing ? list.find((b) => this.from!.contains(b.el)) : null
      this.from = null
      this.target = first?.el ?? this.nearest(list)
    }

    const direction = held.has('up') ? 'up' : held.has('down') ? 'down' : held.has('left') ? 'left' : held.has('right') ? 'right' : ''
    if (direction !== this.direction) {
      this.direction = direction
      this.repeat = REPEAT_DELAY
      if (direction) this.step(direction, scope)
    } else if (direction && (this.repeat -= dt) <= 0) {
      this.repeat = REPEAT_RATE
      this.step(direction, scope)
    }

    if (fresh) {
      // Rien d'autre à cette image.
    } else if (typing) this.type(pad, held, dt)
    else {
      if (pad.interact) this.press()
      else if (pad.cancel) this.back(o.escape)
      // LB et RB règlent une glissière, ou changent le choix d'une liste déroulante.
      const sign = Number(pad.rotateRight) - Number(pad.rotateLeft)
      if (sign && this.target instanceof HTMLInputElement && this.target.type === 'range') this.slide(this.target, sign)
      else if (sign && this.target instanceof HTMLSelectElement) this.choose(this.target, sign)
      if (pad.lookX || pad.lookY) this.scroll(pad.lookX * 900 * dt, pad.lookY * 900 * dt)
    }
    this.draw()
    return true
  }

  private type(pad: GamepadInput, held: ReadonlySet<string>, dt: number) {
    const keyboard = this.keyboard
    if (pad.interact && this.target instanceof HTMLElement) {
      const id = this.target.dataset.key
      if (id) keyboard.press(id)
      this.host.sound?.('press')
      // Le clavier redessine ses touches : le cadre reste sur celle qu'on vient de frapper.
      if (id && keyboard.isOpen) this.target = keyboard.root.querySelector(`[data-key="${CSS.escape(id)}"]`)
    }
    if (pad.cancel) keyboard.press('close')
    if (pad.next) keyboard.press('space')
    if (pad.rotateLeft) keyboard.press('shift')
    if (pad.rotateRight) keyboard.press('symbols')
    if (pad.help) keyboard.press('enter')
    // X tenu efface en continu.
    if (pad.action) {
      keyboard.press('back')
      this.erasing = REPEAT_DELAY
    } else if (held.has('2') && (this.erasing -= dt) <= 0) {
      keyboard.press('back')
      this.erasing = REPEAT_RATE
    }
    if (!keyboard.isOpen) this.target = null
  }

  private hide() {
    if (!this.shown) return
    this.shown = this.modal = false
    this.manual = this.once = false
    this.direction = ''
    this.ring.hidden = this.hint.hidden = this.label.hidden = true
    // Qui a repris le clavier ou la souris garde son champ de texte.
    this.keyboard.close(false)
  }

  private candidates(scope: ParentNode): Box[] {
    const lists = new Map<Element, boolean>()
    const found = [...scope.querySelectorAll(PRESSABLE), ...(scope === document.body ? pointerRoots(scope) : [])]
    const list = found.filter((el) => reachable(el, lists))
    if (scope !== document.body) return list.map(boxOf)
    // Une fenêtre de dialogue à l'écran : le cadre y reste, plutôt que de filer vers le HUD derrière elle.
    for (const dialog of [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].reverse()) {
      if (!dialog.getClientRects().length) continue
      const inside = list.filter((el) => dialog.contains(el))
      if (inside.length) return inside.map(boxOf)
    }
    return list.map(boxOf)
  }

  /** Le bouton le plus proche de la dernière place du cadre ; à défaut, du milieu de l'écran. */
  private nearest(list: Box[]): Element | null {
    const from = this.last ?? { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2 }
    const x = (from.left + from.right) / 2, y = (from.top + from.bottom) / 2
    let best: Element | null = null, score = Infinity
    for (const b of list) {
      // Ceux qu'on voit d'abord : un bouton encore caché plus bas dans sa liste n'est pas un point de départ.
      const out = b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth ? 1e6 : 0
      const d = Math.hypot((b.left + b.right) / 2 - x, (b.top + b.bottom) / 2 - y) + out
      if (d < score) {
        score = d
        best = b.el
      }
    }
    return best
  }

  private step(direction: string, scope: ParentNode) {
    const target = this.target
    const list = this.candidates(scope)
    const from = target ? boxOf(target) : null
    if (!from) {
      this.target = this.nearest(list)
      return
    }
    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0, dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
    const cx = (from.left + from.right) / 2, cy = (from.top + from.bottom) / 2
    let best: Element | null = null, score = Infinity
    for (const b of list) {
      if (b.el === target) continue
      const bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2
      // Avancée dans la direction, d'un centre à l'autre ; écart sur l'autre axe, d'un bord à l'autre.
      const along = (bx - cx) * dx + (by - cy) * dy
      if (along < 2) continue
      const gap = Math.max(0, dx > 0 ? b.left - from.right : dx < 0 ? from.left - b.right : dy > 0 ? b.top - from.bottom : from.top - b.bottom)
      const side = dx ? Math.max(0, b.top - from.bottom, from.top - b.bottom) : Math.max(0, b.left - from.right, from.left - b.right)
      // Trop de côté : ce bouton n'est pas « dans cette direction ».
      if (side > along * 2) continue
      const off = dx ? Math.abs(by - cy) : Math.abs(bx - cx)
      const s = gap + side * 2.5 + off * 0.15 + along * 0.01
      if (s < score) {
        score = s
        best = b.el
      }
    }
    if (!best) {
      // Rien plus loin : une liste qui défile encore avance quand même.
      this.scroll(dx * 90, dy * 90)
      return
    }
    this.target = best
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    this.host.sound?.('move')
  }

  private slide(input: HTMLInputElement, sign: number) {
    const min = Number(input.min || 0), max = Number(input.max || 100)
    const step = Math.max(Number(input.step) || 1, (max - min) / 20)
    input.value = String(Math.max(min, Math.min(max, Number(input.value) + sign * step)))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private choose(select: HTMLSelectElement, sign: number) {
    const n = select.options.length
    if (!n) return
    select.selectedIndex = (select.selectedIndex + sign + n) % n
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private scroll(x: number, y: number) {
    const from = this.target ?? hitAt(innerWidth / 2, innerHeight / 2)
    const list = from instanceof HTMLElement && (from.scrollHeight > from.clientHeight + 1) && /(auto|scroll)/.test(getComputedStyle(from).overflowY) ? from : scroller(from)
    list?.scrollBy(x, y)
  }

  /** A : le bouton encadré reçoit ce qu'un clic lui aurait envoyé. */
  private press() {
    const el = this.target
    if (!el) return
    this.host.sound?.('press')
    if (isField(el)) return this.keyboard.open(el)
    if (el instanceof HTMLSelectElement) return this.choose(el, 1)
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const hit = hitAt(x, y)
    const to = hit && el.contains(hit) ? hit : el
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0 }
    const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }
    const focused = document.activeElement
    // Si le bouton donne le focus à un champ de texte, le clavier du téléphone ne doit pas sortir.
    const fields = [...document.querySelectorAll('input, textarea')].filter(isField).map((f) => [f, f.getAttribute('inputmode')] as const)
    for (const [f] of fields) f.setAttribute('inputmode', 'none')
    to.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }))
    to.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }))
    to.dispatchEvent(new PointerEvent('pointerup', pointer))
    to.dispatchEvent(new MouseEvent('mouseup', init))
    if (to instanceof HTMLElement) to.click()
    else to.dispatchEvent(new MouseEvent('click', init))
    for (const [f, mode] of fields) {
      if (mode === null) f.removeAttribute('inputmode')
      else f.setAttribute('inputmode', mode)
    }
    // Le bouton a ouvert un champ de texte (le chat d'un téléphone…) : le clavier le suit.
    const now = document.activeElement
    if (now !== focused && isField(now)) this.keyboard.open(now)
    // Un geste demandé, un seul : sauf si ce bouton n'a fait qu'ouvrir autre chose (palette, champ).
    else if (this.once && !el.hasAttribute('aria-expanded')) this.manual = false
  }

  /** B : Échap, là où l'on est ; si rien ne s'est refermé, le jeu replie ce qu'il peut, sinon on quitte le mode. */
  private back(escape: boolean) {
    if (escape) {
      const before = this.signature()
      const to = this.target ?? document.activeElement ?? document.body
      to.dispatchEvent(keyEvent('keydown', 'Escape'))
      to.dispatchEvent(keyEvent('keyup', 'Escape'))
      if (this.signature() !== before) return
    }
    if (this.host.back?.()) return
    this.manual = false
  }

  private signature(): string {
    return `${this.candidates(document.body).length}:${this.target?.isConnected}`
  }

  private draw() {
    const el = this.target
    this.hint.hidden = this.keyboard.isOpen
    if (!el) {
      this.ring.hidden = this.label.hidden = true
      return
    }
    // Bouton tout juste retiré de la page (un panneau redessiné) : le cadre attend l'image suivante.
    if (!el.isConnected) return
    const box = boxOf(el)
    this.last = box
    this.ring.hidden = false
    this.ring.style.transform = `translate(${box.left - 3}px, ${box.top - 3}px)`
    this.ring.style.width = `${box.right - box.left + 6}px`
    this.ring.style.height = `${box.bottom - box.top + 6}px`
    // Un bouton réduit à une icône dit son nom, dans une étiquette au-dessus du cadre (dessous, en haut de l'écran).
    const adjust = el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'range')
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '') + (adjust ? ' · LB / RB' : '')
    if (this.label.textContent !== name) this.label.textContent = name
    this.label.hidden = !name || this.keyboard.isOpen
    if (this.label.hidden) return
    const x = Math.max(8, Math.min(innerWidth - this.label.offsetWidth - 8, (box.left + box.right - this.label.offsetWidth) / 2))
    const y = box.top > 40 ? box.top - this.label.offsetHeight - 8 : box.bottom + 8
    this.label.style.transform = `translate(${x}px, ${y}px)`
  }
}
