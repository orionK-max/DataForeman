import { strict as assert } from 'assert';

// Updated to use system_settings table with composite keys (namespace.key)
export async function getConfig(app, namespace, key, defaultValue = undefined) {
  assert(app.db, 'db not ready');
  const compositeKey = `${namespace}.${key}`;
  const { rows } = await app.db.query('select value from system_settings where key=$1', [compositeKey]);
  if (rows.length === 0) return defaultValue;
  return rows[0].value;
}

export async function setConfig(app, namespace, key, value) {
  assert(app.db, 'db not ready');
  const compositeKey = `${namespace}.${key}`;
  await app.db.query(
    'insert into system_settings(key, value) values ($1,$2) on conflict(key) do update set value=excluded.value, updated_at=now()',
    [compositeKey, value]
  );
}
