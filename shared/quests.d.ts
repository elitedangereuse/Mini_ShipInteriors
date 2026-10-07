/** Ce qu'une quête terminée rapporte : des crédits, des objets des quartiers, des apparences du Holo-Me. */
export interface QuestReward {
  credits?: number
  items?: string[]
  skins?: string[]
}

export interface QuestDef {
  id: string
  /** Par étape, le nombre d'éléments à réunir dans l'ordre qu'on veut (0 : étape simple). */
  steps: number[]
  /** Pièce fermée tant que la quête n'est pas terminée. */
  room?: { level: number; room: string }
  reward?: QuestReward
}

/** Où en est un joueur : étape en cours, éléments réunis (un bit chacun), quête terminée. */
export interface QuestState {
  step: number
  flags: number
  done: boolean
}

export declare const QUESTS: QuestDef[]
export declare function questById(id: unknown): QuestDef | undefined
/** Pièces fermées tant que leur quête n'est pas terminée. */
export declare const QUEST_ROOMS: { quest: string; level: number; room: string }[]
/** Quête qui ouvre la pièce `room` du pont `level`, ou null si elle est ouverte à tous. */
export declare function questOfRoom(level: number, room: string | null): string | null
/** Objets (« pet-chien ») et apparences (« skin:robot.d ») qu'une quête offre, et laquelle. */
export declare const QUEST_UNLOCKS: Record<string, string>
/** D'une liste venue d'ailleurs, les quêtes connues, sans doublon. */
export declare function knownQuests(list: unknown): string[]
export declare function stepComplete(def: QuestDef, state: QuestState): boolean
export declare function questStarted(): QuestState
export declare function questFlag(def: QuestDef, state: QuestState, step: number, flag: number): QuestState | 'done' | 'order' | 'format'
export declare function questAdvance(def: QuestDef, state: QuestState, to: number): QuestState | 'order' | 'flags'
