import { z } from 'zod';

export const IdSchema = z.string().uuid();
export type EntityId = z.infer<typeof IdSchema>;

export const PositionSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const SizeSchema = z.object({ width: z.number().positive(), height: z.number().positive() }).strict();
export const RuntimeStatusSchema = z.enum([
  'idle',
  'queued',
  'running',
  'waiting',
  'downloading',
  'success',
  'error',
  'cancelled',
  'interrupted',
]);

export const RunErrorCodeSchema = z.enum([
  'CREDENTIAL_MISSING',
  'CREDENTIAL_REJECTED',
  'MODEL_DISABLED',
  'GRAPH_REVISION_CONFLICT',
  'INPUT_MISSING',
  'INPUT_LIMIT_EXCEEDED',
  'UNSUPPORTED_BINDING',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_BAD_REQUEST',
  'PROVIDER_UNAVAILABLE',
  'REMOTE_TASK_FAILED',
  'REMOTE_TASK_TIMEOUT',
  'RESULT_DOWNLOAD_FAILED',
  'RESULT_UNSUPPORTED',
  'RUN_INTERRUPTED',
  'INTERNAL_ERROR',
]);

export const PublicRunErrorSchema = z.object({
  code: RunErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  providerStatus: z.number().int().optional(),
}).strict();
export type PublicRunError = z.infer<typeof PublicRunErrorSchema>;

export const NodeRuntimeSchema = z.object({
  status: RuntimeStatusSchema.default('idle'),
  activeRunId: IdSchema.optional(),
  lastSuccessfulRunId: IdSchema.optional(),
  progress: z.number().min(0).max(1).optional(),
  message: z.string().optional(),
  error: PublicRunErrorSchema.optional(),
}).strict();

export const ModelSelectionSchema = z.object({
  modelId: z.string().min(1).optional(),
  endpointId: z.string().min(1).optional(),
  params: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;

const NodeBaseShape = {
  id: IdSchema,
  title: z.string().min(1).max(120),
  position: PositionSchema,
  size: SizeSchema.optional(),
  parentId: IdSchema.optional(),
  variantOfNodeId: IdSchema.optional(),
  runtime: NodeRuntimeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};

export const PromptNodeSchema = z.object({
  ...NodeBaseShape,
  kind: z.literal('prompt'),
  config: z.object({ prompt: z.string(), model: ModelSelectionSchema.optional() }).strict(),
  output: z.object({ text: z.string().optional() }).strict(),
}).strict();

export const ImageNodeSchema = z.object({
  ...NodeBaseShape,
  kind: z.literal('image'),
  config: z.object({
    prompt: z.string(),
    model: ModelSelectionSchema.optional(),
    sourceAssetId: IdSchema.optional(),
    regenerationPolicy: z.enum(['variant', 'replace']).default('variant'),
  }).strict(),
  output: z.object({ assetIds: z.array(IdSchema) }).strict(),
}).strict();

export const VideoNodeSchema = z.object({
  ...NodeBaseShape,
  kind: z.literal('video'),
  config: z.object({
    prompt: z.string(),
    model: ModelSelectionSchema.optional(),
    regenerationPolicy: z.enum(['variant', 'replace']).default('variant'),
  }).strict(),
  output: z.object({ assetIds: z.array(IdSchema) }).strict(),
}).strict();

export const GroupNodeSchema = z.object({
  ...NodeBaseShape,
  kind: z.literal('group'),
  config: z.object({ layout: z.enum(['free', 'horizontal', 'vertical']) }).strict(),
  output: z.object({}).strict(),
}).strict();

export const CanvasNodeSchema = z.discriminatedUnion('kind', [
  PromptNodeSchema,
  ImageNodeSchema,
  VideoNodeSchema,
  GroupNodeSchema,
]);
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;
export type CanvasNodeKind = CanvasNode['kind'];
export type PromptNode = z.infer<typeof PromptNodeSchema>;
export type ImageNode = z.infer<typeof ImageNodeSchema>;
export type VideoNode = z.infer<typeof VideoNodeSchema>;
export type GroupNode = z.infer<typeof GroupNodeSchema>;

export const InputBindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prompt') }).strict(),
  z.object({ kind: z.literal('source_image'), index: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('first_frame') }).strict(),
  z.object({ kind: z.literal('last_frame') }).strict(),
  z.object({ kind: z.literal('reference_image'), index: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('source_video'), index: z.number().int().nonnegative() }).strict(),
]);
export type InputBinding = z.infer<typeof InputBindingSchema>;

export const CanvasEdgeSchema = z.object({
  id: IdSchema,
  source: IdSchema,
  target: IdSchema,
  binding: InputBindingSchema,
  createdAt: z.string().datetime(),
}).strict();
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const ViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().positive().max(8),
}).strict();

export const GraphEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: IdSchema,
  revision: z.number().int().nonnegative(),
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
  viewport: ViewportSchema,
  updatedAt: z.string().datetime(),
}).strict();
export type GraphEnvelope = z.infer<typeof GraphEnvelopeSchema>;

export const SaveGraphInputSchema = z.object({
  projectId: IdSchema,
  baseRevision: z.number().int().nonnegative(),
  graph: z.object({
    schemaVersion: z.literal(1),
    projectId: IdSchema,
    nodes: z.array(CanvasNodeSchema),
    edges: z.array(CanvasEdgeSchema),
    viewport: ViewportSchema,
  }).strict(),
}).strict();
export type SaveGraphInput = z.infer<typeof SaveGraphInputSchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type Project = z.infer<typeof ProjectSchema>;
export const CreateProjectInputSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
export const RenameProjectInputSchema = z.object({ id: IdSchema, name: z.string().trim().min(1).max(120) }).strict();

export const AssetKindSchema = z.enum(['image', 'video']);
export const PublicAssetSchema = z.object({
  id: IdSchema,
  kind: AssetKindSchema,
  origin: z.enum(['imported', 'generated', 'downloaded']),
  mimeType: z.string(),
  fileName: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  url: z.string(),
  createdAt: z.string().datetime(),
}).strict();
export type PublicAsset = z.infer<typeof PublicAssetSchema>;

export const RunStatusSchema = z.enum([
  'QUEUED', 'PREPARING', 'SUBMITTING', 'WAITING_REMOTE', 'DOWNLOADING',
  'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED',
  'CANCELLED_LOCAL_ONLY', 'INTERRUPTED',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const PublicRunRecordSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  nodeId: IdSchema,
  retryOfRunId: IdSchema.optional(),
  status: RunStatusSchema,
  providerId: z.string(),
  modelId: z.string(),
  endpointId: z.string(),
  capability: z.enum(['text_to_image', 'image_to_image', 'image_to_video']),
  outputAssetIds: z.array(IdSchema),
  error: PublicRunErrorSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
}).strict();
export type PublicRunRecord = z.infer<typeof PublicRunRecordSchema>;

export const StartNodeRunInputSchema = z.object({
  projectId: IdSchema,
  nodeId: IdSchema,
  expectedGraphRevision: z.number().int().nonnegative(),
}).strict();
export type StartNodeRunInput = z.infer<typeof StartNodeRunInputSchema>;

export const RunEventSchema = z.object({
  type: z.literal('run.changed'),
  run: PublicRunRecordSchema,
  graphRevision: z.number().int().nonnegative().optional(),
}).strict();
export type RunEvent = z.infer<typeof RunEventSchema>;

export const ParamFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'select', 'boolean']),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }).strict()).optional(),
  defaultValue: z.unknown().optional(),
}).strict();
export type ParamField = z.infer<typeof ParamFieldSchema>;

export const PublicModelSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  providerName: z.string().optional(),
  providerLogoPath: z.string().optional(),
  displayName: z.string(),
  kind: z.enum(['image', 'video']),
  modelType: z.enum(['language', 'vision', 'multimodal', 'speech']),
  source: z.enum(['builtin', 'custom']),
  compatibleNodeKinds: z.array(z.enum(['prompt', 'image', 'video'])),
  description: z.string(),
  endpoints: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    capabilities: z.array(z.enum(['text_to_image', 'image_to_image', 'image_to_video'])),
    params: z.array(ParamFieldSchema),
  }).strict()),
}).strict();
export type PublicModel = z.infer<typeof PublicModelSchema>;

export const ModelTypeSchema = z.enum(['language', 'vision', 'multimodal', 'speech']);
export type ModelType = z.infer<typeof ModelTypeSchema>;
export const VisualKindSchema = z.enum(['image', 'video']);
export type VisualKind = z.infer<typeof VisualKindSchema>;
export const CustomVideoModeSchema = z.enum(['universal', 'text', 'first_last', 'reference']);
export type CustomVideoMode = z.infer<typeof CustomVideoModeSchema>;

export const ModelConfigurationSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(120),
  modelName: z.string().min(1).max(240),
  endpoint: z.url().refine((value) => value.startsWith('http://') || value.startsWith('https://'), '仅支持 HTTP(S) Endpoint'),
  modelType: ModelTypeSchema,
  visualKind: VisualKindSchema,
  videoMode: CustomVideoModeSchema,
  provider: z.string().min(1).max(120),
  credentialConfigured: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type ModelConfiguration = z.infer<typeof ModelConfigurationSchema>;

export const SaveModelConfigurationInputSchema = z.object({
  id: IdSchema.optional(),
  displayName: z.string().trim().min(1).max(120),
  modelName: z.string().trim().min(1).max(240),
  endpoint: z.url().refine((value) => value.startsWith('http://') || value.startsWith('https://'), '仅支持 HTTP(S) Endpoint'),
  modelType: ModelTypeSchema,
  visualKind: VisualKindSchema,
  videoMode: CustomVideoModeSchema,
  provider: z.string().trim().min(1).max(120),
  apiKey: z.string().max(8192).optional(),
}).strict();
export type SaveModelConfigurationInput = z.infer<typeof SaveModelConfigurationInputSchema>;

export const ProviderStateSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  logoPath: z.string().optional(),
  credentialPlaceholder: z.string().optional(),
  docsUrl: z.url().optional(),
  modelCount: z.number().int().nonnegative().optional(),
  modelNames: z.array(z.string()).optional(),
  configured: z.boolean(),
  requiresCredential: z.boolean(),
  enabled: z.boolean(),
  backend: z.string(),
  secure: z.boolean(),
  lastTest: z.object({ ok: z.boolean(), message: z.string(), at: z.string().datetime() }).optional(),
}).strict();
export type ProviderState = z.infer<typeof ProviderStateSchema>;

export const PutCredentialInputSchema = z.object({
  providerId: z.string().min(1),
  secret: z.string().min(1).max(8192),
}).strict();
export const ImportAssetInputSchema = z.object({ kind: AssetKindSchema }).strict();

export const IPC_CHANNELS = {
  health: 'app.health',
  projectsList: 'projects.list',
  projectsCreate: 'projects.create',
  projectsRename: 'projects.rename',
  projectsRemove: 'projects.remove',
  projectsRevealResources: 'projects.revealResources',
  graphsLoad: 'graphs.load',
  graphsSave: 'graphs.save',
  assetsImport: 'assets.importLocal',
  assetsGetMany: 'assets.getMany',
  assetsReveal: 'assets.reveal',
  catalogList: 'catalog.list',
  modelConfigurationsList: 'modelConfigurations.list',
  modelConfigurationsSave: 'modelConfigurations.save',
  modelConfigurationsRemove: 'modelConfigurations.remove',
  modelConfigurationsTest: 'modelConfigurations.test',
  providersList: 'providers.list',
  providersPutCredential: 'providers.putCredential',
  providersDeleteCredential: 'providers.deleteCredential',
  providersTest: 'providers.test',
  runsStart: 'runs.start',
  runsCancel: 'runs.cancel',
  runsRetry: 'runs.retry',
  runsList: 'runs.list',
  runChanged: 'events.runChanged',
} as const;

export interface CanvasDesktopApi {
  health(): Promise<{ ok: true; version: string }>;
  projects: {
    list(): Promise<Project[]>;
    create(input: { name: string }): Promise<Project>;
    rename(input: { id: string; name: string }): Promise<Project>;
    remove(id: string): Promise<void>;
    revealResources(id: string): Promise<void>;
  };
  graphs: {
    load(projectId: string): Promise<GraphEnvelope>;
    save(input: SaveGraphInput): Promise<GraphEnvelope>;
  };
  assets: {
    importLocal(input: { kind: 'image' | 'video' }): Promise<PublicAsset | null>;
    getMany(ids: string[]): Promise<PublicAsset[]>;
    reveal(id: string): Promise<void>;
  };
  catalog: { list(): Promise<PublicModel[]> };
  modelConfigurations: {
    list(): Promise<ModelConfiguration[]>;
    save(input: SaveModelConfigurationInput): Promise<ModelConfiguration>;
    remove(id: string): Promise<void>;
    test(id: string): Promise<{ ok: boolean; message: string }>;
  };
  providers: {
    list(): Promise<ProviderState[]>;
    putCredential(input: { providerId: string; secret: string }): Promise<ProviderState>;
    deleteCredential(providerId: string): Promise<void>;
    test(providerId: string): Promise<{ ok: boolean; message: string }>;
  };
  runs: {
    start(input: StartNodeRunInput): Promise<PublicRunRecord>;
    cancel(runId: string): Promise<PublicRunRecord>;
    retry(runId: string): Promise<PublicRunRecord>;
    list(projectId?: string): Promise<PublicRunRecord[]>;
    onChanged(listener: (event: RunEvent) => void): () => void;
  };
}

declare global {
  interface Window { canvasApi?: CanvasDesktopApi }
}
