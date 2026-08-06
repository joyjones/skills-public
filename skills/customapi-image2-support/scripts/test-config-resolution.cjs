const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const { resolveRelayConfigFromEnvironment } = require('./generate-image.cjs');

function withEnv(overrides, callback) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    callback();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function writeCodexConfig(codexHome, text) {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), text, 'utf8');
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'customapi-image2-test-'));
const codexHome = path.join(tempRoot, '.codex');

writeCodexConfig(codexHome, `
model_provider = "custom"

[model_providers.custom]
base_url = "https://tokens.joyjones.cn/v1"
experimental_bearer_token = "codex-token"
`);

withEnv({
  CODEX_HOME: codexHome,
  CUSTOMAPI_IMAGE_API_KEY: undefined,
  CUSTOMAPI_IMAGE_BASE_URL: undefined,
  COWART_IMAGE_API_KEY: 'legacy-token',
  COWART_IMAGE_BASE_URL: 'https://wcf.maitokens.com/v1',
  MOHEN_IMAGE_API_KEY: undefined,
  MOHEN_IMAGE_BASE_URL: undefined,
  OPENAI_API_KEY: undefined,
  OPENAI_BASE_URL: undefined,
  OPENAI_API_BASE: undefined
}, () => {
  const config = resolveRelayConfigFromEnvironment();
  assert.equal(config.source, 'codex:custom');
  assert.equal(config.baseUrl, 'https://tokens.joyjones.cn/v1');
  assert.equal(config.apiKey, 'codex-token');
});

withEnv({
  CODEX_HOME: codexHome,
  CUSTOMAPI_IMAGE_API_KEY: 'explicit-token',
  CUSTOMAPI_IMAGE_BASE_URL: 'https://token.mohenai.com/v1',
  COWART_IMAGE_API_KEY: 'legacy-token',
  COWART_IMAGE_BASE_URL: 'https://wcf.maitokens.com/v1'
}, () => {
  const config = resolveRelayConfigFromEnvironment();
  assert.equal(config.source, 'env:CUSTOMAPI_IMAGE');
  assert.equal(config.baseUrl, 'https://token.mohenai.com/v1');
  assert.equal(config.apiKey, 'explicit-token');
});

writeCodexConfig(codexHome, `
model_provider = "custom"

[model_providers.custom]
base_url = "https://tokens.joyjones.cn/v1"
`);
fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'auth-json-token' }), 'utf8');

withEnv({
  CODEX_HOME: codexHome,
  CUSTOMAPI_IMAGE_API_KEY: undefined,
  CUSTOMAPI_IMAGE_BASE_URL: undefined,
  COWART_IMAGE_API_KEY: 'legacy-token',
  COWART_IMAGE_BASE_URL: 'https://wcf.maitokens.com/v1',
  MOHEN_IMAGE_API_KEY: undefined,
  MOHEN_IMAGE_BASE_URL: undefined
}, () => {
  const config = resolveRelayConfigFromEnvironment();
  assert.equal(config.source, 'codex:custom');
  assert.equal(config.baseUrl, 'https://tokens.joyjones.cn/v1');
  assert.equal(config.apiKey, 'auth-json-token');
});

fs.rmSync(tempRoot, { recursive: true, force: true });
process.stdout.write('config resolution ok\n');
