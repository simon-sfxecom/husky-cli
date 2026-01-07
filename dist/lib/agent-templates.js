export const DEFAULT_AGENT_CONFIGS = {
    support: {
        directories: [
            "sops",
            "tickets",
            "customers",
            "templates",
            "knowledge/auto",
            "learning",
            "logs",
        ],
        dependencies: ["google-cloud-firestore"],
        defaultPrompt: "Du bist ein Support Agent. Starte mit /shift-start um die Schicht zu beginnen.",
    },
    accounting: {
        directories: [
            "inbox/unprocessed",
            "inbox/processed",
            "inbox/failed",
            "documents/invoices",
            "documents/receipts",
            "exports",
            "logs",
        ],
        dependencies: ["google-cloud-firestore", "google-cloud-storage"],
        defaultPrompt: "Du bist ein Accounting Agent. Pruefe /inbox fuer neue Belege.",
    },
    marketing: {
        directories: [
            "campaigns/active",
            "campaigns/drafts",
            "newsletters/templates",
            "newsletters/sent",
            "assets/images",
            "analytics",
            "logs",
        ],
        dependencies: ["google-cloud-firestore"],
        defaultPrompt: "Du bist ein Marketing Agent. Pruefe /campaigns fuer aktuelle Kampagnen.",
    },
    research: {
        directories: [
            "sources/youtube",
            "sources/competitors",
            "products/images/raw",
            "products/images/processed",
            "products/data",
            "reports",
            "logs",
        ],
        dependencies: ["google-cloud-firestore", "yt-dlp"],
        defaultPrompt: "Du bist ein Research Agent. Pruefe /youtube fuer neue Videos zu analysieren.",
    },
};
export function generateStartupScript(agentType, huskyApiUrl, huskyApiKey, gcpProject) {
    let config;
    let typeName;
    let typeSlug;
    if (typeof agentType === "string") {
        config = DEFAULT_AGENT_CONFIGS[agentType] || DEFAULT_AGENT_CONFIGS.support;
        typeName =
            agentType.charAt(0).toUpperCase() + agentType.slice(1) + " Agent";
        typeSlug = agentType;
    }
    else {
        config = agentType.agentConfig;
        typeName = agentType.name;
        typeSlug = agentType.slug;
    }
    const dirsToCreate = config.directories
        .map((d) => `"$WORKSPACE/${d}"`)
        .join(" ");
    const pipDeps = config.dependencies.join(" ");
    return `#!/bin/bash
exec > /var/log/agent-init.log 2>&1
set -e

echo "=== AGENT VM STARTUP ==="
echo "Type: ${typeSlug}"
echo "Name: ${typeName}"
echo "Time: $(date)"

AGENT_TYPE="${typeSlug}"
AGENT_NAME="${typeName}"
HUSKY_API_URL="${huskyApiUrl || ""}"
HUSKY_API_KEY="${huskyApiKey || ""}"
GCP_PROJECT="${gcpProject || "$(curl -s http://metadata.google.internal/computeMetadata/v1/project/project-id -H Metadata-Flavor:Google)"}"

AGENT_USER="agent"
WORKSPACE="/home/$AGENT_USER/workspace"

if ! id "$AGENT_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$AGENT_USER"
    usermod -aG sudo "$AGENT_USER"
    echo "$AGENT_USER ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
fi

echo "[1/5] Installing system packages..."
apt-get update -qq
apt-get install -y -qq nodejs npm jq python3-pip imagemagick curl

echo "[2/5] Installing CLI tools..."
npm install -g @google/gemini-cli @huskyv0/cli 2>/dev/null || true

echo "[3/5] Installing Python dependencies..."
pip3 install ${pipDeps} 2>/dev/null || true

echo "[4/5] Creating workspace..."
sudo -u "$AGENT_USER" mkdir -p ${dirsToCreate}
sudo -u "$AGENT_USER" mkdir -p "$WORKSPACE/.gemini/commands" "$WORKSPACE/scripts"

echo "[5/5] Configuring environment..."
cat >> "/home/$AGENT_USER/.bashrc" << 'BASHRC'
export WORKSPACE="$HOME/workspace"
export AGENT_TYPE="${typeSlug}"
export AGENT_NAME="${typeName}"
export GOOGLE_CLOUD_PROJECT="$GCP_PROJECT"
export PATH="$WORKSPACE/scripts:$PATH"
alias ws="cd $WORKSPACE"
alias logs="tail -f $WORKSPACE/logs/$(date +%Y-%m-%d).log"
BASHRC

if [ -n "$HUSKY_API_URL" ] && [ -n "$HUSKY_API_KEY" ]; then
    sudo -u "$AGENT_USER" bash -c "husky config set api-url '$HUSKY_API_URL'"
    sudo -u "$AGENT_USER" bash -c "husky config set api-key '$HUSKY_API_KEY'"
fi

chown -R "$AGENT_USER:$AGENT_USER" "/home/$AGENT_USER"

echo "=== AGENT READY ==="
echo "Type: $AGENT_TYPE"
echo "Name: $AGENT_NAME"
echo "User: $AGENT_USER"
echo "Workspace: $WORKSPACE"
`;
}
export function getDefaultAgentConfig(slug) {
    return DEFAULT_AGENT_CONFIGS[slug];
}
export function listDefaultAgentTypes() {
    return Object.keys(DEFAULT_AGENT_CONFIGS);
}
