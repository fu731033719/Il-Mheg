import { describe, expect, it } from 'vitest';
import { PublicRunRecordSchema } from '@ilmheg/contracts';
import type { InternalRunRecord } from '@ilmheg/persistence';
import { toPublicError, toPublicRunRecord } from './index';

describe('toPublicRunRecord', () => {
  it('removes internal snapshots and remote task metadata at the public boundary', () => {
    const stamp = '2026-09-26T00:00:00.000Z';
    const projectId = crypto.randomUUID();
    const nodeId = crypto.randomUUID();
    const internal: InternalRunRecord = {
      id: crypto.randomUUID(),
      projectId,
      nodeId,
      status: 'WAITING_REMOTE',
      providerId: 'mock',
      modelId: 'mock-video',
      endpointId: 'mock-video-generate',
      capability: 'image_to_video',
      outputAssetIds: [],
      createdAt: stamp,
      updatedAt: stamp,
      inputSnapshot: {
        schemaVersion: 1,
        projectId,
        nodeId,
        graphRevision: 1,
        providerId: 'mock',
        providerBaseUrl: 'mock://provider',
        modelId: 'mock-video',
        upstreamModel: 'mock-video',
        endpointId: 'mock-video-generate',
        capability: 'image_to_video',
        prompt: 'internal only',
        inputAssets: [],
        params: {},
      },
      remoteTask: { taskId: 'private-task', pollAttempt: 1, nextPollAt: stamp },
    };

    const publicRun = toPublicRunRecord(internal);

    expect(PublicRunRecordSchema.parse(publicRun)).toEqual(publicRun);
    expect(publicRun).not.toHaveProperty('inputSnapshot');
    expect(publicRun).not.toHaveProperty('remoteTask');
  });
});

describe('toPublicError', () => {
  it('exposes unreadable credentials as an actionable non-retryable error', () => {
    expect(toPublicError(new Error('CREDENTIAL_UNREADABLE: 请重新保存凭据'))).toEqual({
      code: 'CREDENTIAL_UNREADABLE',
      message: '请重新保存凭据',
      retryable: false,
    });
  });
});
