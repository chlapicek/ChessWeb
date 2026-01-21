# Multi-stage build for a React frontend (Create React App or similar)
FROM node:20-alpine AS build
WORKDIR /app

# Install basic build tools for native modules if needed
RUN apk add --no-cache python3 make g++

# Copy package manifests (package-lock.json optional)
COPY package*.json ./

# Use npm ci if lockfile exists, otherwise fall back to npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source and build
COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:stable-alpine AS final
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]