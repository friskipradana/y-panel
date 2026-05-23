# ──────────────────────────────────────────────
# Stage 1 — Build frontend assets
# ──────────────────────────────────────────────
FROM oven/bun:1 AS frontend-build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.html vite.config.ts tsconfig*.json postcss.config.js ./
COPY public/ public/
COPY src/ src/
RUN bun run build

# ──────────────────────────────────────────────
# Stage 2 — Compile Go binary
# ──────────────────────────────────────────────
FROM golang:1.22-bookworm AS backend-build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /ypanel-agent ./cmd/panel-agent/

# ──────────────────────────────────────────────
# Stage 3 — Final runtime image
# ──────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --system --shell /usr/sbin/nologin ypanel

# Copy compiled binary
COPY --from=backend-build /ypanel-agent /usr/local/bin/ypanel-agent

# Copy built frontend assets
COPY --from=frontend-build /app/dist /opt/ypanel/frontend

# Prepare runtime directories
RUN mkdir -p /var/lib/ypanel /etc/ypanel && \
    chown -R ypanel:ypanel /var/lib/ypanel /opt/ypanel

EXPOSE 8787

# Health check — lightweight HTTP probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/ypanel-agent", "--version"] || exit 1

ENTRYPOINT ["/usr/local/bin/ypanel-agent"]
