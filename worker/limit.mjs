// Límite de peticiones en memoria (por instancia del Worker): ventana deslizante por clave.
// Es una defensa de base; si existe el binding opcional LIMITER (Rate Limiting de Cloudflare) se usa además.
export function createLimiter(maxKeys = 5000) {
  const hits = new Map();
  const recent = (key, windowMs, now) => (hits.get(key) || []).filter((t) => now - t < windowMs);
  return {
    // Anota un intento. Devuelve false si ya se superó el máximo en la ventana (y entonces no lo cuenta).
    hit(key, max, windowMs, now = Date.now()) {
      const arr = recent(key, windowMs, now);
      if (arr.length >= max) { hits.set(key, arr); return false; }
      arr.push(now);
      hits.set(key, arr);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value);
      return true;
    },
    // Cuántos intentos hay en la ventana, sin anotar uno nuevo.
    count(key, windowMs, now = Date.now()) { return recent(key, windowMs, now).length; }
  };
}
