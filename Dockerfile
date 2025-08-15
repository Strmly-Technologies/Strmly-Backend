FROM node:18-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-slim

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libchromaprint-tools \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Create directories and user
RUN mkdir -p /app/utils/{tmp,uploads,out,audio_uploads,audio_output} \
    && groupadd -r strmly \
    && useradd -r -g strmly strmly \
    && chown -R strmly:strmly /app

USER strmly

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]