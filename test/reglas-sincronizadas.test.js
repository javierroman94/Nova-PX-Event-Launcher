'use strict';
// AGENTS.md (ChatGPT/Codex y otros) y CLAUDE.md llevan las mismas reglas: todo desde «Este repositorio es» debe ser igual.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const body = (f) => { const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); const i = t.indexOf('Este repositorio es **público**'); assert.ok(i >= 0, `${f} sin el bloque común`); return t.slice(i); };
assert.strictEqual(body('AGENTS.md'), body('CLAUDE.md'), 'AGENTS.md y CLAUDE.md no están sincronizados');
console.log('reglas sincronizadas ok');
