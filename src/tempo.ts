/*
 * Tempo de la soirée : la piste de danse, la boule à facettes, les lumières « disco » et les
 * personnages qui dansent battent ensemble. Sans musique, à 120 BPM sur l'horloge des meubles ;
 * quand le jukebox joue un morceau, à son tempo et sur ses temps (cf. music.ts).
 */

/** Tempo par défaut, en battements par minute. */
export const DEFAULT_BPM = 120

export const tempo = {
  bpm: DEFAULT_BPM,
  /** Instant (horloge des meubles, en s) du battement 0. */
  origin: 0,
  /** Horloge des meubles, recopiée à chaque image (cf. main.ts). */
  now: 0,
}

/** Battement en cours (à virgule) à l'instant `t` de l'horloge des meubles. */
export const beatAt = (t: number) => ((t - tempo.origin) * tempo.bpm) / 60

/**
 * Où l'on en est du battement, de 0 (sur le temps) à 1 (juste avant le suivant). Avant le
 * battement 0 (une vignette du catalogue, dessinée à l'instant 1,7, une fois un morceau calé),
 * le battement est négatif : `b % 1` le serait aussi.
 */
export const beatPhase = (t: number) => {
  const b = beatAt(t)
  return b - Math.floor(b)
}

/** Éclat du battement : 1 sur le temps, puis il retombe avant le suivant. */
export const beatPulse = (t: number) => Math.exp(-beatPhase(t) * 4)

/** Battement en cours, maintenant. */
export const beatNow = () => beatAt(tempo.now)

/**
 * Cale le tempo sur un morceau : `position` secondes jouées, premier temps à `offset` s.
 * Sans morceau, on revient à 120 BPM sans sauter de temps.
 */
export function syncTempo(track: { bpm: number; offset: number } | null, position = 0) {
  if (!track) {
    if (tempo.bpm === DEFAULT_BPM && tempo.origin === 0) return
    const beat = beatNow()
    tempo.bpm = DEFAULT_BPM
    tempo.origin = tempo.now - (beat * 60) / DEFAULT_BPM
    return
  }
  tempo.bpm = track.bpm
  tempo.origin = tempo.now - (position - track.offset)
  // Avant le premier temps du morceau, on compte déjà : les motifs de la piste n'aiment pas les
  // battements négatifs (seule la phase compte, on recule de seize temps en seize temps).
  const beat = beatNow()
  if (beat < 0) tempo.origin -= (Math.ceil(-beat / 16) * 16 * 60) / tempo.bpm
}
