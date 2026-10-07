import { tr } from './i18n'
import { icon } from './icons'
import { $ } from './ui'

/** Mobile shell: keep the original controls and their handlers, including live pressed states. */
export function setupMobile(enabled: boolean): () => void {
  if (!enabled) return () => {}
  let started = false
  let entering = false
  const entry = $('mobile-entry')
  const enter = $('mobile-enter') as HTMLButtonElement
  const fullscreen = $('mobile-fullscreen') as HTMLButtonElement
  const status = $('mobile-entry-status')
  const landscape = matchMedia('(orientation: landscape)')
  const orientation = screen.orientation as (ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> }) | undefined
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void }
  const isFullscreen = () => !!(document.fullscreenElement || doc.webkitFullscreenElement)
  // L'iPhone n'a pas de plein écran pour les pages : on n'y propose rien qui ne marcherait pas, et
  // on indique l'écran d'accueil, seule façon d'y jouer sans les barres de Safari.
  const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen)
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!canFullscreen) {
    root.classList.add('no-fullscreen')
    enter.textContent = tr('Jouer', 'Play')
    $('mobile-entry-message').textContent = tr('Le jeu se joue en paysage.', 'The game plays in landscape.')
    if (!standalone) {
      status.textContent = tr('Pour jouer en plein écran : bouton Partager de Safari, puis « Sur l’écran d’accueil ».', 'To play fullscreen: Safari’s Share button, then “Add to Home Screen”.')
      status.hidden = false
    }
    // L'icône de l'écran d'accueil est celle du site (chemin absolu, hors du build du jeu).
    const touchIcon = document.createElement('link')
    touchIcon.rel = 'apple-touch-icon'
    touchIcon.href = '/assets/images/favicon.png'
    document.head.append(touchIcon)
  }

  const sync = () => {
    // CSS orientation remains landscape while a software keyboard reduces the viewport.
    const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
    entry.hidden = started && (landscape.matches || !!typing)
    fullscreen.setAttribute('aria-pressed', String(isFullscreen()))
    const label = isFullscreen() ? tr('Quitter le plein écran', 'Exit fullscreen') : tr('Plein écran paysage', 'Landscape fullscreen')
    fullscreen.title = label
    fullscreen.setAttribute('aria-label', label)
    if (started && !entry.hidden) {
      $('mobile-entry-message').textContent = tr('Tournez votre téléphone en paysage pour continuer.', 'Rotate your phone to landscape to continue.')
      // Sans plein écran à reprendre, il n'y a qu'à tourner le téléphone.
      if (canFullscreen) enter.textContent = tr('Reprendre en plein écran', 'Resume fullscreen')
      else enter.hidden = true
    }
  }
  const start = async () => {
    if (entering) return
    entering = true
    enter.disabled = true
    let notice = ''
    try {
      // The fullscreen request must be issued directly from the click, before any await.
      if (!isFullscreen()) {
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' })
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen()
      }
    } catch {
      notice = tr('Le navigateur a refusé le plein écran. Vous pouvez le réessayer avec le bouton ⛶.', 'The browser refused fullscreen. You can retry with the ⛶ button.')
    }
    try { await orientation?.lock?.('landscape') } catch { /* The rotation card remains until the device is landscape. */ }
    started = true
    entering = false
    enter.disabled = false
    if (canFullscreen) {
      status.textContent = notice
      status.hidden = !notice
    }
    sync()
    if (notice && entry.hidden) {
      const toast = document.createElement('div')
      toast.className = 'mobile-notice'
      toast.setAttribute('role', 'status')
      toast.textContent = notice
      document.body.append(toast)
      setTimeout(() => toast.remove(), 5000)
    }
  }
  enter.onclick = () => void start()
  fullscreen.onclick = async () => {
    if (!isFullscreen()) { void start(); return }
    try {
      if (document.exitFullscreen) await document.exitFullscreen()
      else await doc.webkitExitFullscreen?.()
    } catch { /* Keep the game usable if the browser refuses to exit. */ }
    sync()
  }
  const fullscreenChanged = () => {
    if (!isFullscreen()) orientation?.unlock?.()
    sync()
  }
  document.addEventListener('fullscreenchange', fullscreenChanged)
  document.addEventListener('webkitfullscreenchange', fullscreenChanged)
  landscape.addEventListener('change', sync)
  addEventListener('resize', sync)
  addEventListener('orientationchange', sync)

  const left = document.querySelector<HTMLElement>('.top-left')!
  const ship = document.querySelector<HTMLElement>('.ship-status')!
  const detailsToggle = document.createElement('button')
  detailsToggle.className = 'mobile-status-toggle'
  detailsToggle.setAttribute('aria-label', tr('Informations du vaisseau et quartiers', 'Ship and quarters information'))
  detailsToggle.setAttribute('aria-expanded', 'false')
  detailsToggle.append(icon('info'))
  ship.append(detailsToggle)
  const details = (open: boolean) => {
    left.classList.toggle('details-open', open)
    detailsToggle.setAttribute('aria-expanded', String(open))
  }

  const buttons = document.querySelector<HTMLElement>('.top-right .buttons')!
  const menu = document.createElement('div')
  menu.id = 'mobile-tools'
  menu.className = 'panel buttons mobile-tools'
  menu.hidden = true
  const toggle = document.createElement('button')
  toggle.id = 'mobile-menu-toggle'
  toggle.textContent = '☰'
  toggle.title = tr('Commandes et réglages', 'Controls and settings')
  toggle.setAttribute('aria-label', toggle.title)
  toggle.setAttribute('aria-controls', menu.id)
  toggle.setAttribute('aria-expanded', 'false')
  const menuState = (open: boolean) => {
    menu.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }
  // Le zoom se fait en pinçant : seuls les quarts de tour, qui ramènent la vue isométrique, restent ici.
  const labels: Record<string, string> = {
    'rot-left': tr('Pivoter à gauche', 'Rotate left'), 'rot-right': tr('Pivoter à droite', 'Rotate right'),
    'photo-toggle': tr('Mode photo', 'Photo mode'), 'auto-sprint': tr('Toujours courir', 'Always run'),
    'light-mode': tr('Mode léger', 'Light mode'), 'help-toggle': tr('Aide', 'Help'),
    'about-toggle': tr('À propos', 'About'),
  }
  for (const [id, label] of Object.entries(labels)) {
    const button = $(id)
    const text = document.createElement('span')
    text.textContent = label
    button.append(text)
    menu.append(button)
    if (id === 'photo-toggle' || id === 'help-toggle' || id === 'about-toggle') button.addEventListener('click', () => menuState(false))
  }
  const volume = document.createElement('label')
  volume.className = 'mobile-volume'
  volume.append(document.createTextNode(tr('Volume', 'Volume')), $('volume'))
  // Quitter le jeu se range au fond du menu : hors de portée d'un pouce qui visait le son.
  menu.append(volume, $('back-to-site'))

  // Chat replié en un bouton : le champ ne s'ouvre, en haut de l'écran (au-dessus du clavier), que
  // pour écrire.
  const chat = $('chat')
  const chatInput = $<HTMLInputElement>('chat-input')
  const chatToggle = document.createElement('button')
  chatToggle.id = 'mobile-chat-toggle'
  chatToggle.type = 'button'
  chatToggle.title = tr('Discuter', 'Chat')
  chatToggle.setAttribute('aria-label', chatToggle.title)
  chatToggle.append(icon('chat-circle-dots'))
  chat.append(chatToggle)
  chatInput.placeholder = tr('Message…', 'Message…')
  chatInput.enterKeyHint = 'send'
  chatToggle.onclick = () => {
    // Le champ doit être visible avant le focus, et le focus venir du toucher : sinon pas de clavier.
    chat.classList.add('open')
    chatInput.focus()
  }
  chatInput.addEventListener('blur', () => chat.classList.remove('open'))
  buttons.append(toggle)
  document.querySelector('.top-right')!.append(menu)
  toggle.onclick = () => { details(false); menuState(menu.hidden === true) }
  detailsToggle.onclick = () => { menuState(false); details(!left.classList.contains('details-open')) }
  document.querySelector('.ph-tab')?.addEventListener('click', () => details(false))
  addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Node)) return
    if (!left.contains(e.target)) details(false)
    if (!menu.contains(e.target) && !toggle.contains(e.target)) menuState(false)
    const help = $('help')
    if (!help.hidden && !help.contains(e.target) && !$('help-toggle').contains(e.target)) help.hidden = true
    const about = $('about')
    if (!about.hidden && !about.contains(e.target) && !$('about-toggle').contains(e.target)) $('about-toggle').click()
  })
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!menu.hidden) { menuState(false); toggle.focus(); e.stopImmediatePropagation() }
    if (left.classList.contains('details-open')) { details(false); detailsToggle.focus(); e.stopImmediatePropagation() }
  }, { capture: true })
  return sync
}
