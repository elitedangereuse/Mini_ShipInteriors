import { tr } from '../i18n'
import { icon } from '../icons'
import type { ArenaCharacterStats, ArenaEnd, ArenaLobby, ArenaRoom, ArenaStats } from '../net'
import { button, el, Modal } from '../salvage/ui'
import { ARENA_MAPS, ARENA_RULES, ARENA_TEAMS, DEFAULT_CHARACTER, arenaMap, arenaZone, type ArenaMapId, type CharacterId } from '../../shared/arena.js'
import { CHARACTERS, characterById, type Character } from './characters'
import { arrow, moveFocus, PadRepeat } from './nav'
import { loadPortraits } from './portraits'
import { CharacterPicker, faceOf } from './select'
import { arenaFx } from './settings'

/*
 * Interface de l'arène : le terminal (à gauche, les quatre lobbys où l'on se place ; à droite, les
 * deux camps face à face, le choix du personnage et sa fiche, cf. select.ts, les réglages, « prêt » ;
 * on s'y déplace aussi aux flèches et à la manette, cf. nav.ts), puis en
 * partie le score des deux équipes et le chrono, les points de vie, le fil des éliminations,
 * l'écran d'attente de celui qui vient d'être éliminé, et l'écran de fin, posé sur la scène où les
 * combattants s'alignent (cf. podium.ts).
 */

export const TEAM_NAMES = [tr('Orange', 'Orange'), tr('Bleue', 'Blue')]
const SKILLS = [tr('Recrues', 'Rookies'), tr('Pilotes', 'Pilots'), tr('Élite', 'Elite')]
const format = (size: number) => tr(`${size} contre ${size}`, `${size} vs ${size}`)
/** Le nom d'un plan, dans la langue du joueur. */
const mapName = (id: string) => tr(...arenaMap(id).name)
/** Ce qu'est chaque plan, en une ligne, au terminal. */
const MAP_BLURBS: Record<ArenaMapId, string> = {
  bay: tr('Le stade de CMDR Arena : trois allées, des tribunes pleines.', 'The CMDR Arena stadium: three lanes, packed stands.'),
  guardian: tr('Des ruines gardiennes, de nuit, sur deux hauteurs : le promontoire de la relique domine.', 'Guardian ruins at night, on two levels: the relic\'s ridge looms over all.'),
  hive: tr('Une ruche thargoïde : un octogone, la chambre du cœur au milieu.', 'A Thargoid hive: an octagon, the heart chamber at its centre.'),
}
/** Couleurs de la vignette de chaque plan : le sol, les obstacles, les buissons. */
const MAP_TINTS: Record<ArenaMapId, [string, string, string]> = {
  bay: ['#d9ae5f', '#3a4250', '#4f9d3a'],
  guardian: ['#4a403a', '#12161c', '#8fb9d9'],
  hive: ['#1d3326', '#0b120e', '#39ff88'],
}

/** La vignette d'un plan : une tuile par case, les deux bases à la couleur de leur camp. */
function mapThumb(id: ArenaMapId): HTMLCanvasElement {
  const zone = arenaZone(id)
  const S = 4
  const canvas = document.createElement('canvas')
  canvas.width = zone.width * S
  canvas.height = zone.height * S
  canvas.className = 'arena-map-thumb'
  const c = canvas.getContext('2d')!
  const [floor, solid, bush] = MAP_TINTS[id]
  for (let z = 0; z < zone.height; z++) {
    for (let x = 0; x < zone.width; x++) {
      const t = zone.plan[z][x]
      if (t === ' ') continue
      c.fillStyle = zone.blocked[z * zone.width + x] ? solid : t === 'g' || t === 'G' ? bush : x < 3 ? ARENA_TEAMS[0].color : x >= zone.width - 3 ? ARENA_TEAMS[1].color : floor
      // Le haut, plus clair ; une rampe, entre les deux.
      if (t === 'u') c.fillStyle = '#7d8a99'
      if (t === 'r') c.fillStyle = '#5e6670'
      // Le gouffre : on le laisse vide.
      if (t === 'v') continue
      c.fillRect(x * S, z * S, S, S)
    }
  }
  return canvas
}

export interface ArenaPanelActions {
  join(room: number, team?: number): void
  leave(): void
  side(team: number): void
  settings(s: { size?: number; bots?: boolean; skill?: number; goal?: number; map?: ArenaMapId }): void
  character(id: CharacterId): void
  ready(on: boolean): void
  /** Regarder la partie en cours d'un lobby, en spectateur. */
  watch(room: number): void
}

/** Sa pastille : l'icône du personnage, à sa couleur (le fil des éliminations). */
function badge(c: Character, className: string): HTMLElement {
  const b = el('span', className)
  b.style.setProperty('--char', c.color)
  b.append(icon(c.icon))
  return b
}

/** Ce que la manette dit au terminal, à chaque image (cf. shared/gamepad.js). */
export interface PanelPad {
  moveX: number
  moveY: number
  interact: boolean
  cancel: boolean
  action: boolean
  next: boolean
  rotateLeft: boolean
  rotateRight: boolean
}

/** Ce qu'on tient en main : le terminal rappelle ses commandes (rien au doigt, tout se touche). */
export type PanelControls = 'keyboard' | 'gamepad' | 'touch'

/**
 * Le terminal de l'arène : à gauche, les quatre lobbys ; à droite, celui où l'on s'est placé, ses
 * deux camps face à face, son arme, les réglages du chef, et « prêt ».
 */
export class ArenaPanel extends Modal {
  private lobby: ArenaLobby = { rooms: [] }
  private self = -1
  private online = false
  private status = ''
  private _character: CharacterId = DEFAULT_CHARACTER
  private readonly picker: CharacterPicker
  private readonly hints = el('p', 'arena-hints')
  private readonly repeat = new PadRepeat()
  private controls: PanelControls = 'keyboard'

  constructor(private actions: ArenaPanelActions) {
    super(tr('CMDR ARENA · INSCRIPTIONS', 'CMDR ARENA · SIGN-UP'), tr('Duel par équipes', 'Team duel'))
    this.root.classList.add('arena-panel')
    this.picker = new CharacterPicker(this._character, (id) => this.pick(id))
    // Les visages arrivent : les équipes les montrent aussi.
    this.picker.onFaces = () => { if (this.isOpen) this.render() }
    // Sous le titre, les commandes du clavier ou de la manette.
    ;(this.root.querySelector('.salvage-head') ?? this.root).append(this.hints)
    this.hint()
    // Au clavier : les flèches vont d'un bouton à l'autre, les chiffres choisissent le personnage,
    // Échap replie d'abord la fiche détaillée (la fenêtre, elle, écoute Échap pour se fermer).
    this.root.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return
      const dir = arrow(e.key)
      if (dir) {
        e.preventDefault()
        moveFocus(this.body, dir[0], dir[1])
      } else if (/^[1-6]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey && !this.room?.status.startsWith('play')) {
        this.picker.pickNth(Number(e.key))
      } else if (e.key === 'Escape' && this.picker.detailed) {
        this.picker.toggleDetails(false)
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }, { capture: true })
  }

  get character(): CharacterId {
    return this._character
  }

  set character(id: CharacterId) {
    this._character = id
    this.picker.set(id)
  }

  open() {
    this.status = ''
    this.render()
    this.show()
    // Le focus sur son personnage, plutôt que sur la croix : Entrée ou A ne referment pas tout de suite.
    this.picker.focus()
    this.picker.resume()
  }

  /** Ce qu'on tient en main a changé : les commandes rappelées au pied du terminal suivent. */
  setControls(mode: PanelControls) {
    if (mode === this.controls) return
    this.controls = mode
    this.hint()
  }

  private hint() {
    // À la manette, le focus se voit toujours (le navigateur ne le montre qu'après une touche).
    this.root.classList.toggle('pad-nav', this.controls === 'gamepad')
    this.hints.hidden = this.controls === 'touch'
    this.hints.replaceChildren()
    const keys: [string, string][] = this.controls === 'gamepad'
      ? [['A', tr('Valider', 'Select')], ['B', tr('Retour', 'Back')], ['LB RB', tr('Personnage', 'Character')], ['Y', tr('Fiche', 'Stats')], ['X', tr('Prêt', 'Ready')]]
      : [['← → ↑ ↓', tr('Se déplacer', 'Move')], [tr('Entrée', 'Enter'), tr('Valider', 'Select')], ['1–6', tr('Personnage', 'Character')], [tr('Échap', 'Esc'), tr('Fermer', 'Close')]]
    for (const [key, what] of keys) {
      const k = el('span')
      k.append(el('kbd', '', key), what)
      this.hints.append(k)
    }
  }

  /**
   * La manette, tant que le terminal est ouvert : le stick et la croix vont d'un bouton à l'autre, A
   * l'actionne, B replie la fiche détaillée ou ferme, LB et RB changent de personnage, Y déplie la
   * fiche, X dit « prêt ».
   */
  pad(input: PanelPad, dt: number) {
    if (input.cancel) {
      if (this.picker.detailed) this.picker.toggleDetails(false)
      else this.close()
      return
    }
    const dir = this.repeat.step(input.moveX, input.moveY, dt)
    if (dir) moveFocus(this.body, dir[0], dir[1])
    const playing = this.room?.status === 'playing'
    if (input.rotateLeft && !playing) this.picker.cycle(-1)
    if (input.rotateRight && !playing) this.picker.cycle(1)
    if (input.next) this.picker.toggleDetails()
    if (input.action) this.body.querySelector<HTMLButtonElement>('[data-key="ready"]')?.click()
    if (input.interact) {
      const active = document.activeElement
      if (active instanceof HTMLElement && this.body.contains(active)) active.click()
      else moveFocus(this.body, 0, 1)
    }
  }

  update(lobby: ArenaLobby, self: number, online: boolean) {
    this.lobby = lobby
    this.self = self
    this.online = online
    if (this.isOpen) this.render()
  }

  message(text: string) {
    this.status = text
    if (this.isOpen) this.render()
  }

  get room(): ArenaRoom | null {
    return this.lobby.rooms.find((r) => r.members.some((m) => m.id === this.self)) ?? null
  }

  private render() {
    const focused = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : undefined
    this.body.replaceChildren()
    if (!this.online) {
      this.body.append(el('p', 'salvage-warn', tr('Relais injoignable : CMDR Arena se joue en ligne. Réessayez dans un instant.', 'Relay unreachable: CMDR Arena is played online. Try again in a moment.')))
      return
    }
    const room = this.room
    const layout = el('div', 'arena-layout')
    // Les lobbys, toujours visibles : on voit qui joue avec qui, et l'on en change d'un clic.
    const rail = el('nav', 'arena-rail')
    rail.setAttribute('aria-label', tr('Lobbys', 'Lobbies'))
    rail.append(el('span', 'arena-heading', tr('Lobbys', 'Lobbies')))
    for (const r of this.lobby.rooms) rail.append(this.tile(r, room))
    const stage = el('div', 'arena-stage')
    if (room) this.fillRoom(stage, room)
    else this.fillWelcome(stage)
    if (this.status) stage.append(el('p', 'salvage-status', this.status))
    layout.append(rail, stage)
    this.body.append(layout)
    if (focused) this.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus()
  }

  /** Le joueur choisit un personnage (sa carte le montre déjà, cf. CharacterPicker). */
  private pick(id: CharacterId) {
    this._character = id
    this.actions.character(id)
  }

  /** Un lobby, dans la colonne de gauche : son état, qui s'y trouve (une pastille par place), et l'on s'y place d'un clic. */
  private tile(r: ArenaRoom, mine: ArenaRoom | null): HTMLElement {
    const own = r === mine
    const playing = r.status === 'playing'
    const full = !own && r.members.length >= r.size * 2
    // Un lobby en partie ne se rejoint pas : on la regarde.
    const b = button('', () => { if (playing) this.actions.watch(r.id); else if (!own) this.actions.join(r.id) }, `arena-tile${own ? ' own' : ''}${playing ? ' playing' : ''}`)
    b.dataset.key = `join-${r.id}`
    b.disabled = !own && !playing && full
    if (own) b.setAttribute('aria-current', 'true')
    const state = playing ? tr('En partie', 'Playing')
      : r.status === 'countdown' ? tr('Départ', 'Starting')
        : full ? tr('Complet', 'Full')
          : !r.members.length ? tr('Libre', 'Empty')
            : tr('Ouvert', 'Open')
    const head = el('span', 'arena-tile-head')
    head.append(el('strong', '', `Lobby ${r.id}`), el('span', `arena-badge${playing ? ' live' : !r.members.length ? ' idle' : ''}`, state))
    b.append(head)
    if (playing) {
      const score = el('span', 'arena-tile-score')
      // Les manches gagnées par chaque camp, et les points de la manche en cours.
      score.append(el('b', 'team0', String(r.rounds?.[0] ?? 0)), ' – ', el('b', 'team1', String(r.rounds?.[1] ?? 0)), el('small', '', tr(` manches · ${r.score?.[0] ?? 0}–${r.score?.[1] ?? 0}`, ` rounds · ${r.score?.[0] ?? 0}–${r.score?.[1] ?? 0}`)))
      const watch = el('span', 'arena-tile-watch')
      watch.append(icon('eye'), tr('Regarder', 'Watch'))
      if (r.watchers) watch.append(el('small', '', tr(` · ${r.watchers} spectateur${r.watchers > 1 ? 's' : ''}`, ` · ${r.watchers} watching`)))
      b.append(score, watch)
    } else {
      // Une rangée de places par camp : pleine (un joueur), creuse (libre, ou un bot).
      const pips = el('span', 'arena-pips')
      for (const team of ARENA_TEAMS) {
        const row = el('span', `team${team.id}`)
        const taken = r.members.filter((m) => m.team === team.id).length
        for (let i = 0; i < r.size; i++) row.append(el('i', i < taken ? 'on' : ''))
        pips.append(row)
      }
      b.append(pips)
    }
    const names = r.members.map((m) => (m.id === this.self ? tr('vous', 'you') : m.name)).join(', ')
    const bots = r.bots ? tr(`bots ${SKILLS[r.skill].toLowerCase()}`, `${SKILLS[r.skill].toLowerCase()} bots`) : tr('sans bots', 'no bots')
    b.append(el('span', 'arena-tile-detail', r.members.length ? `${mapName(r.map)} · ${format(r.size)} · ${r.goal} pts · ${bots}` : tr('Le premier arrivé règle la partie', 'First in sets the match')))
    if (names) b.append(el('span', 'arena-tile-names', names))
    if (own) b.append(el('span', 'arena-tile-own', tr('Votre lobby', 'Your lobby')))
    return b
  }

  /** Pas encore placé : ce qu'est l'arène, et le personnage qu'on y jouera. */
  private fillWelcome(stage: HTMLElement) {
    const hero = el('div', 'arena-hero')
    hero.append(
      el('strong', '', tr('Placez-vous dans un lobby', 'Pick a lobby')),
      el('p', '', tr(
        `Deux équipes, jusqu'à ${ARENA_RULES.team} contre ${ARENA_RULES.team}, dans le stade de la baie, au fond d'une ruche thargoïde ou dans les ruines d'un site gardien. Chacun y joue un membre de l'équipage, son arme et son style. Seul contre les bots, ou avec ceux qui jouent avec vous : ils complètent les équipes. La partie se joue en ${ARENA_RULES.wins} manches gagnantes.`,
        `Two teams, up to ${ARENA_RULES.team} vs ${ARENA_RULES.team}, in the bay's stadium, deep in a Thargoid hive or among the ruins of a Guardian site. Everyone plays a crew member, with their own weapon and style. Solo against the bots, or with whoever plays with you: they fill the teams. Best of ${ARENA_RULES.rounds} rounds.`,
      )),
    )
    stage.append(hero, el('span', 'arena-heading', tr('Votre personnage', 'Your character')), this.picker.root)
    stage.append(this.effects())
    stage.append(el('p', 'salvage-note', tr('Pour l\'honneur : CMDR Arena ne rapporte pas de crédits.', 'For honour only: CMDR Arena pays no credits.')))
  }

  /**
   * Les effets visuels de la partie, pour soi (cf. settings.ts) : comme le mode léger du jeu, complets,
   * ou réduits (pour un téléphone peu puissant ; ce qui renseigne la partie reste).
   */
  private effects(): HTMLElement {
    const box = el('div', 'arena-choice arena-effects')
    const label = tr('Effets visuels', 'Visual effects')
    box.append(el('span', 'arena-heading', label))
    const row = el('div', 'arena-segments')
    row.setAttribute('role', 'radiogroup')
    row.setAttribute('aria-label', label)
    const options: [string, boolean | null][] = [[tr('Auto', 'Auto'), null], [tr('Complets', 'Full'), false], [tr('Réduits', 'Reduced'), true]]
    options.forEach(([text, value], i) => {
      const on = arenaFx.choice === value
      const b = button(text, () => {
        arenaFx.set(value)
        this.render()
      }, on ? 'on' : '')
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(on))
      b.dataset.key = `fx-${i}`
      row.append(b)
    })
    box.append(row, el('small', 'arena-effects-note', arenaFx.reduced
      ? tr('Réduits : moins d\'éclats, ni fumée, ni braises, ni bulle ; les anneaux, plaques, cônes, traînées, pièges et chiffres restent.', 'Reduced: fewer sparks, no smoke, embers or bubble; rings, plates, cones, trails, traps and numbers stay.')
      : tr('Complets. « Réduits » allège la partie sur un téléphone peu puissant, sans rien retirer d\'utile.', 'Full. “Reduced” lightens the match on a low-end phone, without removing anything useful.')))
    return box
  }

  /** Son lobby : les deux camps face à face, son arme, les réglages du chef, « prêt ». */
  private fillRoom(stage: HTMLElement, r: ArenaRoom) {
    const leader = r.leader === this.self
    const me = r.members.find((m) => m.id === this.self)!
    const title = el('div', 'arena-title')
    title.append(el('strong', '', `Lobby ${r.id}`), el('span', '', `${mapName(r.map)} · ${format(r.size)} · ${tr(`${ARENA_RULES.wins} manches gagnantes · une manche : ${r.goal} points`, `best of ${ARENA_RULES.rounds} · a round: ${r.goal} points`)}`))
    stage.append(title)

    const versus = el('div', 'arena-versus')
    ARENA_TEAMS.forEach((team, index) => {
      const mates = r.members.filter((m) => m.team === team.id)
      const side = el('section', `arena-team team${team.id}${me.team === team.id ? ' own' : ''}`)
      const head = el('header')
      head.append(el('strong', '', tr(`Équipe ${TEAM_NAMES[team.id]}`, `${TEAM_NAMES[team.id]} team`)), el('span', '', `${mates.length}/${r.size}`))
      side.append(head)
      const slots = el('ul', 'arena-slots')
      for (const m of mates) {
        const li = el('li', `arena-slot${m.id === this.self ? ' me' : ''}${m.ready ? ' ready' : ''}`)
        // Son personnage : celui qu'on vient de choisir pour soi, sans attendre l'écho du relais.
        const c = characterById(m.id === this.self ? this._character : m.character)
        const face = faceOf(c, 'arena-face mini')
        face.title = c.name
        const name = el('span', 'arena-slot-name')
        if (m.id === r.leader) name.append(icon('crown'))
        name.append(m.name + (m.id === this.self ? tr(' (vous)', ' (you)') : ''))
        li.append(face, name, el('span', 'arena-slot-state', `${c.name} · ${m.ready ? tr('prêt', 'ready') : tr('en attente', 'waiting')}`))
        slots.append(li)
      }
      for (let i = mates.length; i < r.size; i++) {
        const li = el('li', `arena-slot free${r.bots ? ' bot' : ''}`)
        if (r.bots) li.append(icon('robot'), el('span', 'arena-slot-name', tr(`Bot · ${SKILLS[r.skill]}`, `Bot · ${SKILLS[r.skill]}`)))
        else li.append(el('span', 'arena-slot-name', tr('Place libre', 'Open slot')))
        slots.append(li)
      }
      side.append(slots)
      if (me.team !== team.id) {
        const swap = button(tr('Passer dans ce camp', 'Switch to this side'), () => this.actions.side(team.id), 'arena-swap', 'arrows-left-right')
        swap.dataset.key = `side-${team.id}`
        swap.disabled = mates.length >= r.size
        side.append(swap)
      }
      versus.append(side)
      if (!index) versus.append(el('span', 'arena-vs', 'VS'))
    })
    stage.append(versus)

    stage.append(el('span', 'arena-heading', tr('Votre personnage', 'Your character')), this.picker.root)

    // Réglages : le chef choisit ; les autres les voient.
    const settings = el('div', 'arena-settings')
    const choice = (label: string, options: [string, () => void, boolean][], key: string) => {
      const box = el('div', 'arena-choice')
      box.append(el('span', 'arena-heading', label))
      const row = el('div', 'arena-segments')
      row.setAttribute('role', 'radiogroup')
      row.setAttribute('aria-label', label)
      options.forEach(([text, set, on], i) => {
        const b = button(text, set, on ? 'on' : '')
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', String(on))
        b.dataset.key = `${key}-${i}`
        b.disabled = !leader && !on
        if (!leader) b.tabIndex = -1
        row.append(b)
      })
      box.append(row)
      return box
    }
    // Le plan : une carte par plan, sa vignette, son nom, ce qu'il est.
    const maps = el('div', 'arena-maps')
    maps.setAttribute('role', 'radiogroup')
    maps.setAttribute('aria-label', tr('Plan', 'Map'))
    for (const m of ARENA_MAPS) {
      const on = m.id === r.map
      const b = button('', () => this.actions.settings({ map: m.id }), `arena-map${on ? ' on' : ''}`)
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(on))
      b.dataset.key = `map-${m.id}`
      b.disabled = !leader && !on
      if (!leader) b.tabIndex = -1
      const text = el('span', 'arena-map-text')
      text.append(el('strong', '', mapName(m.id)), el('small', '', MAP_BLURBS[m.id]))
      b.append(mapThumb(m.id), text)
      maps.append(b)
    }
    stage.append(el('span', 'arena-heading', tr('Plan', 'Map')), maps)

    const crowd = Math.max(1, ...ARENA_TEAMS.map((t) => r.members.filter((m) => m.team === t.id).length))
    const sizes = Array.from({ length: ARENA_RULES.team }, (_, i) => i + 1).filter((n) => n >= crowd || n === r.size)
    settings.append(
      choice(tr('Format', 'Format'), sizes.map((n) => [`${n} v ${n}`, () => this.actions.settings({ size: n }), n === r.size]), 'size'),
      choice(tr('Limite de points', 'Point limit'), ARENA_RULES.goals.map((n) => [String(n), () => this.actions.settings({ goal: n }), n === r.goal]), 'goal'),
      choice(tr('Bots', 'Bots'), [
        [tr('Aucun', 'None'), () => this.actions.settings({ bots: false }), !r.bots],
        ...SKILLS.map((name, i): [string, () => void, boolean] => [name, () => this.actions.settings({ bots: true, skill: i }), r.bots && r.skill === i]),
      ], 'bots'),
    )
    stage.append(settings)
    if (!leader) stage.append(el('p', 'salvage-note', tr('Le chef du lobby (le premier arrivé, à la couronne) règle la partie ; un changement remet tout le monde en attente.', 'The lobby leader (first in, with the crown) sets the match; any change puts everyone back on standby.')))
    stage.append(this.effects())

    const ready = r.members.filter((m) => m.ready).length
    const footer = el('div', 'arena-footer')
    const go = button(
      r.status === 'countdown' ? tr('Départ imminent…', 'Starting…') : me.ready ? tr('Prêt · annuler', 'Ready · cancel') : tr('Je suis prêt', 'I\'m ready'),
      () => this.actions.ready(!me.ready), `arena-ready${me.ready ? ' on' : ''}`, me.ready ? 'check' : 'crosshair',
    )
    go.dataset.key = 'ready'
    const leave = button(tr('Quitter le lobby', 'Leave the lobby'), () => this.actions.leave(), 'arena-leave', 'sign-out')
    leave.dataset.key = 'leave'
    footer.append(go, el('span', 'arena-count-ready', tr(`${ready}/${r.members.length} prêt${ready > 1 ? 's' : ''}`, `${ready}/${r.members.length} ready`)), leave)
    stage.append(footer)
  }
}

export const ARENA_URL = import.meta.env.VITE_ED_ARENA_URL || '/outils/mini-shipinteriors-arena.php'

/** Une ligne du classement tenu par le site (cf. phputils/mini_shipinteriors/arena.php du site). */
export interface RankRow { name: string; url?: string; wins: number; played: number; kills: number; deaths: number }
export interface Ranking { top: RankRow[]; me: (Omit<RankRow, 'name' | 'url'> & { rank: number }) | null }

/** Le classement des joueurs, lu sur le site ; null s'il ne répond pas. */
export async function fetchRanking(): Promise<Ranking | null> {
  try {
    const res = await fetch(ARENA_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    const reply = await res.json()
    return reply?.status === 'success' && Array.isArray(reply.top) ? { top: reply.top, me: reply.me ?? null } : null
  } catch {
    return null
  }
}

/** Le classement des joueurs de l'arène, sur le mur de son lobby. */
export class RankingPanel extends Modal {
  private revision = 0
  /** Le classement vient d'être lu : le tableau du mur se met à jour (cf. src/arena/client.ts). */
  onLoaded?: (ranking: Ranking) => void
  /** Le panneau s'ouvre : demander au relais les statistiques des personnages (cf. showStats). */
  askStats?: () => void
  /** Sous le classement, les statistiques des personnages (elles arrivent du relais, à part). */
  private readonly statsBox = el('section', 'arena-char-stats')

  constructor() {
    super(tr('CMDR ARENA · CLASSEMENT', 'CMDR ARENA · RANKING'), tr('Les meilleurs joueurs', 'Top players'))
    this.root.classList.add('arena-panel', 'arena-ranks')
  }

  async open() {
    const token = ++this.revision
    this.body.replaceChildren(el('p', 'salvage-intro', tr('Chargement…', 'Loading…')))
    this.show()
    this.askStats?.()
    const ranking = await fetchRanking()
    if (token !== this.revision) return
    this.body.replaceChildren()
    if (!ranking) {
      this.body.append(el('p', 'salvage-warn', tr('Le site ne répond pas. Fermez puis réessayez.', 'The site is unavailable. Close and try again.')), this.statsBox)
      return
    }
    this.onLoaded?.(ranking)
    this.body.append(el('p', 'salvage-intro', tr(
      'Les CMDR par victoires ; à égalité, le plus d\'éliminations, puis la première partie. Toute partie finie compte, contre des joueurs comme contre des bots.',
      'CMDRs by wins; ties go to the most kills, then the earliest match. Every finished match counts, against players or bots.',
    )))
    const table = el('table', 'salvage-table arena-rank-table')
    const head = el('tr')
    for (const h of ['#', 'CMDR', tr('Victoires', 'Wins'), tr('Parties', 'Played'), tr('Élim.', 'Kills'), tr('Chutes', 'Deaths')]) head.append(el('th', '', h))
    table.append(el('thead'), el('tbody'))
    table.tHead!.append(head)
    if (!ranking.top.length) {
      const row = el('tr')
      const td = el('td', 'salvage-empty', tr('Personne n\'a encore joué de partie classée. La première place est à prendre.', 'Nobody has played a ranked match yet. First place is up for grabs.'))
      td.colSpan = 6
      row.append(td)
      table.tBodies[0].append(row)
    }
    ranking.top.forEach((r, i) => {
      const row = el('tr', i < 3 ? `podium p${i + 1}` : '')
      const name = el('td')
      if (r.url) {
        const a = el('a', '', r.name)
        a.href = r.url
        a.target = '_blank'
        a.rel = 'noopener'
        name.append(a)
      } else name.textContent = r.name
      row.append(el('td', '', String(i + 1)), name, el('td', '', String(r.wins)), el('td', '', String(r.played)), el('td', '', String(r.kills)), el('td', '', String(r.deaths)))
      table.tBodies[0].append(row)
    })
    this.body.append(table)
    const me = ranking.me
    if (me) this.body.append(el('p', 'salvage-note', tr(`Vous : ${me.rank}ᵉ, ${me.wins} victoire${me.wins > 1 ? 's' : ''} en ${me.played} partie${me.played > 1 ? 's' : ''}.`, `You: rank ${me.rank}, ${me.wins} win${me.wins === 1 ? '' : 's'} in ${me.played} match${me.played === 1 ? '' : 'es'}.`)))
    this.body.append(this.statsBox)
  }

  /**
   * Les statistiques des personnages, sur les parties des joueurs (cf. server/arena-stats.js) : leur
   * taux de sélection et de victoire, leurs éliminations et chutes par partie, leurs dégâts et soins
   * par minute, la durée d'une vie, leur précision et la portée de leurs coups ; et la précision par
   * commande, souris, manette, doigt, tir rapide.
   */
  showStats(stats: ArenaCharacterStats) {
    const box = this.statsBox
    box.replaceChildren(el('h3', 'arena-heading', tr('Les personnages', 'The characters')))
    if (!stats.games) {
      box.append(el('p', 'salvage-note', tr('Pas encore de partie finie : les chiffres de chaque personnage viendront avec les premières.', 'No finished match yet: each character\'s numbers will come with the first ones.')))
      return
    }
    const since = new Date(stats.since).toLocaleDateString(tr('fr-FR', 'en-GB'))
    box.append(el('p', 'salvage-intro', tr(`${stats.games} partie${stats.games > 1 ? 's' : ''} depuis le ${since}, celles des joueurs (pas des bots).`, `${stats.games} match${stats.games > 1 ? 'es' : ''} since ${since}, players only (no bots).`)))
    const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`)
    const one = (x: number | null, digits = 1) => (x === null ? '—' : tr(x.toFixed(digits).replace('.', ','), x.toFixed(digits)))
    const table = el('table', 'salvage-table arena-stat-table')
    const head = el('tr')
    for (const h of [tr('Personnage', 'Character'), tr('Choisi', 'Picked'), tr('Victoires', 'Wins'), tr('Élim.', 'Kills'), tr('Chutes', 'Deaths'), tr('Dégâts/min', 'Dmg/min'), tr('Soins/min', 'Heal/min'), tr('Vie (s)', 'Life (s)'), tr('Précision', 'Accuracy'), tr('Portée', 'Range')]) head.append(el('th', '', h))
    table.append(el('thead'), el('tbody'))
    table.tHead!.append(head)
    for (const c of CHARACTERS) {
      const r = stats.characters[c.id]
      const row = el('tr')
      const name = el('td', 'arena-stat-name', c.name)
      name.style.setProperty('--char', c.color)
      row.append(name)
      const cells = r
        ? [pct(r.pickRate), pct(r.winRate), one(r.kills), one(r.deaths), one(r.damage, 0), one(r.heals, 0), one(r.survival, 0), pct(r.accuracy), one(r.range)]
        : Array(9).fill('—')
      for (const v of cells) row.append(el('td', '', v))
      table.tBodies[0].append(row)
    }
    box.append(table)
    // La précision par commande, tous personnages confondus (pondérée par les tirs).
    const parts: string[] = []
    for (const [key, label] of [['mouse', tr('souris', 'mouse')], ['gamepad', tr('manette', 'gamepad')], ['touch', tr('doigt', 'touch')], ['assist', tr('tir rapide', 'quick shot')]] as const) {
      let shots = 0, hits = 0
      for (const r of Object.values(stats.controls[key] ?? {})) {
        if (!r) continue
        shots += r.shots
        hits += (r.accuracy ?? 0) * r.shots
      }
      if (shots) parts.push(`${label} ${pct(hits / shots)}`)
    }
    if (parts.length) box.append(el('p', 'salvage-note', tr(`Précision par commande : ${parts.join(', ')}.`, `Accuracy by control: ${parts.join(', ')}.`)))
  }
}

/** Qui est un combattant pour le joueur : lui-même, un coéquipier, un adversaire. */
export type Relation = 'self' | 'ally' | 'enemy'
/** Ce que le HUD montre d'un combattant dans le fil des éliminations. */
export interface FeedName { name: string; rel: Relation }
/** La plaque d'un combattant, au-dessus de sa tête : son nom, ses points de vie. */
export interface PlateInfo {
  name: string; hp: number; /** Ses points de vie de départ. */ max: number; rel: Relation; shield: boolean; bot: boolean
  /** Le joueur : son chargeur, de 0 à 1, et s'il est en train de le changer. */
  ammo?: number; reloading?: boolean
  /** Éliminé, en fantôme à sa base : secondes avant de revenir en jeu. */
  wait?: number
  /** Le joueur joue Betty : ce coéquipier blessé est à soigner (`heal`), ou il est au maximum de sa vie et sa seringue le traversera (`full`). */
  heal?: boolean; full?: boolean
}

/** Une plaque : ses éléments, et ce qu'elle montrait (pour ne toucher au DOM que si cela change). */
interface Plate {
  root: HTMLElement
  name: HTMLElement
  fill: HTMLElement
  /** Ce que le dernier coup a ôté, qui s'efface après la barre (on voit ce qu'on vient de perdre). */
  lag: HTMLElement
  value: HTMLElement
  ammo: HTMLElement
  shown: boolean
  hp: number
  max: number
}

/** Une graduation de la barre de vie tous les SEGMENT points : on y compte les coups qu'il reste à donner. */
const SEGMENT = 25

/**
 * En partie, à la façon de Brawl Stars : le score des deux camps (le sien en bleu, à gauche, celui
 * d'en face en rouge) et le chrono, une plaque au-dessus de chaque combattant (son nom, sa barre de
 * vie ; sous la sienne, son chargeur), le fil des éliminations, l'attente de celui qui vient de
 * tomber, et l'écran de fin : le verdict, une fiche sous chaque combattant de la scène, le retour.
 */
export class ArenaHud {
  private readonly root = el('div', 'arena-hud')
  private readonly scores = [el('strong', 'arena-score ally'), el('strong', 'arena-score enemy')]
  /** Les manches gagnées, une pastille par manche à gagner, sous chaque score. */
  private readonly pips = [el('span', 'arena-rounds ally'), el('span', 'arena-rounds enemy')]
  private readonly clock = el('span', 'arena-clock')
  private readonly goal = el('span', 'arena-goal')
  private readonly plates = el('div', 'arena-plates')
  private readonly plateOf = new Map<number, Plate>()
  private readonly feed = el('ul', 'arena-feed')
  private readonly wait = el('div', 'arena-wait')
  private readonly waitTitle = el('strong')
  private readonly waitClock = el('span')
  private readonly count = el('div', 'arena-count')
  private readonly vignette = el('div', 'arena-vignette')
  /** D'où viennent les coups qu'on prend : un arc par tireur, autour de soi (cf. threats). */
  private readonly threatBox = el('div', 'arena-threats')
  private readonly threatArcs: HTMLElement[] = []
  private readonly end = el('section', 'arena-end')
  /** Les fiches de l'écran de fin, par combattant, et le bouton du retour (son compte à rebours). */
  private readonly cards = new Map<number, HTMLElement>()
  private back: HTMLButtonElement | null = null
  private backIn = ''
  private readonly quit: HTMLButtonElement
  /** Spectateur : qui la vue suit, entre deux flèches pour passer au suivant. */
  private readonly watchBar = el('div', 'arena-spectate')
  private readonly watchName = el('strong')
  private watched = ''
  /** Écran de fin : ce que le site a répondu pour le classement. */
  private rankNote: HTMLElement | null = null
  onFollow?: (step: number) => void
  private shownCount = ''
  onQuit?: () => void

  constructor() {
    this.root.hidden = true
    this.root.setAttribute('role', 'group')
    this.root.setAttribute('aria-label', 'CMDR Arena')
    const board = el('div', 'arena-board')
    const middle = el('div', 'arena-middle')
    middle.append(this.clock, this.goal)
    board.append(this.scores[0], middle, this.scores[1], ...this.pips)
    this.plates.setAttribute('aria-hidden', 'true')
    this.quit = button(tr('Quitter', 'Leave'), () => this.onQuit?.(), 'arena-quit', 'sign-out')
    this.wait.hidden = true
    this.wait.append(this.waitTitle, this.waitClock)
    this.count.setAttribute('aria-live', 'assertive')
    this.feed.setAttribute('aria-live', 'polite')
    const previous = button('', () => this.onFollow?.(-1), 'arena-spectate-step', 'caret-left')
    previous.setAttribute('aria-label', tr('Combattant précédent', 'Previous fighter'))
    const next = button('', () => this.onFollow?.(1), 'arena-spectate-step', 'caret-right')
    next.setAttribute('aria-label', tr('Combattant suivant', 'Next fighter'))
    const who = el('span', 'arena-spectate-who')
    who.append(icon('eye'), el('em', '', tr('Spectateur', 'Spectating')), this.watchName)
    this.watchBar.hidden = true
    this.watchBar.append(previous, who, next)
    this.threatBox.setAttribute('aria-hidden', 'true')
    this.root.append(this.plates, this.threatBox, board, this.feed, this.quit, this.count, this.wait, this.watchBar)
    this.end.hidden = true
    this.end.setAttribute('role', 'dialog')
    this.end.setAttribute('aria-modal', 'true')
    this.end.setAttribute('aria-label', tr('Fin de la partie', 'Match over'))
    document.body.append(this.root, this.vignette, this.end)
  }

  /** La manette, à l'écran de fin : le stick tenu répète (cf. endPad). */
  private readonly endRepeat = new PadRepeat()

  get endOpen() {
    return !this.end.hidden
  }

  /** L'écran de fin contient-il cet élément ? (un clic dessus n'est pas un clic « à côté ») */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.end.contains(target)
  }

  /** Un mot en grand, au milieu de l'écran, un instant (le verdict, avant la scène de fin). */
  shout(text: string, warn = false) {
    this.shownCount = ''
    this.count.textContent = text
    this.count.classList.toggle('warn', warn)
    this.count.classList.remove('pop')
    void this.count.offsetWidth
    this.count.classList.add('pop')
  }

  /** @param watching spectateur : les deux camps à leurs couleurs du lobby, la barre du combattant suivi, pas de manette */
  show(on: boolean, watching = false) {
    this.root.hidden = !on
    this.quit.hidden = false
    // Les noms du bord laissent la place aux plaques de l'arène.
    document.body.classList.toggle('arena-on', on)
    document.body.classList.toggle('arena-watch', on && watching)
    for (const node of [this.root, this.end]) node.classList.toggle('watch', on && watching)
    this.watchBar.hidden = !(on && watching)
    this.watched = ''
    if (!on) {
      this.wait.hidden = true
      this.feed.replaceChildren()
      this.count.textContent = this.shownCount = ''
      this.plates.replaceChildren()
      this.plateOf.clear()
    }
  }

  /**
   * @param mine, theirs de son équipe et de celle d'en face : les points de la manche, les manches gagnées
   * @param round la manche en cours ; `wins` : manches à gagner
   * @param left secondes restantes ; `warmup` : secondes avant le coup d'envoi (0 : c'est parti)
   */
  board(mine: { score: number; rounds: number }, theirs: { score: number; rounds: number }, goal: number, round: number, wins: number, left: number, warmup: number) {
    ;[mine, theirs].forEach((side, i) => {
      this.scores[i].textContent = String(side.score)
      this.scores[i].classList.toggle('point', side.score === goal - 1)
      if (this.pips[i].childElementCount !== wins) this.pips[i].replaceChildren(...Array.from({ length: wins }, () => el('i')))
      ;[...this.pips[i].children].forEach((pip, n) => pip.classList.toggle('on', n < side.rounds))
    })
    const seconds = Math.ceil(left)
    this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    this.clock.classList.toggle('low', warmup <= 0 && left <= 30)
    this.goal.textContent = tr(`Manche ${round} · ${goal} pts`, `Round ${round} · ${goal} pts`)
    // Le décompte du coup d'envoi, puis le signal, un instant.
    const text = warmup > 0 ? String(Math.ceil(warmup)) : this.shownCount && this.shownCount !== 'go' ? 'go' : this.shownCount
    if (text === this.shownCount) return
    this.shownCount = text
    this.count.textContent = text === 'go' ? tr('Baston !', 'Brawl!') : text
    this.count.classList.remove('pop')
    void this.count.offsetWidth
    this.count.classList.add('pop')
    if (text === 'go') window.setTimeout(() => { if (this.shownCount === 'go') this.count.textContent = this.shownCount = '' }, 900)
  }

  /**
   * La plaque d'un combattant, au-dessus de sa tête (`at`, en pixels ; null : on ne le voit pas).
   * @param near de 0 (loin) à 1 (tout près) : la plaque rapetisse avec la distance, en vue subjective
   */
  plate(id: number, at: { x: number; y: number } | null, info: PlateInfo, near = 1) {
    let p = this.plateOf.get(id)
    if (!p) {
      if (!at) return
      const root = el('div', 'arena-plate')
      const name = el('span', 'arena-plate-name')
      const bar = el('div', 'arena-plate-bar')
      const lag = el('s')
      const fill = el('i')
      const value = el('b')
      bar.append(lag, fill, value)
      const ammo = el('div', 'arena-plate-ammo')
      ammo.append(el('i'))
      root.append(name, bar, ammo)
      this.plates.append(root)
      this.plateOf.set(id, (p = { root, name, fill, lag, value, ammo, shown: true, hp: -1, max: -1 }))
    }
    if (p.shown !== !!at) p.root.hidden = !(p.shown = !!at)
    if (!at) return
    p.root.className = `arena-plate ${info.rel}${info.shield ? ' shield' : ''}${info.reloading ? ' reloading' : ''}${info.wait !== undefined ? ' ghost' : ''}${info.heal ? ' heal-target' : ''}${info.full ? ' full' : ''}`
    if (p.max !== info.max) {
      p.max = info.max
      p.root.style.setProperty('--seg', `${((SEGMENT / Math.max(1, info.max)) * 100).toFixed(2)}%`)
    }
    p.root.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -100%) scale(${(0.6 + 0.4 * near).toFixed(2)})`
    const name = info.bot ? `🤖 ${info.name}` : info.name
    if (p.name.textContent !== name) p.name.textContent = name
    // En fantôme : le compte à rebours de son retour, à la place de sa vie.
    if (info.wait !== undefined) {
      const left = String(Math.max(1, Math.ceil(info.wait)))
      p.fill.style.width = `${Math.min(100, (1 - info.wait / ARENA_RULES.respawn) * 100).toFixed(0)}%`
      if (p.value.textContent !== left) p.value.textContent = left
      p.ammo.hidden = true
      return
    }
    const hp = Math.max(0, Math.round(info.hp))
    const width = `${Math.min(100, (hp / Math.max(1, info.max)) * 100).toFixed(0)}%`
    p.fill.style.width = width
    if (hp !== p.hp) {
      // Ce qu'il vient de perdre reste un instant, puis s'efface ; ce qu'il regagne se voit tout de suite.
      if (hp > p.hp) {
        p.lag.style.transition = 'none'
        p.lag.style.width = width
        void p.lag.offsetWidth
        p.lag.style.transition = ''
      } else p.lag.style.width = width
      p.hp = hp
    }
    if (p.value.textContent !== String(hp)) p.value.textContent = String(hp)
    p.ammo.hidden = info.ammo === undefined
    if (info.ammo !== undefined) (p.ammo.firstElementChild as HTMLElement).style.width = `${(info.ammo * 100).toFixed(0)}%`
  }

  dropPlate(id: number) {
    this.plateOf.get(id)?.root.remove()
    this.plateOf.delete(id)
  }

  /** Spectateur : le combattant que suit la vue (null : personne). */
  spectate(who: { name: string; rel: Relation; bot: boolean } | null) {
    const shown = who ? `${who.rel}:${who.bot}:${who.name}` : ''
    if (shown === this.watched) return
    this.watched = shown
    this.watchName.className = who?.rel ?? ''
    this.watchName.textContent = who ? (who.bot ? `🤖 ${who.name}` : who.name) : '…'
  }

  /** Écran de fin : la partie a été notée au classement (`ok`), ou pourquoi elle ne l'a pas été. */
  ranked(text: string, ok: boolean) {
    const note = this.rankNote
    if (!note) return
    note.replaceChildren(icon(ok ? 'check' : 'warning-circle'), text)
    note.className = `arena-end-rank ${ok ? 'ok' : 'no'}`
    note.hidden = false
  }

  /** Touché : le bord de l'écran rougit un instant (soigné : il verdit). */
  hurt(heal = false) {
    this.vignette.classList.remove('flash', 'heal')
    void this.vignette.offsetWidth
    this.vignette.classList.add('flash')
    this.vignette.classList.toggle('heal', heal)
  }

  /**
   * D'où viennent les coups qu'on prend : un arc à la couleur d'en face autour de soi (`center`, en
   * pixels : ses pieds vu de dessus, la mire dans les yeux), tourné vers chaque tireur, qui s'efface.
   * `angle` : 0 vers le haut de l'écran (devant soi), dans le sens des aiguilles d'une montre ;
   * `alpha` : de 1 (il vient de tirer) à 0 ; `heavy` : un gros coup (l'arc est plus épais).
   */
  threats(list: { angle: number; alpha: number; heavy: boolean }[], center: { x: number; y: number } | null) {
    this.threatBox.hidden = !center || !list.length
    if (!center) return
    this.threatBox.style.transform = `translate(${center.x.toFixed(1)}px, ${center.y.toFixed(1)}px)`
    while (this.threatArcs.length < list.length) {
      const arc = el('i', 'arena-threat')
      this.threatBox.append(arc)
      this.threatArcs.push(arc)
    }
    this.threatArcs.forEach((arc, i) => {
      const t = list[i]
      arc.hidden = !t
      if (!t) return
      arc.style.transform = `rotate(${t.angle.toFixed(3)}rad)`
      arc.style.opacity = t.alpha.toFixed(2)
      arc.classList.toggle('heavy', t.heavy)
    })
  }

  /** Une élimination dans le fil : qui, avec quoi (le personnage, son arme), qui. */
  kill(by: FeedName | null, victim: FeedName, character: CharacterId, mine: boolean) {
    const li = el('li', mine ? 'mine' : '')
    const c = characterById(character)
    if (by) li.append(el('span', by.rel, by.name))
    li.append(badge(c, 'arena-feed-char'), el('em', '', c.arm.name), el('span', victim.rel, victim.name))
    this.feed.append(li)
    while (this.feed.children.length > 5) this.feed.firstElementChild!.remove()
    window.setTimeout(() => li.remove(), 6000)
  }

  /** Éliminé : par qui, le temps qu'il reste avant de revenir en jeu ; `by` null : on est debout. */
  waiting(by: string | null, seconds: number) {
    const on = by !== null
    this.wait.hidden = !on
    if (!on) return
    this.waitTitle.textContent = by ? tr(`Éliminé par ${by}`, `Taken out by ${by}`) : tr('Éliminé', 'Taken out')
    this.waitClock.textContent = tr(`De retour en jeu dans ${Math.max(1, Math.ceil(seconds))} s`, `Back in play in ${Math.max(1, Math.ceil(seconds))} s`)
  }

  /**
   * L'écran de fin, par-dessus la scène où les combattants sont alignés : en haut, qui gagne et le
   * score ; sous chaque combattant, sa fiche (éliminations, chutes ou soins, dégâts, et sa part de
   * ce qu'a fait son équipe ; le joueur star) ; en bas, le retour au lobby, à gauche le
   * récapitulatif complet (précision, meilleure série…), à droite le personnage de la partie suivante.
   * @param order les combattants, de gauche à droite de la scène
   * @param title le verdict d'un spectateur (« Victoire de l'équipe Orange ») : pour lui, ni victoire ni défaite
   * @param next le personnage du joueur pour la partie suivante, et quoi faire s'il en change (pas pour un spectateur)
   */
  showEnd(r: ArenaEnd, team: number, self: number, order: number[], onBack: () => void, title?: string, next?: { character: CharacterId; pick(id: CharacterId): void }) {
    this.end.replaceChildren()
    this.cards.clear()
    this.quit.hidden = true
    this.watchBar.hidden = true
    this.count.textContent = this.shownCount = ''
    const won = r.winner === team
    const verdict = r.winner < 0 ? 'draw' : won || title ? 'won' : 'lost'
    const head = el('header', `arena-end-head ${verdict}`)
    // Le score de la partie : les manches ; dessous, les points de la dernière.
    const score = el('p', 'arena-end-score')
    score.append(el('strong', 'ally', String(r.rounds[team])), el('i', '', '–'), el('strong', 'enemy', String(r.rounds[1 - team])))
    const last = `${r.score[team]} – ${r.score[1 - team]}`
    // Ce que le site répond pour le classement vient ensuite (cf. ranked).
    this.rankNote = el('p', 'arena-end-rank')
    this.rankNote.hidden = true
    head.append(
      el('h2', title ? 'long' : '', title ?? (r.winner < 0 ? tr('Égalité', 'Draw') : won ? tr('Victoire !', 'Victory!') : tr('Défaite', 'Defeat'))),
      score,
      el('p', 'arena-end-note', r.reason === 'forfeit'
        ? tr('L\'équipe d\'en face a quitté l\'arène.', 'The other team left the arena.')
        : tr(`Dernière manche : ${last}${r.reason === 'time' ? ', au temps' : ''}`, `Last round: ${last}${r.reason === 'time' ? ', on time' : ''}`)),
      this.rankNote,
    )
    // Le joueur star : celui qui a le plus éliminé (à égalité, le plus blessé).
    const star = [...r.stats].sort((a, b) => b.kills - a.kills || b.damage - a.damage)[0]
    const cards = el('div', 'arena-cards')
    // Sa part de ce qu'a fait son équipe : ses dégâts et ses soins, rapportés aux siens.
    const share = (s: ArenaStats) => {
      const total = r.stats.filter((x) => x.team === s.team).reduce((n, x) => n + x.damage + x.heal, 0)
      return total ? (s.damage + s.heal) / total : 0
    }
    for (const id of order) {
      const s = r.stats.find((x) => x.id === id)
      if (!s) continue
      const starred = s === star && star.kills > 0
      const card = el('article', `arena-card ${s.id === self ? 'self' : s.team === team ? 'ally' : 'enemy'}${starred ? ' star' : ''}`)
      if (starred) card.append(el('span', 'arena-star', tr('★ Joueur star', '★ Star player')))
      const name = el('strong', 'arena-card-name')
      if (s.bot) name.append(icon('robot'))
      name.append(s.name)
      const c = characterById(s.character)
      const role = el('span', 'arena-card-char', c.name)
      role.style.setProperty('--char', c.color)
      const stats = el('dl', 'arena-card-stats')
      // Betty : ses soins, à la place des chutes.
      const third: [number, string] = s.heal > 0 ? [s.heal, tr('Soins', 'Heals')] : [s.deaths, tr('Chutes', 'Deaths')]
      for (const [value, label] of [[s.kills, tr('Élim.', 'Kills')], third, [s.damage, tr('Dégâts', 'Damage')]] as const) {
        const cell = el('div')
        cell.append(el('dd', '', String(value)), el('dt', '', label))
        stats.append(cell)
      }
      // Sa part de l'équipe, en barre.
      const part = el('p', 'arena-card-share')
      const bar = el('i')
      bar.style.setProperty('--fill', `${Math.round(share(s) * 100)}%`)
      part.append(bar, el('span', '', tr(`${Math.round(share(s) * 100)} % de l'équipe`, `${Math.round(share(s) * 100)}% of the team`)))
      card.append(name, role, stats, part)
      card.hidden = true
      cards.append(card)
      this.cards.set(id, card)
    }
    const back = button(tr('Retour au lobby', 'Back to the lobby'), () => {
      this.closeEnd()
      onBack()
    }, 'arena-back', 'door-open')
    this.back = back
    this.backIn = ''
    // Le récapitulatif complet : un tableau, les siens d'abord.
    const recap = this.recap(r, team, self, share)
    const open = button(tr('Récapitulatif', 'Summary'), () => {
      recap.hidden = !recap.hidden
      open.setAttribute('aria-expanded', String(!recap.hidden))
      open.classList.toggle('on', !recap.hidden)
    }, 'arena-end-recap', 'grid-four')
    open.setAttribute('aria-expanded', 'false')
    this.end.append(head, cards, recap, open, back)
    // Le personnage de la partie suivante : on en change d'ici, il vaudra au retour au lobby.
    if (next) this.end.append(this.nextPick(next))
    this.end.className = `arena-end ${verdict}${title ? ' watch' : ''}`
    this.end.hidden = false
    document.body.classList.add('arena-end-on')
    back.focus()
  }

  /** Le récapitulatif de fin : chaque combattant, ses éliminations, chutes, dégâts, soins, précision, meilleure série, part de l'équipe. */
  private recap(r: ArenaEnd, team: number, self: number, share: (s: ArenaStats) => number): HTMLElement {
    const box = el('section', 'arena-recap')
    box.hidden = true
    box.setAttribute('aria-label', tr('Récapitulatif de la partie', 'Match summary'))
    const table = el('table', 'arena-recap-table')
    const head = el('tr')
    for (const h of [tr('Joueur', 'Player'), tr('Personnage', 'Character'), tr('Élim.', 'Kills'), tr('Chutes', 'Deaths'), tr('Dégâts', 'Damage'), tr('Soins', 'Heals'), tr('Précision', 'Accuracy'), tr('Série', 'Streak'), tr('Part', 'Share')]) head.append(el('th', '', h))
    table.append(el('thead'), el('tbody'))
    table.tHead!.append(head)
    const rows = [...r.stats].sort((a, b) => Number(b.team === team) - Number(a.team === team) || b.kills - a.kills || b.damage - a.damage)
    for (const s of rows) {
      const tr_ = el('tr', s.id === self ? 'self' : s.team === team ? 'ally' : 'enemy')
      const c = characterById(s.character)
      const who = el('td', 'arena-recap-name')
      if (s.bot) who.append(icon('robot'))
      who.append(s.name)
      const char = el('td', 'arena-recap-char', c.name)
      char.style.setProperty('--char', c.color)
      const accuracy = s.shots ? `${Math.round(((s.hits ?? 0) / s.shots) * 100)} %` : '—'
      tr_.append(who, char)
      for (const v of [s.kills, s.deaths, s.damage, s.heal || '—', accuracy, s.best ?? '—', `${Math.round(share(s) * 100)} %`]) tr_.append(el('td', '', String(v)))
      table.tBodies[0].append(tr_)
    }
    box.append(table, el('p', 'arena-recap-note', tr(
      'Précision : les projectiles qui ont blessé ou soigné (une graine dont la fleur a mordu, un cocktail dont l\'éclat ou la flaque a brûlé). Part : ses dégâts et ses soins, sur ceux de son équipe.',
      'Accuracy: projectiles that hurt or healed (a seed whose flower bit, a cocktail whose blast or puddle burned). Share: damage and heals, out of the team\'s.',
    )))
    return box
  }

  /** Le personnage de la partie suivante : six visages ; le choisi ressort. */
  private nextPick(next: { character: CharacterId; pick(id: CharacterId): void }): HTMLElement {
    const box = el('nav', 'arena-next')
    box.setAttribute('aria-label', tr('Personnage pour la partie suivante', 'Character for the next match'))
    box.append(el('span', 'arena-next-label', tr('Partie suivante', 'Next match')))
    const draw = (current: CharacterId) => {
      for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
        const on = b.dataset.key === `next-${current}`
        b.classList.toggle('on', on)
        b.setAttribute('aria-pressed', String(on))
      }
    }
    for (const c of CHARACTERS) {
      const b = button('', () => {
        next.pick(c.id)
        draw(c.id)
      }, 'arena-next-pick')
      b.dataset.key = `next-${c.id}`
      b.title = c.name
      b.setAttribute('aria-label', tr(`Jouer ${c.name} à la partie suivante`, `Play ${c.name} next match`))
      b.style.setProperty('--char', c.color)
      b.append(faceOf(c, 'arena-face mini'))
      box.append(b)
    }
    draw(next.character)
    // Les visages arrivent (ils se rendent à la première ouverture du terminal) : on les pose.
    void loadPortraits().then(() => {
      for (const c of CHARACTERS) box.querySelector(`[data-key="next-${c.id}"] .arena-face`)?.replaceWith(faceOf(c, 'arena-face mini'))
    })
    return box
  }

  /** Pose la fiche d'un combattant sous ses pieds (`at`, en pixels ; null : hors du cadre). */
  card(id: number, at: { x: number; y: number } | null) {
    const card = this.cards.get(id)
    if (!card) return
    card.hidden = !at
    if (at) card.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translateX(-50%)`
  }

  /** Secondes avant le retour de soi-même au lobby : le bouton les compte. */
  endClock(seconds: number) {
    const left = seconds > 0 ? String(Math.ceil(seconds)) : ''
    if (!this.back || left === this.backIn) return
    this.backIn = left
    this.back.dataset.left = left
  }

  closeEnd() {
    this.end.hidden = true
    document.body.classList.remove('arena-end-on')
  }

  /** La manette sur l'écran de fin : le stick va d'un bouton à l'autre, A l'actionne. */
  endPad(input: PanelPad, dt: number) {
    const dir = this.endRepeat.step(input.moveX, input.moveY, dt)
    if (dir || input.interact) this.end.classList.add('pad-nav')
    if (dir) moveFocus(this.end, dir[0], dir[1])
    if (!input.interact) return
    const active = document.activeElement
    if (active instanceof HTMLElement && this.end.contains(active)) active.click()
    else moveFocus(this.end, 0, 1)
  }
}
