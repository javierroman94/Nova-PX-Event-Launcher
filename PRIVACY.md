# Privacy policy

Nova PX Event Launcher is an open-source Minecraft launcher. This page explains what data it handles.

**Stays on your computer**
- Your settings, modpacks, worlds, skins and saved accounts.
- Microsoft refresh tokens saved on disk are encrypted with your operating system's secure storage; access tokens stay in memory. Microsoft/Xbox/Minecraft tokens are never sent to Nova PX.

**Sent only if you allow it (Settings → share usage)**
- An anonymous usage counter: a random installation id, launcher version, operating system and a boolean indicating whether the signed-in account is premium. No Microsoft, Xbox or Minecraft token is sent. No IP address is stored for this usage counter.
- The player nickname, only if you sign in, so friends and online status work.

**Content updates**
- Every ~20 seconds the launcher asks a tiny public endpoint (a Nova PX Cloudflare Worker, or GitHub directly if "share usage" is off) for a revision code, to refresh news and events quickly after an administrator publishes. No personal data is sent.

**Friends and chat**
- If you use friends or chat, your nickname, friend list and messages are stored on a Nova PX server (Cloudflare) so they can be delivered. A separate random presence token is sent to authenticate your nickname; it is encrypted with safeStorage on your device and only its hash is stored on the server. It is not a Microsoft, Xbox or Minecraft token.
- Friends use a live connection to the Nova PX server while the launcher is open, so messages, requests, invitations and online status arrive instantly. Your status (available, away, do not disturb, invisible) and optional status text are visible only to your friends. Blocked players cannot send you requests or messages. Party and play invitations store only the nicknames involved, the event or modpack name, its share code and (for your own profiles) the server address to join, for 30 minutes.
- Nickname verification (premium accounts only): the launcher asks Mojang's official session server to confirm that you own the account, exactly as when joining a premium server. Your Minecraft access token is sent only to Mojang, never to Nova PX.
- Friend profile card: unless you turn off "Mostrar a mis amigos qué estoy jugando y mis horas jugadas" in Settings, your friends can see what you are playing (the event or modpack name) and your total hours played with the launcher. Turning it off removes it from the server.

**Sharing a modpack with a code (only when you press "Crear código")**
- The modpack name, Minecraft version, loader and the public Modrinth ids of its mods, resource packs and shaders are stored on a Nova PX server (Cloudflare) under a random 7-letter code for 90 days. No files, worlds, settings or account data are included.

**Server list ping**
- The "Servidores" tab and the server status ask each server in your list directly from your computer (the normal Minecraft "server list ping"), the same way the game's Multiplayer screen does.

**PX, the mascot (optional AI, off by default)**
- Rule-based PX runs fully on your computer. What it learns (visit counts, a few short facts) stays in this app's local storage and can be wiped with "Olvidar todo" in its chat.
- Only if you turn on "PX con IA" in Settings → Appearance: the messages you type to PX, a short summary of what PX remembers about you, and — only when you press "Revisar mi último error" — the last lines of a game error log are sent to a Nova PX server on Cloudflare, which answers using an AI model (Cloudflare Workers AI; Anthropic's Claude if the project owner enables it). Your user name, file paths, access tokens, UUIDs, e-mails and IP addresses are removed from logs before sending. Do not type personal data to PX.
- "PX con IA" is currently available only to launcher administrators. Regular users get the rule-based PX, which sends nothing.
- PX's care stats (hunger, level, name, accessories), its minigame record, and the optional "PX reacts to your game" feature (it reads the game's own log text on your computer to comment on deaths, advancements, servers and chat mentions) all stay on your computer. The optional floating PX window over Minecraft is drawn locally and sends nothing.
- The server does not store conversations or logs. It only counts messages per day (by a random id and by IP, expiring in 2 days) to enforce daily limits.

**Advertising**
- Ads show only the advertiser's name, image and link. The launcher counts views and clicks per ad (not per person).

**Third parties**
- Downloads come from Modrinth, CurseForge, Feed The Beast, Mojang, Microsoft, GitHub and Cloudflare, each under its own privacy policy.

**Contact and requests**
- To ask for your data to be deleted, open an issue at https://github.com/javierroman94/Nova-PX-Event-Launcher/issues

This project is not affiliated with Mojang or Microsoft.
