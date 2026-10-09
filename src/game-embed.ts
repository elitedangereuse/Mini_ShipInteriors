import { tr } from './i18n'

type Game = 'cards' | 'clash' | 'collection' | 'cqc' | 'edgis' | 'site' | 'scavengers' | 'idot' | 'pixelwar'
const EDGIS_URL = 'https://edgis.elitedangereuse.fr/static/galaxymap.html?x=0&y=0&z=0&radius=20'
const SITE_HOME = 'https://elitedangereuse.fr/'
const SCAVENGERS_URL = 'https://scavengers.elitedangereuse.fr/'
const IDOT_URL = 'https://idot.elitedangereuse.fr/'
/** `typed` : jeu au clavier, qui prend le curseur dès qu'il est chargé (Échap ne ferme alors plus : il reste le bouton). */
const GAMES: Record<Game, { title: string; url: string; fullUrl: string; hint: string; kicker?: string; typed?: boolean }> = {
  cards: { title: 'Galactic Clash', url: '/galactic_clash.php', fullUrl: '/galactic_clash.php', hint: tr('Choisissez une partie solo ou un duel dans le jeu.', 'Choose a solo game or a duel in the game.') },
  // Les mêmes parties, aux tables du Comptoir des Cartes Dangereuses (pont supérieur), et sa collection à ses pupitres.
  clash: { title: 'Galactic Clash', url: '/galactic_clash.php', fullUrl: '/galactic_clash.php', hint: tr('Choisissez une partie solo ou un duel dans le jeu.', 'Choose a solo game or a duel in the game.'),
    kicker: tr('COMPTOIR DES CARTES DANGEREUSES · TABLE DE JEU', 'CARTES DANGEREUSES COUNTER · GAME TABLE') },
  collection: { title: tr('Ma collection', 'My collection'), url: '/cartes.php', fullUrl: '/cartes.php',
    hint: tr('Vos Cartes Dangereuses : classeur, échanges et fabrication. Il faut être connecté au site.', 'Your Cartes Dangereuses: binder, trades and crafting. You must be signed in to the site.'),
    kicker: tr('COMPTOIR DES CARTES DANGEREUSES · PUPITRE DE COLLECTION', 'CARTES DANGEREUSES COUNTER · COLLECTION DESK') },
  cqc: { title: 'Mini-CQC', url: '/cqc.php?mini_embed=1', fullUrl: '/cqc.php', hint: tr('Jouez en solo ou rejoignez d’autres pilotes.', 'Play solo or join other pilots.') },
  edgis: { title: tr('Carte galactique · EDGIS', 'Galaxy map · EDGIS'), url: EDGIS_URL, fullUrl: EDGIS_URL,
    hint: tr('Explorez la galaxie avec EDGIS.', 'Explore the galaxy with EDGIS.'), kicker: tr('POSTE DE PILOTAGE · NAVIGATION', 'BRIDGE · NAVIGATION') },
  site: { title: 'elitedangereuse.fr', url: SITE_HOME, fullUrl: SITE_HOME,
    hint: tr('Le site de la communauté, depuis le bureau des quartiers.', 'The community website, from the quarters desk.'), kicker: tr('QUARTIERS · BUREAU', 'QUARTERS · DESK') },
  scavengers: { title: 'Scavengers', url: SCAVENGERS_URL, fullUrl: SCAVENGERS_URL,
    hint: tr('Pilotez vos drones au clavier ou à la souris. Dans le jeu, tapez « lang fr » pour le français.', 'Fly your drones with the keyboard or the mouse. Type “lang fr” in the game for French.'),
    kicker: tr('CALE · PLANQUE DES SCAVENGERS', 'HOLD · SCAVENGERS\' DEN'), typed: true },
  idot: { title: 'It\'s Dangerous Out There', url: IDOT_URL, fullUrl: IDOT_URL,
    hint: tr('Rejoignez votre destination, saut après saut. Chaque action a son raccourci, sous l\'écran du jeu.', 'Reach your destination, jump after jump. Every action has its shortcut, below the game screen.'),
    kicker: tr('CALE · POSTE D\'EXPLORATION', 'HOLD · EXPLORATION POST'), typed: true },
  pixelwar: { title: 'Pixel War', url: '/pixel_war.php', fullUrl: '/pixel_war.php',
    hint: tr('Choisissez une couleur, visez une case : un pixel toutes les trente secondes. Il faut être connecté au site pour poser.', 'Pick a colour, aim at a cell: one pixel every thirty seconds. You must be signed in to the site to place one.'),
    kicker: tr('PONT PRINCIPAL · SALLE DE LA PIXEL WAR', 'MAIN DECK · PIXEL WAR ROOM') },
}

/** Fenêtre des jeux du site et de la carte galactique EDGIS ; elle accueille aussi le Comptoir des Cartes Dangereuses et le plan du vaisseau (cf. openPanel). */
export class GameEmbed {
  private root = document.createElement('section')
  private frame = document.createElement('iframe')
  private title = document.createElement('h2')
  private kicker = document.createElement('small')
  private hint = document.createElement('p')
  private link = document.createElement('a')
  private previousFocus: HTMLElement | null = null
  private typed = false
  private panel: HTMLElement | null = null
  private onClose: (() => void) | null = null
  private skin = ''

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
    this.setPanel(null)
    this.frame.src = def.url
    this.frame.title = def.title
    this.root.hidden = false
    this.root.querySelector<HTMLButtonElement>('button')?.focus()
  }
  /**
   * Ouvre la fenêtre sur un panneau du jeu, à la place d'une page du site (le Comptoir des Cartes
   * Dangereuses, cf. src/cards/panel.ts) ; `onClose` : prévenu quand elle se referme.
   */
  openPanel(o: { kicker: string; title: string; hint: string; body: HTMLElement; onClose?: () => void; bare?: boolean; skin?: string }) {
    if (!this.isOpen) this.previousFocus = document.activeElement as HTMLElement
    this.title.textContent = o.title
    this.kicker.textContent = o.kicker
    this.hint.textContent = o.hint
    this.typed = false
    this.frame.removeAttribute('src')
    this.setPanel(o.body)
    this.onClose = o.onClose ?? null
    // `bare` : le panneau porte son propre en-tête et son bouton de fermeture.
    this.root.classList.toggle('bar-game-bare', !!o.bare)
    // `skin` : une classe de plus sur la fenêtre, pour un panneau qui a son propre habillage.
    this.skin = o.skin ?? ''
    if (this.skin) this.root.classList.add(this.skin)
    this.root.setAttribute('aria-label', o.title)
    this.root.hidden = false
    ;(o.bare ? o.body.querySelector<HTMLElement>('[data-autofocus]') : this.root.querySelector<HTMLButtonElement>('button'))?.focus()
  }
  /** Le panneau à la place de la page : le lien « ouvrir dans un onglet » n'a alors pas de sens. */
  private setPanel(body: HTMLElement | null) {
    this.panel?.remove()
    if (this.skin) this.root.classList.remove(this.skin)
    this.skin = ''
    this.onClose?.()
    this.onClose = null
    this.panel = body
    this.frame.hidden = !!body
    this.link.hidden = !!body
    this.root.classList.toggle('bar-game-panel', !!body)
    if (!body) {
      this.root.classList.remove('bar-game-bare')
      this.root.removeAttribute('aria-label')
    }
    if (body) this.frame.after(body)
  }
  close() {
    if (!this.isOpen) return
    this.root.hidden = true
    this.frame.removeAttribute('src') // arrête le jeu et libère sa connexion réseau
    this.setPanel(null)
    this.previousFocus?.focus()
  }
}
