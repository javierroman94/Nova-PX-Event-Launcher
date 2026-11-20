'use strict';
/*
 * Argumentos de Java por defecto para jugar con menos tirones (recolector G1 afinado). Solo se usan cuando el jugador
 * no puso sus propios argumentos en Ajustes y la instancia usa Java 17 o más nuevo (Minecraft 1.18+).
 */
const BASE = [
  '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=50', '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15', '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5', '-XX:SurvivorRatio=32', '-XX:+PerfDisableSharedMem', '-XX:MaxTenuringThreshold=1'
];

// javaMajor: versión de Java que se va a usar (número) o null si no se sabe. customArgs: lo que escribió el jugador.
function defaultJvmArgs({ javaMajor, customArgs = [] } = {}) {
  if (customArgs.length) return [];
  if (!Number.isFinite(javaMajor) || javaMajor < 17) return [];
  return BASE.slice();
}

// Memoria inicial: igual a la máxima hasta 4 GB evita que el juego se pare a ampliarla; por encima de 4 GB arranca en 4.
function initialMemoryGb(maxGb) {
  const m = Math.max(1, Math.floor(Number(maxGb) || 2));
  return Math.min(m, 4);
}

module.exports = { defaultJvmArgs, initialMemoryGb, BASE };
