'use strict';

/*
 * Cuando Minecraft se cierra con error, busca en el registro las causas más comunes
 * y devuelve una explicación en lenguaje sencillo con qué hacer.
 */

const RULES = [
  {
    id: 'memory',
    test: /java\.lang\.OutOfMemoryError|GC overhead limit exceeded|Java heap space/i,
    title: 'Minecraft se quedó sin memoria',
    advice: 'Sube la memoria RAM en Ajustes (por ejemplo a 6 GB) y cierra otros programas pesados.'
  },
  {
    id: 'heap',
    test: /Could not reserve enough space for (object )?heap|Invalid maximum heap size|Could not create the Java Virtual Machine/i,
    title: 'No se pudo reservar la memoria pedida',
    advice: 'Tienes asignada más RAM de la que tu equipo puede dar. Bájala en Ajustes.'
  },
  {
    id: 'java-version',
    test: /UnsupportedClassVersionError|compiled by a more recent version of the Java Runtime|class file version|requires Java \d+/i,
    title: 'La versión de Java no es la correcta',
    advice: 'Activa "Instalar Java automáticamente" en Ajustes, o elige en Ajustes el Java que pide este evento.'
  },
  {
    id: 'mod-dependencies',
    test: /Mod resolution failed|Incompatible mod set|Missing or unsupported mandatory dependencies|Unmet dependency|ModResolutionException|requires (any version of|version).*(fabric|forge|minecraft)/i,
    title: 'Faltan mods o alguno no es compatible',
    advice: 'Algún mod necesita otro mod o una versión distinta. Cierra e inicia el launcher para que repare los mods; si sigue igual, avisa al equipo del evento.'
  },
  {
    id: 'mixin',
    test: /Mixin apply failed|InvalidInjectionException|MixinTransformerError|Mixin transformation of .* failed/i,
    title: 'Dos mods chocan entre sí',
    advice: 'Hay mods incompatibles entre ellos o de otra versión del juego. Avisa al equipo del evento con el informe de la consola.'
  },
  {
    id: 'graphics',
    test: /GLFW error|Pixel format not accelerated|GLFW_VERSION_UNAVAILABLE|OpenGL.*(error|not supported)/i,
    title: 'Problema con los gráficos',
    advice: 'Actualiza los controladores de tu tarjeta gráfica y vuelve a intentarlo.'
  },
  {
    id: 'network',
    test: /UnknownHostException|Connection timed out|Failed to download|SSLHandshakeException/i,
    title: 'Falló una descarga o la conexión',
    advice: 'Comprueba tu internet y vuelve a pulsar Jugar.'
  }
];

// lines: array de líneas del registro. Devuelve hasta 3 causas probables (puede ser una lista vacía).
function analyzeCrash(lines) {
  const text = (lines || []).join('\n');
  return RULES.filter((r) => r.test.test(text))
    .slice(0, 3)
    .map(({ id, title, advice }) => ({ id, title, advice }));
}

module.exports = { analyzeCrash, RULES };
