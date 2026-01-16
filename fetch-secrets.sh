#!/bin/bash
# Fetch secrets from GCP Secret Manager and write to .env
#
# SECURITY: This script fetches secret values. Only run it locally, never in CI/CD.
# The .env file is gitignored to prevent accidental commits.

set -e

ENV_FILE=".env"

echo "🔐 Fetching secrets from GCP Secret Manager..."
echo ""

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
    echo "❌ Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi

# Create or clear .env file
> "$ENV_FILE"

# Function to safely fetch and append secret
fetch_secret() {
    local secret_name=$1
    local env_var_name=$2

    echo "Fetching $secret_name..."

    if gcloud secrets versions access latest --secret="$secret_name" &>/dev/null; then
        local value=$(gcloud secrets versions access latest --secret="$secret_name")
        echo "${env_var_name}=${value}" >> "$ENV_FILE"
        echo "✓ ${env_var_name}"
    else
        echo "⚠️  Secret '$secret_name' not found - skipping"
    fi
}

# Core Husky secrets
fetch_secret "HUSKY_API_KEY" "PROD_API_KEY"
fetch_secret "ANTHROPIC_API_KEY" "PROD_ANTHROPIC_API_KEY"

# Note: NocoDB and SeaTable secrets are not in Secret Manager yet.
# You need to add them manually:
echo ""
echo "📝 Manual configuration needed:"
echo ""
echo "NocoDB:"
echo "  1. Get API token from NocoDB UI (Account Settings → API Tokens)"
echo "  2. Add to .env: PROD_NOCODB_API_TOKEN=<token>"
echo "  3. Optional: PROD_NOCODB_BASE_URL=https://app.nocodb.com"
echo "  4. Optional: PROD_NOCODB_WORKSPACE_ID=noco"
echo ""
echo "SeaTable:"
echo "  1. Get API token from SeaTable UI (Base → Advanced → API Token)"
echo "  2. Add to .env: PROD_SEATABLE_API_TOKEN=<token>"
echo "  3. Optional: PROD_SEATABLE_SERVER_URL=https://cloud.seatable.io"
echo ""
echo "Qdrant:"
echo "  1. Get URL and API key from Qdrant Cloud"
echo "  2. Add to .env: PROD_QDRANT_URL=<url>"
echo "  3. Add to .env: PROD_QDRANT_API_KEY=<key>"
echo ""

echo "✓ Secrets written to $ENV_FILE"
echo ""
echo "⚠️  IMPORTANT:"
echo "   - Never commit .env to git (already in .gitignore)"
echo "   - Upload secrets to Secret Manager with: gcloud secrets create <name> --data-file=<file>"
