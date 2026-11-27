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

## Firma de publicaciones Nova (rama revision-seguridad-pendientes)
Hay una **segunda llave Ed25519**, solo para lo que se publica en automático: `data/nova-loader.json` (tarea semanal) y el manifiesto de cada release de Nova Client. Va separada de la llave de datos (`firma-datos`) para que la del dueño nunca tenga que estar en GitHub.

- **Pública:** `config/nova-firma.pub.pem` (va dentro del launcher; no se descarga, así que una lista o release alterada no puede cambiarla). **Todavía no existe:** mientras falte, todo funciona como hasta 1.0.193 (lista sin firma, Nova Client con el digest SHA-256 de GitHub).
- **Privada:** solo como secreto `NOVA_FIRMA_PRIVADA` (PEM) en los dos repositorios: `Nova-PX-Event-Launcher` y `Nova-Client`. Nunca en un archivo del repo.
- **Lista del loader:** `.github/workflows/nova-loader.yml` firma con `tools/firmar-nova.js` → `data/nova-loader.firma.json`. El launcher la lee con `lib/data-firmada.js` (`nombre: "nova-loader"`): con llave pública, firma obligatoria y no más vieja que la última vista.
- **Nova Client:** `tools/firmar-release.js` (repo Nova-Client) sube `nova-client.json` (`{ v: 1, version, files: { nombre: sha256 } }`) y `nova-client.firma.json`. `lib/nova.js` (`releaseHashes`) verifica la firma y usa **esas** huellas para el `.jar` y `Nova-Pack.zip`, no las de GitHub.
- Mensaje firmado (igual que `lib/firma.js`): `NPX-DATA1\n<nombre>\n<firmadoEn>\n<sha256>`. Solo se aceptan llaves Ed25519 y `alg` ausente o `ed25519`.

**Cómo activarlo (lo hace el dueño, en su PC):**
1. `openssl genpkey -algorithm ed25519 -out nova-firma.PRIVADA.pem` y `openssl pkey -in nova-firma.PRIVADA.pem -pubout -out nova-firma.pub.pem`. Guarda la privada en un gestor de contraseñas.
2. En GitHub, en **los dos** repositorios: Settings → Secrets and variables → Actions → *New repository secret* `NOVA_FIRMA_PRIVADA` con el contenido completo del PEM privado.
3. En Nova-Client: unir el PR de firma y publicar una versión (sale con manifiesto firmado). Opcional: variable `NOVA_FIRMA_OBLIGATORIA=true` para que una release sin secreto falle.
4. En el launcher: ejecutar a mano «Lista del loader Nova» (crea `nova-loader.firma.json`), subir `config/nova-firma.pub.pem` y publicar una versión. Desde esa versión la firma es obligatoria.
5. Orden importante: primero las firmas (pasos 3 y 4), después el launcher con la pública. Si se publica el launcher antes, los perfiles Nova no podrán instalar Nova Client hasta que haya una release firmada.

Si la privada se filtra: generar otra, cambiar los secretos y `config/nova-firma.pub.pem`, y publicar una versión del launcher.

## Loader Nova (1.0.190)
- `data/nova-loader.json` lo arma una tarea de GitHub (`tools/nova-loader.js`) y no va firmado: el launcher solo acepta enlaces `https://cdn.modrinth.com/data/…`, nombres de archivo seguros y huella SHA-512 de cada `.jar`. SHA-512 comprueba el archivo descargado, pero no autentica el catálogo: alguien con capacidad de modificar el repositorio podría cambiar catálogo, URL y huella. Requiere firma asimétrica.
- Si la huella no coincide no se instala nada. Al actualizar solo se tocan los archivos que puso Nova (y otras copias de esos mismos mods).

## Permisos por rol
El panel de administración tiene tres roles: Dueño (todo), Administrador (todo menos Permisos y la llave de firma) y Moderador (advertencias, usuarios y noticias), más casillas por persona. Se comprueban en el programa en cada acción y ocultan las pestañas que no corresponden. Límite: quien tenga un token de GitHub con escritura puede escribir en el repositorio sin pasar por el launcher. Lo protege la firma: `manifest`, `plugins`, `recommended`, `launcher` y `admins` solo son válidos si los firma el dueño. `news`, `ads`, `team`, `events` y `nicks` no están firmados. Aunque no deciden qué se descarga ni ejecuta, un atacante con escritura en el repo podría publicar enlaces HTTPS de phishing; la sanitización evita esquemas peligrosos, pero no es una lista de dominios permitidos.

## Pendiente (decisión del dueño)
1. **Fallo abierto si falta la llave pública.** Corregido (PR #5, integrado en esta rama): con firma obligatoria y sin llave pública se rechaza. Además se rechazan llaves que no son Ed25519 y firmas con `alg` distinto; hay pruebas para firma ausente, mala, de otro archivo, con datos cambiados, formato desconocido y llave RSA. Las firmas Ed25519 de `manifest`, `plugins`, `recommended`, `launcher` y `admins` siguen siendo el mecanismo correcto; la llave privada no debe ir al repo. La llave privada no está en el repositorio: se importa en el modo administrador (Ajustes del launcher, "Llave de firma de datos") y se guarda cifrada con `safeStorage`; publicar sin ella se bloquea. Para firmar a mano: `node tools/firmar-datos.js llave.PRIVADA.pem`. Quedan sin firmar `news`, `ads`, `team`, `events` y `nicks`, porque no deciden qué se descarga ni qué se ejecuta. Si alguien más publica, necesita la misma llave en su launcher. Tampoco cubre el canal de actualizaciones del propio launcher (GitHub Releases): quien controle la cuenta puede publicar una versión nueva; protege la cuenta con verificación en dos pasos y rama protegida.
2. **Login de Microsoft en el navegador.** Hoy se usa la ventana embebida de `msmc`; Nova PX no captura contraseñas propias ni envía tokens Microsoft/Xbox/Minecraft al Worker. Para cumplir el objetivo de aislamiento hay que migrar a Device Code o PKCE con navegador del sistema y validar el registro de aplicación.
3. **Nicks sin dueño verificado (resuelto para premium en 1.0.189).** Las cuentas premium verifican su nick con `sessionserver.mojang.com` (`join` desde el launcher con el token, `hasJoined` desde el Worker sin token): el dueño real recupera el nick y nadie más puede usarlo. Las cuentas no premium siguen con «el primero que lo reclama». Texto anterior: En amigos y chat, el primero que reclama un nick lo conserva. Verificarlo exigiría probar la propiedad de la cuenta de Minecraft sin enviar tokens al Worker; se puede hacer con un reto firmado a través de los servidores de sesión de Mojang.
4. **Dependencias y Electron.** Con `overrides` en `package.json`, `request` (dentro de `minecraft-launcher-core`) usa `form-data@2.5.6` y `qs@6.17` corregidos: desaparecen las 2 críticas. Quedan 5 (2 altas, 3 moderadas): `adm-zip` (sin arreglo; MCLC lo usa para extraer los natives de Mojang, verificados por SHA-1), `request` (abandonado), `tough-cookie` y `uuid` (sus versiones corregidas rompen la API que usa `request`; MCLC no usa cookies). Plan por etapas: (a) reemplazar MCLC por un lanzador propio o `@xmcl/core`, probado en Windows con Vanilla, Fabric, Forge y NeoForge; (b) Electron 33 ya no tiene soporte: subir de una versión mayor a la vez hasta una con soporte, probando login Microsoft (`msmc` usa una ventana de Electron), `safeStorage`, ventana superpuesta y auto-actualización. No ejecutar `npm audit fix --force`.
5. **Rate Limiting de Cloudflare.** `wrangler.jsonc` configura `LIMITER` (120/min) y `ADMIN_LIMITER` (8/min); se aplican al desplegar. Son contadores aproximados **por ubicación de Cloudflare**, no un límite global estricto: son una capa más sobre `worker/limit.mjs` y el bloqueo de `ADMIN_KEY`. Lo que necesita exactitud (cuotas de PX) va con Durable Objects.
6. **Firma de artefactos Nova.** Implementada (ver «Firma de publicaciones Nova»). Falta que el dueño cree la llave y los secretos.
7. **Cuotas de PX.** Corregido en código: `PetQuota` (Durable Object, uno por día) revisa y suma los tres contadores (global, instalación, IP) de forma atómica; si uno está lleno no suma ninguno. Sin el binding `QUOTA` el Worker vuelve a KV. Requiere desplegar el Worker PX con la migración `v1` de `worker/pet/wrangler.jsonc` (no desplegado).
10. **Enlaces externos.** `news`, `ads`, `team`, `events` y `nicks` no van firmados (los publican administradores). Para frenar phishing, `link:open` (`lib/links.js`) solo abre `https`, rechaza enlaces con usuario/clave y, fuera de una lista de sitios conocidos, pide confirmación mostrando el dominio real en punycode.
11. **Login de Microsoft.** Migrar a navegador del sistema (PKCE) o Device Code exige un *client id* propio de Azure con acceso aprobado a la API de Minecraft (Microsoft revisa cada app). Sin eso, el flujo actual de `msmc` es el único que funciona; no se cambió. Los tokens: refresh cifrado con `safeStorage`, access token solo en memoria, y `lib/redact.js` los quita de consola e informes.
8. **Revisión de historial y secretos.** La auditoría actual no pudo verificar cada commit histórico ni consultar valores de secretos. Se confirmó solo metadata de bindings: `ADMIN_KEY` existe como secreto en el Worker principal y el Worker PX usa binding Workers AI; no se leyeron valores.
9. **Llaves privadas.** Hay dos: la de soporte (`soporte-informes.PRIVADA.pem`, abre informes) y la de firma (`firma-datos.PRIVADA.pem`, firma los datos). Guárdalas en un gestor de contraseñas. Si se pierde la de soporte, los informes sellados no se pueden abrir. Si se pierde o se filtra la de firma, hay que generar otra, cambiar `config/firma-datos.pub.pem` y publicar una versión nueva del launcher; los launchers viejos no aceptarán los datos firmados con la nueva.
