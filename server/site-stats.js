// La fréquentation du vaisseau, racontée au site : qui est à bord, combien de temps, et où.
// Le site la range en base et la montre aux administrateurs (page mini-ship-interiors-stats.php du
// repo elitedangereuselight ; endpoint outils/mini-shipinteriors-stats.php, règles dans
// phputils/mini_shipinteriors/stats.php).
import { randomBytes } from 'node:crypto'

/*
 * Toutes les cinq minutes (`interval`), le relais envoie un relevé, signé de sa clé partagée
 * (MSI_RELAY_SECRET) :
 * - `samples` : le nombre de joueurs à bord à l'instant du relevé (`players`, dont `cmdrs` CMDR
 *   reconnus) et le plus haut depuis le relevé précédent (`peak`) ;
 * - `sessions` : les passages à bord, ouverts ou finis depuis le dernier envoi réussi : un
 *   identifiant tiré au sort, le CMDR sous sa forme stockée (vide pour un invité), le début et la
 *   durée. Une session ouverte est renvoyée à chaque relevé, avec sa durée du moment : un relais
 *   qui s'arrête ne perd que les cinq dernières minutes ;
 * - `zones` : les secondes passées par l'ensemble des joueurs dans chaque pièce (`pont:pièce`, ou
 *   le pont seul hors du vaisseau : l'arène, la baie infestée, la base au sol), relevées toutes
 *   les quinze secondes (`step`) ;
 * - `arena` : les statistiques par personnage de CMDR Arena (cf. arena-stats.js), entières, quand
 *   elles ont changé : le site remplace les siennes.
 * Ce que le site n'a pas reçu (injoignable) attend le relevé suivant.
 */

/** Une session plus courte ne compte pas : une socket qui se reconnecte, un onglet rouvert. */
export const MIN_SESSION = 20
const MAX_SAMPLES = 288
const MAX_CLOSED = 2000

/**
 * @param players les joueurs à bord (`stored` : nom du CMDR sous sa forme stockée, sinon vide)
 * @param zoneOf la pièce où se tient un joueur (clé courte)
 * @param arena les statistiques de l'arène (cf. arena-stats.js), ou rien
 * @param timers false : pas d'horloge, on appelle `tick` et `pulse` soi-même (tests)
 */
export function createSiteStats({
  cmdrUrl = '', secret = '', players = () => [], zoneOf = () => '', arena = () => null, fetcher = fetch, now = () => Date.now(),
  error = () => {}, interval = 300_000, step = 15_000, timeoutMs = 8000, timers = true,
} = {}) {
  // Sans site ou sans clé, rien à envoyer : on ne compte pas non plus.
  if (!cmdrUrl || !secret) return { open() {}, close() {}, tick() {}, pulse: async () => false, dispose() {} }

  const open = new Map() // joueur -> session
  let closed = []
  let samples = []
  const zones = new Map() // pièce -> secondes
  let peak = 0
  let arenaSent = null
  let busy = false

  const seconds = (s, at) => Math.max(0, Math.round((at - s.start) / 1000))
  const count = () => {
    let n = 0
    for (const _ of players()) n++
    return n
  }

  function tick() {
    let n = 0
    for (const p of players()) {
      n++
      const zone = zoneOf(p)
      if (zone) zones.set(zone, (zones.get(zone) ?? 0) + step / 1000)
    }
    peak = Math.max(peak, n)
  }

  async function pulse() {
    if (busy) return false
    busy = true
    const at = now()
    let cmdrs = 0
    for (const p of players()) if (p.stored) cmdrs++
    const n = count()
    samples.push({ at: Math.floor(at / 1000), players: n, cmdrs, peak: Math.max(peak, n) })
    if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES)
    peak = n
    const sentSamples = samples.length
    const sentClosed = closed.length
    const sentZones = new Map(zones)
    const stats = arena()
    const body = {
      samples,
      sessions: [
        ...closed,
        ...[...open.values()].map((s) => ({ id: s.id, cmdr: s.cmdr, start: Math.floor(s.start / 1000), seconds: seconds(s, at) })).filter((s) => s.seconds >= MIN_SESSION),
      ],
      zones: Object.fromEntries(sentZones),
      ...(stats && stats.updated !== arenaSent ? { arena: { games: stats.games, rows: stats.rows } } : {}),
    }
    try {
      const response = await fetcher(new URL('/outils/mini-shipinteriors-stats.php', cmdrUrl), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Relay-Key': secret },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.status !== 'success') {
        error(`[stats] relevé refusé par le site (${response.status} ${data?.error ?? ''})`)
        return false
      }
      // Ce qui est arrivé pendant l'envoi reste pour le relevé suivant.
      samples = samples.slice(sentSamples)
      closed = closed.slice(sentClosed)
      for (const [zone, sent] of sentZones) {
        const left = (zones.get(zone) ?? 0) - sent
        if (left > 0) zones.set(zone, left)
        else zones.delete(zone)
      }
      if (body.arena) arenaSent = stats.updated
      return true
    } catch (err) {
      error(`[stats] site injoignable pour le relevé (${err?.message ?? err})`)
      return false
    } finally {
      busy = false
    }
  }

  const clocks = timers ? [setInterval(tick, step), setInterval(() => void pulse(), interval)] : []
  for (const c of clocks) c.unref?.()

  return {
    /** Un joueur embarque. */
    open(player) {
      open.set(player, { id: randomBytes(8).toString('hex'), cmdr: player.stored || '', start: now() })
      peak = Math.max(peak, count())
    },
    /** Il débarque : sa session attend le prochain relevé. */
    close(player) {
      const s = open.get(player)
      if (!s) return
      open.delete(player)
      const length = seconds(s, now())
      if (length < MIN_SESSION) return
      closed.push({ id: s.id, cmdr: s.cmdr, start: Math.floor(s.start / 1000), seconds: length })
      if (closed.length > MAX_CLOSED) closed = closed.slice(-MAX_CLOSED)
    },
    tick,
    pulse,
    dispose() {
      for (const c of clocks) clearInterval(c)
    },
  }
}
