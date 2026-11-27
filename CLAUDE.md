# Nova PX Event Launcher — reglas para trabajar en este repositorio

Este repositorio es **público**. Todo lo que se suba lo puede leer cualquiera, y quien tome el repositorio o la cuenta de administrador puede intentar repartir código a todos los jugadores. Trabaja con eso en mente.

## Flujo de cambios

- Nunca hagas push directo a `main`. Trabaja en una rama `revision-<tema>` y abre un Pull Request.
- No fusiones Pull Requests ni publiques versiones sin autorización explícita del dueño.
- No cambies versiones, etiquetas ni archivos de datos firmados durante una auditoría.

## Mensajes de commit (obligatorio)

- Una sola línea, en español, de **máximo 65 caracteres**, que diga exactamente qué cambió.
- **Prohibido** el formato Conventional Commits: nada de `feat(auth): ...`, `fix(ui): ...` ni `chore(deps): ...`.
- **Prohibidos** los títulos inflados, robóticos o con jerga artificial. Nada de listas eternas en el título.
- Si hace falta detallar, va en el cuerpo del commit con viñetas breves, nunca en el título.
- Ejemplos correctos:
  - `Cifra los tokens de sesion con safeStorage de Electron`
  - `Elimina llaves expuestas en la configuracion del worker`
  - `Agrega validacion SHA-256 al instalar packs de eventos`

## Seguridad (obligatorio)

### Secretos y repositorio
- Nunca se suben al repositorio: tokens, claves de API, webhooks, contraseñas, llaves privadas, `.env` ni `.dev.vars`. El `.gitignore` ya bloquea `*.PRIVADA.pem`, `*.key.pem`, `.env` y `.dev.vars`.
- Los secretos del Worker viven en Cloudflare, nunca en `wrangler.jsonc` ni en el código: `ADMIN_KEY` es obligatorio y `ANTHROPIC_KEY` solo se configura si PX usa Anthropic en vez del binding Workers AI.
- Fija las GitHub Actions a SHA completo e inmutable; no uses etiquetas movibles como `@v4` en workflows de publicación.
- Los flujos automáticos (como «Lista del loader Nova») no suben a `main`: abren un Pull Request en una rama propia.
- Antes de cada commit revisa el diff buscando claves, URLs privadas y datos personales.
- `config/launcher.config.json` es público: solo configuración, jamás credenciales.

### Cuentas y sesión
- El login actual usa OAuth de Microsoft mediante `msmc` en una ventana embebida; Nova PX no captura ni procesa contraseñas propias. Este flujo no equivale a Device Code/PKCE con navegador del sistema: la migración sigue pendiente y no debe afirmarse cumplimiento completo.
- Los tokens de Microsoft, Xbox y Minecraft **nunca** salen de la máquina hacia el Worker, telemetría, logs ni informes. Lo que se envía al Worker es solo: id de instalación aleatorio, nick, si es premium, versión y sistema.
- Toda credencial bearer local, incluido el token de presencia de amigos, se cifra con `safeStorage`. Si no hay almacén seguro (en Linux, `basic_text` no cuenta), la función que necesita el token se desactiva; nunca se guarda en texto plano ni se usa una llave fija.
- Todo texto que vaya a consola, informes o PX pasa por redacción local y el Worker vuelve a rechazar patrones de credenciales en los registros. `minecraft-launcher-core` puede imprimir argumentos del juego: no agregues logs de tokens ni de cabeceras Authorization.

### Cifrado y descargas
- Nunca llaves hardcodeadas. Los eventos protegidos usan una llave derivada de la contraseña (scrypt) con AES-256-GCM; los sobres nuevos usan `KDF_STRONG` y guardan sus parámetros en `kdf`.
- Los informes de eventos protegidos se sellan con la llave pública de `config/soporte-informes.pub.pem`. La privada no está en el repositorio; se abre con `node tools/abrir-informe.js`.
- Los manifiestos nuevos de mods usan SHA-256 preferentemente; SHA-1 se conserva solo para manifiestos antiguos. Nova Client verifica el digest SHA-256 publicado en el asset de GitHub. Para resistir un compromiso de la cuenta/repositorio, sigue siendo necesaria una firma asimétrica del artefacto con la privada fuera del repo.
- `manifest`, `plugins`, `recommended`, `launcher` y `admins` de `data/` se firman con Ed25519 (`lib/firma.js`). La llave privada nunca va al repositorio. `data/nova-loader.json` y el manifiesto de cada release de Nova Client se firman con otra llave Ed25519 (`config/nova-firma.pub.pem`, privada solo como secreto `NOVA_FIRMA_PRIVADA` de GitHub Actions). Mientras esa pública no esté en el repo, no están autenticados (solo SHA-512 / digest de GitHub): no los presentes como protegidos. Con la pública instalada (`tools/instalar-llave-publica-nova.js`) una firma presente se verifica, pero solo es obligatoria con `"novaFirmaObligatoria": true` en `config/launcher.config.json`. Ver `docs/SEGURIDAD.md`, «Firma de publicaciones Nova».

### Electron
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity` activo en **toda** ventana propia.
- La CSP de `renderer/index.html` no admite `unsafe-inline` ni `unsafe-eval` en scripts. No agregues scripts ni estilos en línea.
- Toda ventana propia pasa por `lockWindow()` en `main.js` (bloquea `will-navigate` y `will-redirect`, sin navegación fuera de `renderer/`, sin `<webview>`). Los enlaces externos solo se abren si son `https` (`link:open`, `setWindowOpenHandler`); fuera de los sitios conocidos de `lib/links.js` se pide confirmación mostrando el dominio.
- Los canales IPC se registran con `ipcMain.handle`; `lib/ipc-guard.js` valida el origen y exige el marco principal. **Valida todos los parámetros** en el handler: tipos, longitudes, formato de ids y rutas. Nunca construyas una ruta con un valor del renderer sin comprobar que queda dentro de su carpeta.
- El modo administrador tiene permisos por rol (`lib/permisos.js`): dueño, administrador y moderador, más casillas por persona. Toda acción nueva del panel debe tener su permiso en `CANALES` y su pestaña en `PESTANAS`; si no, solo pide ser administrador. `data/admins.json` va firmado, así que cambiar roles requiere la llave de firma del dueño.
- Lo que viene de internet (manifests, nombres de mods, textos) se trata como no confiable: se sanea al leer. En el renderer usa `textContent`; evita `innerHTML` con datos externos.
- Los comandos previos y posteriores (`preLaunch`, `postExit`) son solo de este equipo: nunca viajan en un modpack exportado ni importado.

### Worker de Cloudflare
- Las rutas administrativas exigen `ADMIN_KEY` como secreto de Cloudflare y usan `ADMIN_LIMITER` además del contador local. Las rutas públicas usan `LIMITER` y límites por ruta.
- Los Rate Limiting bindings de Cloudflare son aproximados por ubicación; no equivalen a un contador global estricto. Para cuotas globales atómicas, usa Durable Objects (el Worker PX usa `PetQuota` y falla cerrado sin el binding `QUOTA`).
- El Worker principal tiene Workers Builds: cada rama crea un Preview y la rama de producción de Cloudflare despliega producción (hoy mal configurada, ver `docs/SEGURIDAD.md` punto 13). El Worker PX no tiene Workers Builds y se despliega a mano. Nunca despliegues producción desde una auditoría.
- Nada que escriba en KV sin límite ni sin validar el contenido. Los incrementos `get` + `put` en KV no son atómicos y no sirven como cuota estricta bajo concurrencia.

### Dependencias
- Revisa `npm audit --omit=dev` antes de publicar. Con los `overrides` de `package.json` (`adm-zip@0.6.1`, `form-data@2.5.6`, `qs@6.17`, `tough-cookie@4.1.4`; probados en `test/dependencias.test.js`) quedan 3 moderadas sin arreglo compatible (`request`, su `uuid` y `minecraft-launcher-core` por depender de ellas). No quites esos overrides ni uses `npm audit fix --force`; para el resto hay que reemplazar `minecraft-launcher-core` y probar el juego completo.

## Trabajo diario

- Pruebas: `npm test`. Estilo: `npm run lint` (referencia: 14 advertencias, 0 errores). Arranque simulado: `npm run smoke`; verifica que realmente se ejecute, porque sin Playwright el script puede omitir la prueba. Valida ambos Workers con `wrangler deploy --dry-run` antes de publicar.
- Publicar una versión: sube la versión en `package.json` y `package-lock.json`, agrega la entrada en `CHANGELOG.md` (`## 1.0.X`, en español), fusiona en `main` y crea la etiqueta `vX`. El flujo "Publicar versión" se dispara con el push a `main`. **Solo se publica cuando el dueño lo pide.**
- Español informal en la interfaz y en los mensajes. El dueño no tiene máquina de desarrollo: se prueba con las pruebas y capturas automatizadas.
