import { tr } from './i18n'

type Game = 'cards' | 'cqc' | 'edgis' | 'site' | 'scavengers'
const EDGIS_URL = 'https://edgis.elitedangereuse.fr/static/galaxymap.html?x=0&y=0&z=0&radius=20'
const SITE_HOME = 'https://elitedangereuse.fr/'
const SCAVENGERS_URL = 'https://scavengers.elitedangereuse.fr/'
/** `typed` : jeu au clavier, qui prend le curseur dès qu'il est chargé (Échap ne ferme alors plus : il reste le bouton). */
const GAMES: Record<Game, { title: string; url: string; fullUrl: string; hint: string; kicker?: string; typed?: boolean }> = {
  cards: { title: 'Galactic Clash', url: '/galactic_clash.php', fullUrl: '/galactic_clash.php', hint: tr('Choisissez une partie solo ou un duel dans le jeu.', 'Choose a solo game or a duel in the game.') },
  cqc: { title: 'Mini-CQC', url: '/cqc.php?mini_embed=1', fullUrl: '/cqc.php', hint: tr('Jouez en solo ou rejoignez d’autres pilotes.', 'Play solo or join other pilots.') },
  edgis: { title: tr('Carte galactique · EDGIS', 'Galaxy map · EDGIS'), url: EDGIS_URL, fullUrl: EDGIS_URL,
    hint: tr('Explorez la galaxie avec EDGIS.', 'Explore the galaxy with EDGIS.'), kicker: tr('POSTE DE PILOTAGE · NAVIGATION', 'BRIDGE · NAVIGATION') },
  site: { title: 'elitedangereuse.fr', url: SITE_HOME, fullUrl: SITE_HOME,
    hint: tr('Le site de la communauté, depuis le bureau des quartiers.', 'The community website, from the quarters desk.'), kicker: tr('QUARTIERS · BUREAU', 'QUARTERS · DESK') },
  scavengers: { title: 'Scavengers', url: SCAVENGERS_URL, fullUrl: SCAVENGERS_URL,
    hint: tr('Pilotez vos drones au clavier ou à la souris. Dans le jeu, tapez « lang fr » pour le français.', 'Fly your drones with the keyboard or the mouse. Type “lang fr” in the game for French.'),
    kicker: tr('CALE · PLANQUE DES SCAVENGERS', 'HOLD · SCAVENGERS\' DEN'), typed: true },
}

/** Fenêtre des jeux du site et de la carte galactique EDGIS. */
export class GameEmbed {
  private root = document.createElement('section')
  private frame = document.createElement('iframe')
  private title = document.createElement('h2')
  private kicker = document.createElement('small')
  private hint = document.createElement('p')
  private link = document.createElement('a')
  private previousFocus: HTMLElement | null = null
  private typed = false

  constructor() {
    this.root.className = 'bar-game-overlay'
    this.root.hidden = true
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    const shell = document.createElement('div')
    shell.className = 'bar-game-shell'
    const header = document.createElement('header')
    header.className = 'bar-game-header'
    const intro = document.createElement('div')
    this.hint.className = 'bar-game-hint'
    intro.append(this.kicker, this.title, this.hint)
    const actions = document.createElement('div')
    actions.className = 'bar-game-actions'
    this.link.target = '_blank'
    this.link.rel = 'noopener'
    this.link.textContent = tr('Ouvrir dans un onglet ↗', 'Open in a tab ↗')
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = tr('Fermer ×', 'Close ×')
    close.onclick = () => this.close()
    actions.append(this.link, close)
    header.append(intro, actions)
    this.frame.title = tr('Jeu du site Élite Dangereuse', 'Élite Dangereuse site game')
    this.frame.setAttribute('allow', 'fullscreen; gamepad')
    this.frame.setAttribute('referrerpolicy', 'same-origin')
    this.frame.addEventListener('load', () => { if (this.typed && this.isOpen) this.frame.focus() })
    shell.append(header, this.frame)
    this.root.append(shell)
    document.body.append(this.root)
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close() }
      e.stopPropagation()
    })
  }

  get isOpen() { return !this.root.hidden }
  open(game: Game) {
    const def = GAMES[game]
    this.previousFocus = document.activeElement as HTMLElement
    this.title.textContent = def.title
    this.kicker.textContent = def.kicker ?? tr('CHEZ JACQUES · TABLE DE JEU', 'CHEZ JACQUES · GAME TABLE')
    this.hint.textContent = def.hint
    this.link.href = def.fullUrl
    this.typed = !!def.typed
    this.frame.src = def.url
    this.frame.title = def.title
    this.root.hidden = false
    this.root.querySelector<HTMLButtonElement>('button')?.focus()
  }
  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.frame.removeAttribute('src') // arrête le jeu et libère sa connexion réseau
    this.previousFocus?.focus()
  }
}
