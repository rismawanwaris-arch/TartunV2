// Pembuatan & verifikasi API key untuk endpoint ingest.
// Format key: "tk_" + 43 karakter base64url (32 byte acak). 12 karakter pertama
// disimpan sebagai prefix untuk pencarian; yang disimpan hanya hash SHA-256-nya.
const crypto = require('crypto');

const KEY_PREFIX_LENGTH = 12;

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey() {
  const key = `tk_${crypto.randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, KEY_PREFIX_LENGTH), hash: hashKey(key) };
}

function keyMatches(key, storedHash) {
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Baris api_keys yang aktif untuk key ini, atau null.
async function findActiveKey(db, key) {
  if (typeof key !== 'string' || !key.startsWith('tk_') || key.length < 20) return null;
  const row = await db.getAsync(
    'SELECT id, name, key_hash FROM api_keys WHERE key_prefix = ? AND revoked_at IS NULL',
    [key.slice(0, KEY_PREFIX_LENGTH)]
  );
  return row && keyMatches(key, row.key_hash) ? { id: row.id, name: row.name } : null;
}

module.exports = { KEY_PREFIX_LENGTH, generateApiKey, findActiveKey };
