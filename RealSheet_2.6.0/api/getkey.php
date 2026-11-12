<?php
// Relais vers le service de cles de realsheet.net : /api/getkey.php (POST name + pub -> {wrapped, keyId}).
// L'app appelle ce fichier sur le meme site ; le serveur transmet la requete a realsheet.net (pas de CORS cote navigateur).
const REMOTE = 'https://realsheet.net/api/getkey.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit('POST uniquement'); }
$body = file_get_contents('php://input', false, null, 0, 65536);
$ctype = $_SERVER['CONTENT_TYPE'] ?? 'application/x-www-form-urlencoded';
$ctx = stream_context_create(['http' => [
    'method' => 'POST', 'timeout' => 15, 'ignore_errors' => true,
    'header' => "Content-Type: $ctype\r\nUser-Agent: Mozilla/5.0 (compatible; RealSheet)\r\n",
    'content' => $body],
  'ssl' => ['verify_peer' => true]]);
$data = @file_get_contents(REMOTE, false, $ctx);
if ($data === false) { http_response_code(502); exit('Echec du relais getkey'); }
$code = 200;
if (!empty($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) $code = (int)$m[1];
http_response_code($code);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo $data;
