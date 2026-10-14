// MESS RUSH, la semaine des récompenses (shared/mess-rush-week.js) : la bascule du jeudi, à l'heure
// et dans le fuseau réglés (ou ceux de la boutique de boosters tant qu'ils ne le sont pas), autour
// de la bascule, aux changements d'heure, et jamais un délai glissant de sept jours. Ce sont aussi
// les cas que le site reproduit (cf. docs/mess-rush-site.md).
//   npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_RESET, nextReset, resetRule, sameWeek, weekStart } from '../shared/mess-rush-week.js'

const utc = (s) => Date.parse(`${s}Z`)
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z')

test('sans heure ni fuseau décidés : la bascule de la boutique, le jeudi à 7 h UTC', () => {
  assert.deepEqual(resetRule({ day: 'thursday', hour: null, tz: null }), DEFAULT_RESET)
  assert.deepEqual(resetRule(undefined), DEFAULT_RESET)
  // Jeudi 15 octobre 2026.
  assert.equal(iso(weekStart(utc('2026-10-15T07:00:00'))), '2026-10-15T07:00:00Z')
  assert.equal(iso(weekStart(utc('2026-10-15T06:59:59'))), '2026-10-08T07:00:00Z')
  assert.equal(iso(weekStart(utc('2026-10-21T23:00:00'))), '2026-10-15T07:00:00Z')
  assert.equal(iso(nextReset(utc('2026-10-14T12:00:00'))), '2026-10-15T07:00:00Z')
})

test('une partie finie à 6 h 59 compte pour la semaine qui s\'achève, même reçue à 7 h 01', () => {
  const ended = utc('2026-10-15T06:59:00')
  const received = utc('2026-10-15T07:01:00')
  assert.equal(sameWeek(ended, received), false)
  // C'est `endedAt` qui compte : la victoire de 6 h 59 est dans la semaine du 8.
  assert.equal(iso(weekStart(ended)), '2026-10-08T07:00:00Z')
})

test('une semaine, pas sept jours glissants : mercredi soir puis jeudi matin, deux semaines', () => {
  const wednesday = utc('2026-10-14T22:00:00')
  const thursday = utc('2026-10-15T08:00:00')
  assert.equal(sameWeek(wednesday, thursday), false)
  // Et deux victoires à six jours d'écart, du jeudi au mercredi : la même semaine.
  assert.equal(sameWeek(utc('2026-10-15T08:00:00'), utc('2026-10-21T20:00:00')), true)
})

test('l\'heure et le fuseau se règlent sans rien changer d\'autre : jeudi 9 h à Paris', () => {
  const paris = { day: 'thursday', hour: 9, tz: 'Europe/Paris' }
  // Heure d'été (UTC+2) : 9 h à Paris, c'est 7 h UTC.
  assert.equal(iso(weekStart(utc('2026-10-15T07:30:00'), paris)), '2026-10-15T07:00:00Z')
  assert.equal(iso(weekStart(utc('2026-10-15T06:59:00'), paris)), '2026-10-08T07:00:00Z')
  // Le dimanche 25 octobre 2026, Paris passe à l'heure d'hiver (UTC+1) : le jeudi suivant, 9 h à
  // Paris, c'est 8 h UTC. La semaine du 15 dure donc une heure de plus.
  assert.equal(iso(nextReset(utc('2026-10-20T12:00:00'), paris)), '2026-10-22T07:00:00Z')
  assert.equal(iso(nextReset(utc('2026-10-27T12:00:00'), paris)), '2026-10-29T08:00:00Z')
  assert.equal(iso(weekStart(utc('2026-10-29T07:30:00'), paris)), '2026-10-22T07:00:00Z')
  assert.equal(iso(weekStart(utc('2026-10-29T08:00:00'), paris)), '2026-10-29T08:00:00Z')
})

test('une bascule à minuit, dans un fuseau de l\'autre côté du méridien', () => {
  const tokyo = { day: 'thursday', hour: 0, tz: 'Asia/Tokyo' }
  // Jeudi 0 h à Tokyo (UTC+9) : mercredi 15 h UTC.
  assert.equal(iso(weekStart(utc('2026-10-14T15:00:00'), tokyo)), '2026-10-14T15:00:00Z')
  assert.equal(iso(weekStart(utc('2026-10-14T14:59:59'), tokyo)), '2026-10-07T15:00:00Z')
})

test('une heure qui n\'existe pas (passage à l\'heure d\'été) glisse à la suivante', () => {
  // Le jeudi n'est jamais un jour de changement d'heure en Europe, mais un réglage peut le croiser
  // ailleurs : à 2 h 30 un jour où 2 h n'existe pas, la bascule ne disparaît pas.
  const rule = { day: 'sunday', hour: 2, tz: 'Europe/Paris' }
  // Le 29 mars 2026, à Paris, on passe de 2 h à 3 h.
  const start = weekStart(utc('2026-03-29T12:00:00'), rule)
  assert.equal(iso(start), '2026-03-29T01:00:00Z')
  assert.ok(start <= utc('2026-03-29T12:00:00'))
})

test('une heure qui existe deux fois (retour à l\'heure d\'hiver) : la première', () => {
  const rule = { day: 'sunday', hour: 2, tz: 'Europe/Paris' }
  // Le 25 octobre 2026, à Paris, 2 h passe deux fois : à 0 h UTC (heure d'été), puis à 1 h UTC.
  assert.equal(iso(weekStart(utc('2026-10-25T12:00:00'), rule)), '2026-10-25T00:00:00Z')
})

test('un réglage invalide retombe sur la bascule de la boutique', () => {
  assert.deepEqual(resetRule({ day: 'jeudi', hour: 25, tz: '' }), DEFAULT_RESET)
})
