$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsonPath = Join-Path $root 'forum\tunebooks\1_PD.json'
$jsPath = Join-Path $root 'forum\tunebooks\1_PD.json.js'
$url = 'https://realsheet.net/forum/tunebooks/1_PD.json'

if (-not (Test-Path (Split-Path $jsonPath -Parent))) {
    throw "Dossier introuvable : $(Split-Path $jsonPath -Parent). Place ce script dans le dossier rsfix."
}

Write-Host 'Telechargement du tunebook depuis realsheet.net...'
$tmp = Join-Path $env:TEMP ('1_PD_' + [guid]::NewGuid().ToString('N') + '.json')
try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    $raw = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8)
    $book = $raw | ConvertFrom-Json
    if ($book.v -ne 1 -or $book.name -ne '1_PD' -or $book.tunes.Count -lt 1 -or -not $book.keyId) {
        throw 'Le fichier recu ne ressemble pas au tunebook attendu.'
    }
    [System.IO.File]::WriteAllText($jsonPath, $raw, (New-Object System.Text.UTF8Encoding($false)))
    $js = '/* Copie de 1_PD.json pour le mode file:// (mise a jour automatique). */' + "`r`n" +
          'window.__RS_FILES__=window.__RS_FILES__||{};' + "`r`n" +
          'window.__RS_FILES__["1_PD.json"]=' + $raw.Trim() + ';' + "`r`n"
    [System.IO.File]::WriteAllText($jsPath, $js, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ''
    Write-Host 'Mise a jour terminee.' -ForegroundColor Green
    Write-Host ('keyId : ' + $book.keyId)
    Write-Host ('Morceaux : ' + $book.tunes.Count)
    Write-Host ('Date : ' + $book.meta.lastupdate)
    Write-Host ''
    Write-Host 'Relance ensuite RealSheet. Si la page etait deja ouverte, ferme-la completement avant de la rouvrir.'
}
finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
