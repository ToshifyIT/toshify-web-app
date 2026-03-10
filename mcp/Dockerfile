# MCP Server - Toshify Leads
FROM node:22-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy MCP server
COPY mcp/server.js ./mcp/server.js

# Expose MCP port
EXPOSE 3002

ENV MCP_PORT=3002

# Start the MCP server
CMD ["node", "mcp/server.js"]
