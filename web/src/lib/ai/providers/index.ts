import { geminiAdapter } from './gemini';
import { openaiAdapter } from './openai';
import { anthropicAdapter } from './anthropic';
import type { AiProviderId, ProviderAdapter } from './types';
export { getServerApiKey, hasServerApiKey, resolveProviderApiKey, extractByokHeader, redactSecrets } from '../keys';

const ADAPTERS: Record<AiProviderId, ProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
};

export function getProviderAdapter(provider: AiProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}

export * from './types';
