import { promises as fs } from 'node:fs';
import type { StartNodeRunInput, PublicRunError, PublicRunRecord, RunEvent } from '@ilmheg/contracts';
import type { AssetStore, ProviderOutput } from '@ilmheg/asset-store';
import type { CredentialVault } from '@ilmheg/credential-vault';
import { compileGraphRun, type CompiledRun } from '@ilmheg/graph-compiler';
import { getModel, getProvider, resolveCustomModel, type ResolvedModelManifest } from '@ilmheg/model-catalog';
import type { AppDatabase, InternalRunRecord } from '@ilmheg/persistence';
import { getAdapter, ProviderRequestError, type PreparedInput } from '@ilmheg/provider-adapters';

type EventListener = (event: RunEvent) => void;

export class RunOrchestrator {
  private readonly listeners = new Set<EventListener>();
  private readonly controllers = new Map<string, AbortController>();
  private scheduler?: ReturnType<typeof setInterval>;

  constructor(
    private readonly database: AppDatabase,
    private readonly vault: CredentialVault,
    private readonly assets: AssetStore,
  ) {}

  onChanged(listener: EventListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  start(input: StartNodeRunInput, retryOfRunId?: string): PublicRunRecord {
    const graph = this.database.loadGraph(input.projectId);
    if (graph.revision !== input.expectedGraphRevision) throw new Error(`GRAPH_REVISION_CONFLICT: 当前版本为 ${graph.revision}`);
    const compiled = compileGraphRun(graph, input.nodeId, (modelId) => this.resolveModel(modelId));
    if (compiled.requiresCredential && !this.vault.has(compiled.providerId)) {
      throw new Error('CREDENTIAL_MISSING: 请先在模型服务中配置凭据');
    }
    const run = this.database.createRun(compiled, retryOfRunId);
    this.emit(run);
    void this.execute(run.id, compiled);
    return toPublicRunRecord(run);
  }

  retry(runId: string) {
    const previous = this.database.getRun(runId);
    if (!previous) throw new Error('运行记录不存在');
    const graph = this.database.loadGraph(previous.projectId);
    return this.start({ projectId: previous.projectId, nodeId: previous.nodeId, expectedGraphRevision: graph.revision }, previous.id);
  }

  cancel(runId: string): PublicRunRecord {
    const current = this.database.getRun(runId);
    if (!current) throw new Error('运行记录不存在');
    if (current.status === 'QUEUED' || current.status === 'PREPARING') {
      const cancelled = this.database.updateRunStatus(runId, 'CANCELLED', { finished: true });
      this.emit(cancelled);
      this.controllers.get(runId)?.abort();
      return toPublicRunRecord(cancelled);
    }
    if (['SUBMITTING', 'WAITING_REMOTE', 'DOWNLOADING'].includes(current.status)) {
      const requested = this.database.updateRunStatus(runId, 'CANCEL_REQUESTED');
      this.emit(requested);
      this.controllers.get(runId)?.abort();
      const cancelled = this.database.updateRunStatus(runId, 'CANCELLED_LOCAL_ONLY', { finished: true });
      this.emit(cancelled);
      return toPublicRunRecord(cancelled);
    }
    return toPublicRunRecord(current);
  }

  list(projectId?: string): PublicRunRecord[] {
    return this.database.listRuns(projectId).map(toPublicRunRecord);
  }

  startScheduler() {
    this.recover();
    this.scheduler = setInterval(() => void this.pollDue(), 1000);
  }

  stopScheduler() {
    if (this.scheduler) clearInterval(this.scheduler);
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  private recover() {
    for (const run of this.database.listRecoverableRuns()) {
      if (run.status === 'QUEUED') void this.execute(run.id, this.rehydrate(run.inputSnapshot));
      else if (run.status === 'PREPARING') this.fail(run.id, { code: 'RUN_INTERRUPTED', message: '应用在准备输入时退出，请重试。', retryable: true });
      else if (run.status === 'SUBMITTING') this.fail(run.id, { code: 'RUN_INTERRUPTED', message: '应用在提交过程中退出。为避免重复计费，请手动重试。', retryable: true });
      else if (run.status === 'DOWNLOADING') this.fail(run.id, { code: 'RUN_INTERRUPTED', message: '结果下载被中断，请重试该任务。', retryable: true });
      else if (run.status === 'CANCEL_REQUESTED') {
        const cancelled = this.database.updateRunStatus(run.id, 'CANCELLED_LOCAL_ONLY', { finished: true });
        this.emit(cancelled);
      }
    }
  }

  private async execute(runId: string, compiled: CompiledRun) {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    try {
      const preparing = this.database.updateRunStatus(runId, 'PREPARING');
      this.emit(preparing);
      const input = await this.prepare(compiled);
      if (this.isCancelled(runId)) return;
      const submitting = this.database.updateRunStatus(runId, 'SUBMITTING');
      this.emit(submitting);
      const adapter = getAdapter(compiled.endpoint.protocol);
      const outcome = await this.withSecret(compiled.providerId, compiled.requiresCredential, (secret) => adapter.submit(input, secret, controller.signal));
      if (this.isCancelled(runId)) return;
      if (outcome.kind === 'remote') {
        const waiting = this.database.updateRunStatus(runId, 'WAITING_REMOTE', {
          remoteTask: {
            taskId: outcome.taskId,
            pollAttempt: 0,
            providerStatus: outcome.providerStatus,
            nextPollAt: new Date(Date.now() + (compiled.providerId === 'mock' ? 700 : 10_000)).toISOString(),
          },
        });
        this.emit(waiting);
      } else {
        await this.complete(runId, input, outcome.outputs);
      }
    } catch (error) {
      if (!this.isCancelled(runId)) this.fail(runId, toPublicError(error));
    } finally {
      this.controllers.delete(runId);
    }
  }

  private async pollDue() {
    const now = Date.now();
    const due = this.database.listRecoverableRuns().filter((run) =>
      run.status === 'WAITING_REMOTE' && run.remoteTask && Date.parse(run.remoteTask.nextPollAt) <= now && !this.controllers.has(run.id));
    await Promise.all(due.map((run) => this.poll(run)));
  }

  private async poll(run: InternalRunRecord) {
    const remote = run.remoteTask;
    if (!remote) return this.fail(run.id, { code: 'INTERNAL_ERROR', message: '远程任务信息缺失', retryable: false });
    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    try {
      const compiled = this.rehydrate(run.inputSnapshot);
      const input = await this.prepare(compiled);
      const adapter = getAdapter(compiled.endpoint.protocol);
      if (!adapter.poll) throw new Error('当前 Provider 不支持异步轮询');
      const outcome = await this.withSecret(compiled.providerId, compiled.requiresCredential, (secret) => adapter.poll!(input, remote.taskId, remote.pollAttempt, secret, controller.signal));
      if (this.isCancelled(run.id)) return;
      if (outcome.kind === 'pending') {
        const attempt = remote.pollAttempt + 1;
        if (attempt > 720) return this.fail(run.id, { code: 'REMOTE_TASK_TIMEOUT', message: '远程任务等待超时', retryable: true });
        const base = compiled.providerId === 'mock' ? 700 : attempt < 6 ? 5_000 : attempt < 30 ? 10_000 : 20_000;
        const waiting = this.database.updateRunStatus(run.id, 'WAITING_REMOTE', {
          remoteTask: { ...remote, pollAttempt: attempt, providerStatus: outcome.providerStatus, nextPollAt: new Date(Date.now() + base).toISOString() },
        });
        this.emit(waiting);
      } else if (outcome.kind === 'failed') {
        this.fail(run.id, { code: 'REMOTE_TASK_FAILED', message: outcome.message, retryable: true });
      } else {
        await this.complete(run.id, input, outcome.outputs);
      }
    } catch (error) {
      if (!this.isCancelled(run.id)) this.fail(run.id, toPublicError(error));
    } finally {
      this.controllers.delete(run.id);
    }
  }

  private async complete(runId: string, input: PreparedInput, outputs: ProviderOutput[]) {
    const downloading = this.database.updateRunStatus(runId, 'DOWNLOADING');
    this.emit(downloading);
    const kind = input.capability === 'image_to_video' ? 'video' : 'image';
    const assetIds: string[] = [];
    for (const output of outputs) {
      if (this.isCancelled(runId)) return;
      const asset = await this.assets.materialize(output, kind, runId);
      assetIds.push(asset.id);
    }
    const committed = this.database.commitRunSuccess(runId, assetIds);
    this.emit(committed.run, committed.graph.revision);
  }

  private async prepare(compiled: CompiledRun): Promise<PreparedInput> {
    const files = await Promise.all(compiled.inputAssets.map(async (input) => {
      const asset = this.database.getAsset(input.assetId);
      if (!asset) throw new Error(`INPUT_MISSING: 素材 ${input.assetId} 不存在`);
      const bytes = new Uint8Array(await fs.readFile(this.assets.resolvePath(asset.id)));
      return {
        assetId: asset.id, role: input.role, order: input.order, bytes,
        mimeType: asset.mimeType, fileName: asset.fileName,
        dataUrl: `data:${asset.mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
      };
    }));
    return { ...compiled, files };
  }

  private async withSecret<T>(providerId: string, required: boolean, work: (secret: string | undefined) => Promise<T>) {
    return required ? this.vault.withSecret(providerId, work) : work(undefined);
  }

  private resolveModel(modelId: string): ResolvedModelManifest {
    const configuration = this.database.getModelConfiguration(modelId);
    if (configuration) return resolveCustomModel(configuration);
    const model = getModel(modelId);
    const provider = getProvider(model.providerId);
    return { model, providerBaseUrl: provider.baseUrl, requiresCredential: provider.requiresCredential };
  }

  private rehydrate(snapshot: InternalRunRecord['inputSnapshot']): CompiledRun {
    const legacy = snapshot as CompiledRun & { model?: CompiledRun['model']; endpoint?: CompiledRun['endpoint']; requiresCredential?: boolean };
    if (legacy.model && legacy.endpoint) return { ...legacy, requiresCredential: legacy.requiresCredential ?? legacy.providerId !== 'mock' };
    const resolved = this.resolveModel(snapshot.modelId);
    const endpoint = resolved.model.endpoints.find((item) => item.id === snapshot.endpointId);
    if (!endpoint) throw new Error('MODEL_DISABLED: 运行使用的端点已不存在');
    return { ...snapshot, ...resolved, model: resolved.model, endpoint } as CompiledRun;
  }

  private isCancelled(runId: string) {
    const status = this.database.getRun(runId)?.status;
    return status === 'CANCEL_REQUESTED' || status === 'CANCELLED' || status === 'CANCELLED_LOCAL_ONLY';
  }

  private fail(runId: string, error: PublicRunError) {
    const run = this.database.getRun(runId);
    if (!run || ['FAILED', 'SUCCEEDED', 'CANCELLED', 'CANCELLED_LOCAL_ONLY', 'INTERRUPTED'].includes(run.status)) return;
    const target = run.status === 'SUBMITTING' && error.code === 'RUN_INTERRUPTED' ? 'INTERRUPTED' : 'FAILED';
    const failed = this.database.updateRunStatus(runId, target, { error, finished: true });
    this.emit(failed);
  }

  private emit(run: InternalRunRecord, graphRevision?: number) {
    const event: RunEvent = { type: 'run.changed', run: toPublicRunRecord(run), graphRevision };
    for (const listener of this.listeners) listener(event);
  }
}

export function toPublicRunRecord(run: InternalRunRecord): PublicRunRecord {
  const { inputSnapshot: _inputSnapshot, remoteTask: _remoteTask, ...publicRun } = run;
  return publicRun;
}

export function toPublicError(error: unknown): PublicRunError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ProviderRequestError) {
    if (error.status === 401 || error.status === 403) return { code: 'CREDENTIAL_REJECTED', message, retryable: true, providerStatus: error.status };
    if (error.status === 429) return { code: 'PROVIDER_RATE_LIMITED', message, retryable: true, providerStatus: error.status };
    if (error.status >= 500) return { code: 'PROVIDER_UNAVAILABLE', message, retryable: true, providerStatus: error.status };
    return { code: 'PROVIDER_BAD_REQUEST', message, retryable: false, providerStatus: error.status };
  }
  const match = message.match(/^([A-Z_]+):\s*(.*)$/s);
  const known = new Set(['CREDENTIAL_MISSING', 'CREDENTIAL_REJECTED', 'CREDENTIAL_UNREADABLE', 'MODEL_DISABLED', 'GRAPH_REVISION_CONFLICT', 'INPUT_MISSING', 'INPUT_LIMIT_EXCEEDED', 'UNSUPPORTED_BINDING', 'REMOTE_TASK_FAILED', 'REMOTE_TASK_TIMEOUT', 'RESULT_DOWNLOAD_FAILED', 'RESULT_UNSUPPORTED', 'RUN_INTERRUPTED']);
  const code = match && known.has(match[1]) ? match[1] as PublicRunError['code'] : 'INTERNAL_ERROR';
  return { code, message: (match?.[2] || message || '未知错误').slice(0, 1000), retryable: !['CREDENTIAL_UNREADABLE', 'INPUT_MISSING', 'INPUT_LIMIT_EXCEEDED', 'UNSUPPORTED_BINDING'].includes(code) };
}
