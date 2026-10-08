/**
 * Séance commune du cinéma. Le site fournit le catalogue et la priorité du direct Twitch de la
 * chaîne du site ; la régie peut aussi projeter une vidéo YouTube, ou le direct d'une autre chaîne.
 */
import { QUEST_REELS } from '../shared/quests.js'

export const PROJECTION_SEAT = { level: 1, x: 28.65, z: 7.55 }

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

const twitchLogin = (s) => typeof s === 'string' && /^[a-z0-9_]{1,25}$/.test(s)
/** Login d'une chaîne dans un lien twitch.tv, ou null. */
function twitchLinkLogin(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(url.hostname.toLowerCase())) return null
    const login = url.pathname.split('/')[1]?.toLowerCase()
    return twitchLogin(login) ? login : null
  } catch { return null }
}

export function createCinema({ cmdrUrl, players, emit, error = console.error, now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  youtubeKey = process.env.YOUTUBE_API_KEY ?? '', fetcher = fetch, relaySecret = process.env.MSI_RELAY_SECRET ?? '' }) {
  let trailers = []
  let live = false
  let liveTitle = ''
  let selected = null
  let youtube = null
  /** Direct d'une autre chaîne Twitch, choisi par la régie. */
  let twitch = null
  let since = 0
  let lastCheck = 0
  let checking = null
  let lastOperator = null
  let endTimer = null
  const foundVideos = new Map()
  const searchCache = new Map()
  const foundStreams = new Map()
  const streamCache = new Map()

  const snapshot = () => ({ trailers, live, liveTitle, selected, youtube, twitch, since, operator: cinemaOperator(players()), now: now() })
  const broadcast = () => emit('cinema:state', snapshot())
  const clearSelection = () => {
    if (endTimer !== null) cancel(endTimer)
    endTimer = null
    selected = null
    youtube = null
    twitch = null
    since = 0
  }

  /** Le site cherche sur Twitch avec ses identifiants ; il ne répond qu'au relais (clé partagée). */
  const twitchSite = async (params) => {
    if (!cmdrUrl || !relaySecret) return null
    const url = new URL('/outils/mini-shipinteriors-twitch.php', cmdrUrl)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const response = await fetch(url, { headers: { Accept: 'application/json', 'X-Relay-Key': relaySecret }, signal: AbortSignal.timeout(6000), redirect: 'error' })
    if (!response.ok) throw new Error(`site HTTP ${response.status}`)
    const data = await response.json()
    return data?.status === 'success' ? data : null
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
        // La chaîne projetée a coupé son direct : la salle retrouve son écran d'attente.
        let ended = false
        if (twitch) {
          const channel = twitch.channel
          const state = await twitchSite({ live: channel }).catch(() => null)
          if (state?.live === false && twitch?.channel === channel) { clearSelection(); ended = true }
        }
        if (changed || ended) broadcast()
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
    // Une bobine de quête (cf. QUEST_REELS) : à qui a terminé sa quête, sans passer par la recherche.
    const reel = QUEST_REELS.find((r) => r.video === id)
    const video = reel && player.quests?.has(reel.quest)
      ? { video: reel.video, title: reel.title, image: `https://i.ytimg.com/vi/${reel.video}/mqdefault.jpg`, foundAt: now() }
      : foundVideos.get(id)
    if (!video || now() - video.foundAt > 600000) return 'invalid'
    clearSelection()
    youtube = { video: video.video, title: video.title, image: video.image }
    since = now()
    broadcast()
    return null
  }

  /** Directs Twitch qui répondent à des mots, ou à un lien twitch.tv. */
  const searchStreams = async (player, query) => {
    await refresh()
    if (live) return { reason: 'live', streams: [] }
    if (cinemaOperator(players()) !== player.id) return { reason: 'seat', streams: [] }
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 500) return { reason: 'invalid', streams: [] }
    const words = twitchLinkLogin(query.trim()) ?? query.trim()
    if (words.length > 100) return { reason: 'invalid', streams: [] }
    const normalized = words.toLocaleLowerCase()
    const cached = streamCache.get(normalized)
    if (cached && now() - cached.at < 60000) return { streams: cached.streams }
    try {
      const data = await twitchSite({ search: words })
      if (!data || !Array.isArray(data.streams)) return { reason: 'unavailable', streams: [] }
      const streams = data.streams.filter((s) => twitchLogin(s?.channel) && typeof s.name === 'string' && typeof s.title === 'string')
        .slice(0, 12).map((s) => ({ channel: s.channel, name: s.name.slice(0, 64), title: s.title.slice(0, 140),
          game: typeof s.game === 'string' ? s.game.slice(0, 80) : '',
          image: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${s.channel}-320x180.jpg` }))
      for (const stream of streams) foundStreams.set(stream.channel, { ...stream, foundAt: now() })
      for (const [id, stream] of foundStreams) if (now() - stream.foundAt > 600000) foundStreams.delete(id)
      streamCache.set(normalized, { at: now(), streams })
      for (const [key, value] of streamCache) if (now() - value.at > 60000) streamCache.delete(key)
      return { streams }
    } catch (e) {
      error(`[cinéma] recherche Twitch indisponible : ${e?.message ?? e}`)
      return { reason: 'unavailable', streams: [] }
    }
  }

  const chooseStream = async (player, channel) => {
    await refresh()
    if (live) return 'live'
    if (cinemaOperator(players()) !== player.id) return 'seat'
    const stream = foundStreams.get(channel)
    if (!stream || now() - stream.foundAt > 600000) return 'invalid'
    clearSelection()
    twitch = { channel: stream.channel, name: stream.name, title: stream.title, image: stream.image }
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
  return { snapshot, refresh, choose, search, chooseVideo, searchStreams, chooseStream, reportDuration, operatorChanged,
    dispose: () => { clearInterval(timer); if (endTimer !== null) cancel(endTimer) } }
}
