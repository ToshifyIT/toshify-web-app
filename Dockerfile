# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better cache - only reinstalls when deps change)
COPY package*.json ./

# Install ALL dependencies for build with BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# Build arguments for environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_CABIFY_USERNAME
ARG VITE_CABIFY_PASSWORD
ARG VITE_CABIFY_CLIENT_ID
ARG VITE_CABIFY_CLIENT_SECRET
ARG VITE_CABIFY_COMPANY_ID
ARG VITE_CABIFY_AUTH_URL
ARG VITE_CABIFY_GRAPHQL_URL
ARG VITE_ALQUILER_A_CARGO
ARG VITE_ALQUILER_TURNO

# Set environment variables for build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_CABIFY_USERNAME=$VITE_CABIFY_USERNAME
ENV VITE_CABIFY_PASSWORD=$VITE_CABIFY_PASSWORD
ENV VITE_CABIFY_CLIENT_ID=$VITE_CABIFY_CLIENT_ID
ENV VITE_CABIFY_CLIENT_SECRET=$VITE_CABIFY_CLIENT_SECRET
ENV VITE_CABIFY_COMPANY_ID=$VITE_CABIFY_COMPANY_ID
ENV VITE_CABIFY_AUTH_URL=$VITE_CABIFY_AUTH_URL
ENV VITE_CABIFY_GRAPHQL_URL=$VITE_CABIFY_GRAPHQL_URL
ENV VITE_ALQUILER_A_CARGO=$VITE_ALQUILER_A_CARGO
ENV VITE_ALQUILER_TURNO=$VITE_ALQUILER_TURNO

# Copy source code AFTER npm ci (better cache utilization)
COPY . .

# Build the app
RUN npm run build

# Production stage - minimal image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy server file
COPY server.js ./

# Expose port 80
EXPOSE 80

# Start the server
CMD ["node", "server.js"]
