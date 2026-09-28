import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite'
import { attachRelay } from './server/relay.js'

/**
 * Site elitedangereuse.fr en local (Docker, cf. docker/README.md du repo elitedangereuselight).
 * Les cookies ne dépendent pas du port : un CMDR connecté sur localhost:8080 l'est aussi ici.
 */
const ED_SITE_URL = process.env.ED_SITE_URL || 'http://localhost:8080'
const CMDR_ENDPOINT = '/outils/mini-shipinteriors-cmdr.php'
/** Aménagement des quartiers des CMDR (lecture, écriture). */
const CABIN_ENDPOINT = '/outils/mini-shipinteriors-cabin.php'
/** Meilleurs scores des bornes d'arcade (lecture, inscription). */
const SCORES_ENDPOINT = '/outils/mini-shipinteriors-scores.php'
/** Crédits du CMDR (solde, achats, gains). */
const CREDITS_ENDPOINT = '/outils/mini-shipinteriors-credits.php'
// PHP sees the Docker host, while the browser may use 127.0.0.1:5173.
// Translate only a verified same-origin request; foreign origins remain refused.
const siteProxy: ProxyOptions = {
  target: ED_SITE_URL, changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', (outgoing, incoming) => {
      const origin = incoming.headers.origin
      if (!origin) return
      try {
        outgoing.setHeader('Origin', new URL(origin).host === incoming.headers.host ? new URL(ED_SITE_URL).origin : 'null')
      } catch { outgoing.setHeader('Origin', 'null') }
    })
  },
}
const SITE_PROXY = Object.fromEntries([CMDR_ENDPOINT, CABIN_ENDPOINT, SCORES_ENDPOINT, CREDITS_ENDPOINT, '/outils/mini-shipinteriors-site.php', '/outils/mini-shipinteriors-cinema.php'].map((path) => [path, siteProxy]))

/**
 * Branche le relais multijoueur sur le serveur de dev (et de preview) de Vite, sur /ws/mini-shipinteriors.
 * Le relais fait reconnaître le cookie du site par le site local. Sans Docker, ?cmdr=X simule
 * le CMDR X (serveur de dev uniquement). La clé YouTube de la régie du cinéma vient de
 * l'environnement, ou d'un `.env.local` (non versionné) : jamais envoyée au client.
 */
function relay(): Plugin {
  const cmdrUrl = process.env.ED_CMDR_URL || ED_SITE_URL + CMDR_ENDPOINT
  let youtubeKey = ''
  return {
    name: 'mini-interior-relay',
    configResolved(config) {
      if (config.envDir !== false) youtubeKey = loadEnv(config.mode, config.envDir, 'YOUTUBE_').YOUTUBE_API_KEY ?? ''
    },
    configureServer(server) {
      const { info, warn } = server.config.logger
      if (server.httpServer) attachRelay(server.httpServer, { log: (m) => info(m), error: (m) => warn(m), cmdrUrl, devCmdr: true, youtubeKey })
    },
    configurePreviewServer(server) {
      const { info, warn } = server.config.logger
      attachRelay(server.httpServer, { log: (m) => info(m), error: (m) => warn(m), cmdrUrl, youtubeKey })
    },
  }
}

/**
 * Les chiffres de l'économie (src/economy/economy.json) sont intégrés au jeu, et copiés tels quels
 * dans dist/ : le site, qui tient les comptes, y relit en production les prix et les récompenses
 * (phputils/mini_shipinteriors/credits.php, repo elitedangereuselight).
 */
function economy(): Plugin {
  return {
    name: 'mini-interior-economy',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'economy.json', source: readFileSync(new URL('./src/economy/economy.json', import.meta.url), 'utf8') })
    },
  }
}

export default defineConfig({
  // base relative : le build peut être servi depuis n'importe quel sous-dossier.
  base: './',
  define: { 'import.meta.env.VITE_ED_SITE_ORIGIN': JSON.stringify(ED_SITE_URL) },
  plugins: [relay(), economy()],
  // Le client demande au site qui est connecté, ses quartiers, les scores des bornes et ses
  // crédits (même origine en prod) : en local, on relaie au site Docker.
  server: { proxy: SITE_PROXY },
  preview: { proxy: SITE_PROXY },
  // Three.js pèse ~650 ko minifié à lui seul, le jeu et son mobilier ~200 ko : c'est attendu.
  // Le mode aménagement est chargé à la demande (import dynamique, ~25 ko) ; les morceaux
  // partagés prennent un nom clair (sinon, celui du premier module commun venu) : vendor pour
  // les dépendances, game pour le code du jeu que l'éditeur utilise aussi.
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules/, priority: 2 },
            { name: 'game', minShareCount: 2, priority: 1 },
          ],
        },
      },
    },
  },
})
