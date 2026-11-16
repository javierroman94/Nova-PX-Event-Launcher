# Contador de usuarios con Cloudflare (gratis)

Sirve para ver en **Admin → Usuarios** cuántas personas usan el launcher, quiénes son (si iniciaron sesión) y cuándo lo abrieron por última vez. Es opcional: sin esto el launcher funciona igual.

**Qué se guarda por instalación:** un número al azar, el nick (solo si inició sesión), si es premium, la versión del launcher y el sistema operativo. **Nunca** se guarda la IP, contraseñas ni archivos. Los registros inactivos se borran solos a los 180 días. Cada jugador puede apagarlo en **Ajustes → Contar mi uso**.

Límites del plan gratis de Cloudflare: 100 000 peticiones al día y unas 1 000 escrituras al día. El contador solo escribe cuando algo cambia o pasan 6 horas, así que alcanza para cientos de jugadores.

## Paso a paso (unos 10 minutos)

1. Entra a https://dash.cloudflare.com y crea una cuenta gratis (o inicia sesión).
2. **Crear el almacén:** menú *Storage & Databases* → *KV* → **Create** → nombre `novapx-users` → Add.
3. **Crear el Worker:** menú *Workers & Pages* → **Create** → *Create Worker* → nombre `novapx-contador` → **Deploy**. Luego pulsa **Edit code**, borra todo lo que hay, pega el contenido del archivo `worker/index.mjs` de este repositorio y pulsa **Deploy**.
4. **Conectar el almacén:** en el Worker → *Settings* → *Bindings* → **Add** → *KV namespace* → nombre de variable **`USERS`** (en mayúsculas) → elige `novapx-users` → Deploy.
5. **Crear la clave del administrador:** en el Worker → *Settings* → *Variables and Secrets* → **Add** → tipo **Secret** → nombre **`ADMIN_KEY`** → valor: una frase larga y única (mínimo 16 caracteres; guárdala en un lugar seguro) → Deploy.
6. Copia la dirección del Worker (algo como `https://novapx-contador.TU-USUARIO.workers.dev`).
7. **Decirle la dirección al launcher:** en GitHub, edita `config/launcher.config.json` y pon `"telemetryUrl": "https://novapx-contador.TU-USUARIO.workers.dev"`. Publica una versión nueva del launcher (tag `vX.Y.Z`).
8. **Ver los datos:** en el launcher (con tu cuenta premium autorizada) → **Admin → Usuarios** → pega la `ADMIN_KEY` una sola vez → Conectar.

## Si algo falla

- *"Falta la dirección del contador"*: falta el paso 7 o aún no instalaste la versión nueva.
- *"La clave del contador no es correcta"*: la `ADMIN_KEY` del launcher no coincide con la de Cloudflare.
- La lista sale vacía: nadie ha abierto todavía una versión con la dirección configurada. Abre el launcher tú y pulsa *Actualizar*.
- Para borrar todo: elimina el Worker y el almacén KV en Cloudflare.
