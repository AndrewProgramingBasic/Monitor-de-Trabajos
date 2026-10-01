# Stage 1: Build
FROM 22.23.3-alpine3.24 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Ensure .env.local is available for Next.js build-time variables (NEXT_PUBLIC_*)
COPY .env.local ./.env.local

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Production Runner
FROM 22.23.3-alpine3.24 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env.local ./.env.local

EXPOSE 3000

CMD ["npm", "start"]
