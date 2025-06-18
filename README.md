# Cross-Chain Arbitrage - Continuous Viem Script

A TypeScript boilerplate script using viem that runs continuously to monitor multiple blockchain networks.

## Features

- **Multi-chain monitoring**: Supports Ethereum Mainnet, Polygon, and Arbitrum
- **Real-time data**: WebSocket connections for live block monitoring
- **Robust error handling**: Retry mechanisms and graceful error recovery
- **Configurable polling**: Adjustable intervals for different monitoring tasks
- **Graceful shutdown**: Proper cleanup on SIGINT/SIGTERM signals
- **TypeScript**: Full type safety and modern ES2022 features

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

1. Clone or download this repository
2. Install dependencies:
```bash
npm install
```

## Configuration

Before running the script, you need to configure your RPC endpoints. Edit `src/index.ts` and replace the placeholder API keys:

```typescript
const CONFIG = {
  // Replace with your actual API keys
  MAINNET_RPC: 'https://eth-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-',
  POLYGON_RPC: 'https://polygon-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-',
  ARBITRUM_RPC: 'https://arb-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-',

  // WebSocket endpoints
  MAINNET_WS: 'wss://eth-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-',
  POLYGON_WS: 'wss://polygon-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-',
  ARBITRUM_WS: 'wss://arb-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-',
  // ... rest of config
};
```

### Free RPC Providers

You can use these free RPC providers for testing:

- **Ethereum Mainnet**:
  - Infura: `https://mainnet.infura.io/v3/YOUR_PROJECT_ID`
  - Alchemy: `https://eth-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-`
- **Polygon**:
  - Infura: `https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID`
  - Alchemy: `https://polygon-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-`
- **Arbitrum**:
  - Infura: `https://arbitrum-mainnet.infura.io/v3/YOUR_PROJECT_ID`
  - Alchemy: `https://arb-mainnet.g.alchemy.com/v2/{process.env.ALCHEMY_API_KEY}-`

## Usage

### Development Mode (with auto-restart)
```bash
npm run watch
```

### Development Mode (single run)
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## What the Script Does

The script continuously monitors:

1. **Block Numbers**: Latest block numbers from all configured chains
2. **Gas Prices**: Current gas prices for transaction cost monitoring
3. **Real-time Blocks**: WebSocket connections for instant block notifications
4. **Address Balances**: (Commented out) Monitor specific addresses

### Sample Output

```
[2024-01-15T10:30:00.000Z] [INFO] Starting viem continuous monitoring script...
[2024-01-15T10:30:00.000Z] [INFO] Setting up WebSocket monitoring...
[2024-01-15T10:30:00.000Z] [INFO] mainnet WebSocket monitoring started
[2024-01-15T10:30:00.000Z] [INFO] polygon WebSocket monitoring started
[2024-01-15T10:30:00.000Z] [INFO] arbitrum WebSocket monitoring started
[2024-01-15T10:30:00.000Z] [INFO] Starting chain monitoring...
[2024-01-15T10:30:00.000Z] [INFO] mainnet block number: 19000000
[2024-01-15T10:30:00.000Z] [INFO] mainnet gas price: 20000000000 wei
[2024-01-15T10:30:00.000Z] [INFO] polygon block number: 50000000
[2024-01-15T10:30:00.000Z] [INFO] polygon gas price: 30000000000 wei
[2024-01-15T10:30:00.000Z] [INFO] arbitrum block number: 15000000
[2024-01-15T10:30:00.000Z] [INFO] arbitrum gas price: 1000000000 wei
[2024-01-15T10:30:00.000Z] [INFO] Completed monitoring cycle
```

## Customization

### Adding New Chains

To add a new chain, import it from viem/chains and add it to the clients:

```typescript
import { optimism } from 'viem/chains';

const clients = {
  // ... existing chains
  optimism: createPublicClient({
    chain: optimism,
    transport: http('YOUR_OPTIMISM_RPC'),
  }),
};
```

### Adding New Monitoring Functions

Create new monitoring functions following the pattern:

```typescript
async function getTokenPrice(client: PublicClient, chainName: string, tokenAddress: string): Promise<void> {
  try {
    // Your monitoring logic here
    log(`${chainName} token price for ${tokenAddress}: ${price}`);
  } catch (error) {
    log(`Failed to get ${chainName} token price: ${error}`, 'error');
  }
}
```

### Adjusting Polling Intervals

Modify the CONFIG object to change polling frequencies:

```typescript
const CONFIG = {
  BLOCK_POLLING_INTERVAL: 2000, // 2 seconds
  PRICE_POLLING_INTERVAL: 10000, // 10 seconds
  // ... rest of config
};
```

## Error Handling

The script includes comprehensive error handling:

- **Retry Logic**: Failed API calls are retried up to 3 times
- **Graceful Degradation**: Individual chain failures don't stop the entire script
- **Logging**: All errors are logged with timestamps and severity levels
- **Graceful Shutdown**: Proper cleanup on Ctrl+C or SIGTERM

## Dependencies

- **viem**: Modern Ethereum TypeScript interface
- **typescript**: Type safety and modern JavaScript features
- **ts-node**: TypeScript execution environment
- **@types/node**: Node.js type definitions

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!