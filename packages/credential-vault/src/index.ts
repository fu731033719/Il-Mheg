import type { AppDatabase } from '@ilmheg/persistence';

export interface EncryptionAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Uint8Array;
  decryptString(value: Uint8Array): string;
  backend(): string;
  secure(): boolean;
}

export class CredentialVault {
  constructor(private readonly database: AppDatabase, private readonly encryption: EncryptionAdapter) {}

  status() {
    return {
      available: this.encryption.isEncryptionAvailable(),
      backend: this.encryption.backend(),
      secure: this.encryption.secure(),
    };
  }

  put(providerId: string, secret: string) {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('系统凭据加密暂不可用');
    const normalized = secret.trim();
    if (!normalized) throw new Error('凭据不能为空');
    const encrypted = this.encryption.encryptString(normalized);
    this.database.putCredential(providerId, encrypted, this.encryption.backend());
  }

  delete(providerId: string) { this.database.deleteCredential(providerId); }
  has(providerId: string) { return this.database.hasCredential(providerId); }

  async withSecret<T>(providerId: string, work: (secret: string) => Promise<T>): Promise<T> {
    const row = this.database.getCredential(providerId);
    if (!row) throw new Error('CREDENTIAL_MISSING: 尚未配置模型服务凭据');
    let secret = '';
    try {
      secret = this.encryption.decryptString(row.value);
    } catch (cause) {
      throw new Error('CREDENTIAL_UNREADABLE: 已保存的 API Key 无法解密。请在“应用设置”中重新输入并保存对应凭据后再试。', { cause });
    }
    try {
      return await work(secret);
    } finally {
      secret = '';
    }
  }
}
