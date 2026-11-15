// Utilidades compartidas por las páginas que usan la API (/api/v1).
// Todo el contenido dinámico se arma con textContent / createElement:
// nunca se inserta HTML recibido del servidor (evita XSS).
(function () {
  'use strict';

  const meta = document.querySelector('meta[name="csrf-token"]');
  const toast = document.getElementById('toast');
  let toastTimer;

  function mostrarToast(texto, error) {
    if (!toast) return;
    toast.textContent = texto;
    toast.classList.toggle('toast--error', Boolean(error));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 4500 : 2800);
  }

  // Llama a la API con la sesión y el token CSRF. Devuelve { datos, ... }
  // o lanza un Error con el mensaje que mandó el servidor.
  async function api(metodo, url, cuerpo) {
    const opciones = {
      method: metodo,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-Token': meta ? meta.content : '' },
    };
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    let resp;
    try {
      resp = await fetch(`/api/v1${url}`, opciones);
    } catch {
      throw new Error('No hay conexión con el servidor. Revisa tu internet.');
    }
    let json = {};
    try { json = await resp.json(); } catch { /* respuesta sin cuerpo */ }
    if (!resp.ok || !json.ok) {
      const detalle = Array.isArray(json.detalles) && json.detalles[0] ? json.detalles[0].mensaje : '';
      const err = new Error(detalle && detalle !== json.error ? `${json.error || 'Error'}: ${detalle}` : json.error || `Error ${resp.status}`);
      err.status = resp.status;
      err.detalles = json.detalles || [];
      throw err;
    }
    // Si la sesión cambió (login, cambio de contraseña) llega un token nuevo.
    if (json.datos && json.datos.csrfToken && meta) meta.content = json.datos.csrfToken;
    return json;
  }

  // Crea un elemento: h('button', { class: 'btn', onclick: fn }, 'Texto', otroNodo)
  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      // Por CSSOM: la CSP (style-src 'self') bloquea el atributo style="..."
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const hijo of hijos.flat(Infinity)) {
      if (hijo === null || hijo === undefined || hijo === false) continue;
      el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
    }
    return el;
  }

  const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const fmtFecha = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  const moneda = (v) => clp.format(Number(v) || 0);
  const fecha = (v) => (v ? fmtFecha.format(new Date(v)) : '—');

  // Desactiva el botón mientras corre una acción y muestra el error si falla.
  async function conBoton(boton, accion) {
    if (boton) boton.disabled = true;
    try {
      return await accion();
    } catch (err) {
      mostrarToast(err.message, true);
      return undefined;
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  // Lee un formulario como objeto { nombre: valor } (sin campos vacíos).
  function datosDe(form) {
    const datos = {};
    new FormData(form).forEach((v, k) => {
      // Las contraseñas se envían tal cual (un espacio puede ser parte de ella).
      if (typeof v === 'string' && v.trim() !== '') datos[k] = /password/i.test(k) ? v : v.trim();
    });
    return datos;
  }

  const ESTADOS = {
    pendiente: 'Pendiente',
    preparando: 'En preparación',
    listo: 'Listo para retirar',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  // Con JS, los botones − / + reemplazan a los formularios "Quitar".
  document.documentElement.classList.add('con-js');

  window.Carta = { api, h, toast: mostrarToast, moneda, fecha, conBoton, datosDe, ESTADOS };
})();
