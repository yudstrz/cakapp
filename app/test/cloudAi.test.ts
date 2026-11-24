import { describe, expect, it } from 'vitest'
import { askAgnesOrFallback, createCloudLlm, getCloudAiKeys, isCloudAiAvailable } from '../src/main/cloudAi'

describe('cloudAi intelligence engine', () => {
  it('reads keys from environment correctly with agnes as default', () => {
    const keys = getCloudAiKeys()
    expect(keys.agentKey).toBeTruthy()
    expect(keys.openaiKey).toBeTruthy()
    expect(keys.geminiKey).toBeTruthy()
    expect(isCloudAiAvailable()).toBe(true)
  })

  it('successfully generates AI response using primary or fallback provider', async () => {
    const receivedTokens: string[] = []
    const prompt = 'Jawablah satu kata saja: Halo'
    const reply = await askAgnesOrFallback(prompt, (token) => {
      receivedTokens.push(token)
    })

    expect(typeof reply).toBe('string')
    expect(reply.length).toBeGreaterThan(0)
    expect(receivedTokens.length).toBeGreaterThan(0)
  }, 20_000)

  it('creates a compatible Llm instance for notes generation', async () => {
    const llm = createCloudLlm()
    expect(llm.contextSize).toBeGreaterThan(16000)
    
    const tokenCounts = await llm.count(['halo dunia'])
    expect(tokenCounts[0]).toBeGreaterThan(0)

    let streamed = ''
    const answer = await llm.chat('Katakan "Siap!" saja.', (t) => {
      streamed += t
    })

    expect(answer).toBeTruthy()
    expect(streamed).toBeTruthy()
  }, 20_000)
})
