// MESS RUSH : la semaine des récompenses (cf. docs/mess-rush-site.md). Elle bascule chaque jeudi, à
// une heure et dans un fuseau qui restent à décider : ils se règlent dans economy.json
// (`messRush.reset`), et, tant qu'ils valent null, on prend la bascule de la boutique de boosters
// (le jeudi à 7 h UTC).
//
// C'est le site qui tient les comptes : ce module est l'implémentation de référence de son calcul
// (le site la reproduit en PHP, avec les mêmes cas de test, cf. server/mess-rush-week.test.js), et
// le jeu s'en sert pour dire quand vient la prochaine bascule. La semaine d'une partie dépend de
// l'heure de sa fin (`endedAt`, horodatée par le relais), jamais d'un délai de sept jours depuis la
// dernière victoire.

const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

/** La bascule par défaut, celle de la boutique de boosters : le jeudi à 7 h UTC. */
export const DEFAULT_RESET = { day: 'thursday', hour: 7, tz: 'UTC' }

/** La bascule réglée (economy.json), complétée par celle de la boutique pour ce qui vaut null. */
export function resetRule(reset) {
  return {
    day: DAYS[reset?.day] !== undefined ? reset.day : DEFAULT_RESET.day,
    hour: Number.isInteger(reset?.hour) && reset.hour >= 0 && reset.hour < 24 ? reset.hour : DEFAULT_RESET.hour,
    tz: typeof reset?.tz === 'string' && reset.tz ? reset.tz : DEFAULT_RESET.tz,
  }
}

/** La date et l'heure murales de l'instant `ms` dans le fuseau `tz`. */
function wall(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long',
  }).formatToParts(new Date(ms))
  const get = (type) => parts.find((p) => p.type === type).value
  return { y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour'), min: +get('minute'), s: +get('second'), weekday: DAYS[get('weekday').toLowerCase()] }
}

/** Le décalage du fuseau à l'instant `ms` (ms à ajouter à l'UTC pour l'heure murale). */
function offset(ms, tz) {
  const w = wall(ms, tz)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(ms / 1000) * 1000
}

/**
 * L'instant UTC où l'heure murale du fuseau vaut (y, m, d, h:00). À un changement d'heure, l'heure
 * qui n'existe pas (le printemps) glisse à la suivante ; celle qui existe deux fois (l'automne) est
 * prise la première fois.
 */
function at(y, m, d, h, tz) {
  const guess = Date.UTC(y, m - 1, d, h)
  // Le décalage du fuseau la veille, le jour même et le lendemain : de part et d'autre d'un
  // changement d'heure, chacun donne un instant possible.
  const candidates = [-1, 0, 1].map((k) => guess - offset(guess + k * 86400000, tz))
  // Ceux qui tombent bien à h:00 ce jour-là (deux à l'automne : le premier) ; aucun au printemps :
  // l'heure n'existe pas, on prend l'instant d'après le saut.
  const exact = candidates.filter((ms) => {
    const w = wall(ms, tz)
    return w.y === y && w.m === m && w.d === d && w.h === h && w.min === 0
  })
  return exact.length ? Math.min(...exact) : Math.max(...candidates)
}

/**
 * Le début de la semaine où tombe l'instant `ms` : la dernière bascule (jour et heure réglés, dans
 * le fuseau réglé) qui n'est pas après lui.
 */
export function weekStart(ms, reset) {
  const r = resetRule(reset)
  const w = wall(ms, r.tz)
  // Le jour de bascule le plus récent (aujourd'hui compris), en date murale.
  const back = (w.weekday - DAYS[r.day] + 7) % 7
  const day = new Date(Date.UTC(w.y, w.m - 1, w.d - back))
  let start = at(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), r.hour, r.tz)
  // Le jour même, avant l'heure de la bascule : c'est la semaine d'avant.
  if (start > ms) {
    const prev = new Date(Date.UTC(w.y, w.m - 1, w.d - back - 7))
    start = at(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), r.hour, r.tz)
  }
  return start
}

/** La prochaine bascule après l'instant `ms`. */
export function nextReset(ms, reset) {
  const r = resetRule(reset)
  const start = weekStart(ms, r)
  const w = wall(start, r.tz)
  const next = new Date(Date.UTC(w.y, w.m - 1, w.d + 7))
  return at(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), r.hour, r.tz)
}

/** Deux instants sont-ils dans la même semaine des récompenses ? */
export function sameWeek(a, b, reset) {
  return weekStart(a, reset) === weekStart(b, reset)
}
