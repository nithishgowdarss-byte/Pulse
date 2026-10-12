#!/usr/bin/env bash
# Creates a self-signed HTTPS certificate for this computer's LAN IP(s) so phones on the same Wi-Fi
# can use the camera (QR check-in). Free, nothing is deployed or exposed to the internet.
# Usage: scripts/lan-https-cert.sh [extra-ip-or-hostname ...]   -> writes ./certs/lan.crt and ./certs/lan.key
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs
IPS=$( (hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true) | tr ' ' '\n' | grep -E '^[0-9]+\.' || true)
SAN="DNS:localhost,IP:127.0.0.1"
for ip in $IPS; do SAN="$SAN,IP:$ip"; done
for x in "$@"; do if [[ $x =~ ^[0-9.]+$ ]]; then SAN="$SAN,IP:$x"; else SAN="$SAN,DNS:$x"; fi; done
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -sha256 \
  -keyout certs/lan.key -out certs/lan.crt -subj "/CN=Pulse LAN" -addext "subjectAltName=$SAN" 2>/dev/null
chmod 600 certs/lan.key
echo "Created certs/lan.crt for: $SAN"
echo "Start:  HTTPS_CERT=certs/lan.crt HTTPS_KEY=certs/lan.key HOST=0.0.0.0 npm start"
for ip in $IPS; do echo "Phone:  https://$ip:${PORT:-3000}"; done
