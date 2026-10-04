import { tr } from '../i18n'
import { icon } from '../icons'
import { $, nameTag } from '../ui'

/*
 * Barre de la cabine, en haut de l'écran, quand on est dans des quartiers : les siens (aménager,
 * ouvrir), ou ceux d'un autre CMDR (qui reçoit, repartir), et tant que dure la visite, même dans
 * la coursive. Inviter, visiter, sonner : c'est le combiné de bord (cf. crew/phone.ts).
 */

export type CabinBarState =
  /** `open` : quartiers ouverts ou sur invitation (housing v2, absent : pas de bascule). */
  /** `garden` : le mode jardinage est ouvert (absent : pas de tuile de terre débloquée, pas de bouton). */
  | { kind: 'own'; canEdit: boolean; loginUrl?: string; open?: boolean; garden?: boolean }
  | { kind: 'visit'; host: string; inside: boolean }
  | null

export class CabinBar {
  private el = $('cabin-bar')
  private key = ''
  onEdit?: () => void
  /** Sortir ou ranger les outils de jardinage (cf. gardening/mode.ts). */
  onGarden?: () => void
  onLeave?: () => void
  /** Ouvrir ou fermer ses quartiers (housing v2). */
  onToggleOpen?: () => void

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
      title.append(icon('door-open'), document.createTextNode(state.inside ? tr(`Quartiers de ${state.host}`, `${state.host}'s quarters`) : tr(`En visite chez ${state.host}`, `Visiting ${state.host}`)))
      actions.append(button(tr('Rentrer chez moi', 'Go home'), 'sign-out', () => this.onLeave?.()))
    } else if (state.canEdit) {
      title.append(icon('bed'), document.createTextNode(tr('Vos quartiers', 'Your quarters')))
      actions.append(button(tr('Aménager', 'Decorate'), 'paint-brush', () => this.onEdit?.(), 'B'))
      if (state.garden !== undefined) {
        const b = button(state.garden ? tr('Ranger les outils', 'Put tools away') : tr('Jardiner', 'Garden'), 'shovel', () => this.onGarden?.(), 'G')
        b.classList.toggle('cb-open', state.garden)
        actions.append(b)
      }
      if (state.open !== undefined) {
        const b = button(state.open ? tr('Ouverts', 'Open') : tr('Sur invitation', 'Invite only'), state.open ? 'lock-simple-open' : 'lock-simple', () => this.onToggleOpen?.())
        b.classList.toggle('cb-open', state.open)
        b.title = state.open
          ? tr('Quartiers ouverts : chacun peut venir les visiter. Cliquer pour les réserver aux invités.', 'Open quarters: anyone can drop by. Click to make them invite-only.')
          : tr('Quartiers sur invitation. Cliquer pour les ouvrir : chacun pourra venir les visiter.', 'Invite-only quarters. Click to open them: anyone will be able to drop by.')
        actions.append(b)
      }
    } else {
      title.append(icon('bed'), document.createTextNode(tr('Vos quartiers', 'Your quarters')))
      const a = document.createElement('a')
      a.href = state.loginUrl ?? '/'
      a.textContent = tr('Connectez-vous au site pour les aménager', 'Log in to the site to decorate them')
      actions.append(a)
    }
    this.el.append(title, actions)
  }
}

// ---------------------------------------------------------------- invitations

/**
 * Invitations reçues (rejoindre les quartiers d'un CMDR, ou décliner) et coups de sonnette (`ring` :
 * quelqu'un demande à entrer chez nous, lui ouvrir ou non). Chacun vaut une minute.
 */
export class InviteToasts {
  private el = $('invites')
  private toasts = new Map<string, { el: HTMLElement; timer: number }>()
  onAccept?: (id: number, name: string) => void
  onDecline?: (id: number) => void
  /** On ouvre à celui qui a sonné. */
  onOpenDoor?: (id: number) => void

  add(id: number, name: string, verified?: boolean, ring = false) {
    const key = `${ring ? 'r' : 'i'}${id}`
    this.drop(key)
    const el = document.createElement('div')
    el.className = 'panel invite-toast'
    const text = document.createElement('div')
    text.className = 'it-text'
    const who = document.createElement('strong')
    who.append(nameTag(name, verified))
    text.append(
      icon(ring ? 'bell-ringing' : 'envelope-simple', 'it-icon'),
      who,
      document.createTextNode(ring ? tr(' sonne à la porte de vos quartiers.', ' is ringing at your quarters.') : tr(' vous invite dans ses quartiers.', ' invites you to their quarters.')),
    )
    const actions = document.createElement('div')
    actions.className = 'it-actions'
    const join = document.createElement('button')
    join.className = 'it-join'
    join.append(icon('door-open'), document.createTextNode(ring ? tr('Ouvrir', 'Let in') : tr('Rejoindre', 'Join')))
    join.onclick = () => {
      this.drop(key)
      if (ring) this.onOpenDoor?.(id)
      else this.onAccept?.(id, name)
    }
    const no = document.createElement('button')
    no.textContent = ring ? tr('Ignorer', 'Ignore') : tr('Non merci', 'No thanks')
    no.onclick = () => {
      this.drop(key)
      if (!ring) this.onDecline?.(id)
    }
    actions.append(join, no)
    const bar = document.createElement('div')
    bar.className = 'it-timer'
    el.append(text, actions, bar)
    this.el.prepend(el)
    // Trois au plus à l'écran : la plus ancienne s'efface.
    while (this.toasts.size >= 3) this.drop(this.toasts.keys().next().value!)
    this.toasts.set(key, { el, timer: window.setTimeout(() => this.drop(key), 60000) })
  }

  /** Ce joueur n'a plus rien à nous demander (parti, entré) : son invitation et sa sonnette s'effacent. */
  remove(id: number) {
    this.drop(`i${id}`)
    this.drop(`r${id}`)
  }

  private drop(key: string) {
    const t = this.toasts.get(key)
    if (!t) return
    clearTimeout(t.timer)
    t.el.remove()
    this.toasts.delete(key)
  }

  clear() {
    for (const key of [...this.toasts.keys()]) this.drop(key)
  }
}
