// Carrito (cantidades y confirmar pedido) y seguimiento de pedidos.
(function () {
  'use strict';
  const { api, toast, conBoton, datosDe, ESTADOS } = window.Carta;

  // ---------------- Carrito: botones − / +
  const form = document.getElementById('form-confirmar');
  const restauranteId = form ? form.dataset.restaurante : null;

  document.querySelectorAll('[data-cantidad]').forEach((caja) => {
    caja.querySelectorAll('[data-cambiar]').forEach((btn) => {
      btn.hidden = false;
      btn.addEventListener('click', () =>
        conBoton(btn, async () => {
          const nueva = Number(caja.dataset.valor) + Number(btn.dataset.cambiar);
          await api('PATCH', `/restaurantes/${restauranteId}/carrito/${caja.dataset.cantidad}`, { cantidad: Math.max(0, nueva) });
          window.location.reload(); // recalcula subtotales y total desde el servidor
        })
      );
    });
  });

  // ---------------- Confirmar pedido
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(form.querySelector('button[type="submit"]'), async () => {
        const d = datosDe(form);
        const cuerpo = {};
        if (d.mesa) cuerpo.mesa = d.mesa;
        if (d.nota) cuerpo.nota = d.nota;
        const r = await api('POST', `/restaurantes/${restauranteId}/pedidos`, cuerpo);
        window.location.assign(`/pedidos/${encodeURIComponent(r.datos.codigo)}`);
      });
    });
  }

  // ---------------- Seguimiento: se actualiza solo
  const pedido = document.getElementById('pedido');
  if (!pedido) return;
  const { codigo, estado } = pedido.dataset;
  const cerrado = estado === 'entregado' || estado === 'cancelado';

  if (!cerrado) {
    const revisar = async () => {
      if (document.hidden) return; // no consulta si la pestaña no está visible
      try {
        const r = await api('GET', `/pedidos/${encodeURIComponent(codigo)}`);
        if (r.datos.estado !== estado) {
          toast(`Tu pedido ahora está: ${ESTADOS[r.datos.estado] || r.datos.estado}`);
          setTimeout(() => window.location.reload(), 1200);
        }
      } catch { /* se reintenta en la próxima vuelta */ }
    };
    setInterval(revisar, 10000);
    document.addEventListener('visibilitychange', revisar);
  }

  const cancelar = document.getElementById('cancelar-pedido');
  if (cancelar) {
    cancelar.addEventListener('click', () => {
      if (cancelar.dataset.confirmar !== '1') {
        // Doble clic para confirmar (sin window.confirm, que bloquea la página).
        cancelar.dataset.confirmar = '1';
        cancelar.textContent = '¿Seguro? Toca de nuevo para cancelar';
        setTimeout(() => {
          cancelar.dataset.confirmar = '';
          cancelar.textContent = 'Cancelar pedido';
        }, 4000);
        return;
      }
      conBoton(cancelar, async () => {
        await api('POST', `/pedidos/${encodeURIComponent(codigo)}/cancelar`);
        toast('Pedido cancelado');
        setTimeout(() => window.location.reload(), 1000);
      });
    });
  }
})();
