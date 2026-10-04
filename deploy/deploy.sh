#!/usr/bin/env bash
# Build and release to a Docker host behind a Caddy gateway: a new timestamped release, `current` repointed, the
# container recreated. usage: KEY=<ssh key> HOST=<user@host> [SITE=https://...] deploy/deploy.sh
# Earlier releases stay in /opt/utsuroi/releases for rollback (repoint `current`, then recreate).
# compose.yaml is installed at /opt/utsuroi/, where its ./current and ./deploy paths resolve.
# The gateway fragment (gateway.caddy, from gateway.caddy.example) is copied but not reloaded; after changing it,
# validate and reload the gateway by hand.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY=${KEY:?set KEY to the ssh key}
HOST=${HOST:?set HOST to user@host}
STAMP=$(date +%Y%m%d-%H%M%S)

npm run build
ssh -i "$KEY" "$HOST" 'mkdir -p ~/utsuroi-upload'
rsync -az --delete -e "ssh -i $KEY" dist/ "$HOST:utsuroi-upload/dist/"
rsync -az --delete -e "ssh -i $KEY" deploy/ "$HOST:utsuroi-upload/deploy/"
ssh -i "$KEY" "$HOST" "STAMP=$STAMP bash -s" <<'REMOTE'
set -euo pipefail
R=/opt/utsuroi
sudo mkdir -p $R/releases $R/deploy
sudo cp -a ~/utsuroi-upload/dist $R/releases/$STAMP
sudo cp ~/utsuroi-upload/deploy/Caddyfile $R/deploy/
[ -f ~/utsuroi-upload/deploy/gateway.caddy ] && sudo cp ~/utsuroi-upload/deploy/gateway.caddy $R/deploy/
sudo cp ~/utsuroi-upload/deploy/compose.yaml $R/compose.yaml
sudo ln -sfn releases/$STAMP $R/current
sudo chown -R root:root $R
sudo chmod -R a+rX $R
# the bind mount resolves `current` when the container starts
cd $R && sudo docker compose up -d --force-recreate
for i in $(seq 1 30); do sudo docker exec utsuroi wget -q -O - http://127.0.0.1:8080/healthz 2>/dev/null && break; sleep 1; done
echo
echo "released $STAMP"
REMOTE
[ -n "${SITE:-}" ] && curl -fsS -o /dev/null -w "live %{http_code}\n" "$SITE"
