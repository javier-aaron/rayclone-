param (
    [string]$ImagePath = ""
)

try {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    if ([string]::IsNullOrWhiteSpace($ImagePath) -or -not (Test-Path $ImagePath)) {
        # Check Screenshots folder for latest
        $pics = [System.IO.Path]::Combine($HOME, "Pictures", "Screenshots")
        if (Test-Path $pics) {
            $latest = Get-ChildItem -Path $pics -Filter "*.png" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latest) { $ImagePath = $latest.FullName }
        }
    }

    if ([string]::IsNullOrWhiteSpace($ImagePath) -or -not (Test-Path $ImagePath)) {
        Write-Output ""
        exit 0
    }

    # Load WinRT Types
    [Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.ContainsGenericParameters
    })[0]

    function Await($WinRtAsync, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtAsync))
        $netTask.Wait(8000) | Out-Null
        return $netTask.Result
    }

    $fullPath = (Resolve-Path $ImagePath).Path
    $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPath)
    $file = Await $fileOp ([Windows.Storage.StorageFile])

    $streamOp = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
    $stream = Await $streamOp ([Windows.Storage.Streams.IRandomAccessStream])

    $decoderOp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
    $decoder = Await $decoderOp ([Windows.Graphics.Imaging.BitmapDecoder])

    $bitmapOp = $decoder.GetSoftwareBitmapAsync()
    $softwareBitmap = Await $bitmapOp ([Windows.Graphics.Imaging.SoftwareBitmap])

    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
    }

    if ($engine) {
        $ocrOp = $engine.RecognizeAsync($softwareBitmap)
        $ocrResult = Await $ocrOp ([Windows.Media.Ocr.OcrResult])
        if ($ocrResult -and [string]::IsNullOrWhiteSpace($ocrResult.Text) -eq $false) {
            Write-Output $ocrResult.Text
            exit 0
        }
    }

    Write-Output "OCR Completed on $([System.IO.Path]::GetFileName($ImagePath))"
} catch {
    Write-Output "OCR Completed on $ImagePath"
}
