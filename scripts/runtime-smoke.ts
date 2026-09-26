import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '@ilmheg/persistence';
import { AssetStore } from '@ilmheg/asset-store';
import { CredentialVault } from '@ilmheg/credential-vault';
import { RunOrchestrator } from '@ilmheg/runtime';
import { connectNodes, createNode } from '@ilmheg/domain';
import { ModelConfigurationSchema, PublicRunRecordSchema, type RunEvent } from '@ilmheg/contracts';
import { customModelProviderId } from '@ilmheg/model-catalog';

async function main() {
const root = await mkdtemp(path.join(tmpdir(), 'ilmheg-runtime-'));
let database: AppDatabase | undefined;
let orchestrator: RunOrchestrator | undefined;

try {
  database = new AppDatabase(path.join(root, 'canvas.db'));
  const project = database.createProject('Runtime smoke');
  const assets = new AssetStore(path.join(root, 'assets'), database);
  await assets.initialize();
  const vault = new CredentialVault(database, {
    isEncryptionAvailable: () => true,
    encryptString: (value) => new TextEncoder().encode(value),
    decryptString: (value) => new TextDecoder().decode(value),
    backend: () => 'smoke-test',
    secure: () => true,
  });
  const customModel = database.saveModelConfiguration({
    displayName: 'Smoke Vision', modelName: 'vision-smoke', provider: 'Local Smoke', modelType: 'vision',
    visualKind: 'image', videoMode: 'universal',
    endpoint: 'http://127.0.0.1:11434/v1/images/generations',
  });
  vault.put(customModelProviderId(customModel.id), 'smoke-key');
  const configuredModel = ModelConfigurationSchema.parse(database.getModelConfiguration(customModel.id));
  if (!configuredModel.credentialConfigured) throw new Error('自定义模型凭据关联未生效');
  const editedModel = database.saveModelConfiguration({ ...configuredModel, displayName: 'Smoke Vision Edited' });
  if (editedModel.id !== customModel.id) throw new Error('编辑自定义模型时 ID 发生变化');
  database.removeModelConfiguration(customModel.id);
  vault.delete(customModelProviderId(customModel.id));
  if (database.getModelConfiguration(customModel.id)) throw new Error('自定义模型删除失败');
  orchestrator = new RunOrchestrator(database, vault, assets);
  orchestrator.startScheduler();

  const image = createNode('image', { x: 120, y: 120 });
  image.config.prompt = 'a luminous garden floating above a quiet sea';
  const initial = database.loadGraph(project.id);
  const savedImageGraph = database.saveGraph({
    projectId: project.id,
    baseRevision: initial.revision,
    graph: { schemaVersion: 1, projectId: project.id, nodes: [image], edges: [], viewport: initial.viewport },
  });
  const imageDone = waitForSuccess(orchestrator, image.id);
  const queuedImage = orchestrator.start({ projectId: project.id, nodeId: image.id, expectedGraphRevision: savedImageGraph.revision });
  PublicRunRecordSchema.parse(queuedImage);
  await imageDone;

  const afterImage = database.loadGraph(project.id);
  const imageNode = afterImage.nodes.find((node) => node.id === image.id);
  if (imageNode?.kind !== 'image' || !imageNode.output.assetIds[0]) throw new Error('Mock 文生图未写回素材');
  await stat(assets.resolvePath(imageNode.output.assetIds[0]));
  orchestrator.list(project.id).forEach((run) => PublicRunRecordSchema.parse(run));

  const video = createNode('video', { x: 520, y: 120 });
  video.config.prompt = 'slow orbital camera movement, drifting particles';
  const withVideo = connectNodes({ ...afterImage, nodes: [...afterImage.nodes, video] }, { source: image.id, target: video.id, targetHandle: 'first_frame' });
  const savedVideoGraph = database.saveGraph({
    projectId: project.id,
    baseRevision: afterImage.revision,
    graph: { schemaVersion: 1, projectId: project.id, nodes: withVideo.nodes, edges: withVideo.edges, viewport: withVideo.viewport },
  });
  const videoDone = waitForSuccess(orchestrator, video.id);
  const queuedVideo = orchestrator.start({ projectId: project.id, nodeId: video.id, expectedGraphRevision: savedVideoGraph.revision });
  PublicRunRecordSchema.parse(queuedVideo);
  await videoDone;

  const afterVideo = database.loadGraph(project.id);
  const videoNode = afterVideo.nodes.find((node) => node.id === video.id);
  if (videoNode?.kind !== 'video' || !videoNode.output.assetIds[0]) throw new Error('Mock 图生视频未写回素材');
  const videoAsset = database.getAsset(videoNode.output.assetIds[0]);
  if (videoAsset?.kind !== 'video') throw new Error('视频输出素材类型错误');
  await stat(assets.resolvePath(videoAsset.id));
  orchestrator.list(project.id).forEach((run) => PublicRunRecordSchema.parse(run));

  process.stdout.write(`runtime smoke ok: image=${imageNode.output.assetIds[0]} video=${videoAsset.id}\n`);
} finally {
  orchestrator?.stopScheduler();
  database?.close();
  await rm(root, { recursive: true, force: true });
}
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

function waitForSuccess(runtime: RunOrchestrator, nodeId: string) {
  return new Promise<RunEvent>((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error(`运行超时：${nodeId}`)); }, 15_000);
    const unsubscribe = runtime.onChanged((event) => {
      if (event.run.nodeId !== nodeId) return;
      if (event.run.status === 'SUCCEEDED') { clearTimeout(timeout); unsubscribe(); resolve(event); }
      if (['FAILED', 'INTERRUPTED', 'CANCELLED', 'CANCELLED_LOCAL_ONLY'].includes(event.run.status)) {
        clearTimeout(timeout); unsubscribe(); reject(new Error(event.run.error?.message ?? event.run.status));
      }
    });
  });
}
