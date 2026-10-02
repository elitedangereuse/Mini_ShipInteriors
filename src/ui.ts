import * as THREE from 'three'
import { formatCredits } from './economy/data'
import { EN, tr } from './i18n'
import { icon, type IconName } from './icons'
import { FACE_CHOICES, HAIR_CHOICES, HAIR_COLOR_CHOICES, PAINT_CHOICES, styleFields, TRIM_CHOICES, type StyleChoice } from './holo-style'
import { raceOf, RACES, variantsOf, type Look } from './looks'
import { NO_STYLE, type LookStyle } from '../shared/look-style.js'

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
  /** Réplique d'un compagnon, sous la bulle principale (cf. aside). */
  aside?: HTMLDivElement
  asideTimer?: number
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

  /** Élément interactif qui suit un personnage, sans masquer la scène. */
  overlay(key: string, content: HTMLElement | null) {
    const a = this.anchors.get(key)
    if (!a) return
    a.el.replaceChildren(...(content ? [content] : []))
  }

  detach(key: string) {
    const a = this.anchors.get(key)
    if (!a) return
    clearTimeout(a.sayTimer)
    clearTimeout(a.asideTimer)
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

  /**
   * Réplique d'un compagnon qui parle depuis la même place (Boulon, le drone de Nico) : une petite
   * bulle à lui, juste sous la bulle principale, qu'elle ne remplace pas. Deux bulles accrochées
   * à deux points voisins se recouvriraient.
   */
  aside(key: string, text: string, className: string) {
    const a = this.anchors.get(key)
    if (!a) return
    a.aside?.remove()
    clearTimeout(a.asideTimer)
    const s = document.createElement('div')
    s.className = `say say-aside ${className}`
    s.textContent = text
    a.el.appendChild(s)
    a.aside = s
    a.asideTimer = window.setTimeout(() => s.remove(), 3000 + text.length * 50)
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

  /** Médaillon d'une réaction (image du site) qui s'envole au-dessus de la tête. */
  reaction(key: string, src: string) {
    const a = this.anchors.get(key)
    if (!a) return
    const e = document.createElement('div')
    e.className = 'emote-pop reaction-pop'
    const img = document.createElement('img')
    img.src = src
    img.alt = ''
    e.append(img)
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

  /**
   * @param pinned étiquette posée à l'écran plutôt qu'au-dessus d'une tête (la sienne, en vue
   *   subjective : elle est dans la caméra) ; son nom est alors masqué, ses bulles restent
   */
  update(camera: THREE.Camera, pinned?: { key: string; x: number; y: number } | null) {
    for (const [key, a] of this.anchors) {
      const head = a.getHead(this.v)
      const empty = !a.tag && !a.el.firstChild
      if (!head || empty) {
        a.el.style.display = 'none'
        continue
      }
      const pin = pinned?.key === key
      a.el.classList.toggle('pinned', pin)
      let x: number, y: number
      if (pin) ({ x, y } = pinned!)
      else {
        head.project(camera)
        // Derrière la caméra (vue subjective), la projection renverrait la tête devant soi.
        if (head.z > 1) {
          a.el.style.display = 'none'
          continue
        }
        x = ((head.x + 1) / 2) * innerWidth
        y = ((1 - head.y) / 2) * innerHeight
      }
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
  add(kind: 'me' | 'other' | 'system' | 'whisper', text: string | (string | Node)[], who?: string | Node) {
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
  private cipher = 0

  /** Le message du sanctuaire change de glyphes tant que la porte refuse l'accès. */
  showCipher() {
    clearInterval(this.typing)
    this.el.hidden = false
    this.timer = 5
    this.cipher = 0
    this.scramble()
  }

  private scramble() {
    const glyphs = '⟁⟟⟊⫷⫸⋈⌁⍜⎔⎊⧖◈⊘⌬⟡⧫⟁'
    this.el.textContent = Array.from({ length: 38 }, (_, i) => i === 12 || i === 25 ? ' ' : glyphs[Math.floor(Math.random() * glyphs.length)]).join('')
  }

  show(text: string) {
    this.cipher = -1
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
    if (this.cipher >= 0) {
      this.cipher += dt
      if (this.cipher >= 0.08) { this.cipher = 0; this.scramble() }
    }
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
  private choices: { button: HTMLButtonElement; go: () => void }[] = []
  private selected = -1

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
    this.buttons.replaceChildren()
    this.choices = []
    const add = (label: HTMLElement, key: HTMLElement, here: boolean, go: () => void) => {
      const b = document.createElement('button')
      if (here) {
        const tag = document.createElement('small')
        tag.className = 'lift-current'
        tag.textContent = tr('Vous êtes ici', 'You are here')
        label.append(' ', tag)
        b.setAttribute('aria-current', 'location')
      }
      b.append(label, key)
      b.disabled = here
      const i = this.choices.length
      b.onclick = () => this.pick(go)
      b.onpointerenter = () => this.select(i)
      this.buttons.appendChild(b)
      this.choices.push({ button: b, go })
    }
    // Du plus haut au plus bas, comme un vrai panneau d'ascenseur.
    let start = 0
    for (const l of [...levels].sort((a, b) => b.id - a.id)) {
      const label = document.createElement('span')
      label.textContent = l.name
      const n = document.createElement('kbd')
      n.textContent = l.id > 0 ? `+${l.id}` : String(l.id)
      if (l.id === current) start = this.choices.length
      add(label, n, l.id === current, () => onPick(l.id))
    }
    // Sélection de départ : l'étage juste au-dessus, sinon juste en dessous.
    this.selected = start
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
    if (c && !c.button.disabled) this.pick(c.go)
  }

  private select(i: number) {
    if (!this.choices[i] || this.choices[i].button.disabled) return
    this.choices[this.selected]?.button.classList.remove('selected')
    this.selected = i
    this.choices[i].button.classList.add('selected')
  }

  private pick(go: () => void) {
    this.close()
    go()
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
  private readonly el = $('wardrobe')
  private look!: Look
  /** Achat en cours, et le refus du dernier achat. */
  private pending = false
  private error = ''
  /** Onglet : le modèle (espèce, sexe, teinte) ou son style (coiffure, visage, couleurs). */
  private tab: 'model' | 'style' = 'model'
  rotating = true
  onChange?: (look: Look) => void
  onClose?: (confirmed: boolean, look: Look) => void

  constructor(private readonly shop: WardrobeShop) {}

  get isOpen(): boolean {
    return !this.el.hidden
  }

  open(look: Look) {
    this.look = { ...look }
    this.tab = 'model'
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
    if (this.pending) return
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

  private setStyle(patch: Partial<LookStyle>) {
    this.error = ''
    this.look = { ...this.look, style: { ...NO_STYLE, ...this.look.style, ...patch } }
    this.render()
    this.onChange?.({ ...this.look })
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
    const price = (look: Look) => shop.price(look)
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
    // Onglet « Style » : seulement pour les Mini Characters (humains, combinaisons, aliens).
    const fields = styleFields(race.id)
    if (!fields.length) this.tab = 'model'
    else {
      const tabs = document.createElement('div')
      tabs.className = 'wr-tabs'
      tabs.setAttribute('role', 'tablist')
      for (const [id, text, glyph] of [['model', tr('Modèle', 'Model'), 'user'], ['style', tr('Coiffure et couleurs', 'Hair and colours'), 'palette']] as const) {
        const b = button(text, this.tab === id, () => { this.tab = id; this.render() }, 'wr-tab', glyph)
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-selected', String(this.tab === id))
        tabs.append(b)
      }
      rows.push(tabs)
    }
    if (this.tab === 'style') {
      const style = { ...NO_STYLE, ...this.look.style }
      /** Pastilles de couleur ; la première (celle d'origine) est barrée. */
      const swatches = (key: keyof LookStyle, choices: StyleChoice[]) =>
        choices.map((c) => {
          const b = button('', style[key] === c.id, () => this.setStyle({ [key]: c.id }), c.swatch ? 'wr-dot' : 'wr-dot wr-dot-none')
          if (c.swatch) b.style.setProperty('--swatch', c.swatch)
          b.title = c.label
          b.setAttribute('aria-label', c.label)
          return b
        })
      if (fields.includes('hair')) {
        const i = Math.max(0, HAIR_CHOICES.findIndex((c) => c.id === style.hair))
        const n = HAIR_CHOICES.length
        const cut = document.createElement('span')
        cut.className = 'wr-variant'
        cut.textContent = HAIR_CHOICES[i].label
        const prevCut = button('', false, () => this.setStyle({ hair: HAIR_CHOICES[(i - 1 + n) % n].id }), 'wr-arrow', 'caret-left')
        const nextCut = button('', false, () => this.setStyle({ hair: HAIR_CHOICES[(i + 1) % n].id }), 'wr-arrow', 'caret-right')
        prevCut.title = tr('Coupe précédente', 'Previous haircut')
        nextCut.title = tr('Coupe suivante', 'Next haircut')
        rows.push(row(tr('Coiffure', 'Haircut'), prevCut, cut, nextCut))
      }
      if (fields.includes('hairColor')) rows.push(row(tr('Cheveux', 'Hair colour'), ...swatches('hairColor', HAIR_COLOR_CHOICES)))
      if (fields.includes('face')) {
        rows.push(row(tr('Expression', 'Expression'), ...FACE_CHOICES.map((c) => button(c.label, style.face === c.id, () => this.setStyle({ face: c.id })))))
      }
      if (fields.includes('paint')) rows.push(row(tr('Combinaison', 'Suit colour'), ...swatches('paint', PAINT_CHOICES)))
      if (fields.includes('trim')) rows.push(row(tr('Liserés', 'Trim'), ...swatches('trim', TRIM_CHOICES)))
      // Sous un casque fermé, la coiffure et le visage ne se voient pas.
      if (race.tints?.find((t) => t.id === this.look.tint)?.suit?.helmet === 'visor') {
        const note = document.createElement('div')
        note.className = 'wr-note'
        note.textContent = tr('Le casque de cette combinaison cache la coiffure et le visage.', 'This suit\'s helmet hides the haircut and the face.')
        rows.push(note)
      }
    }
    if (this.tab === 'model') {
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
    }
    // Apparence payante qu'on n'a pas : son prix, et l'achat à la place de « Valider ».
    const cost = price(this.look)
    const actions = document.createElement('div')
    actions.className = 'wr-actions'
    const cancel = button(tr('Annuler', 'Cancel'), false, () => this.close(false), 'wr-cancel')
    if (cost === null) actions.append(cancel, button(tr('Valider', 'Confirm'), false, () => this.close(true), 'wr-ok'))
    else {
      const blocked = shop.blocked()
      const short = !blocked && cost > shop.balance() ? cost - shop.balance() : 0
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
