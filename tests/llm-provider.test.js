/**
 * Tests for LLM Provider module
 */

const assert = require('assert');

// We need to test the module without actual API calls
const { PROVIDERS, LLMProvider, autoSelectProvider } = require('../src/providers/llm-provider.js');

console.log('\n🧪 Running llm-provider tests...\n');

// Test provider configurations exist
function testProviderConfigs() {
  console.log('Testing provider configurations...');
  
  assert(PROVIDERS.groq, 'Groq provider should exist');
  assert(PROVIDERS.cerebras, 'Cerebras provider should exist');
  assert(PROVIDERS.openai, 'OpenAI provider should exist');
  
  // Check required fields
  for (const [name, config] of Object.entries(PROVIDERS)) {
    assert(config.name, `${name} should have name`);
    assert(config.baseURL, `${name} should have baseURL`);
    assert(config.defaultModel, `${name} should have defaultModel`);
    assert(config.models, `${name} should have models map`);
  }
  
  console.log('  ✓ All provider configs valid');
}

// Test model resolution
function testModelResolution() {
  console.log('Testing model resolution...');
  
  const provider = new LLMProvider({ provider: 'groq', apiKey: 'test_key' });
  
  // Auto/default model
  const autoModel = provider.resolveModel('auto');
  assert(autoModel === PROVIDERS.groq.defaultModel, 'auto should return default model');
  
  // Alias resolution
  const fastModel = provider.resolveModel('fast');
  assert(fastModel === PROVIDERS.groq.models.fast, 'fast alias should resolve');
  
  // Direct model name (pass-through)
  const directModel = provider.resolveModel('custom-model');
  assert(directModel === 'custom-model', 'Direct model should pass through');
  
  console.log('  ✓ Model resolution works');
}

// Test provider creation
function testProviderCreation() {
  console.log('Testing provider creation...');
  
  // Valid provider
  const groq = new LLMProvider({ provider: 'groq', apiKey: 'test' });
  assert(groq.config.name === 'Groq', 'Should create Groq provider');
  
  // Invalid provider should throw
  try {
    new LLMProvider({ provider: 'invalid', apiKey: 'test' });
    assert(false, 'Should have thrown for invalid provider');
  } catch (e) {
    assert(e.message.includes('Unknown provider'), 'Should mention unknown provider');
  }
  
  console.log('  ✓ Provider creation works');
}

// Test auto-select with mock env
function testAutoSelect() {
  console.log('Testing auto-select provider...');
  
  // With GROQ_API_KEY set
  process.env.GROQ_API_KEY = 'test_key';
  const selected = autoSelectProvider();
  assert(selected === 'cerebras' || selected === 'groq' || selected === 'openai', 
    'Should select a valid provider');
  
  console.log(`  ✓ Auto-select returns: ${selected}`);
}

// Run tests
try {
  testProviderConfigs();
  testModelResolution();
  testProviderCreation();
  testAutoSelect();
  
  console.log('\n✅ All tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}