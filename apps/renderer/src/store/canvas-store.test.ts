import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasDesktopApi, GraphEnvelope, Project, PublicRunRecord } from '@ilmheg/contracts';
import { createEmptyGraph } from '@ilmheg/domain';
import { listPublicModels } from '@ilmheg/model-catalog';

const mock = vi.hoisted(() => {
  const projects: Project[] = [];
  const graphs = new Map<string, GraphEnvelope>();
  let saveCalls = 0;
  let revealedProjectId: string | undefined;
  const api: CanvasDesktopApi = {
    health: async () => ({ ok: true, version: 'test' }),
    projects: {
      list: async () => structuredClone(projects),
      create: async ({ name }) => {
        const stamp = new Date().toISOString();
        const project = { id: crypto.randomUUID(), name, createdAt: stamp, updatedAt: stamp };
        projects.unshift(project);
        graphs.set(project.id, createEmptyGraph(project.id));
        return structuredClone(project);
      },
      rename: async ({ id, name }) => {
        const project = projects.find((item) => item.id === id)!;
        project.name = name;
        return structuredClone(project);
      },
      remove: async () => undefined,
      revealResources: async (id) => { revealedProjectId = id; },
    },
    graphs: {
      load: async (projectId) => structuredClone(graphs.get(projectId)!),
      save: async (input) => {
        saveCalls += 1;
        const current = graphs.get(input.projectId)!;
        if (current.revision !== input.baseRevision) throw new Error('GRAPH_REVISION_CONFLICT');
        const saved = { ...input.graph, revision: current.revision + 1, updatedAt: new Date().toISOString() } as GraphEnvelope;
        graphs.set(input.projectId, saved);
        return structuredClone(saved);
      },
    },
    assets: { importLocal: async () => null, getMany: async () => [], reveal: async () => undefined },
    catalog: { list: async () => listPublicModels() },
    modelConfigurations: { list: async () => [], save: async () => { throw new Error('unused'); }, remove: async () => undefined, test: async () => ({ ok: true, message: 'ok' }) },
    providers: { list: async () => [], putCredential: async () => { throw new Error('unused'); }, deleteCredential: async () => undefined, test: async () => ({ ok: true, message: 'ok' }) },
    runs: {
      start: async (input) => {
        const graph = graphs.get(input.projectId)!;
        const node = graph.nodes.find((item) => item.id === input.nodeId);
        if (!node) throw new Error('目标节点不存在');
        const stamp = new Date().toISOString();
        return {
          id: crypto.randomUUID(), projectId: input.projectId, nodeId: input.nodeId, status: 'QUEUED',
          providerId: 'mock', modelId: node.kind === 'video' ? 'mock-video' : 'mock-image', endpointId: 'mock',
          capability: node.kind === 'video' ? 'image_to_video' : 'text_to_image', outputAssetIds: [], createdAt: stamp, updatedAt: stamp,
        } satisfies PublicRunRecord;
      },
      cancel: async () => { throw new Error('unused'); },
      retry: async () => { throw new Error('unused'); },
      list: async () => [],
      onChanged: () => () => undefined,
    },
  };
  return {
    api,
    projects,
    graphs,
    getSaveCalls: () => saveCalls,
    resetSaveCalls: () => { saveCalls = 0; },
    getRevealedProjectId: () => revealedProjectId,
    resetRevealedProjectId: () => { revealedProjectId = undefined; },
  };
});

vi.mock('@/lib/platform', () => ({ canvasApi: mock.api }));

import { useCanvasStore } from './canvas-store';

describe('canvas store save-before-run', () => {
  beforeEach(async () => {
    mock.projects.length = 0;
    mock.graphs.clear();
    mock.resetSaveCalls();
    mock.resetRevealedProjectId();
    useCanvasStore.setState({ initialized: false, loading: true, projects: [], graph: undefined, currentProjectId: undefined, notice: undefined });
    await useCanvasStore.getState().initialize();
  });

  it('persists the first node after a no-op project flush before starting its run', async () => {
    await useCanvasStore.getState().createProject();
    useCanvasStore.getState().addNode('image');
    const nodeId = useCanvasStore.getState().graph!.nodes[0]!.id;

    await useCanvasStore.getState().startRun(nodeId);

    const projectId = useCanvasStore.getState().currentProjectId!;
    expect(mock.getSaveCalls()).toBe(1);
    expect(mock.graphs.get(projectId)?.nodes.map((node) => node.id)).toContain(nodeId);
    expect(useCanvasStore.getState().runs[0]?.nodeId).toBe(nodeId);
    expect(useCanvasStore.getState().notice).toBeUndefined();
  });

  it('creates an image to video connection from either spatial side', async () => {
    await useCanvasStore.getState().createProject();
    useCanvasStore.getState().addNode('image');
    const image = useCanvasStore.getState().graph!.nodes[0]!;

    useCanvasStore.getState().addConnectedNode(image.id, 'left', 'video', { x: -240, y: 120 });

    const graph = useCanvasStore.getState().graph!;
    const video = graph.nodes.find((node) => node.kind === 'video')!;
    expect(graph.edges).toMatchObject([{
      source: image.id,
      target: video.id,
      binding: { kind: 'first_frame' },
    }]);
  });

  it('creates a node at an explicit canvas position', async () => {
    await useCanvasStore.getState().createProject();

    useCanvasStore.getState().addNode('prompt', { x: -135.5, y: 428 });

    expect(useCanvasStore.getState().graph!.nodes[0]).toMatchObject({
      kind: 'prompt',
      position: { x: -135.5, y: 428 },
    });
  });

  it('updates a reference source binding through the undoable graph history', async () => {
    await useCanvasStore.getState().createProject();
    useCanvasStore.getState().addNode('image');
    useCanvasStore.getState().addNode('video');
    const [image, video] = useCanvasStore.getState().graph!.nodes;
    useCanvasStore.getState().connect(image!.id, video!.id);
    const edge = useCanvasStore.getState().graph!.edges[0]!;
    const historyLength = useCanvasStore.getState().past.length;

    useCanvasStore.getState().setEdgeBinding(edge.id, 'reference_image');

    expect(useCanvasStore.getState().graph!.edges[0]!.binding).toEqual({ kind: 'reference_image', index: 0 });
    expect(useCanvasStore.getState().past).toHaveLength(historyLength + 1);
  });

  it('reveals resources for the requested project without switching projects', async () => {
    const currentProjectId = useCanvasStore.getState().currentProjectId!;
    const target = await mock.api.projects.create({ name: '资源项目' });

    await useCanvasStore.getState().revealProjectResources(target.id);

    expect(mock.getRevealedProjectId()).toBe(target.id);
    expect(useCanvasStore.getState().currentProjectId).toBe(currentProjectId);
  });
});
