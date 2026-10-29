import { describe, expect, it } from 'vitest';
import { notNullColumn, supabaseAdapter } from '../src/cloud';
import { cloudErrorMessage } from '../src/util';

describe('cloudErrorMessage', () => {
  it('reads PostgREST plain-object errors instead of [object Object]', () => {
    const msg = cloudErrorMessage({ message: 'permission denied for table household_members', code: '42501', details: null, hint: null });
    expect(msg).toContain('permission denied for table household_members (42501)');
    expect(msg).toContain('20261027130000_fix_invite_code.sql');
    expect(msg).not.toContain('[object Object]');
  });

  it('explains a missing setup script', () => {
    const msg = cloudErrorMessage({ message: 'Could not find the function public.create_household(p_display_name, p_name) in the schema cache', code: 'PGRST202' });
    expect(msg).toContain('SQL Editor');
    expect(msg).toContain('20261027000000_init.sql');
  });

  it('handles Error instances, strings and odd values', () => {
    expect(cloudErrorMessage(new Error('Invalid invite code'))).toBe('Invalid invite code');
    expect(cloudErrorMessage('boom')).toBe('boom');
    expect(cloudErrorMessage({ foo: 1 })).toBe('{"foo":1}');
  });
});

describe('sync with blank required fields', () => {
  it('reads the column from a not-null error', () => {
    expect(notNullColumn({ code: '23502', message: 'null value in column "format" of relation "books" violates not-null constraint' })).toBe('format');
    expect(notNullColumn({ message: 'something else' })).toBeNull();
  });

  it('fills the blank with the app default and retries instead of getting stuck', async () => {
    const sent: Record<string, unknown>[][] = [];
    const sb = {
      from: () => ({
        upsert: async (rows: Record<string, unknown>[]) => {
          sent.push(rows);
          return rows.some((r) => r.format == null) ? { error: { code: '23502', message: 'null value in column "format" of relation "books" violates not-null constraint' } } : { error: null };
        },
      }),
    };
    const remote = supabaseAdapter(sb as never, 'h1', async () => new ArrayBuffer(0));
    await remote.push('books', [{ id: 'a', title: 'Dune', format: null }, { id: 'b', title: 'Emma', format: 'hardcover' }] as never);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.map((r) => r.format)).toEqual(['paperback', 'hardcover']);
    // Later pushes fill it right away.
    await remote.push('books', [{ id: 'c', title: 'Odd', format: null }] as never);
    expect(sent).toHaveLength(3);
    expect(sent[2]![0]!.format).toBe('paperback');
  });
});