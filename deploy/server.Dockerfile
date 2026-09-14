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
RUN node --test --test-concurrency=2 scripts/server-status.test.js server/*.test.js && VITE_VK_STAGING=true npm run build && npm run bundle:check

FROM scratch AS frontend
COPY --from=verify /app/dist /dist

# No npm dependencies, original photos, datasets, models or build toolchain needed
# by this default-denied Node/SQLite listener. This is not a CV runtime image.
FROM node:24.17.0-bookworm-slim AS runtime
WORKDIR /opt/stylist
COPY --from=verify --chown=node:node /app/package.json ./package.json
COPY --from=verify --chown=node:node /app/server/stagingServer.mjs /app/server/stagingApi.mjs /app/server/sqliteSessionStore.mjs /app/server/vkAuth.mjs /app/server/vkProfileStore.mjs ./server/
COPY --from=verify --chown=node:node /app/src/vkProfileContract.js /app/src/vkWardrobeMetadataContract.js ./src/
COPY --from=verify --chown=node:node /app/src/vkStagingJourney.js /app/src/vkStagingCity.js ./src/
COPY --from=verify --chown=node:node /app/scripts/server-start.mjs ./scripts/server-start.mjs
COPY --from=verify --chown=node:node /app/scripts/server-preflight.mjs ./scripts/server-preflight.mjs
USER node
ENV NODE_ENV=production
# Verification runtime: loopback is intentional. Bridge port publishing cannot
# reach it. Approved host systemd + host Nginx is the staging topology.
CMD ["node", "scripts/server-start.mjs"]
