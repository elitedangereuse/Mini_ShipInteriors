import { icon } from '../icons'
import { $, nameTag } from '../ui'

/*
 * Barre de la cabine, en haut de l'écran, quand on est dans des quartiers : les siens (aménager,
 * inviter), ou ceux d'un autre CMDR (qui reçoit, repartir).
 */

export type CabinBarState =
  | { kind: 'own'; canEdit: boolean; canInvite: boolean; loginUrl?: string }
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
      actions.append(button('Aménager', 'paint-brush', () => this.onEdit?.(), 'B'))
      if (state.canInvite) actions.append(button('Inviter', 'user-plus', () => this.onInvite?.()))
    } else {
      title.append(icon('bed'), document.createTextNode('Vos quartiers'))
      const a = document.createElement('a')
      a.href = state.loginUrl ?? '/'
      a.textContent = 'Connectez-vous au site pour les aménager'
      actions.append(a)
    }
    this.el.append(title, actions)
  }
}

// ---------------------------------------------------------------- invitations

export interface CrewEntry {
  id: number
  name: string
  verified?: boolean
  /** free : on peut l'inviter · invited : invitation envoyée · visiting : dans nos quartiers. */
  state: 'free' | 'invited' | 'visiting'
}

/** Liste des membres d'équipage : les inviter dans ses quartiers, ou raccompagner ses visiteurs. */
export class InviteMenu {
  private el = $('invite-menu')
  onInvite?: (id: number) => void
  onKick?: (id: number) => void

  get isOpen(): boolean {
    return !this.el.hidden
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.el.contains(target)
  }

  open(crew: CrewEntry[]) {
    this.el.hidden = false
    this.render(crew)
  }

  close() {
    this.el.hidden = true
  }

  /** Met la liste à jour si elle est ouverte (arrivées, départs, visites). */
  refresh(crew: CrewEntry[]) {
    if (this.isOpen) this.render(crew)
  }

  private render(crew: CrewEntry[]) {
    this.el.replaceChildren()
    const section = (title: string, list: CrewEntry[], action: (c: CrewEntry) => HTMLElement) => {
      if (!list.length) return
      const h = document.createElement('div')
      h.className = 'im-title'
      h.textContent = title
      this.el.appendChild(h)
      for (const c of list) {
        const row = document.createElement('div')
        row.className = 'im-row'
        const name = document.createElement('span')
        name.className = 'im-name'
        name.append(nameTag(c.name, c.verified))
        row.append(name, action(c))
        this.el.appendChild(row)
      }
    }
    const button = (label: string, glyph: Parameters<typeof icon>[0], onClick: () => void, disabled = false) => {
      const b = document.createElement('button')
      b.append(icon(glyph), document.createTextNode(label))
      b.disabled = disabled
      b.onclick = onClick
      return b
    }
    section('Dans vos quartiers', crew.filter((c) => c.state === 'visiting'), (c) => button('Raccompagner', 'sign-out', () => this.onKick?.(c.id)))
    section('Inviter dans vos quartiers', crew.filter((c) => c.state !== 'visiting'), (c) =>
      c.state === 'invited' ? button('Invité', 'check', () => {}, true) : button('Inviter', 'envelope-simple', () => this.onInvite?.(c.id)),
    )
    if (!crew.length) {
      const empty = document.createElement('div')
      empty.className = 'im-empty'
      empty.textContent = 'Personne d\'autre à bord pour l\'instant.'
      this.el.appendChild(empty)
    }
  }
}

/** Invitations reçues : rejoindre les quartiers d'un CMDR, ou décliner. Chacune vaut une minute. */
export class InviteToasts {
  private el = $('invites')
  private toasts = new Map<number, { el: HTMLElement; timer: number }>()
  onAccept?: (id: number, name: string) => void
  onDecline?: (id: number) => void

  add(id: number, name: string, verified?: boolean) {
    this.remove(id)
    const el = document.createElement('div')
    el.className = 'panel invite-toast'
    const text = document.createElement('div')
    text.className = 'it-text'
    const who = document.createElement('strong')
    who.append(nameTag(name, verified))
    text.append(icon('envelope-simple', 'it-icon'), who, document.createTextNode(' vous invite dans ses quartiers.'))
    const actions = document.createElement('div')
    actions.className = 'it-actions'
    const join = document.createElement('button')
    join.className = 'it-join'
    join.append(icon('door-open'), document.createTextNode('Rejoindre'))
    join.onclick = () => {
      this.remove(id)
      this.onAccept?.(id, name)
    }
    const no = document.createElement('button')
    no.textContent = 'Non merci'
    no.onclick = () => {
      this.remove(id)
      this.onDecline?.(id)
    }
    actions.append(join, no)
    const bar = document.createElement('div')
    bar.className = 'it-timer'
    el.append(text, actions, bar)
    this.el.prepend(el)
    // Trois invitations au plus à l'écran : la plus ancienne s'efface.
    while (this.toasts.size >= 3) this.remove(this.toasts.keys().next().value!)
    this.toasts.set(id, { el, timer: window.setTimeout(() => this.remove(id), 60000) })
  }

  remove(id: number) {
    const t = this.toasts.get(id)
    if (!t) return
    clearTimeout(t.timer)
    t.el.remove()
    this.toasts.delete(id)
  }

  clear() {
    for (const id of [...this.toasts.keys()]) this.remove(id)
  }
}
