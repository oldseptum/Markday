# Builds main.js by concatenating src/*.js (in filename order) without BOM.
# No Node needed. Run:  powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$srcDir = Join-Path $root 'src'
$files = Get-ChildItem -Path $srcDir -Filter '*.js' | Sort-Object Name
$parts = foreach ($f in $files) { [IO.File]::ReadAllText($f.FullName) }
$out = ($parts -join "`n")
$enc = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $root 'main.js'), $out, $enc)
Write-Output ("Built main.js from {0} files ({1} bytes)" -f $files.Count, $out.Length)
