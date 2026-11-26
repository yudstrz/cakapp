export type AiProviderId = 'gemini' | 'openai' | 'anthropic';

export type AiTask = 'notulen' | 'ringkasan';

export type AiErrorCode =
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_INPUT'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT';

export class AiProxyError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'AiProxyError';
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
      },
    };
  }
}

export interface GenerateParams {
  model: string;
  system: string;
  input: string;
  signal: AbortSignal;
  apiKey: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void;
}

export interface ProviderAdapter {
  readonly id: AiProviderId;
  generate(params: GenerateParams): Promise<GenerateResult>;
  stream(params: GenerateParams, callbacks: StreamCallbacks): Promise<TokenUsage>;
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
}

import { redactSecrets } from '../keys';

export function sanitizeErrorMessage(msg: string): string {
  return redactSecrets(msg);
}

export function isModelNotFoundStatus(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('model not found') ||
    lower.includes('not_found') ||
    lower.includes('does not exist') ||
    lower.includes('deprecated') ||
    lower.includes('shut down') ||
    lower.includes('no longer supported')
  );
}

export function mapProviderHttpError(status: number, bodyText: string): AiProxyError {
  if (status === 401 || status === 403) {
    return new AiProxyError('PROVIDER_ERROR', 'Konfigurasi kunci provider AI tidak valid.', 502);
  }
  if (status === 429) {
    return new AiProxyError('RATE_LIMITED', 'Provider AI sedang sibuk. Silakan coba lagi sebentar.', 429, 30);
  }
  if (isModelNotFoundStatus(status, bodyText)) {
    return new AiProxyError('MODEL_UNAVAILABLE', 'Model AI yang dipilih tidak tersedia di provider.', 404);
  }
  return new AiProxyError(
    'PROVIDER_ERROR',
    `Provider AI mengembalikan error (${status}): ${sanitizeErrorMessage(bodyText || 'Unknown error')}`,
    502,
  );
}
