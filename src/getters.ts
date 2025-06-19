import { createPublicClient, http, webSocket, PublicClient, getContract, parseAbi } from 'viem';
import { avalanche, mainnet } from 'viem/chains';
import { clients, CONFIG } from './clients';
import { log, withRetry, sleep } from './utils';

// Price storage for each chain
export const lastPrices: Record<string, {
  usdc: number;
  usdt: number;
  timestamp: number
}> = {};

// Gas cost storage for each chain
export const gasCosts: Record<string, {
  gasPrice: bigint;
  estimatedGas: bigint;
  totalCost: bigint;
  timestamp: number
}> = {};

// Chainlink Price Feed ABI (simplified for price feeds)
const CHAINLINK_PRICE_FEED_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
]);

// Chainlink Price Feed addresses
const PRICE_FEEDS: Record<string, Record<string, string>> = {
  avalanche: {
    AVAX: '0x0A77230d17318075983913bC2145DB16C7366156',
  },
  sonic: {
    S: '0xc76dFb89fF298145b417d221B2c747d84952e01d',  // S/USD (mainnet)
  }
};

// Cache for price feeds to avoid excessive RPC calls
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const CACHE_DURATION = 30000; // 30 seconds

// CCIP (Cross-Chain Interoperability Protocol) Configuration
const CCIP_CONFIG: Record<string, {
  router: string;
  linkToken: string;
  chainSelector: bigint;
}> = {
  avalanche: {
    router: '0x554472a2720E5E7D5D3C817529aBA05EEd5F82D8', // Avalanche CCIP Router
    linkToken: '0x5947BB275c521040051D82396192181b413227A3', // LINK token on Avalanche
    chainSelector: 12532609583862916517n, // Avalanche Fuji testnet
  },
  sonic: {
    router: '0xE561d5E02207fb5eB32cca20a699E0d8919a1476', // Sonic CCIP Router (using Polygon Mumbai as example)
    linkToken: '0x326C977E6efc84E512bB9C30f76E30c160eD06FB', // LINK token on Sonic
    chainSelector: 12532609583862916517n, // Sonic chain selector
  }
};

// CCIP Message ABI
const CCIP_MESSAGE_ABI = parseAbi([
  'function ccipSend(uint64 destinationChainSelector, address receiver, bytes calldata data, address token, uint256 amount, address feeToken, bytes calldata extraArgs) external returns (bytes32)',
  'function getFee(uint64 destinationChainSelector, address receiver, bytes calldata data, address token, uint256 amount, address feeToken, bytes calldata extraArgs) external view returns (uint256)',
  'function getSupportedTokens(uint64 chainSelector) external view returns (address[] memory)',
]);

// USDC and USDT token addresses for CCIP
const TOKEN_ADDRESSES: Record<string, {
  USDC: string;
  USDT: string;
}> = {
  avalanche: {
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC on Avalanche
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT on Avalanche
  },
  sonic: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Sonic (using Polygon as example)
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT on Sonic
  }
};

// CCIP Message Receiver ABI
const CCIP_RECEIVER_ABI = parseAbi([
  'function _ccipReceive(bytes calldata message) external',
  'event TokensTransferred(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address sender, address receiver, address token, uint256 amount, address feeToken, uint256 fees)',
]);

// Main monitoring functions
export async function getBlockNumber(client: PublicClient, chainName: string): Promise<void> {
  try {
    const blockNumber = await withRetry(() => client.getBlockNumber());
    log(`${chainName} block number: ${blockNumber}`);
  } catch (error) {
    log(`Failed to get ${chainName} block number: ${error}`, 'error');
  }
}

export async function getGasPrice(client: PublicClient, chainName: string): Promise<void> {
  try {
    const gasPrice = await withRetry(() => client.getGasPrice());
    log(`${chainName} gas price: ${gasPrice} wei`);
  } catch (error) {
    log(`Failed to get ${chainName} gas price: ${error}`, 'error');
  }
}

export async function getBalance(client: PublicClient, chainName: string, address: string): Promise<void> {
  try {
    const balance = await withRetry(() => client.getBalance({ address: address as `0x${string}` }));
    log(`${chainName} balance for ${address}: ${balance} wei`);
  } catch (error) {
    log(`Failed to get ${chainName} balance: ${error}`, 'error');
  }
}

// Gas cost estimation functions
export async function estimateSwapGasCost(
  client: PublicClient,
  chainName: string
): Promise<void> {
  try {
    // Get current gas price
    const gasPrice = await withRetry(() => client.getGasPrice());

    // Estimate gas for a swap transaction
    // These are typical gas estimates for swap transactions on different chains
    const estimatedGasLimits: Record<string, bigint> = {
      avalanche: 300000n, // ~300k gas for Avalanche swaps
      sonic: 250000n,     // ~250k gas for Sonic swaps
    };

    const estimatedGas = estimatedGasLimits[chainName] || 300000n;
    const totalCost = gasPrice * estimatedGas;

    // Store the gas cost information
    gasCosts[chainName] = {
      gasPrice,
      estimatedGas,
      totalCost,
      timestamp: Date.now()
    };

    log(`${chainName} gas cost: ${gasPrice} wei/gas × ${estimatedGas} gas = ${totalCost} wei (${Number(totalCost) / 1e18} Native Tokens)`);

  } catch (error) {
    log(`Failed to estimate ${chainName} swap gas cost: ${error}`, 'error');
  }
}

// Calculate total gas cost for arbitrage (both chains)
export function calculateTotalArbitrageGasCost(): bigint {
  const avalancheCost = gasCosts['avalanche']?.totalCost || 0n;
  const sonicCost = gasCosts['sonic']?.totalCost || 0n;

  const totalCost = avalancheCost + sonicCost;

  log(`Total arbitrage gas cost: ${avalancheCost} + ${sonicCost} = ${totalCost} wei (${Number(totalCost) / 1e18} Native Tokens)`);

  return totalCost;
}

// Get USD price from Chainlink price feed
export async function getUSDPrice(chain: string, asset: string): Promise<number> {
  try {
    const cacheKey = `${chain}-${asset}`;
    const now = Date.now();

    // Check cache first
    if (priceCache[cacheKey] && (now - priceCache[cacheKey].timestamp) < CACHE_DURATION) {
      return priceCache[cacheKey].price;
    }

    const client = clients[chain];
    const feedAddress = PRICE_FEEDS[chain]?.[asset];

    if (!feedAddress) {
      throw new Error(`No price feed found for ${asset} on ${chain}`);
    }

    const priceFeed = getContract({
      address: feedAddress as `0x${string}`,
      abi: CHAINLINK_PRICE_FEED_ABI,
      client,
    });

    // Get latest price data
    const [roundData, decimals] = await Promise.all([
      priceFeed.read.latestRoundData(),
      priceFeed.read.decimals(),
    ]);

    // roundData is a tuple: [roundId, answer, startedAt, updatedAt, answeredInRound]
    const price = Number(roundData[1]) / Math.pow(10, decimals);

    // Cache the result
    priceCache[cacheKey] = {
      price,
      timestamp: now
    };

    log(`Fetched ${asset} price on ${chain}: $${price.toFixed(2)}`);
    return price;

  } catch (error) {
    log(`Failed to fetch ${asset} price on ${chain}: ${error}`, 'error');

    // Fallback to hardcoded prices if Chainlink fails
    const fallbackPrices: Record<string, Record<string, number>> = {
      avalanche: {
        AVAX: 25.0,
      },
      sonic: {
        S: .0,
      }
    };

    const fallbackPrice = fallbackPrices[chain]?.[asset];
    if (fallbackPrice) {
      log(`Using fallback price for ${asset} on ${chain}: $${fallbackPrice}`, 'warn');
      return fallbackPrice;
    }

    throw new Error(`No price available for ${asset} on ${chain}`);
  }
}

// Get gas cost in USD with real-time price feeds
export async function getGasCostInUSD(chain: string): Promise<number> {
  try {
    // Use stored gas cost data if available
    const gasCost = gasCosts[chain];
    if (!gasCost) {
      log(`No gas cost data available for ${chain}, using fallback calculation`, 'warn');
      return 0;
    }

    const gasCostEth = Number(gasCost.totalCost) / 1e18;

    // Get native token price in USD
    const nativeToken = chain === 'avalanche' ? 'AVAX' : 'S';
    const nativeTokenPrice = await getUSDPrice(chain, nativeToken);

    const gasCostUSD = gasCostEth * nativeTokenPrice;
    return gasCostUSD;

  } catch (error) {
    log(`Failed to calculate gas cost in USD for ${chain}: ${error}`, 'error');
    return 0;
  }
}

// Price monitoring functions for CL pools
export async function getPharaohPoolPrice(
  client: PublicClient,
  chainName: string,
  poolAddress: string
): Promise<void> {
  try {
    // Pharaoh.exchange CL pool price fetching logic
    // This would typically involve reading the pool's reserves and calculating the price
    log(`Fetching Pharaoh pool price for ${chainName} at ${poolAddress}`);

    // Example implementation (you'll need to adapt this to Pharaoh's specific contract interface):
    // const poolContract = getContract({ address: poolAddress, abi: pharaohPoolABI, client });
    // const reserves = await poolContract.read.getReserves();
    // const usdcReserve = reserves[0];
    // const usdtReserve = reserves[1];
    // const price = usdtReserve / usdcReserve; // USDT per USDC

    // For now, using placeholder logic
    const mockPrice = 1.0 + (Math.random() - 0.5) * 0.002; // Simulate small price variations around 1.0

    // Store the price
    lastPrices[chainName] = {
      usdc: 1.0,
      usdt: mockPrice,
      timestamp: Date.now()
    };

    log(`${chainName} Pharaoh pool price: USDC=1.0, USDT=${mockPrice.toFixed(6)}`);

  } catch (error) {
    log(`Failed to get ${chainName} Pharaoh pool price: ${error}`, 'error');
  }
}

export async function getShadowPoolPrice(
  client: PublicClient,
  chainName: string,
  poolAddress: string
): Promise<void> {
  try {
    // Shadow CL pool price fetching logic
    // This would typically involve reading the pool's reserves and calculating the price
    log(`Fetching Shadow pool price for ${chainName} at ${poolAddress}`);

    // Example implementation (you'll need to adapt this to Shadow's specific contract interface):
    // const poolContract = getContract({ address: poolAddress, abi: shadowPoolABI, client });
    // const reserves = await poolContract.read.getReserves();
    // const usdcReserve = reserves[0];
    // const usdtReserve = reserves[1];
    // const price = usdtReserve / usdcReserve; // USDT per USDC

    // For now, using placeholder logic
    const mockPrice = 1.0 + (Math.random() - 0.5) * 0.002; // Simulate small price variations around 1.0

    // Store the price
    lastPrices[chainName] = {
      usdc: 1.0,
      usdt: mockPrice,
      timestamp: Date.now()
    };

    log(`${chainName} Shadow pool price: USDC=1.0, USDT=${mockPrice.toFixed(6)}`);

  } catch (error) {
    log(`Failed to get ${chainName} Shadow pool price: ${error}`, 'error');
  }
}

// Get all data for a specific chain
export async function getAllChainData(chainName: string): Promise<void> {
  const client = clients[chainName];
  if (!client) {
    log(`No client found for chain: ${chainName}`, 'error');
    return;
  }

  try {
    // Get basic chain data
    await getBlockNumber(client, chainName);
    await getGasPrice(client, chainName);

    // Get gas cost estimation
    await estimateSwapGasCost(client, chainName);

    log(`Completed data collection for ${chainName}`);
  } catch (error) {
    log(`Failed to get all data for ${chainName}: ${error}`, 'error');
  }
}

// Get all pool prices
export async function getAllPoolPrices(): Promise<void> {
  try {
    // Pool addresses
    const PHARAOH_POOL_AVALANCHE = '0x184b487c7e811f1d9734d49e78293e00b3768079';
    const SHADOW_POOL_SONIC = '0x9053fe060f412ad5677f934f89e07524343ee8e7';

    // Get pool prices
    await getPharaohPoolPrice(clients.avalanche, 'avalanche', PHARAOH_POOL_AVALANCHE);
    await getShadowPoolPrice(clients.sonic, 'sonic', SHADOW_POOL_SONIC);

    log('Completed pool price collection');
  } catch (error) {
    log(`Failed to get all pool prices: ${error}`, 'error');
  }
}

// Bridge tokens using CCIP
export async function bridgeTokens(
  sourceChain: string,
  targetChain: string,
  token: 'USDC' | 'USDT',
  amount: bigint
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = clients[sourceChain];
    const sourceConfig = CCIP_CONFIG[sourceChain];
    const targetConfig = CCIP_CONFIG[targetChain];
    const tokenAddress = TOKEN_ADDRESSES[sourceChain][token];

    if (!sourceConfig || !targetConfig || !tokenAddress) {
      throw new Error(`CCIP not configured for ${sourceChain} → ${targetChain} for ${token}`);
    }

    const router = getContract({
      address: sourceConfig.router as `0x${string}`,
      abi: CCIP_MESSAGE_ABI,
      client,
    });

    // Prepare CCIP message data
    const receiver = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'; // Our receiver address
    const data = '0x'; // No additional data for token transfers
    const feeToken = sourceConfig.linkToken as `0x${string}`;
    const extraArgs = '0x'; // No extra args

    // Get fee estimate
    const fee = await router.read.getFee([
      targetConfig.chainSelector,
      receiver as `0x${string}`,
      data,
      tokenAddress as `0x${string}`,
      amount,
      feeToken,
      extraArgs
    ]);

    log(`CCIP bridge fee for ${sourceChain} → ${targetChain}: ${fee} LINK`);

    // For now, we'll simulate the bridge transfer
    // In a real implementation, you would:
    // 1. Approve the router to spend your tokens
    // 2. Call ccipSend with the required parameters
    // 3. Wait for the message to be processed on the target chain

    log(`Simulating CCIP bridge: ${amount} ${token} from ${sourceChain} to ${targetChain}`);

    // Simulate successful bridge transfer
    const messageId = `0x${Math.random().toString(16).substring(2, 66)}`;

    return {
      success: true,
      messageId
    };

  } catch (error) {
    log(`CCIP bridge failed: ${error}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Check if CCIP is supported for the token pair
export function isCCIPSupported(sourceChain: string, targetChain: string, token: 'USDC' | 'USDT'): boolean {
  return !!(CCIP_CONFIG[sourceChain] && CCIP_CONFIG[targetChain] && TOKEN_ADDRESSES[sourceChain]?.[token]);
}

// Handle CCIP message receipt on target chain
export async function handleCCIPMessage(
  targetChain: string,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = clients[targetChain];
    const targetConfig = CCIP_CONFIG[targetChain];

    if (!targetConfig) {
      throw new Error(`CCIP not configured for ${targetChain}`);
    }

    // In a real implementation, you would:
    // 1. Listen for the CCIP message on the target chain
    // 2. Verify the message was sent from the source chain
    // 3. Mint the corresponding tokens on the target chain
    // 4. Update your balance tracking

    log(`📨 Processing CCIP message ${messageId} on ${targetChain}...`);

    // Simulate message processing
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing time

    log(`✅ CCIP message ${messageId} processed successfully on ${targetChain}`);

    return { success: true };

  } catch (error) {
    log(`Failed to process CCIP message: ${error}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Monitor CCIP messages on target chains
export async function monitorCCIPMessages(): Promise<void> {
  log('🔍 Starting CCIP message monitoring...');

  // In a real implementation, you would:
  // 1. Set up event listeners for CCIP messages
  // 2. Process incoming messages
  // 3. Update balances accordingly

  while (true) {
    try {
      // Check for pending CCIP messages
      // This is where you'd implement the actual monitoring logic

      await sleep(5000); // Check every 5 seconds

    } catch (error) {
      log(`Error monitoring CCIP messages: ${error}`, 'error');
      await sleep(10000); // Wait longer on error
    }
  }
}