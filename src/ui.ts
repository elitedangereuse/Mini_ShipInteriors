import * as THREE from 'three'
import { formatCredits } from './economy/data'
import { EN, tr } from './i18n'
import { icon, type IconName } from './icons'
import { raceOf, RACES, variantsOf, type Look } from './looks'

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Nom d'un joueur, précédé du badge « vérifié » pour les CMDR authentifiés par le site. */
export function nameTag(name: string, verified?: boolean): DocumentFragment {
  const f = document.createDocumentFragment()
  if (verified) {
    const badge = icon('seal-check', 'verified-badge')
    badge.setAttribute('aria-label', tr('CMDR vérifié', 'Verified CMDR'))
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

  /** Texte qui s'envole au-dessus de la tête (crédits gagnés). */
  gain(key: string, text: string) {
    const a = this.anchors.get(key)
    if (!a) return
    const e = document.createElement('div')
    e.className = 'gain-pop'
    e.textContent = text
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
        if (l.id === current) {
          const here = document.createElement('small')
          here.className = 'lift-current'
          here.textContent = tr('Vous êtes ici', 'You are here')
          label.append(' ', here)
          b.setAttribute('aria-current', 'location')
        }
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

// --------------------------------------------------------------- démarrage

/** Systèmes mis sous tension l'un après l'autre pendant le chargement des modèles. */
const BOOT_STEPS = EN ? ['Power plant', 'Power distributor', 'Life support', 'Ship systems'] : ['Réacteur à fusion', "Distributeur d'énergie", 'Support vital', 'Systèmes de bord']
/** Circonférence de la jauge (rayon 57, cf. index.html). */
const BOOT_ARC = 358.14

/** Écran de démarrage : charge de 0 à 1, et l'étape en cours (par défaut, selon la charge). */
export function bootProgress(ratio: number, step = BOOT_STEPS[Math.min(BOOT_STEPS.length - 1, Math.floor(ratio * BOOT_STEPS.length))]) {
  const percent = Math.round(ratio * 100)
  const root = $('loading')
  root.style.setProperty('--p', String(ratio))
  root.setAttribute('aria-valuenow', String(percent))
  $('boot-arc').style.strokeDashoffset = String(BOOT_ARC * (1 - ratio))
  $('boot-pct').textContent = `${percent}\u202f%`
  $('boot-step').textContent = step
}

/** Vaisseau prêt : le saut, puis l'écran quitte la page (ses animations ne tournent plus). */
export function bootDone() {
  bootProgress(1, tr('Systèmes en ligne', 'Systems online'))
  const root = $('loading')
  // Laisser peindre la jauge pleine avant la pause, puis lancer le saut.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        root.classList.add('done')
        setTimeout(() => root.remove(), 1300)
      }, 400)
    })
  })
}

// --------------------------------------------------------------- garde-robe

/**
 * Boutique du Holo-Me (cf. economy/skins.ts) : ce que coûte une apparence qu'on n'a pas, et de
 * quoi l'acheter.
 */
export interface WardrobeShop {
  /** Prix d'une apparence qu'on n'a pas encore, ou null (offerte, ou déjà achetée). */
  price(look: Look): number | null
  /** Pourquoi on ne peut pas acheter en ce moment (invité, site injoignable…), ou null. */
  blocked(): string | null
  balance(): number
  /** Achète l'apparence : null si c'est fait, sinon pourquoi pas. */
  buy(look: Look): Promise<string | null>
}

/**
 * Panneau de la garde-robe : race, sexe, modèle, teinte ; aperçu en direct sur le personnage.
 * Tout s'essaie ; une apparence payante qu'on n'a pas s'achète avant d'être portée.
 */
export class WardrobePanel {
  private el = $('wardrobe')
  private look!: Look
  /** Achat en cours, et le refus du dernier achat. */
  private pending = false
  private error = ''
  rotating = true
  shop?: WardrobeShop
  onChange?: (look: Look) => void
  onClose?: (confirmed: boolean, look: Look) => void

  get isOpen(): boolean {
    return !this.el.hidden
  }

  open(look: Look) {
    this.look = { ...look }
    this.rotating = true
    this.pending = false
    this.error = ''
    this.el.hidden = false
    this.render()
  }

  close(confirmed: boolean) {
    if (this.el.hidden) return
    this.el.hidden = true
    this.onClose?.(confirmed, { ...this.look })
  }

  /** Les crédits ont changé (achat, réponse du site) : prix et boutons à jour. */
  refresh() {
    if (this.isOpen) this.render()
  }

  /** Achète l'apparence essayée, puis la porte. */
  private async buy() {
    if (!this.shop || this.pending) return
    this.pending = true
    this.error = ''
    this.render()
    const look = { ...this.look }
    const refusal = await this.shop.buy(look)
    this.pending = false
    if (!this.isOpen) return
    if (refusal) {
      this.error = refusal
      return this.render()
    }
    // Toujours la même apparence (on a pu en essayer une autre pendant l'achat) : on la porte.
    if (JSON.stringify(look) === JSON.stringify(this.look)) this.close(true)
    else this.render()
  }

  private set(patch: Partial<Look>) {
    this.error = ''
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

    const shop = this.shop
    const price = (look: Look) => shop?.price(look) ?? null
    /** Cadenas, et le prix en info-bulle, sur un choix qu'on n'a pas. */
    const lock = (b: HTMLButtonElement, cost: number | null) => {
      if (cost === null) return b
      b.classList.add('locked')
      b.append(icon('lock-simple', 'wr-lock'))
      b.title = formatCredits(cost)
      return b
    }
    // Une race est verrouillée si aucune de ses apparences n'est offerte ni achetée.
    const raceLocked = (id: Look['race']) => {
      const r = RACES.find((x) => x.id === id)!
      for (const sex of r.sexed ? (['female', 'male'] as const) : (['female'] as const)) {
        for (const v of variantsOf(r, sex)) for (const t of r.tints ?? [{ id: 'green' }]) if (price({ race: id, sex, variant: v.id, tint: t.id }) === null) return false
      }
      return true
    }

    const title = document.createElement('div')
    title.className = 'lift-title'
    title.textContent = tr('Holo-Me · garde-robe', 'Holo-Me · wardrobe')
    const rows: HTMLElement[] = [title]
    const rotation = button(
      this.rotating ? tr('Arrêter la rotation', 'Pause rotation') : tr('Reprendre la rotation', 'Resume rotation'),
      !this.rotating,
      () => { this.rotating = !this.rotating; this.render() },
      'wr-rotation',
      this.rotating ? 'pause' : 'play',
    )
    rotation.setAttribute('aria-pressed', String(!this.rotating))
    rows.push(rotation)
    rows.push(
      row(
        tr('Espèce', 'Species'),
        ...RACES.map((r) => {
          const b = button(r.label, r.id === race.id, () => this.set({ race: r.id }), '', r.icon)
          if (raceLocked(r.id)) b.append(icon('lock-simple', 'wr-lock'))
          return b
        }),
      ),
    )
    if (race.sexed) {
      rows.push(
        row(
          tr('Sexe', 'Sex'),
          button(tr('Femme', 'Female'), this.look.sex === 'female', () => this.set({ sex: 'female' }), '', 'gender-female'),
          button(tr('Homme', 'Male'), this.look.sex === 'male', () => this.set({ sex: 'male' }), '', 'gender-male'),
        ),
      )
    }
    const variants = variantsOf(race, this.look.sex)
    const variant = variants.find((v) => v.id === this.look.variant) ?? variants[0]
    const name = document.createElement('span')
    name.className = 'wr-variant'
    name.textContent = variant.label
    // Robots, créatures, Gardiens : chaque modèle s'achète.
    const variantCost = race.tints ? null : price(this.look)
    if (variantCost !== null) name.append(icon('lock-simple', 'wr-lock'))
    const prev = button('', false, () => this.cycle(-1), 'wr-arrow', 'caret-left')
    const next = button('', false, () => this.cycle(1), 'wr-arrow', 'caret-right')
    prev.title = tr('Modèle précédent', 'Previous model')
    next.title = tr('Modèle suivant', 'Next model')
    rows.push(row(tr('Modèle', 'Model'), prev, name, next))
    if (race.tints) {
      rows.push(
        row(
          race.tintLabel ?? tr('Teinte', 'Colour'),
          ...race.tints.map((t) => {
            const b = button(t.label, t.id === this.look.tint, () => this.set({ tint: t.id }), 'wr-tint')
            b.style.setProperty('--swatch', t.swatch)
            // Combinaisons, teintes d'alien : chacune s'achète, pour tous les modèles.
            return race.id === 'suit' || race.id === 'alien' ? lock(b, price({ ...this.look, tint: t.id })) : b
          }),
        ),
      )
    }
    // Apparence payante qu'on n'a pas : son prix, et l'achat à la place de « Valider ».
    const cost = price(this.look)
    const actions = document.createElement('div')
    actions.className = 'wr-actions'
    const cancel = button(tr('Annuler', 'Cancel'), false, () => this.close(false), 'wr-cancel')
    if (cost === null) actions.append(cancel, button(tr('Valider', 'Confirm'), false, () => this.close(true), 'wr-ok'))
    else {
      const blocked = shop?.blocked() ?? tr('Boutique indisponible.', 'Shop unavailable.')
      const short = !blocked && cost > shop!.balance() ? cost - shop!.balance() : 0
      const note = document.createElement('div')
      note.className = 'wr-price'
      note.append(icon('lock-simple'), document.createTextNode(tr(`À acheter : ${formatCredits(cost)}`, `To buy: ${formatCredits(cost)}`)))
      const why = this.error || blocked || (short ? tr(`Il vous manque ${formatCredits(short)} : tâches de bord et bornes d'arcade en rapportent.`, `You're ${formatCredits(short)} short: ship chores and arcade cabinets pay.`) : '')
      if (why) {
        const w = document.createElement('div')
        w.className = 'wr-why'
        w.textContent = why
        note.append(w)
      }
      rows.push(note)
      const buy = button(this.pending ? tr('Achat…', 'Buying…') : tr('Acheter et porter', 'Buy and wear'), false, () => void this.buy(), 'wr-ok wr-buy', 'shopping-cart')
      buy.disabled = this.pending || !!blocked || short > 0
      actions.append(cancel, buy)
    }
    rows.push(actions)
    this.el.replaceChildren(...rows)
  }
}
