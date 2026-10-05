FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY roundhouse-preload.mjs ./
COPY mcp-server.mjs ./
COPY metadata.mjs ./
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
RUN npm run check
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","--import","./roundhouse-preload.mjs","server.mjs"]
