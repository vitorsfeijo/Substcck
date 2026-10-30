FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY config/tsconfig.server.json ./config/
COPY server ./server
RUN npm run build:api
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.cache/build/api ./build
COPY --chown=node:node package.json ./
COPY --chown=node:node server/db ./server/db
USER node
EXPOSE 3001
CMD ["sh", "-c", "node build/server/scripts/migrate.js && exec node build/server/index.js"]
