// Billets d'identité délivrés par elitedangereuse.fr (integration/elitedangereuse/mini-interior-ticket.php).
//
// Format : base64url(JSON {name, key, exp}) + "." + base64url(HMAC-SHA256(partie 1, secret))
//   name : nom du CMDR tel qu'affiché sur le site (déjà décodé, sans « CMDR »)
//   key  : empreinte stable et anonyme du CMDR (permet de reconnaître deux onglets du même joueur)
//   exp  : expiration (secondes Unix) — le billet ne sert qu'à ouvrir la connexion
//
// Le secret est partagé entre le site (variable MINI_INTERIOR_SECRET, lue par ed_secret())
// et ce serveur (même variable d'environnement).
import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url')

/** @returns {{ name: string, key: string } | null} */
export function verifyTicket(ticket, secret, now = Date.now() / 1000) {
  if (!secret || typeof ticket !== 'string' || ticket.length > 1024) return null
  const [body, sig] = ticket.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(body, secret))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload?.name !== 'string' || typeof payload.exp !== 'number' || payload.exp < now) return null
  const name = payload.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40)
  return name ? { name, key: String(payload.key ?? '').slice(0, 64) } : null
}

/** Émet un billet (serveur de dev uniquement : simule le site). */
export function issueTicket(name, secret, ttl = 300) {
  const body = Buffer.from(JSON.stringify({ name, key: `dev-${name.toLowerCase()}`, exp: Math.floor(Date.now() / 1000) + ttl })).toString('base64url')
  return `${body}.${sign(body, secret)}`
}
