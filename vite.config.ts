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
/** Toile de la Pixel War du site, affichée dans sa salle (lecture seule, sans compte). */
const PIXEL_WAR_STATE = '/phputils/pixel_war/api/state.php'
/** Crédits du CMDR (solde, achats, gains). */
const CREDITS_ENDPOINT = '/outils/mini-shipinteriors-credits.php'
/** Zone thargoïde : classement des victoires (lecture), gains des missions (écrit par le relais). */
const SALVAGE_ENDPOINT = '/outils/mini-shipinteriors-salvage.php'
/**
 * Clé partagée entre le relais et le site pour payer les missions gagnées (MSI_RELAY_SECRET des
 * deux côtés en production) ; en local, le site accepte celle-ci.
 */
const DEV_RELAY_SECRET = process.env.MSI_RELAY_SECRET || 'dev-local'
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
const SITE_PROXY = Object.fromEntries([CMDR_ENDPOINT, CABIN_ENDPOINT, SCORES_ENDPOINT, CREDITS_ENDPOINT, SALVAGE_ENDPOINT, '/outils/mini-shipinteriors-site.php', '/outils/mini-shipinteriors-cinema.php', '/outils/mini-shipinteriors-crew.php', '/outils/mini-shipinteriors-twitch.php', '/outils/mini-shipinteriors-fish.php', '/outils/mini-shipinteriors-gardening.php', '/outils/mini-shipinteriors-quests.php', PIXEL_WAR_STATE].map((path) => [path, siteProxy]))

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
      if (server.httpServer) attachRelay(server.httpServer, { log: (m) => info(m), error: (m) => warn(m), cmdrUrl, devCmdr: true, youtubeKey, relaySecret: DEV_RELAY_SECRET })
    },
    configurePreviewServer(server) {
      const { info, warn } = server.config.logger
      attachRelay(server.httpServer, { log: (m) => info(m), error: (m) => warn(m), cmdrUrl, youtubeKey, relaySecret: DEV_RELAY_SECRET })
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
  // Tout le vaisseau est bâti au démarrage : son code est rangé en morceaux qui suivent les
  // couches du jeu (chacun contient aussi ce dont il dépend et qu'aucun morceau plus bas n'a
  // déjà pris), téléchargés en parallèle et gardés en cache tant qu'ils ne changent pas :
  // - three : Three.js, ~690 ko minifié à lui seul (d'où la limite d'alerte), qui ne change
  //   qu'à ses montées de version ;
  // - vendor : les autres dépendances (socket.io, icônes) ;
  // - furniture : le mobilier fait main (src/furniture), avec les jeux des bornes qu'il fait
  //   tourner en démonstration ;
  // - ship : les ponts, leurs plans et les quartiers (catalogue, vue, parcelle) ;
  // - activities : les activités rangées dans leur dossier (zone thargoïde, base au sol,
  //   jardinage, pêche, interro, annuaire, jeux de plateau) ;
  // - common : ce que le jeu partage avec les modes chargés à la demande (sinon, il prendrait
  //   le nom du premier module commun venu) ;
  // - index : main.ts et le reste.
  // Les priorités vont de la couche la plus basse à la plus haute. `$initial` laisse de côté le
  // code chargé à la demande (aménagement, construction, borne d'arcade en grand : imports
  // dynamiques), et les tests ne visent que les scripts : les feuilles de style restent un seul
  // fichier, dans l'ordre d'index.html.
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 5 },
            { name: 'vendor', test: /node_modules/, priority: 4 },
            { name: 'furniture', test: /src[\\/]furniture[\\/].*\.ts$/, tags: ['$initial'], priority: 3 },
            { name: 'ship', test: /src[\\/](?:deck|levels)\.ts$|src[\\/](?:cabin|housing)[\\/].*\.ts$/, tags: ['$initial'], priority: 2 },
            { name: 'activities', test: /src[\\/](?:salvage|base|gardening|fishing|quiz|crew|board)[\\/].*\.ts$/, tags: ['$initial'], priority: 1 },
            { name: 'common', test: /\.(?:ts|js|json)$/, tags: ['$initial'], minShareCount: 2 },
          ],
        },
      },
    },
  },
})
