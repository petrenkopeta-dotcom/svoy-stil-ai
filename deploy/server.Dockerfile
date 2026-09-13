# Verification image only. Version tag is not an immutable digest or host approval.
FROM node:24.17.0-bookworm-slim AS verify
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY server ./server
COPY scripts ./scripts
COPY runtime/cv ./runtime/cv
COPY public ./public
COPY index.html vite.config.js ./
RUN node --test --test-concurrency=2 scripts/server-status.test.js server/*.test.js && npm run build && npm run bundle:check

# No npm dependencies, original photos, datasets, models or build toolchain needed
# by this default-denied Node/SQLite listener. This is not a CV runtime image.
FROM node:24.17.0-bookworm-slim AS runtime
WORKDIR /opt/stylist
COPY --from=verify --chown=node:node /app/server ./server
COPY --from=verify --chown=node:node /app/scripts/server-start.mjs ./scripts/server-start.mjs
COPY --from=verify --chown=node:node /app/scripts/server-preflight.mjs ./scripts/server-preflight.mjs
USER node
ENV NODE_ENV=production
CMD ["node", "scripts/server-start.mjs"]
