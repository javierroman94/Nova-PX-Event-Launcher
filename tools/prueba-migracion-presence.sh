#!/usr/bin/env bash
# Comprueba la migración «Presence» del Worker principal.
#
# Paso 0 (solo lectura): muestra la etiqueta de migración real de los Workers
# de producción. No cambia nada en ellos.
# Pasos 1-3 (opcional, con --aislada): reproduce el estado de producción en un
# Worker DESECHABLE (clase Presence creada con la etiqueta v1) y comprueba que
# `wrangler deploy` con la configuración del repositorio no vuelve a migrar.
# Al final borra el Worker de prueba. Nunca escribe en los Workers de producción.
#
# Uso:
#   export CLOUDFLARE_API_TOKEN=...   # lectura basta para el paso 0;
#                                     # Workers Scripts:Edit para --aislada
#   export CLOUDFLARE_ACCOUNT_ID=...  # ID de la cuenta Cloudflare
#   bash tools/prueba-migracion-presence.sh            # solo lectura
#   bash tools/prueba-migracion-presence.sh --aislada  # además, la prueba
#
# Necesita bash, curl >= 7.76 y, para --aislada, Node >= 22.12 (lo pide
# wrangler 4.168.0). El token no se imprime ni se guarda, y no se muestran
# cuerpos de respuesta de la API.
set -euo pipefail

WRANGLER="wrangler@4.168.0"
PRODUCCION=(nova-px-event-launcher nova-px-pet)

: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Falta CLOUDFLARE_ACCOUNT_ID}"
if [[ ! "$CLOUDFLARE_ACCOUNT_ID" =~ ^[a-fA-F0-9]{32}$ ]]; then
  echo "CLOUDFLARE_ACCOUNT_ID no tiene el formato esperado." >&2
  exit 1
fi

AISLADA=0
case "${1:-}" in
  "") ;;
  --aislada) AISLADA=1 ;;
  *) echo "Opción desconocida: $1" >&2; exit 1 ;;
esac

BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
TMP="$(mktemp -d)"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
NOMBRE=""
CREACION_INTENTADA=0

# Hace una petición y exige HTTP 2xx y success=true. Nunca imprime el cuerpo.
api_request() {
  local paso="$1"
  shift
  rm -f "$TMP/api-response.json"
  if ! curl --silent --show-error --fail-with-body "$@" --output "$TMP/api-response.json"; then
    echo "$paso: falló la petición HTTP o de red." >&2
    return 1
  fi
  if ! node -e '
    const d = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    process.exit(d.success === true && !(Array.isArray(d.errors) && d.errors.length) ? 0 : 1);
  ' "$TMP/api-response.json" 2>/dev/null; then
    echo "$paso: Cloudflare no confirmó success=true." >&2
    return 1
  fi
}

# Etiqueta real de un Worker. El campo migration_tag solo viene en la lista de
# scripts; /settings no lo trae. Falla si el Worker no aparece.
etiqueta() {
  api_request "Leer la lista de Workers" "${AUTH[@]}" "$BASE" || return 1
  node -e '
    const d = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const s = (d.result || []).find((x) => x.id === process.argv[2]);
    if (!s) { console.error("No existe el Worker " + process.argv[2]); process.exit(1); }
    console.log(s.migration_tag || "(vacía)");
  ' "$TMP/api-response.json" "$1"
}

limpiar() {
  if [[ "$CREACION_INTENTADA" == "1" && -n "$NOMBRE" ]]; then
    if api_request "Borrar Worker de prueba" -X DELETE "${AUTH[@]}" "${BASE}/${NOMBRE}?force=true"; then
      echo "Worker de prueba ${NOMBRE} borrado."
    else
      echo "AVISO: no se pudo confirmar el borrado de ${NOMBRE}; bórralo en el panel de Cloudflare." >&2
    fi
  fi
  rm -rf "$TMP"
}
trap limpiar EXIT
trap 'exit 130' INT TERM

echo "== 0. Etiquetas de migración en producción (solo lectura)"
for w in "${PRODUCCION[@]}"; do
  # Asignación aparte: con set -e, un fallo dentro de $(...) detiene el script.
  t="$(etiqueta "$w")"
  echo "$w: $t"
done

if [[ "$AISLADA" != "1" ]]; then
  echo "Si nova-px-event-launcher muestra v1, wrangler deploy no vuelve a crear Presence."
  echo "Para comprobarlo en un Worker desechable: bash $0 --aislada"
  exit 0
fi

if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  echo "La prueba aislada necesita Node 22.12 o superior (lo pide ${WRANGLER})." >&2
  exit 1
fi

NOMBRE="nova-px-prueba-migracion-$(date +%s)"
for w in "${PRODUCCION[@]}"; do
  if [[ "$NOMBRE" == "$w" ]]; then echo "Nombre prohibido" >&2; exit 1; fi
done

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

echo "== 1. Reproducir producción: Presence creada con la etiqueta v1"
cat > "$TMP/meta.json" <<'JSON'
{
  "main_module": "index.mjs",
  "compatibility_date": "2025-01-01",
  "bindings": [{ "type": "durable_object_namespace", "name": "PRESENCE", "class_name": "Presence" }],
  "migrations": { "new_tag": "v1", "new_sqlite_classes": ["Presence"] }
}
JSON
CREACION_INTENTADA=1
api_request "Crear Worker de prueba" -X PUT "${AUTH[@]}" "${BASE}/${NOMBRE}" \
  -F "metadata=@$TMP/meta.json;type=application/json" \
  -F "index.mjs=@$TMP/index.mjs;type=application/javascript+module"
t="$(etiqueta "$NOMBRE")"
echo "etiqueta del Worker de prueba: $t"
if [[ "$t" != "v1" ]]; then
  echo "RESULTADO: Cloudflare no guardó la etiqueta v1; la prueba no reproduce producción." >&2
  exit 1
fi

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
# --yes y versión fija: sin una pregunta escondida en el log ni otra versión.
if ! (cd "$TMP" && npx --prefix "$RAIZ" --yes "$WRANGLER" deploy --config wrangler.jsonc) > "$TMP/paso2.log" 2>&1; then
  echo "RESULTADO: wrangler falló en el Worker desechable. Últimas líneas:"
  tail -5 "$TMP/paso2.log" | sed -E 's/[A-Za-z0-9_-]{32,}/[oculto]/g'
  echo "Conclusión: no desplegar producción con wrangler; revisar esta salida."
  exit 1
fi

echo "== 3. Comprobar que la etiqueta sigue en v1"
t="$(etiqueta "$NOMBRE")"
echo "etiqueta después del deploy: $t"
if [[ "$t" != "v1" ]]; then
  echo "RESULTADO: la etiqueta cambió a $t; revisar antes de desplegar producción." >&2
  exit 1
fi
echo "RESULTADO: wrangler desplegó sin volver a migrar."
echo "Conclusión: con producción en v1, wrangler deploy del Worker principal no toca Presence."
