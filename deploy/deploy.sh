#!/usr/bin/env bash
# deploy.sh — Build, push, and deploy SoFi Copilot to Cloud Run
# Usage: ./deploy/deploy.sh [PROJECT_ID] [REGION]
set -euo pipefail

PROJECT_ID="${1:-${GCP_PROJECT_ID:-}}"
REGION="${2:-us-central1}"
IMAGE="gcr.io/${PROJECT_ID}/sofi-copilot"
SERVICE_NAME="sofi-copilot"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID is required. Pass as first arg or set GCP_PROJECT_ID env var."
  exit 1
fi

echo "==> Building Docker image: ${IMAGE}:latest"
docker build -t "${IMAGE}:latest" -f Dockerfile .

echo "==> Pushing to GCR"
docker push "${IMAGE}:latest"

echo "==> Deploying to Cloud Run (${REGION})"
gcloud run services replace deploy/service.yaml \
  --project="${PROJECT_ID}" \
  --region="${REGION}"

echo "==> Setting public IAM policy"
gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="allUsers" \
  --role="roles/run.invoker"

echo "==> Done. Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(status.url)"
