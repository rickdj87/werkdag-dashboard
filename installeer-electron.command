#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "📦 Electron installeren..."
npm install

echo ""
echo "✅ Klaar! Je kunt nu 'start-als-app.command' dubbelklikken."
echo "   Of typ: npm run electron"
echo ""
read -p "Druk op Enter om te sluiten..."
