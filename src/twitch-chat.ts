import { tr } from './i18n'
import { icon } from './icons'
import { chatMessage, parseIrc, type ChatMessage } from '../shared/twitch-irc.js'

const ENDPOINT = '/outils/mini-shipinteriors-twitch.php'
/** Messages gardés à l'écran. */
const MAX_ROWS = 150
/** En développement, `?twitch=<chaîne>` ouvre le chat d'une autre chaîne, sans attendre un direct. */
const DEV_CHANNEL = import.meta.env.DEV ? new URLSearchParams(location.search).get('twitch') : null

interface Account { cmdr: boolean; linked: boolean; name: string }

/**
 * Chat flottant du direct Twitch, dans le cinéma. Tout le monde le lit : le jeu écoute le chat en
 * anonyme (IRC de Twitch sur WebSocket). Pour y écrire, un CMDR lie son compte Twitch au site, qui
 * garde ses jetons et poste en son nom (cf. outils/mini-shipinteriors-twitch.php).
 */
export class TwitchChat {
  private root = document.createElement('section')
  private log = document.createElement('div')
  private foot = document.createElement('div')
  private form = document.createElement('form')
  private input = document.createElement('input')
  private sendButton = document.createElement('button')
  private linkButton = document.createElement('button')
  private accountLine = document.createElement('p')
  private note = document.createElement('p')
  /** Chaîne écoutée ; null : le chat est fermé. */
  private channel: string | null = null
  private socket: WebSocket | null = null
  private retry = 0
  /** null : le site n'a pas répondu, le chat reste en lecture seule. */
  private account: Account | null = null
  private sending = false

  constructor() {
    this.root.className = 'twitch-chat'
    this.root.hidden = true
    this.root.setAttribute('aria-label', tr('Chat du direct Twitch', 'Twitch live chat'))
    const header = document.createElement('header')
    header.className = 'twitch-chat-header'
    const title = document.createElement('strong')
    title.textContent = tr('CHAT DU DIRECT', 'LIVE CHAT')
    const fold = document.createElement('button')
    fold.type = 'button'
    const setFold = (folded: boolean) => {
      this.root.classList.toggle('twitch-chat-folded', folded)
      const label = folded ? tr('Déplier le chat', 'Expand chat') : tr('Replier le chat', 'Collapse chat')
      fold.replaceChildren(icon(folded ? 'caret-down' : 'caret-up'))
      fold.title = label
      fold.setAttribute('aria-label', label)
    }
    fold.onclick = () => setFold(!this.root.classList.contains('twitch-chat-folded'))
    setFold(false)
    header.append(icon('chat-circle-dots'), title, fold)
    this.drag(header)

    const body = document.createElement('div')
    body.className = 'twitch-chat-body'
    this.log.className = 'twitch-chat-log'
    this.log.dataset.empty = tr('En attente de messages…', 'Waiting for messages…')
    this.log.setAttribute('aria-live', 'polite')
    this.foot.className = 'twitch-chat-foot'
    this.form.className = 'twitch-chat-form'
    this.form.autocomplete = 'off'
    this.input.maxLength = 500
    this.input.placeholder = tr('Écrire dans le chat…', 'Send a message…')
    this.input.setAttribute('aria-label', tr('Message pour le chat Twitch', 'Message for the Twitch chat'))
    this.sendButton.type = 'submit'
    this.sendButton.title = tr('Envoyer', 'Send')
    this.sendButton.setAttribute('aria-label', tr('Envoyer', 'Send'))
    this.sendButton.append(icon('paper-plane-right'))
    this.form.append(this.input, this.sendButton)
    this.form.onsubmit = (event) => { event.preventDefault(); void this.send() }
    this.linkButton.type = 'button'
    this.linkButton.className = 'twitch-chat-link'
    this.linkButton.textContent = tr('Lier mon compte Twitch pour écrire', 'Link my Twitch account to chat')
    this.linkButton.onclick = () => this.link()
    this.accountLine.className = 'twitch-chat-account'
    this.note.className = 'twitch-chat-note'
    this.note.setAttribute('role', 'status')
    this.foot.append(this.form, this.linkButton, this.accountLine, this.note)
    body.append(this.log, this.foot)
    this.root.append(header, body)
    // Ni déplacement du personnage pendant la frappe, ni zoom de la caméra en faisant défiler.
    for (const type of ['keydown', 'keyup', 'wheel']) this.root.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
    this.input.addEventListener('keydown', (event) => { if (event.key === 'Escape') this.input.blur() })
    document.body.append(this.root)
    this.render()
    if (DEV_CHANNEL) this.show(null)
  }

  /**
   * Le chat n'existe que dans la salle, pendant un direct : celui de la chaîne projetée (`null`
   * le ferme). Ailleurs, on n'écoute plus Twitch.
   */
  show(channel: string | null) {
    channel = DEV_CHANNEL || channel
    if (channel === this.channel) return
    const opening = this.channel === null
    this.channel = channel
    this.root.hidden = channel === null
    clearTimeout(this.retry)
    const socket = this.socket
    this.socket = null
    socket?.close()
    // Les messages d'une autre chaîne, ou modérés pendant notre absence, ne restent pas.
    this.log.replaceChildren()
    this.say('')
    if (channel === null) return
    this.connect()
    if (opening) void this.refresh()
  }

  private drag(header: HTMLElement) {
    header.addEventListener('pointerdown', (down) => {
      if ((down.target as HTMLElement).closest('button')) return
      const box = this.root.getBoundingClientRect()
      const dx = down.clientX - box.left, dy = down.clientY - box.top
      header.setPointerCapture(down.pointerId)
      const move = (event: PointerEvent) => {
        this.root.style.right = 'auto'
        this.root.style.left = `${Math.max(0, Math.min(innerWidth - box.width, event.clientX - dx))}px`
        this.root.style.top = `${Math.max(0, Math.min(innerHeight - header.offsetHeight, event.clientY - dy))}px`
      }
      const stop = () => {
        header.removeEventListener('pointermove', move)
        header.removeEventListener('pointerup', stop)
        header.removeEventListener('pointercancel', stop)
      }
      header.addEventListener('pointermove', move)
      header.addEventListener('pointerup', stop)
      header.addEventListener('pointercancel', stop)
    })
  }

  private connect() {
    clearTimeout(this.retry)
    const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
    this.socket = socket
    socket.onopen = () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      // Un pseudo « justinfan » suivi de chiffres : la lecture anonyme prévue par Twitch.
      socket.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`)
      socket.send(`JOIN #${this.channel}`)
    }
    socket.onmessage = (event) => {
      for (const line of String(event.data).split('\r\n')) if (line) this.receive(line, socket)
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.channel) this.retry = window.setTimeout(() => this.connect(), 5000)
    }
  }

  private receive(line: string, socket: WebSocket) {
    const irc = parseIrc(line)
    if (!irc) return
    if (irc.command === 'PING') socket.send(`PONG :${irc.text}`)
    else if (irc.command === 'RECONNECT') socket.close()
    // Modération : tout le chat, les messages d'un spectateur, ou un seul message.
    else if (irc.command === 'CLEARCHAT') this.remove((row) => !irc.tags['target-user-id'] || row.dataset.user === irc.tags['target-user-id'])
    else if (irc.command === 'CLEARMSG') this.remove((row) => row.dataset.id === irc.tags['target-msg-id'])
    else {
      const message = chatMessage(irc)
      if (message) this.add(message)
    }
  }

  private remove(match: (row: HTMLElement) => boolean) {
    for (const row of [...this.log.children] as HTMLElement[]) if (match(row)) row.remove()
  }

  private add(message: ChatMessage) {
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40
    const row = document.createElement('div')
    row.className = 'twitch-chat-msg'
    row.dataset.id = message.id
    row.dataset.user = message.userId
    const name = document.createElement('b')
    name.textContent = message.name
    // Les couleurs sombres choisies sur Twitch restent lisibles sur le fond du jeu.
    if (message.color) name.style.color = `color-mix(in srgb, ${message.color} 62%, white)`
    const text = document.createElement(message.action ? 'i' : 'span')
    for (const part of message.parts) {
      if (!part.emote) { text.append(part.text); continue }
      const image = document.createElement('img')
      image.src = `https://static-cdn.jtvnw.net/emoticons/v2/${part.emote}/default/dark/1.0`
      image.alt = part.text
      image.title = part.text
      text.append(image)
    }
    row.append(name, text)
    this.log.append(row)
    while (this.log.children.length > MAX_ROWS) this.log.firstChild!.remove()
    if (atBottom) this.log.scrollTop = this.log.scrollHeight
  }

  private async request(body?: object): Promise<{ status?: string; error?: string; detail?: string; cmdr?: boolean; linked?: boolean; login?: string; name?: string } | null> {
    try {
      const response = await fetch(ENDPOINT, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) })
      return await response.json()
    } catch { return null }
  }

  private async refresh() {
    const reply = await this.request()
    this.account = reply?.status === 'success'
      ? { cmdr: reply.cmdr === true, linked: reply.linked === true, name: reply.name || reply.login || '' } : null
    this.render()
  }

  private render() {
    const { account } = this
    this.form.hidden = !account?.linked
    this.linkButton.hidden = !account?.cmdr || account.linked
    this.accountLine.replaceChildren()
    this.accountLine.hidden = !account || (account.cmdr && !account.linked)
    if (account?.linked) {
      const unlink = document.createElement('button')
      unlink.type = 'button'
      unlink.textContent = tr('Délier', 'Unlink')
      unlink.onclick = () => void this.unlink()
      this.accountLine.append(tr(`Vous écrivez en tant que ${account.name}`, `Chatting as ${account.name}`), unlink)
    } else if (account && !account.cmdr) {
      this.accountLine.textContent = tr('Connectez-vous à elitedangereuse.fr pour écrire dans le chat.', 'Sign in to elitedangereuse.fr to write in the chat.')
    }
    this.foot.hidden = !account
  }

  private say(text: string) { this.note.textContent = text }

  /** Twitch s'ouvre dans une fenêtre à part ; à sa fermeture, on redemande l'état au site. */
  private link() {
    const popup = window.open(`${ENDPOINT}?link=1`, 'msi-twitch', 'popup,width=520,height=760')
    if (!popup) return this.say(tr('Autorisez les fenêtres pop-up pour lier votre compte.', 'Allow pop-ups to link your account.'))
    this.say(tr('Autorisez l’accès dans la fenêtre Twitch…', 'Grant access in the Twitch window…'))
    const timer = setInterval(() => {
      if (!popup.closed) return
      clearInterval(timer)
      this.say('')
      void this.refresh()
    }, 700)
  }

  private async unlink() {
    const reply = await this.request({ unlink: true })
    if (reply?.status !== 'success') return this.say(tr('Le site ne répond pas. Réessayez.', 'The site is unavailable. Try again.'))
    this.say(tr('Compte Twitch délié.', 'Twitch account unlinked.'))
    await this.refresh()
  }

  private async send() {
    const text = this.input.value.trim()
    if (!text || this.sending) return
    this.sending = true
    this.sendButton.disabled = true
    const reply = await this.request({ message: text, channel: this.channel })
    this.sending = false
    this.sendButton.disabled = false
    // Envoyé : le message revient par le chat, comme ceux des autres.
    if (reply?.status === 'success') {
      this.input.value = ''
      return this.say('')
    }
    if (reply?.error === 'unlinked') {
      this.say(tr('Twitch n’autorise plus ce compte : liez-le à nouveau.', 'Twitch no longer authorises this account: link it again.'))
      return void this.refresh()
    }
    this.say(reply?.error === 'busy' ? tr('Pas si vite : un instant entre deux messages.', 'Slow down: wait a moment between messages.')
      : reply?.error === 'dropped' ? tr('Twitch a écarté ce message', 'Twitch dropped this message') + (reply.detail ? ` : ${reply.detail}` : '.')
      : reply?.error === 'refused' ? tr('Twitch refuse ce message.', 'Twitch refused this message.')
      : tr('Message non envoyé. Réessayez.', 'Message not sent. Try again.'))
  }
}
