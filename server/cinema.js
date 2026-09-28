/** Séance commune du cinéma. Le site fournit le catalogue et la priorité du direct Twitch. */
export const PROJECTION_SEAT = { level: 1, x: 26.65, z: 7.55 }

export function cinemaOperator(players) {
  return [...players].filter((p) => p.level === PROJECTION_SEAT.level && p.pose === 'sit'
    && Math.hypot(p.x - PROJECTION_SEAT.x, p.z - PROJECTION_SEAT.z) < 0.45)
    .sort((a, b) => a.id - b.id)[0]?.id ?? null
}

const videoId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{11}$/.test(s)

export function createCinema({ cmdrUrl, players, emit, error = console.error }) {
  let trailers = []
  let live = false
  let liveTitle = ''
  let selected = null
  let since = 0
  let lastCheck = 0
  let checking = null
  let lastOperator = null

  const snapshot = () => ({ trailers, live, liveTitle, selected, since, operator: cinemaOperator(players()), now: Date.now() })
  const broadcast = () => emit('cinema:state', snapshot())

  const refresh = async (force = false) => {
    if (checking) return checking
    if (!force && Date.now() - lastCheck < 30000) return
    lastCheck = Date.now()
    checking = (async () => {
      try {
        if (!cmdrUrl) return
        const url = new URL('/outils/mini-shipinteriors-cinema.php', cmdrUrl)
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' })
        if (!response.ok) return
        const data = await response.json()
        if (data.status !== 'success' || !Array.isArray(data.trailers)) return
        const next = data.trailers.filter((t) => Number.isSafeInteger(t.id) && t.id > 0 && videoId(t.video)
          && typeof t.title === 'string' && typeof t.image === 'string' && t.image.startsWith('/') && !t.image.startsWith('//'))
          .map((t) => ({ id: t.id, title: t.title.slice(0, 120), image: t.image, video: t.video }))
        const nextLive = data.live === true
        const nextTitle = typeof data.liveTitle === 'string' ? data.liveTitle.slice(0, 120) : ''
        const changed = nextLive !== live || nextTitle !== liveTitle || JSON.stringify(next) !== JSON.stringify(trailers)
        trailers = next
        live = nextLive
        liveTitle = nextTitle
        if (live || (selected !== null && !trailers.some((t) => t.id === selected))) { selected = null; since = 0 }
        if (changed) broadcast()
      } catch (e) { error(`[cinéma] catalogue indisponible : ${e?.message ?? e}`) }
      finally { checking = null }
    })()
    return checking
  }

  const choose = async (player, id) => {
    await refresh()
    if (live) return 'live'
    if (cinemaOperator(players()) !== player.id) return 'seat'
    if (id !== null && !trailers.some((t) => t.id === id)) return 'invalid'
    selected = id
    since = id === null ? 0 : Date.now()
    broadcast()
    return null
  }

  const operatorChanged = () => {
    const next = cinemaOperator(players())
    if (next === lastOperator) return
    lastOperator = next
    broadcast()
  }

  const timer = setInterval(() => { if (players().length) void refresh(true) }, 30000)
  timer.unref?.()
  return { snapshot, refresh, choose, operatorChanged, dispose: () => clearInterval(timer) }
}
