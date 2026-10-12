import { startTontoMcpServer } from "./server.js";
// Stdout is exclusively the MCP transport. Language-service logging belongs on stderr.
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);

try {
  await startTontoMcpServer(process.argv[2]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
