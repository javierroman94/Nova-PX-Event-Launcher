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

## Loader Nova (1.0.190)
- `data/nova-loader.json` lo arma una tarea de GitHub (`tools/nova-loader.js`) y no va firmado: el launcher solo acepta enlaces `https://cdn.modrinth.com/data/…`, nombres de archivo seguros y huella SHA-512 de cada `.jar`. SHA-512 comprueba el archivo descargado, pero no autentica el catálogo: alguien con capacidad de modificar el repositorio podría cambiar catálogo, URL y huella. Requiere firma asimétrica.
- Si la huella no coincide no se instala nada. Al actualizar solo se tocan los archivos que puso Nova (y otras copias de esos mismos mods).

## Permisos por rol
El panel de administración tiene tres roles: Dueño (todo), Administrador (todo menos Permisos y la llave de firma) y Moderador (advertencias, usuarios y noticias), más casillas por persona. Se comprueban en el programa en cada acción y ocultan las pestañas que no corresponden. Límite: quien tenga un token de GitHub con escritura puede escribir en el repositorio sin pasar por el launcher. Lo protege la firma: `manifest`, `plugins`, `recommended`, `launcher` y `admins` solo son válidos si los firma el dueño. `news`, `ads`, `team`, `events` y `nicks` no están firmados. Aunque no deciden qué se descarga ni ejecuta, un atacante con escritura en el repo podría publicar enlaces HTTPS de phishing; la sanitización evita esquemas peligrosos, pero no es una lista de dominios permitidos.

## Pendiente (decisión del dueño)
1. **Fallo abierto si falta la llave pública.** En `lib/data-firmada.js`, si falta la llave pública, la versión de `main` devuelve el JSON sin verificar aunque la firma sea obligatoria. El PR #5 contiene la corrección para rechazar ese caso, pero aún debe integrarse. Las firmas Ed25519 de `manifest`, `plugins`, `recommended`, `launcher` y `admins` siguen siendo el mecanismo correcto; la llave privada no debe ir al repo. La llave privada no está en el repositorio: se importa en el modo administrador (Ajustes del launcher, "Llave de firma de datos") y se guarda cifrada con `safeStorage`; publicar sin ella se bloquea. Para firmar a mano: `node tools/firmar-datos.js llave.PRIVADA.pem`. Quedan sin firmar `news`, `ads`, `team`, `events` y `nicks`, porque no deciden qué se descarga ni qué se ejecuta. Si alguien más publica, necesita la misma llave en su launcher. Tampoco cubre el canal de actualizaciones del propio launcher (GitHub Releases): quien controle la cuenta puede publicar una versión nueva; protege la cuenta con verificación en dos pasos y rama protegida.
2. **Login de Microsoft en el navegador.** Hoy se usa la ventana embebida de `msmc`; Nova PX no captura contraseñas propias ni envía tokens Microsoft/Xbox/Minecraft al Worker. Para cumplir el objetivo de aislamiento hay que migrar a Device Code o PKCE con navegador del sistema y validar el registro de aplicación.
3. **Nicks sin dueño verificado (resuelto para premium en 1.0.189).** Las cuentas premium verifican su nick con `sessionserver.mojang.com` (`join` desde el launcher con el token, `hasJoined` desde el Worker sin token): el dueño real recupera el nick y nadie más puede usarlo. Las cuentas no premium siguen con «el primero que lo reclama». Texto anterior: En amigos y chat, el primero que reclama un nick lo conserva. Verificarlo exigiría probar la propiedad de la cuenta de Minecraft sin enviar tokens al Worker; se puede hacer con un reto firmado a través de los servidores de sesión de Mojang.
4. **Dependencias y Electron.** `npm audit --omit=dev` reportó 7 vulnerabilidades de producción: 3 moderadas, 2 altas y 2 críticas (`request`, `form-data`, `adm-zip`, `qs`, `tough-cookie`, `uuid`) en la cadena de `minecraft-launcher-core`. Electron 33 ya no tiene soporte. Reemplazar/parchear MCLC y actualizar Electron requiere pruebas completas del juego; no ejecutar `npm audit fix --force`.
5. **Rate Limiting de Cloudflare.** La rama de auditoría configura `LIMITER` y `ADMIN_LIMITER`; se aplican al desplegarla. Cloudflare advierte que sus contadores son aproximados y se aplican por ubicación; una cuota global estricta requiere Durable Objects.
6. **Firma de artefactos Nova.** `lib/nova.js` verifica el digest SHA-256 publicado por GitHub, pero ese digest no protege si se compromete también el repositorio de Releases. Se necesita firma Ed25519 del JAR con llave privada fuera del repo. `data/nova-loader.json` también requiere firma.
7. **Cuotas de PX.** `worker/pet/index.mjs` incrementa contadores con `get` + `put` en KV; no es atómico bajo concurrencia. Migrar cuotas globales/por usuario a Durable Objects.
8. **Revisión de historial y secretos.** La auditoría actual no pudo verificar cada commit histórico ni consultar valores de secretos. Se confirmó solo metadata de bindings: `ADMIN_KEY` existe como secreto en el Worker principal y el Worker PX usa binding Workers AI; no se leyeron valores.
9. **Llaves privadas.** Hay dos: la de soporte (`soporte-informes.PRIVADA.pem`, abre informes) y la de firma (`firma-datos.PRIVADA.pem`, firma los datos). Guárdalas en un gestor de contraseñas. Si se pierde la de soporte, los informes sellados no se pueden abrir. Si se pierde o se filtra la de firma, hay que generar otra, cambiar `config/firma-datos.pub.pem` y publicar una versión nueva del launcher; los launchers viejos no aceptarán los datos firmados con la nueva.
