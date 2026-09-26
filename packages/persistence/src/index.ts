import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  CanvasEdgeSchema,
  CanvasNodeSchema,
  GraphEnvelopeSchema,
  ModelConfigurationSchema,
  ProjectSchema,
  PublicRunErrorSchema,
  PublicRunRecordSchema,
  type GraphEnvelope,
  type ModelConfiguration,
  type Project,
  type PublicRunError,
  type PublicRunRecord,
  type RunStatus,
  type SaveGraphInput,
  type SaveModelConfigurationInput,
} from '@ilmheg/contracts';
import type { CompiledRun } from '@ilmheg/graph-compiler';

export interface AssetRecord {
  id: string;
  kind: 'image' | 'video';
  origin: 'imported' | 'generated' | 'downloaded';
  mimeType: string;
  relativePath: string;
  fileName: string;
  bytes: number;
  sha256: string;
  width?: number;
  height?: number;
  durationMs?: number;
  sourceUrl?: string;
  createdByRunId?: string;
  createdAt: string;
}

export type StoredCompiledRun = Omit<CompiledRun, 'model' | 'endpoint' | 'requiresCredential'> & Partial<Pick<CompiledRun, 'model' | 'endpoint' | 'requiresCredential'>>;

export interface InternalRunRecord extends PublicRunRecord {
  inputSnapshot: StoredCompiledRun;
  remoteTask?: { taskId: string; pollAttempt: number; nextPollAt: string; providerStatus?: string };
}

export class RevisionConflictError extends Error {
  constructor(public readonly currentRevision: number) {
    super(`GRAPH_REVISION_CONFLICT: 当前图版本为 ${currentRevision}`);
    this.name = 'RevisionConflictError';
  }
}

type Row = Record<string, unknown>;
const iso = () => new Date().toISOString();

export class AppDatabase {
  readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(databasePath);
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS graphs (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL, revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL, retry_of_run_id TEXT REFERENCES runs(id),
        status TEXT NOT NULL, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL, capability TEXT NOT NULL,
        input_snapshot_json TEXT NOT NULL, remote_task_json TEXT,
        output_asset_ids_json TEXT, public_error_json TEXT,
        next_poll_at TEXT, poll_attempt INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS runs_active_poll_idx ON runs(status, next_poll_at);
      CREATE INDEX IF NOT EXISTS runs_project_idx ON runs(project_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('image','video')),
        origin TEXT NOT NULL, mime_type TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL,
        bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
        width INTEGER, height INTEGER, duration_ms INTEGER, source_url TEXT,
        created_by_run_id TEXT REFERENCES runs(id), created_at TEXT NOT NULL,
        deleted_at TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS assets_hash_idx ON assets(sha256);
      CREATE TABLE IF NOT EXISTS provider_settings (
        provider_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
        last_test_json TEXT, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS encrypted_credentials (
        id TEXT PRIMARY KEY, provider_id TEXT NOT NULL UNIQUE,
        encrypted_value BLOB NOT NULL, encryption_backend TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS model_configurations (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        model_type TEXT NOT NULL CHECK(model_type IN ('language','vision','multimodal','speech')),
        visual_kind TEXT NOT NULL DEFAULT 'image' CHECK(visual_kind IN ('image','video')),
        video_mode TEXT NOT NULL DEFAULT 'universal' CHECK(video_mode IN ('universal','text','first_last','reference')),
        provider TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);

    const columns = new Set((this.db.prepare('PRAGMA table_info(model_configurations)').all() as Row[])
      .map((row) => String(row.name)));
    const missingVisualKind = !columns.has('visual_kind');
    const missingVideoMode = !columns.has('video_mode');
    this.transaction(() => {
      if (missingVisualKind) {
        this.db.exec("ALTER TABLE model_configurations ADD COLUMN visual_kind TEXT NOT NULL DEFAULT 'image' CHECK(visual_kind IN ('image','video'))");
      }
      if (missingVideoMode) {
        this.db.exec("ALTER TABLE model_configurations ADD COLUMN video_mode TEXT NOT NULL DEFAULT 'universal' CHECK(video_mode IN ('universal','text','first_last','reference'))");
      }
      if (missingVisualKind || missingVideoMode) {
        const rows = this.db.prepare('SELECT id,model_name,endpoint,model_type FROM model_configurations').all() as Row[];
        for (const row of rows) {
          const legacy = inferLegacyVisualSettings(row);
          if (missingVisualKind) {
            this.db.prepare('UPDATE model_configurations SET visual_kind=? WHERE id=?').run(legacy.visualKind, String(row.id));
          }
          if (missingVideoMode) {
            this.db.prepare('UPDATE model_configurations SET video_mode=? WHERE id=?').run(legacy.videoMode, String(row.id));
          }
        }
      }
      this.db.exec('PRAGMA user_version = 3');
    });
  }

  close() { this.db.close(); }

  listProjects(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map((row) => mapProject(row as Row));
  }

  hasProject(id: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM projects WHERE id=?').get(id));
  }

  createProject(name: string): Project {
    const stamp = iso();
    const project = ProjectSchema.parse({ id: randomUUID(), name: name.trim(), createdAt: stamp, updatedAt: stamp });
    const graph = GraphEnvelopeSchema.parse({
      schemaVersion: 1, projectId: project.id, revision: 0, nodes: [], edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }, updatedAt: stamp,
    });
    this.transaction(() => {
      this.db.prepare('INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,?,?,?)')
        .run(project.id, project.name, project.createdAt, project.updatedAt);
      this.db.prepare('INSERT INTO graphs(project_id,schema_version,revision,snapshot_json,updated_at) VALUES(?,?,?,?,?)')
        .run(project.id, 1, 0, JSON.stringify(graph), stamp);
    });
    return project;
  }

  renameProject(id: string, name: string): Project {
    const stamp = iso();
    this.db.prepare('UPDATE projects SET name=?,updated_at=? WHERE id=?').run(name.trim(), stamp, id);
    const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('项目不存在');
    return mapProject(row);
  }

  removeProject(id: string) { this.db.prepare('DELETE FROM projects WHERE id=?').run(id); }

  loadGraph(projectId: string): GraphEnvelope {
    const row = this.db.prepare('SELECT snapshot_json,revision,updated_at FROM graphs WHERE project_id=?').get(projectId) as Row | undefined;
    if (!row) throw new Error('项目画布不存在');
    const snapshot = JSON.parse(String(row.snapshot_json)) as GraphEnvelope;
    return GraphEnvelopeSchema.parse({ ...snapshot, revision: Number(row.revision), updatedAt: String(row.updated_at) });
  }

  saveGraph(input: SaveGraphInput): GraphEnvelope {
    const stamp = iso();
    const next = GraphEnvelopeSchema.parse({ ...input.graph, revision: input.baseRevision + 1, updatedAt: stamp });
    const result = this.db.prepare(`
      UPDATE graphs SET schema_version=?,revision=revision+1,snapshot_json=?,updated_at=?
      WHERE project_id=? AND revision=?
    `).run(1, JSON.stringify(next), stamp, input.projectId, input.baseRevision);
    if (Number(result.changes) === 0) {
      const row = this.db.prepare('SELECT revision FROM graphs WHERE project_id=?').get(input.projectId) as Row | undefined;
      throw new RevisionConflictError(Number(row?.revision ?? -1));
    }
    this.db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(stamp, input.projectId);
    return next;
  }

  createRun(compiled: CompiledRun, retryOfRunId?: string): InternalRunRecord {
    const stamp = iso();
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO runs(id,project_id,node_id,retry_of_run_id,status,provider_id,model_id,endpoint_id,capability,input_snapshot_json,output_asset_ids_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, compiled.projectId, compiled.nodeId, retryOfRunId ?? null, 'QUEUED', compiled.providerId, compiled.modelId,
      compiled.endpointId, compiled.capability, JSON.stringify(compiled), '[]', stamp, stamp);
    return this.getRun(id)!;
  }

  getRun(id: string): InternalRunRecord | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id) as Row | undefined;
    return row ? mapRun(row) : null;
  }

  listRuns(projectId?: string): InternalRunRecord[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM runs WHERE project_id=? ORDER BY created_at DESC LIMIT 100').all(projectId)
      : this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT 100').all();
    return rows.map((row) => mapRun(row as Row));
  }

  listRecoverableRuns(): InternalRunRecord[] {
    return this.db.prepare(`SELECT * FROM runs WHERE status IN ('QUEUED','PREPARING','SUBMITTING','WAITING_REMOTE','DOWNLOADING','CANCEL_REQUESTED') ORDER BY created_at`)
      .all().map((row) => mapRun(row as Row));
  }

  updateRunStatus(id: string, status: RunStatus, patch: {
    remoteTask?: InternalRunRecord['remoteTask']; outputAssetIds?: string[]; error?: PublicRunError; finished?: boolean;
  } = {}): InternalRunRecord {
    const run = this.getRun(id);
    if (!run) throw new Error('运行记录不存在');
    assertTransition(run.status, status);
    const stamp = iso();
    const remote = patch.remoteTask === undefined ? run.remoteTask : patch.remoteTask;
    const output = patch.outputAssetIds ?? run.outputAssetIds;
    const error = patch.error === undefined ? run.error : patch.error;
    this.db.prepare(`
      UPDATE runs SET status=?,remote_task_json=?,output_asset_ids_json=?,public_error_json=?,
        next_poll_at=?,poll_attempt=?,updated_at=?,finished_at=? WHERE id=?
    `).run(status, remote ? JSON.stringify(remote) : null, JSON.stringify(output), error ? JSON.stringify(error) : null,
      remote?.nextPollAt ?? null, remote?.pollAttempt ?? 0, stamp, patch.finished ? stamp : run.finishedAt ?? null, id);
    return this.getRun(id)!;
  }

  insertAsset(asset: AssetRecord) {
    this.db.prepare(`
      INSERT INTO assets(id,kind,origin,mime_type,relative_path,file_name,bytes,sha256,width,height,duration_ms,source_url,created_by_run_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(asset.id, asset.kind, asset.origin, asset.mimeType, asset.relativePath, asset.fileName, asset.bytes, asset.sha256,
      asset.width ?? null, asset.height ?? null, asset.durationMs ?? null, asset.sourceUrl ?? null, asset.createdByRunId ?? null, asset.createdAt);
  }

  getAsset(id: string): AssetRecord | null {
    const row = this.db.prepare('SELECT * FROM assets WHERE id=? AND deleted_at IS NULL').get(id) as Row | undefined;
    return row ? mapAsset(row) : null;
  }

  getAssets(ids: string[]): AssetRecord[] {
    return ids.map((id) => this.getAsset(id)).filter((asset): asset is AssetRecord => Boolean(asset));
  }

  getCredential(providerId: string): { id: string; value: Uint8Array; backend: string } | null {
    const row = this.db.prepare('SELECT * FROM encrypted_credentials WHERE provider_id=?').get(providerId) as Row | undefined;
    if (!row) return null;
    return { id: String(row.id), value: row.encrypted_value as Uint8Array, backend: String(row.encryption_backend) };
  }

  putCredential(providerId: string, value: Uint8Array, backend: string) {
    const existing = this.getCredential(providerId);
    this.db.prepare(`
      INSERT INTO encrypted_credentials(id,provider_id,encrypted_value,encryption_backend,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET encrypted_value=excluded.encrypted_value,encryption_backend=excluded.encryption_backend,updated_at=excluded.updated_at
    `).run(existing?.id ?? randomUUID(), providerId, value, backend, iso());
  }

  deleteCredential(providerId: string) { this.db.prepare('DELETE FROM encrypted_credentials WHERE provider_id=?').run(providerId); }
  hasCredential(providerId: string) { return Boolean(this.getCredential(providerId)); }

  getLastProviderTest(providerId: string): { ok: boolean; message: string; at: string } | undefined {
    const row = this.db.prepare('SELECT last_test_json FROM provider_settings WHERE provider_id=?').get(providerId) as Row | undefined;
    return row?.last_test_json ? JSON.parse(String(row.last_test_json)) : undefined;
  }

  setLastProviderTest(providerId: string, result: { ok: boolean; message: string; at: string }) {
    this.db.prepare(`
      INSERT INTO provider_settings(provider_id,enabled,last_test_json,updated_at) VALUES(?,1,?,?)
      ON CONFLICT(provider_id) DO UPDATE SET last_test_json=excluded.last_test_json,updated_at=excluded.updated_at
    `).run(providerId, JSON.stringify(result), iso());
  }

  listModelConfigurations(): ModelConfiguration[] {
    return this.db.prepare('SELECT * FROM model_configurations ORDER BY updated_at DESC').all()
      .map((row) => mapModelConfiguration(row as Row, this.hasCredential(modelCredentialId(String((row as Row).id)))));
  }

  getModelConfiguration(id: string): ModelConfiguration | null {
    const row = this.db.prepare('SELECT * FROM model_configurations WHERE id=?').get(id) as Row | undefined;
    return row ? mapModelConfiguration(row, this.hasCredential(modelCredentialId(id))) : null;
  }

  saveModelConfiguration(input: Omit<SaveModelConfigurationInput, 'apiKey'>): ModelConfiguration {
    const current = input.id ? this.getModelConfiguration(input.id) : null;
    if (input.id && !current) throw new Error('模型配置不存在');
    const id = current?.id ?? randomUUID();
    const stamp = iso();
    this.db.prepare(`
      INSERT INTO model_configurations(id,display_name,model_name,endpoint,model_type,visual_kind,video_mode,provider,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        display_name=excluded.display_name,
        model_name=excluded.model_name,
        endpoint=excluded.endpoint,
        model_type=excluded.model_type,
        visual_kind=excluded.visual_kind,
        video_mode=excluded.video_mode,
        provider=excluded.provider,
        updated_at=excluded.updated_at
    `).run(id, input.displayName, input.modelName, input.endpoint, input.modelType, input.visualKind, input.videoMode,
      input.provider, current?.createdAt ?? stamp, stamp);
    return this.getModelConfiguration(id)!;
  }

  removeModelConfiguration(id: string) {
    this.db.prepare('DELETE FROM model_configurations WHERE id=?').run(id);
  }

  commitRunSuccess(runId: string, assetIds: string[]): { run: InternalRunRecord; graph: GraphEnvelope } {
    const run = this.getRun(runId);
    if (!run) throw new Error('运行记录不存在');
    if (['CANCEL_REQUESTED', 'CANCELLED', 'CANCELLED_LOCAL_ONLY'].includes(run.status)) throw new Error('已取消运行不能提交结果');
    let graph!: GraphEnvelope;
    this.transaction(() => {
      graph = this.loadGraph(run.projectId);
      const targetIndex = graph.nodes.findIndex((node) => node.id === run.nodeId);
      if (targetIndex < 0) throw new Error('目标节点已删除');
      const target = graph.nodes[targetIndex];
      if (target.kind !== 'image' && target.kind !== 'video') throw new Error('目标节点类型无效');
      const stamp = iso();
      const nodes = [...graph.nodes];
      nodes[targetIndex] = CanvasNodeSchema.parse({
        ...target,
        output: { assetIds: assetIds.slice(0, 1) },
        runtime: { status: 'success', lastSuccessfulRunId: runId },
        updatedAt: stamp,
      });
      const edges = [...graph.edges];
      assetIds.slice(1).forEach((assetId, index) => {
        const siblingId = randomUUID();
        nodes.push(CanvasNodeSchema.parse({
          ...structuredClone(target), id: siblingId, title: `${target.title} · ${index + 2}`,
          variantOfNodeId: target.id,
          position: { x: target.position.x + (index + 1) * 44, y: target.position.y + (index + 1) * 44 },
          output: { assetIds: [assetId] }, runtime: { status: 'success', lastSuccessfulRunId: runId },
          createdAt: stamp, updatedAt: stamp,
        }));
        for (const edge of graph.edges.filter((item) => item.target === target.id)) {
          edges.push(CanvasEdgeSchema.parse({ ...edge, id: randomUUID(), target: siblingId, createdAt: stamp }));
        }
      });
      graph = GraphEnvelopeSchema.parse({ ...graph, revision: graph.revision + 1, nodes, edges, updatedAt: stamp });
      this.db.prepare('UPDATE graphs SET revision=?,snapshot_json=?,updated_at=? WHERE project_id=?')
        .run(graph.revision, JSON.stringify(graph), stamp, graph.projectId);
      this.db.prepare(`UPDATE runs SET status='SUCCEEDED',output_asset_ids_json=?,updated_at=?,finished_at=? WHERE id=?`)
        .run(JSON.stringify(assetIds), stamp, stamp, runId);
    });
    return { run: this.getRun(runId)!, graph };
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = work();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function mapProject(row: Row): Project {
  return ProjectSchema.parse({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at });
}

function mapModelConfiguration(row: Row, credentialConfigured: boolean): ModelConfiguration {
  return ModelConfigurationSchema.parse({
    id: row.id,
    displayName: row.display_name,
    modelName: row.model_name,
    endpoint: row.endpoint,
    modelType: row.model_type,
    visualKind: row.visual_kind,
    videoMode: row.video_mode,
    provider: row.provider,
    credentialConfigured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function inferLegacyVisualSettings(row: Row): Pick<ModelConfiguration, 'visualKind' | 'videoMode'> {
  const identifier = `${String(row.model_name)} ${String(row.endpoint)}`.toLowerCase();
  if (row.model_type !== 'vision' || !/(video|t2v|i2v|r2v)/.test(identifier)) {
    return { visualKind: 'image', videoMode: 'universal' };
  }
  const videoMode = identifier.includes('r2v') ? 'reference'
    : identifier.includes('t2v') ? 'text'
      : identifier.includes('i2v') ? 'first_last' : 'universal';
  return { visualKind: 'video', videoMode };
}

function modelCredentialId(id: string) { return `custom-model:${id}`; }

function mapRun(row: Row): InternalRunRecord {
  const publicRun = PublicRunRecordSchema.parse({
    id: row.id, projectId: row.project_id, nodeId: row.node_id,
    retryOfRunId: row.retry_of_run_id ?? undefined, status: row.status,
    providerId: row.provider_id, modelId: row.model_id, endpointId: row.endpoint_id,
    capability: row.capability,
    outputAssetIds: JSON.parse(String(row.output_asset_ids_json ?? '[]')),
    error: row.public_error_json ? PublicRunErrorSchema.parse(JSON.parse(String(row.public_error_json))) : undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at ?? undefined,
  });
  return {
    ...publicRun,
    inputSnapshot: JSON.parse(String(row.input_snapshot_json)),
    remoteTask: row.remote_task_json ? JSON.parse(String(row.remote_task_json)) : undefined,
  } as InternalRunRecord;
}

function mapAsset(row: Row): AssetRecord {
  return {
    id: String(row.id), kind: row.kind as AssetRecord['kind'], origin: row.origin as AssetRecord['origin'],
    mimeType: String(row.mime_type), relativePath: String(row.relative_path), fileName: String(row.file_name),
    bytes: Number(row.bytes), sha256: String(row.sha256),
    width: row.width == null ? undefined : Number(row.width), height: row.height == null ? undefined : Number(row.height),
    durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms),
    sourceUrl: row.source_url == null ? undefined : String(row.source_url),
    createdByRunId: row.created_by_run_id == null ? undefined : String(row.created_by_run_id),
    createdAt: String(row.created_at),
  };
}

const allowedTransitions: Record<RunStatus, RunStatus[]> = {
  QUEUED: ['PREPARING', 'CANCELLED', 'FAILED'],
  PREPARING: ['SUBMITTING', 'CANCELLED', 'FAILED'],
  SUBMITTING: ['WAITING_REMOTE', 'DOWNLOADING', 'FAILED', 'CANCEL_REQUESTED', 'INTERRUPTED'],
  WAITING_REMOTE: ['WAITING_REMOTE', 'DOWNLOADING', 'FAILED', 'CANCEL_REQUESTED'],
  DOWNLOADING: ['SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED'],
  SUCCEEDED: [], FAILED: [],
  CANCEL_REQUESTED: ['CANCELLED', 'CANCELLED_LOCAL_ONLY'],
  CANCELLED: [], CANCELLED_LOCAL_ONLY: [], INTERRUPTED: [],
};

function assertTransition(from: RunStatus, to: RunStatus) {
  if (from === to && from === 'WAITING_REMOTE') return;
  if (!allowedTransitions[from].includes(to)) throw new Error(`非法运行状态转换：${from} → ${to}`);
}
