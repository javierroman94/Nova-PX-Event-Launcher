'use strict';
// Ruta de `src` relativa a `from`, para los filtros de fs.cpSync.
// En Windows, Node 20 (el de Electron 33) llama al filtro con rutas largas
// «\\?\C:\...» aunque `from` sea normal; path.relative devolvía entonces una
// ruta absoluta y los filtros (sin mundos, sin logs) dejaban pasar todo.
const path = require('path');

const sinPrefijo = (p) => String(p).replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');

function rutaRelativa(from, src, p = path) {
  return p.relative(sinPrefijo(p.resolve(from)), sinPrefijo(src));
}

module.exports = { rutaRelativa, sinPrefijo };
