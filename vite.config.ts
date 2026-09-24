import { defineConfig, type Plugin } from 'vite'
import { attachRelay } from './server/relay.js'
import { issueTicket } from './server/ticket.js'

/** En dev, un secret par défaut suffit : c'est le serveur de dev lui-même qui signe les billets. */
const DEV_SECRET = process.env.MINI_INTERIOR_SECRET || 'dev-only-secret'

/**
 * Branche le relais multijoueur sur le serveur de dev (et de preview) de Vite, sur /ws.
 * En dev, /dev/ticket?name=X simule elitedangereuse.fr : il signe un billet pour le CMDR X
 * (côté jeu : ouvrir http://localhost:5173/?cmdr=X).
 */
function relay(): Plugin {
  return {
    name: 'mini-interior-relay',
    configureServer(server) {
      const log = (m: string) => server.config.logger.info(m)
      if (server.httpServer) attachRelay(server.httpServer, { log, secret: DEV_SECRET })
      server.middlewares.use('/dev/ticket', (req, res) => {
        const name = new URL(req.url ?? '', 'http://dev').searchParams.get('name')?.trim().slice(0, 40)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(name ? { cmdr: name, ticket: issueTicket(name, DEV_SECRET) } : { cmdr: null }))
      })
    },
    configurePreviewServer(server) {
      attachRelay(server.httpServer, { log: (m: string) => server.config.logger.info(m) })
    },
  }
}

export default defineConfig({
  // base relative : le build peut être servi depuis n'importe quel sous-dossier.
  base: './',
  plugins: [relay()],
  // Three.js pèse ~650 ko minifié à lui seul, le jeu et son mobilier ~150 ko : c'est attendu.
  build: { chunkSizeWarningLimit: 900 },
})
