export interface IrcLine { tags: Record<string, string>; nick: string; command: string; text: string }
/** Morceau d'un message : du texte, ou une emote (`emote` : son identifiant, `text` : son nom). */
export interface ChatPart { text: string; emote?: string }
export interface ChatMessage {
  id: string; userId: string; name: string
  /** Couleur du pseudo choisie par le spectateur (`#rrggbb`), ou vide. */
  color: string
  /** Message « /me ». */
  action: boolean
  parts: ChatPart[]
}

/** Une ligne IRC de Twitch, ou null si elle n'en est pas une. */
export declare function parseIrc(line: string): IrcLine | null
export declare function emoteParts(text: string, emotes: string, offset?: number): ChatPart[]
/** Message de chat à afficher, ou null si la ligne n'en est pas un. */
export declare function chatMessage(irc: IrcLine): ChatMessage | null
