#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Type check + build"
npm run -s build

echo "[2/3] Ensure no type=\"number\" remains in key UI pages"
if rg -n 'type="number"' pages components | grep -v 'AdminDashboard.tsx'; then
  echo "Found numeric inputs still using type=number" >&2
  exit 1
fi

echo "[3/3] Smoke scan for invoice navigation routes"
rg -n '/purchases/:purchaseId|/sales/:saleId' App.tsx

echo "Panel regression checks passed."
