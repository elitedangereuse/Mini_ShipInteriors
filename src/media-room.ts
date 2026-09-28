import { tr } from './i18n'
import { BASE } from './assets'

type Show = 'radio' | 'galeres'

const SHOWS: Record<Show, { name: string; logo: string; url: string; site: string }> = {
  radio: { name: 'Radio Dangereuse', logo: BASE + 'shows/radio-dangereuse.png', url: import.meta.env.BASE_URL + 'radio-player.html', site: 'https://radio.elitedangereuse.fr/' },
  galeres: { name: 'Galères Galactiques', logo: BASE + 'shows/galeres-galactiques.svg', url: 'https://galeresgalactiques.fr/', site: 'https://galeresgalactiques.fr/' },
}

/** Panneau latéral des deux émissions du salon d'écoute. */
export class MediaRoom {
  private root = document.createElement('section')
  private body = document.createElement('div')
  private frame = document.createElement('iframe')
  private title = document.createElement('h2')
  private link = document.createElement('a')
  private back = document.createElement('button')
  private closeButton = document.createElement('button')
  private previousFocus: HTMLElement | null = null
  private zoomBefore: number | null = null

  constructor(private zoom: { get: () => number; set: (value: number) => void }) {
    this.root.className = 'media-room-overlay'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    const shell = document.createElement('div')
    shell.className = 'media-room-shell'
    const header = document.createElement('header')
    header.className = 'media-room-header'
    const caption = document.createElement('div')
    const kicker = document.createElement('small')
    kicker.textContent = tr('PONT SUPÉRIEUR', 'UPPER DECK')
    caption.append(kicker, this.title)
    const actions = document.createElement('div')
    actions.className = 'media-room-actions'
    this.back.type = 'button'
    this.back.textContent = tr('← Choisir', '← Choose')
    this.back.onclick = () => this.choose()
    this.link.target = '_blank'
    this.link.rel = 'noopener noreferrer'
    this.link.textContent = tr('Ouvrir le site ↗', 'Open site ↗')
    this.closeButton.type = 'button'
    this.closeButton.textContent = tr('Fermer ×', 'Close ×')
    this.closeButton.onclick = () => this.close()
    actions.append(this.back, this.link, this.closeButton)
    header.append(caption, actions)
    this.body.className = 'media-room-body'
    this.frame.className = 'media-room-frame'
    this.frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture')
    this.frame.setAttribute('loading', 'lazy')
    shell.append(header, this.body)
    this.root.append(shell)
    document.body.append(this.root)
    this.root.addEventListener('click', (event) => { if (event.target === this.root) this.close() })
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); this.close() }
      event.stopPropagation()
    })
  }

  get isOpen() { return !this.root.hidden }

  open() {
    if (!this.isOpen) {
      this.previousFocus = document.activeElement as HTMLElement
      this.zoomBefore = this.zoom.get()
      this.zoom.set(Math.min(this.zoomBefore, innerWidth <= 700 ? 3.6 : 2.8))
    }
    this.root.hidden = false
    this.choose()
  }

  private choose() {
    this.frame.removeAttribute('src')
    this.frame.remove()
    this.title.textContent = tr('Salon d’écoute', 'Listening lounge')
    this.back.hidden = true
    this.link.hidden = true
    const choices = document.createElement('div')
    choices.className = 'media-room-choices'
    for (const key of ['radio', 'galeres'] as const) {
      const show = SHOWS[key]
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `media-room-choice media-room-choice-${key}`
      const img = document.createElement('img')
      img.src = show.logo
      img.alt = ''
      const name = document.createElement('strong')
      name.textContent = show.name
      const description = document.createElement('span')
      description.textContent = key === 'radio' ? tr('Le podcast francophone d’Elite Dangerous', 'The French Elite Dangerous podcast') : tr('La mini série audio spatiale', 'The space audio mini-series')
      button.append(img, name, description)
      button.onclick = () => this.playShow(key)
      choices.append(button)
    }
    this.body.replaceChildren(choices)
    choices.querySelector('button')?.focus()
  }

  private showFrame(title: string, src: string, site: string) {
    this.title.textContent = title
    this.back.hidden = false
    this.link.hidden = false
    this.link.href = site
    this.frame.title = title
    this.frame.src = src
    this.body.replaceChildren(this.frame)
    this.back.focus()
  }

  private playShow(key: Show) {
    const show = SHOWS[key]
    this.showFrame(show.name, show.url, show.site)
  }

  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.frame.removeAttribute('src')
    if (this.zoomBefore !== null) this.zoom.set(this.zoomBefore)
    this.zoomBefore = null
    this.previousFocus?.focus()
  }
}
