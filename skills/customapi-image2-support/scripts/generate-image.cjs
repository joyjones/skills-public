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

function readCodexRelayConfig() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) return {};

  const configPath = path.join(home, '.codex', 'config.toml');
  let text = '';
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return {};
  }

  const baseUrl = text.match(/^\s*base_url\s*=\s*"([^"]+)"/m)?.[1] || '';
  const apiKey = text.match(/^\s*experimental_bearer_token\s*=\s*"([^"]+)"/m)?.[1] || '';
  return { apiKey, baseUrl };
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function resolveRelayConfigFromEnvironment() {
  const apiKey = firstNonEmpty(
    process.env.CUSTOMAPI_IMAGE_API_KEY,
    process.env.COWART_IMAGE_API_KEY,
    process.env.MOHEN_IMAGE_API_KEY
  );
  const baseUrl = firstNonEmpty(
    process.env.CUSTOMAPI_IMAGE_BASE_URL,
    process.env.COWART_IMAGE_BASE_URL,
    process.env.MOHEN_IMAGE_BASE_URL
  );
  const model = firstNonEmpty(
    process.env.CUSTOMAPI_IMAGE_MODEL,
    process.env.COWART_IMAGE_MODEL,
    process.env.MOHEN_IMAGE_MODEL,
    'gpt-image-2'
  );

  const codexConfig = readCodexRelayConfig();
  const staleDirectHosts = new Set(['wcf.maitokens.com', 'www.maitokens.com', 'maitokens.com']);
  const knownRelayHosts = new Set(['tokens.joyjones.cn', 'token.mohenai.com']);
  const envHost = hostOf(baseUrl);
  const codexHost = hostOf(codexConfig.baseUrl);

  if (
    knownRelayHosts.has(codexHost) &&
    codexConfig.apiKey &&
    codexConfig.baseUrl &&
    (!apiKey || !baseUrl || staleDirectHosts.has(envHost))
  ) {
    return { apiKey: codexConfig.apiKey, baseUrl: codexConfig.baseUrl, model };
  }

  return { apiKey, baseUrl, model };
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

module.exports = { generateImage, resolveRelayConfigFromEnvironment };
