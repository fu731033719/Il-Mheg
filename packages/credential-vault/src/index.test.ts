import { describe, expect, it, vi } from 'vitest';
import type { AppDatabase } from '@ilmheg/persistence';
import { CredentialVault, type EncryptionAdapter } from './index';

const encrypted = new Uint8Array([1, 2, 3]);

function createVault(decryptString: EncryptionAdapter['decryptString']) {
  const database = {
    getCredential: () => ({ id: crypto.randomUUID(), value: encrypted, backend: 'keychain' }),
  } as unknown as AppDatabase;
  const encryption: EncryptionAdapter = {
    isEncryptionAvailable: () => true,
    encryptString: () => encrypted,
    decryptString,
    backend: () => 'keychain',
    secure: () => true,
  };
  return new CredentialVault(database, encryption);
}

describe('CredentialVault.withSecret', () => {
  it('passes a decrypted secret to the scoped callback', async () => {
    const work = vi.fn(async (secret: string) => secret.length);

    await expect(createVault(() => 'secret-value').withSecret('provider', work)).resolves.toBe(12);
    expect(work).toHaveBeenCalledWith('secret-value');
  });

  it('turns decryption failures into an actionable public error code', async () => {
    const work = vi.fn(async () => undefined);
    const vault = createVault(() => { throw new Error('native safeStorage failure'); });

    await expect(vault.withSecret('provider', work)).rejects.toThrow(
      'CREDENTIAL_UNREADABLE: 已保存的 API Key 无法解密。请在“应用设置”中重新输入并保存对应凭据后再试。',
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('does not disguise provider callback failures as decryption failures', async () => {
    const vault = createVault(() => 'secret-value');

    await expect(vault.withSecret('provider', async () => {
      throw new Error('provider request failed');
    })).rejects.toThrow('provider request failed');
  });
});
