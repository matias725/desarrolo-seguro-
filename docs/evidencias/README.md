# Evidencias de Testing

Testing comparativo ejecutado sobre el despliegue en AWS: cada ataque se repite
contra la **versión original (vulnerable)** en `:8080` y contra la **versión
corregida** (rama `mejoras`) publicada por HTTPS.

- **Versión corregida:** https://54-197-67-4.sslip.io/index.php?id=1
- **Versión original (solo para evidencia, restringida a la IP del tester):** http://54.197.67.4:8080/index.php?id=1
- **Script reproducible:** [`tests/test_seguridad.py`](../../tests/test_seguridad.py)
- **Salida completa (AWS):** [`resultado_testing.txt`](resultado_testing.txt)

Reproducir:

```bash
pip install requests
python tests/test_seguridad.py \
    --vulnerable http://54.197.67.4:8080 \
    --corregida  https://54-197-67-4.sslip.io
```

## Evidencia local (sin AWS)

Como AWS Academy recicla las instancias, el testing comparativo también puede
reproducirse por completo en el equipo con XAMPP, levantando las dos versiones
en bases de datos aisladas. Las 24 vulnerabilidades verificables por HTTP
(VUL001–VUL018, VUL020–VUL022, VUL024–VUL026) se comprobaron así.

- **Salida completa (local):** [`resultado_local.txt`](resultado_local.txt)
- **Laboratorio reproducible:** [`tests/lab_local.sh`](../../tests/lab_local.sh)

```bash
bash tests/lab_local.sh up      # original -> :8080 · corregida -> :8000
python tests/test_seguridad.py --vulnerable http://127.0.0.1:8080 --corregida http://127.0.0.1:8000
bash tests/lab_local.sh down
```

VUL019 (403 en `setup.php`), VUL023 (claves aleatorias y log con permisos 600) y
VUL027 (retiro de `:8080` a las 2 h) dependen de Apache y systemd, por lo que
solo se evidencian en el despliegue de AWS.

## Resultado

| Prueba | Vulnerabilidad | Original `:8080` | Corregida (HTTPS) |
|--------|----------------|------------------|-------------------|
| Login SQLi `' OR '1'='1' -- -` | VUL-1 | Sesión abierta sin credenciales | Bloqueado (login falla) |
| SQLi en parámetro `id` | VUL-2 | Inyección aceptada (HTTP 200) | HTTP 404 (`id` no numérico rechazado) |
| XSS almacenado + inserción sin sesión | VUL-10 / VUL-14 | `<script>` almacenado y reflejado sin escapar | HTTP 403 (requiere login) y salida escapada |

**Cabeceras de seguridad verificadas en la versión corregida:** Content-Security-Policy,
Strict-Transport-Security, X-Frame-Options `DENY`, X-Content-Type-Options `nosniff`,
Referrer-Policy, y cookie de sesión `Secure; HttpOnly; SameSite=Strict`.

Endurecimiento adicional confirmado: `setup/setup.php` responde **403**, el script
`.sql` no es accesible, y `http://` redirige a `https://` (301).

> Nota: como AWS Academy recicla las instancias al cerrar el laboratorio, la IP
> `54.197.67.4` puede dejar de responder; en ese caso se vuelve a desplegar con
> `python deploy/desplegar_aws.py --vulnerable` y se actualiza esta URL.
