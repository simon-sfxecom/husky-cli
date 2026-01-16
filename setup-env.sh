#!/bin/bash
# Interactive .env setup script
# Credentials are NOT stored in shell history

set -e

ENV_FILE=".env"

echo "🔧 Husky CLI Environment Setup"
echo "=============================="
echo ""
echo "This script will help you configure your .env file."
echo "Press Ctrl+C to cancel at any time."
echo ""

# Function to read secret (hidden input)
read_secret() {
    local prompt=$1
    local var_name=$2
    local is_required=${3:-true}

    if [ "$is_required" = true ]; then
        while true; do
            read -s -p "$prompt: " value
            echo ""
            if [ -n "$value" ]; then
                echo "${var_name}=${value}" >> "$ENV_FILE"
                break
            else
                echo "❌ This field is required. Please enter a value."
            fi
        done
    else
        read -s -p "$prompt (optional, press Enter to skip): " value
        echo ""
        if [ -n "$value" ]; then
            echo "${var_name}=${value}" >> "$ENV_FILE"
        fi
    fi
}

# Function to read normal input
read_value() {
    local prompt=$1
    local var_name=$2
    local default=$3
    local is_required=${4:-false}

    if [ -n "$default" ]; then
        prompt="${prompt} [${default}]"
    fi

    if [ "$is_required" = true ]; then
        while true; do
            read -p "$prompt: " value
            value=${value:-$default}
            if [ -n "$value" ]; then
                echo "${var_name}=${value}" >> "$ENV_FILE"
                break
            else
                echo "❌ This field is required."
            fi
        done
    else
        read -p "$prompt: " value
        value=${value:-$default}
        if [ -n "$value" ]; then
            echo "${var_name}=${value}" >> "$ENV_FILE"
        fi
    fi
}

# Backup existing .env
if [ -f "$ENV_FILE" ]; then
    backup="${ENV_FILE}.backup.$(date +%s)"
    cp "$ENV_FILE" "$backup"
    echo "✓ Backed up existing .env to: $backup"
    echo ""
fi

# Create new .env
> "$ENV_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Core Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read_value "Husky API URL" "PROD_API_URL" "https://huskyv0-dashboard-474966775596.europe-west1.run.app" true
read_secret "Husky API Key" "PROD_API_KEY" true
read_secret "Anthropic API Key" "PROD_ANTHROPIC_API_KEY" true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Database Integrations (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Configure NocoDB? (y/N): " configure_nocodb
if [[ "$configure_nocodb" =~ ^[Yy]$ ]]; then
    read_secret "NocoDB API Token" "PROD_NOCODB_API_TOKEN" true
    read_value "NocoDB Base URL" "PROD_NOCODB_BASE_URL" "https://app.nocodb.com" false
    read_value "NocoDB Workspace ID" "PROD_NOCODB_WORKSPACE_ID" "noco" false
fi

echo ""
read -p "Configure SeaTable? (y/N): " configure_seatable
if [[ "$configure_seatable" =~ ^[Yy]$ ]]; then
    read_secret "SeaTable API Token" "PROD_SEATABLE_API_TOKEN" true
    read_value "SeaTable Server URL" "PROD_SEATABLE_SERVER_URL" "https://cloud.seatable.io" false
fi

echo ""
read -p "Configure Qdrant (Vector DB)? (y/N): " configure_qdrant
if [[ "$configure_qdrant" =~ ^[Yy]$ ]]; then
    read_value "Qdrant URL" "PROD_QDRANT_URL" "" true
    read_secret "Qdrant API Key" "PROD_QDRANT_API_KEY" true
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Business Integrations (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Configure Billbee? (y/N): " configure_billbee
if [[ "$configure_billbee" =~ ^[Yy]$ ]]; then
    read_secret "Billbee API Key" "PROD_BILLBEE_API_KEY" true
    read_value "Billbee Username" "PROD_BILLBEE_USERNAME" "" true
    read_secret "Billbee Password" "PROD_BILLBEE_PASSWORD" true
    read_value "Billbee Base URL" "PROD_BILLBEE_BASE_URL" "https://app.billbee.io" false
fi

echo ""
read -p "Configure Zendesk? (y/N): " configure_zendesk
if [[ "$configure_zendesk" =~ ^[Yy]$ ]]; then
    read_value "Zendesk Subdomain" "PROD_ZENDESK_SUBDOMAIN" "" true
    read_value "Zendesk Email" "PROD_ZENDESK_EMAIL" "" true
    read_secret "Zendesk API Token" "PROD_ZENDESK_API_TOKEN" true
fi

# Environment selector
echo "" >> "$ENV_FILE"
echo "# Environment Selector" >> "$ENV_FILE"
echo "HUSKY_ENV=PROD" >> "$ENV_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Configuration saved to: $ENV_FILE"
echo ""
echo "Next steps:"
echo "  1. Load environment: source .env"
echo "  2. Test config:      husky config test"
echo "  3. Test NocoDB:      husky biz nocodb --help"
echo ""
echo "⚠️  SECURITY: Never commit .env to git!"
echo ""
