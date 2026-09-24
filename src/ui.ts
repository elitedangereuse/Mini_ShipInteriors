import * as THREE from 'three'
import { icon, type IconName } from './icons'
import { raceOf, RACES, variantsOf, type Look } from './looks'

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Nom d'un joueur, précédé du badge « vérifié » pour les CMDR authentifiés par le site. */
export function nameTag(name: string, verified?: boolean): DocumentFragment {
  const f = document.createDocumentFragment()
  if (verified) {
    const badge = icon('seal-check', 'verified-badge')
    badge.setAttribute('aria-label', 'CMDR vérifié')
    badge.removeAttribute('aria-hidden')
    f.append(badge)
  }
  f.append(name)
  return f
}

// --------------------------------------------------------------- bulles

interface Anchor {
  el: HTMLDivElement
  tag?: HTMLDivElement
  say?: HTMLDivElement
  sayTimer?: number
  getHead: (out: THREE.Vector3) => THREE.Vector3 | null
}

/** Étiquettes HTML accrochées au-dessus des personnages : nom, bulle de chat, emote. */
export class Bubbles {
  private anchors = new Map<string, Anchor>()
  private root = $('bubbles')
  private v = new THREE.Vector3()

  /** @param getHead position monde au-dessus de la tête, ou null si invisible */
  attach(key: string, getHead: Anchor['getHead'], name?: string, verified?: boolean) {
    this.detach(key)
    const el = document.createElement('div')
    el.className = 'anchor'
    this.root.appendChild(el)
    const a: Anchor = { el, getHead }
    if (name) {
      a.tag = document.createElement('div')
      a.tag.className = 'tag'
      a.tag.append(nameTag(name, verified))
      el.appendChild(a.tag)
    }
    this.anchors.set(key, a)
  }

  rename(key: string, name: string, verified?: boolean) {
    const a = this.anchors.get(key)
    a?.tag?.replaceChildren(nameTag(name, verified))
  }

  detach(key: string) {
    const a = this.anchors.get(key)
    if (!a) return
    clearTimeout(a.sayTimer)
    a.el.remove()
    this.anchors.delete(key)
  }

  /** @param trailing icône ajoutée après le texte (ex. le cœur du ronronnement) */
  say(key: string, text: string, trailing?: IconName) {
    const a = this.anchors.get(key)
    if (!a) return
    a.say?.remove()
    clearTimeout(a.sayTimer)
    const s = document.createElement('div')
    s.className = 'say'
    s.textContent = text
    if (trailing) s.append(' ', icon(trailing, 'say-icon'))
    a.el.insertBefore(s, a.el.firstChild)
    a.say = s
    a.sayTimer = window.setTimeout(() => s.remove(), 4000 + text.length * 60)
  }

  /** Icône d'emote qui s'envole au-dessus de la tête. */
  emote(key: string, name: IconName | '') {
    const a = this.anchors.get(key)
    if (!a || !name) return
    const e = document.createElement('div')
    e.className = 'emote-pop'
    e.append(icon(name))
    a.el.insertBefore(e, a.el.firstChild)
    e.addEventListener('animationend', () => e.remove())
  }

  update(camera: THREE.Camera) {
    for (const a of this.anchors.values()) {
      const head = a.getHead(this.v)
      const empty = !a.tag && !a.el.firstChild
      if (!head || empty) {
        a.el.style.display = 'none'
        continue
      }
      head.project(camera)
      const x = ((head.x + 1) / 2) * innerWidth
      const y = ((1 - head.y) / 2) * innerHeight
      a.el.style.display = ''
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    }
  }
}

// --------------------------------------------------------------- chat

export class Chat {
  private panel = $('chat')
  private log = $('chat-log')
  private input = $<HTMLInputElement>('chat-input')
  onSend?: (text: string) => void
  onOpen?: () => void

  constructor() {
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault()
      const text = this.input.value.trim()
      this.input.value = ''
      if (text) this.onSend?.(text)
      this.close()
    })
    this.input.addEventListener('focus', () => {
      this.panel.classList.add('active')
      this.onOpen?.()
    })
    this.input.addEventListener('blur', () => this.panel.classList.remove('active'))
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation() // pas de déplacement pendant la frappe
      if (e.key === 'Escape') this.close()
    })
    this.input.addEventListener('keyup', (e) => e.stopPropagation())
  }

  get typing(): boolean {
    return document.activeElement === this.input
  }

  open() {
    this.input.focus()
  }

  close() {
    this.input.blur()
  }

  /** @param text texte, ou morceaux de texte et de nœuds (noms avec badge…) */
  add(kind: 'me' | 'other' | 'system', text: string | (string | Node)[], who?: string | Node) {
    const row = document.createElement('div')
    row.className = `msg ${kind}`
    if (who) {
      const w = document.createElement('span')
      w.className = 'who'
      w.append(who)
      row.appendChild(w)
    }
    row.append(...(typeof text === 'string' ? [text] : text))
    this.log.appendChild(row)
    while (this.log.children.length > 60) this.log.firstChild!.remove()
    this.log.scrollTop = this.log.scrollHeight
    setTimeout(() => row.classList.add('stale'), 15000)
  }
}

// --------------------------------------------------------------- divers

export class Dialog {
  private el = $('dialog')
  private timer = 0
  private typing = 0

  show(text: string) {
    this.el.hidden = false
    this.el.textContent = ''
    clearInterval(this.typing)
    let i = 0
    this.typing = window.setInterval(() => {
      this.el.textContent = text.slice(0, ++i)
      if (i >= text.length) clearInterval(this.typing)
    }, 18)
    this.timer = 3 + text.length * 0.04
  }

  update(dt: number) {
    if (this.timer <= 0) return
    this.timer -= dt
    if (this.timer <= 0) this.el.hidden = true
  }
}

/**
 * Panneau de l'ascenseur. Au clavier : flèches (ou Z/S, W/S) pour choisir l'étage,
 * Entrée ou Espace pour y aller ; E, Échap ou un clic en dehors pour fermer (cf. main.ts).
 */
export class LiftPanel {
  private el = $('lift')
  private buttons = $('lift-buttons')
  private choices: { button: HTMLButtonElement; id: number }[] = []
  private selected = -1
  private onPick?: (id: number) => void

  constructor() {
    $('lift-close').onclick = () => this.close()
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  /** Le clic (ou autre événement) vise-t-il le panneau ? */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.el.contains(target)
  }

  open(levels: { id: number; name: string }[], current: number, onPick: (id: number) => void) {
    this.onPick = onPick
    this.buttons.replaceChildren()
    // Du plus haut au plus bas, comme un vrai panneau d'ascenseur.
    this.choices = [...levels]
      .sort((a, b) => b.id - a.id)
      .map((l, i) => {
        const b = document.createElement('button')
        const label = document.createElement('span')
        label.textContent = l.name
        const n = document.createElement('kbd')
        n.textContent = l.id > 0 ? `+${l.id}` : String(l.id)
        b.append(label, n)
        b.disabled = l.id === current
        b.onclick = () => this.pick(l.id)
        b.onpointerenter = () => this.select(i)
        this.buttons.appendChild(b)
        return { button: b, id: l.id }
      })
    // Sélection de départ : l'étage juste au-dessus, sinon juste en dessous.
    this.selected = this.choices.findIndex((c) => c.id === current)
    this.move(this.selected > 0 ? -1 : 1)
    this.el.hidden = false
  }

  /** Change d'étage sélectionné : -1 vers le haut, +1 vers le bas (l'étage actuel est sauté). */
  move(step: number) {
    let i = this.selected + step
    while (this.choices[i]?.button.disabled) i += step
    if (this.choices[i]) this.select(i)
  }

  /** Part vers l'étage sélectionné. */
  confirm() {
    const c = this.choices[this.selected]
    if (c && !c.button.disabled) this.pick(c.id)
  }

  private select(i: number) {
    if (!this.choices[i] || this.choices[i].button.disabled) return
    this.choices[this.selected]?.button.classList.remove('selected')
    this.selected = i
    this.choices[i].button.classList.add('selected')
  }

  private pick(id: number) {
    this.close()
    this.onPick?.(id)
  }

  close() {
    this.el.hidden = true
  }
}

/** Fondu au noir (changement de pont). */
export function fadeScreen(on: boolean): Promise<void> {
  $('fade').classList.toggle('on', on)
  return new Promise((r) => setTimeout(r, 300))
}

// --------------------------------------------------------------- garde-robe

/** Panneau de la garde-robe : race, sexe, modèle, teinte ; aperçu en direct sur le personnage. */
export class WardrobePanel {
  private el = $('wardrobe')
  private look!: Look
  onChange?: (look: Look) => void
  onClose?: (confirmed: boolean, look: Look) => void

  get isOpen(): boolean {
    return !this.el.hidden
  }

  open(look: Look) {
    this.look = { ...look }
    this.el.hidden = false
    this.render()
  }

  close(confirmed: boolean) {
    if (this.el.hidden) return
    this.el.hidden = true
    this.onClose?.(confirmed, { ...this.look })
  }

  private set(patch: Partial<Look>) {
    const next = { ...this.look, ...patch }
    const race = raceOf(next)
    const variants = variantsOf(race, next.sex)
    // Nouvelle race : on repart sur son premier modèle / sa première teinte.
    if (patch.race) {
      next.variant = variants[0].id
      if (race.tints) next.tint = race.tints[0].id
    }
    // Changement de sexe : on garde le modèle s'il existe aussi pour l'autre sexe.
    if (!variants.some((v) => v.id === next.variant)) next.variant = variants[0].id
    this.look = next
    this.render()
    this.onChange?.({ ...next })
  }

  private cycle(step: number) {
    const variants = variantsOf(raceOf(this.look), this.look.sex)
    const i = variants.findIndex((v) => v.id === this.look.variant)
    const n = variants.length
    this.set({ variant: variants[(i + step + n) % n].id })
  }

  private render() {
    const race = raceOf(this.look)
    const row = (label: string, ...children: HTMLElement[]) => {
      const r = document.createElement('div')
      r.className = 'wr-row'
      const l = document.createElement('div')
      l.className = 'wr-label'
      l.textContent = label
      const c = document.createElement('div')
      c.className = 'wr-choices'
      c.append(...children)
      r.append(l, c)
      return r
    }
    const button = (text: string, active: boolean, onClick: () => void, cls = '', glyph?: IconName) => {
      const b = document.createElement('button')
      if (glyph) b.append(icon(glyph))
      if (text) b.append(text)
      b.className = `${cls}${active ? ' active' : ''}`
      b.onclick = onClick
      return b
    }

    const title = document.createElement('div')
    title.className = 'lift-title'
    title.textContent = 'Holo-Me · garde-robe'
    const rows: HTMLElement[] = [title]
    rows.push(row('Espèce', ...RACES.map((r) => button(r.label, r.id === race.id, () => this.set({ race: r.id }), '', r.icon))))
    if (race.sexed) {
      rows.push(
        row(
          'Sexe',
          button('Femme', this.look.sex === 'female', () => this.set({ sex: 'female' }), '', 'gender-female'),
          button('Homme', this.look.sex === 'male', () => this.set({ sex: 'male' }), '', 'gender-male'),
        ),
      )
    }
    const variants = variantsOf(race, this.look.sex)
    const variant = variants.find((v) => v.id === this.look.variant) ?? variants[0]
    const name = document.createElement('span')
    name.className = 'wr-variant'
    name.textContent = variant.label
    const prev = button('', false, () => this.cycle(-1), 'wr-arrow', 'caret-left')
    const next = button('', false, () => this.cycle(1), 'wr-arrow', 'caret-right')
    prev.title = 'Modèle précédent'
    next.title = 'Modèle suivant'
    rows.push(row('Modèle', prev, name, next))
    if (race.tints) {
      rows.push(
        row(
          race.tintLabel ?? 'Teinte',
          ...race.tints.map((t) => {
            const b = button(t.label, t.id === this.look.tint, () => this.set({ tint: t.id }), 'wr-tint')
            b.style.setProperty('--swatch', t.swatch)
            return b
          }),
        ),
      )
    }
    const actions = document.createElement('div')
    actions.className = 'wr-actions'
    actions.append(button('Annuler', false, () => this.close(false), 'wr-cancel'), button('Valider', false, () => this.close(true), 'wr-ok'))
    rows.push(actions)
    this.el.replaceChildren(...rows)
  }
}
