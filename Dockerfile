# syntax=docker/dockerfile:1.6
# TANAH-HAIR API + PWA shell (clinic + patient) — single Docker image
# Built for DigitalOcean App Platform and any Node 22 host.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Copy only the build inputs first so the TypeScript compile is cacheable.
COPY package.json ./
COPY apps/clinic-pwa/tsconfig.json ./apps/clinic-pwa/
COPY apps/patient-pwa/tsconfig.json ./apps/patient-pwa/
COPY apps/clinic-pwa/src ./apps/clinic-pwa/src
COPY apps/patient-pwa/src ./apps/patient-pwa/src

# TypeScript is the only build-time dep; use a global tsc.
RUN npm install --no-audit --no-fund --silent typescript@5.6.3 \
 && npx tsc -p apps/clinic-pwa/tsconfig.json \
 && npx tsc -p apps/patient-pwa/tsconfig.json \
 && npm prune --omit=dev || true

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

RUN groupadd --gid 1001 tanah \
 && useradd --uid 1001 --gid tanah --shell /bin/bash --create-home tanah

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY apps/api ./apps/api
COPY --chown=tanah:tanah apps/clinic-pwa/public ./apps/clinic-pwa/public
COPY --chown=tanah:tanah apps/patient-pwa/public ./apps/patient-pwa/public

RUN mkdir -p /data && chown -R tanah:tanah /data /app
USER tanah

EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8080) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/src/server.mjs"]
