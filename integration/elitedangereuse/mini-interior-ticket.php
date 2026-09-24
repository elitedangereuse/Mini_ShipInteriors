<?php

declare(strict_types=1);

// mini-interior-ticket.php — billet d'identité pour le jeu Mini Interior (sous-domaine).
//
// À déposer à la racine de elitedangereuse.fr. Le cookie ED_LOGGED_CMDR_ID est httponly et
// propre à elitedangereuse.fr : ni le JavaScript du jeu ni son serveur (sur un sous-domaine) ne
// peuvent le lire. Le jeu appelle donc cette page (fetch avec credentials, même site : le cookie
// part avec la requête), qui répond par un billet signé :
//
//   { "cmdr": "Adam Fauster", "ticket": "<base64url(JSON)>.<base64url(HMAC-SHA256)>" }
//
// Le jeu transmet le billet à son relais multijoueur, qui vérifie la signature avec le même
// secret (server/ticket.js dans le repo mini_interior) : un joueur ne peut pas se faire passer
// pour un autre CMDR, et le serveur du jeu n'a jamais besoin d'accéder à la base.
//
// Configuration (environnement PHP de la prod, lu par ed_secret()) :
//   MINI_INTERIOR_SECRET   secret partagé avec le serveur du jeu (32 octets aléatoires ou plus)
//   MINI_INTERIOR_ORIGINS  origines autorisées, séparées par des virgules
//                          (défaut : https://jeu.elitedangereuse.fr)

require_once __DIR__ . '/phputils/endpoint_auth.php';
require_once __DIR__ . '/phputils/secrets.php';

const MINI_INTERIOR_TICKET_TTL = 300;

$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', ed_secret('MINI_INTERIOR_ORIGINS', 'https://jeu.elitedangereuse.fr'))
)));
if (ed_is_local_environment()) {
    $allowedOrigins[] = 'http://localhost:5173';
}

$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET');
}
header('Vary: Origin');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$secret = ed_secret('MINI_INTERIOR_SECRET');
if ($secret === '') {
    http_response_code(503);
    echo json_encode(['error' => 'not_configured']);
    exit;
}

$pdo = bdd_connect();
$stored = ed_endpoint_cmdr($pdo);
if ($stored === null) {
    // Visiteur non connecté : le jeu lui donne un nom d'invité.
    echo json_encode(['cmdr' => null]);
    exit;
}

$base64url = static fn (string $bin): string => rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');

$payload = [
    // Nom visible (cmdr.name est stocké encodé : « Adam+fauster »), cf. AGENTS.md.
    'name' => ed_cmdr_display_name($stored),
    // Empreinte stable et anonyme du CMDR : reconnaît deux onglets du même joueur.
    'key' => substr(hash('sha256', ed_cmdr_key($stored)), 0, 16),
    'exp' => time() + MINI_INTERIOR_TICKET_TTL,
];
$body = $base64url((string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$signature = $base64url(hash_hmac('sha256', $body, $secret, true));

echo json_encode(['cmdr' => $payload['name'], 'ticket' => $body . '.' . $signature], JSON_UNESCAPED_UNICODE);
