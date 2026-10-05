FROM node:24-bookworm-slim AS sentinel-builder
WORKDIR /build/sentinel
COPY industrial-sentinel/package.json industrial-sentinel/tsconfig.json industrial-sentinel/index.ts industrial-sentinel/openclaw.plugin.json ./
RUN npm install
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS payer-builder
WORKDIR /build/payer
COPY industrial-sentinel-runtime/package.json ./
RUN npm install --omit=dev
COPY industrial-sentinel-runtime/payer-adapter.mjs ./

FROM ghcr.io/openclaw/openclaw:2026.9.8

USER root
COPY --from=sentinel-builder /build/sentinel /opt/industrial-sentinel
COPY --from=payer-builder /build/payer /opt/industrial-payer
COPY industrial-sentinel-runtime/entrypoint.sh /usr/local/bin/industrial-sentinel-entrypoint
RUN chmod 0755 /usr/local/bin/industrial-sentinel-entrypoint \
    && chown -R node:node /opt/industrial-sentinel /opt/industrial-payer

USER node
ENV OPENCLAW_STATE_DIR=/home/node/.openclaw
ENV OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json
ENV SENTINEL_PAYER_PORT=8403
EXPOSE 18789
ENTRYPOINT ["/usr/local/bin/industrial-sentinel-entrypoint"]
