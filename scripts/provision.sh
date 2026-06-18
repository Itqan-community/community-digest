#!/usr/bin/env bash
# provision.sh — create the community-digest droplet in the same DO region as flarum-prod-db
# Prerequisites: doctl installed and authenticated (`doctl auth init`)
# Usage: bash scripts/provision.sh

set -euo pipefail

DO_PROJECT_ID="aa45e321-748b-45d7-b411-7c3f68260ded"
REGION="lon1"
SIZE="s-1vcpu-1gb"
IMAGE="ubuntu-22-04-x64"
SSH_KEY_ID="49711842"
DROPLET_NAME="community-digest"
REFERENCE_DROPLET="flarum-prod-db"

# Auto-detect SSH key (prefer id_rsa, fallback to id_ed25519)
if [[ -f ~/.ssh/id_rsa ]]; then
  SSH_KEY_PATH=~/.ssh/id_rsa
elif [[ -f ~/.ssh/id_ed25519 ]]; then
  SSH_KEY_PATH=~/.ssh/id_ed25519
else
  echo "ERROR: No SSH private key found at ~/.ssh/id_rsa or ~/.ssh/id_ed25519"
  exit 1
fi

echo "=== community-digest provisioner ==="
echo "  SSH key: $SSH_KEY_PATH"

# 1. Check doctl
if ! command -v doctl &>/dev/null; then
  echo "ERROR: doctl not installed. Run: brew install doctl && doctl auth init"
  exit 1
fi

# 2. Confirm reference droplet exists (validates region + auth)
echo "Confirming $REFERENCE_DROPLET exists in $REGION..."
REF_CHECK=$(doctl compute droplet list --format Name --no-header | grep -x "$REFERENCE_DROPLET" || true)
if [[ -z "$REF_CHECK" ]]; then
  echo "ERROR: Could not find droplet '$REFERENCE_DROPLET'. Is doctl authenticated to the right account?"
  exit 1
fi
echo "  Found: $REFERENCE_DROPLET"

# Detect VPC UUID (may be nil for legacy private networking — that's fine)
VPC_UUID=$(doctl compute droplet list --format Name,VpcUUID --no-header \
  | awk -v name="$REFERENCE_DROPLET" '$1 == name { print $2 }')
echo "  VPC UUID: ${VPC_UUID:-<legacy private networking>}"

# 3. Check droplet doesn't already exist
EXISTING=$(doctl compute droplet list --format Name --no-header | grep -x "$DROPLET_NAME" || true)
if [[ -n "$EXISTING" ]]; then
  echo "ERROR: Droplet '$DROPLET_NAME' already exists. Aborting to avoid duplicates."
  exit 1
fi

# 4. Create droplet — use --vpc-uuid only if reference droplet has one
echo "Creating droplet '$DROPLET_NAME' ($SIZE, $REGION)..."
CREATE_ARGS=(
  "$DROPLET_NAME"
  --region "$REGION"
  --size "$SIZE"
  --image "$IMAGE"
  --ssh-keys "$SSH_KEY_ID"
  --enable-private-networking
  --wait
  --format ID
  --no-header
)

# Only pass --vpc-uuid if the reference droplet has a real one
if [[ -n "$VPC_UUID" && "$VPC_UUID" != "<nil>" ]]; then
  CREATE_ARGS+=(--vpc-uuid "$VPC_UUID")
fi

DROPLET_ID=$(doctl compute droplet create "${CREATE_ARGS[@]}")
echo "  Droplet ID: $DROPLET_ID"

# 5. Get public IP
echo "Fetching public IP..."
PUBLIC_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)
echo "  Public IP: $PUBLIC_IP"

# 6. Assign to DO project
echo "Adding to project $DO_PROJECT_ID..."
doctl projects resources assign "$DO_PROJECT_ID" \
  --resource="do:droplet:$DROPLET_ID"
echo "  Done."

# 7. Wait for SSH to become available
echo "Waiting for SSH on $PUBLIC_IP..."
for i in $(seq 1 30); do
  if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
      -i "$SSH_KEY_PATH" "root@$PUBLIC_IP" "echo ok" &>/dev/null; then
    echo "  SSH ready."
    break
  fi
  echo "  Attempt $i/30..."
  sleep 5
done

# 8. Copy .env (must exist locally with real DB_PASS filled in)
if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Fill in DB_PASS before provisioning."
  exit 1
fi
if grep -q "REPLACE_WITH_PRODUCTION_DB_PASSWORD" .env; then
  echo "ERROR: .env still has placeholder DB_PASS. Fill it in first."
  exit 1
fi
echo "Copying .env to droplet..."
scp -o StrictHostKeyChecking=no -i "$SSH_KEY_PATH" \
  .env "root@$PUBLIC_IP:/tmp/.env.digest"

# 9. Run setup on the droplet
echo "Running setup script on droplet..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY_PATH" "root@$PUBLIC_IP" \
  "bash -s" < scripts/setup.sh

echo ""
echo "=== Provisioning complete ==="
echo "  Droplet:    $DROPLET_NAME ($PUBLIC_IP)"
echo "  Next steps:"
echo "    1. Add DNS A record: digest.community.itqan.dev -> $PUBLIC_IP"
echo "    2. Run certbot once DNS propagates (see setup.sh output)"
echo "    3. Update .env UNSUBSCRIBE_BASE_URL=https://digest.community.itqan.dev"
echo "    4. scp .env root@$PUBLIC_IP:/opt/community-digest/.env && ssh root@$PUBLIC_IP 'pm2 restart digest-server'"
echo "    5. Test: ssh root@$PUBLIC_IP 'cd /opt/community-digest && SEND_MODE=test node digest.js'"
