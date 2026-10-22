# -----------------------------------------------------------------------------
# Backend Monitoring System — Dockerfile
# Node.js v22 LTS (Alpine) production image
# -----------------------------------------------------------------------------
FROM node:22-alpine

# Create a non-root user for running the application.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeuser

WORKDIR /app

# Install production dependencies first (layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy application source.
COPY --chown=nodeuser:nodejs . .

# Switch to non-root user.
USER nodeuser

# Expose the application port.
EXPOSE 3001

# Healthcheck: verify the API is responding.
# Uses Node.js built-in http module because wget/curl are not guaranteed in node:alpine.
# /health returns 503 while MongoDB is unreachable, so the container is not
# reported healthy when results cannot be persisted. The start period covers
# the initial MongoDB connection retries.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
