import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULTS } from './schemas';
import type { KV, RemoteAdapter } from './store';
import type { BaseRow, MediaRef, TableName } from './types';
import { TABLES } from './types';

export const MEDIA_BUCKET = 'media';

export function createSupabase(url: string, anonKey: string, storage?: KV): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      storage: storage as never,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: typeof window !== 'undefined' && typeof document !== 'undefined',
    },
  });
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface HouseholdMember {
  user_id: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export async function listHouseholds(sb: SupabaseClient): Promise<Household[]> {
  const { data, error } = await sb.from('household_members').select('role, households(id, name, invite_code)');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const h = r.households as unknown as { id: string; name: string; invite_code: string };
    return { id: h.id, name: h.name, invite_code: h.invite_code, role: r.role as Household['role'] };
  });
}

export async function createHousehold(sb: SupabaseClient, name: string, displayName: string): Promise<string> {
  const { data, error } = await sb.rpc('create_household', { p_name: name, p_display_name: displayName });
  if (error) throw error;
  return data as string;
}

export async function joinHousehold(sb: SupabaseClient, code: string, displayName: string): Promise<string> {
  const { data, error } = await sb.rpc('join_household', { p_code: code.trim().toUpperCase(), p_display_name: displayName });
  if (error) throw error;
  return data as string;
}

export async function listHouseholdMembers(sb: SupabaseClient, householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await sb.from('household_members').select('user_id, display_name, role, joined_at').eq('household_id', householdId);
  if (error) throw error;
  return data ?? [];
}

/** Saves your name on the shared move so the family sees "Mike", not an email. */
export async function setMyDisplayName(sb: SupabaseClient, householdId: string, userId: string, name: string): Promise<void> {
  const { error } = await sb.from('household_members').update({ display_name: name }).eq('household_id', householdId).eq('user_id', userId);
  if (error) throw error;
}

/**
 * Turns whatever was saved as "who did it" into a first name: an email becomes the matching
 * family member's name, or a tidy version of the part before the @.
 */
export function personName(actor: string | null | undefined, family: { name: string; email?: string }[] = [], aliases: Record<string, string> = {}): string {
  const a = (actor ?? '').trim();
  if (!a) return 'Someone';
  if (aliases[a.toLowerCase()]) return aliases[a.toLowerCase()]!;
  if (!a.includes('@')) return a;
  const match = family.find((f) => f.email && f.email.trim().toLowerCase() === a.toLowerCase());
  if (match?.name) return match.name.split(' ')[0]!;
  const local = a.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
  return local ? local.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : 'Someone';
}

export async function signedMediaUrl(sb: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await sb.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** PostgREST "Could not find the 'x' column of 'items' in the schema cache" (PGRST204) → "x". */
export function missingColumn(error: { code?: string; message?: string }): string | null {
  const m = /could not find the '([^']+)' column/i.exec(error.message ?? '');
  return m ? m[1]! : null;
}

/** Postgres 'null value in column "format" of relation "books" violates not-null constraint' (23502) → "format". */
export function notNullColumn(error: { code?: string; message?: string }): string | null {
  const m = /null value in column "([^"]+)"/i.exec(error.message ?? '');
  return m ? m[1]! : null;
}

/** Replaces blank values the cloud won't accept with the app's default for that column. */
export function fillRequired(table: string, rows: Record<string, unknown>[], cols: Set<string>): Record<string, unknown>[] {
  if (!cols.size) return rows;
  const defaults = (DEFAULTS as unknown as Record<string, Record<string, unknown> | undefined>)[table] ?? {};
  return rows.map((r) => {
    let out = r;
    for (const c of cols) {
      if (r[c] != null) continue;
      out = { ...out, [c]: defaults[c] ?? '' };
    }
    return out;
  });
}

export function supabaseAdapter(
  sb: SupabaseClient,
  householdId: string,
  readMedia: (ref: MediaRef) => Promise<Blob | ArrayBuffer>,
): RemoteAdapter {
  // Columns the cloud database doesn't have yet (a newer app before its migration ran) — kept on-device only.
  const missing = new Map<string, Set<string>>();
  // Required cloud columns that some on-device rows left blank — filled with the app default before upload.
  const required = new Map<string, Set<string>>();
  return {
    skippedColumns: (table) => [...(missing.get(table) ?? [])],
    async push(table, rows) {
      const skip = missing.get(table) ?? new Set<string>();
      const fill = required.get(table) ?? new Set<string>();
      for (let attempt = 0; attempt < 12; attempt++) {
        let body = fillRequired(table, rows as unknown as Record<string, unknown>[], fill);
        if (skip.size) body = body.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !skip.has(k))));
        const { error } = await sb.from(table).upsert(body as never[], { onConflict: 'id' });
        if (!error) return;
        const nn = notNullColumn(error);
        if (nn && !fill.has(nn)) {
          fill.add(nn);
          required.set(table, fill);
          continue;
        }
        const col = missingColumn(error);
        if (!col || skip.has(col)) throw new Error(`${table}: ${error.message}`);
        skip.add(col);
        missing.set(table, skip);
      }
      throw new Error(`${table}: too many missing columns — run the latest Supabase migration`);
    },
    async pull(table, since) {
      const out: (BaseRow & { server_updated_at?: string })[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        let q = sb.from(table).select('*').eq('household_id', householdId).order('server_updated_at', { ascending: true }).range(from, from + page - 1);
        if (since) q = q.gt('server_updated_at', since);
        const { data, error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...((data ?? []) as never[]));
        if (!data || data.length < page) break;
      }
      return out;
    },
    subscribe(onRow) {
      // One channel per table: if a table isn't in the cloud yet, only that table loses live updates.
      const channels = TABLES.map((table) =>
        sb
          .channel(`household-${householdId}-${table}`)
          .on(
            'postgres_changes' as never,
            { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
            (payload: { new?: BaseRow }) => {
              if (payload.new && (payload.new as BaseRow).id) onRow(table as TableName, payload.new as BaseRow);
            },
          )
          .subscribe(),
      );
      return () => {
        for (const c of channels) void sb.removeChannel(c);
      };
    },
    async uploadMedia(ref) {
      const body = await readMedia(ref);
      const ext = (ref.mime ?? 'image/jpeg').split('/')[1] ?? 'jpg';
      const path = `${householdId}/${ref.id}.${ext}`;
      const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: ref.mime ?? 'image/jpeg', upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
      return { ...ref, remotePath: path };
    },
  };
}
