<?php
// Relais de téléchargement pour RealSheet : /api/proxy.php?url=https://exemple.com/livre.abc
// Contourne les restrictions CORS du navigateur. http/https uniquement, adresses privées refusées.
$url = $_GET['url'] ?? '';
$p = parse_url($url);
if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host'])) {
    http_response_code(400); exit('URL invalide');
}
$ips = gethostbynamel($p['host']) ?: [];
if (!$ips) { http_response_code(502); exit('Hote introuvable'); }
foreach ($ips as $ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        http_response_code(403); exit('Adresse refusee');
    }
}
$ctx = stream_context_create(['http' => ['timeout' => 15, 'follow_location' => 0, 'user_agent' => 'Mozilla/5.0 (compatible; RealSheet)'],
                              'ssl' => ['verify_peer' => true]]);
$data = @file_get_contents($url, false, $ctx, 0, 5 * 1024 * 1024 + 1);
if ($data === false || strlen($data) > 5 * 1024 * 1024) { http_response_code(502); exit('Echec du telechargement'); }
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
echo $data;
