#!/bin/bash
# Import credentials from a temporary file
# Usage: ./import-from-file.sh /tmp/creds.txt

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <credentials-file>"
    echo ""
    echo "Example credentials file format:"
    echo "  NOCODB_API_TOKEN=your-token"
    echo "  SEATABLE_API_TOKEN=your-token"
    echo "  QDRANT_URL=your-url"
    echo "  QDRANT_API_KEY=your-key"
    echo ""
    exit 1
fi

CREDS_FILE=$1
ENV_FILE=".env"

if [ ! -f "$CREDS_FILE" ]; then
    echo "❌ File not found: $CREDS_FILE"
    exit 1
fi

# Backup existing .env
if [ -f "$ENV_FILE" ]; then
    backup="${ENV_FILE}.backup.$(date +%s)"
    cp "$ENV_FILE" "$backup"
    echo "✓ Backed up existing .env to: $backup"
fi

# Start with base template
cat > "$ENV_FILE" << 'EOF'
# Husky CLI Environment Variables
# Auto-generated - DO NOT COMMIT TO GIT

# Core
PROD_API_URL=https://huskyv0-dashboard-474966775596.europe-west1.run.app

# Environment
HUSKY_ENV=PROD

EOF

# Import credentials and add PROD_ prefix
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue

    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)

    # Add PROD_ prefix if not already present
    if [[ ! "$key" =~ ^PROD_ ]]; then
        key="PROD_${key}"
    fi

    echo "${key}=${value}" >> "$ENV_FILE"
done < "$CREDS_FILE"

echo "✓ Credentials imported to .env"
echo ""
echo "⚠️  SECURITY: Remember to delete the credentials file!"
echo "  rm $CREDS_FILE"
echo ""
echo "Test your config:"
echo "  husky config test"
