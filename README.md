# Cross-Chain Arbitrage - Continuous Viem Script

A TypeScript boilerplate script using viem that runs continuously to monitor Avalanche and Sonic blockchain networks.

## Features

- **Multi-chain monitoring**: Supports Avalanche and Sonic mainnet networks
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
  AVALANCHE_RPC: `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  SONIC_RPC: `https://sonic-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,

  // WebSocket endpoints
  AVALANCHE_WS: `wss://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  SONIC_WS: `wss://sonic-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  // ... rest of config
};
```

### Environment Variables

Create a `.env` file in the root directory:

```bash
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

### Free RPC Providers

You can use these free RPC providers for testing:

- **Avalanche**:
  - Alchemy: `https://avax-mainnet.g.alchemy.com/v2/YOUR_API_KEY`
  - Public RPC: `https://api.avax.network/ext/bc/C/rpc`
- **Sonic**:
  - Alchemy: `https://sonic-mainnet.g.alchemy.com/v2/YOUR_API_KEY`

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

1. **Block Numbers**: Latest block numbers from Avalanche and Sonic networks
2. **Gas Prices**: Current gas prices for transaction cost monitoring
3. **Real-time Blocks**: WebSocket connections for instant block notifications
4. **Address Balances**: (Commented out) Monitor specific addresses

### Sample Output

```
[2024-01-15T10:30:00.000Z] [INFO] Starting viem continuous monitoring script...
[2024-01-15T10:30:00.000Z] [INFO] Setting up WebSocket monitoring...
[2024-01-15T10:30:00.000Z] [INFO] avalanche WebSocket monitoring started
[2024-01-15T10:30:00.000Z] [INFO] sonic WebSocket monitoring started
[2024-01-15T10:30:00.000Z] [INFO] Starting chain monitoring...
[2024-01-15T10:30:00.000Z] [INFO] avalanche block number: 45000000
[2024-01-15T10:30:00.000Z] [INFO] avalanche gas price: 25000000000 wei
[2024-01-15T10:30:00.000Z] [INFO] sonic block number: 15000000
[2024-01-15T10:30:00.000Z] [INFO] sonic gas price: 15000000000 wei
[2024-01-15T10:30:00.000Z] [INFO] Completed monitoring cycle
```

## Customization

### Adding New Chains

To add a new chain, import it from viem/chains and add it to the clients:

```typescript
import { fantom } from 'viem/chains';

const clients = {
  // ... existing chains
  fantom: createPublicClient({
    chain: fantom,
    transport: http('YOUR_FANTOM_RPC'),
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