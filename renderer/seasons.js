/* Temporadas del launcher según la fecha (calendario de Ecuador). Sirve en la ventana y en las pruebas (npm test). */
(function (root) {
  // Domingo de Pascua (algoritmo de Meeus/Jones/Butcher).
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  // Segundo domingo de mayo (Día de la Madre en Ecuador).
  function mothersDay(year) {
    const first = new Date(year, 4, 1);
    return new Date(year, 4, 1 + ((7 - first.getDay()) % 7) + 7);
  }

  /*
   * Fechas:
   *  - Año Nuevo: 27 dic – 6 ene
   *  - San Valentín: 7 – 14 feb
   *  - Carnaval: desde el martes de la semana anterior hasta el martes de Carnaval (cambia cada año; gana a San Valentín)
   *  - Día de la Madre: la semana hasta el segundo domingo de mayo
   *  - 10 de Agosto: 1 – 10 ago
   *  - Halloween: 15 oct – 2 nov (Día de los Difuntos)
   *  - Navidad: 1 – 26 dic
   *  El resto del año no hay decoración.
   */
  function seasonFor(date) {
    const d = date || new Date();
    const y = d.getFullYear();
    const md = (d.getMonth() + 1) * 100 + d.getDate();
    const k = dayKey(d);

    const carnavalEnd = addDays(easter(y), -47);
    if (k >= dayKey(addDays(carnavalEnd, -7)) && k <= dayKey(carnavalEnd)) return 'carnaval';
    if (md >= 207 && md <= 214) return 'sanvalentin';
    const madre = mothersDay(y);
    if (k >= dayKey(addDays(madre, -7)) && k <= dayKey(madre)) return 'madres';
    if (md >= 801 && md <= 810) return 'ecuador';
    if ((md >= 1015 && md <= 1031) || md === 1101 || md === 1102) return 'halloween';
    if (md >= 1201 && md <= 1226) return 'navidad';
    if (md >= 1227 || md <= 106) return 'anio';
    return '';
  }

  const api = { seasonFor, easter, mothersDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NovaSeasons = api;
})(typeof window !== 'undefined' ? window : globalThis);
