/** Ordre commun à tous les clients : une graine suffit à reproduire le mélange. */
export function musicOrder(count, selected, shuffle = false, seed = 0) {
  const order = Array.from({ length: count }, (_, i) => i)
  if (shuffle) {
    let state = (seed >>> 0) || 0x9e3779b9
    for (let i = count - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const j = state % (i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  const start = order.indexOf(selected)
  return start < 0 ? order : [...order.slice(start), ...order.slice(0, start)]
}

/** Titre et position à un instant donné, même après plusieurs tours de la liste. */
export function musicCue(durations, order, elapsed, loop = false) {
  if (!order.length) return null
  const cycle = loop ? durations[order[0]] : order.reduce((sum, i) => sum + durations[i], 0)
  let position = Math.max(0, elapsed) % cycle
  if (loop) return { index: order[0], orderIndex: 0, position, cycle }
  for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
    const index = order[orderIndex]
    if (position < durations[index] || orderIndex === order.length - 1) return { index, orderIndex, position, cycle }
    position -= durations[index]
  }
  return null
}
