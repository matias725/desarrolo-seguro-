// Panel de administración. Usa solo la API /api/v1/admin/* (que vuelve a
// comprobar rol y 2FA en cada petición y deja todo en la auditoría).
// Los datos se pintan con textContent (Carta.h), nunca como HTML.
(function () {
  'use strict';
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  const { api, h, toast, moneda, fecha, conBoton, ESTADOS } = window.Carta;

  const TRANSICIONES = { pendiente: ['preparando', 'cancelado'], preparando: ['listo', 'cancelado'], listo: ['entregado'], entregado: [], cancelado: [] };
  const TEXTO_ACCION = { preparando: 'Preparar', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelar' };
  const TIPOS_ALERTA = {
    cuenta_bloqueada: 'Cuenta bloqueada por intentos fallidos',
    ataque_multiples_cuentas: 'Una IP probando muchas cuentas',
    fuerza_bruta_masiva: 'Muchos logins fallidos en poco tiempo',
    login_ip_nueva: 'Ingreso desde una IP nueva',
    login_ips_multiples: 'Ingresos desde varias IPs',
    '2fa_fallido_repetido': 'Códigos 2FA incorrectos repetidos',
  };

  let temporizador = null;
  let restaurantesCache = null;

  // ---------------- Utilidades de UI
  const qs = (params) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : '';
  };

  const boton = (texto, onclick, clase = 'btn btn--fantasma btn--mini') =>
    h('button', { type: 'button', class: clase, onclick: (e) => conBoton(e.currentTarget, () => onclick(e.currentTarget)) }, texto);

  // Acciones destructivas: hay que tocar dos veces (sin window.confirm).
  function botonPeligro(texto, onclick) {
    const b = h('button', { type: 'button', class: 'btn btn--fantasma btn--mini' }, texto);
    b.addEventListener('click', () => {
      if (b.dataset.armado !== '1') {
        b.dataset.armado = '1';
        b.textContent = '¿Seguro?';
        b.classList.add('btn--peligro');
        b.classList.remove('btn--fantasma');
        setTimeout(() => {
          b.dataset.armado = '';
          b.textContent = texto;
          b.classList.remove('btn--peligro');
          b.classList.add('btn--fantasma');
        }, 3500);
        return;
      }
      conBoton(b, () => onclick(b));
    });
    return b;
  }

  const chip = (texto, tipo) => h('span', { class: `chip chip--${tipo || 'gris'}` }, texto);

  function tabla(columnas, filas) {
    if (!filas.length) return h('p', { class: 'vacio' }, 'No hay resultados.');
    return h('div', { class: 'tabla-scroll' },
      h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { class: c.num ? 'num' : null }, c.titulo)))),
        h('tbody', {}, filas.map((f) => h('tr', {}, columnas.map((c) => h('td', { class: c.num ? 'num' : null }, c.valor(f))))))
      )
    );
  }

  function paginador(pag, ir) {
    if (!pag || pag.paginas <= 1) return pag && pag.total ? h('p', { class: 'paginador' }, `${pag.total} resultado(s)`) : null;
    return h('div', { class: 'paginador' },
      h('button', { type: 'button', class: 'btn btn--fantasma btn--mini', disabled: pag.pagina <= 1, onclick: () => ir(pag.pagina - 1) }, '← Anterior'),
      `Página ${pag.pagina} de ${pag.paginas} · ${pag.total} resultado(s)`,
      h('button', { type: 'button', class: 'btn btn--fantasma btn--mini', disabled: pag.pagina >= pag.paginas, onclick: () => ir(pag.pagina + 1) }, 'Siguiente →')
    );
  }

  // Barra de filtros: campos = [{ nombre, etiqueta, tipo: 'select'|'text'|'date'|'number', opciones }]
  function filtros(campos, valores, alCambiar) {
    const form = h('form', { class: 'filtros' },
      campos.map((c) =>
        h('label', {}, c.etiqueta,
          c.tipo === 'select'
            ? h('select', { name: c.nombre }, c.opciones.map(([v, t]) => {
                const o = h('option', { value: v }, t);
                if (String(valores[c.nombre] ?? '') === String(v)) o.selected = true;
                return o;
              }))
            : h('input', { name: c.nombre, type: c.tipo || 'text', value: valores[c.nombre] ?? '', placeholder: c.placeholder || null, min: c.min ?? null })
        )
      ),
      h('button', { type: 'submit', class: 'btn btn--chico' }, 'Filtrar')
    );
    const leer = () => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
    form.addEventListener('submit', (e) => { e.preventDefault(); alCambiar(leer()); });
    form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => alCambiar(leer())));
    return form;
  }

  function cargando() {
    panel.replaceChildren(h('p', { class: 'vacio' }, 'Cargando…'));
  }

  function mostrarError(err) {
    panel.replaceChildren(h('p', { class: 'aviso-inline aviso-inline--error' }, err.message));
    if (err.status === 401 || err.status === 403) {
      panel.append(h('p', {}, h('a', { href: '/ingresar?volver=/admin' }, 'Volver a iniciar sesión')));
    }
  }

  async function restaurantes(forzar) {
    if (!restaurantesCache || forzar) {
      restaurantesCache = (await api('GET', '/admin/restaurantes?porPagina=100&incluirEliminados=true')).datos;
    }
    return restaurantesCache;
  }
  const opcionesRestaurantes = async () => [['', 'Todos'], ...(await restaurantes()).filter((r) => !r.eliminado).map((r) => [r.id, r.nombre])];

  async function actualizarChips() {
    try {
      const [ped, al] = await Promise.all([
        api('GET', '/admin/pedidos?estado=pendiente&porPagina=1'),
        api('GET', '/admin/alertas?revisada=false&porPagina=1'),
      ]);
      const cp = document.getElementById('chip-pedidos');
      const ca = document.getElementById('chip-alertas');
      cp.textContent = ped.paginacion.total;
      cp.hidden = !ped.paginacion.total;
      const pend = al.paginacion.total;
      ca.textContent = pend;
      ca.hidden = !pend;
    } catch { /* los chips son informativos */ }
  }

  // ======================================================================
  // Resumen
  // ======================================================================
  const estadoResumen = { desde: '', hasta: '' };
  async function verResumen() {
    cargando();
    try {
      const { datos: e } = await api('GET', `/admin/estadisticas${qs(estadoResumen)}`);
      const maxUnidades = Math.max(1, ...e.platosMasPedidos.map((p) => p.unidades));
      const porEstado = Object.fromEntries(e.porEstado.map((x) => [x.estado, x.pedidos]));
      panel.replaceChildren(
        filtros(
          [{ nombre: 'desde', etiqueta: 'Desde', tipo: 'date' }, { nombre: 'hasta', etiqueta: 'Hasta', tipo: 'date' }],
          estadoResumen,
          (v) => { Object.assign(estadoResumen, v); verResumen(); }
        ),
        h('div', { class: 'kpis' },
          kpi(moneda(e.resumen.ventas), 'Ventas (sin cancelados)'),
          kpi(e.resumen.pedidos, 'Pedidos'),
          kpi(moneda(e.resumen.ticketPromedio), 'Ticket promedio'),
          kpi(porEstado.pendiente || 0, 'Pendientes por atender')
        ),
        h('div', { class: 'grilla-admin' },
          h('article', { class: 'tarjeta' }, h('h2', { class: 'titulo-tarjeta' }, 'Pedidos por estado'),
            e.porEstado.length
              ? h('p', {}, e.porEstado.map((x) => [chip(`${ESTADOS[x.estado] || x.estado}: ${x.pedidos}`, x.estado), ' ']))
              : h('p', { class: 'vacio' }, 'Aún no hay pedidos.')),
          h('article', { class: 'tarjeta' }, h('h2', { class: 'titulo-tarjeta' }, 'Platos más pedidos'),
            tabla([
              { titulo: 'Plato', valor: (p) => [p.nombre, h('div', { class: 'fila__meta' }, p.restaurante)] },
              { titulo: 'Unid.', num: true, valor: (p) => p.unidades },
              { titulo: '', valor: (p) => h('div', { class: 'barra-mini', style: `width:${Math.round((p.unidades / maxUnidades) * 100)}px` }) },
            ], e.platosMasPedidos)),
          h('article', { class: 'tarjeta' }, h('h2', { class: 'titulo-tarjeta' }, 'Ventas por restaurante'),
            tabla([
              { titulo: 'Restaurante', valor: (r) => r.nombre },
              { titulo: 'Pedidos', num: true, valor: (r) => r.pedidos },
              { titulo: 'Ventas', num: true, valor: (r) => moneda(r.ventas) },
            ], e.porRestaurante)),
          h('article', { class: 'tarjeta' }, h('h2', { class: 'titulo-tarjeta' }, 'Últimos días'),
            tabla([
              { titulo: 'Día', valor: (d) => d.dia },
              { titulo: 'Pedidos', num: true, valor: (d) => d.pedidos },
              { titulo: 'Ventas', num: true, valor: (d) => moneda(d.ventas) },
            ], e.porDia.slice(0, 10)))
        )
      );
    } catch (err) {
      mostrarError(err);
    }
  }
  const kpi = (valor, etiqueta) => h('div', { class: 'kpi' }, h('span', { class: 'kpi__valor' }, valor), h('span', { class: 'kpi__etiqueta' }, etiqueta));

  // ======================================================================
  // Pedidos
  // ======================================================================
  const estadoPedidos = { estado: 'pendiente', restaurante: '', desde: '', hasta: '', pagina: 1 };
  async function verPedidos(silencioso) {
    if (!silencioso) cargando();
    try {
      const [r, opciones] = await Promise.all([
        api('GET', `/admin/pedidos${qs({ ...estadoPedidos, porPagina: 20 })}`),
        opcionesRestaurantes(),
      ]);
      panel.replaceChildren(
        filtros(
          [
            { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', opciones: [['', 'Todos'], ...Object.entries(ESTADOS)] },
            { nombre: 'restaurante', etiqueta: 'Restaurante', tipo: 'select', opciones },
            { nombre: 'desde', etiqueta: 'Desde', tipo: 'date' },
            { nombre: 'hasta', etiqueta: 'Hasta', tipo: 'date' },
          ],
          estadoPedidos,
          (v) => { Object.assign(estadoPedidos, v, { pagina: 1 }); verPedidos(); }
        ),
        h('p', { class: 'nota' }, 'La lista se actualiza sola cada 20 segundos.'),
        tabla([
          { titulo: 'Código', valor: (p) => h('a', { href: `/pedidos/${p.codigo}`, target: '_blank', rel: 'noopener', class: 'codigo' }, p.codigo) },
          { titulo: 'Restaurante', valor: (p) => p.restaurante },
          { titulo: 'Cliente', valor: (p) => p.usuario || 'Sin cuenta' },
          { titulo: 'Mesa', valor: (p) => p.mesa || '—' },
          { titulo: 'Prod.', num: true, valor: (p) => p.productos },
          { titulo: 'Total', num: true, valor: (p) => moneda(p.total) },
          { titulo: 'Hora', valor: (p) => fecha(p.creado) },
          { titulo: 'Estado', valor: (p) => chip(ESTADOS[p.estado], p.estado) },
          {
            titulo: 'Acciones',
            valor: (p) => h('div', { class: 'acciones' },
              boton('Ver', (b) => verDetallePedido(p.id, b)),
              TRANSICIONES[p.estado].map((sig) =>
                (sig === 'cancelado' ? botonPeligro : boton)(TEXTO_ACCION[sig], async () => {
                  await api('PATCH', `/admin/pedidos/${p.id}/estado`, { estado: sig });
                  toast(`Pedido ${p.codigo}: ${ESTADOS[sig]}`);
                  verPedidos(true);
                  actualizarChips();
                }, 'btn btn--mini'))
            ),
          },
        ], r.datos),
        paginador(r.paginacion, (n) => { estadoPedidos.pagina = n; verPedidos(); })
      );
      programar(() => verPedidos(true), 20000);
    } catch (err) {
      if (!silencioso) mostrarError(err);
    }
  }

  async function verDetallePedido(id, b) {
    const { datos: p } = await api('GET', `/admin/pedidos/${id}`);
    const fila = b.closest('tr');
    const siguiente = fila.nextElementSibling;
    if (siguiente && siguiente.classList.contains('detalle-pedido')) { siguiente.remove(); return; }
    fila.after(
      h('tr', { class: 'detalle-pedido' },
        h('td', { colspan: 9 },
          h('ul', {}, p.items.map((i) => h('li', {}, `${i.cantidad} × ${i.nombre} — ${moneda(i.subtotal)}`))),
          p.nota ? h('p', {}, h('strong', {}, 'Nota: '), p.nota) : null,
          h('p', { class: 'fila__meta' }, `Última actualización: ${fecha(p.actualizado || p.creado)}`)
        )
      )
    );
  }

  // ======================================================================
  // Catálogo: restaurantes → cartas → categorías → platos
  // ======================================================================
  let restoSeleccionado = null;

  const CAMPOS = {
    restaurante: [
      { n: 'nombre', t: 'Nombre', req: true, max: 200 },
      { n: 'rut', t: 'RUT (ej: 76543210-K)', req: true, max: 10 },
      { n: 'fono', t: 'Teléfono', req: true, max: 45 },
      { n: 'email', t: 'Correo', tipo: 'email', max: 100 },
      { n: 'direccion.calle', t: 'Calle', req: true, max: 100 },
      { n: 'direccion.numero', t: 'Número', req: true, max: 15 },
      { n: 'direccion.comuna', t: 'Comuna', req: true, max: 100 },
      { n: 'direccion.region', t: 'Región', max: 100 },
      { n: 'foto', t: 'Logo (nombre de archivo)', max: 100 },
    ],
    carta: [
      { n: 'nombre', t: 'Nombre de la carta', req: true, max: 45 },
      { n: 'orden', t: 'Orden', tipo: 'number' },
      { n: 'visible', t: 'Visible', tipo: 'check', def: true },
    ],
    categoria: [
      { n: 'nombre', t: 'Nombre de la categoría', req: true, max: 100 },
      { n: 'orden', t: 'Orden', tipo: 'number' },
      { n: 'visible', t: 'Visible', tipo: 'check', def: true },
    ],
    item: [
      { n: 'nombre', t: 'Nombre', req: true, max: 100 },
      { n: 'precio', t: 'Precio (CLP)', tipo: 'number', req: true },
      { n: 'descripcion', t: 'Descripción', tipo: 'textarea', max: 300 },
      { n: 'observaciones', t: 'Observaciones', max: 300 },
      { n: 'tiempo', t: 'Tiempo de preparación', max: 100 },
      { n: 'puntuacion', t: 'Estrellas (0 a 5)', tipo: 'number', def: 0, min: 0, maxN: 5 },
      { n: 'orden', t: 'Orden', tipo: 'number' },
      { n: 'foto', t: 'Foto (nombre de archivo)', max: 100 },
      { n: 'visible', t: 'Visible en la carta', tipo: 'check', def: true },
      { n: 'destacado', t: 'Destacado', tipo: 'check', def: false },
    ],
  };

  const leerRuta = (obj, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function fijarRuta(obj, ruta, valor) {
    const partes = ruta.split('.');
    let o = obj;
    partes.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; });
    o[partes[partes.length - 1]] = valor;
  }

  // Formulario de creación/edición. Al guardar llama a enviar(cuerpo).
  function editor(campos, actual, enviar, alCancelar) {
    const modo = actual ? 'editar' : 'crear';
    const entradas = campos.map((c) => {
      const valor = actual ? leerRuta(actual, c.n) : c.def;
      if (c.tipo === 'check') {
        const input = h('input', { type: 'checkbox', name: c.n });
        input.checked = valor === undefined ? true : Boolean(valor);
        return { c, input, el: h('label', { class: 'check' }, input, c.t) };
      }
      const input = c.tipo === 'textarea'
        ? h('textarea', { name: c.n, rows: 2, maxlength: c.max || null })
        : h('input', { name: c.n, type: c.tipo || 'text', maxlength: c.max || null, required: c.req && modo === 'crear', min: c.tipo === 'number' ? c.min ?? 0 : null, max: c.maxN ?? null });
      if (valor !== undefined && valor !== null) input.value = valor;
      return { c, input, el: h('label', {}, c.t, input) };
    });
    const form = h('form', { class: 'editor' },
      h('div', { class: 'editor__fila' }, entradas.filter((e) => e.c.tipo !== 'check').map((e) => e.el)),
      h('div', { class: 'acciones' }, entradas.filter((e) => e.c.tipo === 'check').map((e) => e.el)),
      h('div', { class: 'acciones' },
        h('button', { type: 'submit', class: 'btn btn--chico' }, modo === 'crear' ? 'Crear' : 'Guardar cambios'),
        h('button', { type: 'button', class: 'btn btn--fantasma btn--chico', onclick: alCancelar }, 'Cancelar'))
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cuerpo = {};
      for (const { c, input } of entradas) {
        let v;
        if (c.tipo === 'check') v = input.checked;
        else {
          const texto = input.value.trim();
          if (texto === '') {
            if (modo === 'crear' || c.req) continue; // sin cambio / no se envía
            v = c.n === 'puntuacion' ? 0 : null; // vaciar un campo opcional
          } else v = c.tipo === 'number' ? Number(texto) : texto;
        }
        if (modo === 'editar' && v === (leerRuta(actual, c.n) ?? null)) continue; // solo lo que cambió
        fijarRuta(cuerpo, c.n, v);
      }
      if (modo === 'editar' && Object.keys(cuerpo).length === 0) {
        toast('No hay cambios');
        return;
      }
      conBoton(form.querySelector('button[type="submit"]'), () => enviar(cuerpo));
    });
    setTimeout(() => { const p = form.querySelector('input:not([type=checkbox]), textarea'); if (p) p.focus(); }, 0);
    return form;
  }

  // Muestra un editor en lugar de "ancla" (o después de ella) y lo quita al terminar.
  function abrirEditor(contenedor, campos, actual, enviar) {
    const viejo = contenedor.querySelector(':scope > .editor');
    if (viejo) viejo.remove();
    const ed = editor(campos, actual, async (cuerpo) => {
      await enviar(cuerpo);
      ed.remove();
    }, () => ed.remove());
    contenedor.append(ed);
    ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function verCatalogo() {
    cargando();
    try {
      const lista = await restaurantes(true);
      if (!restoSeleccionado && lista.length) restoSeleccionado = (lista.find((r) => !r.eliminado) || lista[0]).id;
      const lado = h('aside', {},
        h('ul', { class: 'lista-restos' }, lista.map((r) =>
          h('li', {}, h('button', {
            type: 'button',
            class: r.eliminado ? 'eliminado' : null,
            'aria-current': String(r.id === restoSeleccionado),
            onclick: () => { restoSeleccionado = r.id; verCatalogo(); },
          }, r.nombre))
        )),
        h('p', {}, boton('+ Nuevo restaurante', () => {
          abrirEditor(lado, CAMPOS.restaurante, null, async (cuerpo) => {
            const r = await api('POST', '/admin/restaurantes', cuerpo);
            toast(`Restaurante "${r.datos.nombre}" creado`);
            restoSeleccionado = r.datos.id;
            verCatalogo();
          });
        }, 'btn btn--chico'))
      );
      const principal = h('div', {}, h('p', { class: 'vacio' }, 'Elige un restaurante.'));
      panel.replaceChildren(h('div', { class: 'catalogo' }, lado, principal));
      if (restoSeleccionado) await pintarRestaurante(principal, restoSeleccionado);
    } catch (err) {
      mostrarError(err);
    }
  }

  async function pintarRestaurante(cont, id) {
    const { datos: r } = await api('GET', `/admin/restaurantes/${id}`);
    const recargar = () => pintarRestaurante(cont, id);
    const cabecera = h('article', { class: 'tarjeta' },
      h('div', { class: 'tarjeta__cabecera' },
        h('div', {},
          h('h2', { class: 'titulo-tarjeta' }, r.nombre, r.eliminado ? chip('Eliminado', 'cancelado') : null),
          h('p', { class: 'fila__meta' }, `RUT ${r.rut} · ${r.direccion.calle} #${r.direccion.numero}, ${r.direccion.comuna} · ${r.fono}${r.email ? ` · ${r.email}` : ''}`)
        ),
        h('div', { class: 'acciones' },
          r.eliminado
            ? boton('Restaurar', async () => {
                await api('POST', `/admin/restaurantes/${id}/restaurar`);
                toast('Restaurante restaurado');
                verCatalogo();
              }, 'btn btn--mini')
            : [
                h('a', { class: 'btn btn--fantasma btn--mini', href: `/restaurantes/${id}`, target: '_blank', rel: 'noopener' }, 'Ver carta pública'),
                boton('Editar datos', () => abrirEditor(cabecera, CAMPOS.restaurante, r, async (cuerpo) => {
                  await api('PATCH', `/admin/restaurantes/${id}`, cuerpo);
                  toast('Datos guardados');
                  verCatalogo();
                })),
                botonPeligro('Eliminar', async () => {
                  await api('DELETE', `/admin/restaurantes/${id}`);
                  toast('Restaurante eliminado (se puede restaurar)');
                  verCatalogo();
                }),
              ]
        )
      )
    );

    const cartas = h('div', {},
      r.cartas.length ? r.cartas.map((c) => pintarCarta(c, recargar)) : h('p', { class: 'vacio' }, 'Este restaurante no tiene cartas todavía.')
    );
    const nueva = h('p', {}, r.eliminado ? null : boton('+ Nueva carta', () => abrirEditor(nueva, CAMPOS.carta, null, async (cuerpo) => {
      await api('POST', `/admin/restaurantes/${id}/cartas`, cuerpo);
      toast('Carta creada');
      recargar();
    }), 'btn btn--chico'));

    cont.replaceChildren(cabecera, h('h2', { class: 'titulo-seccion', style: 'margin-top:20px' }, 'Carta'), cartas, nueva);
  }

  function pintarCarta(c, recargar) {
    const art = h('section', { class: 'arbol-carta' });
    art.append(
      h('header', {},
        h('h3', {}, c.nombre, c.visible ? null : chip('Oculta')),
        h('div', { class: 'acciones' },
          boton('+ Categoría', () => abrirEditor(art, CAMPOS.categoria, null, async (cuerpo) => {
            await api('POST', `/admin/cartas/${c.id}/categorias`, cuerpo);
            toast('Categoría creada');
            recargar();
          })),
          boton(c.visible ? 'Ocultar' : 'Mostrar', async () => {
            await api('PATCH', `/admin/cartas/${c.id}`, { visible: !c.visible });
            recargar();
          }),
          boton('Editar', () => abrirEditor(art, CAMPOS.carta, c, async (cuerpo) => {
            await api('PATCH', `/admin/cartas/${c.id}`, cuerpo);
            toast('Carta guardada');
            recargar();
          })),
          botonPeligro('Eliminar', async () => {
            await api('DELETE', `/admin/cartas/${c.id}`);
            toast('Carta eliminada');
            recargar();
          })
        )
      ),
      ...(c.categorias && c.categorias.length ? c.categorias.map((cat) => pintarCategoria(cat, recargar)) : [h('p', { class: 'vacio-chico' }, 'Sin categorías.')])
    );
    return art;
  }

  function pintarCategoria(cat, recargar) {
    const sec = h('div', { class: 'arbol-cat' });
    const items = cat.items || [];
    sec.append(
      h('header', {},
        h('h4', {}, cat.nombre, cat.visible ? null : chip('Oculta')),
        h('div', { class: 'acciones' },
          boton('+ Plato', () => abrirEditor(sec, CAMPOS.item, null, async (cuerpo) => {
            await api('POST', `/admin/categorias/${cat.id}/items`, cuerpo);
            toast('Plato creado');
            recargar();
          })),
          boton('Editar', () => abrirEditor(sec, CAMPOS.categoria, cat, async (cuerpo) => {
            await api('PATCH', `/admin/categorias/${cat.id}`, cuerpo);
            toast('Categoría guardada');
            recargar();
          })),
          botonPeligro('Eliminar', async () => {
            await api('DELETE', `/admin/categorias/${cat.id}`);
            toast('Categoría eliminada');
            recargar();
          })
        )
      ),
      items.length
        ? h('ul', { class: 'items-admin' }, items.map((i) => pintarItem(i, sec, recargar)))
        : h('p', { class: 'vacio-chico' }, 'Sin platos.')
    );
    return sec;
  }

  function pintarItem(i, sec, recargar) {
    return h('li', { class: `item-admin ${i.visible ? '' : 'item-admin--oculto'}` },
      h('div', {},
        h('strong', {}, i.nombre), ' ', h('span', { class: 'precio' }, moneda(i.precio)),
        i.destacado ? chip('★ Destacado', 'media') : null,
        i.visible ? null : chip('Oculto'),
        i.descripcion ? h('div', { class: 'fila__meta' }, i.descripcion) : null
      ),
      h('div', { class: 'acciones' },
        boton(i.visible ? 'Ocultar' : 'Mostrar', async () => {
          await api('PATCH', `/admin/items/${i.id}`, { visible: !i.visible });
          recargar();
        }),
        boton(i.destacado ? 'Quitar destacado' : 'Destacar', async () => {
          await api('PATCH', `/admin/items/${i.id}`, { destacado: !i.destacado });
          recargar();
        }),
        boton('Editar', () => abrirEditor(sec, CAMPOS.item, i, async (cuerpo) => {
          await api('PATCH', `/admin/items/${i.id}`, cuerpo);
          toast('Plato guardado');
          recargar();
        })),
        botonPeligro('Eliminar', async () => {
          await api('DELETE', `/admin/items/${i.id}`);
          toast('Plato eliminado');
          recargar();
        })
      )
    );
  }

  // ======================================================================
  // Comentarios
  // ======================================================================
  const estadoComentarios = { restaurante: '', oculto: '', pagina: 1 };
  async function verComentarios() {
    cargando();
    try {
      const [r, opciones] = await Promise.all([
        api('GET', `/admin/comentarios${qs({ ...estadoComentarios, porPagina: 20 })}`),
        opcionesRestaurantes(),
      ]);
      panel.replaceChildren(
        filtros(
          [
            { nombre: 'restaurante', etiqueta: 'Restaurante', tipo: 'select', opciones },
            { nombre: 'oculto', etiqueta: 'Mostrar', tipo: 'select', opciones: [['', 'Todos'], ['false', 'Visibles'], ['true', 'Ocultos']] },
          ],
          estadoComentarios,
          (v) => { Object.assign(estadoComentarios, v, { pagina: 1 }); verComentarios(); }
        ),
        r.datos.length
          ? h('ul', { class: 'comentarios' }, r.datos.map((c) =>
              h('li', { class: 'comentario' },
                h('div', { class: 'comentario__cabecera' },
                  h('span', {}, h('strong', {}, c.usuario), ` (${c.email}) en ${c.restaurante}`, c.oculto ? chip('Oculto', 'cancelado') : null),
                  h('time', { datetime: c.creado }, fecha(c.creado))
                ),
                h('p', {}, c.comentario),
                h('div', { class: 'acciones', style: 'margin-top:8px' },
                  boton(c.oculto ? 'Mostrar' : 'Ocultar', async () => {
                    await api('PATCH', `/admin/comentarios/${c.id}`, { oculto: !c.oculto });
                    toast(c.oculto ? 'Comentario visible' : 'Comentario oculto');
                    verComentarios();
                  }),
                  botonPeligro('Eliminar', async () => {
                    await api('DELETE', `/admin/comentarios/${c.id}`);
                    toast('Comentario eliminado');
                    verComentarios();
                  })
                )
              )))
          : h('p', { class: 'vacio' }, 'No hay comentarios.'),
        paginador(r.paginacion, (n) => { estadoComentarios.pagina = n; verComentarios(); })
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  // ======================================================================
  // Usuarios
  // ======================================================================
  const estadoUsuarios = { q: '', rol: '', pagina: 1 };
  async function verUsuarios() {
    cargando();
    try {
      const r = await api('GET', `/admin/usuarios${qs({ ...estadoUsuarios, porPagina: 20 })}`);
      const accion = (u, fn, msj) => async () => { await fn(); toast(msj); verUsuarios(); };
      panel.replaceChildren(
        filtros(
          [
            { nombre: 'q', etiqueta: 'Buscar (nombre o correo)', placeholder: 'ej: maria' },
            { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: [['', 'Todos'], ['cliente', 'Clientes'], ['admin', 'Administradores']] },
          ],
          estadoUsuarios,
          (v) => { Object.assign(estadoUsuarios, v, { pagina: 1 }); verUsuarios(); }
        ),
        tabla([
          { titulo: 'Usuario', valor: (u) => [h('strong', {}, u.nombre), h('div', { class: 'fila__meta' }, u.email)] },
          { titulo: 'Rol', valor: (u) => chip(u.rol === 'admin' ? 'Admin' : 'Cliente', u.rol === 'admin' ? 'media' : 'gris') },
          {
            titulo: 'Estado',
            valor: (u) => [
              u.activo ? chip('Activo', 'ok') : chip('Desactivado', 'cancelado'),
              u.totp_activo ? chip('2FA', 'ok') : null,
              u.bloqueadoHasta ? chip(`Bloqueado hasta ${fecha(u.bloqueadoHasta)}`, 'alta') : null,
            ],
          },
          { titulo: 'Último ingreso', valor: (u) => fecha(u.ultimo_login) },
          {
            titulo: 'Acciones',
            valor: (u) => h('div', { class: 'acciones' },
              u.bloqueadoHasta ? boton('Desbloquear', accion(u, () => api('POST', `/admin/usuarios/${u.id}/desbloquear`), 'Cuenta desbloqueada')) : null,
              boton(u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin', accion(u, () => api('PATCH', `/admin/usuarios/${u.id}`, { rol: u.rol === 'admin' ? 'cliente' : 'admin' }), 'Rol actualizado')),
              u.activo
                ? botonPeligro('Desactivar', accion(u, () => api('PATCH', `/admin/usuarios/${u.id}`, { activo: false }), 'Cuenta desactivada y sesiones cerradas'))
                : boton('Activar', accion(u, () => api('PATCH', `/admin/usuarios/${u.id}`, { activo: true }), 'Cuenta activada')),
              botonPeligro('Cerrar sesiones', async () => {
                const x = await api('POST', `/admin/usuarios/${u.id}/cerrar-sesiones`);
                toast(`Se cerraron ${x.datos.sesionesCerradas} sesión(es)`);
              }),
              u.totp_activo ? botonPeligro('Reiniciar 2FA', accion(u, () => api('POST', `/admin/usuarios/${u.id}/2fa/reiniciar`), '2FA reiniciado: deberá configurarlo de nuevo')) : null
            ),
          },
        ], r.datos),
        paginador(r.paginacion, (n) => { estadoUsuarios.pagina = n; verUsuarios(); })
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  // ======================================================================
  // Alertas de seguridad
  // ======================================================================
  const estadoAlertas = { revisada: 'false', severidad: '', pagina: 1 };
  async function verAlertas() {
    cargando();
    try {
      const r = await api('GET', `/admin/alertas${qs({ ...estadoAlertas, porPagina: 20 })}`);
      const p = r.pendientes || {};
      panel.replaceChildren(
        h('div', { class: 'kpis' },
          kpi(p.alta || 0, 'Pendientes de severidad alta'),
          kpi(p.media || 0, 'Pendientes de severidad media'),
          kpi(p.baja || 0, 'Pendientes de severidad baja')
        ),
        filtros(
          [
            { nombre: 'revisada', etiqueta: 'Mostrar', tipo: 'select', opciones: [['false', 'Pendientes'], ['true', 'Revisadas'], ['', 'Todas']] },
            { nombre: 'severidad', etiqueta: 'Severidad', tipo: 'select', opciones: [['', 'Todas'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']] },
          ],
          estadoAlertas,
          (v) => { Object.assign(estadoAlertas, v, { pagina: 1 }); verAlertas(); }
        ),
        tabla([
          { titulo: 'Cuándo', valor: (a) => fecha(a.creado) },
          { titulo: 'Alerta', valor: (a) => [h('strong', {}, TIPOS_ALERTA[a.tipo] || a.tipo), ' ', chip(a.severidad, a.severidad)] },
          { titulo: 'Cuenta / IP', valor: (a) => [a.usuario ? `${a.usuario} (${a.email})` : '—', h('div', { class: 'fila__meta' }, `IP ${a.ip || '—'}`)] },
          { titulo: 'Detalle', valor: (a) => h('div', { class: 'detalle-json' }, a.detalle ? JSON.stringify(a.detalle) : '') },
          {
            titulo: '',
            valor: (a) => a.revisada
              ? [h('div', { class: 'fila__meta' }, `Revisada por ${a.revisada_por_nombre || '—'}`), boton('Reabrir', async () => { await api('PATCH', `/admin/alertas/${a.id}`, { revisada: false }); verAlertas(); actualizarChips(); })]
              : boton('Marcar revisada', async () => { await api('PATCH', `/admin/alertas/${a.id}`, { revisada: true }); toast('Alerta revisada'); verAlertas(); actualizarChips(); }, 'btn btn--mini'),
          },
        ], r.datos),
        paginador(r.paginacion, (n) => { estadoAlertas.pagina = n; verAlertas(); })
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  // ======================================================================
  // Auditoría
  // ======================================================================
  const estadoAuditoria = { accion: '', usuario: '', entidad: '', pagina: 1 };
  async function verAuditoria() {
    cargando();
    try {
      const r = await api('GET', `/admin/auditoria${qs({ ...estadoAuditoria, porPagina: 30 })}`);
      panel.replaceChildren(
        h('p', { class: 'nota' }, 'Registro inalterable de acciones: la aplicación solo puede agregar filas, nunca modificarlas ni borrarlas.'),
        filtros(
          [
            { nombre: 'accion', etiqueta: 'Acción', placeholder: 'ej: login_fallido' },
            { nombre: 'entidad', etiqueta: 'Entidad', placeholder: 'ej: pedidos' },
            { nombre: 'usuario', etiqueta: 'Id de usuario', tipo: 'number', min: 1 },
          ],
          estadoAuditoria,
          (v) => { Object.assign(estadoAuditoria, v, { pagina: 1 }); verAuditoria(); }
        ),
        tabla([
          { titulo: 'Cuándo', valor: (a) => fecha(a.creado) },
          { titulo: 'Usuario', valor: (a) => (a.usuario ? `${a.usuario} (#${a.usuario_id})` : '—') },
          { titulo: 'Acción', valor: (a) => h('code', {}, a.accion) },
          { titulo: 'Entidad', valor: (a) => (a.entidad ? `${a.entidad}${a.entidad_id ? ` #${a.entidad_id}` : ''}` : '—') },
          { titulo: 'IP', valor: (a) => a.ip || '—' },
          { titulo: 'Detalle', valor: (a) => h('div', { class: 'detalle-json' }, a.detalle ? JSON.stringify(a.detalle) : '') },
        ], r.datos),
        paginador(r.paginacion, (n) => { estadoAuditoria.pagina = n; verAuditoria(); })
      );
    } catch (err) {
      mostrarError(err);
    }
  }

  // ---------------- Pestañas
  const VISTAS = { resumen: verResumen, pedidos: () => verPedidos(), catalogo: verCatalogo, comentarios: verComentarios, usuarios: verUsuarios, alertas: verAlertas, auditoria: verAuditoria };
  const pestanas = [...document.querySelectorAll('.admin-tab')];

  function programar(fn, ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { if (!document.hidden) fn(); else programar(fn, ms); }, ms);
  }

  function abrir(nombre) {
    if (!VISTAS[nombre]) nombre = 'resumen';
    clearTimeout(temporizador);
    pestanas.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === nombre)));
    history.replaceState(null, '', `#${nombre}`);
    VISTAS[nombre]();
  }

  pestanas.forEach((t) => t.addEventListener('click', () => abrir(t.dataset.tab)));
  abrir(window.location.hash.slice(1));
  actualizarChips();
  setInterval(() => { if (!document.hidden) actualizarChips(); }, 30000);
})();
