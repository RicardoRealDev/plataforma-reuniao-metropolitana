#!/usr/bin/env bash
# Setup único (não recorrente) da conta de serviço usada pelo backend para
# criar/sincronizar a planilha de saída da reunião no Google Sheets.
#
# Uso:
#   ./scripts/setup-google-cloud.sh <PROJECT_ID>
#
# Se <PROJECT_ID> não existir ainda, o script pergunta antes de criar um novo
# projeto no Google Cloud.

set -euo pipefail

PROJECT_ID="${1:-}"
SA_NAME="quorum-digital-sheets"
KEY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend/secrets"

if [ -z "$PROJECT_ID" ]; then
  echo "Uso: $0 <PROJECT_ID>" >&2
  exit 1
fi

if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  read -r -p "Projeto '$PROJECT_ID' não existe. Criar agora? [s/N] " resp
  if [[ "$resp" =~ ^[sS]$ ]]; then
    gcloud projects create "$PROJECT_ID"
  else
    echo "Abortado." >&2
    exit 1
  fi
fi

gcloud config set project "$PROJECT_ID"

echo "Habilitando Sheets API e Drive API..."
gcloud services enable sheets.googleapis.com drive.googleapis.com

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo "Criando service account $SA_EMAIL..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Quórum Digital — sincronização de planilhas"
else
  echo "Service account $SA_EMAIL já existe, reaproveitando."
fi

mkdir -p "$KEY_DIR"
KEY_PATH="$KEY_DIR/service-account.json"

echo "Gerando chave JSON em $KEY_PATH..."
gcloud iam service-accounts keys create "$KEY_PATH" --iam-account="$SA_EMAIL"

echo ""
echo "Pronto. Configure no backend/.env:"
echo "  GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./secrets/service-account.json"
echo "  SHEETS_SYNC_ENABLED=true"
echo "  SHEETS_SHARE_WITH_EMAILS=email1@exemplo.gov.br,email2@exemplo.gov.br"
echo ""
echo "IMPORTANTE: $KEY_PATH contém uma credencial sensível — nunca comite este"
echo "arquivo (já está coberto pelo .gitignore do backend)."
