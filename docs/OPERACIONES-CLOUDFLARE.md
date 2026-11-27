# Operaciones pendientes en Cloudflare

Estos pasos los hace el dueño a mano. Nada de esto se ejecutó durante la auditoría. Hazlos **en este orden** y uno a la vez.

Cuenta: `8d32c46fda6faf5cfb7746cc308ce56d`. Workers: `nova-px-event-launcher` (principal) y `nova-px-pet` (PX).

## Orden seguro

1. Corregir la rama de producción de Workers Builds (A). Esto cierra el hueco más grave y no despliega nada.
2. Proteger `main` en GitHub y borrar las ramas `novapx-check-*` (PR #4).
3. Correr la prueba aislada de Presence (B) y decidir cómo desplegar el Worker principal.
4. Desplegar PetQuota en el Worker PX (C).
5. Solo después de esos pasos, desplegar el Worker principal con los límites nuevos.

## A. Rama de producción de Workers Builds

**Estado real (leído por API, 27-11-2026):**
- El trigger de producción del Worker principal tiene `branch_includes: ["novapx-check-1794018615182"]` y despliega con `npx wrangler deploy` desde `/`.
- Esa rama existe, apunta a `e40187f` y no está protegida. Un push a ella despliega producción sin revisión.
- Las demás ramas crean Previews. Por eso el PR #9 tiene Preview.

**Opción recomendada: desplegar a mano.** Desconecta Workers Builds o deja solo Previews. Así unir a `main` nunca despliega solo.
1. Cloudflare → Workers y Pages → `nova-px-event-launcher` → Settings → Build.
2. En «Branch control», cambia la rama de producción a `main` y **desactiva** «Builds for non-production branches» si no quieres Previews públicos. Si prefieres que nada se despliegue al unir, pulsa «Disconnect» en el repositorio.
3. Comprueba: Settings → Build debe mostrar `main` (o «sin conectar»).

**Si eliges `main` como rama de producción:** unir cualquier PR a `main` desplegará producción. Antes de eso:
- protege `main` (GitHub → Settings → Branches → regla para `main`: PR obligatorio, 1 aprobación, checks «Tests y lint» y «calidad» en verde, sin push forzado);
- haz primero la prueba B, porque el primer `wrangler deploy` puede fallar por la migración.

**Volver atrás:** en la misma pantalla se cambia de nuevo la rama. Desplegar una versión anterior: Workers → `nova-px-event-launcher` → Deployments → elige la versión → «Rollback», o `npx wrangler rollback`.

Los Previews no tienen el KV de producción, pero sí son públicos y cada rama dejó un namespace `Presence` aparte (~19 sin uso). Bórralos desde Workers → Durable Objects cuando ya no haya ramas `novapx-check-*`.

## B. Migración Presence: prueba aislada

**El problema:** el script de producción tiene `migration_tag` vacío, pero el namespace `Presence` (SQLite) ya existe porque se subió por API. `wrangler.jsonc` declara la migración `v1` (`new_sqlite_classes: ["Presence"]`). El primer `wrangler deploy` podría fallar con «la clase ya existe».

**La prueba** (`tools/prueba-migracion-presence.sh`) usa un Worker desechable `nova-px-prueba-migracion-<hora>`. Se niega a usar los nombres de producción y borra el Worker al terminar:
1. Sube por API un Worker con `Presence` y sin etiqueta, igual que producción.
2. Corre `wrangler deploy` con la migración `v1`.
3. Si falla, sube solo la etiqueta `v1` (`new_tag: "v1"`, sin pasos).
4. Corre `wrangler deploy` otra vez.

Cómo correrla en tu PC:
```
export CLOUDFLARE_API_TOKEN=<token con Workers Scripts:Edit>
export CLOUDFLARE_ACCOUNT_ID=8d32c46fda6faf5cfb7746cc308ce56d
bash tools/prueba-migracion-presence.sh
```

Qué hacer con el resultado:
- **Si dice «aceptó la migración v1 sin cambios»:** producción se puede desplegar con `npx wrangler deploy`.
- **Si funcionó solo tras subir la etiqueta:** antes del primer deploy de producción, sube la etiqueta `v1` al Worker real. Para eso, repite el paso 3 del script con el nombre real, una sola vez y con el código actual de producción (bájalo antes del panel). Después ya sirve `wrangler deploy`.
- **Si falló todo:** no despliegues producción con wrangler. Avísame con la salida del script, que no muestra el token.

Los datos de presencia son temporales (quién está en línea). Si algo sale mal, se pierden como mucho los estados en línea del momento, no las cuentas: estas viven en el KV `USERS`.

## C. Desplegar PetQuota en el Worker PX

**Estado real:** el script `nova-px-pet` no tiene `QUOTA` ni etiqueta de migración, y no tiene Workers Builds. El código del PR ya falla cerrado: sin `QUOTA` responde 503 `quota_unavailable` y el launcher dice «PX está en mantenimiento». Por eso **unir el PR no apaga PX** (no se despliega solo), pero **desplegar solo el código sin la migración sí lo apaga**.

Pasos:
1. Comprueba el plan: `npx wrangler deploy --config worker/pet/wrangler.jsonc --dry-run`. Debe listar `QUOTA (PetQuota)`, `PET`, `AI` y las variables.
2. Anota la versión actual: `npx wrangler deployments list --config worker/pet/wrangler.jsonc`.
3. Despliega: `npx wrangler deploy --config worker/pet/wrangler.jsonc`. Esto aplica la migración `v1` y crea `PetQuota`. El Worker PX no tiene la clase creada, así que aquí no aplica el problema de B.
4. Verifica: abre `https://<url de nova-px-pet>/health`. Debe responder `"quota": true` y `"on": true`.
5. Prueba el chat de PX desde el launcher. Con 3 mensajes seguidos no debe pasar nada raro. Al llenar la cuota diaria debe avisar «límite».
6. **Volver atrás:** `npx wrangler rollback --config worker/pet/wrangler.jsonc` regresa a la versión anterior (sin cuota, con el KV viejo). La clase `PetQuota` queda creada, pero no molesta.
