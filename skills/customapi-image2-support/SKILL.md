---
name: customapi-image2-support
description: Use when a Codex user asks to generate, draw, create, render, or make an image, logo, icon, illustration, cover, avatar, or gpt-image-2 result through a custom OpenAI-compatible relay, especially when other image skills report missing API settings.
---

# Custom API Image2 Support

This skill is the preferred image-generation path for installer-managed custom relay users. It sends real OpenAI-compatible Images API requests to `/v1/images/generations` with model `gpt-image-2`, using the user's existing local relay configuration.

## Priority Rule

When the user asks for image generation and a configured custom relay exists, use this skill before generic image skills such as broad imagegen, canvas, or provider-specific skills. Generic image skills may have their own API settings and can fail even when the user's custom relay token is valid.

Do not ask the user to paste an API key into chat. Do not print API keys, cookies, tokens, passwords, private keys, or complete environment variable values.

## Normal Image Requests

1. Call the bundled generator script.
2. Use `1024x1024` unless the user requests another supported size.
3. Require a non-empty PNG on disk before saying generation succeeded.
4. Attach or link the generated PNG in the response.

PowerShell:

```powershell
$node = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
& $node "$HOME/.codex/skills/customapi-image2-support/scripts/generate-image.cjs" --prompt "Create the requested image" --size "1024x1024" --output-dir ".\image2-output"
```

## Configuration Lookup

The generator reads, in order:

1. `CUSTOMAPI_IMAGE_API_KEY`, `CUSTOMAPI_IMAGE_BASE_URL`, `CUSTOMAPI_IMAGE_MODEL`.
2. Legacy `COWART_IMAGE_API_KEY`, `COWART_IMAGE_BASE_URL`, `COWART_IMAGE_MODEL`.
3. Installer compatibility `MOHEN_IMAGE_API_KEY`, `MOHEN_IMAGE_BASE_URL`, `MOHEN_IMAGE_MODEL`.
4. The active `~/.codex/config.toml` relay provider when it points to a known relay host.

If configuration is absent, tell the user to finish the custom API relay setup. Do not request credentials in chat.

## Acceptance Standard

Only call Image2 available after all are true:

- The request used `/v1/images/generations`, not `/v1/chat/completions`.
- The result was saved as a non-empty PNG.
- The PNG can be opened or visually inspected.

If the API reports no available channel, distinguish platform routing from upstream capability:

- Platform routing issue: the relay says no channel exists for the user's group and `gpt-image-2`.
- Upstream capability issue: the relay selected a channel, but that upstream reports it has no `gpt-image-2` route.

## Billing Notes

Image generation should use the same user API key and same account balance as text by default. Do not create an image-only user token or separate wallet unless a proven platform limitation requires it.

Keep user-side relay deduction separate from supplier or upstream cost. Image output tokens usually dominate the billed amount.

