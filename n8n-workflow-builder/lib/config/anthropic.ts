import { Anthropic } from '@anthropic-ai/sdk';
import { getEnv, isServer } from './env';

let anthropicClient: Anthropic | undefined;

// Create Anthropic client (server-only)
export function createAnthropicClient(): Anthropic {
  if (!isServer) {
    throw new Error('Anthropic client can only be used on the server');
  }
  
  if (anthropicClient) return anthropicClient;
  
  const env = getEnv();
  
  anthropicClient = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });
  
  return anthropicClient;
}

// Helper to check if Anthropic is configured
export function isAnthropicConfigured(): boolean {
  try {
    const env = getEnv();
    return !!env.ANTHROPIC_API_KEY;
  } catch {
    return false;
  }
}