clear
rm -rf node_modules/
rm -f package-lock.json
rm -f yarn.lock
rm -f pnpm-lock.yaml
rm -rf .next/
npm cache clean --force
npm install --legacy-peer-deps
npm run build
