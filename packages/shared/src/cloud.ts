import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

export async function signedMediaUrl(sb: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await sb.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export function supabaseAdapter(
  sb: SupabaseClient,
  householdId: string,
  readMedia: (ref: MediaRef) => Promise<Blob | ArrayBuffer>,
): RemoteAdapter {
  return {
    async push(table, rows) {
      const { error } = await sb.from(table).upsert(rows as never[], { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
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
      const channel = sb.channel(`household-${householdId}`);
      for (const table of TABLES) {
        channel.on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
          (payload: { new?: BaseRow }) => {
            if (payload.new && (payload.new as BaseRow).id) onRow(table as TableName, payload.new as BaseRow);
          },
        );
      }
      channel.subscribe();
      return () => {
        void sb.removeChannel(channel);
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
