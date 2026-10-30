import { readFile, writeFile } from 'node:fs/promises';

// A database ID is configuration, not a credential. Never accept an API token here.
const [id] = process.argv.slice(2);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
  throw new Error('Usage: node scripts/configure-cloudflare.mjs <real D1 database UUID>');
}
const path = new URL('../wrangler.json', import.meta.url);
const config = JSON.parse(await readFile(path, 'utf8'));
config.d1_databases.find(db => db.binding === 'DB').database_id = id;
await writeFile(path, JSON.stringify(config, null, 2) + '\n');
console.log('D1 binding configured. Rebuild before deployment. No secrets were written.');
