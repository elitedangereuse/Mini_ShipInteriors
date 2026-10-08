// Quêtes du bord (cf. src/quests/) : ce que le relais et le site doivent en savoir, sans leurs
// textes. Le client les raconte (src/quests/content.ts), le site garde où en est chaque CMDR
// (phputils/mini_shipinteriors/quests.php du repo elitedangereuselight, qui recopie cette liste :
// un test compare les deux), le relais ferme les pièces que certaines débloquent.
//
// Une quête est une suite d'étapes. `steps` donne, pour chacune, le nombre d'éléments à réunir
// dans l'ordre qu'on veut avant de passer à la suivante (trois indices, trois témoins…) ; 0 : une
// étape simple, qu'un seul geste termine. L'état d'un joueur tient en trois valeurs : l'étape en
// cours (`step`), les éléments déjà réunis (`flags`, un bit par élément) et `done`.
//
// Les quêtes ne sont pas toutes proposées d'emblée : `requires` nomme celles qu'il faut avoir
// terminées avant (cf. questAvailable). Le bord se découvre petit à petit.

/**
 * @typedef {{ credits?: number, items?: string[], skins?: string[] }} QuestReward
 * @typedef {{ id: string, steps: number[], requires?: string[], room?: { level: number, room: string }, reward?: QuestReward }} QuestDef
 * @typedef {{ step: number, flags: number, done: boolean }} QuestState
 */

/** @type {QuestDef[]} */
export const QUESTS = [
  // Le chien égaré : son panier, dans le catalogue des quartiers.
  { id: 'gamelle-vide', steps: [0, 3, 0, 0], reward: { items: ['pet-chien'] } },
  // Le stand de tir de la cale.
  { id: 'permis-de-tir', steps: [0, 2, 0], room: { level: -1, room: 'r' }, reward: { credits: 5000 } },
  // La salle de sport du pont principal.
  { id: 'poids-lourds', steps: [0, 3, 0], room: { level: 0, room: 'r' }, reward: { credits: 5000 } },
  // Le terrain de basket du pont supérieur.
  { id: 'silence-on-dribble', steps: [0, 2, 0, 0], room: { level: 1, room: 'b' }, reward: { credits: 5000 } },
  // Le terrain de foot du pont supérieur.
  { id: 'dernier-match', steps: [3, 0, 0, 0], room: { level: 1, room: 'f' }, reward: { credits: 5000 } },
  // Le mannequin de l'atelier : son apparence, au Holo-Me.
  { id: 'quatre-cent-douze', steps: [0, 3, 0], reward: { skins: ['robot.d'] } },
  // Écho, la projection que personne n'a validée : l'apparence « Hologramme », au Holo-Me.
  { id: 'essayage', steps: [3, 0, 0], reward: { skins: ['holo.echo'] } },
  // Pas une histoire, une formalité : lancer Scavengers depuis un de ses postes (cf. main.ts) offre
  // les apparences de Kael et d'ARIA. Le journal ne la montre pas (elle n'a pas de récit).
  { id: 'scavengers', steps: [0], reward: { skins: ['suit.kael', 'holo.aria'] } },
  // --- Celles qui se méritent : chacune attend qu'on en ait terminé d'autres (`requires`).
  // L'émission pirate : son album au jukebox (cf. src/music.ts), et le poste qui la captait.
  { id: 'frequence-fantome', steps: [0, 3, 0, 0], requires: ['silence-on-dribble'], reward: { items: ['pirate-radio'] } },
  // Le cocktail perdu de Jacques : un bar de poche pour ses quartiers, et de quoi trinquer.
  { id: 'recette-de-jacques', steps: [3, 0, 0], requires: ['gamelle-vide'], reward: { items: ['pocket-bar'] } },
  // Le poisson que le livre des prises ne connaît pas (cf. QUEST_FISH dans shared/fishing.js).
  { id: 'poisson-fantome', steps: [0, 0, 0, 0], requires: ['recette-de-jacques'], reward: { credits: 3000 } },
  // La bobine sans étiquette : son film à la régie du cinéma, et un projecteur pour ses quartiers.
  { id: 'seance-de-minuit', steps: [3, 0], requires: ['frequence-fantome', 'essayage'], reward: { items: ['reel-projector'] } },
  // La mémoire d'ARIA : son écran, pour ses quartiers.
  { id: 'dossier-aria', steps: [3, 0, 0], requires: ['quatre-cent-douze'], reward: { credits: 5000, items: ['scav-aria'] } },
  // La ronde du sergent : le poste de surveillance, sous la Promenade, et ses caméras.
  { id: 'tour-de-garde', steps: [4, 0, 0], requires: ['permis-de-tir', 'dernier-match', 'dossier-aria'], room: { level: 0, room: 'v' }, reward: { credits: 5000 } },
]

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]))

/** @returns {QuestDef | undefined} */
export const questById = (id) => (typeof id === 'string' ? BY_ID.get(id) : undefined)

/**
 * La quête est-elle proposée à qui a terminé les quêtes `done` ? (Celles qu'elle attend le sont toutes.)
 * @param {QuestDef} def @param {Iterable<string>} done
 */
export function questAvailable(def, done) {
  const set = done instanceof Set ? done : new Set(done)
  return (def.requires ?? []).every((id) => set.has(id))
}

/** Quêtes que la fin de `id` rend disponibles, pour qui a terminé `done` (elle comprise). */
export function questsOpenedBy(id, done) {
  const set = done instanceof Set ? done : new Set(done)
  return QUESTS.filter((q) => q.requires?.includes(id) && questAvailable(q, set)).map((q) => q.id)
}

/** Pièces fermées tant que leur quête n'est pas terminée : la quête, le pont, la lettre de la pièce. */
export const QUEST_ROOMS = QUESTS.filter((q) => q.room).map((q) => ({ quest: q.id, level: q.room.level, room: q.room.room }))

/** Quête qui ouvre la pièce `room` du pont `level`, ou null si elle est ouverte à tous. */
export function questOfRoom(level, room) {
  return QUEST_ROOMS.find((r) => r.level === level && r.room === room)?.quest ?? null
}

/**
 * Films que la régie du cinéma ne propose qu'à qui a terminé leur quête (cf. server/cinema.js et
 * src/cinema-room.ts) : la vidéo YouTube, son titre à l'affiche, la quête.
 */
export const QUEST_REELS = [{ video: '4E4GbyfP8xw', title: 'La bobine sans étiquette', quest: 'seance-de-minuit' }]

/** Objets et apparences qui ne s'achètent pas : une quête les offre (clé d'inventaire -> quête). */
export const QUEST_UNLOCKS = Object.fromEntries(QUESTS.flatMap((q) => [
  ...(q.reward?.items ?? []).map((item) => [item, q.id]),
  ...(q.reward?.skins ?? []).map((skin) => [`skin:${skin}`, q.id]),
]))

/** D'une liste venue d'ailleurs (le site, un client), les quêtes connues, sans doublon. */
export function knownQuests(list) {
  return Array.isArray(list) ? [...new Set(list.filter((id) => BY_ID.has(id)))] : []
}

/** Tous les éléments de l'étape en cours sont-ils réunis ? */
export function stepComplete(def, state) {
  const parts = def.steps[state.step] ?? 0
  return state.flags === (1 << parts) - 1
}

/** Quête commencée : première étape, rien de réuni. @returns {QuestState} */
export const questStarted = () => ({ step: 0, flags: 0, done: false })

/**
 * Élément `flag` de l'étape `step` réuni. Rend le nouvel état, ou pourquoi pas : 'done' (quête
 * terminée), 'order' (ce n'est pas l'étape en cours), 'format' (l'étape n'a pas cet élément).
 * @param {QuestDef} def @param {QuestState} state
 * @returns {QuestState | 'done' | 'order' | 'format'}
 */
export function questFlag(def, state, step, flag) {
  if (state.done) return 'done'
  if (state.step !== step) return 'order'
  if (!Number.isInteger(flag) || flag < 0 || flag >= (def.steps[step] ?? 0)) return 'format'
  return { ...state, flags: state.flags | (1 << flag) }
}

/**
 * Passage à l'étape `to` (la suivante ; `def.steps.length` : la quête est terminée). Rend le
 * nouvel état (le même si l'étape est déjà atteinte : une demande répétée ne casse rien), ou
 * pourquoi pas : 'order' (une étape sautée), 'flags' (il manque des éléments à l'étape en cours).
 * @param {QuestDef} def @param {QuestState} state
 * @returns {QuestState | 'order' | 'flags'}
 */
export function questAdvance(def, state, to) {
  if (!Number.isInteger(to) || to < 1 || to > def.steps.length) return 'order'
  if (state.step >= to) return state
  if (to !== state.step + 1) return 'order'
  if (!stepComplete(def, state)) return 'flags'
  return { step: to, flags: 0, done: to === def.steps.length }
}
