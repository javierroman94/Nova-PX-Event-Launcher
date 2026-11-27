# Operaciones en Cloudflare

**Estado al 27-11-2026:** A hecho (rama de producción `main`, más la regla de GitHub que protege `main`); B confirmado en solo lectura (Presence ya en `v1`); C hecho (PetQuota desplegado y comprobado). Lo que queda: borrar las ramas `novapx-check-*` (PR #4).

Estos pasos los hace el dueño a mano. Nada de esto se ejecutó durante la auditoría. Hazlos **en este orden** y uno a la vez.

Cuenta: `8d32c46fda6faf5cfb7746cc308ce56d`. Workers: `nova-px-event-launcher` (principal) y `nova-px-pet` (PX).

## Orden seguro

1. Corregir la rama de producción de Workers Builds (A). Esto cierra el hueco más grave y no despliega nada.
2. Proteger `main` en GitHub y borrar las ramas `novapx-check-*` (PR #4).
3. Confirmar la etiqueta `v1` de Presence (B). Ya se confirmó en solo lectura el 27-11-2026; la prueba con Worker desechable es opcional.
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
- revisa que el primer despliegue desde `main` sea el código que quieres en producción, porque se publica sin pedir confirmación.

**Volver atrás:** en la misma pantalla se cambia de nuevo la rama. Desplegar una versión anterior: Workers → `nova-px-event-launcher` → Deployments → elige la versión → «Rollback», o `npx wrangler rollback`.

Los Previews no tienen el KV de producción, pero sí son públicos y cada rama dejó un namespace `Presence` aparte (~19 sin uso). Bórralos desde Workers → Durable Objects cuando ya no haya ramas `novapx-check-*`.

## B. Migración Presence

**Corrección (27-11-2026):** una versión anterior de esta guía decía que el Worker principal no tenía etiqueta de migración. Era falso: se leyó de `/settings`, que no trae ese campo. La lista de scripts de la API muestra `nova-px-event-launcher` con `migration_tag: "v1"` y el namespace `Presence` en SQLite. Con eso, `wrangler deploy` con la configuración del repositorio (`v1`, `new_sqlite_classes: ["Presence"]`) ve la migración ya aplicada y no la repite. **No hace falta subir ninguna etiqueta a mano.**

`tools/prueba-migracion-presence.sh` lo comprueba:
- Sin opciones, solo lee las etiquetas reales de los dos Workers de producción.
- Con `--aislada`, además crea un Worker desechable `nova-px-prueba-migracion-<hora>` igual a producción (Presence con `v1`), corre `wrangler@4.168.0 deploy` y confirma que la etiqueta sigue en `v1`. Después lo borra.
- Nunca escribe en los Workers de producción, se detiene ante cualquier error de la API y no muestra cuerpos de respuesta. `test/prueba-migracion.test.js` lo comprueba con una API simulada.

```
export CLOUDFLARE_API_TOKEN=<token; lectura basta sin --aislada>
export CLOUDFLARE_ACCOUNT_ID=8d32c46fda6faf5cfb7746cc308ce56d
bash tools/prueba-migracion-presence.sh            # solo lectura
bash tools/prueba-migracion-presence.sh --aislada  # prueba con Worker desechable
```

Necesita bash, curl y Node 22.12 o superior. El dueño no tiene máquina de desarrollo: Claude puede correr la lectura con el conector de Cloudflare (ya lo hizo). La prueba `--aislada` crea y borra un Worker en tu cuenta, así que solo se corre si la pides.

Los Previews de cada rama crean su propio namespace `Presence` (hoy hay unos 37). Cloudflare los borra al borrar el Preview. Para limpiarlos, borra las ramas viejas (PR #4) y los Previews en el panel.

## C. Desplegar PetQuota en el Worker PX

**Estado real:** el script `nova-px-pet` no tiene `QUOTA` ni etiqueta de migración, y no tiene Workers Builds. El código del PR ya falla cerrado: sin `QUOTA` responde 503 `quota_unavailable` y el launcher dice «PX está en mantenimiento». Por eso **unir el PR no apaga PX** (no se despliega solo), pero **desplegar solo el código sin la migración sí lo apaga**.

Pasos:
1. Comprueba el plan: `npx wrangler deploy --config worker/pet/wrangler.jsonc --dry-run`. Debe listar `QUOTA (PetQuota)`, `PET`, `AI` y las variables.
2. Anota la versión actual: `npx wrangler deployments list --config worker/pet/wrangler.jsonc`.
3. Despliega: `npx wrangler deploy --config worker/pet/wrangler.jsonc`. Esto aplica la migración `v1` y crea `PetQuota`. El Worker PX no tiene la clase creada, así que aquí no aplica el problema de B.
4. Verifica: abre `https://<url de nova-px-pet>/health`. Debe responder `"quota": true` y `"on": true`.
5. Prueba el chat de PX desde el launcher. Con 3 mensajes seguidos no debe pasar nada raro. Al llenar la cuota diaria debe avisar «límite».
6. **Volver atrás:** `wrangler rollback` **no sirve** aquí. Cloudflare no deja volver a una versión anterior a la que aplicó una migración de Durable Objects. Si algo falla, despliega una corrección que mantenga la clase `PetQuota` y la migración `v1`. Por ejemplo, para apagar el chat con IA, pon `PET_GLOBAL_DAILY` en `0`. Por eso este despliegue va solo, sin otros cambios de código.

**Sin máquina de desarrollo:** `wrangler deploy` necesita Node 22.12. Hay dos formas seguras:
- Claude lo despliega con el conector de Cloudflare cuando lo autorices explícitamente para ese despliegue.
- Un workflow manual de GitHub (`workflow_dispatch`) con un entorno protegido y un token de Cloudflare limitado a ese Worker. Todavía no existe, y crearlo agrega un secreto nuevo al repositorio.
