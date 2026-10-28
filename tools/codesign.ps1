<#
.SYNOPSIS
  Signs Rayclone production executables with a local or CI Authenticode certificate.
#>
param(
  [string]$CertThumbprint = "",
  [string]$DistPath = "dist"
)

Write-Host "=== Rayclone Authenticode Code Signing ===" -ForegroundColor Cyan

if (-not (Test-Path $DistPath)) {
  Write-Error "Dist path '$DistPath' not found."
  exit 1
}

$cert = $null
if ($CertThumbprint) {
  $cert = Get-Item "Cert:\CurrentUser\My\$CertThumbprint" -ErrorAction SilentlyContinue
}

if (-not $cert) {
  Write-Host "Searching for existing Rayclone Code Signing Certificate..."
  $cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*Rayclone*" } | Select-Object -First 1
}

if (-not $cert) {
  Write-Host "Generating local self-signed Code Signing Certificate for development/testing..."
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Rayclone Open Source Development, O=Rayclone, C=US" -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(3)
  Write-Host "Created certificate: $($cert.Thumbprint)" -ForegroundColor Green
}

$targets = Get-ChildItem -Path $DistPath -Filter "*.exe" -File
foreach ($file in $targets) {
  Write-Host "Signing $($file.Name)..."
  $sig = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $cert -TimestampServer "http://timestamp.digicert.com" -ErrorAction SilentlyContinue
  if (-not $sig -or $sig.Status -ne "Valid") {
    # Fallback without timestamp server if network restricted
    $sig = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $cert
  }
  Write-Host "  -> $($file.Name): $($sig.Status)" -ForegroundColor Yellow
}

Write-Host "Code signing process completed." -ForegroundColor Green
