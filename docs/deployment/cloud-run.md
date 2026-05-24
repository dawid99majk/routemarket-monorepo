# Deployment to Cloud Run

This document describes how to deploy the RouteMarket Atlas Engine to Google Cloud Run.

## Environment Variables

Ensure the following environment variables are set in the Cloud Run service configuration:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | The port the container listens on | `8787` |
| `ATLAS_API_TOKEN` | Secure token for API authorization | `your-secret-token` |
| `ATLAS_CORS_ORIGIN` | Allowed CORS origins | `https://your-frontend.com` |
| `SUPABASE_URL` | Your Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `ey...` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIza...` |
| `GEMINI_MODEL` | Gemini model to use | `gemini-3.5-flash` |
| `ATLAS_MAX_JOBS` | Maximum concurrent jobs | `200` |
| `ATLAS_LOG_REQUESTS` | Enable request logging | `true` |

## Deployment via Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Healthcheck

The service exposes a healthcheck endpoint at `/health`. 
Cloud Run will use this to determine if the container is ready.
