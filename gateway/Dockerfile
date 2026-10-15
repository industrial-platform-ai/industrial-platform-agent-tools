FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY roundhouse-preload.mjs ./
COPY mcp-server.mjs ./
COPY metadata.mjs ./
COPY price-intelligence.mjs ./
COPY change.mjs ./
COPY utilities.mjs ./
COPY market.mjs ./
COPY article.mjs ./
COPY network.mjs ./
COPY bundles.mjs ./
COPY agentic.mjs ./
COPY crypto-agent.mjs ./
COPY canonical.mjs ./
COPY adoption.mjs ./
COPY aimarket-federation.mjs ./
COPY inference.mjs ./
COPY commerce.mjs ./
COPY payment-assurance.mjs ./
COPY gas-fee-preflight.mjs ./
COPY tests/gas-fee-preflight.test.mjs ./tests/gas-fee-preflight.test.mjs
COPY tests/payment-assurance.test.mjs ./tests/payment-assurance.test.mjs
COPY factory-products.mjs ./
COPY factory-batch-engine.mjs ./
COPY delivery-ledger.mjs ./
COPY tests/delivery-ledger.test.mjs ./tests/delivery-ledger.test.mjs
COPY factory-batch-active.json ./
COPY tests/factory-batch-engine.test.mjs ./tests/factory-batch-engine.test.mjs
COPY factory-active.mjs ./
COPY tests/factory-products.test.mjs ./tests/factory-products.test.mjs
COPY tests/inference.test.mjs ./tests/inference.test.mjs
COPY tests/commerce.test.mjs ./tests/commerce.test.mjs
COPY tests/price-intelligence.test.mjs ./tests/price-intelligence.test.mjs
RUN npm run check
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","--import","./roundhouse-preload.mjs","server.mjs"]
