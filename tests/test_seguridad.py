"""
Testing comparativo: repite cada ataque contra la versión ORIGINAL (vulnerable)
y contra la versión CORREGIDA, para evidenciar que la vulnerabilidad ya no existe.

Uso:
    pip install requests
    python tests/test_seguridad.py \
        --vulnerable http://<IP>:8080 \
        --corregida  https://<ip>.sslip.io

Si solo se pasa --corregida, verifica que los ataques fallan en la versión
desplegada (no necesita la versión vulnerable en línea).
"""
import argparse
import re
import sys

import requests
import urllib3

urllib3.disable_warnings()


def token_y_sesion(base):
    """Devuelve una sesión con cookie válida y el token CSRF de la página."""
    s = requests.Session()
    home = s.get(base + "/index.php?id=1", verify=False, timeout=20)
    m = re.search(r'name="csrf-token" content="([0-9a-f]+)"', home.text)
    return s, (m.group(1) if m else None)


def t_login_sqli(base):
    """VUL-1: bypass de autenticación con ' OR '1'='1' -- -"""
    s, csrf = token_y_sesion(base)
    data = {"frmusuario": "' OR '1'='1' -- -", "frmpassword": "x"}
    if csrf:
        data["csrf_token"] = csrf
    s.post(base + "/setup/procesalogin.php", data=data, verify=False, timeout=20)
    logueado = "Bienvenido" in s.get(base + "/index.php?id=1", verify=False, timeout=20).text
    return not logueado, ("sin sesión (bloqueado)" if not logueado else "SESIÓN ABIERTA sin credenciales")


def t_id_sqli(base):
    """VUL-2: SQLi en el parámetro id (se espera 404 al no ser numérico)."""
    r = requests.get(base + "/index.php", params={"id": "0 UNION SELECT 1-- -"},
                     verify=False, timeout=20, allow_redirects=False)
    ok = r.status_code == 404
    return ok, f"HTTP {r.status_code} ({'rechazado' if ok else 'inyección aceptada'})"


def t_xss_y_auth(base):
    """VUL-10 + VUL-14: XSS almacenado e inserción sin sesión."""
    s, csrf = token_y_sesion(base)
    xss = "<script>alert(document.cookie)</script>"
    data = {"usuario": "hacker", "comentario": xss}
    if csrf:
        data["csrf_token"] = csrf
    r = s.post(base + "/grcomentarios.php", data=data, verify=False, timeout=20)
    page = s.get(base + "/index.php?id=1", verify=False, timeout=20).text
    ok = (xss not in page)  # el script no debe aparecer sin escapar
    detalle = f"HTTP {r.status_code}, "
    detalle += "script no reflejado" if ok else "SCRIPT SIN ESCAPAR (XSS)"
    return ok, detalle


def _get(base, ruta, **kw):
    return requests.get(base + ruta, verify=False, timeout=20, allow_redirects=False, **kw)


def t_carrito_sqli(base):
    """VUL-6: SQLi en mostrar_carrito.php."""
    r = _get(base, "/mostrar_carrito.php", params={"keyid": "1 OR 1=1", "id": "1 OR 1=1"})
    return r.status_code == 404, f"HTTP {r.status_code}"


def t_idor(base):
    """VUL-15: id de restaurante inexistente."""
    r = _get(base, "/index.php", params={"id": "999"})
    return r.status_code == 404, f"HTTP {r.status_code}"


def t_errores(base):
    """VUL-21: el error SQL no debe mostrar trazas."""
    r = _get(base, "/index.php", params={"id": "1'"})
    fuga = any(x in r.text for x in ("Fatal error", "Warning:", "mysqli", ".php on line"))
    return not fuga, f"HTTP {r.status_code}, " + ("TRAZA VISIBLE" if fuga else "sin traza técnica")


def t_csrf(base):
    """VUL-11 / VUL-13: POST sin token CSRF a login y carrito."""
    s = requests.Session()
    s.get(base + "/index.php?id=1", verify=False, timeout=20)
    a = s.post(base + "/setup/procesalogin.php", data={"frmusuario": "x@x.cl", "frmpassword": "x"},
               verify=False, timeout=20, allow_redirects=False).status_code
    b = s.post(base + "/carrito.php", data={"op": "1", "iditems": "5"}, verify=False, timeout=20).status_code
    return a == 403 and b == 403, f"login HTTP {a}, carrito HTTP {b}"


def t_archivos_internos(base):
    """VUL-19 / VUL-25 / VUL-30: archivos internos y librerías obsoletas no publicados."""
    rutas = ["/setup/setup.php", "/vendors/jquery/jquery-3.2.1.min.js", "/js/jquery.validate.min.js",
             "/vendors/fontawesome/bootstrap.bundle.min.js", "/js/jquery.form.js", "/css/style.map"]
    expuestos = [r for r in rutas if _get(base, r).status_code == 200]
    return not expuestos, ("ninguno accesible" if not expuestos else "ACCESIBLES: " + ", ".join(expuestos))


def t_cabeceras(base):
    """VUL-22 / VUL-29: cabeceras de seguridad, CSP estricta y cookie segura."""
    r = _get(base, "/index.php?id=1")
    h = r.headers
    csp = h.get("Content-Security-Policy", "")
    cookie = h.get("Set-Cookie", "").lower()
    faltan = []
    if not csp or "unsafe-inline" in csp or "script-src 'self'" not in csp:
        faltan.append("CSP estricta")
    if h.get("X-Content-Type-Options", "").lower() != "nosniff":
        faltan.append("nosniff")
    if h.get("X-Frame-Options", "").upper() != "DENY":
        faltan.append("X-Frame-Options")
    if "httponly" not in cookie or "samesite=strict" not in cookie:
        faltan.append("cookie HttpOnly/SameSite")
    if base.startswith("https") and ("secure" not in cookie or "Strict-Transport-Security" not in h):
        faltan.append("HSTS/cookie Secure")
    if re.search(r"\d", h.get("Server", "")):   # VUL-035: sin versión del servidor
        faltan.append("ocultar versión en Server (" + h.get("Server") + ")")
    return not faltan, ("todas presentes" if not faltan else "FALTAN: " + ", ".join(faltan))


PRUEBAS = [
    ("VUL-1  Login SQLi", t_login_sqli),
    ("VUL-2  SQLi en id", t_id_sqli),
    ("VUL-6  SQLi mostrar_carrito", t_carrito_sqli),
    ("VUL-10 XSS + VUL-14 auth", t_xss_y_auth),
    ("VUL-11/13 CSRF", t_csrf),
    ("VUL-15 IDOR", t_idor),
    ("VUL-21 Errores", t_errores),
    ("VUL-19/25/30 Archivos", t_archivos_internos),
    ("VUL-22/29 Cabeceras", t_cabeceras),
]


def correr(nombre_entorno, base, esperar_seguro):
    print(f"\n### {nombre_entorno}: {base}")
    fallos = 0
    for nombre, fn in PRUEBAS:
        seguro, detalle = fn(base)
        if esperar_seguro:
            estado = "PASA" if seguro else "FALLA"
            if not seguro:
                fallos += 1
        else:
            estado = "vulnerable (esperado)" if not seguro else "inesperado"
        print(f"  [{estado:22}] {nombre:26} -> {detalle}")
    return fallos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vulnerable", help="URL de la versión original (:8080)")
    ap.add_argument("--corregida", required=True, help="URL de la versión desplegada")
    args = ap.parse_args()

    if args.vulnerable:
        correr("ORIGINAL (vulnerable)", args.vulnerable, esperar_seguro=False)
    fallos = correr("CORREGIDA", args.corregida, esperar_seguro=True)

    print()
    if fallos:
        print(f"RESULTADO: {fallos} prueba(s) fallaron en la versión corregida.")
        sys.exit(1)
    print("RESULTADO: la versión corregida bloquea todos los ataques probados.")


if __name__ == "__main__":
    main()
