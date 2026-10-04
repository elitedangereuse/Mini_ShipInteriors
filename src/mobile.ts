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
      enter.textContent = tr('Reprendre en plein écran', 'Resume fullscreen')
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
        else notice = tr('Le plein écran est indisponible dans ce navigateur. Le jeu utilise tout l’espace disponible.', 'Fullscreen is unavailable in this browser. The game uses all available space.')
      }
    } catch {
      notice = tr('Le navigateur a refusé le plein écran. Vous pouvez le réessayer avec le bouton ⛶.', 'The browser refused fullscreen. You can retry with the ⛶ button.')
    }
    try { await orientation?.lock?.('landscape') } catch { /* The rotation card remains until the device is landscape. */ }
    started = true
    entering = false
    enter.disabled = false
    status.textContent = notice
    status.hidden = !notice
    sync()
    if (notice && entry.hidden) {
      const toast = document.createElement('div')
      toast.className = 'mobile-notice'
      toast.setAttribute('role', 'status')
      toast.textContent = notice
      document.body.append(toast)
      setTimeout(() => toast.remove(), 7000)
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
  const labels: Record<string, string> = {
    'rot-left': tr('Pivoter à gauche', 'Rotate left'), 'rot-right': tr('Pivoter à droite', 'Rotate right'),
    'zoom-in': tr('Zoom avant', 'Zoom in'), 'zoom-out': tr('Zoom arrière', 'Zoom out'),
    'photo-toggle': tr('Mode photo', 'Photo mode'), 'auto-sprint': tr('Sprint auto', 'Auto-sprint'),
    'light-mode': tr('Mode léger', 'Light mode'), 'help-toggle': tr('Aide', 'Help'),
  }
  for (const [id, label] of Object.entries(labels)) {
    const button = $(id)
    const text = document.createElement('span')
    text.textContent = label
    button.append(text)
    menu.append(button)
    if (id === 'photo-toggle' || id === 'help-toggle') button.addEventListener('click', () => menuState(false))
  }
  const volume = document.createElement('label')
  volume.className = 'mobile-volume'
  volume.append(document.createTextNode(tr('Volume', 'Volume')), $('volume'))
  menu.append(volume)
  buttons.append(toggle)
  document.querySelector('.top-right')!.append(menu)
  toggle.onclick = () => { details(false); menuState(menu.hidden === true) }
  detailsToggle.onclick = () => { menuState(false); details(!left.classList.contains('details-open')) }
  document.querySelector('.ph-tab')?.addEventListener('click', () => details(false))
  addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Node)) return
    if (!left.contains(e.target)) details(false)
    if (!menu.contains(e.target) && !toggle.contains(e.target)) menuState(false)
  })
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!menu.hidden) { menuState(false); toggle.focus(); e.stopImmediatePropagation() }
    if (left.classList.contains('details-open')) { details(false); detailsToggle.focus(); e.stopImmediatePropagation() }
  }, { capture: true })
  return sync
}
