#!/usr/bin/env node

import { startTontoMcpServer } from "../lib/mcp/server.js";

try {
  await startTontoMcpServer(process.argv[2]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
