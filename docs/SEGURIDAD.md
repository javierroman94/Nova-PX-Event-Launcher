# Seguridad y privacidad

Revisión estática de seguridad y privacidad del repositorio público, actualizada el 27-11-2026. No sustituye pruebas dinámicas en Windows/macOS/Linux ni una revisión completa del historial Git.

## Verificado y correcto
- En los archivos de código y configuración revisados no se encontró un valor real de secreto. No se verificaron exhaustivamente todos los commits históricos ni los valores del almacén de secretos de Cloudflare; no debe afirmarse que esa comprobación está completa.
- Los tokens de Microsoft, Xbox y Minecraft nunca salen al Worker: `lib/telemetry.js` solo envía id aleatorio, nick, premium, versión y sistema. Amigos sí envía una credencial aleatoria de presencia separada; va cifrada en el dispositivo y el Worker conserva solo su hash.
- El token de renovación, el token de administrador, el webhook y el token local de presencia se guardan con `safeStorage`, sin respaldo en texto plano. Si no hay almacén seguro, amigos no persiste el token.
- Ventanas con `contextIsolation`, `sandbox`, `webSecurity: true` y sin `nodeIntegration`; CSP sin estilos inline; permisos del navegador denegados; bloqueo de `will-navigate` y `will-redirect`; IPC limitado al marco principal.
- `ADMIN_KEY` está configurado como secreto de Cloudflare. La rama de auditoría añade `LIMITER` y `ADMIN_LIMITER` al Worker principal; esos bindings aún no están desplegados. Los límites de Cloudflare son aproximados por ubicación, no cuotas globales estrictas.
- Eventos protegidos: AES-256-GCM, IV aleatorio, sal propia, AAD por archivo y ninguna llave fija. Quien controle el repositorio no puede falsificar mods de un evento protegido sin la contraseña.

## Corregido en esta revisión
| Hallazgo | Corrección |
|---|---|
| Token de acceso de Minecraft visible en la consola (minecraft-launcher-core imprime los argumentos) | `lib/redact.js` limpia tokens, JWT y cabeceras en todo log e informe; PX filtra credenciales también en el campo de registros |
| Informe "protegido" cifrado con una llave fija del código público | Se sella con llave pública (`lib/seal.js`); la privada no está en el repositorio |
| `scrypt` N=2^15 | Sobres nuevos con N=2^17 y parámetros guardados en `kdf`; los antiguos siguen abriéndose |
| Mods de packs sin huella robusta | SHA-256 preferido en manifiestos nuevos; SHA-1 se conserva para compatibilidad con manifiestos antiguos |
| `/ads/track` y `/ping` sin límite; claves inventadas en KV | Límite por IP, solo anuncios que existen en `data/ads.json`, `X-Content-Type-Options` |
| Amigos en tiempo real (`/presence/ws`, 1.0.189) | El nick va en la URL y el token en el primer mensaje; sin autenticar se cierra; máximo 3 conexiones por nick y 30 conexiones por minuto por IP; mensajes limitados (20/min), solicitudes (15/h), invitaciones (20/10 min); bloquear oculta al bloqueado |
| Códigos para compartir modpacks (`/pack`, 1.0.188) | Solo ids públicos de Modrinth validados (`worker/pack.mjs`), 6 creaciones por hora por IP, 40 lecturas por minuto, caducan a los 90 días; el launcher vuelve a validar lo que recibe y solo baja de `cdn.modrinth.com` con la huella publicada por Modrinth |
| Intentos administrativos limitados solo en memoria | Comparación de hashes, bloqueo local y binding `ADMIN_LIMITER` para intentos fallidos (pendiente de despliegue) |
| Token local de presencia en texto plano | Se migra a `safeStorage`; sin almacén seguro se elimina el formato antiguo y no se persiste |
| `safeStorage` en Linux podía usar `basic_text` (llave fija) | `lib/secure-storage.js` lo trata como "sin almacén seguro" |
| IPC sin comprobar el marco principal | `lib/ipc-guard.js`: origen permitido y marco principal obligatorio |
| Faltaba bloquear redirecciones y fijar `webSecurity` explícitamente | `lockWindow()` bloquea `will-navigate` y `will-redirect`; ambas ventanas declaran `webSecurity: true` |
| CSP de overlay permitía estilos inline | CSS movido a `overlay.css`; `style-src 'self'` sin `unsafe-inline` |
| Nova Client se instalaba sin comprobar integridad | Verifica SHA-256 del asset de GitHub antes de escribirlo; falta firma para protegerse ante compromiso del repo |
| La política omitía el indicador premium de telemetría | `PRIVACY.md` ahora explica que se envía un booleano premium, nunca tokens |
| GitHub Actions usaba etiquetas de versión movibles | Los workflows fijan checkout, setup-node y upload-artifact a SHA completo |

## Estado de la revisión de seguridad (PR #9)

**Terminado en código y con pruebas automáticas**
- Firma obligatoria de datos: rechaza la falta de llave pública, firmas ausentes, malas, de otro archivo, con datos cambiados, formato desconocido y llaves que no son Ed25519.
- IPC solo desde el marco principal de páginas de `renderer/`; prueba de superficie de los 204 canales.
- Enlaces externos con confirmación fuera de sitios conocidos (`lib/links.js`).
- Token de presencia cifrado con safeStorage; sin almacén seguro, Amigos no se conecta.
- Cuotas de PX atómicas con Durable Object y fail-closed sin `QUOTA`.
- Dependencias: `npm audit --omit=dev` da 0 vulnerabilidades. `request` se cambió por `@cypress/request@4.0.1` y `uuid` por 11.1.1 dentro de `minecraft-launcher-core`, más `adm-zip@0.6.1` (todo con `overrides`, probado con el Handler real de MCLC).
- Firma Ed25519 de publicaciones Nova preparada: verificación, firma en CI, herramientas para instalar y comprobar la llave, interruptor `novaFirmaObligatoria`.
- La lista semanal del loader Nova abre un PR (no sube a `main`). Actions fijadas por SHA y con permisos mínimos.

**Comprobado en el commit revisado**
- GitHub Actions: «Tests y lint» y los dos «Pruebas y auditoría de seguridad» terminaron en verde.
- Cloudflare Workers Builds generó el Preview de la rama (`Workers Builds: nova-px-event-launcher`, éxito) y el comentario del bot en el PR lo confirma: Preview del commit `204b661` (build y despliegue correctos).
- Producción sin cambios: la última versión del Worker principal es del 24-11-2026, subida por API. Ninguna build de esta rama llegó a producción.

**Pendiente (no se puede cerrar desde el código)**
- Crear la llave Nova y los secretos, instalar la pública y, tras comprobarlo, activar `novaFirmaObligatoria` (pasos abajo).
- Borrar las ramas `novapx-check-*` (PR #4). Hecho el 27-11-2026: la rama de producción de Workers Builds es `main` y `main` no se puede borrar ni reescribir (punto 13).
- Hecho el 27-11-2026: Worker PX desplegado con `PetQuota` (migración `v1`), con las mismas variables y sin `PET_MODEL`. `/health` responde `quota: true`; un mensaje de prueba respondió con `left: 29`, y un registro con token fue rechazado (422). Ya no se puede volver atrás con `wrangler rollback` antes de esa migración; ver `docs/OPERACIONES-CLOUDFLARE.md`, C.
- Pasos exactos, orden y cómo volver atrás: `docs/OPERACIONES-CLOUDFLARE.md`.
- Pruebas manuales en Windows (`docs/PRUEBAS-WINDOWS.md`).
- Probar en Windows la instalación y el arranque de Minecraft con las dependencias nuevas (`@cypress/request`, `uuid` 11) antes de publicar.
- **Electron 33 sin soporte (bloquea publicar):** `npm audit` completo reporta 46 avisos de Electron, 12 altos, entre ellos un bypass de aislamiento de contexto (GHSA-h7rp-cf8h-j98x). `npm audit --omit=dev` no los muestra porque `electron` está en `devDependencies`, aunque se distribuye a todos los jugadores. Ver «Árbol completo de dependencias».
- Login Microsoft a PKCE/Device Code: necesita una app propia aprobada por Microsoft.
- Firma del propio instalador del launcher (Authenticode) y de su canal de actualizaciones.

## Árbol completo de dependencias (27-11-2026)

`npm audit` sin `--omit=dev` da 18 paquetes: 1 crítico, 13 altos y 4 moderados. Ninguno se arregla sin subir una versión mayor. Todos vienen de dos dependencias directas:

| Origen | Paquetes | ¿Llega a los jugadores? | Riesgo real |
|---|---|---|---|
| `electron@33.4.11` (directa) | `electron`, `extract-zip` | **Sí:** Electron es el programa que corre en cada PC. `extract-zip` solo se usa al instalar Electron en desarrollo. | **Alto.** 46 avisos (12 altos), entre ellos aislamiento de contexto (GHSA-h7rp-cf8h-j98x), sandbox de popups e iframes, use-after-free y lecturas cruzadas con protocolos propios. Las defensas del launcher (sandbox, CSP, `lockWindow`, sin `<webview>`, IPC solo del marco principal) bajan el riesgo, pero no lo eliminan. Arreglo: Electron ≥ 45.5.0. |
| `electron-builder@25.1.8` (directa) | `tar` (crítico), `node-gyp`, `cacache`, `make-fetch-happen`, `@electron/rebuild`, `app-builder-lib`, `builder-util(-runtime)`, `dmg-builder`, `electron-publish`, `electron-builder-squirrel-windows`, `glob`, `minimatch`, `@electron/universal`, `config-file-ts` | No: solo corren al compilar el instalador en GitHub Actions. | **Medio, de cadena de suministro.** `tar` y `extract-zip` permiten escribir fuera de la carpeta con un archivo malicioso, pero el build solo descarga binarios de Electron desde GitHub. El aviso de `builder-util-runtime` (fuga de `Authorization` en redirecciones) **no** afecta al launcher: `electron-updater` ya usa `builder-util-runtime@9.7.0`, corregido. El de AppImage solo afecta la versión de Linux. Arreglo: `electron-builder` ≥ 26.18.0. |

Plan, sin `npm audit fix --force`, en ramas separadas:
1. `electron-builder` 25 → 26.18: revisar `build` en `package.json`, compilar los tres instaladores en CI y probar instalar y actualizar en Windows.
2. Electron 33 → 45, una versión mayor cada vez o directo con pruebas completas: login Microsoft (`msmc` usa una ventana de Electron), `safeStorage` (las cuentas cifradas deben seguir abriéndose), ventana de PX, auto-actualización y arranque de Minecraft. Sin Windows real no se puede validar, así que no se publica hasta probarlo.

## Firma de publicaciones Nova (rama revision-seguridad-pendientes)
Hay una **segunda llave Ed25519**, solo para lo que se publica en automático: `data/nova-loader.json` (tarea semanal) y el manifiesto de cada release de Nova Client. Va separada de la llave de datos (`firma-datos`) para que la del dueño nunca tenga que estar en GitHub.

- **Pública:** `config/nova-firma.pub.pem` (va dentro del launcher; no se descarga, así que una lista o release alterada no puede cambiarla). **Todavía no existe porque la llave no se ha creado:** solo el dueño puede generarla (nadie más debe tener la privada) y Claude no genera llaves de producción. Mientras falte, todo funciona como hasta 1.0.193 (lista sin firma, Nova Client con el digest SHA-256 de GitHub).
- **Tres estados:** sin pública → sin firma. Con pública y `"novaFirmaObligatoria": false` (valor actual) → una firma presente se verifica y si es mala se rechaza, pero lo que no trae firma se acepta (sirve para comprobar que las firmas del CI son buenas). Con `true` → sin firma válida no se instala ni se usa nada.
- **Privada:** solo como secreto `NOVA_FIRMA_PRIVADA` (PEM) en los dos repositorios: `Nova-PX-Event-Launcher` y `Nova-Client`. Nunca en un archivo del repo.
- **Lista del loader:** `.github/workflows/nova-loader.yml` firma con `tools/firmar-nova.js` → `data/nova-loader.firma.json`. El launcher la lee con `lib/data-firmada.js` (`nombre: "nova-loader"`): con llave pública, firma obligatoria y no más vieja que la última vista.
- **Nova Client:** `tools/firmar-release.js` (repo Nova-Client) sube `nova-client.json` (`{ v: 1, version, files: { nombre: sha256 } }`) y `nova-client.firma.json`. `lib/nova.js` (`releaseHashes`) verifica la firma y usa **esas** huellas para el `.jar` y `Nova-Pack.zip`, no las de GitHub.
- Mensaje firmado (igual que `lib/firma.js`): `NPX-DATA1\n<nombre>\n<firmadoEn>\n<sha256>`. Solo se aceptan llaves Ed25519 y `alg` ausente o `ed25519`.

**Cómo activarlo (lo hace el dueño, en su PC; nadie más debe ver la privada):**
1. Generar el par (OpenSSL 3, probado: produce PKCS#8 que Node lee tal cual):
   `openssl genpkey -algorithm ed25519 -out nova-firma.PRIVADA.pem`
   `openssl pkey -in nova-firma.PRIVADA.pem -pubout -out nova-firma.pub.pem`
   El `.gitignore` ya ignora `*.PRIVADA.pem`. Guarda la privada en un gestor de contraseñas.
2. Comprobar el par: `node tools/verificar-llave-nova.js nova-firma.PRIVADA.pem` → debe decir «Tipo: Ed25519», «Firma de prueba: correcta» y mostrar la **huella** (SHA-256 de la pública). Anótala: es la que hay que comparar en el paso 4. Con `--pub ruta` escribe la pública derivada (igual a la de OpenSSL).
3. En GitHub, en **los dos** repositorios (`Nova-PX-Event-Launcher` y `Nova-Client`): Settings → Secrets and variables → Actions → *New repository secret*, nombre `NOVA_FIRMA_PRIVADA`, valor = el PEM privado completo (con las líneas BEGIN/END). No se puede comprobar el valor desde fuera: los flujos lo validan al usarlo (`firmar-nova.js` exige que corresponda con `config/nova-firma.pub.pem`; `firmar-release.js` exige Ed25519).
4. En Nova-Client: unir el PR de firma y publicar una versión; la release debe traer `nova-client.json` y `nova-client.firma.json`. Después crear la variable (no secreto) `NOVA_FIRMA_OBLIGATORIA=true` para que una release sin firma falle.
5. En el launcher, en una rama + PR: `node tools/instalar-llave-publica-nova.js nova-firma.pub.pem` (se niega con una privada; muestra la huella, que debe ser la del paso 2). Ejecutar a mano **Actions → «Comprobar llave Nova»** sobre esa rama: confirma, sin mostrarlo, que el secreto corresponde a la pública. Después «Lista del loader Nova» (abre un PR con `nova-loader.firma.json`). Unir y publicar: con `novaFirmaObligatoria: false` el launcher ya verifica las firmas presentes.
6. Cuando esa versión funcione bien en Windows (Nova Client instala, la lista carga), cambiar `"novaFirmaObligatoria": true` en otra versión. Solo entonces la firma pasa a ser obligatoria.
7. Orden importante: firmas primero (pasos 4 y 5), obligatoriedad al final (paso 6). Activarla antes de tener releases y lista firmadas deja los perfiles Nova sin Nova Client ni lista nueva (falla cerrado: se usa la lista en caché).

Si la privada se filtra: generar otra, cambiar los secretos y `config/nova-firma.pub.pem`, y publicar una versión del launcher.

## Mods .px de eventos protegidos

**Qué hace.** Cada mod del evento se guarda en `userData/pack-cache/<evento>/<huella>.px`. Ese archivo es la cabecera `NPXPX` (versión 1) más el mod cifrado con AES-256-GCM: la clave del modpack solo sale del sobre abierto con la contraseña (scrypt, `KDF_STRONG`), el nonce es aleatorio por archivo y el nombre real del mod va en el AAD, así que un `.px` no sirve como otro mod. Antes de usarlo se comprueba la autenticación GCM y la huella del mod: SHA-1 siempre, y además SHA-256 en los eventos publicados desde esta versión (`lib/admin.js`). Los eventos ya publicados siguen con SHA-1 y no se tocaron sus datos firmados. La caché antigua `.bin` se migra sola a `.px`. Si el evento se vuelve a publicar con una clave nueva, los `.px` viejos se vuelven a bajar.

**Cuándo se descifran (Fabric).** Solo al pulsar Jugar, en una carpeta nueva de `%TEMP%` (`npx-run-<16 hex>`, con permisos 0700 donde el sistema los respeta; en Windows `%TEMP%` ya es solo del usuario), con nombres aleatorios (`m-<hex>.jar`) y una marca `.novapx-run`. Fabric los carga con `-Dfabric.addMods=<carpeta>`; la carpeta `mods/` del evento no recibe ningún `.jar` del evento. La carpeta se borra:
- al cerrar Minecraft;
- si el arranque falla (Java, loader, contraseña);
- al abrir el launcher, por si se cerró a la fuerza o se apagó el PC, y cada 10 minutos mientras el launcher está abierto. Solo se borran las carpetas que ya nadie usa: al arrancar Minecraft se anota su proceso en la marca, así que si se cierra el launcher con el juego abierto y se vuelve a abrir, esos mods no se tocan hasta que el juego termine. Una carpeta sin juego anotado se conserva mientras viva el launcher que la creó. Si el sistema reutiliza el número de un proceso terminado, la carpeta se conserva de más hasta una limpieza posterior; nunca se borra una partida activa por eso;
- al cerrar el launcher sin partida en curso.

La limpieza solo borra carpetas `npx-run-*` que tengan la marca; nunca toca carpetas ajenas ni los mods del jugador.

**Forge y NeoForge.** No tienen una opción estándar para cargar mods de otra carpeta. Siguen como antes: los mods se descifran en `mods/` con nombres neutros y se borran al cerrar; la copia cifrada queda como `.px`.

**Límite (importante).** Ningún loader (Fabric, Forge, NeoForge) puede cargar un mod cifrado: necesitan el `.jar` normal. Mientras Minecraft corre, los mods descifrados existen en disco y en la memoria de Java. Quien controla su propio equipo puede copiarlos en ese momento, o sacarlos de la memoria del proceso. El modo `.px` hace que no queden en disco cuando no se juega, que no se vean en la carpeta del juego y que no revelen sus nombres, pero **no** los hace imposibles de copiar. Para eso habría que modificar el loader (descifrar en memoria), y aun así la memoria del proceso seguiría accesible. No se debe anunciar como protección absoluta.

**Pruebas.** `test/mods-px.test.js` cubre:
- cifrar y descifrar;
- contraseña incorrecta, archivo alterado, `.px` usado como otro mod, y que `.px` no se acepta como `.jar`;
- instalación y partida en Fabric, sin `.jar` en `mods/`;
- limpieza normal y tras cierres inesperados (sin tocar carpetas ajenas);
- SHA-256 incorrecta, eventos solo con SHA-1, migración `.bin`, evento republicado, Forge/NeoForge y modpacks normales.

En un Windows 11 real se probó con Fabric API y Lithium para 1.21.1, bajados de Modrinth: caché solo `.px` cifrada, `mods/` vacío, dos `.jar` con nombre aleatorio en `%TEMP%`, 3 republicaciones seguidas y limpieza al abrir sin `.jar` restantes. Las pruebas pasaron también con el Node 20 del Electron del launcher. **Pendiente:** arrancar Fabric Loader 0.20.1 con Minecraft 1.21.1 de verdad con `-Dfabric.addMods`, también con una ruta con espacios. Los dos intentos de levantar un servidor Fabric de prueba (en el PC del dueño y en el entorno de Claude) quedaron bloqueados por los permisos del entorno y no se hicieron. No está aprobado.

## Loader Nova (1.0.190)
- `data/nova-loader.json` lo arma una tarea de GitHub (`tools/nova-loader.js`) y no va firmado: el launcher solo acepta enlaces `https://cdn.modrinth.com/data/…`, nombres de archivo seguros y huella SHA-512 de cada `.jar`. SHA-512 comprueba el archivo descargado, pero no autentica el catálogo: alguien con capacidad de modificar el repositorio podría cambiar catálogo, URL y huella. Requiere firma asimétrica.
- Si la huella no coincide no se instala nada. Al actualizar solo se tocan los archivos que puso Nova (y otras copias de esos mismos mods).

## Permisos por rol
El panel de administración tiene tres roles: Dueño (todo), Administrador (todo menos Permisos y la llave de firma) y Moderador (advertencias, usuarios y noticias), más casillas por persona. Se comprueban en el programa en cada acción y ocultan las pestañas que no corresponden. Límite: quien tenga un token de GitHub con escritura puede escribir en el repositorio sin pasar por el launcher. Lo protege la firma: `manifest`, `plugins`, `recommended`, `launcher` y `admins` solo son válidos si los firma el dueño. `news`, `ads`, `team`, `events` y `nicks` no están firmados. Aunque no deciden qué se descarga ni ejecuta, un atacante con escritura en el repo podría publicar enlaces HTTPS de phishing; la sanitización evita esquemas peligrosos, pero no es una lista de dominios permitidos.

## Pendiente (decisión del dueño)
1. **Fallo abierto si falta la llave pública.** Corregido (PR #5, integrado en esta rama): con firma obligatoria y sin llave pública se rechaza. Además se rechazan llaves que no son Ed25519 y firmas con `alg` distinto; hay pruebas para firma ausente, mala, de otro archivo, con datos cambiados, formato desconocido y llave RSA. Las firmas Ed25519 de `manifest`, `plugins`, `recommended`, `launcher` y `admins` siguen siendo el mecanismo correcto; la llave privada no debe ir al repo. La llave privada no está en el repositorio: se importa en el modo administrador (Ajustes del launcher, "Llave de firma de datos") y se guarda cifrada con `safeStorage`; publicar sin ella se bloquea. Para firmar a mano: `node tools/firmar-datos.js llave.PRIVADA.pem`. Quedan sin firmar `news`, `ads`, `team`, `events` y `nicks`, porque no deciden qué se descarga ni qué se ejecuta. Si alguien más publica, necesita la misma llave en su launcher. Tampoco cubre el canal de actualizaciones del propio launcher (GitHub Releases): quien controle la cuenta puede publicar una versión nueva; protege la cuenta con verificación en dos pasos y rama protegida.
2. **Login de Microsoft en el navegador.** Hoy se usa la ventana embebida de `msmc`; Nova PX no captura contraseñas propias ni envía tokens Microsoft/Xbox/Minecraft al Worker. Para cumplir el objetivo de aislamiento hay que migrar a Device Code o PKCE con navegador del sistema y validar el registro de aplicación.
3. **Nicks sin dueño verificado (resuelto para premium en 1.0.189).** Las cuentas premium verifican su nick con `sessionserver.mojang.com` (`join` desde el launcher con el token, `hasJoined` desde el Worker sin token): el dueño real recupera el nick y nadie más puede usarlo. Las cuentas no premium siguen con «el primero que lo reclama». Texto anterior: En amigos y chat, el primero que reclama un nick lo conserva. Verificarlo exigiría probar la propiedad de la cuenta de Minecraft sin enviar tokens al Worker; se puede hacer con un reto firmado a través de los servidores de sesión de Mojang.
4. **Dependencias y Electron.** `minecraft-launcher-core` depende de `request` (abandonado; SSRF por redirecciones, CVE-2023-28155) y de `uuid` 8 (GHSA-w5hq-g745-h8pq). Con `overrides` ahora usa `@cypress/request@4.0.1` (fork mantenido con la misma API: `request.defaults`, `get`/`post` con callback, `pipe`, eventos `response`/`data`, cookie jar), `uuid@11.1.1` (MCLC solo usa `v3`, que existe igual) y `adm-zip@0.6.1`. Resultado: 0 vulnerabilidades sin `npm audit fix --force`. Lo prueba `test/dependencias.test.js`: descarga de 200 KB con el `Handler` real de MCLC, 404, manifiesto JSON, cookie jar, form-data y el mismo uuid offline que antes. Riesgo restante: no se probó una instalación completa del juego; hacerlo en Windows (docs/PRUEBAS-WINDOWS.md, punto 2) antes de publicar. Si falla, se revierte quitando los dos overrides nuevos. Electron 33 ya no tiene soporte: subir de una versión mayor a la vez, probando login Microsoft, `safeStorage`, ventana superpuesta y auto-actualización.
5. **Rate Limiting de Cloudflare.** `wrangler.jsonc` configura `LIMITER` (120/min) y `ADMIN_LIMITER` (8/min); se aplican al desplegar. Son contadores aproximados **por ubicación de Cloudflare**, no un límite global estricto: son una capa más sobre `worker/limit.mjs` y el bloqueo de `ADMIN_KEY`. Lo que necesita exactitud (cuotas de PX) va con Durable Objects.
6. **Firma de artefactos Nova.** Implementada (ver «Firma de publicaciones Nova»). Falta que el dueño cree la llave y los secretos.
7. **Cuotas de PX.** Corregido en código: `PetQuota` (Durable Object, uno por día) revisa y suma los tres contadores (global, instalación, IP) de forma atómica; si uno está lleno no suma ninguno. **Falla cerrado:** sin el binding `QUOTA` el Worker responde 503 `quota_unavailable` y no llama al modelo ni usa KV; el launcher muestra «en mantenimiento». El KV `PET` queda sin uso (se puede quitar más adelante). **No desplegado.** El Worker PX en Cloudflare hoy no tiene `QUOTA` ni etiqueta de migración, y no tiene Workers Builds: unir el PR **no lo despliega**; hay que hacerlo a mano con `npx wrangler deploy --config worker/pet/wrangler.jsonc` (aplica la migración `v1` y crea `PetQuota`). Ojo: si se despliega solo el código sin la migración, PX con IA queda apagado (fail-closed).
13. **Rama de producción de Workers Builds.** Corregido el 27-11-2026 por decisión del dueño. Antes era `novapx-check-1794018615182`, una rama vieja sin proteger desde la que cualquiera con escritura podía desplegar producción. Ahora es `main` (comprobado por API: `branch_includes: ["main"]`), así que **unir a `main` despliega el Worker principal**. Producción no cambió al hacer el ajuste: sigue la versión 15 del 24-11. En GitHub, la regla «Proteger main (basica)» impide borrar `main` y forzar pushes, sin excepciones. No exige PR, porque el panel de administración publica en `main` con la API de contenidos. Falta borrar las ramas `novapx-check-*` (PR #4).
12. **Migración del Worker principal.** Corregido el 27-11-2026: una revisión anterior dijo que el script `nova-px-event-launcher` tenía `migration_tag` vacío. Era un error de lectura: ese campo no viene en `/settings`, solo en la lista de scripts, y ahí aparece `v1`. El namespace `Presence` es SQLite. `wrangler deploy` con la migración `v1` del repositorio no la repite. `tools/prueba-migracion-presence.sh` lo confirma en solo lectura y, con `--aislada`, en un Worker desechable (probado con API simulada en `test/prueba-migracion.test.js`). Quedan unos 37 namespaces `Presence` de Previews de ramas, que se borran con sus Previews.
10. **Enlaces externos.** `news`, `ads`, `team`, `events` y `nicks` no van firmados (los publican administradores). Para frenar phishing, `link:open` (`lib/links.js`) solo abre `https`, rechaza enlaces con usuario/clave y, fuera de una lista de sitios conocidos, pide confirmación mostrando el dominio real en punycode.
11. **Login de Microsoft.** Migrar a navegador del sistema (PKCE) o Device Code exige un *client id* propio de Azure con acceso aprobado a la API de Minecraft (Microsoft revisa cada app). Sin eso, el flujo actual de `msmc` es el único que funciona; no se cambió. Los tokens: refresh cifrado con `safeStorage`, access token solo en memoria, y `lib/redact.js` los quita de consola e informes.
8. **Revisión de historial y secretos.** La auditoría actual no pudo verificar cada commit histórico ni consultar valores de secretos. Se confirmó solo metadata de bindings: `ADMIN_KEY` existe como secreto en el Worker principal y el Worker PX usa binding Workers AI; no se leyeron valores.
9. **Llaves privadas.** Hay dos: la de soporte (`soporte-informes.PRIVADA.pem`, abre informes) y la de firma (`firma-datos.PRIVADA.pem`, firma los datos). Guárdalas en un gestor de contraseñas. Si se pierde la de soporte, los informes sellados no se pueden abrir. Si se pierde o se filtra la de firma, hay que generar otra, cambiar `config/firma-datos.pub.pem` y publicar una versión nueva del launcher; los launchers viejos no aceptarán los datos firmados con la nueva.

## Pruebas pendientes en Windows real
La lista completa (login Microsoft, safeStorage, juego y loaders, perfiles Nova, actualizaciones, enlaces, IPC, PX) está en `docs/PRUEBAS-WINDOWS.md`. Ninguna se puede hacer desde CI.
