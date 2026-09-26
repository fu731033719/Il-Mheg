import { describe, expect, it } from 'vitest';
import type { ModelConfiguration } from '@ilmheg/contracts';
import {
  compatibleNodeKindsForModelType,
  customModelToPublicModel,
  inputTransform,
  models,
  resolveCustomImageEndpoint,
  resolveCustomModel,
  resolveCustomVideoEndpoint,
  validateParams,
} from './index';

describe('model catalog', () => {
  it('keeps primitive types in exact transforms', () => {
    const result = inputTransform({ count: '$${count}', enabled: '$${enabled}' }, { count: 2, enabled: false });
    expect(result).toEqual({ count: 2, enabled: false });
  });

  it('drops false conditional branches', () => {
    const result = inputTransform({ optional: { '@conditional': 'enabled', '@value': '$${value}' } }, { enabled: false, value: 'x' });
    expect(result).toEqual({});
  });

  it('validates every manifest endpoint', () => {
    for (const model of models) for (const endpoint of model.endpoints) {
      expect(() => validateParams(endpoint.params, {})).not.toThrow();
    }
  });

  it('maps custom model types to the exact compatible canvas nodes', () => {
    expect(compatibleNodeKindsForModelType('language')).toEqual(['prompt']);
    expect(compatibleNodeKindsForModelType('vision')).toEqual(['image', 'video']);
    expect(compatibleNodeKindsForModelType('multimodal')).toEqual(['prompt', 'image']);
    expect(compatibleNodeKindsForModelType('speech')).toEqual([]);
  });

  it('keeps the configuration id as the node-facing model id', () => {
    const configuration: ModelConfiguration = {
      id: crypto.randomUUID(),
      displayName: 'Studio Vision',
      modelName: 'vision-v3',
      endpoint: 'https://models.example.com/v1/images/generations?region=cn',
      modelType: 'vision',
      visualKind: 'image',
      videoMode: 'universal',
      provider: 'Example AI',
      credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    };
    const publicModel = customModelToPublicModel(configuration);
    const resolved = resolveCustomModel(configuration);
    expect(publicModel.id).toBe(configuration.id);
    expect(publicModel.compatibleNodeKinds).toEqual(['image']);
    expect(resolved.model.id).toBe(configuration.id);
    expect(resolved.model.upstreamModel).toBe('vision-v3');
    expect(resolved.providerBaseUrl).toBe('https://models.example.com');
    expect(resolved.model.endpoints[0]?.path).toBe('/v1/images/generations?region=cn');
    expect(resolved.model.endpoints[0]?.requestEncoding).toBe('json');
    const edit = resolveCustomModel({ ...configuration, endpoint: 'https://models.example.com/v1/images/edits' });
    expect(edit.model.endpoints[0]?.requestEncoding).toBe('multipart');
    expect(edit.model.endpoints[0]?.capabilities.map((item) => item.kind)).toEqual(['image_to_image']);
  });

  it('expands an OpenAI-compatible v1 base URL to the image generation route', () => {
    const baseUrl = 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/';
    expect(resolveCustomImageEndpoint(baseUrl).toString()).toBe(`${baseUrl}images/generations`);
    const configuration: ModelConfiguration = {
      id: crypto.randomUUID(), displayName: 'Qwen Image', modelName: 'qwen-image-3.0', endpoint: baseUrl,
      modelType: 'vision', visualKind: 'image', videoMode: 'universal', provider: '阿里云百炼', credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z',
    };
    const publicModel = customModelToPublicModel(configuration);
    const resolved = resolveCustomModel(configuration);
    expect(publicModel.endpoints[0]?.capabilities).toEqual(['text_to_image', 'image_to_image']);
    expect(publicModel.endpoints[0]?.params.map((field) => field.key)).toEqual(['size', 'count']);
    expect(resolved.model.endpoints[0]?.path).toBe('/compatible-mode/v1/images/generations');
  });

  it('maps a custom visual video configuration to a DashScope video model', () => {
    const baseUrl = 'https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
    expect(resolveCustomVideoEndpoint(baseUrl).toString()).toBe(
      'https://ws-example.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    );
    const configuration: ModelConfiguration = {
      id: crypto.randomUUID(),
      displayName: 'Wan 3 Video',
      modelName: 'wan3.0-video-prime',
      endpoint: baseUrl,
      modelType: 'vision',
      visualKind: 'video',
      videoMode: 'universal',
      provider: '阿里云百炼',
      credentialConfigured: true,
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    };

    const publicModel = customModelToPublicModel(configuration);
    const resolved = resolveCustomModel(configuration);

    expect(publicModel.kind).toBe('video');
    expect(publicModel.compatibleNodeKinds).toEqual(['video']);
    expect(publicModel.endpoints[0]?.capabilities).toEqual(['image_to_video']);
    expect(resolved.model.kind).toBe('video');
    expect(resolved.model.endpoints[0]).toMatchObject({
      path: '/api/v1/services/aigc/video-generation/video-synthesis',
      pollPath: '/api/v1/tasks/{taskId}',
      protocol: 'dashscope-video',
      responseMode: 'async',
    });
    const ratio = resolved.model.endpoints[0]?.params.find((field) => field.key === 'ratio');
    expect(ratio?.defaultValue).toBe('adaptive');
    expect(ratio?.options?.map((option) => option.value)).toEqual(['adaptive', '21:9', '16:9', '9:16', '1:1', '4:3', '3:4']);

    const wan27 = resolveCustomModel({ ...configuration, modelName: 'wan2.7-r2v-2026-06-12', videoMode: 'reference' });
    const wan27Resolution = wan27.model.endpoints[0]?.params.find((field) => field.key === 'resolution');
    const wan27Ratio = wan27.model.endpoints[0]?.params.find((field) => field.key === 'ratio');
    expect(wan27Resolution?.options?.map((option) => option.value)).toEqual(['720P', '1080P']);
    expect(wan27Ratio?.defaultValue).toBe('16:9');
    expect(wan27Ratio?.options?.map((option) => option.value)).toEqual(['16:9', '9:16', '1:1', '4:3', '3:4']);
  });
});
