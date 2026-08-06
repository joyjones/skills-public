const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function withoutTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return '';
  }
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function readSimpleToml(text) {
  const root = {};
  const sections = {};
  let current = root;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = sections[sectionMatch[1]] || {};
      sections[sectionMatch[1]] = current;
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/);
    if (kvMatch) current[kvMatch[1]] = kvMatch[2] ?? kvMatch[3] ?? kvMatch[4] ?? '';
  }
  return { root, sections };
}

function readCodexRelayConfig() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const codexHome = process.env.CODEX_HOME || (home ? path.join(home, '.codex') : '');
  if (!codexHome) return {};

  const configPath = path.join(codexHome, 'config.toml');
  let text = '';
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return {};
  }

  const parsed = readSimpleToml(text);
  const providerName = parsed.root.model_provider || '';
  const activeProvider = providerName ? parsed.sections[`model_providers.${providerName}`] || {} : {};
  const provider = Object.keys(activeProvider).length ? activeProvider : parsed.root;
  const envKeyName = provider.env_key || provider.api_key_env || provider.api_key_env_var || '';
  const apiKey = firstNonEmpty(
    provider.experimental_bearer_token,
    provider.bearer_token,
    provider.api_key,
    envKeyName ? process.env[envKeyName] : '',
    parsed.root.experimental_bearer_token,
    parsed.root.bearer_token,
    parsed.root.api_key
  );
  const baseUrl = firstNonEmpty(provider.base_url, parsed.root.base_url);
  return { apiKey, baseUrl, source: providerName ? `codex:${providerName}` : 'codex' };
}

function configFromEnv(prefix, source) {
  return {
    apiKey: process.env[`${prefix}_API_KEY`] || '',
    baseUrl: process.env[`${prefix}_BASE_URL`] || '',
    model: process.env[`${prefix}_MODEL`] || '',
    source
  };
}

function resolveRelayConfigFromEnvironment() {
  const staleDirectHosts = new Set(['wcf.maitokens.com', 'www.maitokens.com', 'maitokens.com']);
  const knownRelayHosts = new Set(['tokens.joyjones.cn', 'token.mohenai.com']);
  const candidates = [
    configFromEnv('CUSTOMAPI_IMAGE', 'env:CUSTOMAPI_IMAGE'),
    readCodexRelayConfig(),
    configFromEnv('MOHEN_IMAGE', 'env:MOHEN_IMAGE'),
    configFromEnv('COWART_IMAGE', 'env:COWART_IMAGE'),
    {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || '',
      model: process.env.OPENAI_MODEL || '',
      source: 'env:OPENAI'
    }
  ].map((candidate) => ({
    ...candidate,
    baseUrl: withoutTrailingSlash(candidate?.baseUrl),
    model: firstNonEmpty(candidate?.model, 'gpt-image-2'),
    host: hostOf(candidate?.baseUrl)
  }));

  const complete = candidates.filter((candidate) => candidate.apiKey && candidate.baseUrl);
  const explicitCustom = complete.find((candidate) => candidate.source === 'env:CUSTOMAPI_IMAGE');
  if (explicitCustom) return explicitCustom;

  const codexRelay = complete.find((candidate) => String(candidate.source || '').startsWith('codex:') && knownRelayHosts.has(candidate.host));
  if (codexRelay) return codexRelay;

  const knownRelay = complete.find((candidate) => knownRelayHosts.has(candidate.host));
  if (knownRelay) return knownRelay;

  const nonStale = complete.find((candidate) => !staleDirectHosts.has(candidate.host));
  if (nonStale) return nonStale;

  return complete[0] || candidates[0] || { apiKey: '', baseUrl: '', model: 'gpt-image-2', source: 'none', host: '' };
}

function safeErrorMessage(value, apiKey) {
  const message = String(value || 'Image generation request failed.');
  return (apiKey ? message.replaceAll(apiKey, '[redacted]') : message).slice(0, 500);
}

function imageBufferFromPayload(payload) {
  const image = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (typeof image?.b64_json === 'string' && image.b64_json.length > 0) {
    return { buffer: Buffer.from(image.b64_json, 'base64'), sourceUrl: '' };
  }
  if (typeof image?.url === 'string' && image.url.length > 0) {
    return { buffer: null, sourceUrl: image.url };
  }
  throw new Error('The Images API response did not contain image data.');
}

async function generateImage(input) {
  const apiKey = String(input?.apiKey || '').trim();
  const baseUrl = withoutTrailingSlash(input?.baseUrl);
  const model = String(input?.model || 'gpt-image-2').trim();
  const prompt = String(input?.prompt || '').trim();
  const outputDirectory = path.resolve(String(input?.outputDirectory || path.join(process.cwd(), 'image2-output')));
  const fetchImpl = input?.fetchImpl || globalThis.fetch;

  if (!apiKey) throw new Error('Image generation is not configured. Please finish custom API relay setup first.');
  if (!baseUrl) throw new Error('Image generation is missing its relay address. Please finish custom API relay setup first.');
  if (!prompt) throw new Error('Please provide an image prompt.');
  if (typeof fetchImpl !== 'function') throw new Error('This computer cannot start the Images API request because fetch is unavailable.');

  const response = await fetchImpl(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      size: String(input?.size || '1024x1024'),
      response_format: 'b64_json'
    })
  });

  if (!response?.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {}
    throw new Error(safeErrorMessage(`The Images API returned ${response?.status || 'an unknown error'}: ${detail}`, apiKey));
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The Images API returned an unreadable response.');
  }

  const image = imageBufferFromPayload(payload);
  const buffer = image.buffer || Buffer.from(await (await fetchImpl(image.sourceUrl)).arrayBuffer());
  if (buffer.length === 0) throw new Error('The Images API returned an empty image.');

  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `gpt-image-2-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`);
  fs.writeFileSync(outputPath, buffer);
  return { outputPath, model, bytes: buffer.length };
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : '';
}

async function main() {
  const relayConfig = resolveRelayConfigFromEnvironment();
  if (process.argv.includes('--print-config')) {
    process.stdout.write(`${JSON.stringify({
      baseHost: hostOf(relayConfig.baseUrl),
      basePath: relayConfig.baseUrl ? new URL(relayConfig.baseUrl).pathname : '',
      source: relayConfig.source || '',
      apiKeyPresent: Boolean(relayConfig.apiKey),
      apiKeyLength: relayConfig.apiKey ? relayConfig.apiKey.length : 0,
      model: relayConfig.model
    })}\n`);
    return;
  }

  const result = await generateImage({
    apiKey: relayConfig.apiKey,
    baseUrl: relayConfig.baseUrl,
    model: relayConfig.model || 'gpt-image-2',
    prompt: optionValue(process.argv, '--prompt'),
    size: optionValue(process.argv, '--size') || '1024x1024',
    outputDirectory: optionValue(process.argv, '--output-dir') || path.join(process.cwd(), 'image2-output')
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    const relayConfig = resolveRelayConfigFromEnvironment();
    process.stderr.write(`${safeErrorMessage(error?.message, relayConfig.apiKey)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { generateImage, resolveRelayConfigFromEnvironment, readCodexRelayConfig, readSimpleToml };
