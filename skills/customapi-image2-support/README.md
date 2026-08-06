# Custom API Image2 Support

Codex skill for generating real `gpt-image-2` images through an OpenAI-compatible relay.

The skill is designed for installer-managed relay accounts. It does not contain credentials and does not ask users to paste keys into chat. It reads local relay configuration from environment variables or the active Codex config.

## Configuration

Preferred environment variables:

- `CUSTOMAPI_IMAGE_API_KEY`
- `CUSTOMAPI_IMAGE_BASE_URL`, for example `https://tokens.joyjones.cn/v1` or `https://token.mohenai.com/v1`
- `CUSTOMAPI_IMAGE_MODEL`, defaults to `gpt-image-2`

Legacy compatibility variables:

- `COWART_IMAGE_API_KEY`
- `COWART_IMAGE_BASE_URL`
- `COWART_IMAGE_MODEL`

Mohen installer compatibility variables:

- `MOHEN_IMAGE_API_KEY`
- `MOHEN_IMAGE_BASE_URL`
- `MOHEN_IMAGE_MODEL`

If those variables are missing or point to a known direct upstream host, the script can fall back to `~/.codex/config.toml` when the active Codex provider uses a known relay host. In that mode it reads the local provider key from `experimental_bearer_token`, the provider's `env_key`, or `~/.codex/auth.json`.

Check the non-secret resolved configuration:

```bash
node ~/.codex/skills/customapi-image2-support/scripts/generate-image.cjs --print-config
```

Expected output should show `baseHost` as your relay host, for example `tokens.joyjones.cn`, and `source` as `codex:custom` or `env:CUSTOMAPI_IMAGE`. If it shows `wcf.maitokens.com`, the machine is still using stale direct-upstream image variables instead of the relay.

## Manual Smoke Test

```powershell
$node = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
& $node "$HOME/.codex/skills/customapi-image2-support/scripts/generate-image.cjs" --prompt "A simple teal letter M logo on white background" --size "1024x1024" --output-dir ".\image2-output"
```

Success means the command prints JSON with a non-empty PNG `outputPath`.
