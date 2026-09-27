import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { PublicAsset } from '@ilmheg/contracts';
import type { AppDatabase, AssetRecord } from '@ilmheg/persistence';

export interface ProviderOutput {
  kind: 'bytes' | 'base64' | 'remote_url';
  bytes?: Uint8Array;
  data?: string;
  url?: string;
  mimeType: string;
  fileName?: string;
}

const imageMax = 50 * 1024 * 1024;
const videoMax = 1024 * 1024 * 1024;

export class AssetStore {
  constructor(private readonly root: string, private readonly database: AppDatabase) {}

  async initialize() {
    await Promise.all([
      fs.mkdir(path.join(this.root, 'images'), { recursive: true }),
      fs.mkdir(path.join(this.root, 'videos'), { recursive: true }),
      fs.mkdir(path.join(this.root, 'tmp'), { recursive: true }),
    ]);
  }

  rootDirectory(): string {
    return path.resolve(this.root);
  }

  async importFile(filePath: string, kind: 'image' | 'video'): Promise<AssetRecord> {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('所选路径不是文件');
    const limit = kind === 'image' ? imageMax : videoMax;
    if (stat.size > limit) throw new Error(`文件超过 ${Math.round(limit / 1024 / 1024)}MB 限制`);
    const bytes = new Uint8Array(await fs.readFile(filePath));
    const mimeType = detectMime(bytes);
    if (!mimeType || !mimeType.startsWith(`${kind}/`)) throw new Error(`文件内容不是受支持的${kind === 'image' ? '图片' : '视频'}`);
    return this.saveBytes({ bytes, mimeType, fileName: path.basename(filePath), kind, origin: 'imported' });
  }

  async materialize(output: ProviderOutput, kind: 'image' | 'video', runId: string): Promise<AssetRecord> {
    if (output.kind === 'remote_url') {
      if (!output.url) throw new Error('RESULT_UNSUPPORTED: Provider 未返回媒体 URL');
      const bytes = await download(output.url, kind === 'image' ? imageMax : videoMax);
      const mimeType = detectMime(bytes) ?? output.mimeType;
      return this.saveBytes({ bytes, mimeType, fileName: output.fileName ?? `generated.${extensionFor(mimeType)}`, kind, origin: 'downloaded', sourceUrl: output.url, runId });
    }
    const bytes = output.kind === 'base64'
      ? new Uint8Array(Buffer.from(output.data ?? '', 'base64'))
      : output.bytes;
    if (!bytes?.byteLength) throw new Error('RESULT_UNSUPPORTED: Provider 返回了空媒体');
    return this.saveBytes({ bytes, mimeType: output.mimeType, fileName: output.fileName ?? `generated.${extensionFor(output.mimeType)}`, kind, origin: 'generated', runId });
  }

  async saveBytes(input: {
    bytes: Uint8Array; mimeType: string; fileName: string; kind: 'image' | 'video';
    origin: AssetRecord['origin']; sourceUrl?: string; runId?: string;
  }): Promise<AssetRecord> {
    const id = randomUUID();
    const ext = extensionFor(input.mimeType);
    const folder = input.kind === 'image' ? 'images' : 'videos';
    const shard = id.slice(0, 2);
    const relativePath = path.join(folder, shard, `${id}.${ext}`);
    const finalPath = path.join(this.root, relativePath);
    const tmpPath = path.join(this.root, 'tmp', `${id}.part`);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.writeFile(tmpPath, input.bytes, { flag: 'wx' });
    await fs.rename(tmpPath, finalPath);
    const record: AssetRecord = {
      id, kind: input.kind, origin: input.origin, mimeType: input.mimeType,
      relativePath, fileName: sanitizeFileName(input.fileName), bytes: input.bytes.byteLength,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      sourceUrl: input.sourceUrl, createdByRunId: input.runId, createdAt: new Date().toISOString(),
    };
    try {
      this.database.insertAsset(record);
      return record;
    } catch (error) {
      await fs.unlink(finalPath).catch(() => undefined);
      throw error;
    }
  }

  resolvePath(assetId: string): string {
    const asset = this.database.getAsset(assetId);
    if (!asset) throw new Error('素材不存在');
    const resolved = path.resolve(this.root, asset.relativePath);
    const root = path.resolve(this.root) + path.sep;
    if (!resolved.startsWith(root)) throw new Error('非法素材路径');
    return resolved;
  }

  async asDataUrl(assetId: string): Promise<string> {
    const asset = this.database.getAsset(assetId);
    if (!asset) throw new Error('输入素材不存在');
    const bytes = await fs.readFile(this.resolvePath(assetId));
    return `data:${asset.mimeType};base64,${bytes.toString('base64')}`;
  }

  publicAsset(asset: AssetRecord): PublicAsset {
    return {
      id: asset.id, kind: asset.kind, origin: asset.origin, mimeType: asset.mimeType,
      fileName: asset.fileName, bytes: asset.bytes, width: asset.width, height: asset.height,
      durationMs: asset.durationMs, url: `canvas-asset://asset/${asset.id}`, createdAt: asset.createdAt,
    };
  }
}

function detectMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && Buffer.from(bytes.slice(1, 4)).toString() === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (Buffer.from(bytes.slice(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.slice(8, 12)).toString() === 'WEBP') return 'image/webp';
  if (Buffer.from(bytes.slice(0, 3)).toString() === 'GIF') return 'image/gif';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  if (Buffer.from(bytes.slice(4, 8)).toString() === 'ftyp') return 'video/mp4';
  return undefined;
}

function extensionFor(mime: string) {
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm',
  };
  return map[mime] ?? (mime.startsWith('video/') ? 'mp4' : 'bin');
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'asset';
}

async function download(urlValue: string, maxBytes: number): Promise<Uint8Array> {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:') throw new Error('RESULT_DOWNLOAD_FAILED: 只允许下载 HTTPS 媒体');
  await assertPublicHost(url.hostname);
  // High-resolution provider outputs can exceed 25 MB; slow OSS downloads may need several minutes.
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error(`RESULT_DOWNLOAD_FAILED: 下载失败 (${response.status})`);
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > maxBytes) throw new Error('RESULT_DOWNLOAD_FAILED: 远程文件过大');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error('RESULT_DOWNLOAD_FAILED: 远程文件过大');
  return bytes;
}

async function assertPublicHost(hostname: string) {
  if (hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('RESULT_DOWNLOAD_FAILED: 拒绝访问本机地址');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error('RESULT_DOWNLOAD_FAILED: 拒绝访问私网地址');
  }
}

function isPrivateIp(address: string) {
  const normalized = address.replace(/^::ffff:/, '');
  return normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('127.') || normalized.startsWith('10.') || normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) || normalized === '0.0.0.0';
}
