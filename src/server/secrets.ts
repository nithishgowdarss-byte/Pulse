import crypto from 'crypto';

/**
 * Encrypted-at-rest secret vault (AES-256-GCM). Ciphertexts are stored with app data;
 * the key comes from SECRETS_KEY (64 hex chars or base64 of 32 bytes) and never touches disk.
 */
export interface SealedSecret { v: 1; iv: string; tag: string; ct: string }

let cachedKey: Buffer | null = null;
export function getSecretsKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.SECRETS_KEY || '';
  let key: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else if (raw) { const b = Buffer.from(raw, 'base64'); if (b.length === 32) key = b; }
  if (!key) {
    if (process.env.NODE_ENV === 'production') throw new Error('SECRETS_KEY (32 bytes, hex or base64) is required in production');
    console.warn('[secrets] SECRETS_KEY not set; using an insecure fixed development key');
    key = crypto.createHash('sha256').update('pulse-dev-only-secrets-key').digest();
  }
  return (cachedKey = key);
}
export function _resetSecretsKeyForTests() { cachedKey = null; }

export function seal(plaintext: string, aad = ''): SealedSecret {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getSecretsKey(), iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
export function unseal(s: SealedSecret, aad = ''): string {
  const d = crypto.createDecipheriv('aes-256-gcm', getSecretsKey(), Buffer.from(s.iv, 'base64'));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(s.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(s.ct, 'base64')), d.final()]).toString('utf8');
}

/** Vault keyed by secret id; the id is bound as AAD so ciphertexts can't be swapped between entries. */
export function createVault(store: () => Record<string, SealedSecret>) {
  return {
    put(id: string, plaintext: string) { store()[id] = seal(plaintext, id); },
    get(id: string | null | undefined): string | null {
      if (!id) return null;
      const s = store()[id];
      if (!s) return null;
      try { return unseal(s, id); } catch { return null; }
    },
    remove(id: string | null | undefined) { if (id) delete store()[id]; },
    has(id: string | null | undefined) { return !!id && !!store()[id]; },
  };
}
