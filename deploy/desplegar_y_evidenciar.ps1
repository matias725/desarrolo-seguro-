# ---------------------------------------------------------------------------
# Despliega la versión corregida en AWS, repite los ataques y actualiza el
# informe con la IP real. Un solo comando para dejar la entrega lista.
#
# Requisitos: AWS Academy iniciado y sus credenciales copiadas en
#             %USERPROFILE%\.aws\credentials (AWS Details -> AWS CLI).
# Uso (desde la raíz del repo, rama mejoras):
#   powershell -ExecutionPolicy Bypass -File deploy\desplegar_y_evidenciar.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
py -m pip install -q boto3 requests python-docx

# 1. Despliegue (rama mejoras + original en :8080 solo para tu IP, 2 h)
$salida = py deploy/desplegar_aws.py --vulnerable --key vockey | Tee-Object -Variable log
$ip = ($log | Select-String 'IP el.{1,3}stica\s*:\s*([\d\.]+)').Matches[0].Groups[1].Value
if (-not $ip) { throw "No se obtuvo la IP del despliegue." }
$corr = "https://$($ip -replace '\.', '-').sslip.io"
$orig = "http://${ip}:8080"

# 2. Esperar a que el aprovisionamiento termine (HTTPS + :8080), máx. 15 min
Write-Host "Esperando $corr ..."
$limite = (Get-Date).AddMinutes(15)
do {
    Start-Sleep -Seconds 30
    try {
        $a = (Invoke-WebRequest "$corr/index.php?id=1" -UseBasicParsing -TimeoutSec 10).StatusCode
        $b = (Invoke-WebRequest "$orig/index.php?id=1" -UseBasicParsing -TimeoutSec 10).StatusCode
    } catch { $a = 0; $b = 0 }
} until (($a -eq 200 -and $b -eq 200) -or (Get-Date) -gt $limite)
if ($a -ne 200) { throw "La versión corregida no respondió en 15 min. Revisar /var/log/pnk-deploy.log" }

# 3. Testing comparativo -> evidencia
$fecha = Get-Date -Format "yyyy-MM-dd HH:mm"
$evid = "docs/evidencias/resultado_testing.txt"
"Fecha: $fecha`nOriginal: $orig`nCorregida: $corr" | Out-File $evid -Encoding utf8
py tests/test_seguridad.py --vulnerable $orig --corregida $corr | Tee-Object -FilePath $evid -Append -Encoding utf8
"`n----- Cabeceras de seguridad (versión corregida) -----" | Out-File $evid -Append -Encoding utf8
(Invoke-WebRequest "$corr/index.php?id=1" -UseBasicParsing).RawContent.Split("`n") |
    Select-String '^(Content-Security|Strict-Transport|X-Frame|X-Content-Type|Referrer-Policy|Set-Cookie)' |
    ForEach-Object { $_.Line.Trim() } | Out-File $evid -Append -Encoding utf8
"setup/setup.php -> HTTP " + $(try { (Invoke-WebRequest "$corr/setup/setup.php" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }) |
    Out-File $evid -Append -Encoding utf8

# 4. Informe con las URLs reales (+ PDF si Word está instalado)
py scripts/generar_informe.py --ip $ip
try {
    $w = New-Object -ComObject Word.Application
    $d = $w.Documents.Open((Resolve-Path docs/informe_vulnerabilidades.docx).Path, $false, $true)
    $d.SaveAs([ref](Join-Path (Resolve-Path docs).Path "informe_vulnerabilidades.pdf"), [ref]17)
    $d.Close($false); $w.Quit()
} catch { Write-Host "Word no disponible: exportar el PDF a mano." }

Write-Host "`nListo. Versión corregida: $corr/index.php?id=1"
Write-Host "Evidencia: $evid"
Write-Host "Siguiente: git add docs README.md; git commit -m 'test(evidencia): despliegue AWS $fecha'; git push"
