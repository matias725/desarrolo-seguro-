# Evidencias de Testing

Testing comparativo ejecutado sobre el despliegue en AWS: cada ataque se repite
contra la **versión original (vulnerable)** en `:8080` y contra la **versión
corregida** (rama `mejoras`) publicada por HTTPS.

- **Versión corregida:** https://54-197-67-4.sslip.io/index.php?id=1
- **Versión original (solo para evidencia, restringida a la IP del tester):** http://54.197.67.4:8080/index.php?id=1
- **Script reproducible:** [`tests/test_seguridad.py`](../../tests/test_seguridad.py)
- **Salida completa:** [`resultado_testing.txt`](resultado_testing.txt)

Reproducir:

```bash
pip install requests
python tests/test_seguridad.py \
    --vulnerable http://54.197.67.4:8080 \
    --corregida  https://54-197-67-4.sslip.io
```

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
