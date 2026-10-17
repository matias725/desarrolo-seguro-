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
$pruebas = py tests/test_seguridad.py --vulnerable $orig --corregida $corr   # (Tee-Object de PS 5.1 no admite -Encoding)
$pruebas
$pruebas | Out-File $evid -Append -Encoding utf8
"`n----- Cabeceras de seguridad (versión corregida) -----" | Out-File $evid -Append -Encoding utf8
(Invoke-WebRequest "$corr/index.php?id=1" -UseBasicParsing).RawContent.Split("`n") |
    Select-String '^(Content-Security|Strict-Transport|X-Frame|X-Content-Type|Referrer-Policy|Set-Cookie)' |
    ForEach-Object { $_.Line.Trim() } | Out-File $evid -Append -Encoding utf8

# 3b. VUL027: apenas termina la evidencia se cierra el puerto 8080 en el
# Security Group; la versión vulnerable deja de ser alcanzable de inmediato
# (además se borra sola de la instancia a las 2 h).
py -c "import boto3; ec2=boto3.client('ec2',region_name='us-east-1'); sg=ec2.describe_security_groups(Filters=[{'Name':'group-name','Values':['pnk-sg']}])['SecurityGroups'][0]; [ec2.revoke_security_group_ingress(GroupId=sg['GroupId'], IpPermissions=[p]) for p in sg['IpPermissions'] if p.get('FromPort')==8080]; print('Puerto 8080 cerrado en pnk-sg')"
$cerrado = try { Invoke-WebRequest "$orig/index.php?id=1" -UseBasicParsing -TimeoutSec 10 | Out-Null; "ABIERTO" } catch { "cerrado (sin respuesta)" }
$linea = "Version original :8080 tras el testing -> $cerrado"
$linea
$linea | Out-File $evid -Append -Encoding utf8

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
