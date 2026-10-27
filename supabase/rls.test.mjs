// Validates the Supabase migration and its Row Level Security using PGlite (Postgres in WASM)
// with minimal stand-ins for Supabase's auth/storage schemas. Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const db = new PGlite({ extensions: { pgcrypto } });

await db.exec(`
  create role authenticated nologin;
  create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create publication supabase_realtime;
  -- Like Supabase: extensions live in their own schema, not public.
  create schema extensions;
  create extension pgcrypto schema extensions;
`);

for (const f of readdirSync(join(here, 'migrations')).sort()) {
  await db.exec(readFileSync(join(here, 'migrations', f), 'utf8'));
  console.log('applied', f);
}

await db.exec(`
  -- Public-schema access must come from the migrations themselves (newer Supabase projects don't auto-grant).
  revoke all on all tables in schema public from public;
  grant usage on schema storage, auth to authenticated;
  grant all on all tables in schema storage to authenticated;
  grant execute on all functions in schema auth, storage to authenticated;
`);

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users values ('${A}'), ('${B}'), ('${C}')`);

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// A creates a household, B joins via invite code, C is an outsider.
const hid = await as(A, async () => (await one(`select public.create_household('Smith move', 'Alex') as id`)).id);
const code = (await one(`select invite_code from households where id = $1`, [hid])).invite_code;
assert.match(code, /^[0-9A-F]{8}$/);
await as(B, () => db.query(`select public.join_household($1, 'Blair')`, [code.toLowerCase()]));
await assert.rejects(as(C, () => db.query(`select public.join_household('NOPE1234', 'Casey')`)), /Invalid invite code/);

// Insert data as A, read as B.
const taskId = '11111111-1111-1111-1111-111111111111';
await as(A, () => db.query(`insert into tasks (id, household_id, title, updated_at) values ($1, $2, 'Book movers', '2027-01-01T00:00:00.000Z')`, [taskId, hid]));
const seenByB = await as(B, () => db.query(`select title, server_updated_at from tasks`));
assert.equal(seenByB.rows.length, 1);
assert.equal(seenByB.rows[0].title, 'Book movers');

// Outsider sees nothing and cannot write.
assert.equal((await as(C, () => db.query(`select * from tasks`))).rows.length, 0);
assert.equal((await as(C, () => db.query(`select * from households`))).rows.length, 0);
await assert.rejects(as(C, () => db.query(`insert into tasks (id, household_id, title) values (gen_random_uuid(), $1, 'hack')`, [hid])), /row-level security/);
const upd = await as(C, () => db.query(`update tasks set title = 'hacked' where id = $1`, [taskId]));
assert.equal(upd.affectedRows ?? 0, 0);

// B updates; server_updated_at advances (pull cursor).
const before = seenByB.rows[0].server_updated_at;
await as(B, () => db.query(`update tasks set title = 'Book movers ✅' where id = $1`, [taskId]));
const after = await as(A, () => one(`select title, server_updated_at from tasks where id = $1`, [taskId]));
assert.equal(after.title, 'Book movers ✅');
assert.ok(after.server_updated_at > before);

// Upsert (what the client sync does) works for members.
await as(A, () =>
  db.query(
    `insert into items (id, household_id, name, photos) values ($1, $2, 'Couch', '[{"id":"p1","remotePath":"x"}]'::jsonb)
     on conflict (id) do update set name = excluded.name`,
    ['22222222-2222-2222-2222-222222222222', hid],
  ),
);

// Storage policies: members can upload into their household folder only.
await as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${hid}/photo.jpg`]));
await assert.rejects(as(C, () => db.query(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${hid}/evil.jpg`])), /row-level security/);
assert.equal((await as(C, () => db.query(`select * from storage.objects`))).rows.length, 0);
assert.equal((await as(B, () => db.query(`select * from storage.objects`))).rows.length, 1);

// Viewers cannot write.
await db.query(`update household_members set role = 'viewer' where user_id = $1`, [B]);
await assert.rejects(as(B, () => db.query(`insert into tasks (id, household_id, title) values (gen_random_uuid(), $1, 'x')`, [hid])), /row-level security/);

console.log('✔ Supabase schema & RLS checks passed');
