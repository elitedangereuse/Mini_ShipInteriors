import * as THREE from 'three'
import { Avatar } from '../avatar'
import { tr } from '../i18n'
import { suitRig, type SuitStyle } from '../looks'
import { dampAngle } from '../player'

/*
 * Tessa, l'arbitre de l'arène : ancienne championne de CQC, elle tient le guichet du lobby (cf.
 * ARENA_BOOTH dans shared/arena.js, et `arena-booth` dans src/furniture/arena.ts). Derrière sa
 * vitre, elle inscrit les équipes, commente les scores et distribue des conseils que personne ne
 * lui a demandés. Elle se tourne vers qui s'approche du comptoir. Elle n'existe que dans
 * l'affichage (chaque client a la sienne).
 */

export const REFEREE = 'Tessa'

/** Combinaison d'arbitre : noire, liserés orange d'un côté de l'insigne, bleus de l'autre dans l'idée. */
const REFEREE_SUIT: SuitStyle = {
  ramp: [[0, '#0d0e11'], [0.35, '#1f2228'], [0.6, '#3a3f49'], [0.85, '#ff8a1c'], [1, '#ffe2bd']],
  glove: '#16181c',
  helmet: 'none',
  shell: '#23262c',
  visor: '#000000',
  light: '#3fc8ff',
}

/** Le sifflet autour du cou, et le brassard bleu : l'autre équipe. */
function addRefereeGear(root: THREE.Object3D) {
  const torso = root.getObjectByName('torso')
  if (!torso) return
  const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: '#d9dde3' }))
  whistle.position.set(0, 0.06, 0.15)
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.004), new THREE.MeshBasicMaterial({ color: '#3fc8ff' }))
  band.position.set(0.09, 0.1, 0.142)
  torso.add(whistle, band)
}

export async function refereeRig() {
  const r = await suitRig('female', 'a', REFEREE_SUIT)
  addRefereeGear(r.root)
  return r
}

/** Ce que Tessa sait du joueur quand il lui parle (cf. client.ts). */
export interface RefereeReport {
  /** Le lobby du terminal où il s'est placé : son numéro, son format, s'il a des bots. */
  lobby: { id: number; size: number; bots: boolean; players: number } | null
  /** Sa dernière partie : gagnée (ou égalité : null), ses éliminations et ses morts. */
  last: { won: boolean | null; kills: number; deaths: number } | null
  /** Parties en cours dans les autres lobbys. */
  playing: number
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

const SMALL_TALK = [
  tr('Bienvenue à l\'arène. Les règles tiennent en une ligne : on tire sur ceux d\'en face. J\'ai quand même dû l\'écrire.', 'Welcome to the arena. The rules fit on one line: shoot the other side. I still had to write it down.'),
  tr('J\'ai fait dix ans de CQC. Maintenant j\'arbitre. On me paie pour regarder les autres rater ce que je réussissais.', 'I did ten years of CQC. Now I referee. I get paid to watch others miss what I used to hit.'),
  tr('Le terminal est juste là, contre le mur. Quatre lobbys. Choisissez-en un, un camp, une arme. Dans cet ordre.', 'The terminal is right there, on the wall. Four lobbies. Pick one, a side, a weapon. In that order.'),
  tr('Odile, à côté, envoie les gens dans le noir chercher des caisses. Ici au moins, on allume la lumière avant de vous tirer dessus.', 'Odile next door sends people into the dark to fetch crates. Here at least we turn the lights on before shooting at you.'),
  tr('Les bots ? Je les ai entraînés moi-même. Les recrues ratent une porte de hangar. Les élites ne ratent pas.', 'The bots? Trained them myself. Rookies miss a hangar door. Elites don\'t.'),
  tr('Personne ne meurt, ici. On tombe, on boude trois secondes, on revient. C\'est écrit dans l\'assurance.', 'Nobody dies here. You go down, sulk for three seconds, come back. It\'s in the insurance.'),
  tr('Ne tapez pas sur la vitre, elle est d\'époque. L\'époque où je jouais encore.', 'Don\'t knock on the glass, it\'s vintage. From back when I still played.'),
]

const TIPS = [
  tr('Les conteneurs arrêtent tout. Les caisses aussi. Vos coéquipiers, non : les balles les traversent. Ne me demandez pas comment.', 'Containers stop everything. Crates too. Your teammates don\'t: bullets go through them. Don\'t ask me how.'),
  tr('Le fusil, deux balles et c\'est réglé. Mais trois dans le chargeur, et il faut être à l\'arrêt. Choisissez votre coin.', 'The rifle: two rounds and it\'s done. But only three in the mag, and you have to stand still. Pick your corner.'),
  tr('Le fusil à pompe ne sert à rien de loin. De près, il ne sert à rien d\'être en face.', 'The shotgun is useless at range. Up close, it\'s useless to be on the other end.'),
  tr('Le lance-plasma, pas à bout portant. Vous riez, mais j\'ai le registre des gens qui ont essayé.', 'Plasma launcher: not at point-blank. Laugh all you want, I keep a list of those who tried.'),
  tr('Quand vous revenez à votre base, vous êtes protégé deux secondes. Sauf si vous tirez. La patience, ça protège.', 'When you come back at base you\'re shielded for two seconds. Unless you fire. Patience protects.'),
  tr('Cinq secondes sans prendre une balle, et vous récupérez. Reculer n\'est pas fuir. Enfin si, mais ça marche.', 'Five seconds without taking a round and you recover. Falling back isn\'t fleeing. Well, it is, but it works.'),
  tr('Vu de dessus, vous ne voyez que ce qui est en ligne de vue. Les conteneurs cachent les gens. C\'est fait pour.', 'From above, you only see what\'s in line of sight. Containers hide people. That\'s the point.'),
  tr('La cour du milieu, tout le monde y passe. Donc tout le monde la vise. Faites le tour par une allée.', 'Everyone goes through the middle yard. So everyone aims at it. Go around by an alley.'),
]

function reportLines(r: RefereeReport): string[] {
  const lines: string[] = []
  if (r.lobby) {
    lines.push(r.lobby.players > 1
      ? tr(`Lobby ${r.lobby.id}, ${r.lobby.size} contre ${r.lobby.size}, vous êtes ${r.lobby.players}. J'attends que tout le monde soit prêt, et j'ouvre.`, `Lobby ${r.lobby.id}, ${r.lobby.size} vs ${r.lobby.size}, ${r.lobby.players} of you. Once everyone's ready, I open up.`)
      : r.lobby.bots
        ? tr(`Lobby ${r.lobby.id}, seul avec mes bots. Dites « prêt » au terminal, ils n'attendent que ça.`, `Lobby ${r.lobby.id}, alone with my bots. Say “ready” at the terminal, that's all they're waiting for.`)
        : tr(`Lobby ${r.lobby.id}, seul et sans bots. Il vous faut quelqu'un en face, ou je vous prête des drones.`, `Lobby ${r.lobby.id}, alone and no bots. You need someone across, or I can lend you some drones.`))
  } else lines.push(tr('Vous n\'êtes inscrit nulle part. Le terminal, contre le mur : placez-vous dans un lobby.', 'You\'re not signed up anywhere. The terminal, on the wall: pick a lobby.'))
  if (r.playing > 0) lines.push(tr(`${r.playing} partie${r.playing > 1 ? 's' : ''} en cours en ce moment. Écoutez : ça, c'est un lance-plasma qui rate.`, `${r.playing} match${r.playing > 1 ? 'es' : ''} on right now. Listen: that's a plasma launcher missing.`))
  if (r.last) {
    if (r.last.won === true) lines.push(tr(`Victoire, ${r.last.kills} élimination${r.last.kills > 1 ? 's' : ''}. C'est noté. Ne prenez pas la grosse tête, elle fait une plus grosse cible.`, `A win, ${r.last.kills} kill${r.last.kills === 1 ? '' : 's'}. Noted. Don't get a big head, it makes a bigger target.`))
    else if (r.last.won === false) lines.push(r.last.deaths > r.last.kills * 2
      ? tr(`${r.last.deaths} fois au tapis. Je n'ai rien dit. Changez d'arme, ou de trottoir.`, `Down ${r.last.deaths} times. I said nothing. Change weapons, or sides of the street.`)
      : tr('Défaite, mais honorable. La revanche est gratuite, comme tout le reste ici.', 'A loss, but an honourable one. The rematch is free, like everything else here.'))
    else lines.push(tr('Égalité. Je déteste les égalités. Retournez-y et réglez ça.', 'A draw. I hate draws. Get back in there and settle it.'))
  }
  return lines
}

/** Tessa derrière sa vitre : elle surveille le lobby, se tourne vers qui s'approche, parle. */
export class Referee {
  readonly avatar: Avatar
  readonly root: THREE.Group
  private time = Math.random() * 10
  private recent: string[] = []

  /** @param yaw cap au repos : face au lobby */
  constructor(rig: Awaited<ReturnType<typeof refereeRig>>, at: { x: number; z: number }, private baseYaw: number) {
    this.avatar = new Avatar(rig)
    this.root = this.avatar.root
    this.root.position.set(at.x, 0, at.z)
    this.root.rotation.y = baseYaw
  }

  /** Une réplique (pas deux fois la même de suite) : ce qu'elle sait du joueur d'abord, souvent. */
  talk(report: RefereeReport): string {
    const news = reportLines(report).filter((l) => !this.recent.includes(l))
    const pool = news.length && Math.random() < 0.6 ? news : [...news, ...SMALL_TALK, ...TIPS].filter((l) => !this.recent.includes(l))
    const line = pick(pool.length ? pool : SMALL_TALK)
    this.recent = [...this.recent, line].slice(-6)
    this.avatar.playEmote(pick(['oui', 'salut', 'non']))
    return line
  }

  /** @param near où se tient le joueur, s'il est près du comptoir */
  update(dt: number, near: THREE.Vector3 | null) {
    this.time += dt
    // Au repos, son regard balaie le lobby ; quelqu'un au comptoir : elle le regarde.
    const p = this.root.position
    const goal = near ? Math.atan2(near.x - p.x, near.z - p.z) : this.baseYaw + Math.sin(this.time * 0.5) * 0.5
    this.root.rotation.y = dampAngle(this.root.rotation.y, goal, 5, dt)
    this.avatar.update(dt)
  }
}
