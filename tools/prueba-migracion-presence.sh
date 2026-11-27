#!/usr/bin/env bash
# Prueba aislada de la migración «Presence» del Worker principal.
#
# Reproduce en un Worker DESECHABLE el estado que hoy tiene producción
# (clase Presence creada por API, sin etiqueta de migración) y comprueba qué
# hace `wrangler deploy` con la migración v1 de wrangler.jsonc. Nunca toca
# nova-px-event-launcher ni nova-px-pet. Al final borra el Worker de prueba.
#
# Uso (en tu PC, no en CI):
#   export CLOUDFLARE_API_TOKEN=...   # token con permiso Workers Scripts:Edit
#   export CLOUDFLARE_ACCOUNT_ID=8d32c46fda6faf5cfb7746cc308ce56d
#   bash tools/prueba-migracion-presence.sh
#
# El token no se imprime ni se guarda. Resultado: un resumen con lo que pasó
# en cada paso, para decidir cómo desplegar producción.
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Falta CLOUDFLARE_ACCOUNT_ID}"

NOMBRE="nova-px-prueba-migracion-$(date +%s)"
case "$NOMBRE" in
  nova-px-event-launcher|nova-px-pet) echo "Nombre prohibido" >&2; exit 1 ;;
esac

API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${NOMBRE}"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
TMP="$(mktemp -d)"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

limpiar() {
  curl -s -X DELETE "${AUTH[@]}" "${API}?force=true" >/dev/null || true
  rm -rf "$TMP"
  echo "Worker de prueba ${NOMBRE} borrado."
}
trap limpiar EXIT

etiqueta() {
  curl -s "${AUTH[@]}" "${API}/settings" | node -e '
    let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      try{const r=JSON.parse(d).result||{};console.log(r.migration_tag||"(vacía)")}catch{console.log("(sin datos)")}})'
}

# Worker mínimo con la misma clase y el mismo binding que producción.
cat > "$TMP/index.mjs" <<'JS'
export class Presence {
  constructor(state) { this.state = state; }
  async fetch() {
    const n = ((await this.state.storage.get('n')) || 0) + 1;
    await this.state.storage.put('n', n);
    return new Response(String(n));
  }
}
export default {
  fetch(req, env) { return env.PRESENCE.get(env.PRESENCE.idFromName('prueba')).fetch(req); },
};
JS

echo "== 1. Reproducir el estado de producción (subida por API, sin etiqueta)"
cat > "$TMP/meta.json" <<'JSON'
{
  "main_module": "index.mjs",
  "compatibility_date": "2025-01-01",
  "bindings": [{ "type": "durable_object_namespace", "name": "PRESENCE", "class_name": "Presence" }],
  "migrations": { "new_sqlite_classes": ["Presence"] }
}
JSON
curl -s -X PUT "${AUTH[@]}" "$API" \
  -F "metadata=@$TMP/meta.json;type=application/json" \
  -F "index.mjs=@$TMP/index.mjs;type=application/javascript+module" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("subida:",j.success?"ok":JSON.stringify(j.errors))})'
echo "etiqueta de migración: $(etiqueta)"

echo "== 2. wrangler deploy con la migración v1 del repositorio"
cat > "$TMP/wrangler.jsonc" <<JSON
{
  "name": "${NOMBRE}",
  "main": "index.mjs",
  "compatibility_date": "2025-01-01",
  "workers_dev": false,
  "durable_objects": { "bindings": [{ "name": "PRESENCE", "class_name": "Presence" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Presence"] }]
}
JSON
if (cd "$TMP" && npx --prefix "$RAIZ" wrangler deploy --config wrangler.jsonc) > "$TMP/paso2.log" 2>&1; then
  echo "RESULTADO: wrangler aceptó la migración v1 sin cambios."
  echo "etiqueta: $(etiqueta)"
  echo "Conclusión: producción se puede desplegar con wrangler tal cual (ver docs/OPERACIONES-CLOUDFLARE.md)."
  exit 0
fi
echo "RESULTADO: wrangler rechazó la migración. Últimas líneas:"
tail -5 "$TMP/paso2.log" | sed -E 's/[A-Za-z0-9_-]{32,}/[oculto]/g'

echo "== 3. Arreglo candidato: subir solo la etiqueta v1 (sin crear clases)"
cat > "$TMP/meta3.json" <<'JSON'
{
  "main_module": "index.mjs",
  "compatibility_date": "2025-01-01",
  "bindings": [{ "type": "durable_object_namespace", "name": "PRESENCE", "class_name": "Presence" }],
  "migrations": { "new_tag": "v1", "steps": [] }
}
JSON
curl -s -X PUT "${AUTH[@]}" "$API" \
  -F "metadata=@$TMP/meta3.json;type=application/json" \
  -F "index.mjs=@$TMP/index.mjs;type=application/javascript+module" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("subida:",j.success?"ok":JSON.stringify(j.errors))})'
echo "etiqueta: $(etiqueta)"

echo "== 4. wrangler deploy otra vez (debe ver v1 aplicada y no migrar)"
if (cd "$TMP" && npx --prefix "$RAIZ" wrangler deploy --config wrangler.jsonc) > "$TMP/paso4.log" 2>&1; then
  echo "RESULTADO: con la etiqueta subida, wrangler despliega sin error."
  echo "Conclusión: antes del primer wrangler deploy de producción hay que subir solo la etiqueta v1."
else
  echo "RESULTADO: también falló. Últimas líneas:"
  tail -5 "$TMP/paso4.log" | sed -E 's/[A-Za-z0-9_-]{32,}/[oculto]/g'
  echo "Conclusión: no desplegar producción con wrangler; seguir subiendo por API hasta resolverlo."
fi
