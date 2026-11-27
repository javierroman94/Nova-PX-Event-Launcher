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
#   export CLOUDFLARE_ACCOUNT_ID=...  # ID de la cuenta Cloudflare
#   bash tools/prueba-migracion-presence.sh
#
# El token no se imprime ni se guarda. Resultado: un resumen con lo que pasó
# en cada paso, para decidir cómo desplegar producción.
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Falta CLOUDFLARE_ACCOUNT_ID}"

if [[ ! "$CLOUDFLARE_ACCOUNT_ID" =~ ^[a-fA-F0-9]{32}$ ]]; then
  echo "CLOUDFLARE_ACCOUNT_ID no tiene el formato esperado." >&2
  exit 1
fi

NOMBRE="nova-px-prueba-migracion-$(date +%s)"
case "$NOMBRE" in
  nova-px-event-launcher|nova-px-pet)
    echo "Nombre prohibido" >&2
    exit 1
    ;;
esac

API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${NOMBRE}"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
TMP="$(mktemp -d)"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CREACION_INTENTADA=0

# No muestra el cuerpo de error de Cloudflare: evita filtrar datos de la cuenta.
api_request() {
  local paso="$1"
  shift
  if ! curl --silent --show-error --fail-with-body "$@" --output "$TMP/api-response.json"; then
    echo "$paso: falló la petición HTTP o de red." >&2
    return 1
  fi
  if ! node - "$TMP/api-response.json" <<'NODE'
const fs = require('node:fs');
try {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (data.success !== true || (Array.isArray(data.errors) && data.errors.length > 0)) {
    process.exit(1);
  }
} catch {
  process.exit(1);
}
NODE
  then
    echo "$paso: Cloudflare no confirmó success=true." >&2
    return 1
  fi
}

limpiar() {
  if [[ "$CREACION_INTENTADA" == "1" ]]; then
    if curl --silent --show-error --fail-with-body -X DELETE "${AUTH[@]}" "${API}?force=true" --output "$TMP/cleanup.json" &&
      node - "$TMP/cleanup.json" <<'NODE'
const fs = require('node:fs');
try {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.exit(data.success === true && (!Array.isArray(data.errors) || data.errors.length === 0) ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
    then
      echo "Worker de prueba ${NOMBRE} eliminado."
    else
      echo "AVISO: no se pudo confirmar la eliminación del Worker ${NOMBRE}; revisa Cloudflare." >&2
    fi
  fi
  rm -rf "$TMP"
}
trap limpiar EXIT

etiqueta() {
  api_request "Consultar etiqueta de migración" "${AUTH[@]}" "$API/settings"
  node - "$TMP/api-response.json" <<'NODE'
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(data.result?.migration_tag || '(vacía)');
NODE
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
CREACION_INTENTADA=1
api_request "Crear Worker de prueba" -X PUT "${AUTH[@]}" "$API" \
  -F "metadata=@$TMP/meta.json;type=application/json" \
  -F "index.mjs=@$TMP/index.mjs;type=application/javascript+module"
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
  echo "RESULTADO: wrangler aplicó la migración v1 en el Worker desechable."
  echo "Conclusión: la secuencia de migración funciona en el entorno aislado."
  exit 0
fi
echo "RESULTADO: wrangler rechazó el dry-run. Últimas líneas:"
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
api_request "Registrar etiqueta v1 en Worker desechable" -X PUT "${AUTH[@]}" "$API" \
  -F "metadata=@$TMP/meta3.json;type=application/json" \
  -F "index.mjs=@$TMP/index.mjs;type=application/javascript+module"
echo "etiqueta: $(etiqueta)"

echo "== 4. wrangler deploy después de registrar la etiqueta v1"
if (cd "$TMP" && npx --prefix "$RAIZ" wrangler deploy --config wrangler.jsonc) > "$TMP/paso4.log" 2>&1; then
  echo "RESULTADO: wrangler desplegó correctamente tras registrar la etiqueta v1."
  echo "Conclusión: en producción se necesitaría registrar la etiqueta antes del despliegue, previa validación y autorización."
else
  echo "RESULTADO: también falló el despliegue después de registrar la etiqueta. Últimas líneas:"
  tail -5 "$TMP/paso4.log" | sed -E 's/[A-Za-z0-9_-]{32,}/[oculto]/g'
  echo "Conclusión: no desplegar producción; investigar el error en el entorno aislado."
fi
