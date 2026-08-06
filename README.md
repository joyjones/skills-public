# skills-public

Public Codex skills maintained by JoyJones / Mohen AI.

This repository is a skill collection, not a single-skill project. Each skill lives in its own subdirectory under `skills/` and should be installable independently.

## Skills

| Skill | Path | Purpose |
| --- | --- | --- |
| Custom API Image2 Support | `skills/customapi-image2-support` | Generate real `gpt-image-2` PNG images through an installer-managed OpenAI-compatible relay. |

## Install In Codex

Ask Codex:

```text
Install the skill from GitHub repo joyjones/skills-public, path skills/customapi-image2-support.
```

Restart Codex after installing or updating a skill, especially when local environment variables changed.

## Safety

Skills in this repository must not contain API keys, cookies, tokens, passwords, private keys, or machine-specific secrets. Runtime credentials should be read from local user configuration created by the user's own installer or environment.
