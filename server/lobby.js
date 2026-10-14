// Salons d'une activité à plusieurs (cf. MESS RUSH, server/mess-rush.js) : des salons fixes,
// publics, où l'on se place, se dit prêt, puis part ensemble après un compte à rebours. C'est le
// bloc que partagent l'arène (server/arena.js) et la zone thargoïde (server/salvage.js), écrit une
// fois : le premier arrivé est chef de salon, et le reste quand un autre part ; tout changement
// de l'équipe remet les « prêt » à zéro ; on garde sa place tant qu'on reste là où se tient le
// salon (`inLobby`).
//
// Le module ne lance pas la partie : `due()` rend les salons dont le compte à rebours est fini, et
// l'activité les fait partir (`playing`), puis les ramène (`finish`).

/**
 * @param {object} o
 * @param {string} o.name préfixe des évènements (`${name}:lobby`, `${name}:error`)
 * @param {number} o.count nombre de salons
 * @param {number} o.size joueurs par salon, au plus
 * @param {number} o.countdown compte à rebours (s)
 * @param {(p: object) => boolean} o.inLobby le joueur est-il là où se tient le salon ?
 * @param {(id: number) => object | undefined} o.playerById
 * @param {(id: number, event: string, data: object) => void} o.emit
 * @param {(event: string, data: object) => void} o.broadcast
 * @param {() => number} [o.now]
 * @param {(team: object) => object} [o.extra] ce que l'activité ajoute à l'état d'un salon
 */
export function createLobby({ name, count, size, countdown, inLobby, playerById, emit, broadcast, now = Date.now, extra = () => ({}) }) {
  const teams = new Map(Array.from({ length: count }, (_, i) => [i + 1, { id: i + 1, members: [], ready: new Set(), game: null }]))
  const reset = (t) => Object.assign(t, { leader: null, status: 'forming', startAt: 0 })
  for (const t of teams.values()) reset(t)
  const teamOf = new Map() // id du joueur -> salon

  const teamState = (t) => ({
    id: t.id, leader: t.leader, status: t.status,
    startsIn: t.status === 'countdown' ? Math.max(0, (t.startAt - now()) / 1000) : undefined,
    members: t.members.map((id) => {
      const p = playerById(id)
      return { id, name: p?.name ?? '?', verified: !!p?.verified, ready: t.ready.has(id) }
    }),
    ...extra(t),
  })
  const snapshot = () => ({ teams: [...teams.values()].map(teamState) })
  const announce = () => broadcast(`${name}:lobby`, snapshot())
  const error = (p, code) => emit(p.id, `${name}:error`, { code })

  /** Réglages changés, membre parti ou arrivé : chacun redit qu'il est prêt. */
  function unready(t) {
    t.ready.clear()
    if (t.status === 'countdown') t.status = 'forming'
  }

  function leaveTeam(p) {
    const t = teamOf.get(p.id)
    if (!t) return
    teamOf.delete(p.id)
    t.members = t.members.filter((id) => id !== p.id)
    t.ready.delete(p.id)
    if (!t.members.length) reset(t)
    else {
      if (t.leader === p.id) t.leader = t.members[0]
      unready(t)
    }
  }

  /**
   * Une action du salon : `join` ({ team }), `leave`, `ready` ({ ready }). Une action refusée
   * envoie `${name}:error` : `playing` (le salon joue), `lobby` (pas là où se tient le salon),
   * `gone` (salon inconnu), `full`.
   */
  function action(p, verb, data) {
    const t = teamOf.get(p.id)
    if (t?.status === 'playing') return error(p, 'playing')
    if (verb !== 'leave' && !inLobby(p)) return error(p, 'lobby')
    switch (verb) {
      case 'join': {
        const team = teams.get(data.team)
        if (!team) return error(p, 'gone')
        if (team === t) return
        if (team.status === 'playing') return error(p, 'playing')
        if (team.members.length >= size) return error(p, 'full')
        if (t) leaveTeam(p)
        if (!team.members.length) team.leader = p.id
        team.members.push(p.id)
        teamOf.set(p.id, team)
        unready(team)
        break
      }
      case 'leave':
        if (!t) return
        leaveTeam(p)
        break
      case 'ready': {
        if (!t) return
        if (data.ready === true) t.ready.add(p.id)
        else t.ready.delete(p.id)
        if (t.members.every((id) => t.ready.has(id))) {
          t.status = 'countdown'
          t.startAt = now() + countdown * 1000
        } else if (t.status === 'countdown') t.status = 'forming'
        break
      }
      default:
        return
    }
    announce()
  }

  /** Après chaque position d'un joueur : sortir de là où se tient le salon, c'est le quitter. */
  function moved(p) {
    const t = teamOf.get(p.id)
    if (!t || t.status === 'playing' || inLobby(p)) return
    leaveTeam(p)
    announce()
  }

  /** Le joueur quitte le vaisseau (déconnexion) hors partie : il quitte son salon. */
  function remove(p) {
    if (!teamOf.has(p.id)) return
    leaveTeam(p)
    announce()
  }

  /** Les salons dont le compte à rebours est fini. */
  function due() {
    const t = now()
    return [...teams.values()].filter((team) => team.status === 'countdown' && team.startAt <= t)
  }

  /** Le salon part en partie. */
  function playing(t, game) {
    t.status = 'playing'
    t.game = game
    t.ready.clear()
    announce()
  }

  /**
   * Retour de partie : le salon se reforme avec ceux qui sont encore là (`keep`) ; un chef parti
   * passe la main au suivant.
   */
  function finish(t, keep) {
    t.game = null
    t.status = 'forming'
    t.ready.clear()
    for (const id of t.members) if (!keep.has(id)) teamOf.delete(id)
    t.members = t.members.filter((id) => keep.has(id))
    if (!t.members.length) reset(t)
    else if (!keep.has(t.leader)) t.leader = t.members[0]
    announce()
  }

  /**
   * Un joueur quitte la partie de son salon (abandon, arrivée manquée) : il n'en fait plus partie et
   * peut se placer ailleurs ; la partie continue sans lui.
   */
  function release(p) {
    const t = teamOf.get(p.id)
    if (!t) return
    teamOf.delete(p.id)
    t.members = t.members.filter((id) => id !== p.id)
    if (t.leader === p.id) t.leader = t.members[0] ?? null
    announce()
  }

  /** Un joueur reprend sa place sous un nouvel identifiant (reconnexion). */
  function rename(t, old, id) {
    t.members = t.members.map((m) => (m === old ? id : m))
    if (t.leader === old) t.leader = id
    teamOf.delete(old)
    teamOf.set(id, t)
  }

  return { teams, snapshot, announce, error, action, moved, remove, due, playing, finish, release, rename, teamOf: (p) => teamOf.get(p.id) ?? null, leaveTeam }
}
