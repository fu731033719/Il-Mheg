import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  CreateProjectInputSchema,
  GraphEnvelopeSchema,
  IdSchema,
  ImportAssetInputSchema,
  IPC_CHANNELS,
  ModelConfigurationSchema,
  ProjectSchema,
  ProviderStateSchema,
  PublicAssetSchema,
  PublicModelSchema,
  PublicRunRecordSchema,
  PutCredentialInputSchema,
  RenameProjectInputSchema,
  RunEventSchema,
  SaveModelConfigurationInputSchema,
  SaveGraphInputSchema,
  StartNodeRunInputSchema,
} from '@ilmheg/contracts';
import { AppDatabase } from '@ilmheg/persistence';
import { AssetStore } from '@ilmheg/asset-store';
import { CredentialVault, type EncryptionAdapter } from '@ilmheg/credential-vault';
import { customModelProviderId, customModelToPublicModel, listPublicModels, providers, getProvider } from '@ilmheg/model-catalog';
import { RunOrchestrator } from '@ilmheg/runtime';
import { APP_DISPLAY_NAME, resolveUserDataPath } from './app-identity';

protocol.registerSchemesAsPrivileged([{
  scheme: 'canvas-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

let mainWindow: BrowserWindow | null = null;
let database: AppDatabase | undefined;
let orchestrator: RunOrchestrator | undefined;

app.setPath('userData', resolveUserDataPath(app.getPath('appData')));
app.setName(APP_DISPLAY_NAME);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.setIcon(resolveAppIconPath());
  const dataRoot = app.getPath('userData');
  mkdirSync(dataRoot, { recursive: true });
  database = new AppDatabase(path.join(dataRoot, 'canvas.db'));
  if (database.listProjects().length === 0) database.createProject('灵感草稿');
  const assets = new AssetStore(path.join(dataRoot, 'assets'), database);
  await assets.initialize();
  const vault = new CredentialVault(database, electronEncryption());
  orchestrator = new RunOrchestrator(database, vault, assets);
  registerAssetProtocol(assets);
  registerIpc({ database, assets, vault, orchestrator });
  mainWindow = createWindow();
  orchestrator.onChanged((event) => {
    const window = mainWindow;
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.runChanged, RunEventSchema.parse(event));
  });
  orchestrator.startScheduler();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(); });
app.on('before-quit', () => { orchestrator?.stopScheduler(); database?.close(); });

function createWindow() {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: APP_DISPLAY_NAME,
    icon: resolveAppIconPath(),
    backgroundColor: '#0d0b12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const own = url.startsWith('file:') || (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL));
    if (!own) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window.show());
  if (process.env.VITE_DEV_SERVER_URL) void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void window.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  return window;
}

function resolveAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build/icon.png');
}

function registerAssetProtocol(assets: AssetStore) {
  protocol.handle('canvas-asset', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'asset') return new Response('Not found', { status: 404 });
    const assetId = url.pathname.replace(/^\//, '');
    if (!IdSchema.safeParse(assetId).success) return new Response('Bad request', { status: 400 });
    try {
      return net.fetch(pathToFileURL(assets.resolvePath(assetId)).toString(), { headers: request.headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function registerIpc(context: { database: AppDatabase; assets: AssetStore; vault: CredentialVault; orchestrator: RunOrchestrator }) {
  const { database, assets, vault, orchestrator } = context;
  handle(IPC_CHANNELS.health, z.undefined(), z.object({ ok: z.literal(true), version: z.string() }), () => ({ ok: true as const, version: app.getVersion() }));
  handle(IPC_CHANNELS.projectsList, z.undefined(), z.array(ProjectSchema), () => database.listProjects());
  handle(IPC_CHANNELS.projectsCreate, CreateProjectInputSchema, ProjectSchema, (input) => database.createProject(input.name));
  handle(IPC_CHANNELS.projectsRename, RenameProjectInputSchema, ProjectSchema, (input) => database.renameProject(input.id, input.name));
  handle(IPC_CHANNELS.projectsRemove, IdSchema, z.void(), (id) => database.removeProject(id));
  handle(IPC_CHANNELS.projectsRevealResources, IdSchema, z.void(), async (id) => {
    if (!database.hasProject(id)) throw new Error('项目不存在');
    const error = await shell.openPath(assets.rootDirectory());
    if (error) throw new Error(`打开本地资源目录失败：${error}`);
  });
  handle(IPC_CHANNELS.graphsLoad, IdSchema, GraphEnvelopeSchema, (id) => database.loadGraph(id));
  handle(IPC_CHANNELS.graphsSave, SaveGraphInputSchema, GraphEnvelopeSchema, (input) => database.saveGraph(input));
  handle(IPC_CHANNELS.assetsImport, ImportAssetInputSchema, PublicAssetSchema.nullable(), async (input) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: input.kind === 'image' ? '导入图片' : '导入视频', properties: ['openFile'],
      filters: input.kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
        : [{ name: '视频', extensions: ['mp4', 'webm'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return assets.publicAsset(await assets.importFile(result.filePaths[0], input.kind));
  });
  handle(IPC_CHANNELS.assetsGetMany, z.array(IdSchema).max(500), z.array(PublicAssetSchema), (ids) => database.getAssets(ids).map((asset) => assets.publicAsset(asset)));
  handle(IPC_CHANNELS.assetsReveal, IdSchema, z.void(), (id) => shell.showItemInFolder(assets.resolvePath(id)));
  const providerState = (providerId: string) => {
    const manifest = getProvider(providerId);
    const backend = vault.status();
    return ProviderStateSchema.parse({
      id: manifest.id, displayName: manifest.displayName,
      configured: !manifest.requiresCredential || vault.has(manifest.id),
      requiresCredential: manifest.requiresCredential, enabled: true,
      backend: backend.backend, secure: backend.secure,
      lastTest: database.getLastProviderTest(manifest.id),
    });
  };
  const configuredCatalog = () => [
    ...listPublicModels().filter((model) => providerState(model.providerId).configured),
    ...database.listModelConfigurations().map(customModelToPublicModel),
  ];
  handle(IPC_CHANNELS.catalogList, z.undefined(), z.array(PublicModelSchema), configuredCatalog);
  handle(IPC_CHANNELS.modelConfigurationsList, z.undefined(), z.array(ModelConfigurationSchema), () => database.listModelConfigurations());
  handle(IPC_CHANNELS.modelConfigurationsSave, SaveModelConfigurationInputSchema, ModelConfigurationSchema, (input) => {
    const { apiKey, ...record } = input;
    const configuration = database.saveModelConfiguration(record);
    if (apiKey?.trim()) vault.put(customModelProviderId(configuration.id), apiKey.trim());
    return database.getModelConfiguration(configuration.id)!;
  });
  handle(IPC_CHANNELS.modelConfigurationsRemove, IdSchema, z.void(), (id) => {
    database.removeModelConfiguration(id);
    vault.delete(customModelProviderId(id));
  });
  handle(IPC_CHANNELS.modelConfigurationsTest, IdSchema, z.object({ ok: z.boolean(), message: z.string() }), async (id) => {
    const configuration = database.getModelConfiguration(id);
    if (!configuration) throw new Error('模型配置不存在');
    const request = async (secret?: string) => {
      try {
        const response = await fetch(configuration.endpoint, {
          method: 'HEAD',
          headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        const ok = response.status < 500 && response.status !== 401 && response.status !== 403;
        return { ok, message: ok ? `Endpoint 可达（${response.status}）` : `服务返回 ${response.status}` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '连接失败' };
      }
    };
    return configuration.credentialConfigured
      ? vault.withSecret(customModelProviderId(id), request)
      : request();
  });
  handle(IPC_CHANNELS.providersList, z.undefined(), z.array(ProviderStateSchema), () => providers.map((provider) => providerState(provider.id)));
  handle(IPC_CHANNELS.providersPutCredential, PutCredentialInputSchema, ProviderStateSchema, (input) => {
    getProvider(input.providerId);
    vault.put(input.providerId, input.secret);
    return providerState(input.providerId);
  });
  handle(IPC_CHANNELS.providersDeleteCredential, z.string(), z.void(), (providerId) => vault.delete(providerId));
  handle(IPC_CHANNELS.providersTest, z.string(), z.object({ ok: z.boolean(), message: z.string() }), async (providerId) => {
    const provider = getProvider(providerId);
    let result = { ok: true, message: providerId === 'mock' ? '本地演示引擎可用' : '凭据可用' };
    if (provider.requiresCredential) {
      result = await vault.withSecret(providerId, async (secret) => {
        const endpoint = providerId === 'openai' ? '/v1/models' : '/api/v1/models';
        try {
          const response = await fetch(new URL(endpoint, provider.baseUrl), { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
          return response.ok ? { ok: true, message: '连接成功' } : { ok: false, message: `服务返回 ${response.status}` };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : '连接失败' };
        }
      });
    }
    database.setLastProviderTest(providerId, { ...result, at: new Date().toISOString() });
    return result;
  });
  handle(IPC_CHANNELS.runsStart, StartNodeRunInputSchema, PublicRunRecordSchema, (input) => orchestrator.start(input));
  handle(IPC_CHANNELS.runsCancel, IdSchema, PublicRunRecordSchema, (id) => orchestrator.cancel(id));
  handle(IPC_CHANNELS.runsRetry, IdSchema, PublicRunRecordSchema, (id) => orchestrator.retry(id));
  handle(IPC_CHANNELS.runsList, IdSchema.optional(), z.array(PublicRunRecordSchema), (projectId) => orchestrator.list(projectId));
}

function handle<I, O>(channel: string, inputSchema: z.ZodType<I>, outputSchema: z.ZodType<O>, action: (input: I) => O | Promise<O>) {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, raw?: unknown) => {
    assertTrustedSender(event);
    const input = inputSchema.parse(raw);
    const output = await action(input);
    return outputSchema.parse(output);
  });
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? '';
  const trusted = url.startsWith('file:') || (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL));
  if (!trusted || event.sender !== mainWindow?.webContents) throw new Error('拒绝不可信 IPC 来源');
}

function electronEncryption(): EncryptionAdapter {
  const backend = () => process.platform === 'linux' && 'getSelectedStorageBackend' in safeStorage
    ? safeStorage.getSelectedStorageBackend() : process.platform === 'darwin' ? 'keychain' : process.platform === 'win32' ? 'dpapi' : 'unknown';
  return {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => safeStorage.encryptString(value),
    decryptString: (value) => safeStorage.decryptString(Buffer.from(value)),
    backend,
    secure: () => backend() !== 'basic_text' && safeStorage.isEncryptionAvailable(),
  };
}
