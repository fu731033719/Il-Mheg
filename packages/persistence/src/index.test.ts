import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The project's baseline Node 20 lacks node:sqlite; Electron and Node 22 provide it.
describe.skipIf(Number(process.versions.node.split('.')[0]) < 22)('model configuration persistence', () => {
  it('stores visual kind and video mode when creating and editing a configuration', async () => {
    const { AppDatabase } = await import('./index');
    const database = new AppDatabase(':memory:');
    try {
      const created = database.saveModelConfiguration({
        displayName: 'Video', modelName: 'my-video-model', endpoint: 'https://example.com/generate',
        modelType: 'vision', visualKind: 'video', videoMode: 'first_last', provider: 'Custom',
      });
      expect(created).toMatchObject({ visualKind: 'video', videoMode: 'first_last' });
      expect(database.listModelConfigurations()).toHaveLength(1);

      const edited = database.saveModelConfiguration({
        id: created.id, displayName: 'Image', modelName: 'my-image-model', endpoint: 'https://example.com/generate',
        modelType: 'vision', visualKind: 'image', videoMode: 'universal', provider: 'Custom',
      });
      expect(edited).toMatchObject({ id: created.id, visualKind: 'image', videoMode: 'universal' });
      expect(database.db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 });
    } finally {
      database.close();
    }
  });

  it('upgrades legacy configurations and retains their inferred values on reopen', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { AppDatabase } = await import('./index');
    const directory = mkdtempSync(path.join(tmpdir(), 'ilmheg-persistence-'));
    const databasePath = path.join(directory, 'legacy.db');
    const legacy = new DatabaseSync(databasePath);
    const stamp = '2026-09-26T00:00:00.000Z';
    const rows = [
      ['video', 'VISION-video', 'https://example.com/generate', 'vision', 'video', 'universal'],
      ['text', 'custom-t2v', 'https://example.com/generate', 'vision', 'video', 'text'],
      ['frames', 'custom-i2v', 'https://example.com/generate', 'vision', 'video', 'first_last'],
      ['reference', 'custom-model', 'https://example.com/R2V/generate', 'vision', 'video', 'reference'],
      ['image', 'custom-image', 'https://example.com/generate', 'vision', 'image', 'universal'],
      ['language', 'video-model', 'https://example.com/generate', 'language', 'image', 'universal'],
    ] as const;
    try {
      legacy.exec(`
        CREATE TABLE model_configurations (
          id TEXT PRIMARY KEY, display_name TEXT NOT NULL, model_name TEXT NOT NULL,
          endpoint TEXT NOT NULL, model_type TEXT NOT NULL, provider TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        ) STRICT;
        PRAGMA user_version = 2;
      `);
      const insert = legacy.prepare(`
        INSERT INTO model_configurations(id,display_name,model_name,endpoint,model_type,provider,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)
      `);
      for (const [name, modelName, endpoint, modelType] of rows) {
        insert.run(randomUUID(), name, modelName, endpoint, modelType, 'Custom', stamp, stamp);
      }
      legacy.close();

      for (let open = 0; open < 2; open += 1) {
        const database = new AppDatabase(databasePath);
        try {
          const configurations = database.listModelConfigurations();
          for (const [name, , , , visualKind, videoMode] of rows) {
            expect(configurations.find((item) => item.displayName === name)).toMatchObject({ visualKind, videoMode });
          }
          expect(database.db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 });
        } finally {
          database.close();
        }
      }
    } finally {
      if (legacy.isOpen) legacy.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
