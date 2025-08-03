FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/


RUN npm ci

# Copy source code
COPY . .

RUN npx prisma generate

RUN npm run build

FROM node:18-alpine AS production

RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./


RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma


RUN mkdir -p uploads && chown -R nodejs:nodejs uploads

COPY --chown=nodejs:nodejs uploads ./uploads

USER nodejs

EXPOSE 8000


HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"


ENTRYPOINT ["dumb-init", "--"]


CMD ["node", "build/index.js"]