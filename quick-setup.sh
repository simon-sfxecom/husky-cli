#!/bin/bash
# Quick .env setup from command line arguments
# WARNING: Credentials will be visible in shell history!

cat > .env << 'EOF'
# Core
PROD_API_URL=https://huskyv0-dashboard-474966775596.europe-west1.run.app
PROD_API_KEY=${HUSKY_API_KEY}
PROD_ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# NocoDB
PROD_NOCODB_API_TOKEN=${NOCODB_API_TOKEN}
PROD_NOCODB_BASE_URL=${NOCODB_BASE_URL:-https://app.nocodb.com}
PROD_NOCODB_WORKSPACE_ID=${NOCODB_WORKSPACE_ID:-noco}

# SeaTable
PROD_SEATABLE_API_TOKEN=${SEATABLE_API_TOKEN}
PROD_SEATABLE_SERVER_URL=${SEATABLE_SERVER_URL:-https://cloud.seatable.io}

# Qdrant
PROD_QDRANT_URL=${QDRANT_URL}
PROD_QDRANT_API_KEY=${QDRANT_API_KEY}

# Billbee
PROD_BILLBEE_API_KEY=${BILLBEE_API_KEY}
PROD_BILLBEE_USERNAME=${BILLBEE_USERNAME}
PROD_BILLBEE_PASSWORD=${BILLBEE_PASSWORD}
PROD_BILLBEE_BASE_URL=${BILLBEE_BASE_URL:-https://app.billbee.io}

# Zendesk
PROD_ZENDESK_SUBDOMAIN=${ZENDESK_SUBDOMAIN}
PROD_ZENDESK_EMAIL=${ZENDESK_EMAIL}
PROD_ZENDESK_API_TOKEN=${ZENDESK_API_TOKEN}

# GCP
PROD_GCP_PROJECT_ID=${GCP_PROJECT_ID:-huskyv0}
PROD_GCP_LOCATION=${GCP_LOCATION:-europe-west1}

# Environment
HUSKY_ENV=PROD
EOF

echo "✓ .env created from environment variables"
echo ""
echo "Usage:"
echo "  export NOCODB_API_TOKEN='your-token'"
echo "  export SEATABLE_API_TOKEN='your-token'"
echo "  ./quick-setup.sh"
