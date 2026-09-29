# Desarrollo Seguro

Proyecto de la asignatura **Desarrollo Seguro**. Se parte de una aplicación con código vulnerable, se identifican sus vulnerabilidades, se corrigen y se despliega la versión corregida en AWS con evidencia de testing.

- **Integrantes:** Matías Zepeda ([@matias725](https://github.com/matias725)), Joaquín Andrés Zambra Zúñiga ([@Joacooooooo](https://github.com/Joacooooooo))
- **Docente:** Jorge Cortés
- **Fecha de entrega:** [completar]

---

## 1. Estructura del repositorio (Git)

| Rama | Contenido |
|------|-----------|
| `main` (o `original`) | Proyecto original con el **código vulnerable** |
| `mejoras` | Proyecto con las **correcciones** de seguridad aplicadas |

Para comparar el código vulnerable con el corregido:

```bash
git clone https://github.com/matias725/desarrolo-seguro-.git
cd desarrolo-seguro-

# Ver el código original (vulnerable)
git checkout main

# Ver el código corregido
git checkout mejoras

# Ver todas las diferencias entre ambas versiones
git diff main..mejoras
```

Cada corrección se hizo en un commit separado que referencia su ID de vulnerabilidad (por ejemplo `fix(VUL001): validar permisos en /api/usuarios/:id`).

### Estructura de carpetas

```
.
├── src/            # Código fuente de la aplicación
├── tests/          # Pruebas que demuestran que la vulnerabilidad ya no existe
├── docs/
│   ├── informe.pdf # Informe con las correcciones
│   └── evidencias/ # Capturas de pantalla / resultados de pruebas
└── README.md
```

---

## 2. Tecnologías

- **Lenguaje / Framework:** [completar, ej. Node.js + Express / Python + Flask]
- **Base de datos:** [completar]
- **Despliegue:** AWS ([EC2 / Elastic Beanstalk / etc.])

---

## 3. Instalación y ejecución local

```bash
git clone https://github.com/matias725/desarrolo-seguro-.git
cd desarrolo-seguro-
git checkout mejoras

# Instalar dependencias
[npm install | pip install -r requirements.txt]

# Configurar variables de entorno
cp .env.example .env   # editar con los valores correspondientes

# Ejecutar
[npm start | python app.py]
```

La aplicación queda disponible en `http://localhost:[PUERTO]`.

---

## 4. Informe de vulnerabilidades y correcciones

El informe completo está en [`docs/informe.pdf`](docs/informe.pdf). Cada vulnerabilidad sigue este formato:

### VUL001 — Broken Access Control

| Campo | Detalle |
|-------|---------|
| **ID** | VUL001 |
| **Categoría OWASP** | A01:2021 – Broken Access Control |
| **Severidad** | [Alta / Media / Baja] |
| **Ubicación** | `[archivo:línea]` |

**Descripción:** [Qué permitía hacer la vulnerabilidad. Ej.: un usuario autenticado podía ver o modificar datos de otro usuario cambiando el `id` en la URL.]

**Código vulnerable (rama `main`):**

```[lenguaje]
// pegar fragmento vulnerable
```

**Corrección (rama `mejoras`):**

```[lenguaje]
// pegar fragmento corregido
```

**Explicación de la corrección:** [Ej.: se valida en el servidor que el `id` solicitado pertenezca al usuario de la sesión, o que el usuario tenga rol de administrador.]

**Evidencia:** [`docs/evidencias/VUL001/`](docs/evidencias/VUL001/)

---

### VUL002 — [Nombre de la vulnerabilidad]

| Campo | Detalle |
|-------|---------|
| **ID** | VUL002 |
| **Categoría OWASP** | [completar] |
| **Severidad** | [completar] |
| **Ubicación** | `[archivo:línea]` |

**Descripción:** [completar]

**Código vulnerable:** [completar]

**Corrección:** [completar]

**Evidencia:** [completar]

<!-- Copiar el bloque anterior para cada vulnerabilidad adicional (VUL003, VUL004, ...) -->

### Resumen

| ID | Vulnerabilidad | Severidad | Estado |
|----|----------------|-----------|--------|
| VUL001 | Broken Access Control | [ ] | Corregida |
| VUL002 | [completar] | [ ] | Corregida |

---

## 5. Despliegue en AWS (versión corregida)

La versión desplegada corresponde a la rama **`mejoras`**.

- **URL pública:** [http://completar]
- **Servicio:** [EC2 / Elastic Beanstalk / etc.]
- **Región:** [completar]

Pasos realizados:

1. [Crear la instancia / entorno en AWS]
2. [Configurar el Security Group (solo puertos necesarios: 22 restringido a mi IP, 80/443)]
3. [Clonar el repositorio y hacer `git checkout mejoras`]
4. [Instalar dependencias y configurar variables de entorno]
5. [Levantar la aplicación (ej. con `pm2`, `systemd` o `gunicorn`)]

---

## 6. Testing — Evidencia de que la vulnerabilidad ya no existe

Para cada vulnerabilidad se repite el ataque sobre ambas versiones:

| ID | Prueba | Resultado en `main` (vulnerable) | Resultado en `mejoras` / AWS (corregida) |
|----|--------|----------------------------------|-------------------------------------------|
| VUL001 | Acceder a `/[ruta]/{id_de_otro_usuario}` con la sesión de un usuario sin permisos | `200 OK` — devuelve datos ajenos | `403 Forbidden` |
| VUL002 | [completar] | [completar] | [completar] |

Ejecutar las pruebas automatizadas:

```bash
[npm test | pytest]
```

Las capturas y resultados se encuentran en [`docs/evidencias/`](docs/evidencias/).

---

## 7. Autores

| Nombre | GitHub | Rol |
|--------|--------|-----|
| Matías Zepeda | [@matias725](https://github.com/matias725) | Owner |
| Joaquín Andrés Zambra Zúñiga | [@Joacooooooo](https://github.com/Joacooooooo) | Collaborator |
