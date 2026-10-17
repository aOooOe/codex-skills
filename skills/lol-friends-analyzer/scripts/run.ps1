[CmdletBinding()]
param(
  [string]$GameRoot,
  [string]$OutputDirectory,
  [string]$NodePath,
  [string]$From,
  [string]$To,
  [string[]]$ImportDirectories,
  [int]$ClientProcessId,
  [switch]$OpenReport
)
$ErrorActionPreference='Stop'
if(!$OutputDirectory){$docs=[Environment]::GetFolderPath('MyDocuments');if(!$docs){$docs=[Environment]::GetFolderPath('UserProfile')};$OutputDirectory=Join-Path $docs 'LOL-Friends-Reports'}
if(!$NodePath){$bundled=Join-Path $PSScriptRoot '../runtime/node.exe';if(Test-Path -LiteralPath $bundled){$NodePath=(Resolve-Path -LiteralPath $bundled).Path}else{$nodeCommand=Get-Command node -ErrorAction SilentlyContinue;if($nodeCommand){$NodePath=$nodeCommand.Source}}}
if(!$NodePath){throw 'Node runtime missing. Download the Windows portable package, or provide -NodePath.'}
$config=@{output=[IO.Path]::GetFullPath($OutputDirectory);from=$From;to=$To;importDirectories=@($ImportDirectories|Where-Object {$_})}
if(!$ImportDirectories){
  $roots=@();if($GameRoot){$resolvedRoot=(Resolve-Path -LiteralPath $GameRoot).Path;$roots+= $resolvedRoot;if((Split-Path $resolvedRoot -Leaf) -in @('Game','LeagueClient')){$roots+=Split-Path $resolvedRoot -Parent}}
  $processes=@();try{$processes=@(Get-CimInstance Win32_Process -Filter "Name='LeagueClientUx.exe'" -ErrorAction Stop)}catch{}
  if(!$processes){$processes=@(Get-Process -Name LeagueClientUx -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{ProcessId=$_.Id;ExecutablePath=$_.Path;CommandLine=''}})}
  if($ClientProcessId){$processes=@($processes|Where-Object {$_.ProcessId -eq $ClientProcessId});if(!$processes){throw 'Selected League client process is not running.'}}
  if($processes.Count -gt 1){throw 'Multiple League clients found. Select one with -ClientProcessId.'}
  $port=$null;$secret=$null
  foreach($process in $processes){
    if($process.ExecutablePath){$exeDir=Split-Path $process.ExecutablePath -Parent;$roots+=$exeDir;$roots+=Split-Path $exeDir -Parent}
    $port=[regex]::Match([string]$process.CommandLine,'--app-port=(\d+)').Groups[1].Value
    $secret=[regex]::Match([string]$process.CommandLine,'--remoting-auth-token=([^\s"]+)').Groups[1].Value
  }
  # Some national clients hide executable paths. Inspect install metadata and
  # common game-library folders on discovered volumes, never a fixed drive.
  if(!$GameRoot){
    foreach($regRoot in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')){
      foreach($entry in @(Get-ItemProperty -Path ($regRoot+'\*') -ErrorAction SilentlyContinue)){
        if($entry.DisplayName -match 'League of Legends|英雄联盟'){
          if($entry.InstallLocation -and (Test-Path -LiteralPath $entry.InstallLocation)){$roots+=$entry.InstallLocation}
        }
      }
    }
    foreach($drive in @(Get-PSDrive -PSProvider FileSystem)){
      foreach($library in @('WeGameApps','Riot Games','Games','Tencent Games')){
        $libraryPath=Join-Path $drive.Root $library
        if(Test-Path -LiteralPath $libraryPath){
          foreach($folder in @(Get-ChildItem -LiteralPath $libraryPath -Directory -ErrorAction SilentlyContinue)){
            if($folder.Name -match 'League[ _-]*of[ _-]*Legends|英雄联盟'){$roots+=$folder.FullName}
          }
        }
      }
    }
  }
  $roots=@($roots|Select-Object -Unique)
  foreach($root in $roots){
    if($port -and $secret){break}
    foreach($lock in @((Join-Path $root 'lockfile'),(Join-Path $root 'LeagueClient/lockfile'))){
      if(Test-Path -LiteralPath $lock){try{$parts=([IO.File]::ReadAllText($lock)).Trim().Split(':');if($parts.Length -ge 5){$port=$parts[2];$secret=$parts[3];break}}catch{}}
    }
  }
  if(!$port -or !$secret){
    $logs=@();foreach($root in $roots){foreach($dir in @($root,(Join-Path $root 'LeagueClient'))){if(Test-Path -LiteralPath $dir){$logs+=Get-ChildItem -LiteralPath $dir -Filter '*LeagueClientUx.log' -File -ErrorAction SilentlyContinue}}}
    foreach($log in @($logs|Sort-Object LastWriteTime -Descending|Select-Object -First 5)){
      $reader=$null;try{$stream=[IO.File]::Open($log.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite);$reader=New-Object IO.StreamReader($stream);$content=$reader.ReadToEnd();$url=[regex]::Match($content,'https://riot:([^@\s]+)@(?:127\.0\.0\.1|localhost):(\d+)');if($url.Success){$secret=$url.Groups[1].Value;$port=$url.Groups[2].Value}else{$port=[regex]::Match($content,'--app-port=(\d+)').Groups[1].Value;$secret=[regex]::Match($content,'--remoting-auth-token=([^\s"]+)').Groups[1].Value};$content=$null;if($port -and $secret){break}}catch{}finally{if($reader){$reader.Dispose()}}
    }
  }
  if(!$port -or !$secret){throw 'Cannot discover a logged-in League client. Log in first; if needed provide -GameRoot with the game installation folder.'}
  $config.port=[int]$port;$config.password=$secret;$config.roots=$roots
}
$previousEncoding=$OutputEncoding
try{
  $OutputEncoding=New-Object Text.UTF8Encoding($false)
  $config|ConvertTo-Json -Depth 5 -Compress|& $NodePath (Join-Path $PSScriptRoot 'run.mjs')
  if($LASTEXITCODE -ne 0){throw 'Analysis failed. Previous report is preserved; read the message above.'}
  if($OpenReport){Start-Process -FilePath (Join-Path $OutputDirectory 'report.html')}
}finally{$OutputEncoding=$previousEncoding;$secret=$null;$config.password=$null}
