import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, RunEventSchema, type CanvasDesktopApi } from '@ilmheg/contracts';

const api: CanvasDesktopApi = {
  health: () => ipcRenderer.invoke(IPC_CHANNELS.health),
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    rename: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsRename, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, id),
    revealResources: (id) => ipcRenderer.invoke(IPC_CHANNELS.projectsRevealResources, id),
  },
  graphs: {
    load: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.graphsLoad, projectId),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.graphsSave, input),
  },
  assets: {
    importLocal: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsImport, input),
    getMany: (ids) => ipcRenderer.invoke(IPC_CHANNELS.assetsGetMany, ids),
    reveal: (id) => ipcRenderer.invoke(IPC_CHANNELS.assetsReveal, id),
  },
  catalog: { list: () => ipcRenderer.invoke(IPC_CHANNELS.catalogList) },
  modelConfigurations: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.modelConfigurationsList),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.modelConfigurationsSave, input),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.modelConfigurationsRemove, id),
    test: (id) => ipcRenderer.invoke(IPC_CHANNELS.modelConfigurationsTest, id),
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.providersList),
    putCredential: (input) => ipcRenderer.invoke(IPC_CHANNELS.providersPutCredential, input),
    deleteCredential: (providerId) => ipcRenderer.invoke(IPC_CHANNELS.providersDeleteCredential, providerId),
    test: (providerId) => ipcRenderer.invoke(IPC_CHANNELS.providersTest, providerId),
  },
  runs: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.runsStart, input),
    cancel: (runId) => ipcRenderer.invoke(IPC_CHANNELS.runsCancel, runId),
    retry: (runId) => ipcRenderer.invoke(IPC_CHANNELS.runsRetry, runId),
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.runsList, projectId),
    onChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => listener(RunEventSchema.parse(raw));
      ipcRenderer.on(IPC_CHANNELS.runChanged, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.runChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld('canvasApi', api);
