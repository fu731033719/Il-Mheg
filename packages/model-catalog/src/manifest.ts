import type { ParamField } from '@ilmheg/contracts';

export type CapabilityKind = 'text_to_image' | 'image_to_image' | 'image_to_video';
export type VideoMode = 'text' | 'first_frame' | 'first_last' | 'reference';
export type ProviderProtocol =
  | 'mock'
  | 'openai-image'
  | 'dashscope-video'
  | 'xai-image'
  | 'xai-video'
  | 'google-image'
  | 'google-video'
  | 'minimax-image'
  | 'minimax-video'
  | 'ark-video'
  | 'fal-queue';

export interface CapabilityManifest {
  kind: CapabilityKind;
  minImages: number;
  maxImages: number;
  maxOutputs: number;
  videoModes?: VideoMode[];
}

export interface EndpointManifest {
  id: string;
  displayName: string;
  path: string;
  protocol: ProviderProtocol;
  requestEncoding: 'json' | 'multipart';
  responseMode: 'sync' | 'async';
  capabilities: CapabilityManifest[];
  params: ParamField[];
  pollPath?: string;
}

export interface ModelManifest {
  id: string;
  providerId: string;
  displayName: string;
  description: string;
  kind: 'image' | 'video';
  upstreamModel: string;
  endpoints: EndpointManifest[];
}

export interface ResolvedModelManifest {
  model: ModelManifest;
  providerBaseUrl: string;
  requiresCredential: boolean;
}

export interface ProviderManifest {
  id: string;
  displayName: string;
  description: string;
  logoPath: string;
  baseUrl: string;
  requiresCredential: boolean;
  credentialPlaceholder?: string;
  docsUrl?: string;
  authScheme?: 'bearer' | 'x-goog-api-key' | 'key';
  testPath?: string;
}
