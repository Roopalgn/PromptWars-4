/**
 * Server entry point.
 * Initialises simulation and starts Express on PORT (default 8080).
 */
import app from './app.js';
import { initSimulation } from './simulation/tick.js';

const PORT = parseInt(process.env['PORT'] ?? '8080', 10);

initSimulation();
console.info(`[simulation] Initialised SoFi Stadium simulation`);

app.listen(PORT, () => {
  console.info(`[server] SoFi Stadium Copilot running on http://localhost:${PORT}`);
  console.info(`[server] Gemini: ${process.env['GEMINI_API_KEY'] ? 'enabled' : 'offline mode'}`);
  console.info(`[server] Firestore: ${process.env['GCP_PROJECT_ID'] ? 'enabled' : 'in-memory fallback'}`);
});
