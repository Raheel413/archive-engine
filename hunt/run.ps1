# Hunt footage on your own computer (YouTube blocks GitHub's machines; your home connection gets through).
#   .\hunt\run.ps1 mcqueen                      find everything still missing, upload it, start the render
#   .\hunt\run.ps1 mcqueen -Redo b05-0,b07-1    throw away those shots and find new ones (ids are in credits.md)
#   .\hunt\run.ps1 mcqueen -Only soundbite      only hunt one kind (clip, photo, print, poster, soundbite)
#   .\hunt\run.ps1 mcqueen -Browser firefox     use your Firefox login (age-restricted videos)
# Needs (once): Python 3.12, Node 20, Git, ffmpeg, Tesseract, Deno, GitHub CLI (see README).
param(
  [Parameter(Mandatory = $true)][string]$Film,
  [string]$Browser = "",
  [string]$Redo = "",
  [string]$Only = "",
  [switch]$NoFaces,
  [switch]$NoPush
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

git pull --rebase
if (-not (Test-Path node_modules)) { npm ci --no-audit --no-fund }
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -q --upgrade pip
.\.venv\Scripts\python.exe -m pip install -q --upgrade -r hunt\requirements.txt

node scripts/assets.mjs pull "films/$Film"

$a = @("hunt\hunt.py", "films\$Film")
if ($Browser) { $a += @("--browser", $Browser) }
if ($Redo) { $a += @("--redo", $Redo) }
if ($Only) { $a += @("--only", $Only) }
if ($NoFaces) { $a += "--no-faces" }
.\.venv\Scripts\python.exe @a

node scripts/validate.mjs "films/$Film" --allow-missing

if (-not $NoPush) {
  node scripts/assets.mjs push "films/$Film"
  git add "films/$Film/film.json" "films/$Film/credits.md"
  git commit -m "hunt: $Film" 2>$null
  git push
  Write-Host "`nUploaded. GitHub is rendering now: open the Actions tab."
}
