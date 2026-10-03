/**
 * Chat Twitch du cinéma : le jeu l'écoute en anonyme, par l'IRC de Twitch sur WebSocket
 * (cf. src/twitch-chat.ts). Ici, la découpe des lignes reçues.
 */

const UNESCAPE = { s: ' ', ':': ';', r: '\r', n: '\n' }

/** Une ligne IRC : `@tags :auteur!… COMMANDE #canal :texte`. null si elle n'en est pas une. */
export function parseIrc(line) {
  const m = /^(?:@(\S+) )?(?::(\S+) )?([A-Z0-9]+)(?: (.*))?$/.exec(line)
  if (!m) return null
  const tags = {}
  for (const pair of (m[1] ?? '').split(';')) {
    if (!pair) continue
    const i = pair.indexOf('=')
    tags[i < 0 ? pair : pair.slice(0, i)] = i < 0 ? '' : pair.slice(i + 1).replace(/\\(.?)/g, (_, c) => UNESCAPE[c] ?? c)
  }
  const rest = m[4] ?? ''
  const cut = rest.startsWith(':') ? -1 : rest.indexOf(' :')
  const text = rest.startsWith(':') ? rest.slice(1) : cut < 0 ? '' : rest.slice(cut + 2)
  return { tags, nick: (m[2] ?? '').split('!')[0], command: m[3], text }
}

/**
 * Découpe un message en texte et en emotes. `emotes` : la balise de Twitch
 * (`25:0-4,12-16/1902:6-10`), dont les positions comptent en caractères Unicode.
 */
export function emoteParts(text, emotes, offset = 0) {
  const chars = Array.from(text)
  const ranges = []
  for (const group of emotes.split('/')) {
    const [id, spans] = group.split(':')
    if (!/^[\w-]+$/.test(id) || !spans) continue
    for (const span of spans.split(',')) {
      const [from, to] = span.split('-').map((n) => Number(n) - offset)
      if (Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from && to < chars.length) ranges.push({ id, from, to })
    }
  }
  ranges.sort((a, b) => a.from - b.from)
  const parts = []
  let at = 0
  for (const range of ranges) {
    if (range.from < at) continue
    if (range.from > at) parts.push({ text: chars.slice(at, range.from).join('') })
    parts.push({ text: chars.slice(range.from, range.to + 1).join(''), emote: range.id })
    at = range.to + 1
  }
  if (at < chars.length) parts.push({ text: chars.slice(at).join('') })
  return parts
}

/** Message de chat à afficher, ou null si la ligne n'en est pas un. */
export function chatMessage(irc) {
  if (irc.command !== 'PRIVMSG') return null
  // « /me » : le texte est enveloppé, et les positions des emotes comptent l'enveloppe.
  const action = /^\u0001ACTION (.*)\u0001$/.exec(irc.text)
  const color = irc.tags.color ?? ''
  return {
    id: irc.tags.id ?? '', userId: irc.tags['user-id'] ?? '', name: irc.tags['display-name'] || irc.nick,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '', action: !!action,
    parts: emoteParts(action ? action[1] : irc.text, irc.tags.emotes ?? '', action ? 8 : 0),
  }
}
