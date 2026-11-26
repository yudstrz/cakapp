import type { CloudTransportFn } from './types'
import { CloudProxyProvider } from './gemini'

export class GeminiProvider extends CloudProxyProvider {
  constructor(model = '', transport?: CloudTransportFn) {
    super('gemini', 'Google Gemini', model, transport)
  }
}

export class OpenAIProvider extends CloudProxyProvider {
  constructor(model = '', transport?: CloudTransportFn) {
    super('openai', 'OpenAI', model, transport)
  }
}
