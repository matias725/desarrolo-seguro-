// Detección de actividad sospechosa. Cada alerta queda en alertas_seguridad
// (GET /api/v1/admin/alertas) y se avisa por correo:
//   - al usuario afectado, cuando es sobre su cuenta;
//   - a los administradores, cuando la severidad es alta.
const { query } = require('../config/db');
const config = require('../config/env');
const logger = require('../config/logger');
const Alerta = require('../models/alertaModel');
const Usuario = require('../models/usuarioModel');
const Correo = require('./correoService');

const UMBRALES = {
  fallosGlobales: Number(process.env.ALERTA_FALLOS_GLOBALES) || 20, // en 10 min, todo el sistema
  cuentasPorIp: Number(process.env.ALERTA_CUENTAS_POR_IP) || 5, // correos distintos fallidos desde una IP en 10 min
  ipsPorUsuario: Number(process.env.ALERTA_IPS_POR_USUARIO) || 3, // IPs distintas con login OK en 1 h
};

const fechaCl = (d) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(d));

async function registrar(alerta, { avisarUsuario, avisarAdmins } = {}) {
  try {
    if (await Alerta.existeReciente(alerta)) return null;
    const creada = await Alerta.crear(alerta);
    logger.warn({ alerta: { ...alerta, id: creada.id } }, `alerta de seguridad: ${alerta.tipo}`);
    if (avisarUsuario) Correo.enviar(avisarUsuario);
    if (avisarAdmins || alerta.severidad === 'alta') {
      const destinos = [...new Set([...(await Usuario.correosAdmins()), ...config.correo.alertas])];
      for (const para of destinos) {
        Correo.enviar({
          para,
          asunto: `[Alerta ${alerta.severidad}] ${alerta.tipo.replace(/_/g, ' ')}`,
          titulo: 'Alerta de seguridad',
          parrafos: [
            `Tipo: ${alerta.tipo} · Severidad: ${alerta.severidad}`,
            `IP: ${alerta.ip || '—'} · Fecha: ${fechaCl(new Date())}`,
            `Detalle: ${JSON.stringify(alerta.detalle || {})}`,
            'Revisa las alertas en GET /api/v1/admin/alertas.',
          ],
        });
      }
    }
    return creada;
  } catch (err) {
    logger.error({ err: err.message, tipo: alerta.tipo }, 'no se pudo registrar la alerta');
    return null;
  }
}

// Después de cada login fallido.
async function trasLoginFallido(req, { email, usuario, bloqueo }) {
  const ip = req.ip;

  if (bloqueo && bloqueo.recienBloqueado) {
    await registrar(
      { tipo: 'cuenta_bloqueada', severidad: 'media', usuarioId: usuario ? usuario.id : null, ip, detalle: { email, hasta: bloqueo.hasta } },
      {
        avisarUsuario: usuario && {
          para: usuario.email,
          asunto: 'Bloqueamos temporalmente tu cuenta',
          titulo: 'Tu cuenta fue bloqueada por 15 minutos',
          parrafos: [
            `Hola ${usuario.nombre}: hubo varios intentos fallidos de iniciar sesión en tu cuenta (último desde la IP ${ip}).`,
            'Por seguridad la bloqueamos durante 15 minutos.',
            'Si no fuiste tú, te recomendamos cambiar tu contraseña y activar la verificación en dos pasos.',
          ],
        },
      }
    );
  }

  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM auditoria WHERE accion = 'login_fallido' AND creado > NOW() - INTERVAL '10 minutes') AS globales,
       (SELECT COUNT(DISTINCT detalle->>'email')::int FROM auditoria
         WHERE accion = 'login_fallido' AND ip = $1 AND creado > NOW() - INTERVAL '10 minutes') AS cuentas_ip`,
    [ip]
  );
  const { globales, cuentas_ip: cuentasIp } = rows[0];

  // Una IP probando muchas cuentas distintas: "credential stuffing" o "password spraying".
  if (cuentasIp >= UMBRALES.cuentasPorIp) {
    await registrar({ tipo: 'ataque_multiples_cuentas', severidad: 'alta', ip, detalle: { cuentasDistintas: cuentasIp, ventanaMin: 10 } });
  }
  // Muchos fallos en todo el sistema: posible ataque distribuido.
  if (globales >= UMBRALES.fallosGlobales) {
    await registrar({ tipo: 'fuerza_bruta_masiva', severidad: 'alta', detalle: { fallos: globales, ventanaMin: 10 } });
  }
}

// Después de cada login correcto (se llama ANTES de registrar el login_ok
// en la auditoría, para compararlo con el historial anterior).
async function trasLoginCorrecto(req, usuario) {
  const ip = req.ip;
  const { rows } = await query(
    `SELECT
       EXISTS (SELECT 1 FROM auditoria WHERE usuario_id = $1 AND accion = 'login_ok') AS tiene_historial,
       EXISTS (SELECT 1 FROM auditoria WHERE usuario_id = $1 AND accion = 'login_ok' AND ip = $2
                 AND creado > NOW() - INTERVAL '90 days') AS ip_conocida,
       (SELECT COUNT(DISTINCT ip)::int FROM (
          SELECT ip FROM auditoria WHERE usuario_id = $1 AND accion = 'login_ok' AND creado > NOW() - INTERVAL '1 hour'
          UNION SELECT $2::text) t) AS ips_hora`,
    [usuario.id, ip]
  );
  const { tiene_historial: tieneHistorial, ip_conocida: ipConocida, ips_hora: ipsHora } = rows[0];

  if (tieneHistorial && !ipConocida) {
    await registrar(
      { tipo: 'login_ip_nueva', severidad: 'baja', usuarioId: usuario.id, ip, detalle: { agente: String(req.get('user-agent') || '').slice(0, 150) } },
      {
        avisarUsuario: {
          para: usuario.email,
          asunto: 'Nuevo inicio de sesión en tu cuenta',
          titulo: 'Detectamos un inicio de sesión desde un lugar nuevo',
          parrafos: [
            `Hola ${usuario.nombre}: alguien inició sesión en tu cuenta desde la IP ${ip} el ${fechaCl(new Date())}.`,
            'Si fuiste tú, no tienes que hacer nada.',
            'Si NO fuiste tú: cambia tu contraseña y usa "cerrar todas mis sesiones" para expulsar a cualquier otro dispositivo.',
          ],
        },
      }
    );
  }
  if (ipsHora >= UMBRALES.ipsPorUsuario) {
    await registrar(
      { tipo: 'login_ips_multiples', severidad: usuario.rol === 'admin' ? 'alta' : 'media', usuarioId: usuario.id, ip, detalle: { ipsDistintas: ipsHora, ventanaMin: 60 } },
      { avisarAdmins: true }
    );
  }
}

// Códigos 2FA incorrectos repetidos: alguien tiene la contraseña pero no el teléfono.
async function trasFallos2fa(req, usuario) {
  await registrar(
    { tipo: '2fa_fallido_repetido', severidad: 'alta', usuarioId: usuario.id, ip: req.ip, detalle: { motivo: 'contraseña correcta, código 2FA incorrecto repetidas veces' } },
    {
      avisarUsuario: {
        para: usuario.email,
        asunto: 'Alguien conoce tu contraseña',
        titulo: 'Intentos de acceso con tu contraseña',
        parrafos: [
          `Hola ${usuario.nombre}: alguien ingresó tu contraseña correcta pero falló el código de verificación en dos pasos (IP ${req.ip}).`,
          'Tu cuenta sigue protegida, pero tu contraseña está comprometida: cámbiala cuanto antes.',
        ],
      },
    }
  );
}

module.exports = { registrar, trasLoginFallido, trasLoginCorrecto, trasFallos2fa, UMBRALES };
