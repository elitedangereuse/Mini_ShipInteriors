// Serveur de production : le relais multijoueur, et le build (dist/) sur le même port s'il existe.
//   npm run build && npm start      (PORT=8080 par défaut)
// Sur elitedangereuse.fr, le site sert lui-même dist/ : ce serveur n'y fait que le relais,
// derrière nginx qui lui passe le chemin de la socket (cf. README, « Mise en production »).
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'
import { attachRelay, WS_PATH } from './relay.js'

// Horodatage et étiquette d'environnement (LOG_LABEL) : sous systemd, la sortie d'erreur part dans
// un fichier, sans l'horodatage que journald ajouterait, et la preprod et la prod peuvent s'y côtoyer.
const LABEL = process.env.LOG_LABEL ? ` [${process.env.LOG_LABEL}]` : ''
const line = (m) => `${new Date().toISOString()}${LABEL} ${m}`
const log = (m) => console.log(line(m))
const error = (m) => console.error(line(m))
process.on('uncaughtException', (err) => {
  error(`arrêt sur erreur : ${err?.stack ?? err}`)
  process.exit(1)
})
// Arrêt demandé (systemd, Ctrl+C) : on sort par process.exit, qui écrit au passage les statistiques
// de l'arène qui attendaient encore (cf. server/arena-stats.js).
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0))

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const PORT = Number(process.env.PORT) || 8080
const HOST = process.env.BIND_HOST || undefined
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
}
/** Compressés à la volée quand le navigateur l'accepte : le texte, les données, les modèles 3D. */
const GZIP = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg', '.glb'])
/**
 * Scripts et feuilles de style du build : leur nom porte l'empreinte de leur contenu
 * (index-BO-yF8LB.css), ils ne changent jamais sous la même adresse.
 */
const HASHED = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/

// Le site doit être joint par son adresse publique. Appelé sur localhost ou 127.0.0.1, il se croit
// en local et connecte d'office tout visiteur avec le CMDR de dev (phputils/environment.php) :
// chaque joueur serait « vérifié » sous ce nom.
const cmdrHost = (() => {
  try {
    return new URL(process.env.ED_CMDR_URL).hostname
  } catch {
    return ''
  }
})()
if (process.env.NODE_ENV === 'production' && /^(localhost|127\.|\[::1\]$)|\.localhost$/.test(cmdrHost)) {
  error(`ED_CMDR_URL pointe sur ${cmdrHost} : en production, donner l'adresse publique du site.`)
  process.exit(1)
}

const STATIC = existsSync(ROOT)
if (!STATIC) log('dist/ introuvable : relais seul (« npm run build » pour servir aussi le jeu).')

/** Le navigateur accepte-t-il gzip (`Accept-Encoding`, sans `q=0`) ? */
function acceptsGzip(header = '') {
  return header.split(',').some((part) => {
    const [coding, ...params] = part.split(';').map((s) => s.trim().toLowerCase())
    const q = params.find((p) => p.startsWith('q='))
    return (coding === 'gzip' || coding === '*') && (!q || Number(q.slice(2)) > 0)
  })
}

/**
 * La plage demandée (`Range: bytes=…`) d'un fichier de `size` octets : { start, end } (inclus) ;
 * null si l'en-tête ne s'applique pas (autre unité, plusieurs plages : tout le fichier est servi) ;
 * false si la plage est invalide ou hors du fichier (416).
 */
function byteRange(header, size) {
  if (!header.startsWith('bytes=')) return null
  const spec = header.slice(6).trim()
  if (spec.includes(',')) return null
  const m = /^(\d*)-(\d*)$/.exec(spec)
  if (!m || (m[1] === '' && m[2] === '')) return false
  // « -n » : les n derniers octets.
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  return start <= end && start < size ? { start, end } : false
}

/** Un fichier de dist/ : en-têtes de cache, requêtes conditionnelles, plages, compression. */
async function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  let url
  try {
    url = decodeURIComponent((req.url ?? '/').split('?')[0])
  } catch {
    res.writeHead(400).end()
    return
  }
  if (url.includes('\0')) {
    res.writeHead(400).end()
    return
  }
  let file = normalize(join(ROOT, url))
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end()
    return
  }
  let info = await stat(file).catch(() => null)
  if (info?.isDirectory()) {
    file = join(file, 'index.html')
    info = await stat(file).catch(() => null)
  }
  if (!info?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable')
    return
  }
  const ext = extname(file).toLowerCase()
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': HASHED.test(url) ? 'public, max-age=31536000, immutable'
      : url.startsWith('/assets/') && ext !== '.html' ? 'public, max-age=86400' : 'no-cache',
    'Last-Modified': info.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
    ...(GZIP.has(ext) ? { Vary: 'Accept-Encoding' } : {}),
  }
  // Déjà en cache chez le navigateur, et pas modifié depuis (à la seconde près, comme l'en-tête).
  const since = Date.parse(req.headers['if-modified-since'] ?? '')
  if (Math.floor(info.mtimeMs / 1000) * 1000 <= since) {
    res.writeHead(304, headers).end()
    return
  }
  headers['Content-Type'] = TYPES[ext] ?? 'application/octet-stream'
  const range = req.headers.range ? byteRange(req.headers.range, info.size) : null
  if (range === false) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }).end()
    return
  }
  let status = 200
  let gzip = null
  if (range) {
    status = 206
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`
    headers['Content-Length'] = range.end - range.start + 1
  } else if (GZIP.has(ext) && acceptsGzip(req.headers['accept-encoding'])) {
    headers['Content-Encoding'] = 'gzip'
    gzip = createGzip()
  } else headers['Content-Length'] = info.size
  res.writeHead(status, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  // pipeline : une erreur de lecture, ou un navigateur qui s'en va en route, ferme le fichier et la réponse.
  const streams = [createReadStream(file, range ?? {}), ...(gzip ? [gzip] : []), res]
  pipeline(...streams, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') error(`[http] ${url} : ${err.message}`)
  })
}

const server = createServer((req, res) => {
  if (!STATIC) {
    res.writeHead(404).end('Introuvable')
    return
  }
  serve(req, res).catch((err) => {
    error(`[http] ${req.url} : ${err?.stack ?? err}`)
    if (!res.headersSent) res.writeHead(500).end()
    else res.destroy()
  })
})

// Les statistiques des personnages de l'arène (cf. server/arena-stats.js) : ARENA_STATS_FILE, sinon var/ à côté du serveur.
const arenaStatsFile = process.env.ARENA_STATS_FILE || fileURLToPath(new URL('../var/arena-stats.json', import.meta.url))
attachRelay(server, { log, error, arenaStatsFile })
server.listen(PORT, HOST, () => log(`Vaisseau en ligne : http://${HOST ?? 'localhost'}:${PORT} (socket : ${process.env.WS_PATH || WS_PATH})`))
