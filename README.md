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
PROFIT_THRESHOLD=0.5
```

**Environment Variables:**
- `ALCHEMY_API_KEY`: Your Alchemy API key for RPC endpoints
- `PROFIT_THRESHOLD`: Minimum net profit in USD required to execute trades (default: 0)

**Important:** The application loads environment variables before importing other modules to ensure they are available throughout the application. Make sure your `.env` file is in the root directory of the project.

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

## How the Arbitrage Script Works

### Core Arbitrage Strategy

This script implements a **cross-chain arbitrage strategy** that exploits price differences of USDT/USDC pairs between Avalanche and Sonic networks. Here's how it works:

#### 1. **Price Monitoring**
- Continuously polls USDT/USDC pool prices on both chains every 5 seconds
- Calculates the price difference as a percentage
- Triggers arbitrage when difference exceeds the configured threshold (currently 0.1%)

#### 2. **Two Arbitrage Strategies**

**USDC-Targeted Arbitrage:**
```
1. Start with USDC on Chain A
2. Buy USDT on Chain A (where USDT is cheaper)
3. Bridge USDT to Chain B
4. Sell USDT for USDC on Chain B (where USDT is more expensive)
5. End with more USDC than started with
```

**USDT-Targeted Arbitrage:**
```
1. Start with USDT on Chain A
2. Sell USDT for USDC on Chain A (where USDT is cheaper)
3. Bridge USDC to Chain B
4. Buy USDT with USDC on Chain B (where USDT is more expensive)
5. End with more USDT than started with
```

#### 3. **Dynamic Trade Sizing**
- Uses up to 50% of available balance for each trade
- Minimum trade size of $100 to cover gas costs
- Maximum trade size capped at $1000 for risk management

#### 4. **Profit Calculation**
- Calculates gross profit from price difference
- Subtracts gas costs for both chains
- Only executes if net profit exceeds `PROFIT_THRESHOLD`
- Accounts for cross-chain bridge fees

### Paper Trading Implementation

Currently, this script runs in **paper trading mode**:
- Simulates trades without actual blockchain transactions
- Tracks virtual balances across chains
- Records all trades with profit/loss calculations
- Provides real-time portfolio statistics

### Sample Output

```
[2024-01-15T10:30:00.000Z] [INFO] Starting price monitoring...
[2024-01-15T10:30:00.000Z] [INFO] 💰 Profit threshold set to: $0.5
[2024-01-15T10:30:00.000Z] [INFO] 🚀 Initial Portfolio State:
[2024-01-15T10:30:00.000Z] [INFO] 💰 Current Paper Trading Balances:
[2024-01-15T10:30:00.000Z] [INFO]   🏔️  Avalanche:
[2024-01-15T10:30:00.000Z] [INFO]     USDC: 10000.00 ($10000.00)
[2024-01-15T10:30:00.000Z] [INFO]     USDT: 0.00 ($0.00)
[2024-01-15T10:30:00.000Z] [INFO]     Total: $10000.00
[2024-01-15T10:30:00.000Z] [INFO]   🎵 Sonic:
[2024-01-15T10:30:00.000Z] [INFO]     USDC: 10000.00 ($10000.00)
[2024-01-15T10:30:00.000Z] [INFO]     USDT: 0.00 ($0.00)
[2024-01-15T10:30:00.000Z] [INFO]     Total: $10000.00
[2024-01-15T10:30:00.000Z] [INFO]   📊 Portfolio Total: $20000.00
[2024-01-15T10:30:00.000Z] [INFO] Price comparison: Avalanche USDT=1.000123 USDC/USDT, Sonic USDT=0.999876 USDC/USDT, Diff=0.0247%
[2024-01-15T10:30:00.000Z] [INFO] 🚨 ARBITRAGE OPPORTUNITY FOUND! 0.0247% difference
[2024-01-15T10:30:00.000Z] [INFO] USDC-targeted arbitrage: Start 1000 USDC → End 1000.25 USDC = 0.25 USDC profit
[2024-01-15T10:30:00.000Z] [INFO] Net profit after gas: $0.15
[2024-01-15T10:30:00.000Z] [INFO] USDC-targeted arbitrage not profitable after gas costs (Net: $0.15, Threshold: $0.5)
```

## Bridge Choice for USDT

### Current Bridge Strategy

**Bridge Selection Criteria:**
1. **Speed**: Fastest finality for arbitrage opportunities
2. **Cost**: Lowest bridge fees to maximize profit margins
3. **Security**: Proven track record and TVL
4. **Liquidity**: Sufficient USDT liquidity on both sides

### Recommended Bridges for Production

**For Avalanche ↔ Sonic:**

1. **LayerZero** (Recommended)
   - Fast finality (~15-30 seconds)
   - Low fees (~$0.50-1.00 per transfer)
   - High security with $2B+ TVL
   - Native USDT support

2. **Stargate Finance**
   - Optimized for stablecoin transfers
   - Competitive fees
   - Good liquidity depth

3. **Multichain (Router Protocol)**
   - Established bridge with good track record
   - Slightly higher fees but reliable

### Bridge Integration Implementation

```typescript
// Example bridge integration (not implemented in current version)
interface BridgeConfig {
  name: string;
  contractAddress: string;
  estimatedTime: number; // seconds
  estimatedFee: number; // USD
  maxAmount: number; // USD
}

const BRIDGE_CONFIGS: Record<string, BridgeConfig> = {
  layerzero: {
    name: 'LayerZero',
    contractAddress: '0x...',
    estimatedTime: 30,
    estimatedFee: 0.75,
    maxAmount: 100000
  }
};
```

## Risk Management for Large Capital

### Principal Loss Risks

1. **Smart Contract Risk**
   - Bridge contract vulnerabilities
   - DEX contract exploits
   - Oracle manipulation

2. **Market Risk**
   - Price slippage during execution
   - MEV (Maximal Extractable Value) attacks
   - Front-running by other arbitrageurs

3. **Operational Risk**
   - Gas price spikes
   - Network congestion
   - RPC endpoint failures

### Risk Mitigation Strategies

#### 1. **Position Sizing & Diversification**
```typescript
// Implement position sizing rules
const MAX_POSITION_SIZE = 0.05; // 5% of total capital per trade
const MAX_DAILY_EXPOSURE = 0.20; // 20% of capital across all trades
const MIN_PROFIT_MARGIN = 0.02; // 2% minimum profit margin
```

#### 2. **Multi-Bridge Strategy**
- Use multiple bridges to reduce single-point-of-failure risk
- Implement bridge health monitoring
- Automatic fallback to alternative bridges

#### 3. **Advanced Risk Controls**
```typescript
interface RiskControls {
  maxSlippage: number; // Maximum allowed slippage
  maxGasPrice: number; // Maximum gas price to pay
  minLiquidity: number; // Minimum pool liquidity required
  maxExecutionTime: number; // Maximum time for trade execution
  circuitBreaker: boolean; // Emergency stop mechanism
}
```

#### 4. **Real-Time Monitoring**
- Portfolio value tracking
- Exposure limits monitoring
- Automated alerts for unusual activity
- Circuit breakers for rapid loss detection

#### 5. **Insurance & Hedging**
- Smart contract insurance (e.g., Nexus Mutual)
- Options hedging for large positions
- Diversification across multiple arbitrage strategies

### Implementation Priority for Large Capital

1. **Phase 1: Enhanced Monitoring**
   - Real-time portfolio tracking
   - Exposure limit enforcement
   - Automated alerting system

2. **Phase 2: Risk Controls**
   - Slippage protection
   - Gas price limits
   - Circuit breakers

3. **Phase 3: Multi-Bridge**
   - Bridge health monitoring
   - Automatic failover
   - Bridge fee optimization

4. **Phase 4: Advanced Features**
   - MEV protection
   - Insurance integration
   - Regulatory compliance

## Production Roadmap

### Phase 1: Real Trading Implementation (1-2 months)

**Core Features:**
- [ ] Real blockchain transaction execution
- [ ] Bridge integration (LayerZero/Stargate)
- [ ] Wallet management and private key security
- [ ] Real-time balance monitoring
- [ ] Transaction confirmation tracking

**Risk Management:**
- [ ] Position sizing controls
- [ ] Slippage protection
- [ ] Gas price optimization
- [ ] Circuit breakers

### Phase 2: Advanced Arbitrage (2-3 months)

**Multi-Chain Expansion:**
- [ ] Add Ethereum, Polygon, BSC
- [ ] Multi-token arbitrage (ETH, BTC, etc.)
- [ ] Cross-DEX arbitrage within same chain
- [ ] Flash loan integration for capital efficiency

**Performance Optimization:**
- [ ] MEV protection strategies
- [ ] Gas optimization techniques
- [ ] Parallel transaction execution
- [ ] Advanced order routing

### Phase 3: Institutional Features (3-4 months)

**Enterprise Features:**
- [ ] Multi-signature wallet support
- [ ] Role-based access control
- [ ] Audit logging and compliance
- [ ] API for external integrations
- [ ] Dashboard and reporting

**Advanced Risk Management:**
- [ ] Portfolio stress testing
- [ ] VaR (Value at Risk) calculations
- [ ] Correlation analysis
- [ ] Automated hedging strategies

### Phase 4: Scale & Optimize (4-6 months)

**Scaling Features:**
- [ ] Microservices architecture
- [ ] Database for historical data
- [ ] Machine learning for price prediction
- [ ] Automated strategy optimization
- [ ] Multi-region deployment

**Business Features:**
- [ ] Fee structure and revenue optimization
- [ ] Partner integrations
- [ ] White-label solutions
- [ ] Regulatory compliance framework

### Technology Stack for Production

**Backend:**
- **Language**: TypeScript/Node.js
- **Database**: PostgreSQL + Redis
- **Message Queue**: RabbitMQ/Apache Kafka
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)

**Infrastructure:**
- **Cloud**: AWS/GCP with multi-region deployment
- **Containerization**: Docker + Kubernetes
- **CI/CD**: GitHub Actions
- **Security**: Vault for secret management

**Blockchain:**
- **RPC**: Multiple providers with failover
- **Gas Optimization**: EIP-1559 support
- **MEV Protection**: Flashbots integration
- **Monitoring**: The Graph for indexing

### Success Metrics

**Performance Metrics:**
- APY (Annual Percentage Yield)
- Sharpe ratio
- Maximum drawdown
- Win rate
- Average trade size

**Operational Metrics:**
- Uptime percentage
- Average execution time
- Gas cost efficiency
- Bridge reliability
- Error rate

**Risk Metrics:**
- VaR (Value at Risk)
- Expected shortfall
- Correlation with market
- Liquidity utilization
- Exposure concentration

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

### Configuring Profit Threshold

Set the minimum profit required to execute trades by setting the `PROFIT_THRESHOLD` environment variable:

```bash
# Execute trades only if net profit is greater than $1.00
PROFIT_THRESHOLD=1.0

# Execute trades only if net profit is greater than $0.50
PROFIT_THRESHOLD=0.5

# Execute trades with any positive profit (default behavior)
PROFIT_THRESHOLD=0
```

This helps filter out trades that are profitable but may not be worth executing due to small profit margins.

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