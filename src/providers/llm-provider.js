/**
 * LLM Provider Adapter
 * 
 * Unified interface for multiple LLM providers.
 * All providers must support OpenAI-compatible chat completions API.
 * 
 * Usage:
 *   const provider = createProvider('groq', { apiKey: 'xxx' });
 *   const response = await provider.chat({
 *     messages: [{ role: 'user', content: 'Hello' }],
 *     model: 'auto'
 *   });
 */

const https = require('https');

// Provider configurations
const PROVIDERS = {
  groq: {
    name: 'Groq',
    baseURL: 'api.groq.com',
    basePath: '/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    models: {
      'fast': 'llama-3.1-8b-instant',
      'balanced': 'llama-3.3-70b-versatile',
      'best': 'llama-3.3-70b-versatile',
      'llama-4': 'meta-llama/llama-4-scout-17b-16e-instruct'
    }
  },
  cerebras: {
    name: 'Cerebras',
    baseURL: 'api.cerebras.ai',
    basePath: '/v1/chat/completions',
    defaultModel: 'llama3.1-8b',
    models: {
      'fast': 'llama3.1-8b',
      'balanced': 'llama3.1-8b',
      'best': 'llama3.1-8b'
    }
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'api.openai.com',
    basePath: '/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    models: {
      'fast': 'gpt-4o-mini',
      'balanced': 'gpt-4o',
      'best': 'gpt-4o'
    }
  }
};

/**
 * Make HTTP request to provider API
 */
function makeRequest(hostname, path, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`API error: ${json.error.message || JSON.stringify(json.error)}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Base provider class
 */
class LLMProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.provider = config.provider;
    this.config = PROVIDERS[config.provider];
    
    if (!this.config) {
      throw new Error(`Unknown provider: ${config.provider}. Available: ${Object.keys(PROVIDERS).join(', ')}`);
    }
  }

  /**
   * Resolve model alias to actual model ID
   */
  resolveModel(model) {
    if (!model || model === 'auto') {
      return this.config.defaultModel;
    }
    return this.config.models[model] || model;
  }

  /**
   * Send chat completion request
   */
  async chat(options) {
    const model = this.resolveModel(options.model);
    
    const payload = {
      model,
      messages: options.messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.8
    };

    if (options.system) {
      payload.messages.unshift({
        role: 'system',
        content: options.system
      });
    }

    const response = await makeRequest(
      this.config.baseURL,
      this.config.basePath,
      this.apiKey,
      payload
    );

    if (!response.choices || !response.choices[0]) {
      throw new Error(`Unexpected response: ${JSON.stringify(response).substring(0, 500)}`);
    }

    return {
      content: response.choices[0].message.content,
      model: response.model,
      usage: response.usage,
      raw: response
    };
  }

  /**
   * Stream chat completion (returns async generator)
   */
  async *stream(options) {
    const model = this.resolveModel(options.model);
    
    const payload = {
      model,
      messages: options.messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.8,
      stream: true
    };

    if (options.system) {
      payload.messages.unshift({
        role: 'system',
        content: options.system
      });
    }

    // Streaming implementation would go here
    // For now, fall back to non-streaming
    const result = await this.chat(options);
    yield result.content;
  }

  /**
   * List available models for this provider
   */
  getModels() {
    return {
      default: this.config.defaultModel,
      aliases: this.config.models,
      provider: this.config.name
    };
  }
}

/**
 * Create a provider instance
 */
function createProvider(providerName, config = {}) {
  // Load API key from environment if not provided
  const envKey = {
    groq: process.env.GROQ_API_KEY,
    cerebras: process.env.CEREBRAS_API_KEY,
    openai: process.env.OPENAI_API_KEY
  };

  const apiKey = config.apiKey || envKey[providerName];
  
  if (!apiKey) {
    throw new Error(`No API key found for ${providerName}. Set ${providerName.toUpperCase()}_API_KEY or pass apiKey in config.`);
  }

  return new LLMProvider({
    provider: providerName,
    apiKey,
    ...config
  });
}

/**
 * Auto-select best available provider
 */
function autoSelectProvider() {
  const providers = ['cerebras', 'groq', 'openai'];
  
  for (const name of providers) {
    const envKey = `${name.toUpperCase()}_API_KEY`;
    if (process.env[envKey]) {
      return name;
    }
  }
  
  throw new Error('No API keys found. Set GROQ_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY.');
}

module.exports = {
  createProvider,
  autoSelectProvider,
  LLMProvider,
  PROVIDERS
};