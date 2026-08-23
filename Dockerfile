# Build spec for the Glama directory's server check: it starts the container and
# expects the MCP server to answer an introspection request over stdio.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY bin/ ./bin/
COPY docs/converter.js ./docs/converter.js

ENTRYPOINT ["node", "bin/markdown-to-whatsapp.js", "mcp"]
