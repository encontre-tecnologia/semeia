# Publica o site no Cloudflare Pages (projeto "semeia").
#
# Monta a pasta em deploys/<data>-<tema> e envia. As páginas entram por glob:
# a lista fixa de antes esquecia toda página nova (foi assim que carrinho.html
# e o painel ficaram de fora por um tempo).
#
#   .\scripts\deploy-pages.ps1 -Theme frete-por-distancia
#
param(
  [string]$Theme = "site"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd"
$staging = Join-Path $projectRoot "deploys\$stamp-$Theme"

if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

# Tudo que é página, menos os mocks de desenvolvimento (*-preview-test.html).
Get-ChildItem -Path $projectRoot -Filter "*.html" -File |
  Where-Object { $_.Name -notlike "*-preview-test.html" } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $staging -Force }

foreach ($extra in @("_headers", "_redirects", "_worker.js", "robots.txt", "sitemap.xml")) {
  $path = Join-Path $projectRoot $extra
  if (Test-Path $path) { Copy-Item -LiteralPath $path -Destination $staging -Force }
}

Copy-Item -Path (Join-Path $projectRoot "assets") -Destination $staging -Recurse -Force

$pages = (Get-ChildItem -Path $staging -Filter "*.html" -File).Count
Write-Host "Publicando $pages páginas de $staging"

Push-Location $projectRoot
try {
  npx wrangler pages deploy "deploys\$stamp-$Theme" --project-name semeia --commit-dirty=true
  if ($LASTEXITCODE -ne 0) { throw "O deploy do Pages falhou com código $LASTEXITCODE." }
} finally {
  Pop-Location
}
