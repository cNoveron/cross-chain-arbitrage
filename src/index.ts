import { createPublicClient, http, webSocket, PublicClient } from 'viem';
import { mainnet, polygon, arbitrum } from 'viem/chains';

// Configuration
const CONFIG = {
  // RPC endpoints - replace with your own if needed
  MAINNET_RPC: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  POLYGON_RPC: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  ARBITRUM_RPC: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,

  // WebSocket endpoints for real-time data
  MAINNET_WS: `wss://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  POLYGON_WS: `wss://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  ARBITRUM_WS: `wss://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,

  // Polling intervals
  BLOCK_POLLING_INTERVAL: 1000, // 1 second
  PRICE_POLLING_INTERVAL: 5000, // 5 seconds

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
};

// Create viem clients for different chains
const clients: Record<string, PublicClient> = {
  mainnet: createPublicClient({
    chain: mainnet,
    transport: http(CONFIG.MAINNET_RPC),
  }),
  polygon: createPublicClient({
    chain: polygon,
    transport: http(CONFIG.POLYGON_RPC),
  }),
  arbitrum: createPublicClient({
    chain: arbitrum,
    transport: http(CONFIG.ARBITRUM_RPC),
  }),
};

// WebSocket clients for real-time data
const wsClients: Record<string, PublicClient> = {
  mainnet: createPublicClient({
    chain: mainnet,
    transport: webSocket(CONFIG.MAINNET_WS),
  }),
  polygon: createPublicClient({
    chain: polygon,
    transport: webSocket(CONFIG.POLYGON_WS),
  }),
  arbitrum: createPublicClient({
    chain: arbitrum,
    transport: webSocket(CONFIG.ARBITRUM_WS),
  }),
};

// Utility functions
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
};

// Retry wrapper for API calls
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = CONFIG.MAX_RETRIES,
  delay: number = CONFIG.RETRY_DELAY
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries) {
        throw error;
      }
      log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`, 'warn');
      await sleep(delay);
    }
  }
  throw new Error('Max retries exceeded');
}

// Main monitoring functions
async function getBlockNumber(client: PublicClient, chainName: string): Promise<void> {
  try {
    const blockNumber = await withRetry(() => client.getBlockNumber());
    log(`${chainName} block number: ${blockNumber}`);
  } catch (error) {
    log(`Failed to get ${chainName} block number: ${error}`, 'error');
  }
}

async function getGasPrice(client: PublicClient, chainName: string): Promise<void> {
  try {
    const gasPrice = await withRetry(() => client.getGasPrice());
    log(`${chainName} gas price: ${gasPrice} wei`);
  } catch (error) {
    log(`Failed to get ${chainName} gas price: ${error}`, 'error');
  }
}

async function getBalance(client: PublicClient, chainName: string, address: string): Promise<void> {
  try {
    const balance = await withRetry(() => client.getBalance({ address: address as `0x${string}` }));
    log(`${chainName} balance for ${address}: ${balance} wei`);
  } catch (error) {
    log(`Failed to get ${chainName} balance: ${error}`, 'error');
  }
}

// Main monitoring loop
async function monitorChains(): Promise<void> {
  log('Starting chain monitoring...');

  while (true) {
    try {
      // Monitor all chains
      for (const [chainName, client] of Object.entries(clients)) {
        await getBlockNumber(client, chainName);
        await getGasPrice(client, chainName);

        // Example: monitor a specific address (replace with actual address)
        // await getBalance(client, chainName, '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6');
      }

      log('Completed monitoring cycle');
      await sleep(CONFIG.BLOCK_POLLING_INTERVAL);

    } catch (error) {
      log(`Error in monitoring loop: ${error}`, 'error');
      await sleep(CONFIG.RETRY_DELAY);
    }
  }
}

// WebSocket monitoring for real-time events
async function setupWebSocketMonitoring(): Promise<void> {
  log('Setting up WebSocket monitoring...');

  for (const [chainName, wsClient] of Object.entries(wsClients)) {
    try {
      // Watch for new blocks
      const unwatch = await wsClient.watchBlocks({
        onBlock: (block) => {
          log(`${chainName} new block: ${block.number}`);
        },
        onError: (error) => {
          log(`${chainName} WebSocket error: ${error}`, 'error');
        },
      });

      log(`${chainName} WebSocket monitoring started`);

      // Store unwatch function for cleanup (in a real app, you'd manage this properly)

    } catch (error) {
      log(`Failed to setup ${chainName} WebSocket monitoring: ${error}`, 'error');
    }
  }
}

// Graceful shutdown handling
function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

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