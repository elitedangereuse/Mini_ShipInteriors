// Serveur de production : le relais multijoueur, et le build (dist/) sur le même port s'il existe.
//   npm run build && npm start      (PORT=8080 par défaut)
// Sur elitedangereuse.fr, le site sert lui-même dist/ : ce serveur n'y fait que le relais,
// derrière nginx qui lui passe le chemin de la socket (cf. README, « Mise en production »).
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachRelay, WS_PATH } from './relay.js'

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const PORT = Number(process.env.PORT) || 8080
const HOST = process.env.BIND_HOST || undefined
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
}

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
  console.error(`ED_CMDR_URL pointe sur ${cmdrHost} : en production, donner l'adresse publique du site.`)
  process.exit(1)
}

const STATIC = existsSync(ROOT)
if (!STATIC) console.log('dist/ introuvable : relais seul (« npm run build » pour servir aussi le jeu).')

const server = createServer((req, res) => {
  if (!STATIC) {
    res.writeHead(404).end('Introuvable')
    return
  }
  let url
  try {
    url = decodeURIComponent((req.url ?? '/').split('?')[0])
  } catch {
    res.writeHead(400).end()
    return
  }
  let file = normalize(join(ROOT, url))
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404).end('Introuvable')
    return
  }
  const long = url.startsWith('/assets/') && !url.endsWith('.html')
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': long ? 'public, max-age=86400' : 'no-cache',
  })
  createReadStream(file).pipe(res)
})

attachRelay(server)
server.listen(PORT, HOST, () => console.log(`Vaisseau en ligne : http://${HOST ?? 'localhost'}:${PORT} (socket : ${process.env.WS_PATH || WS_PATH})`))
