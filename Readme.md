# Molecore

A minimalist, self-hosted block-based note-taking application with Keycloak authentication developed by me out of frustration with current note tools like Obsidian or Notion...

![Molecore Screenshot](molecorescreenshot.png)

## Features

- Rich content block types: Text, Headers, Lists, Code, Tables, Images, Audio, Files, Embeds
- Hierarchical pages with subpages
- Favorites system
- Full-text search across all pages
- Toggle blocks for collapsible content
- Dark mode support
- Mobile-responsive interface
- Keycloak authentication with JWT tokens
- Multi-user support with isolated workspaces
- File uploads with user quotas (20 MB per file, 500 MB per user)
- Simple cleanup tool for unused uploads
- No annoying AI features
- No overblown database features
- Free and open source

## Tech Stack

**Frontend:**
- TypeScript + EditorJS + Keycloak-js
- Vite

**Backend:**
- Python + FastAPI + SQLAlchemy + python-jose (JWT validation)
- PostgreSQL

## Installation

Prepared for Docker + Nginx deployment with Keycloak authentication.

1. Setup your Keycloak-Server
2. Clone this Repo
3. Configure environment variables in `.env` (see `.env.example`) or use docker secrets
4. Run `docker-compose up -d --build`
5. Have fun

## Configuration

### Upload Limits

Default limits (configurable in `backend/main.py`):
- **Max file size**: 20 MB per upload
- **Max storage per user**: 500 MB total

### File Storage

User uploads are stored in:
```
backend/uploads/{user_id}/
```

Each user has an isolated directory for their uploads.

## API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user info

### Pages
- `GET /api/pages` - List all pages (user-specific)
- `GET /api/pages/{page_id}` - Get specific page
- `POST /api/pages` - Create new page
- `PUT /api/pages/{page_id}` - Update page
- `DELETE /api/pages/{page_id}` - Delete page

### Uploads
- `POST /api/upload` - Upload file (image, audio, document) <- also checks the token now, since v2.0
- `POST /api/cleanup-uploads` - Clean up unused files

## Security Features

- JWT token validation with Keycloak
- User isolation (users can only access their own data)
- Upload authentication required
- File size and quota limits
- SQL injection protection (SQLAlchemy ORM)


## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────┐     ┌──────────────┐
│   Nginx     │────▶│   Keycloak   │
│  (Frontend) │     │ (Auth Server)│
└──────┬──────┘     └──────────────┘
       │
       │ /api/*
       ▼
┌─────────────┐     ┌──────────────┐
│   FastAPI   │────▶│  PostgreSQL  │
│  (Backend)  │     │  (Database)  │
└─────────────┘     └──────────────┘
```

## Upcoming Features and Fixes

- A few security fixes (XSS protection..)
- probably a new main navigation similar to the mobile version
- better handling of deleted files
- minor fixes (auth-header for icon upload needs to be fixed)
- MacOS App with offline feature (probably via sync down and sync up button to avoid sync problems)


## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [EditorJS](https://editorjs.io/)
- Authentication via [Keycloak](https://www.keycloak.org/)
- Backend powered by [FastAPI](https://fastapi.tiangolo.com/)
