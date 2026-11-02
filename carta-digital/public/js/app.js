// JavaScript del front-end. Sin jQuery ni librerías externas
// (el original usaba jQuery 3.2.1, con vulnerabilidades conocidas).
// Se carga como archivo externo para cumplir la CSP (sin scripts inline).
(function () {
  'use strict';

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const toast = document.getElementById('toast');
  let toastTimer;

  function mostrarToast(texto, error) {
    if (!toast) return;
    toast.textContent = texto; // textContent: nunca se interpreta como HTML
    toast.classList.toggle('toast--error', Boolean(error));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
  }

  // ---- Pestañas de la carta (sin JS se ven todas las secciones)
  const pestanas = Array.from(document.querySelectorAll('.pestana'));
  if (pestanas.length) {
    document.documentElement.classList.add('con-js');
    function activar(tab) {
      pestanas.forEach((t) => {
        const activa = t === tab;
        t.setAttribute('aria-selected', String(activa));
        t.tabIndex = activa ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !activa;
      });
    }
    pestanas.forEach((tab, i) => {
      tab.addEventListener('click', () => activar(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const sig = pestanas[(i + (e.key === 'ArrowRight' ? 1 : -1) + pestanas.length) % pestanas.length];
        sig.focus();
        activar(sig);
      });
    });
    activar(pestanas[0]);
  }

  // ---- Agregar productos al pedido
  const resto = document.querySelector('[data-restaurante]');
  const contador = document.getElementById('contador-carrito');

  document.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-agregar]');
    if (!boton || !resto) return;
    boton.disabled = true;
    try {
      const resp = await fetch(`/restaurantes/${encodeURIComponent(resto.dataset.restaurante)}/carrito`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' },
        body: JSON.stringify({ itemId: boton.dataset.agregar }),
        credentials: 'same-origin',
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo agregar');
      if (contador) contador.textContent = data.enCarrito;
      mostrarToast(`${data.producto} agregado a tu pedido`);
    } catch (err) {
      mostrarToast(err.message || 'No se pudo agregar', true);
    } finally {
      boton.disabled = false;
    }
  });
})();
