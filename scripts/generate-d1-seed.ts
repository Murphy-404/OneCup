import { writeFile } from 'node:fs/promises';
import { recipes } from '../src/data';
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const statements = recipes.map((recipe, i) => `INSERT INTO recipe_catalog(id,position,payload) VALUES (${quote(recipe.id)},${i},${quote(JSON.stringify(recipe))}) ON CONFLICT(id) DO UPDATE SET position=excluded.position,payload=excluded.payload;`);
await writeFile('cloudflare/seed.sql', '-- Generated from src/data.ts; no user data or credentials.\n' + statements.join('\n') + '\n');
console.log(`Generated D1 seed for ${recipes.length} recipes.`);
