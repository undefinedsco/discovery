# Discovery

A lightweight LLM model registry for the Solid ecosystem.

This v1 keeps the scope intentionally narrow:

- sync model metadata from OpenRouter
- treat OpenRouter interface metadata as the source of truth for model capabilities in v1
- normalize it into a stable internal schema
- allow manual overrides stored in PostgreSQL
- expose a small HTTP API for `linx`, `xpod`, and other internal consumers

## Scope

Current v1 only solves one problem well:

- maintain a practical, queryable LLM model registry
- use OpenRouter as the upstream source for broad model coverage
- allow internal curation through manual overrides
- serve downstream products through a small read API

Not in v1:

- full ecosystem discovery
- Pod-native storage
- Solid login / OIDC auth for end users
- ontology consensus or vocabulary governance

## Auth model

This service is intentionally simple in v1:

- public `GET` endpoints are open
- `/admin/*` endpoints require `ADMIN_API_KEY`
- admin auth supports either `x-admin-key` or `Authorization: Bearer ...`
- Solid user identity is not required in this version

If we later need Solid-native governance, we can add a separate auth layer or admin gateway without changing the public registry shape.

## Storage model

This project is Postgres-only.

Model identity is now composite:

- provider primary key: `providers.id`
- model primary key: `models.(provider_id, model_id)`
- API paths use nested resources instead of a single serialized model id

- canonical state lives in PostgreSQL
- startup runs schema migration automatically
- current curated registry is stored as JSONB
- upstream OpenRouter snapshots are stored for refresh/rebuild
- provider/model overrides are stored separately and reapplied on refresh

This keeps deployment simple on SealOS and avoids turning the registry into a CSS-like multi-backend store.

## Required environment

- `DATABASE_URL`
- `ADMIN_API_KEY` for `/admin/*`
- `OPENROUTER_API_KEY` optional; if set, sync requests include `Authorization: Bearer ...`
- `HOST` optional, defaults to `0.0.0.0`
- `PORT` optional, defaults to `3000`
- `DISCOVERY_SYNC_ON_START=false` to skip initial sync on boot
- `PGPOOL_MAX` optional, defaults to `10`

See `.env.example`.

## Local development

Requires:

- Node `22`
- PostgreSQL `14+` recommended

Run locally with real PostgreSQL:

```bash
cp .env.example .env
yarn install
yarn test
yarn build
yarn start
```

Run locally with in-memory pg-mem (no real PostgreSQL required):

```bash
ADMIN_API_KEY=dev-secret OPENROUTER_API_KEY='' yarn dev:mem
```

One-off sync:

```bash
yarn sync
```

## Docker

Build image:

```bash
docker build -t discovery .
```

Run container:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgres://postgres:postgres@host:5432/discovery' \
  -e ADMIN_API_KEY='replace-me' \
  -e HOST='0.0.0.0' \
  discovery
```

## Docker Compose

Start the full local stack:

```bash
docker compose up --build
```

This starts:

- `postgres` on `localhost:5432`
- `discovery` on `localhost:3000`

The compose file is at `docker-compose.yml`.

## SealOS deployment notes

Recommended setup:

- provision a managed PostgreSQL instance first
- deploy this app with the included `Dockerfile`
- set `DATABASE_URL` and `ADMIN_API_KEY` as environment variables
- set `HOST=0.0.0.0`
- pin runtime to Node `22` if deploying without Docker
- optionally disable boot sync with `DISCOVERY_SYNC_ON_START=false` during controlled rollout

Because schema migration runs on startup, there is no separate SQL bootstrap step for v1.

## Commands

```bash
yarn sync
yarn admin help
yarn test
yarn build
yarn start
yarn dev:mem
```

## Admin CLI

Use the built-in admin CLI instead of hand-writing `curl` requests.

Examples:

```bash
ADMIN_API_KEY=your-admin-key yarn admin sync
ADMIN_API_KEY=your-admin-key yarn admin list-model-overrides
ADMIN_API_KEY=your-admin-key yarn admin put-model-override 'openai' 'gpt-5' '{"aliases":{"add":["gpt-5-latest"]}}'
ADMIN_API_KEY=your-admin-key yarn admin delete-model-override 'openai' 'gpt-5'
```

If the API is not local, set `DISCOVERY_BASE_URL`, for example:

```bash
DISCOVERY_BASE_URL='https://discovery.example.com' ADMIN_API_KEY=your-admin-key yarn admin sync
```

## API

### HTTP caching

Public read endpoints expose cache metadata for polling clients:

- `ETag`
- `Last-Modified`
- `Cache-Control: public, max-age=60, stale-while-revalidate=300`
- conditional requests via `If-None-Match` and `If-Modified-Since`
- `HEAD` support for lightweight polling on public read endpoints

Example:

```bash
curl -i 'http://127.0.0.1:3000/registry'
curl -i 'http://127.0.0.1:3000/registry/version'
curl -i 'http://127.0.0.1:3000/providers/openai/version'
curl -i 'http://127.0.0.1:3000/providers/openai/models/gpt-5.4/version'
curl -I 'http://127.0.0.1:3000/registry'
curl -i 'http://127.0.0.1:3000/registry' -H 'If-None-Match: W/"..."'
```

### Public read

- `GET /health`
- `GET /registry`
- `GET /registry/version`
- `GET /sources`
- `GET /stats`
- `GET /providers`
- `GET /providers/:providerId`
- `GET /providers/:providerId/version`
- `GET /providers/:providerId/models`
- `GET /providers/:providerId/models/:modelId`
- `GET /providers/:providerId/models/:modelId/version`
- `GET /providers/:providerId/models/:modelId/sources`
- `GET /models`

Example:

```bash
curl 'http://127.0.0.1:3000/registry'
curl 'http://127.0.0.1:3000/stats'
curl 'http://127.0.0.1:3000/models?provider=openai'
curl 'http://127.0.0.1:3000/providers/openai/models/gpt-5.4'
```

### Admin write

All admin routes require either:

- `x-admin-key: <ADMIN_API_KEY>`
- or `Authorization: Bearer <ADMIN_API_KEY>`

Routes:

- `POST /admin/sync/openrouter`
- `GET /admin/overrides/providers`
- `PUT /admin/overrides/providers/:providerId`
- `DELETE /admin/overrides/providers/:providerId`
- `GET /admin/overrides/models`
- `PUT /admin/overrides/models/:providerId/:modelId`
- `DELETE /admin/overrides/models/:providerId/:modelId`

Example:

```bash
curl -X POST 'http://127.0.0.1:3000/admin/sync/openrouter' \
  -H 'x-admin-key: your-admin-key'
```


## GitHub + Sealos CD

Recommended production flow:

- GitHub team repository hosts the code
- GitHub Actions runs CI on every push/PR
- `main` branch builds and pushes image to `ghcr.io`
- GitHub Actions deploys to the Sealos Guangzhou cluster with `kubectl`
- PostgreSQL uses external Supabase and is injected through secrets

Required GitHub repository secrets:

- `KUBE_CONFIG_DATA` — base64-encoded kubeconfig for the Sealos Guangzhou cluster
- `SEALOS_NAMESPACE` — target namespace, for example `discovery`
- `SUPABASE_DATABASE_URL` — Supabase Postgres connection string
- `DISCOVERY_ADMIN_API_KEY` — admin API key for `/admin/*`
- `OPENROUTER_API_KEY` — optional OpenRouter token
- `SEALOS_INGRESS_HOST` — optional public hostname for ingress

Files:

- `.github/workflows/ci.yml`
- `.github/workflows/cd-sealos.yml`
- `deploy/k8s/deployment.yaml`
- `deploy/k8s/service.yaml`
- `deploy/k8s/ingress.yaml`
