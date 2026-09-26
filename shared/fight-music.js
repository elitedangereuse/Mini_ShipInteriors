// Quatre compositions originales de huit mesures, puce à trois voix et boîte à rythmes.
// Aucune mélodie ni sample provenant d'un autre jeu.
export const FIGHT_BPM = 144
const THEMES = {
  rooftop: { bpm: 158, duty: 0.22, root: [42, 45, 40, 47], intervals: [0, 3, 7],
    motifs: [[78, 0, 81, 78, 85, 83, 81, 0], [76, 79, 0, 83, 79, 76, 74, 0], [73, 76, 80, 0, 85, 80, 76, 73], [78, 81, 85, 88, 85, 83, 81, 78]], kick: [0, 0.75, 2, 2.75, 3.5], seed: 4271 },
  harbor: { bpm: 126, duty: 0.5, root: [48, 45, 53, 55], intervals: [0, 4, 7],
    motifs: [[76, 79, 81, 79, 0, 76, 74, 72], [76, 0, 79, 81, 84, 81, 79, 76], [77, 81, 84, 81, 79, 77, 0, 81], [79, 83, 86, 83, 81, 79, 77, 74]], kick: [0, 1.5, 2.5], seed: 9137 },
  temple: { bpm: 112, duty: 0.16, root: [50, 48, 46, 45], intervals: [0, 7, 12],
    motifs: [[74, 0, 77, 81, 0, 84, 81, 77], [72, 77, 0, 79, 84, 0, 79, 77], [70, 74, 77, 0, 81, 77, 0, 74], [69, 74, 0, 76, 81, 0, 76, 74]], kick: [0, 2, 3.5], seed: 1719 },
}
export function composeFightMusic(sampleRate = 22050, stage = 'street') {
  const theme = THEMES[stage]
  const beat = 60 / (theme?.bpm ?? FIGHT_BPM), length = 32 * beat
  const samples = new Float32Array(Math.round(sampleRate * length))
  const frequency = midi => 440 * 2 ** ((midi - 69) / 12)
  const add = (at, duration, volume, wave) => {
    const count = Math.round(duration * sampleRate), offset = Math.round(at * sampleRate)
    for (let i = 0; i < count && offset + i < samples.length; i++) {
      const time = i / sampleRate, env = Math.min(1, time / 0.006, (duration - time) / 0.024)
      samples[offset + i] += wave(time, i) * Math.max(0, env) * volume
    }
  }
  const pulse = (midi, at, duration, volume = 0.07) => {
    const hz = frequency(midi)
    add(at, duration, volume, t => ((t * hz) % 1 < (theme?.duty ?? 0.35) ? 0.8 : -0.45) * Math.exp(-t * 1.7))
  }
  const bass = (midi, at, duration) => {
    const hz = frequency(midi)
    add(at, duration, 0.14, t => (1 - 4 * Math.abs((t * hz) % 1 - 0.5)) * Math.exp(-t * 2))
  }
  let noiseSeed = theme?.seed ?? 3312
  const noise = () => { noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) | 0; return ((noiseSeed >>> 0) / 2147483648) - 1 }
  const chords = theme ? theme.root.map(root => theme.intervals.map(interval => root + interval)) : [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]]
  const lead = theme ? Array.from({ length: 8 }, (_, bar) => theme.motifs[Math.floor(bar / 2)].map((note, step) => note && note + (bar % 2 && step === 6 ? 12 : 0))) : [
    [74, 77, 81, 79, 77, 74, 72, 69], [74, 77, 81, 84, 81, 79, 77, 74],
    [70, 74, 77, 79, 77, 74, 72, 70], [77, 79, 82, 81, 79, 77, 74, 72],
    [72, 76, 79, 81, 79, 76, 74, 72], [79, 81, 84, 83, 81, 79, 76, 72],
    [69, 73, 76, 79, 76, 73, 71, 69], [81, 79, 77, 76, 73, 76, 81, 73],
  ]
  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[Math.floor(bar / 2)], start = bar * 4 * beat
    for (let step = 0; step < 8; step++) {
      const at = start + step * beat / 2
      if (lead[bar][step]) pulse(lead[bar][step], at, beat * (step === 7 ? 0.48 : 0.38), 0.075)
      pulse(chord[step % 3] + 12, at, beat * 0.32, 0.035)
      bass(chord[0] - 12 + (step % 4 === 3 ? 12 : 0), at, beat * 0.43)
      add(at, 0.052, step % 2 ? 0.022 : 0.03, t => noise() * Math.exp(-t * 70))
    }
    for (const step of theme?.kick ?? [0, 1.5, 2, 3.5]) add(start + step * beat, 0.16, 0.22, t => Math.sin(2 * Math.PI * (47 * t + 1.7 * (1 - Math.exp(-t * 38)))) * Math.exp(-t * 25))
    for (const step of [1, 3]) add(start + step * beat, 0.12, 0.11, t => (noise() * 0.8 + Math.sin(t * 2 * Math.PI * 185) * 0.2) * Math.exp(-t * 27))
  }
  // Une petite marge pour les bruitages ; la dernière note s'éteint avant la reprise.
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * 1.5) * 0.8
  return samples
}
