// Envío de correos.
//  - ses:         Amazon SES (en AWS usa el rol IAM de la instancia: sin claves en el código).
//  - consola:     desarrollo/QA; el correo se escribe en los logs y queda en `buzon`.
//  - desactivado: no envía nada (solo un aviso en los logs).
// Los correos se mandan en segundo plano: la respuesta HTTP no espera a SES,
// así el tiempo de respuesta no revela si un correo existe o no.
const config = require('../config/env');
const logger = require('../config/logger');

const buzon = []; // últimos correos en modo consola (útil para pruebas)
let clienteSes;

function limpiar(texto) {
  return String(texto).replace(/[\r\n]+/g, ' ').slice(0, 200); // sin saltos de línea en el asunto
}

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function plantillaHtml(titulo, parrafos) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f1ea;font-family:Arial,sans-serif;color:#2b2420">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:28px">
<tr><td><h1 style="margin:0 0 16px;font-size:20px;color:#b5452c">${escapar(titulo)}</h1>
${parrafos.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${escapar(p)}</p>`).join('')}
<p style="margin:20px 0 0;font-size:12px;color:#8a7f78">Carta Digital · Este es un mensaje automático, no respondas a este correo.</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function enviarAhora({ para, asunto, titulo, parrafos }) {
  const texto = parrafos.join('\n\n');
  const html = plantillaHtml(titulo || asunto, parrafos);
  asunto = limpiar(asunto);

  if (config.correo.proveedor === 'consola') {
    buzon.push({ para, asunto, texto, fecha: new Date() });
    if (buzon.length > 50) buzon.shift();
    // En consola se muestra el cuerpo solo fuera de producción (puede llevar tokens).
    logger.info({ correo: { para, asunto, ...(config.esProduccion ? {} : { texto }) } }, 'correo (modo consola)');
    return;
  }
  if (config.correo.proveedor !== 'ses') {
    logger.warn({ para, asunto }, 'correo NO enviado: CORREO_PROVEEDOR desactivado');
    return;
  }
  if (!clienteSes) {
    const { SESv2Client } = require('@aws-sdk/client-sesv2');
    clienteSes = new SESv2Client({ region: config.correo.region });
  }
  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  await clienteSes.send(
    new SendEmailCommand({
      FromEmailAddress: config.correo.remitente,
      Destination: { ToAddresses: [para] },
      Content: {
        Simple: {
          Subject: { Data: asunto, Charset: 'UTF-8' },
          Body: { Text: { Data: texto, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
        },
      },
    })
  );
  logger.info({ para, asunto }, 'correo enviado por SES');
}

// No bloquea la respuesta; los errores quedan en los logs.
function enviar(mensaje) {
  setImmediate(() => {
    enviarAhora(mensaje).catch((err) => logger.error({ err: err.message, para: mensaje.para }, 'error enviando correo'));
  });
}

module.exports = { enviar, enviarAhora, buzon };
