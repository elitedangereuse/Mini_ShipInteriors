import { EN, tr } from '../i18n'
import { $ } from '../ui'
import { ECONOMY, formatCredits } from './data'
import type { Wallet } from './wallet'

/*
 * Crédits dans le HUD : le solde du CMDR sous son nom (il défile jusqu'à sa nouvelle valeur),
 * les gains qui s'en envolent, et le nombre de tâches de bord sur le pont où l'on se trouve.
 */

export class CreditsHud {
  private readonly el = $('credits')
  private readonly value = $('credits-value')
  private readonly tasksEl = $('tasks-here')
  /** Valeur affichée, qui rejoint le solde en quelques dixièmes de seconde. */
  private shown = 0
  private target = 0
  private first = true
  private tasksText = ''

  constructor(private readonly wallet: Wallet) {
    this.el.title = tr(
      `Crédits de votre compte Élite Dangereuse. Revenu passif : ${formatCredits(ECONOMY.passive.perMinute)} par minute à bord ; les tâches de bord et les records des bornes d'arcade rapportent davantage.`,
      `Credits on your Élite Dangereuse account. Passive income: ${formatCredits(ECONOMY.passive.perMinute)} per minute aboard; ship chores and arcade high scores pay more.`,
    )
    wallet.subscribe(() => this.render())
    this.render()
  }

  private render() {
    const w = this.wallet
    this.el.hidden = w.state === 'guest' || (w.state === 'loading' && this.first)
    this.el.classList.toggle('offline', w.state === 'offline')
    if (w.state === 'offline' && this.first) {
      this.value.textContent = tr('Crédits indisponibles', 'Credits unavailable')
      return
    }
    if (w.state !== 'ready') return
    this.target = w.balance
    if (this.first) {
      this.first = false
      this.shown = w.balance
      this.value.textContent = formatCredits(w.balance)
    }
  }

  /** Gain : il s'envole de la pastille (discret pour le revenu passif). */
  gain(amount: number, quiet = false) {
    const pop = document.createElement('span')
    pop.className = quiet ? 'cr-gain quiet' : 'cr-gain'
    pop.textContent = `+${formatCredits(amount)}`
    this.el.append(pop)
    pop.addEventListener('animationend', () => pop.remove())
  }

  /** Tâches de bord sur ce pont (0 : la ligne se cache). */
  setTasks(here: number) {
    const text = !here ? '' : EN ? `${here} chore${here > 1 ? 's' : ''} on this deck` : `${here} tâche${here > 1 ? 's' : ''} sur ce pont`
    if (text === this.tasksText) return
    this.tasksText = text
    this.tasksEl.hidden = !here
    this.tasksEl.lastChild!.textContent = text
  }

  /** Le solde affiché défile jusqu'au vrai (appelé à chaque image). */
  update(dt: number) {
    if (this.shown === this.target) return
    const step = Math.max(1, Math.abs(this.target - this.shown) * Math.min(1, dt * 8))
    this.shown = this.shown < this.target ? Math.min(this.target, this.shown + step) : Math.max(this.target, this.shown - step)
    this.value.textContent = formatCredits(this.shown)
  }
}
