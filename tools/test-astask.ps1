Add-Type -AssemblyName System.Runtime.WindowsRuntime
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTask = $methods | Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod } | Select-Object -First 1
Write-Output "AsTask method: $asTask"
