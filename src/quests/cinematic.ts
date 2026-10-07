import * as THREE from 'three'
import { tr } from '../i18n'

/*
 * Mini-cinématique d'un dialogue de quête : deux bandes noires se ferment sur l'image, la caméra
 * se rapproche de la conversation et penche vers celui qui parle (cf. main.ts), l'interface s'efface, et les répliques s'écrivent
 * une à une dans une fenêtre, sous le nom de qui parle. E, Espace, Entrée, un clic ou un toucher
 * passent à la suite (ou écrivent la réplique d'un coup) ; Échap referme, et rien n'est acquis :
 * on pourra reprendre la scène. Une scène peut finir sur un choix (accepter une quête, ou non).
 */

export interface Line {
  /** Qui parle : un nom, 'me' pour le joueur ; rien : le récit (ce qu'on voit, ce qu'on fait). */
  who?: string
  text: string
  /** Emote de celui à qui l'on parle, quand la réplique commence (cf. EMOTES dans avatar.ts). */
  emote?: string
  /** Emote du joueur, quand la réplique commence. */
  me?: string
}

export interface Choice {
  label: string
  value: string
}

export interface SceneOptions {
  /** Ce qu'on regarde avec le joueur (celui à qui l'on parle, l'objet examiné) : la caméra cadre les deux. */
  target?: () => THREE.Vector3 | null
  /** Choix proposés après la dernière réplique ; le premier est celui d'Entrée. */
  choices?: Choice[]
  /** Une réplique commence (pour les emotes). */
  onLine?: (line: Line) => void
}

/** Lettres par seconde. */
const SPEED = 46

export class Cinematic {
  /** Une scène se joue. */
  active = false
  /** Ce que la caméra cadre : le milieu de la conversation. */
  readonly focus = new THREE.Vector3()
  /** La scène commence, finit (caméra, interface : cf. main.ts). */
  onOpen?: () => void
  onClose?: () => void
  /** Une réplique suit la précédente (un petit bruit). */
  onNext?: () => void
  private lines: Line[] = []
  private index = 0
  private typed = 0
  private options: SceneOptions = {}
  private selected = 0
  private resolve?: (value: string | null) => void
  /** Nom affiché pour les répliques du joueur. */
  playerName = ''
  private readonly el = document.createElement('div')
  private readonly box = document.createElement('div')
  private readonly name = document.createElement('strong')
  private readonly text = document.createElement('p')
  private readonly more = document.createElement('span')
  private readonly choices = document.createElement('div')

  constructor() {
    this.el.className = 'cine'
    this.box.className = 'cine-box'
    this.box.hidden = true
    this.box.setAttribute('role', 'dialog')
    this.box.setAttribute('aria-live', 'polite')
    this.name.className = 'cine-name'
    this.text.className = 'cine-text'
    this.more.className = 'cine-more'
    this.more.textContent = '▼'
    this.choices.className = 'cine-choices'
    const skip = document.createElement('button')
    skip.type = 'button'
    skip.className = 'cine-skip'
    skip.textContent = tr('Fermer', 'Close')
    skip.title = tr('Fermer (Échap) : la scène pourra être reprise', 'Close (Esc): the scene can be replayed')
    skip.onclick = (e) => {
      e.stopPropagation()
      this.cancel()
    }
    this.box.append(this.name, this.text, this.choices, this.more, skip)
    this.box.onclick = () => this.next()
    this.el.append(this.box)
    document.body.append(this.el)
  }

  private get line(): Line | undefined {
    return this.lines[this.index]
  }

  /** La dernière réplique est écrite, et un choix attend. */
  private get choosing(): boolean {
    return this.index === this.lines.length - 1 && this.typed >= (this.line?.text.length ?? 0) && !!this.options.choices?.length
  }

  /**
   * Joue une scène. Rend la valeur du choix fait à la fin, 'end' si elle n'en proposait pas, ou
   * null si elle a été refermée avant la fin.
   */
  play(lines: Line[], options: SceneOptions = {}): Promise<string | null> {
    if (this.active) this.finish(null)
    if (!lines.length) return Promise.resolve('end')
    this.lines = lines
    this.options = options
    this.index = -1
    this.selected = 0
    this.active = true
    this.el.classList.add('on')
    document.body.classList.add('cine-on')
    this.box.hidden = false
    this.onOpen?.()
    this.open(0)
    return new Promise((resolve) => (this.resolve = resolve))
  }

  private open(i: number) {
    this.index = i
    this.typed = 0
    const line = this.line!
    this.name.hidden = !line.who
    this.name.textContent = line.who === 'me' ? this.playerName : line.who ?? ''
    this.name.classList.toggle('me', line.who === 'me')
    this.text.classList.toggle('story', !line.who)
    this.options.onLine?.(line)
    this.write()
  }

  private write() {
    const line = this.line!
    const done = this.typed >= line.text.length
    this.text.textContent = line.text.slice(0, Math.floor(this.typed))
    const choosing = this.choosing
    this.more.hidden = !done || choosing
    if (!choosing) return void (this.choices.hidden = true)
    if (!this.choices.hidden && this.choices.childElementCount) return this.paint()
    this.choices.hidden = false
    this.choices.replaceChildren(...this.options.choices!.map((c, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = c.label
      b.onclick = (e) => {
        e.stopPropagation()
        this.finish(c.value)
      }
      b.onpointerenter = () => {
        this.selected = i
        this.paint()
      }
      return b
    }))
    this.paint()
  }

  private paint() {
    ;[...this.choices.children].forEach((b, i) => b.classList.toggle('selected', i === this.selected))
  }

  /** Réplique suivante (ou la réplique en cours d'un coup, si elle s'écrit encore) ; devant un choix, celui qui est sélectionné. */
  next() {
    const line = this.line
    if (!this.active || !line) return
    if (this.typed < line.text.length) {
      this.typed = line.text.length
      return this.write()
    }
    if (this.choosing) return this.finish(this.options.choices![this.selected].value)
    if (this.index < this.lines.length - 1) {
      this.onNext?.()
      return this.open(this.index + 1)
    }
    this.finish('end')
  }

  /** Change de choix (-1 : le précédent, +1 : le suivant). */
  move(step: number) {
    if (!this.choosing) return
    const n = this.options.choices!.length
    this.selected = (this.selected + step + n) % n
    this.paint()
  }

  /** Referme la scène avant la fin : rien n'est acquis. */
  cancel() {
    if (this.active) this.finish(null)
  }

  private finish(value: string | null) {
    this.active = false
    this.el.classList.remove('on')
    document.body.classList.remove('cine-on')
    this.box.hidden = true
    this.choices.hidden = true
    this.choices.replaceChildren()
    this.onClose?.()
    const resolve = this.resolve
    this.resolve = undefined
    resolve?.(value)
  }

  /** Touches de la scène ; rend true si elle l'a prise (toutes, tant qu'elle se joue). */
  key(e: KeyboardEvent): boolean {
    if (!this.active) return false
    e.preventDefault()
    if (e.repeat) return true
    if (e.code === 'Escape') this.cancel()
    else if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') this.next()
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') this.move(-1)
    else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS' || e.code === 'Tab') this.move(1)
    return true
  }

  /**
   * @param dt temps réel écoulé (s) : les répliques s'écrivent à la même vitesse sur une machine qui peine
   * @param player position du joueur : la caméra cadre le milieu entre lui et ce qu'il regarde
   */
  update(dt: number, player: THREE.Vector3) {
    if (!this.active) return
    const target = this.options.target?.() ?? null
    const line = this.line
    // Le cadre penche vers celui qui parle : le joueur, son interlocuteur, ou le milieu pour le récit.
    const lean = !target ? 0 : line?.who === 'me' ? 0.3 : line?.who ? 0.68 : 0.5
    if (target) this.focus.set(player.x + (target.x - player.x) * lean, player.y, player.z + (target.z - player.z) * lean)
    else this.focus.copy(player)
    if (!line || this.typed >= line.text.length) return
    const before = Math.floor(this.typed)
    this.typed = Math.min(line.text.length, this.typed + dt * SPEED)
    if (Math.floor(this.typed) !== before) this.write()
  }
}
