/** Séance commune du cinéma. Le site fournit le catalogue et la priorité du direct Twitch. */
export const PROJECTION_SEAT = { level: 1, x: 26.65, z: 7.55 }

export function cinemaOperator(players) {
  return [...players].filter((p) => p.level === PROJECTION_SEAT.level && p.pose === 'sit'
    && Math.hypot(p.x - PROJECTION_SEAT.x, p.z - PROJECTION_SEAT.z) < 0.45)
    .sort((a, b) => a.id - b.id)[0]?.id ?? null
}

const videoId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{11}$/.test(s)
function youtubeLinkId(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname.toLowerCase()
    let id = null
    if (host === 'youtu.be' || host === 'www.youtu.be') id = url.pathname.split('/')[1]
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      const parts = url.pathname.split('/').filter(Boolean)
      id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : null
    }
    return videoId(id) ? id : null
  } catch { return null }
}

export function createCinema({ cmdrUrl, players, emit, error = console.error, now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  youtubeKey = process.env.YOUTUBE_API_KEY ?? '', fetcher = fetch }) {
  let trailers = []
  let live = false
  let liveTitle = ''
  let selected = null
  let youtube = null
  let since = 0
  let lastCheck = 0
  let checking = null
  let lastOperator = null
  let endTimer = null
  const foundVideos = new Map()
  const searchCache = new Map()

  const snapshot = () => ({ trailers, live, liveTitle, selected, youtube, since, operator: cinemaOperator(players()), now: now() })
  const broadcast = () => emit('cinema:state', snapshot())
  const clearSelection = () => {
    if (endTimer !== null) cancel(endTimer)
    endTimer = null
    selected = null
    youtube = null
    since = 0
  }

  const refresh = async (force = false) => {
    if (checking) return checking
    if (!force && now() - lastCheck < 30000) return
    lastCheck = now()
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
        if (live || (selected !== null && !trailers.some((t) => t.id === selected))) clearSelection()
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
    clearSelection()
    selected = id
    since = id === null ? 0 : now()
    broadcast()
    return null
  }

  /** La clé ne quitte jamais le relais ; seuls les résultats vidéo intégrables sont proposés. */
  const search = async (player, query) => {
    await refresh()
    if (live) return { reason: 'live', videos: [] }
    if (cinemaOperator(players()) !== player.id) return { reason: 'seat', videos: [] }
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 500) return { reason: 'invalid', videos: [] }
    const linked = youtubeLinkId(query.trim())
    if (linked) {
      const video = { video: linked, title: 'YouTube', image: `https://i.ytimg.com/vi/${linked}/mqdefault.jpg` }
      foundVideos.set(linked, { ...video, foundAt: now() })
      return { videos: [video] }
    }
    if (query.length > 100) return { reason: 'invalid', videos: [] }
    if (!youtubeKey) return { reason: 'unavailable', videos: [] }
    const normalized = query.trim().toLocaleLowerCase()
    const cached = searchCache.get(normalized)
    if (cached && now() - cached.at < 300000) return { videos: cached.videos }
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/search')
      for (const [key, value] of Object.entries({ part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true',
        maxResults: '12', q: query.trim(), key: youtubeKey })) url.searchParams.set(key, value)
      const response = await fetcher(url, { signal: AbortSignal.timeout(6000), redirect: 'error' })
      if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`)
      const data = await response.json()
      const videos = (Array.isArray(data.items) ? data.items : []).filter((item) => videoId(item?.id?.videoId)
        && typeof item?.snippet?.title === 'string' && item.snippet.liveBroadcastContent !== 'live')
        .map((item) => ({ video: item.id.videoId, title: item.snippet.title.slice(0, 120),
          image: `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg` }))
      for (const video of videos) foundVideos.set(video.video, { ...video, foundAt: now() })
      for (const [id, video] of foundVideos) if (now() - video.foundAt > 600000) foundVideos.delete(id)
      searchCache.set(normalized, { at: now(), videos })
      for (const [key, value] of searchCache) if (now() - value.at > 300000) searchCache.delete(key)
      return { videos }
    } catch (e) {
      error(`[cinéma] recherche YouTube indisponible : ${e?.message ?? e}`)
      return { reason: 'unavailable', videos: [] }
    }
  }

  const chooseVideo = async (player, id) => {
    await refresh()
    if (live) return 'live'
    if (cinemaOperator(players()) !== player.id) return 'seat'
    const video = foundVideos.get(id)
    if (!video || now() - video.foundAt > 600000) return 'invalid'
    clearSelection()
    youtube = { video: video.video, title: video.title, image: video.image }
    since = now()
    broadcast()
    return null
  }

  /** La durée réelle vient du lecteur YouTube ; le relais arrête la séance pour tout le bord. */
  const reportDuration = (id, started, duration) => {
    if (live || (selected === null && youtube === null) || id !== (youtube?.video ?? selected) || started !== since || endTimer !== null
      || !Number.isFinite(duration) || duration < 1 || duration > 43200) return false
    endTimer = schedule(() => {
      if ((youtube?.video ?? selected) !== id || since !== started || live) return
      clearSelection()
      broadcast()
    }, Math.max(0, started + Math.ceil(duration * 1000) - now()))
    endTimer.unref?.()
    return true
  }

  const operatorChanged = () => {
    const next = cinemaOperator(players())
    if (next === lastOperator) return
    lastOperator = next
    broadcast()
  }

  const timer = setInterval(() => { if (players().length) void refresh(true) }, 30000)
  timer.unref?.()
  return { snapshot, refresh, choose, search, chooseVideo, reportDuration, operatorChanged,
    dispose: () => { clearInterval(timer); if (endTimer !== null) cancel(endTimer) } }
}
