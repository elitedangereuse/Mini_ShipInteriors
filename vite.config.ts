import { defineConfig, type Plugin } from 'vite'
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

/**
 * Branche le relais multijoueur sur le serveur de dev (et de preview) de Vite, sur /ws/mini-shipinteriors.
 * Le relais fait reconnaître le cookie du site par le site local. Sans Docker, ?cmdr=X simule
 * le CMDR X (serveur de dev uniquement).
 */
function relay(): Plugin {
  const cmdrUrl = process.env.ED_CMDR_URL || ED_SITE_URL + CMDR_ENDPOINT
  return {
    name: 'mini-interior-relay',
    configureServer(server) {
      const { info, warn } = server.config.logger
      if (server.httpServer) attachRelay(server.httpServer, { log: (m) => info(m), error: (m) => warn(m), cmdrUrl, devCmdr: true })
    },
    configurePreviewServer(server) {
      const { info, warn } = server.config.logger
      attachRelay(server.httpServer, { log: (m) => info(m), error: (m) => warn(m), cmdrUrl })
    },
  }
}

export default defineConfig({
  // base relative : le build peut être servi depuis n'importe quel sous-dossier.
  base: './',
  plugins: [relay()],
  // Le client demande au site qui est connecté, ses quartiers et les scores des bornes (même
  // origine en prod) : en local, on relaie au site Docker.
  server: { proxy: { [CMDR_ENDPOINT]: ED_SITE_URL, [CABIN_ENDPOINT]: ED_SITE_URL, [SCORES_ENDPOINT]: ED_SITE_URL } },
  preview: { proxy: { [CMDR_ENDPOINT]: ED_SITE_URL, [CABIN_ENDPOINT]: ED_SITE_URL, [SCORES_ENDPOINT]: ED_SITE_URL } },
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
