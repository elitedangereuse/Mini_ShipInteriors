import { fetchBoard, localBest, saveLocalBest, submitScore } from './arcade/scores'
import { formatCredits } from './economy/data'
import type { Wallet } from './economy/wallet'
import { tr } from './i18n'
import type { Bubbles, Dialog } from './ui'

export type Sport = 'gym-run' | 'gym-bike' | 'gym-punch'

const TITLES: Record<Sport, string> = {
  'gym-run': tr('Tapis de course', 'Treadmill'),
  'gym-bike': tr('Vélo', 'Bike'),
  'gym-punch': tr('Sac de frappe', 'Punching bag'),
}
const KEYS: Record<Sport, string[]> = {
  'gym-run': ['ArrowLeft', 'ArrowRight'],
  'gym-bike': ['ArrowUp', 'ArrowDown'],
  'gym-punch': ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'],
}
const ARROWS: Record<string, string> = {
  ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓',
}
const DIRECTION: Record<string, string> = {
  ArrowLeft: 'ArrowLeft', ArrowUp: 'ArrowUp', ArrowRight: 'ArrowRight', ArrowDown: 'ArrowDown',
  KeyA: 'ArrowLeft', KeyW: 'ArrowUp', KeyD: 'ArrowRight', KeyS: 'ArrowDown',
}

interface Session {
  id: Sport
  score: number
  best: number
  started: number
  introUntil: number
  expected: string
  due: number
  interval: number
  root: HTMLElement
  cue: HTMLElement
  status: HTMLElement
  scoreEl: HTMLElement
  progress: HTMLElement
  bestEl: HTMLElement
}

/** Mini-jeu affiché à la tête du joueur, pendant que le vaisseau continue à vivre. */
export class GymGame {
  private session?: Session
  private revision = 0

  constructor(private bubbles: Bubbles, private dialog: Dialog, private wallet: Wallet, private onEnd: () => void) {}

  get active() { return !!this.session }
  stop() { this.finish(tr('Séance interrompue.', 'Session interrupted.')) }

  start(id: Sport) {
    if (this.session) this.finish(tr('Séance interrompue.', 'Session interrupted.'))
    const revision = ++this.revision
    const root = document.createElement('div')
    root.className = 'gym-overlay'
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', TITLES[id])
    const title = document.createElement('strong'); title.textContent = TITLES[id]
    const cue = document.createElement('div'); cue.className = 'gym-cue'
    const status = document.createElement('div'); status.className = 'gym-status'
    const progress = document.createElement('div'); progress.className = 'gym-progress'
    const scoreEl = document.createElement('strong'); scoreEl.className = 'gym-score'
    const bestEl = document.createElement('span'); bestEl.className = 'gym-best'
    const controls = document.createElement('div'); controls.className = 'gym-controls'
    for (const key of KEYS[id]) {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = ARROWS[key]
      button.setAttribute('aria-label', `${tr('Appuyer sur', 'Press')} ${ARROWS[key]}`)
      button.onpointerdown = e => { e.preventDefault(); this.press(key) }
      controls.append(button)
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'gym-cancel'; cancel.textContent = '×'
    cancel.setAttribute('aria-label', tr('Arrêter la séance', 'Stop session'))
    cancel.onclick = () => this.finish(tr('Séance interrompue.', 'Session interrupted.'))
    root.append(title, cancel, cue, status, progress, scoreEl, bestEl, controls)
    this.bubbles.overlay('gym', root)
    const now = performance.now()
    const best = localBest(id)
    this.session = { id, score: 0, best, started: 0, introUntil: now + 3200, expected: '', due: 0, interval: 1200, root, cue, status, scoreEl, progress, bestEl }
    this.dialog.show(tr(
      `${TITLES[id]} : attendez « Frappez ! », puis pressez la flèche affichée. Une erreur, une frappe trop tôt ou un retard termine la séance. Échap pour arrêter.`,
      `${TITLES[id]}: wait for “Press!”, then press the shown arrow. A wrong, early or late press ends the session. Escape to stop.`,
    ))
    this.update(now)
    void fetchBoard(id).then(board => {
      if (revision !== this.revision || this.session?.id !== id) return
      if (board?.me) this.session.best = Math.max(this.session.best, board.me.score)
      this.update(performance.now())
    })
  }

  key(e: KeyboardEvent): boolean {
    if (!this.session) return false
    if (e.code === 'Tab') return false
    e.preventDefault()
    if (e.code === 'Escape') this.finish(tr('Séance interrompue.', 'Session interrupted.'))
    else if (!e.repeat && DIRECTION[e.code]) this.press(DIRECTION[e.code])
    return true
  }

  update(now = performance.now()) {
    const s = this.session
    if (!s) return
    s.scoreEl.textContent = `${s.score} ${tr('pts', 'pts')}`
    s.bestEl.textContent = `${tr('Record', 'Best')} ${s.best}`
    if (!s.started) {
      s.cue.textContent = String(Math.max(1, Math.ceil((s.introUntil - now) / 1000)))
      s.status.textContent = tr('Préparez-vous', 'Get ready')
      s.progress.style.setProperty('--fill', `${Math.max(0, 1 - (s.introUntil - now) / 3200) * 100}%`)
      if (now >= s.introUntil) { s.started = now; this.nextCue(now) }
      return
    }
    if (now > s.due) { this.finish(tr('Trop tard !', 'Too late!')); return }
    const ready = now >= s.due - s.interval * 0.55
    s.root.classList.toggle('ready', ready)
    s.cue.textContent = ARROWS[s.expected]
    s.status.textContent = ready ? tr('Frappez !', 'Press!') : tr('Attendez…', 'Wait…')
    s.progress.style.setProperty('--fill', `${(1 - (s.due - now) / s.interval) * 100}%`)
  }

  private nextCue(now: number) {
    const s = this.session!
    const keys = KEYS[s.id]
    s.expected = keys[s.id === 'gym-punch' ? Math.floor(Math.random() * keys.length) : s.score / 100 % keys.length]!
    s.interval = Math.max(280, 1200 - s.score / 100 * 18)
    s.due = now + s.interval
    this.update(now)
  }

  private press(key: string) {
    const s = this.session
    if (!s || !s.started) return
    const now = performance.now()
    if (key !== s.expected) { this.finish(tr('Mauvaise touche !', 'Wrong key!')); return }
    if (now > s.due) { this.finish(tr('Trop tard !', 'Too late!')); return }
    if (now < s.due - s.interval * 0.55) { this.finish(tr('Trop tôt !', 'Too early!')); return }
    s.score = Math.min(99900, s.score + 100)
    if (s.score === 99900) this.finish(tr('Score maximal !', 'Maximum score!'))
    else this.nextCue(now)
  }

  private finish(reason: string) {
    const s = this.session
    if (!s) return
    this.session = undefined; const revision = ++this.revision
    this.bubbles.overlay('gym', null)
    this.onEnd()
    saveLocalBest(s.id, s.score)
    this.dialog.show(tr(`${reason} ${s.score} points. Réutilisez l’appareil pour rejouer.`, `${reason} ${s.score} points. Use the equipment again to replay.`))
    if (!s.score || !s.started) return
    void submitScore(s.id, s.score, 1, Math.max(1, Math.ceil((performance.now() - s.started) / 1000))).then(result => {
      if (result.kind === 'saved' && result.credits) this.wallet.arcade(result.credits)
      if (revision !== this.revision) return
      if (result.kind === 'saved') {
        const saved = result.best ? tr('Nouveau record personnel.', 'New personal best.') : tr('Score enregistré.', 'Score saved.')
        const earned = result.credits?.earned ?? 0
        this.dialog.show(earned > 0
          ? `${saved} +${formatCredits(earned)}.`
          : `${saved} ${tr('Aucun nouveau palier de crédits.', 'No new credit tier.')}`)
      } else if (result.kind === 'guest') this.dialog.show(tr('Connectez-vous au site pour enregistrer le record et gagner des crédits.', 'Sign in to save your best and earn credits.'))
      else this.dialog.show(tr('Site indisponible : record conservé sur cet appareil.', 'Site unavailable: best saved on this device.'))
    })
  }
}
