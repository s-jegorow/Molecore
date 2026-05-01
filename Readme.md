# Molecore

**A minimalist, self-hosted workspace. Block-based, multi-user, no subscriptions, no cloud lock-in.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.128-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://hub.docker.com)

> Built out of frustration with the overblown feature sets of tools like Notion and Obsidian.
> No AI, no templates, no collaboration noise. Just your workspace.

**[Live Demo](https://molecore.sonic-reducer.de)**

![Molecore Screenshot](molecorescreenshot.png)

---

## Why Molecore?

Most note-taking tools make you choose: power or simplicity. Cloud or local. Personal or multi-user.

Molecore is self-hosted, runs entirely on your own infrastructure, and supports multiple users with fully isolated workspaces. No data leaves your server.

- No subscription fees
- No AI features you didn't ask for
- No shared databases, templates, or collaboration bloat
- Your data, your server, your rules

---

## Features

- **Block-based editor** - Text, Headers, Lists, Code, Tables, Images, Audio, Files, Embeds
- **Hierarchical pages** with subpages and page blocks
- **Multi-user support** with isolated workspaces via Keycloak/JWT
- **Optional tools** - Notepad, Calendar, Focus Timer, To-Do List, Dashboard
- **File uploads** with per-user quotas (20 MB per file, 500 MB per user)

---

## Tech Stack

**Frontend:** TypeScript + EditorJS + Vite
**Backend:** Python + FastAPI + SQLAlchemy + PostgreSQL
**Auth:** Keycloak (battle-tested, self-hosted, enterprise-grade)
**Deployment:** Docker + Nginx

---

## Installation

Molecore is deployed via Docker Compose and requires a running Keycloak instance for authentication.

1. Set up your Keycloak server and create a realm + client (see [Keycloak quickstart](https://www.keycloak.org/getting-started/getting-started-docker))
2. Clone this repo
3. Copy `.env.example` to `.env` and fill in your values
4. Create `frontend/.env` with your Keycloak config:
   ```
   VITE_KEYCLOAK_URL=https://your-keycloak-server.com
   VITE_KEYCLOAK_REALM=your-realm
   VITE_KEYCLOAK_CLIENT_ID=your-client-id
   ```
5. Run `docker-compose up -d --build`

Default upload limits (configurable in `backend/main.py`):
- Max file size: 20 MB per upload
- Max storage per user: 500 MB total

---

## License

AGPL-3.0 - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [EditorJS](https://editorjs.io/)
- Authentication via [Keycloak](https://www.keycloak.org/)
- Backend powered by [FastAPI](https://fastapi.tiangolo.com/)
