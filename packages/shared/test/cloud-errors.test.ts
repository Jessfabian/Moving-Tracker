import { describe, expect, it } from 'vitest';
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
