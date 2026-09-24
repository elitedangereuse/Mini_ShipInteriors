// Serveur de production : sert le build (dist/) et le relais multijoueur sur le même port.
//   npm run build && npm start      (PORT=8080 par défaut)
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachRelay } from './relay.js'

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const PORT = Number(process.env.PORT) || 8080
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
}

if (!existsSync(ROOT)) {
  console.error('dist/ introuvable : lancez d\'abord « npm run build ».')
  process.exit(1)
}

const server = createServer((req, res) => {
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
server.listen(PORT, () => console.log(`Vaisseau en ligne : http://localhost:${PORT}`))
