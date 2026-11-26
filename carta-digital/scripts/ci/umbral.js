#!/usr/bin/env node
// Aplica el umbral de bloqueo del pipeline sobre los reportes de análisis.
//   node scripts/ci/umbral.js semgrep   reportes/semgrep.json
//   node scripts/ci/umbral.js npm-audit reportes/npm-audit.json
// Sale con código 1 (bloquea) si hay hallazgos sobre el umbral; 0 si no.
'use strict';
const fs = require('fs');

const [tipo, archivo] = process.argv.slice(2);
let datos;
try {
  datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
} catch (err) {
  // Si la herramienta no generó reporte, se bloquea (falla cerrada).
  console.error(`BLOQUEADO: no se pudo leer ${archivo} (${err.message})`);
  process.exit(1);
}

if (tipo === 'semgrep') {
  const resultados = datos.results || [];
  const porSeveridad = {};
  for (const r of resultados) porSeveridad[r.extra.severity] = (porSeveridad[r.extra.severity] || 0) + 1;
  console.log(`Semgrep: ${resultados.length} hallazgo(s) ${JSON.stringify(porSeveridad)}; errores de la herramienta: ${(datos.errors || []).length}`);
  const bloqueantes = resultados.filter((r) => r.extra.severity === 'ERROR');
  for (const r of resultados) {
    const marca = r.extra.severity === 'ERROR' ? 'BLOQUEA' : 'informa';
    console.log(`  [${marca}] ${r.check_id.split('.').pop()}  ${r.path}:${r.start.line}\n           ${r.extra.message.replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  const fatales = (datos.errors || []).filter((e) => e.level === 'error');
  if (fatales.length && !resultados.length) {
    console.error('BLOQUEADO: Semgrep no pudo completar el análisis');
    process.exit(1);
  }
  if (bloqueantes.length) {
    console.error(`BLOQUEADO: ${bloqueantes.length} hallazgo(s) de severidad ERROR (umbral: 0)`);
    process.exit(1);
  }
  console.log('OK: 0 hallazgos de severidad ERROR');
} else if (tipo === 'npm-audit') {
  const v = (datos.metadata && datos.metadata.vulnerabilities) || {};
  console.log(`npm audit (dependencias de producción): ${JSON.stringify(v)}`);
  for (const [nombre, d] of Object.entries(datos.vulnerabilities || {})) {
    console.log(`  [${['high', 'critical'].includes(d.severity) ? 'BLOQUEA' : 'informa'}] ${nombre} (${d.severity}) ${d.range || ''}`);
  }
  const altas = (v.high || 0) + (v.critical || 0);
  if (altas > 0) {
    console.error(`BLOQUEADO: ${altas} vulnerabilidad(es) HIGH/CRITICAL (umbral: 0)`);
    process.exit(1);
  }
  console.log('OK: 0 vulnerabilidades HIGH/CRITICAL');
} else {
  console.error('Uso: umbral.js <semgrep|npm-audit> <reporte.json>');
  process.exit(2);
}
