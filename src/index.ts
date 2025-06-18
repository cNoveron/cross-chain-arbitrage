import { config } from 'dotenv';
import { log, setupGracefulShutdown } from './utils';
import { monitorChains, setupWebSocketMonitoring } from './arbitrage';

// Load environment variables
config();

// Main function
async function main(): Promise<void> {
  try {
    log('Starting viem continuous monitoring script...');

    // Setup graceful shutdown
    setupGracefulShutdown();

    // Start WebSocket monitoring
    await setupWebSocketMonitoring();

    // Start the main monitoring loop
    await monitorChains();

  } catch (error) {
    log(`Fatal error: ${error}`, 'error');
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    log(`Unhandled error: ${error}`, 'error');
    process.exit(1);
  });
}

export { main, monitorChains, setupWebSocketMonitoring };