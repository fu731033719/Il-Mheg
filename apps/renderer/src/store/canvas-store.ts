import { create } from 'zustand';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeKind,
  GraphEnvelope,
  ModelConfiguration,
  Project,
  ProviderState,
  PublicAsset,
  PublicModel,
  PublicRunRecord,
  InputBinding,
} from '@ilmheg/contracts';
import {
  autoLayout,
  cloneNodes,
  connectNodes,
  createNode,
  removeNodes,
  updateEdgeBinding,
} from '@ilmheg/domain';
import { connectionForDrop, type ConnectionSide } from '@/lib/node-connections';
import { AsyncGate } from '@/lib/async-gate';
import { canvasNodeFlowSize } from '@/lib/flow-node-layout';
import { canvasApi } from '@/lib/platform';

interface CanvasState {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  projects: Project[];
  currentProjectId?: string;
  graph?: GraphEnvelope;
  models: PublicModel[];
  modelConfigurations: ModelConfiguration[];
  providers: ProviderState[];
  assets: Record<string, PublicAsset>;
  runs: PublicRunRecord[];
  selectedNodeIds: string[];
  selectedEdgeId?: string;
  past: GraphEnvelope[];
  future: GraphEnvelope[];
  clipboardNodeIds: string[];
  notice?: { kind: 'error' | 'success' | 'info'; message: string };
  initialize(): Promise<void>;
  selectProject(id: string): Promise<void>;
  createProject(): Promise<void>;
  renameProject(id: string, name: string): Promise<void>;
  removeProject(id: string): Promise<void>;
  revealProjectResources(id: string): Promise<void>;
  select(nodeIds: string[], edgeId?: string): void;
  commit(transform: (graph: GraphEnvelope) => GraphEnvelope): void;
  preview(transform: (graph: GraphEnvelope) => GraphEnvelope): void;
  finalizeGesture(previous: GraphEnvelope): void;
  addNode(kind: CanvasNodeKind, position?: { x: number; y: number }): void;
  addConnectedNode(originNodeId: string, side: ConnectionSide, kind: Exclude<CanvasNodeKind, 'group'>, position: { x: number; y: number }): void;
  patchNode(nodeId: string, patch: (node: CanvasNode) => CanvasNode): void;
  removeSelected(): void;
  duplicateSelected(): void;
  copySelected(): void;
  paste(): void;
  connect(source: string, target: string, targetHandle?: string | null): void;
  setEdgeBinding(edgeId: string, kind: InputBinding['kind']): void;
  removeEdge(edgeId: string): void;
  layout(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  undo(): void;
  redo(): void;
  setViewport(viewport: GraphEnvelope['viewport']): void;
  importAsset(nodeId: string): Promise<void>;
  startRun(nodeId: string): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  retryRun(runId: string): Promise<void>;
  refreshProviders(): Promise<void>;
  refreshModelCatalog(): Promise<void>;
  dismissNotice(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const saveGate = new AsyncGate();
let changeSerial = 0;
let savedSerial = 0;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  initialized: false,
  loading: true,
  saving: false,
  projects: [],
  models: [],
  modelConfigurations: [],
  providers: [],
  assets: {},
  runs: [],
  selectedNodeIds: [],
  past: [],
  future: [],
  clipboardNodeIds: [],

  initialize: async () => {
    try {
      const [projects, models, providers, modelConfigurations] = await Promise.all([
        canvasApi.projects.list(), canvasApi.catalog.list(), canvasApi.providers.list(), canvasApi.modelConfigurations.list(),
      ]);
      const current = projects[0] ?? await canvasApi.projects.create({ name: '灵感草稿' });
      set({ projects: projects.length ? projects : [current], models, providers, modelConfigurations, currentProjectId: current.id });
      await loadProject(current.id, set, get);
      canvasApi.runs.onChanged((event) => {
        const runs = [event.run, ...get().runs.filter((run) => run.id !== event.run.id)];
        set({ runs });
        if (event.graphRevision !== undefined && event.run.projectId === get().currentProjectId) {
          void flushSave(get, set).then(() => loadProject(event.run.projectId, set, get)).catch(() => undefined);
        }
      });
      set({ initialized: true, loading: false });
    } catch (error) {
      set({ loading: false, notice: { kind: 'error', message: messageOf(error) } });
    }
  },

  selectProject: async (id) => {
    if (id === get().currentProjectId) return;
    try { await flushSave(get, set); } catch { return; }
    set({ currentProjectId: id, loading: true, selectedNodeIds: [], selectedEdgeId: undefined, past: [], future: [] });
    await loadProject(id, set, get);
    set({ loading: false });
  },

  createProject: async () => {
    try { await flushSave(get, set); } catch { return; }
    const project = await canvasApi.projects.create({ name: `未命名项目 ${get().projects.length + 1}` });
    set({ projects: [project, ...get().projects], currentProjectId: project.id, loading: true, past: [], future: [] });
    await loadProject(project.id, set, get);
    set({ loading: false });
  },

  renameProject: async (id, name) => {
    try {
      const project = await canvasApi.projects.rename({ id, name });
      set({ projects: get().projects.map((item) => item.id === id ? project : item) });
    } catch (error) { notifyError(set, error); }
  },

  removeProject: async (id) => {
    if (get().projects.length <= 1) return set({ notice: { kind: 'info', message: '至少保留一个项目' } });
    try { await flushSave(get, set); } catch { return; }
    await canvasApi.projects.remove(id);
    const projects = get().projects.filter((project) => project.id !== id);
    set({ projects });
    if (get().currentProjectId === id) await get().selectProject(projects[0]!.id);
  },

  revealProjectResources: async (id) => {
    try { await canvasApi.projects.revealResources(id); }
    catch (error) { notifyError(set, error); }
  },

  select: (selectedNodeIds, selectedEdgeId) => {
    const current = get();
    const incoming = new Set(selectedNodeIds);
    const sameNodes = current.selectedNodeIds.length === incoming.size && current.selectedNodeIds.every((id) => incoming.has(id));
    if (!sameNodes || current.selectedEdgeId !== selectedEdgeId) set({ selectedNodeIds, selectedEdgeId });
  },

  commit: (transform) => {
    const current = get().graph;
    if (!current) return;
    try {
      const next = transform(structuredClone(current));
      changeSerial += 1;
      set({ graph: next, past: [...get().past.slice(-99), current], future: [] });
      scheduleSave(get, set);
    } catch (error) { notifyError(set, error); }
  },

  preview: (transform) => {
    const current = get().graph;
    if (!current) return;
    const next = transform(current);
    if (next !== current) set({ graph: next });
  },

  finalizeGesture: (previous) => {
    if (!get().graph) return;
    changeSerial += 1;
    set({ past: [...get().past.slice(-99), previous], future: [] });
    scheduleSave(get, set);
  },

  addNode: (kind, position) => get().commit((graph) => ({
    ...graph,
    nodes: [...graph.nodes, createNode(kind, position ?? nextNodePosition(graph.nodes.length))],
  })),

  addConnectedNode: (originNodeId, side, kind, position) => {
    const graph = get().graph;
    if (!graph?.nodes.some((node) => node.id === originNodeId)) return;
    const node = createNode(kind, position);
    get().commit((current) => {
      const withNode = { ...current, nodes: [...current.nodes, node] };
      const origin = current.nodes.find((item) => item.id === originNodeId);
      if (!origin || origin.kind === 'group') return current;
      const connection = connectionForDrop(
        { id: origin.id, kind: origin.kind },
        { id: node.id, kind: node.kind as Exclude<CanvasNodeKind, 'group'> },
        side,
      );
      return connection ? connectNodes(withNode, connection) : current;
    });
    set({ selectedNodeIds: [node.id], selectedEdgeId: undefined });
  },

  patchNode: (nodeId, patch) => get().commit((graph) => ({
    ...graph,
    nodes: graph.nodes.map((node) => node.id === nodeId ? patch(node) : node),
  })),

  removeSelected: () => {
    if (get().selectedEdgeId) get().removeEdge(get().selectedEdgeId!);
    else if (get().selectedNodeIds.length) {
      get().commit((graph) => removeNodes(graph, get().selectedNodeIds));
      set({ selectedNodeIds: [] });
    }
  },

  duplicateSelected: () => {
    if (!get().selectedNodeIds.length) return;
    get().commit((graph) => cloneNodes(graph, get().selectedNodeIds));
  },
  copySelected: () => set({ clipboardNodeIds: get().selectedNodeIds }),
  paste: () => { if (get().clipboardNodeIds.length) get().commit((graph) => cloneNodes(graph, get().clipboardNodeIds, { x: 72, y: 72 })); },

  connect: (source, target, targetHandle) => get().commit((graph) => connectNodes(graph, { source, target, targetHandle })),
  setEdgeBinding: (edgeId, kind) => get().commit((graph) => updateEdgeBinding(graph, edgeId, kind)),
  removeEdge: (edgeId) => {
    get().commit((graph) => ({ ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) }));
    set({ selectedEdgeId: undefined });
  },
  layout: () => get().commit(autoLayout),

  groupSelected: () => {
    const ids = get().selectedNodeIds;
    if (ids.length < 2) return set({ notice: { kind: 'info', message: '至少选择两个节点才能分组' } });
    get().commit((graph) => {
      const selected = graph.nodes.filter((node) => ids.includes(node.id) && !node.parentId && node.kind !== 'group');
      if (selected.length < 2) return graph;
      const minX = Math.min(...selected.map((node) => node.position.x));
      const minY = Math.min(...selected.map((node) => node.position.y));
      const maxX = Math.max(...selected.map((node) => node.position.x + canvasNodeFlowSize(node).width));
      const maxY = Math.max(...selected.map((node) => node.position.y + canvasNodeFlowSize(node).height));
      const group = createNode('group', { x: minX - 48, y: minY - 72 });
      group.size = { width: maxX - minX + 96, height: maxY - minY + 120 };
      const nodes = graph.nodes.map((node) => ids.includes(node.id)
        ? { ...node, parentId: group.id, position: { x: node.position.x - group.position.x, y: node.position.y - group.position.y } } as CanvasNode
        : node);
      return { ...graph, nodes: [group, ...nodes] };
    });
  },

  ungroupSelected: () => {
    const groupId = get().selectedNodeIds.find((id) => get().graph?.nodes.find((node) => node.id === id)?.kind === 'group');
    if (!groupId) return;
    get().commit((graph) => {
      const group = graph.nodes.find((node) => node.id === groupId)!;
      const nodes = graph.nodes.filter((node) => node.id !== groupId).map((node) => node.parentId === groupId
        ? { ...node, parentId: undefined, position: { x: node.position.x + group.position.x, y: node.position.y + group.position.y } } as CanvasNode
        : node);
      return { ...graph, nodes };
    });
    set({ selectedNodeIds: [] });
  },

  undo: () => {
    const previous = get().past.at(-1);
    const current = get().graph;
    if (!previous || !current) return;
    const restored = { ...current, nodes: previous.nodes, edges: previous.edges, viewport: previous.viewport };
    changeSerial += 1;
    set({ graph: restored, past: get().past.slice(0, -1), future: [current, ...get().future.slice(0, 99)] });
    scheduleSave(get, set);
  },
  redo: () => {
    const next = get().future[0];
    const current = get().graph;
    if (!next || !current) return;
    const restored = { ...current, nodes: next.nodes, edges: next.edges, viewport: next.viewport };
    changeSerial += 1;
    set({ graph: restored, past: [...get().past, current], future: get().future.slice(1) });
    scheduleSave(get, set);
  },

  setViewport: (viewport) => {
    const current = get().graph;
    if (!current) return;
    if (sameViewport(current.viewport, viewport)) return;
    changeSerial += 1;
    set({ graph: { ...current, viewport } });
    scheduleSave(get, set);
  },

  importAsset: async (nodeId) => {
    try {
      const asset = await canvasApi.assets.importLocal({ kind: 'image' });
      if (!asset) return;
      set({ assets: { ...get().assets, [asset.id]: asset } });
      get().patchNode(nodeId, (node) => node.kind === 'image' ? { ...node, config: { ...node.config, sourceAssetId: asset.id }, updatedAt: new Date().toISOString() } : node);
    } catch (error) { notifyError(set, error); }
  },

  startRun: async (nodeId) => {
    try {
      await flushSave(get, set);
      const graph = get().graph!;
      const run = await canvasApi.runs.start({ projectId: graph.projectId, nodeId, expectedGraphRevision: graph.revision });
      set({ runs: [run, ...get().runs.filter((item) => item.id !== run.id)] });
    } catch (error) { notifyError(set, error); }
  },
  cancelRun: async (runId) => { try { const run = await canvasApi.runs.cancel(runId); set({ runs: [run, ...get().runs.filter((item) => item.id !== run.id)] }); } catch (error) { notifyError(set, error); } },
  retryRun: async (runId) => { try { const run = await canvasApi.runs.retry(runId); set({ runs: [run, ...get().runs] }); } catch (error) { notifyError(set, error); } },
  refreshProviders: async () => {
    const [providers, models] = await Promise.all([canvasApi.providers.list(), canvasApi.catalog.list()]);
    set({ providers, models });
  },
  refreshModelCatalog: async () => {
    const [models, modelConfigurations] = await Promise.all([canvasApi.catalog.list(), canvasApi.modelConfigurations.list()]);
    set({ models, modelConfigurations });
  },
  dismissNotice: () => set({ notice: undefined }),
}));

async function loadProject(projectId: string, set: (state: Partial<CanvasState>) => void, get: () => CanvasState) {
  const [graph, runs] = await Promise.all([canvasApi.graphs.load(projectId), canvasApi.runs.list(projectId)]);
  const assetIds = graph.nodes.flatMap((node) => {
    if (node.kind === 'image') return [...node.output.assetIds, ...(node.config.sourceAssetId ? [node.config.sourceAssetId] : [])];
    if (node.kind === 'video') return node.output.assetIds;
    return [];
  });
  const assets = await canvasApi.assets.getMany([...new Set(assetIds)]);
  changeSerial = 0; savedSerial = 0;
  set({ graph, runs, assets: Object.fromEntries(assets.map((asset) => [asset.id, asset])), past: [], future: [], selectedNodeIds: [], selectedEdgeId: undefined });
}

function scheduleSave(get: () => CanvasState, set: (state: Partial<CanvasState>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushSave(get, set).catch(() => undefined); }, 450);
}

async function flushSave(get: () => CanvasState, set: (state: Partial<CanvasState>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  return saveGate.run(async () => {
    set({ saving: true });
    try {
      while (savedSerial < changeSerial) {
        const graph = get().graph;
        if (!graph) break;
        const serial = changeSerial;
        const saved = await canvasApi.graphs.save({
          projectId: graph.projectId,
          baseRevision: graph.revision,
          graph: { schemaVersion: 1, projectId: graph.projectId, nodes: graph.nodes, edges: graph.edges, viewport: graph.viewport },
        });
        const current = get().graph;
        if (current && current.projectId === saved.projectId) set({ graph: { ...current, revision: saved.revision, updatedAt: saved.updatedAt } });
        savedSerial = serial;
      }
    } catch (error) {
      notifyError(set, error);
      throw error;
    } finally { set({ saving: false }); }
  });
}

function nextNodePosition(count: number) {
  return { x: 120 + (count % 3) * 320, y: 100 + Math.floor(count / 3) * 300 };
}
function sameViewport(left: GraphEnvelope['viewport'], right: GraphEnvelope['viewport']) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}
function messageOf(error: unknown) { return error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, '') : String(error); }
function notifyError(set: (state: Partial<CanvasState>) => void, error: unknown) { set({ notice: { kind: 'error', message: messageOf(error) } }); }
