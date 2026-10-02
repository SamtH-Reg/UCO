param(
  [string]$Base = (Join-Path $env:TEMP 'opencode\pvac_img'),
  [string]$OutFile = (Join-Path $env:TEMP 'opencode\pvac_ocr.tsv')
)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Output 'ERR sin motor OCR'; exit 1 }

$files = Get-ChildItem -LiteralPath $Base -Recurse -File -Include *.jpg
$sb = New-Object System.Text.StringBuilder
$n = 0; $err = 0
foreach ($f in $files) {
  $n++
  $rel = $f.FullName.Substring($Base.Length + 1)
  try {
    $sf = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
    $stream = Await ($sf.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $txt = ($res.Text -replace '\s+', ' ').Trim()
    [void]$sb.AppendLine($rel + "`t" + $txt)
    $bmp.Dispose(); $stream.Dispose()
  } catch {
    $err++
    [void]$sb.AppendLine($rel + "`t" + "__ERROR__ " + $_.Exception.Message)
  }
  if ($n % 25 -eq 0) { Write-Output ("... " + $n + "/" + $files.Count) }
}
[System.IO.File]::WriteAllText($OutFile, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("LISTO " + $n + " archivos, errores: " + $err + " -> " + $OutFile)
