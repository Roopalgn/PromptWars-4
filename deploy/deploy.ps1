param(
  [string]$ProjectId = "promptwars-4-502819",
  [string]$Region = "asia-south1"
)

$ErrorActionPreference = "Stop"

$ServiceName = "promptwars-smart-stadium"
$ServiceAccount = "241555494310-compute@developer.gserviceaccount.com"
$Image = "gcr.io/$ProjectId/${ServiceName}:latest"

Write-Host "==> Setting gcloud project: $ProjectId"
gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Building image with Cloud Build: $Image"
gcloud builds submit --project $ProjectId --tag $Image .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Deploying $ServiceName to Cloud Run ($Region)"
gcloud run deploy $ServiceName `
  --project $ProjectId `
  --region $Region `
  --image $Image `
  --service-account $ServiceAccount `
  --allow-unauthenticated `
  --port 8080 `
  --memory 512Mi `
  --cpu 1 `
  --concurrency 10 `
  --timeout 60 `
  --min-instances 1 `
  --max-instances 10 `
  --set-env-vars "NODE_ENV=production,GCP_PROJECT_ID=$ProjectId" `
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Service URL:"
gcloud run services describe $ServiceName `
  --project $ProjectId `
  --region $Region `
  --format "value(status.url)"
