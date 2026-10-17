[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$NodeBinary,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$skillRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$OutputDirectory){$OutputDirectory=Join-Path $skillRoot 'dist'}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$runtime=Get-Content -LiteralPath (Join-Path $skillRoot 'references/runtime.json') -Raw|ConvertFrom-Json
$actual=(Get-FileHash -LiteralPath $NodeBinary -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $runtime.sha256){throw 'Runtime SHA256 does not match the verified release manifest.'}
$stage=Join-Path $OutputDirectory ('stage-'+(Get-Date -Format 'yyyyMMddHHmmssfff'))
$target=Join-Path $stage 'lol-friends-analyzer'
New-Item -ItemType Directory -Path $target -Force | Out-Null
foreach($name in @('SKILL.md','README.md','LICENSE','Start.cmd','Install-Skill.cmd','agents','assets','scripts','references','tests','demo.html')){
  $item=Join-Path $skillRoot $name
  if(Test-Path -LiteralPath $item){Copy-Item -LiteralPath $item -Destination $target -Recurse -Force}
}
New-Item -ItemType Directory -Path (Join-Path $target 'runtime') -Force | Out-Null
Copy-Item -LiteralPath $NodeBinary -Destination (Join-Path $target 'runtime/node.exe')
$runtime|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $target 'runtime/manifest.json') -Encoding UTF8
$zip=Join-Path $OutputDirectory 'lol-friends-analyzer-windows-x64.zip'
Compress-Archive -LiteralPath $target -DestinationPath $zip -CompressionLevel Optimal -Force
$hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
($hash+'  '+[IO.Path]::GetFileName($zip))|Set-Content -LiteralPath ($zip+'.sha256') -Encoding ASCII
Write-Output ('PACKAGE_PATH='+$zip)
Write-Output ('SHA256='+$hash)
