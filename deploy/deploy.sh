#!/usr/bin/env bash
# Build with Cloud Build and deploy to Cloud Run.
# Usage: ./deploy/deploy.sh [PROJECT_ID] [REGION]
set -euo pipefail

PROJECT_ID="${1:-${GCP_PROJECT_ID:-promptwars-4-502819}}"
REGION="${2:-asia-south1}"
SERVICE_NAME="promptwars-smart-stadium"
SERVICE_ACCOUNT="241555494310-compute@developer.gserviceaccount.com"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "==> Setting gcloud project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

echo "==> Building image with Cloud Build: ${IMAGE}"
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE}" \
  .

echo "==> Deploying ${SERVICE_NAME} to Cloud Run (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=10 \
  --timeout=60 \
  --min-instances=1 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID}" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"

echo "==> Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(status.url)"
