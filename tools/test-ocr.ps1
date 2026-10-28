Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$bmp = New-Object System.Drawing.Bitmap 400, 120
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font "Arial", 28
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
$g.DrawString("RAYCLONE 2026", $font, $brush, 10, 20)
$testPath = [System.IO.Path]::GetFullPath("test-ocr.png")
$bmp.Save($testPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

[Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null

$asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1

function Await-Async($asyncOp) {
    $type = $asyncOp.GetType().GetInterfaces() | Where-Object { $_.Name -like "IAsyncOperation`1" } | Select-Object -First 1
    $returnType = $type.GetGenericArguments()[0]
    $concrete = $asTaskMethod.MakeGenericMethod($returnType)
    $task = $concrete.Invoke($null, @($asyncOp))
    return $task.GetAwaiter().GetResult()
}

$file = Await-Async ([Windows.Storage.StorageFile]::GetFileFromPathAsync($testPath))
$stream = Await-Async ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
$decoder = Await-Async ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
$softwareBitmap = Await-Async ($decoder.GetSoftwareBitmapAsync())

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
}

$ocrResult = Await-Async ($engine.RecognizeAsync($softwareBitmap))
Write-Output "OCR Result: '$($ocrResult.Text)'"
Remove-Item $testPath
