import type { CanvasDesktopApi, GraphEnvelope, ModelConfiguration, Project, PublicRunRecord, RunEvent } from '@ilmheg/contracts';
import { createEmptyGraph } from '@ilmheg/domain';
import { customModelToPublicModel, listPublicModels, providers } from '@ilmheg/model-catalog';

const listeners = new Set<(event: RunEvent) => void>();
const memory = {
  projects: [] as Project[],
  graphs: new Map<string, GraphEnvelope>(),
  runs: [] as PublicRunRecord[],
  modelConfigurations: [] as ModelConfiguration[],
  configuredProviders: new Set(['mock']),
};

function ensureDemo() {
  if (memory.projects.length) return;
  const stamp = new Date().toISOString();
  const project = { id: crypto.randomUUID(), name: '灵感草稿', createdAt: stamp, updatedAt: stamp };
  memory.projects.push(project);
  memory.graphs.set(project.id, createEmptyGraph(project.id));
}

const browserApi: CanvasDesktopApi = {
  health: async () => ({ ok: true, version: 'browser-preview' }),
  projects: {
    list: async () => { ensureDemo(); return structuredClone(memory.projects); },
    create: async ({ name }) => {
      const stamp = new Date().toISOString();
      const project = { id: crypto.randomUUID(), name, createdAt: stamp, updatedAt: stamp };
      memory.projects.unshift(project); memory.graphs.set(project.id, createEmptyGraph(project.id)); return structuredClone(project);
    },
    rename: async ({ id, name }) => {
      const project = memory.projects.find((item) => item.id === id);
      if (!project) throw new Error('项目不存在');
      project.name = name; project.updatedAt = new Date().toISOString(); return structuredClone(project);
    },
    remove: async (id) => { memory.projects = memory.projects.filter((item) => item.id !== id); memory.graphs.delete(id); },
    revealResources: async () => undefined,
  },
  graphs: {
    load: async (projectId) => structuredClone(memory.graphs.get(projectId) ?? createEmptyGraph(projectId)),
    save: async (input) => {
      const current = memory.graphs.get(input.projectId)!;
      if (current.revision !== input.baseRevision) throw new Error('GRAPH_REVISION_CONFLICT');
      const graph = { ...input.graph, revision: current.revision + 1, updatedAt: new Date().toISOString() } as GraphEnvelope;
      memory.graphs.set(input.projectId, graph); return structuredClone(graph);
    },
  },
  assets: { importLocal: async () => null, getMany: async () => [], reveal: async () => undefined },
  catalog: { list: async () => [
    ...listPublicModels().filter((model) => memory.configuredProviders.has(model.providerId)),
    ...memory.modelConfigurations.map(customModelToPublicModel),
  ] },
  modelConfigurations: {
    list: async () => structuredClone(memory.modelConfigurations),
    save: async (input) => {
      const current = input.id ? memory.modelConfigurations.find((item) => item.id === input.id) : undefined;
      const stamp = new Date().toISOString();
      const configuration: ModelConfiguration = {
        id: current?.id ?? crypto.randomUUID(),
        displayName: input.displayName,
        modelName: input.modelName,
        endpoint: input.endpoint,
        modelType: input.modelType,
        visualKind: input.visualKind,
        videoMode: input.videoMode,
        provider: input.provider,
        credentialConfigured: Boolean(input.apiKey?.trim()) || Boolean(current?.credentialConfigured),
        createdAt: current?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      memory.modelConfigurations = [configuration, ...memory.modelConfigurations.filter((item) => item.id !== configuration.id)];
      return structuredClone(configuration);
    },
    remove: async (id) => { memory.modelConfigurations = memory.modelConfigurations.filter((item) => item.id !== id); },
    test: async () => ({ ok: true, message: '浏览器预览模式' }),
  },
  providers: {
    list: async () => providers.map((provider) => ({ id: provider.id, displayName: provider.displayName, configured: memory.configuredProviders.has(provider.id), requiresCredential: provider.requiresCredential, enabled: true, backend: 'browser-preview', secure: false })),
    putCredential: async ({ providerId }) => { memory.configuredProviders.add(providerId); return { id: providerId, displayName: providers.find((item) => item.id === providerId)?.displayName ?? providerId, configured: true, requiresCredential: true, enabled: true, backend: 'browser-preview', secure: false }; },
    deleteCredential: async (providerId) => { memory.configuredProviders.delete(providerId); },
    test: async () => ({ ok: true, message: '浏览器预览模式' }),
  },
  runs: {
    start: async (input) => {
      const graph = memory.graphs.get(input.projectId)!;
      const node = graph.nodes.find((item) => item.id === input.nodeId);
      const stamp = new Date().toISOString();
      const modelId = node && node.kind !== 'group' ? node.config.model?.modelId ?? 'mock-image' : 'mock-image';
      const run: PublicRunRecord = {
        id: crypto.randomUUID(), projectId: input.projectId, nodeId: input.nodeId, status: 'QUEUED',
        providerId: 'mock', modelId, endpointId: 'preview',
        capability: node?.kind === 'video' ? 'image_to_video' : 'text_to_image', outputAssetIds: [], createdAt: stamp, updatedAt: stamp,
      };
      memory.runs.unshift(run);
      setTimeout(() => {
        run.status = 'SUCCEEDED'; run.updatedAt = new Date().toISOString(); run.finishedAt = run.updatedAt;
        listeners.forEach((listener) => listener({ type: 'run.changed', run: structuredClone(run) }));
      }, 900);
      return structuredClone(run);
    },
    cancel: async (id) => { const run = memory.runs.find((item) => item.id === id)!; run.status = 'CANCELLED_LOCAL_ONLY'; return structuredClone(run); },
    retry: async (id) => { const run = memory.runs.find((item) => item.id === id)!; return browserApi.runs.start({ projectId: run.projectId, nodeId: run.nodeId, expectedGraphRevision: memory.graphs.get(run.projectId)!.revision }); },
    list: async (projectId) => structuredClone(memory.runs.filter((run) => !projectId || run.projectId === projectId)),
    onChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  },
};

export const canvasApi = window.canvasApi ?? browserApi;
export const isDesktop = Boolean(window.canvasApi);
