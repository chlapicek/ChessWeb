# =========================
# Build stage
# =========================
FROM node:20-alpine AS build
WORKDIR /app

# Install build tools for native modules if needed
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package*.json ./

# Install dependencies (legacy-peer-deps is safer for Docker builds)
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi

# Copy source files
COPY . .

# Build Vite frontend
RUN npm run build

# =========================
# Runtime stage (serve with Nginx)
# =========================
FROM nginx:stable-alpine AS final
WORKDIR /usr/share/nginx/html

# Copy built static files from Vite
COPY --from=build /app/dist ./


# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
