import { courtBoards, sportRecords, type BoardId, type SportId } from './arcade/game'
import { fetchBoard, localBest, type ScoreGame } from './arcade/scores'
import { sportSkins } from './economy/data'
import { setLegends } from './furniture/legends'
import type { GameEmbed } from './game-embed'
import { EN, tr } from './i18n'

/*
 * Le Vestiaire des Légendes, au complexe d'entraînement de la cale (cf. src/furniture/legends.ts) :
 * le mur des maillots floqués au nom des recordmen du bord, et le casier du joueur, qui garde ses
 * records et les tenues de sport du Holo-Me qu'ils gagnent (cf. `sportSkins` dans economy.json :
 * le site les verse au CMDR qui atteint le palier, comme les apparences des quêtes).
 */

interface LegendSport {
  game: ScoreGame
  sport: string
  /** Couleurs du maillot (corps, liserés). */
  color: string
  trim: string
  /** La tenue de sport que son record gagne (clé de skins.ts). */
  skin: string
  outfit: string
  /** Où l'on joue. */
  where: string
}

export const LEGEND_SPORTS: LegendSport[] = [
  { game: 'gym-basket', sport: tr('BASKET', 'BASKETBALL'), color: '#e07b2c', trim: '#141414', skin: 'suit.basket', outfit: tr('Maillot de basket', 'Basketball kit'), where: tr('au terrain de basket', 'on the basketball court') },
  { game: 'gym-foot', sport: 'FOOT', color: '#2fa04c', trim: '#ffffff', skin: 'suit.football', outfit: tr('Tenue de foot', 'Football kit'), where: tr('aux tirs au but', 'at the penalty shootout') },
  { game: 'gym-range', sport: tr('TIR', 'SHOOTING'), color: '#6b7444', trim: '#f0d890', skin: 'suit.marksman', outfit: tr('Tenue de tireur', 'Marksman kit'), where: tr('au stand de tir', 'at the shooting range') },
  { game: 'gym-punch', sport: tr('BOXE', 'BOXING'), color: '#d8302c', trim: '#ffffff', skin: 'suit.boxer', outfit: tr('Tenue de boxe', 'Boxing kit'), where: tr('au sac de frappe', 'on the punching bag') },
]

const number = (n: number) => n.toLocaleString(EN ? 'en-GB' : 'fr-FR')

/** Qui détient le record d'un sport, d'après les tableaux que le jeu garde déjà (cf. scores.ts). */
function holder(game: ScoreGame): { cmdr: string; score: number } | null {
  const board = courtBoards[game as BoardId]
  if (board) return board[0] ?? null
  return sportRecords[game as SportId] ?? null
}

/** Le mur des maillots suit les records du bord. */
export function initLegends() {
  setLegends(() => LEGEND_SPORTS.map((s) => {
    const best = holder(s.game)
    return { sport: s.sport, color: s.color, trim: s.trim, holder: best?.cmdr ?? null, score: best?.score ?? null }
  }))
}

/** Comment gagner une tenue de sport (au Holo-Me), ou null si ce n'en est pas une. */
export function sportSkinHint(product: string | null): string | null {
  if (!product) return null
  const rule = sportSkins()[product]
  const sport = LEGEND_SPORTS.find((s) => s.skin === product)
  if (!rule || !sport) return null
  return tr(
    `Cette tenue ne s'achète pas : elle se gagne avec un record de ${number(rule.score)} points ${sport.where}. Voyez votre casier, au Vestiaire des Légendes (cale).`,
    `This kit can't be bought: it's earned with a record of ${number(rule.score)} points ${sport.where}. Check your locker in the Legends' locker room (hold).`,
  )
}

/**
 * Le casier du joueur : pour chaque sport, son record, celui du bord, et la tenue qu'il gagne
 * (déjà gagnée, gagnée et en route, ou ce qu'il reste à marquer).
 */
export function openLocker(embed: GameEmbed, o: { owns: (product: string) => boolean; linked: boolean; loginUrl: string }) {
  const body = document.createElement('div')
  body.className = 'locker-panel'
  const intro = document.createElement('p')
  intro.className = 'locker-intro'
  intro.textContent = o.linked
    ? tr('Votre casier : vos records, et les tenues de sport qu\'ils vous gagnent. Elles vous attendent au Holo-Me de vos quartiers.', 'Your locker: your records, and the sportswear they earn you. It waits for you at the Holo-Me in your quarters.')
    : tr('Votre casier : vos records de ce navigateur. Les tenues de sport se gagnent en CMDR : connectez-vous au site.', 'Your locker: your records in this browser. Sportswear is earned as a CMDR: sign in to the site.')
  const grid = document.createElement('div')
  grid.className = 'locker-grid'
  const rules = sportSkins()
  for (const s of LEGEND_SPORTS) {
    const rule = rules[s.skin]
    const card = document.createElement('article')
    card.className = 'locker-card'
    card.style.setProperty('--kit', s.color)
    card.style.setProperty('--trim', s.trim)
    const shirt = document.createElement('div')
    shirt.className = 'locker-shirt'
    shirt.textContent = '1'
    const title = document.createElement('h3')
    title.textContent = s.sport
    const legend = document.createElement('p')
    legend.className = 'locker-legend'
    const best = holder(s.game)
    legend.textContent = best ? tr(`Record du bord : ${best.cmdr}, ${number(best.score)}`, `Ship record: ${best.cmdr}, ${number(best.score)}`) : tr('Record du bord : à prendre', 'Ship record: up for grabs')
    const mine = document.createElement('p')
    mine.className = 'locker-mine'
    const bar = document.createElement('div')
    bar.className = 'locker-bar'
    const fill = document.createElement('span')
    bar.append(fill)
    const outfit = document.createElement('p')
    outfit.className = 'locker-outfit'
    const show = (score: number) => {
      mine.textContent = tr(`Votre record : ${number(score)}`, `Your record: ${number(score)}`)
      const goal = rule?.score ?? 0
      fill.style.width = `${goal ? Math.min(100, (score / goal) * 100) : 0}%`
      card.classList.toggle('done', o.owns(s.skin))
      outfit.textContent = o.owns(s.skin)
        ? tr(`${s.outfit} : gagnée, au Holo-Me.`, `${s.outfit}: earned, at the Holo-Me.`)
        : !goal ? s.outfit
          : score >= goal
            ? (o.linked ? tr(`${s.outfit} : palier atteint, le site la verse à votre Holo-Me.`, `${s.outfit}: tier reached, the site adds it to your Holo-Me.`) : tr(`${s.outfit} : palier atteint ! Connectez-vous pour la recevoir.`, `${s.outfit}: tier reached! Sign in to receive it.`))
            : tr(`${s.outfit} : encore ${number(goal - score)} points ${s.where}.`, `${s.outfit}: ${number(goal - score)} more points ${s.where}.`)
    }
    show(localBest(s.game))
    // Le meilleur score gardé par le site, s'il est plus haut que celui du navigateur.
    void fetchBoard(s.game).then((b) => { if (b?.me && b.me.score > localBest(s.game)) show(b.me.score) })
    card.append(shirt, title, legend, mine, bar, outfit)
    grid.append(card)
  }
  body.append(intro, grid)
  if (!o.linked) {
    const login = document.createElement('a')
    login.className = 'locker-login'
    login.href = o.loginUrl
    login.textContent = tr('Se connecter au site', 'Sign in to the site')
    body.append(login)
  }
  embed.openPanel({
    kicker: tr('CALE · VESTIAIRE DES LÉGENDES', 'HOLD · LEGENDS\' LOCKER ROOM'),
    title: tr('Votre casier', 'Your locker'),
    hint: tr('Vos records, ceux du bord, et les tenues de sport qu\'ils gagnent.', 'Your records, the ship\'s, and the sportswear they earn.'),
    body,
    skin: 'locker-skin',
  })
}
