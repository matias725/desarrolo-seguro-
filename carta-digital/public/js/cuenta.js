// Páginas de cuenta: registro, recuperar contraseña y "Mi cuenta".
// Todo pasa por la API /api/v1 (las mismas validaciones y la misma auditoría).
(function () {
  'use strict';
  const { api, h, toast, fecha, conBoton, datosDe } = window.Carta;
  const $ = (sel) => document.querySelector(sel);

  function alEnviar(form, accion) {
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(form.querySelector('button[type="submit"]'), () => accion(datosDe(form), form));
    });
  }

  function iguales(a, b) {
    if (a !== b) throw new Error('Las contraseñas no coinciden');
  }

  // ---------------- Registro
  alEnviar($('#form-registro'), async (d) => {
    iguales(d.password, d.repetir);
    await api('POST', '/auth/registro', { nombre: d.nombre, email: d.email, password: d.password });
    window.location.assign('/');
  });

  // ---------------- Recuperar contraseña
  const pasoCorreo = $('#paso-correo');
  const pasoNueva = $('#paso-nueva');
  function mostrarPasoNueva(token) {
    if (!pasoNueva) return;
    pasoCorreo.hidden = true;
    pasoNueva.hidden = false;
    const campo = pasoNueva.querySelector('[name="token"]');
    if (token) campo.value = token;
    (token ? pasoNueva.querySelector('[name="passwordNueva"]') : campo).focus();
  }
  if (pasoNueva) {
    // El enlace del correo trae el código después de "#": no viaja al servidor.
    const m = /token=([A-Za-z0-9_-]{43})/.exec(window.location.hash);
    if (m) {
      history.replaceState(null, '', window.location.pathname); // se quita de la barra de direcciones
      mostrarPasoNueva(m[1]);
    }
    $('#tengo-codigo').addEventListener('click', (e) => {
      e.preventDefault();
      mostrarPasoNueva();
    });
  }
  alEnviar($('#form-olvide'), async (d, form) => {
    const r = await api('POST', '/auth/password/olvide', { email: d.email });
    form.reset();
    toast(r.datos.mensaje);
    mostrarPasoNueva();
  });
  alEnviar($('#form-restablecer'), async (d) => {
    iguales(d.passwordNueva, d.repetir);
    const cuerpo = { token: d.token, passwordNueva: d.passwordNueva };
    if (d.codigo2fa) cuerpo.codigo2fa = d.codigo2fa;
    const r = await api('POST', '/auth/password/restablecer', cuerpo);
    toast(r.datos.mensaje);
    setTimeout(() => window.location.assign('/ingresar'), 1500);
  });

  // ---------------- Mi cuenta
  const cuenta = $('#cuenta');
  if (!cuenta) return;

  alEnviar($('#form-password'), async (d, form) => {
    iguales(d.passwordNueva, d.repetir);
    const r = await api('PATCH', '/auth/yo/password', { passwordActual: d.passwordActual, passwordNueva: d.passwordNueva });
    form.reset();
    toast(r.datos.sesionesCerradas ? `Contraseña actualizada. Se cerraron ${r.datos.sesionesCerradas} sesión(es) en otros dispositivos.` : 'Contraseña actualizada.');
    cargarSesiones();
  });

  // -- Verificación en dos pasos
  function mostrarRespaldo(codigos) {
    const lista = $('#lista-respaldo');
    lista.replaceChildren(...codigos.map((c) => h('li', {}, h('code', {}, c))));
    $('#codigos-respaldo').hidden = false;
    $('#codigos-respaldo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#copiar-respaldo').onclick = async () => {
      try {
        await navigator.clipboard.writeText(codigos.join('\n'));
        toast('Códigos copiados');
      } catch {
        toast('No se pudo copiar: anótalos a mano', true);
      }
    };
    $('#listo-respaldo').onclick = () => window.location.reload();
  }

  const btnConfigurar = $('#btn-configurar');
  if (btnConfigurar) {
    btnConfigurar.addEventListener('click', () =>
      conBoton(btnConfigurar, async () => {
        const r = await api('POST', '/auth/2fa/configurar');
        $('#qr-2fa').src = r.datos.qr; // imagen data:image/png generada por el servidor
        $('#secreto-2fa').textContent = r.datos.secreto.replace(/(.{4})/g, '$1 ').trim();
        $('#config-2fa').hidden = false;
        btnConfigurar.hidden = true;
        $('#form-activar [name="codigo"]').focus();
      })
    );
  }
  alEnviar($('#form-activar'), async (d) => {
    const r = await api('POST', '/auth/2fa/activar', { codigo: d.codigo, password: d.password });
    $('#config-2fa').hidden = true;
    toast('¡Verificación en dos pasos activada!');
    mostrarRespaldo(r.datos.codigosRespaldo);
  });
  alEnviar($('#form-respaldo'), async (d, form) => {
    const r = await api('POST', '/auth/2fa/respaldo', { codigo: d.codigo });
    form.reset();
    toast('Códigos nuevos generados: los anteriores ya no sirven');
    mostrarRespaldo(r.datos.codigosRespaldo);
  });
  alEnviar($('#form-desactivar'), async (d) => {
    await api('POST', '/auth/2fa/desactivar', { codigo: d.codigo, password: d.password });
    toast('Verificación en dos pasos desactivada');
    setTimeout(() => window.location.reload(), 1200);
  });

  // -- Sesiones abiertas
  function navegadorLegible(ua) {
    if (!ua) return 'Navegador desconocido';
    const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|axios|python/i.test(ua) ? 'Programa / API' : 'Otro';
    const so = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return so ? `${nav} en ${so}` : nav;
  }

  async function cargarSesiones() {
    const cont = $('#lista-sesiones');
    try {
      const { datos } = await api('GET', '/auth/sesiones');
      if (!datos.length) {
        cont.replaceChildren(h('p', { class: 'vacio' }, 'No hay sesiones abiertas.'));
        return;
      }
      cont.replaceChildren(
        h('ul', { class: 'lista-filas' },
          datos.map((s) =>
            h('li', { class: 'fila' },
              h('div', {},
                h('strong', {}, navegadorLegible(s.navegador)),
                s.actual ? h('span', { class: 'chip chip--ok' }, 'Esta sesión') : null,
                h('div', { class: 'fila__meta' }, `IP ${s.ip || '—'} · inició ${fecha(s.inicio)}`)
              ),
              s.actual
                ? null
                : h('button', {
                    type: 'button',
                    class: 'btn btn--fantasma btn--chico',
                    onclick: (e) =>
                      conBoton(e.currentTarget, async () => {
                        await api('DELETE', `/auth/sesiones/${s.id}`);
                        toast('Sesión cerrada');
                        cargarSesiones();
                      }),
                  }, 'Cerrar')
            )
          )
        )
      );
    } catch (err) {
      cont.replaceChildren(h('p', { class: 'vacio' }, err.message));
    }
  }

  const btnOtras = $('#cerrar-otras');
  btnOtras.addEventListener('click', () =>
    conBoton(btnOtras, async () => {
      const r = await api('POST', '/auth/sesiones/cerrar-todas', { incluirActual: false });
      toast(r.datos.mensaje);
      cargarSesiones();
    })
  );

  cargarSesiones();
})();
