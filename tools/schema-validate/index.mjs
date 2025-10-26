import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../../spec/connectivity');
const schemaDir = resolve(root, 'schemas');
const fixturesDir = resolve(root, 'fixtures');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
// Add 2020-12 meta-schema so schemas referencing it validate
ajv.addMetaSchema({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://json-schema.org/draft/2020-12/schema'
});

// Load schemas and map by their schema const value ($id is informational here)
const schemas = {};
for (const file of readdirSync(schemaDir)) {
  if (!file.endsWith('.schema.json')) continue;
  const p = resolve(schemaDir, file);
  const obj = JSON.parse(readFileSync(p, 'utf8'));
  const idConst = obj?.properties?.schema?.const;
  if (!idConst) throw new Error(`Schema missing properties.schema.const: ${file}`);
  schemas[idConst] = obj;
  ajv.addSchema(obj, idConst);
}

function validateFixture(name) {
  const p = resolve(fixturesDir, name);
  const obj = JSON.parse(readFileSync(p, 'utf8'));
  const key = obj?.schema;
  if (!key || !schemas[key]) throw new Error(`Fixture ${name} has unknown schema '${key}'`);
  const validate = ajv.getSchema(key);
  const ok = validate(obj);
  if (!ok) {
    console.error(`FAIL ${name}`);
    console.error(validate.errors);
    return false;
  }
  console.log(`OK   ${name}`);
  return true;
}

let allOk = true;
for (const f of readdirSync(fixturesDir)) {
  if (!f.endsWith('.json')) continue;
  allOk = validateFixture(f) && allOk;
}

if (!allOk) process.exit(1);
console.log('All fixtures validated successfully.');
