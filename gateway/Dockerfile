FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY metadata.mjs ./
COPY change.mjs ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server.mjs"]
