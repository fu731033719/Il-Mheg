export class ProviderRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return { message: text.slice(0, 1000) }; }
}

export function providerError(status: number, payload: Record<string, unknown>) {
  const nested = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : payload;
  return new ProviderRequestError(status, String(nested.message ?? payload.message ?? `Provider 请求失败 (${status})`).slice(0, 1000));
}
