import * as THREE from 'three'
import { drinkPrice, formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'
import { tr } from './i18n'
import type { Player } from './player'

const DRINKS = [
  { id: 'night-conda', name: 'Night Conda', note: tr('Vitesse de course × 1,45', 'Run speed × 1.45'), color: '#ae85ff' },
  { id: 'caustic-sour', name: 'Caustic Sour', note: tr('Lueur caustique autour de vous', 'Caustic glow around you'), color: '#adff65' },
  { id: 'imperial-crush', name: 'Imperial Crush', note: tr('Trois joyaux dorés en orbite', 'Three golden gems in orbit'), color: '#ffd178' },
  { id: 'stellar-kick', name: 'Stellar Kick', note: tr('Sillage d’étincelles stellaires', 'A trail of stellar sparks'), color: '#79dfff' },
  { id: 'colonia-dream', name: 'Colonia Dream', note: tr('Bulle lumineuse bleue', 'A luminous blue bubble'), color: '#80acff' },
] as const
export type DrinkId = (typeof DRINKS)[number]['id']

/** Les effets sont locaux et cosmétiques ; le serveur confirme seulement le débit du verre. */
export class CocktailEffects {
  private active = new Map<DrinkId, { until: number; group: THREE.Group }>()
  private trail: { mesh: THREE.Mesh; life: number }[] = []
  private lastTrail = 0
  private geometry = new THREE.SphereGeometry(0.035, 8, 6)

  constructor(private player: Player, private scene: THREE.Scene) {}

  remaining(id: DrinkId): number {
    return Math.max(0, Math.ceil(((this.active.get(id)?.until ?? 0) - Date.now()) / 1000))
  }

  apply(id: DrinkId) {
    this.remove(id)
    const group = new THREE.Group()
    const orb = (size: number, color: string, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }))
      mesh.position.set(x, y, z)
      group.add(mesh)
      return mesh
    }
    const ring = (radius: number, color: string, y: number) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.013, 5, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }))
      mesh.rotation.x = Math.PI / 2
      mesh.position.y = y
      group.add(mesh)
      return mesh
    }
    if (id === 'night-conda') {
      ring(0.31, '#a978ff', 0.045)
      ring(0.42, '#7952cf', 0.03)
    } else if (id === 'caustic-sour') {
      const light = new THREE.PointLight('#99ff51', 2.5, 2.3)
      light.position.y = 0.55
      group.add(light)
      ring(0.38, '#a9ff6d', 0.08)
      for (let i = 0; i < 7; i++) orb(0.025, '#bfff75', Math.sin(i * 2.4) * 0.32, 0.17 + i * 0.11, Math.cos(i * 2.4) * 0.32)
    } else if (id === 'imperial-crush') {
      for (let i = 0; i < 3; i++) orb(0.075, '#ffd381', 0, 0.7, 0)
      ring(0.34, '#eebf65', 0.04)
    } else if (id === 'colonia-dream') {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: '#70a9ff', transparent: true, opacity: 0.09, depthWrite: false, side: THREE.BackSide }))
      bubble.position.y = 0.48
      group.add(bubble)
      ring(0.48, '#8acbff', 0.05)
      ring(0.37, '#d4a4ff', 0.93)
    } else {
      ring(0.25, '#7ee5ff', 0.045)
    }
    this.player.root.add(group)
    this.active.set(id, { until: Date.now() + 60_000, group })
    this.player.speedMultiplier = this.active.has('night-conda') ? 1.45 : 1
  }

  private remove(id: DrinkId) {
    const effect = this.active.get(id)
    if (!effect) return
    effect.group.removeFromParent()
    effect.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const material of materials) material.dispose()
      }
    })
    this.active.delete(id)
    this.player.speedMultiplier = this.active.has('night-conda') ? 1.45 : 1
  }

  update(dt: number) {
    const now = Date.now()
    for (const [id, effect] of this.active) {
      if (effect.until <= now) { this.remove(id); continue }
      const t = now / 1000
      if (id === 'imperial-crush') effect.group.children.slice(0, 3).forEach((gem, i) => {
        const a = t * 1.6 + i * Math.PI * 2 / 3
        gem.position.set(Math.cos(a) * 0.43, 0.72 + Math.sin(t * 2 + i) * 0.07, Math.sin(a) * 0.43)
      })
      if (id === 'night-conda') effect.group.scale.setScalar(1 + Math.sin(t * 8) * 0.08)
      if (id === 'colonia-dream') effect.group.rotation.y += dt * 0.35
      if (id === 'caustic-sour') effect.group.rotation.y += dt * 0.45
    }
    for (const particle of this.trail) {
      particle.life -= dt
      particle.mesh.position.y += dt * 0.24
      particle.mesh.scale.setScalar(Math.max(0, particle.life / 0.8))
    }
    this.trail = this.trail.filter((particle) => {
      if (particle.life > 0) return true
      particle.mesh.removeFromParent()
      ;(particle.mesh.material as THREE.Material).dispose()
      return false
    })
    if (!this.active.has('stellar-kick') || (!this.player.moving && this.player.avatar.locomotion === 'idle') || now - this.lastTrail < 75) return
    this.lastTrail = now
    const p = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? '#82eaff' : '#fff1b5' }))
    p.position.set(this.player.position.x + (Math.random() - 0.5) * 0.35, this.player.position.y + 0.1 + Math.random() * 0.45, this.player.position.z + (Math.random() - 0.5) * 0.35)
    this.scene.add(p)
    this.trail.push({ mesh: p, life: 0.8 })
  }
}

export class BarPanel {
  private root = document.createElement('section')
  private list = document.createElement('div')
  private status = document.createElement('p')
  private playerScreen = new THREE.Vector3()
  private jacquesScreen = new THREE.Vector3()
  private previousFocus: HTMLElement | null = null
  private busy = false
  private line = 0
  private readonly lines = [
    tr('« Bienvenue chez Jacques. Ici, je ne demande ni votre nom ni votre cargaison. »', '“Welcome to Chez Jacques. I ask neither your name nor your cargo.”'),
    tr('« Le Brandy de Lave ? Officiellement, je n’en ai pas. »', '“Lavian Brandy? Officially, I have none.”'),
    tr('« J’ai servi à Jameson Memorial. Ils m’ont remplacé par un distributeur ! »', '“I served at Jameson Memorial. They replaced me with a vending machine!”'),
    tr('« Si la sécurité monte à bord, ce bar est une réserve de pièces détachées. »', '“If security comes aboard, this is a spare parts store.”'),
  ]

  constructor(private wallet: Wallet, private effects: CocktailEffects, private onOpen: () => void, private onClose: () => void) {
    this.root.className = 'jacques-overlay'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    this.root.setAttribute('aria-label', tr('Chez Jacques, carte des cocktails', 'Chez Jacques, cocktail menu'))
    const panel = document.createElement('div')
    panel.className = 'jacques-panel'
    const header = document.createElement('header')
    header.className = 'jacques-heading'
    const intro = document.createElement('div')
    intro.innerHTML = `<small>CHEZ JACQUES · ${tr('CALE', 'LOWER DECK')}</small><h2>Jacques</h2>`
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'jacques-close'
    close.textContent = '×'
    close.setAttribute('aria-label', tr('Fermer', 'Close'))
    close.onclick = () => this.close()
    header.append(intro, close)
    const speech = document.createElement('div')
    speech.className = 'jacques-speech'
    const line = document.createElement('p')
    const talk = document.createElement('button')
    talk.type = 'button'
    talk.textContent = tr('Parler à Jacques ↻', 'Talk to Jacques ↻')
    talk.onclick = () => { this.line = (this.line + 1) % this.lines.length; line.textContent = this.lines[this.line] }
    speech.append(line, talk)
    const menu = document.createElement('div')
    menu.className = 'jacques-menu-title'
    menu.innerHTML = `<span>${tr('LA CARTE', 'THE MENU')}</span><small>${tr('EFFETS · 1 MINUTE', 'EFFECTS · 1 MINUTE')}</small>`
    this.list.className = 'jacques-drinks'
    this.status.className = 'jacques-status'
    this.status.setAttribute('aria-live', 'polite')
    panel.append(header, speech, menu, this.list, this.status)
    this.root.append(panel)
    document.body.append(this.root)
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close() }
      if (e.key === 'Tab') {
        const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (e.shiftKey && at === 0) { e.preventDefault(); buttons.at(-1)?.focus() }
        else if (!e.shiftKey && at === buttons.length - 1) { e.preventDefault(); buttons[0]?.focus() }
      }
      e.stopPropagation()
    })
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
    this.wallet.subscribe(() => { if (this.isOpen) this.render() })
    setInterval(() => { if (this.isOpen) this.updateTimers() }, 1000)
  }

  get isOpen() { return !this.root.hidden }
  contains(target: EventTarget | null) { return target instanceof Node && this.root.contains(target) }
  open() {
    if (this.isOpen) return
    this.previousFocus = document.activeElement as HTMLElement
    this.line = Math.floor(Math.random() * this.lines.length)
    this.root.querySelector('.jacques-speech p')!.textContent = this.lines[this.line]
    this.status.textContent = ''
    this.root.hidden = false
    this.onOpen()
    this.render()
    this.root.querySelector<HTMLButtonElement>('.jacques-close')?.focus()
  }
  close() {
    if (this.busy || !this.isOpen) return
    this.root.hidden = true
    this.onClose()
    this.previousFocus?.focus()
  }

  /** Suit la place du joueur à l'écran, du côté opposé à Jacques. */
  place(camera: THREE.Camera, player: THREE.Vector3, jacques: THREE.Vector3) {
    if (!this.isOpen || innerWidth <= 900) return
    this.playerScreen.set(player.x, player.y + 0.85, player.z).project(camera)
    this.jacquesScreen.set(jacques.x, player.y + 0.85, jacques.z).project(camera)
    const x = (this.playerScreen.x + 1) * innerWidth / 2
    const y = (1 - this.playerScreen.y) * innerHeight / 2
    const width = this.root.offsetWidth, height = this.root.offsetHeight
    const side = this.jacquesScreen.x > this.playerScreen.x ? -1 : 1
    const left = side < 0 ? x - width - 48 : x + 48
    this.root.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`
    this.root.style.top = `${Math.max(12, Math.min(y - height / 2, innerHeight - height - 12))}px`
  }

  private render() {
    const focused = (document.activeElement as HTMLButtonElement)?.dataset?.drink
    this.list.replaceChildren()
    for (const drink of DRINKS) {
      const card = document.createElement('article')
      card.className = 'jacques-drink'
      card.style.setProperty('--drink-color', drink.color)
      const icon = document.createElement('span')
      icon.className = 'jacques-glass'
      icon.textContent = '◈'
      const details = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = drink.name
      const note = document.createElement('small')
      const remaining = this.effects.remaining(drink.id)
      note.textContent = remaining ? `${drink.note} · ${remaining}s` : drink.note
      note.dataset.note = drink.id
      details.append(title, note)
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.drink = drink.id
      button.textContent = formatCredits(drinkPrice(drink.id) ?? 0)
      button.disabled = this.busy || !this.wallet.ready || this.wallet.balance < (drinkPrice(drink.id) ?? Infinity)
      button.onclick = () => void this.order(drink.id)
      card.append(icon, details, button)
      this.list.append(card)
    }
    if (focused) this.list.querySelector<HTMLButtonElement>(`[data-drink="${focused}"]`)?.focus()
    if (!this.status.textContent) this.status.textContent = this.wallet.state === 'guest'
      ? tr('Connectez-vous au site pour commander.', 'Log in to the site to order.')
      : this.wallet.ready ? tr(`Solde : ${formatCredits(this.wallet.balance)}`, `Balance: ${formatCredits(this.wallet.balance)}`)
        : tr('Chargement des crédits…', 'Loading credits…')
  }

  private updateTimers() {
    for (const drink of DRINKS) {
      const note = this.list.querySelector<HTMLElement>(`[data-note="${drink.id}"]`)
      const remaining = this.effects.remaining(drink.id)
      if (note) note.textContent = remaining ? `${drink.note} · ${remaining}s` : drink.note
    }
  }

  private async order(id: DrinkId) {
    if (this.busy) return
    this.busy = true
    this.status.textContent = tr('Jacques prépare votre verre…', 'Jacques is mixing your drink…')
    this.render()
    const outcome = await this.wallet.buyDrink(id)
    this.busy = false
    if (outcome.ok) {
      this.effects.apply(id)
      this.status.textContent = tr(`Santé, CMDR ! Effet actif pendant 1 minute. Solde : ${formatCredits(this.wallet.balance)}`, `Cheers, CMDR! Effect active for 1 minute. Balance: ${formatCredits(this.wallet.balance)}`)
    } else this.status.textContent = outcome.reason === 'funds'
      ? tr('Crédits insuffisants pour ce verre.', 'Not enough credits for that drink.')
      : outcome.reason === 'guest' ? tr('Connectez-vous au site pour commander.', 'Log in to the site to order.')
        : tr('Le terminal de Jacques ne répond pas. Réessayez.', 'Jacques’s terminal is unavailable. Try again.')
    this.render()
  }
}
