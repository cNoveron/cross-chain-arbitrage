import { createPublicClient, http, webSocket, PublicClient } from 'viem';
import { avalanche } from 'viem/chains';

// Configuration
const CONFIG = {
  // RPC endpoints - replace with your own if needed
  AVALANCHE_RPC: `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  SONIC_RPC: `https://sonic-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,

  // WebSocket endpoints for real-time data
  AVALANCHE_WS: `wss://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  SONIC_WS: `wss://sonic-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,

  // Polling intervals
  BLOCK_POLLING_INTERVAL: 1000, // 1 second
  PRICE_POLLING_INTERVAL: 5000, // 5 seconds

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second

  // Trading configuration
  PROFIT_THRESHOLD: parseFloat(process.env.PROFIT_THRESHOLD || '0'), // Minimum net profit in USD to execute trades
};

// Sonic chain configuration
const sonicChain = {
  id: 1001, // Sonic mainnet chain ID
  name: 'Sonic',
  network: 'sonic',
  nativeCurrency: {
    decimals: 18,
    name: 'Sonic',
    symbol: 'S',
  },
  rpcUrls: {
    default: { http: [CONFIG.SONIC_RPC] },
    public: { http: [CONFIG.SONIC_RPC] },
  },
};

// Create viem clients for different chains
export const clients: Record<string, PublicClient> = {
  avalanche: createPublicClient({
    chain: avalanche,
    transport: http(CONFIG.AVALANCHE_RPC),
  }),
  sonic: createPublicClient({
    chain: sonicChain,
    transport: http(CONFIG.SONIC_RPC),
  }),
};

// WebSocket clients for real-time data
export const wsClients: Record<string, PublicClient> = {
  avalanche: createPublicClient({
    chain: avalanche,
    transport: webSocket(CONFIG.AVALANCHE_WS),
  }),
  sonic: createPublicClient({
    chain: sonicChain,
    transport: webSocket(CONFIG.SONIC_WS),
  }),
};

// Export chain names for easy access
export const CHAIN_NAMES = ['avalanche', 'sonic'] as const;
export type ChainName = typeof CHAIN_NAMES[number];

// Export configuration for use in other modules
export { CONFIG };