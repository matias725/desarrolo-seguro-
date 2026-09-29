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


PRUEBAS = [
    ("VUL-1  Login SQLi", t_login_sqli),
    ("VUL-2  SQLi en id", t_id_sqli),
    ("VUL-10 XSS + VUL-14 auth", t_xss_y_auth),
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
