import { randomUUID } from 'node:crypto';
import type { PreparedInput } from './index';
import { providerError, readJson } from './http';

// H3 accepts URLs, so keep local inputs in private, model-bound temporary OSS storage.
export async function uploadDashScopeImages(input: PreparedInput, secret: string, signal: AbortSignal): Promise<string[]> {
  if (!input.files.length) return [];
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
  for (const file of input.files) {
    if (!extensions[file.mimeType]) throw new Error('INPUT_UNSUPPORTED: MiniMax H3 图片须为 JPEG、PNG、WEBP、HEIC 或 HEIF');
    if (!file.bytes.byteLength || file.bytes.byteLength > 30 * 1024 * 1024) throw new Error('INPUT_LIMIT_EXCEEDED: MiniMax H3 图片大小须为 0–30 MB（不含空文件）');
  }
  signal.throwIfAborted();
  const url = new URL('/api/v1/uploads', input.providerBaseUrl);
  url.searchParams.set('action', 'getPolicy');
  url.searchParams.set('model', input.upstreamModel);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, signal });
  const payload = await readJson(response);
  if (!response.ok || payload.code) throw providerError(response.status, payload);
  const data = payload.data as Record<string, unknown> | undefined;
  const fields = ['policy', 'signature', 'upload_dir', 'upload_host', 'oss_access_key_id', 'x_oss_object_acl', 'x_oss_forbid_overwrite'] as const;
  if (!data || fields.some((field) => typeof data[field] !== 'string' || !data[field])) throw new Error('RESULT_UNSUPPORTED: 百炼未返回完整的临时上传凭证');
  const host = new URL(String(data.upload_host));
  if (host.protocol !== 'https:' || !/^[a-z0-9-]+\.oss[a-z0-9-]*\.aliyuncs\.com$/.test(host.hostname) || host.username || host.password || host.port) {
    throw new Error('RESULT_UNSUPPORTED: 百炼上传地址不是阿里云 OSS HTTPS 地址');
  }
  if (data.x_oss_object_acl !== 'private') throw new Error('RESULT_UNSUPPORTED: 百炼临时上传必须使用私有存储');
  const directory = String(data.upload_dir).replace(/\/$/, '');
  if (!directory || directory.startsWith('/') || directory.split('/').some((part) => !part || part === '..')) throw new Error('RESULT_UNSUPPORTED: 百炼上传目录无效');
  const policyMaxBytes = Number(data.max_file_size_mb) * 1024 * 1024;
  if (Number.isFinite(policyMaxBytes) && input.files.some((file) => file.bytes.byteLength > policyMaxBytes)) throw new Error('INPUT_LIMIT_EXCEEDED: 图片超过百炼上传凭证大小限制');
  const urls: string[] = [];
  for (const file of input.files) {
    signal.throwIfAborted();
    const name = `${randomUUID()}.${extensions[file.mimeType]}`;
    const key = `${directory}/${name}`;
    const form = new FormData();
    form.set('OSSAccessKeyId', String(data.oss_access_key_id));
    form.set('Signature', String(data.signature));
    form.set('policy', String(data.policy));
    form.set('x-oss-object-acl', 'private');
    form.set('x-oss-forbid-overwrite', String(data.x_oss_forbid_overwrite));
    form.set('key', key);
    form.set('success_action_status', '200');
    form.set('file', new Blob([file.bytes as BlobPart], { type: file.mimeType }), name);
    // Only OSS policy credentials are sent here, never the API Key or original filename.
    const uploaded = await fetch(host, { method: 'POST', body: form, redirect: 'error', signal });
    if (!uploaded.ok) throw providerError(uploaded.status, { message: `百炼图片上传失败 (${uploaded.status})` });
    urls.push(`oss://${key}`);
  }
  return urls;
}
