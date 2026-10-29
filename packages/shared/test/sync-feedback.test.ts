import { describe, expect, it } from 'vitest';
import { memoryKV, MovingStore, personName, type BaseRow, type ChangeEvent, type RemoteAdapter, type TableName } from '../src';

function fakeRemote(opts: { missing?: TableName[]; failPush?: TableName[] } = {}) {
  const cloud = new Map<TableName, BaseRow[]>();
  let clock = 0;
  const remote: RemoteAdapter = {
    async push(table, rows) {
      if (opts.missing?.includes(table)) throw new Error(`${table}: Could not find the table 'public.${table}' in the schema cache`);
      if (opts.failPush?.includes(table)) throw new Error(`${table}: boom`);
      const list = cloud.get(table) ?? [];
      for (const r of rows) {
        const i = list.findIndex((x) => x.id === r.id);
        const row = { ...r, server_updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString() };
        if (i >= 0) list[i] = row;
        else list.push(row);
      }
      cloud.set(table, list);
    },
    async pull(table, since) {
      if (opts.missing?.includes(table)) throw new Error(`relation "public.${table}" does not exist`);
      return (cloud.get(table) ?? []).filter((r) => !since || (r as { server_updated_at?: string }).server_updated_at! > since);
    },
    subscribe: () => () => {},
  };
  return { remote, cloud };
}

describe('sync', () => {
  it('keeps syncing other tables when the cloud is missing one (migration not run yet)', async () => {
    const { remote, cloud } = fakeRemote({ missing: ['subscriptions'] });
    const s = new MovingStore(memoryKV(), 'h1', () => 'Jess', remote);
    s.insert('tasks', { title: 'Book movers' } as never);
    s.insert('subscriptions', { name: 'Netflix' } as never);
    await s.sync();
    expect(s.status.error).toBeNull();
    expect(cloud.get('tasks')?.length).toBe(1);
    expect(s.missingTables.has('subscriptions')).toBe(true);
    // The subscription stays queued for later instead of being lost.
    expect(s.status.pending).toBe(1);
  });

  it('one failing table does not block the others and keeps its changes queued', async () => {
    const { remote, cloud } = fakeRemote({ failPush: ['books'] });
    const s = new MovingStore(memoryKV(), 'h1', () => 'Jess', remote);
    s.insert('books', { title: 'Dune' } as never);
    s.insert('tasks', { title: 'Pack kitchen' } as never);
    await s.sync();
    expect(cloud.get('tasks')?.length).toBe(1);
    expect(s.status.error).toContain('books');
    expect(s.status.pending).toBe(1);
  });

  it("tells you when you saved and announces the other person's changes", async () => {
    const { remote } = fakeRemote();
    const jess = new MovingStore(memoryKV(), 'h1', () => 'Jess', remote);
    const mike = new MovingStore(memoryKV(), 'h1', () => 'Mike', remote);
    await jess.sync();
    const mine: ChangeEvent[] = [];
    const heard: ChangeEvent[] = [];
    mike.onChange((e) => mine.push(e));
    jess.onChange((e) => heard.push(e));
    mike.insert('items', { name: 'Couch' } as never);
    expect(mine).toMatchObject([{ source: 'local', action: 'created', label: 'Item: Couch', actor: 'Mike' }]);
    await mike.sync();
    await jess.sync();
    expect(jess.list('items').map((i) => i.name)).toEqual(['Couch']);
    expect(heard).toMatchObject([{ source: 'remote', actor: 'Mike', label: 'Item: Couch' }]);
  });
});

describe('personName', () => {
  it('shows a name instead of an email', () => {
    expect(personName('Mike')).toBe('Mike');
    expect(personName('mike.smith@gmail.com', [{ name: 'Michael Smith', email: 'Mike.Smith@gmail.com' }])).toBe('Michael');
    expect(personName('mike.smith88@gmail.com')).toBe('Mike Smith');
    expect(personName('')).toBe('Someone');
  });
});
