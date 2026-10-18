import * as THREE from 'three'
import { formatCredits } from './economy/data'
import { EN, tr } from './i18n'
import { icon, type IconName } from './icons'
import { identityOf, placesMatching } from './deck-identity'
import { FACE_CHOICES, HAIR_CHOICES, HAIR_COLOR_CHOICES, PAINT_CHOICES, styleFields, TRIM_CHOICES, type StyleChoice } from './holo-style'
import { raceOf, RACES, styleFieldsOf, variantsOf, type Look } from './looks'
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
  /** Taille à l'écran (px), relevée après chaque mise en page (cf. Bubbles.sizes). */
  w: number
  h: number
  /** Décalage vers le haut (px, négatif) pour laisser la place à l'invite d'interaction. */
  lift: number
  /** Dernières valeurs écrites dans le style : on ne réécrit que ce qui change. */
  shown: boolean
  pinned: boolean
  transform: string
}

/** Rectangle à l'écran posé sur son bord bas : milieu de ce bord (x, y) et taille (px). */
export interface ScreenBox {
  x: number
  y: number
  w: number
  h: number
}

/** Écart (px) entre une bulle et l'invite d'interaction qu'elle enjambe. */
const PROMPT_GAP = 6

/** Étiquettes HTML accrochées au-dessus des personnages : nom, bulle de chat, emote. */
export class Bubbles {
  private anchors = new Map<string, Anchor>()
  private root = $('bubbles')
  private v = new THREE.Vector3()
  private last = performance.now()
  /**
   * Taille de chaque étiquette, relevée quand elle change : la lire à chaque image forcerait le
   * navigateur à refaire la mise en page de toute l'interface en pleine image.
   */
  private byEl = new WeakMap<Element, Anchor>()
  private sizes = new ResizeObserver((entries) => {
    for (const e of entries) {
      const a = this.byEl.get(e.target)
      if (!a) continue
      a.w = a.el.offsetWidth
      a.h = a.el.offsetHeight
    }
  })

  /** @param getHead position monde au-dessus de la tête, ou null si invisible */
  attach(key: string, getHead: Anchor['getHead'], name?: string, verified?: boolean) {
    this.detach(key)
    const el = document.createElement('div')
    el.className = 'anchor'
    this.root.appendChild(el)
    const a: Anchor = { el, getHead, w: 0, h: 0, lift: 0, shown: true, pinned: false, transform: '' }
    this.byEl.set(el, a)
    this.sizes.observe(el)
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
    this.sizes.unobserve(a.el)
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
   * @param avoid invite d'interaction affichée (« E Parler à… ») : une étiquette qui la
   *   toucherait monte au-dessus d'elle, et redescend en douceur quand elle s'en va
   */
  update(camera: THREE.Camera, pinned?: { key: string; x: number; y: number } | null, avoid?: ScreenBox | null) {
    const now = performance.now()
    const settle = Math.min(1, ((now - this.last) / 1000) * 10)
    this.last = now
    for (const [key, a] of this.anchors) {
      const head = a.getHead(this.v)
      const empty = !a.tag && !a.el.firstChild
      let x = 0, y = 0
      let visible = !!head && !empty
      const pin = visible && pinned?.key === key
      if (pin) ({ x, y } = pinned!)
      else if (visible) {
        head!.project(camera)
        x = ((head!.x + 1) / 2) * innerWidth
        y = ((1 - head!.y) / 2) * innerHeight
        // Derrière la caméra (vue subjective), la projection renverrait la tête devant soi.
        visible = head!.z <= 1
      }
      if (a.shown !== visible) {
        a.shown = visible
        a.el.style.display = visible ? '' : 'none'
      }
      if (!visible) {
        a.lift = 0
        continue
      }
      if (a.pinned !== pin) {
        a.pinned = pin
        a.el.classList.toggle('pinned', pin)
      }
      // L'étiquette occupe [x ± w/2] × [y - h, y] ; l'invite, [avoid.x ± avoid.w/2] × [avoid.y - avoid.h, avoid.y].
      let want = 0
      if (avoid?.w && a.w && Math.abs(x - avoid.x) < (a.w + avoid.w) / 2 + PROMPT_GAP && y > avoid.y - avoid.h - PROMPT_GAP && y - a.h < avoid.y + PROMPT_GAP) {
        want = avoid.y - avoid.h - PROMPT_GAP - y
      }
      a.lift = want < a.lift || Math.abs(want - a.lift) < 0.5 ? want : a.lift + (want - a.lift) * settle
      const transform = `translate(${x.toFixed(1)}px, ${(y + a.lift).toFixed(1)}px) translate(-50%, -100%)`
      if (a.transform !== transform) {
        a.transform = transform
        a.el.style.transform = transform
      }
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
/**
 * Le panneau du téléporteur : un bouton par pont, du plus haut au plus bas, avec sa couleur, son
 * étage, son nom et sa devise (cf. deck-identity.ts) ; et une recherche « Où aller ? », qui montre
 * sous chaque pont les lieux qui répondent et sélectionne le premier pont où aller.
 */
export class LiftPanel {
  private el = $('lift')
  private buttons = $('lift-buttons')
  private search = $<HTMLInputElement>('lift-search')
  private none = $('lift-none')
  private choices: { button: HTMLButtonElement; go: () => void }[] = []
  private selected = -1
  private levels: { id: number; name: string }[] = []
  private current = 0
  private onPick: (id: number) => void = () => {}

  constructor() {
    $('lift-close').onclick = () => this.close()
    this.search.addEventListener('input', () => this.render(true))
    // Dans le champ de recherche, les lettres s'écrivent ; les flèches, Entrée et Échap pilotent le panneau.
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.move(e.key === 'ArrowUp' ? -1 : 1)
      else if (e.key === 'Enter') this.confirm()
      else if (e.key === 'Escape') this.close()
      else return e.stopPropagation()
      e.preventDefault()
      e.stopPropagation()
    })
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  /** Le clic (ou autre événement) vise-t-il le panneau ? */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.el.contains(target)
  }

  /** Le champ « Où aller ? » prend la main (touche / du clavier). */
  focusSearch() {
    this.search.focus()
  }

  open(levels: { id: number; name: string }[], current: number, onPick: (id: number) => void) {
    this.levels = levels
    this.current = current
    this.onPick = onPick
    this.search.value = ''
    this.render(false)
    this.el.hidden = false
  }

  private render(searching: boolean) {
    this.buttons.replaceChildren()
    this.choices = []
    const query = this.search.value
    let start = -1
    let first = -1
    // Du plus haut au plus bas, comme un vrai panneau d'ascenseur.
    for (const l of [...this.levels].sort((a, b) => b.id - a.id)) {
      const id = identityOf(l.id)
      const here = l.id === this.current
      const b = document.createElement('button')
      b.className = 'lift-deck'
      if (id) b.style.setProperty('--deck', id.color)
      const n = document.createElement('kbd')
      n.textContent = l.id > 0 ? `+${l.id}` : String(l.id)
      const text = document.createElement('span')
      text.className = 'lift-deck-text'
      const name = document.createElement('b')
      name.textContent = l.name
      text.append(name)
      if (id) {
        const tagline = document.createElement('small')
        tagline.className = 'lift-tagline'
        tagline.append(icon(id.icon), id.tagline)
        text.append(tagline)
      }
      if (here) {
        const tag = document.createElement('small')
        tag.className = 'lift-current'
        tag.textContent = tr('Vous êtes ici', 'You are here')
        name.append(' ', tag)
        b.setAttribute('aria-current', 'location')
      }
      const matches = query ? placesMatching(l.id, query) : []
      if (matches.length) {
        const places = document.createElement('small')
        places.className = 'lift-places'
        places.textContent = matches.map((p) => p.name).join(' · ')
        text.append(places)
        if (!here && first < 0) first = this.choices.length
      } else if (query) b.classList.add('dim')
      b.append(n, text)
      b.disabled = here
      const i = this.choices.length
      const go = () => this.onPick(l.id)
      b.onclick = () => this.pick(go)
      b.onpointerenter = () => this.select(i)
      this.buttons.appendChild(b)
      this.choices.push({ button: b, go })
      if (here) start = i
    }
    this.none.hidden = !query || first >= 0 || this.choices.some((c) => c.button.querySelector('.lift-places'))
    // Sélection : le premier pont où aller pour cette recherche ; sinon l'étage juste au-dessus, ou juste en dessous.
    this.selected = -1
    if (searching && first >= 0) this.select(first)
    else {
      this.selected = start
      this.move(this.selected > 0 ? -1 : 1)
    }
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
    this.search.blur()
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

/** Part de la jauge pour le téléchargement des modèles (cf. bootModels). */
const BOOT_MODELS = 0.25
/**
 * Allure de la jauge, par seconde : elle avance d'elle-même à ce pas régulier, qu'importe la
 * façon dont la charge vraie arrive (les modèles d'un coup, puis de longs montages sans nouvelles).
 */
const BOOT_PACE = 0.2
/**
 * Près du bout de l'étape, elle ralentit : chaque seconde, elle en fait la moitié de ce qui reste
 * (environ). Un réseau lent la voit ralentir, pas s'arrêter.
 */
const BOOT_EASE = 1.5
/** Son pas le plus lent, quand l'étape en cours tarde vraiment. */
const BOOT_CREEP = 0.004
/** En retard sur la charge vraie, elle rattrape plus vite, mais sans sauter. */
const BOOT_CATCH_UP = 0.9

/**
 * Charge vraie (plancher de la jauge), bout de l'étape en cours (plafond : la jauge n'y va pas
 * avant elle) et charge affichée, qui ne recule jamais.
 */
let bootFloor = 0
let bootCeil = 0
let bootShown = 0
let bootFrame = 0
let bootLast = 0
/** Appelé quand la jauge affichée a rejoint la charge vraie (cf. bootStep, bootDone). */
let bootCaught: (() => void) | null = null

function paintBoot(ratio: number) {
  // Arrondi par défaut : 100 % quand c'est fini, pas à 99,5.
  const percent = Math.floor(ratio * 100)
  const root = $('loading')
  root.style.setProperty('--p', String(ratio))
  root.setAttribute('aria-valuenow', String(percent))
  $('boot-arc').style.strokeDashoffset = String(BOOT_ARC * (1 - ratio))
  $('boot-pct').textContent = `${percent} %`
}

/**
 * Une image de la jauge : elle avance au pas, ralentit à l'approche du bout de l'étape en cours,
 * et rattrape la charge vraie quand celle-ci la devance. Un long calcul (le montage d'un pont) fige
 * la page : au retour, l'écart ne compte que pour une image, la jauge ne saute pas.
 */
function tickBoot(now: number) {
  // L'heure d'une image peut précéder celle relevée au départ (cf. bootProgress) : pas de pas en arrière.
  const dt = Math.min(0.05, Math.max(0, now - bootLast) / 1000)
  bootLast = now
  const pace = bootShown < bootFloor ? BOOT_CATCH_UP : Math.max(BOOT_CREEP, Math.min(BOOT_PACE, (bootCeil - bootShown) / BOOT_EASE))
  bootShown = Math.min(Math.max(bootFloor, bootCeil - 0.001), bootShown + pace * dt)
  paintBoot(bootShown)
  if (bootCaught && bootShown >= bootFloor - 0.005) {
    const caught = bootCaught
    bootCaught = null
    caught()
  }
  if (bootFrame) bootFrame = requestAnimationFrame(tickBoot)
}

/**
 * Écran de démarrage : la charge vraie de 0 à 1, le bout de l'étape qui commence (la jauge y
 * avance d'elle-même en attendant) et son nom.
 */
export function bootProgress(ratio: number, step: string, until = ratio) {
  bootFloor = Math.max(bootFloor, ratio)
  bootCeil = Math.max(bootCeil, until, bootFloor)
  $('boot-step').textContent = step
  if (!bootFrame) {
    // La jauge est partie avant le script du jeu (cf. index.html) : elle reprend d'où elle en est.
    const root = $('loading')
    root.dataset.game = '1'
    bootShown = Math.max(bootShown, Number(root.dataset.shown) || 0)
    bootLast = performance.now()
    bootFrame = requestAnimationFrame(tickBoot)
  }
}

/** Téléchargement des modèles, de 0 à 1 : le début de la jauge, systèmes mis sous tension l'un après l'autre. */
export function bootModels(ratio: number) {
  bootProgress(ratio * BOOT_MODELS, BOOT_STEPS[Math.min(BOOT_STEPS.length - 1, Math.floor(ratio * BOOT_STEPS.length))], BOOT_MODELS)
}

/**
 * Nouvelle étape du démarrage, avant un long calcul : on laisse d'abord la jauge rejoindre la
 * charge vraie (un quart de seconde au plus) pour qu'elle glisse au lieu de sauter d'un bloc à
 * l'autre, et peindre l'étape.
 */
export function bootStep(ratio: number, step: string, until = ratio): Promise<void> {
  bootProgress(ratio, step, until)
  return new Promise((resolve) => {
    const go = () => {
      clearTimeout(late)
      bootCaught = null
      setTimeout(resolve, 0)
    }
    const late = setTimeout(go, 250)
    bootCaught = go
  })
}

/** Le démarrage a échoué (un modèle qui ne vient pas, réseau coupé) : on le dit, plutôt qu'une jauge figée. */
export function bootFailed() {
  const root = document.getElementById('loading')
  if (!root || root.classList.contains('done')) return
  cancelAnimationFrame(bootFrame)
  bootFrame = 0
  $('boot-step').textContent = tr('Échec du chargement : rechargez la page', 'Loading failed: please reload the page')
}

/** Vaisseau prêt : la jauge finit sa course, puis le saut, et l'écran quitte la page (ses animations ne tournent plus). */
export function bootDone() {
  const step = tr('Systèmes en ligne', 'Systems online')
  bootProgress(0.92, step, 0.99)
  const root = $('loading')
  // Le reste du script de démarrage tourne encore d'un bloc : la jauge ne finit qu'après lui.
  setTimeout(() => {
    bootProgress(1, step)
    bootCaught = finish
  }, 0)
  const finish = () => {
    cancelAnimationFrame(bootFrame)
    bootFrame = 0
    paintBoot(1)
    // Laisser voir la jauge pleine un instant, puis lancer le saut.
    setTimeout(() => {
      root.classList.add('done')
      setTimeout(() => root.remove(), 1300)
    }, 400)
  }
}

// --------------------------------------------------------------- garde-robe

/**
 * Boutique du Holo-Me (cf. economy/skins.ts) : ce que coûte une apparence qu'on n'a pas, et de
 * quoi l'acheter.
 */
export interface WardrobeShop {
  /** Prix d'une apparence qu'on n'a pas encore, ou null (offerte, ou déjà achetée). */
  price(look: Look): number | null
  /** Cette apparence, qu'on n'a pas, ne s'achète pas : une quête du bord l'offre, ou un record. */
  quest(look: Look): boolean
  /** Comment la gagner, quand elle ne s'achète pas (sinon : « une quête du bord l'offre »). */
  earn?(look: Look): string | null
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
    /** Cadenas, et le prix en info-bulle (ou « se gagne à bord »), sur un choix qu'on n'a pas. */
    const lock = (b: HTMLButtonElement, cost: number | null, look: Look) => {
      if (cost === null) return b
      b.classList.add('locked')
      b.append(icon('lock-simple', 'wr-lock'))
      b.title = shop.quest(look) ? tr('Se gagne à bord', 'Earned aboard') : formatCredits(cost)
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
    const fields = styleFieldsOf(this.look)
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
      // Une tête imposée (Kael) : ni la coupe ni la couleur des cheveux ne se choisissent.
      if (fields.length < styleFields(race.id).length) {
        const note = document.createElement('div')
        note.className = 'wr-note'
        note.textContent = tr('Cette apparence garde sa tête : sa coupe et ses cheveux ne se changent pas.', 'This look keeps its own head: its haircut and hair cannot be changed.')
        rows.push(note)
      }
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
              // Combinaisons, teintes d'alien, projections : chacune s'acquiert pour tous les modèles.
              return race.id === 'suit' || race.id === 'alien' || race.id === 'holo' ? lock(b, price({ ...this.look, tint: t.id }), { ...this.look, tint: t.id }) : b
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
    else if (shop.quest(this.look)) {
      // Elle se gagne à bord : ni prix, ni achat.
      const note = document.createElement('div')
      note.className = 'wr-price'
      note.append(icon('lock-simple'), document.createTextNode(tr('Se gagne à bord', 'Earned aboard')))
      const w = document.createElement('div')
      w.className = 'wr-why'
      w.textContent = shop.earn?.(this.look) ?? tr('Cette apparence ne s\'achète pas : une quête du bord l\'offre. Ouvrez l\'œil.', 'This look can\'t be bought: a quest aboard awards it. Keep your eyes open.')
      note.append(w)
      rows.push(note)
      actions.append(cancel)
    } else {
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
