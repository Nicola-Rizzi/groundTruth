#!/usr/bin/env node
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";

/**
 * HTTP entry point — one long-running server the whole team points at, instead of
 * every developer spawning their own stdio subprocess. Run it once (locally or on a
 * shared host) and point every client's config at the URL.
 *
 * Stateless mode (sessionIdGenerator: undefined): each request is self-contained, so
 * the server holds no per-client state and scales horizontally without sticky sessions.
 */
const PORT = Number(process.env.PORT ?? 3100);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  // Lightweight health check for load balancers / uptime monitors.
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
    return;
  }

  if (req.url !== MCP_PATH) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Not found. MCP endpoint is ${MCP_PATH}.` }));
    return;
  }

  // A fresh server + transport per request keeps the stateless guarantee airtight:
  // no shared mutable state can leak between concurrent clients.
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Request handling error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`groundtruth-mcp running on http://localhost:${PORT}${MCP_PATH}`);
  console.error(`health check: http://localhost:${PORT}/health`);
});
