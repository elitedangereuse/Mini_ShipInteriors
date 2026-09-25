import { icon } from '../icons'
import { $ } from '../ui'

/*
 * Barre de la cabine, en haut de l'écran, quand on est dans des quartiers : les siens (aménager,
 * inviter), ou ceux d'un autre CMDR (qui reçoit, repartir).
 */

export type CabinBarState =
  | { kind: 'own'; canEdit: boolean; loginUrl?: string }
  | { kind: 'visit'; host: string }
  | null

export class CabinBar {
  private el = $('cabin-bar')
  private key = ''
  onEdit?: () => void
  onInvite?: () => void
  onLeave?: () => void

  set(state: CabinBarState) {
    const key = JSON.stringify(state)
    if (key === this.key) return
    this.key = key
    this.el.hidden = !state
    this.el.replaceChildren()
    if (!state) return
    const title = document.createElement('div')
    title.className = 'cb-title'
    const actions = document.createElement('div')
    actions.className = 'cb-actions'
    const button = (label: string, glyph: Parameters<typeof icon>[0], onClick: () => void, hotkey?: string) => {
      const b = document.createElement('button')
      b.append(icon(glyph), document.createTextNode(label))
      if (hotkey) {
        const k = document.createElement('kbd')
        k.textContent = hotkey
        b.append(k)
      }
      b.onclick = onClick
      return b
    }
    if (state.kind === 'visit') {
      title.append(icon('door-open'), document.createTextNode(`Quartiers de ${state.host}`))
      actions.append(button('Rentrer chez moi', 'sign-out', () => this.onLeave?.()))
    } else if (state.canEdit) {
      title.append(icon('bed'), document.createTextNode('Vos quartiers'))
      actions.append(button('Aménager', 'paint-brush', () => this.onEdit?.(), 'B'), button('Inviter', 'user-plus', () => this.onInvite?.()))
    } else {
      title.append(icon('bed'), document.createTextNode('Vos quartiers'))
      const a = document.createElement('a')
      a.href = state.loginUrl ?? '/'
      a.textContent = 'Connectez-vous au site pour les aménager'
      actions.append(a)
    }
    this.el.append(title, actions)
  }

  /** Bouton « Inviter » (pour y ancrer la liste des joueurs). */
  get inviteButton(): HTMLElement | null {
    return this.el.querySelectorAll('button')[1] ?? null
  }
}
