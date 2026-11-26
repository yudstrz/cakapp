import type { CloudTransportFn } from './types'
import { CloudProxyProvider } from './gemini'

export class AnthropicProvider extends CloudProxyProvider {
  constructor(model = '', transport?: CloudTransportFn) {
    super('anthropic', 'Anthropic Claude', model, transport)
  }
}

export { AnthropicProvider as ClaudeProvider }
