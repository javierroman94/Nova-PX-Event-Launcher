'use strict';
/*
 * Cliente mínimo de la API de GitHub para el modo administrador: leer/escribir archivos JSON del repo
 * y subir archivos a un release. `fetchImpl` se inyecta para poder probarlo sin red.
 */
const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';

class GithubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class GithubRepo {
  constructor({ owner, repo, token, branch = 'main', fetchImpl = fetch, userAgent = 'Nova-PX-Event-Launcher' }) {
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Repositorio no válido.');
    Object.assign(this, { owner, repo, token, branch, fetchImpl, userAgent });
    this.base = `${API}/repos/${owner}/${repo}`;
  }

  async call(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': this.userAgent,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (data && data.message) || `HTTP ${res.status}`;
      if (res.status === 401) throw new GithubError(401, 'El token de GitHub no es válido o venció.');
      if (res.status === 403) throw new GithubError(403, `GitHub rechazó la acción (${msg}). Revisa los permisos del token.`);
      if (res.status === 404) throw new GithubError(404, 'GitHub no encontró el recurso: revisa el repositorio y que el token tenga acceso.');
      throw new GithubError(res.status, `GitHub respondió: ${msg}`);
    }
    return data;
  }

  // ¿Este token puede escribir en el repo? Solo entonces se desbloquea el modo administrador.
  async check() {
    const r = await this.call(this.base);
    // `permissions` describe a tu usuario, no al token: un token de solo lectura también diría push=true.
    // Por eso se prueba una escritura real y sin efectos: crear y borrar una rama temporal.
    let canPush = false;
    if (r.permissions && r.permissions.push) {
      try {
        const head = await this.call(`${this.base}/git/ref/heads/${encodeURIComponent(this.branch)}`);
        const name = `novapx-check-${Date.now()}`;
        await this.call(`${this.base}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${name}`, sha: head.object.sha } });
        await this.call(`${this.base}/git/refs/heads/${name}`, { method: 'DELETE' }).catch(() => {});
        canPush = true;
      } catch (err) {
        if (!(err instanceof GithubError) || (err.status !== 403 && err.status !== 404)) throw err;
      }
    }
    return { canPush, fullName: r.full_name };
  }

  async getJson(path) {
    try {
      const r = await this.call(`${this.base}/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
      return { sha: r.sha, data: JSON.parse(Buffer.from(r.content || '', 'base64').toString('utf8')) };
    } catch (err) {
      if (err instanceof GithubError && err.status === 404) return null;
      throw err;
    }
  }

  async putJson(path, data, message) {
    const current = await this.getJson(path).catch(() => null);
    return this.call(`${this.base}/contents/${path}`, {
      method: 'PUT',
      body: {
        message, branch: this.branch, ...(current ? { sha: current.sha } : {}),
        content: Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64')
      }
    });
  }

  // Sube o reemplaza un archivo binario (por ejemplo, la imagen de un evento).
  async putFile(path, buffer, message) {
    const current = await this.call(`${this.base}/contents/${path}?ref=${encodeURIComponent(this.branch)}`).catch((err) => {
      if (err instanceof GithubError && err.status === 404) return null;
      throw err;
    });
    return this.call(`${this.base}/contents/${path}`, {
      method: 'PUT',
      body: { message, branch: this.branch, content: Buffer.from(buffer).toString('base64'), ...(current && current.sha ? { sha: current.sha } : {}) }
    });
  }

  async ensureRelease(tag, name) {
    try {
      return await this.call(`${this.base}/releases/tags/${encodeURIComponent(tag)}`);
    } catch (err) {
      if (!(err instanceof GithubError) || err.status !== 404) throw err;
    }
    // Es un release aparte (no el del programa): se publica como "pre-release" para que no lo tome el actualizador.
    return this.call(`${this.base}/releases`, {
      method: 'POST',
      body: { tag_name: tag, name: name || tag, prerelease: true, target_commitish: this.branch, body: 'Archivos del modpack del evento (cifrados). Generado por el launcher.' }
    });
  }

  async uploadAsset(release, name, buffer) {
    for (const a of release.assets || []) {
      if (a.name === name) await this.call(`${this.base}/releases/assets/${a.id}`, { method: 'DELETE' });
    }
    return this.call(`${UPLOADS}/repos/${this.owner}/${this.repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
      method: 'POST', body: buffer, raw: true, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buffer.length) }
    });
  }

  downloadBase(tag) {
    return `https://github.com/${this.owner}/${this.repo}/releases/download/${encodeURIComponent(tag)}`;
  }
}

module.exports = { GithubRepo, GithubError };
