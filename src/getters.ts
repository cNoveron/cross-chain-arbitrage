import { createPublicClient, http, webSocket, PublicClient, getContract, parseAbi } from 'viem';
import { avalanche, mainnet } from 'viem/chains';
import { clients, CONFIG } from './clients';
import { log, withRetry } from './utils';

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

// Minimal ABI for pool contracts (getReserves function)
const POOL_ABI = parseAbi([
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
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

    // Implementation using minimal ABI
    const poolContract = getContract({ address: poolAddress as `0x${string}`, abi: POOL_ABI, client });
    const reserves = await poolContract.read.getReserves();
    const usdcReserve = Number(reserves[0]);
    const usdtReserve = Number(reserves[1]);
    const price = usdtReserve / usdcReserve; // USDT per USDC

    // Store the price
    lastPrices[chainName] = {
      usdc: 1.0,
      usdt: price,
      timestamp: Date.now()
    };

    log(`${chainName} Pharaoh pool price: USDC=1.0, USDT=${price.toFixed(6)}`);

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

    // Implementation using minimal ABI
    const poolContract = getContract({ address: poolAddress as `0x${string}`, abi: POOL_ABI, client });
    const reserves = await poolContract.read.getReserves();
    const usdcReserve = Number(reserves[0]);
    const usdtReserve = Number(reserves[1]);
    const price = usdtReserve / usdcReserve; // USDT per USDC

    // Store the price
    lastPrices[chainName] = {
      usdc: 1.0,
      usdt: price,
      timestamp: Date.now()
    };

    log(`${chainName} Shadow pool price: USDC=1.0, USDT=${price.toFixed(6)}`);

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