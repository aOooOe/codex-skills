[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents/skills/lol-friends-analyzer'
if([IO.Path]::GetFullPath($destination) -eq $source){Write-Output 'Already installed in this location.';exit 0}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach($name in @('SKILL.md','README.md','LICENSE','Start.cmd','Install-Skill.cmd','demo.html','agents','assets','scripts','references','tests','runtime')){
  $item=Join-Path $source $name
  if(Test-Path -LiteralPath $item){Copy-Item -LiteralPath $item -Destination $destination -Recurse -Force}
}
Write-Output ('Installed: '+$destination)
Write-Output 'Refresh or restart your AI client, then use $lol-friends-analyzer.'
