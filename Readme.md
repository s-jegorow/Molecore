# Molecore

A minimalist, self-hosted block-based note-taking application with Keycloak authentication.

## Features

- Block-based editor using EditorJS
- Rich content types: Text, Headers, Lists, Code, Tables, Images, Audio, Files, Embeds
- Hierarchical pages with subpages
- Favorites system
- Full-text search across all pages
- Toggle blocks for collapsible content
- Dark mode support
- Mobile-responsive interface
- Keycloak authentication with JWT tokens
- Multi-user support with isolated workspaces
- File uploads with user quotas (20 MB per file, 500 MB per user)
- Cleanup tools for unused uploads
- No AI features
- No overblown database features
- Free and open source

## Tech Stack

**Frontend:**
- TypeScript
- Vite
- EditorJS
- Keycloak-js

**Backend:**
- Python 3.12+
- FastAPI
- SQLAlchemy
- PostgreSQL
- python-jose (JWT validation)

**Infrastructure:**
- Docker & Docker Compose
- Nginx (frontend reverse proxy)
- PostgreSQL 15

## Prerequisites

- Docker and Docker Compose
- A running Keycloak instance
- Domain with SSL (recommended for production)

## Keycloak Setup

1. **Create a Realm** in your Keycloak instance (e.g., `molecore`)

2. **Create a Client** with these settings:
   - Client ID: `molecore-webapp` (or your preferred name)
   - Client Protocol: `openid-connect`
   - Access Type: `public`
   - Valid Redirect URIs: `https://your-domain.com/*`
   - Web Origins: `https://your-domain.com`
   - Standard Flow Enabled: `ON`
   - Direct Access Grants Enabled: `OFF`

3. **Enable PKCE** (recommended for security):
   - In the client settings, set "Proof Key for Code Exchange Code Challenge Method" to `S256`

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/molecore.git
cd molecore
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database Configuration
POSTGRES_PASSWORD=your_secure_password_here

# Backend - Keycloak Authentication
KEYCLOAK_SERVER_URL=https://your-keycloak-server.com
KEYCLOAK_REALM=your-realm
KEYCLOAK_CLIENT_ID=your-client-id

# Backend - CORS Configuration
# Comma-separated list of allowed frontend origins
CORS_ORIGINS=https://your-frontend-domain.com

# Frontend - Keycloak Configuration (for Docker build)
VITE_KEYCLOAK_URL=https://your-keycloak-server.com
VITE_KEYCLOAK_REALM=your-realm
VITE_KEYCLOAK_CLIENT_ID=your-client-id
```

### 3. Build and start the containers

```bash
docker-compose up -d --build
```

This will:
- Start a PostgreSQL database
- Build and start the FastAPI backend (port 8000)
- Build and start the Nginx frontend (port 80)

### 4. Access the application

Open your browser and navigate to `http://localhost` (or your configured domain).

You'll be redirected to Keycloak for authentication.

## Development Setup

### Backend Development

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export KEYCLOAK_SERVER_URL=https://your-keycloak-server.com
export KEYCLOAK_REALM=your-realm
export KEYCLOAK_CLIENT_ID=your-client-id
export CORS_ORIGINS=http://localhost:5173
export DATABASE_URL=postgresql://molecore:password@localhost:5432/molecore

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local for development
cat > .env.local << EOF
VITE_KEYCLOAK_URL=https://your-keycloak-server.com
VITE_KEYCLOAK_REALM=your-realm
VITE_KEYCLOAK_CLIENT_ID=your-client-id
EOF

# Run development server
npm run dev
```

The frontend will be available at `http://localhost:5173`

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
- `POST /api/upload` - Upload file (image, audio, document)
- `POST /api/cleanup-uploads` - Clean up unused files

## Security Features

- JWT token validation with Keycloak
- User isolation (users can only access their own data)
- CORS protection
- Upload authentication required
- File size and quota limits
- SQL injection protection (SQLAlchemy ORM)
- XSS protection (sanitized content)

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

## Troubleshooting

### "KEYCLOAK_SERVER_URL environment variable is required"

Make sure your `.env` file is properly configured and loaded.

### "Invalid authentication credentials"

Check that:
1. Your Keycloak realm and client are correctly configured
2. The redirect URIs match your domain
3. The client is set to "public" access type
4. PKCE is enabled (S256)

### Database connection issues

Ensure PostgreSQL is running and the `DATABASE_URL` is correct:
```bash
docker-compose logs postgres
```

### Frontend not connecting to backend

Check that the nginx configuration correctly proxies `/api/*` requests to the backend container.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [EditorJS](https://editorjs.io/)
- Authentication via [Keycloak](https://www.keycloak.org/)
- Backend powered by [FastAPI](https://fastapi.tiangolo.com/)
