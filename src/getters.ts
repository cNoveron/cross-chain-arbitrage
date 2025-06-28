import { createPublicClient, http, webSocket, PublicClient, getContract, parseAbi } from 'viem';
import { avalanche, mainnet } from 'viem/chains';
import { clients, CONFIG } from './clients';
import { log, withRetry } from './utils';

// Price storage for each chain
export const lastPrices: Record<string, {
  tokens0PerToken1: number;
  tokens1PerToken0: number;
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

// Minimal ABI for Uniswap V3 pool contracts
const POOL_ABI = parseAbi([
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
]);

// Minimal ABI for ERC20 tokens (symbol and decimals functions)
const ERC20_ABI = parseAbi([
  'function symbol() external view returns (string)',
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

// Pool metadata structure
export interface PoolMetadata {
  name: string;
  chain: string;
  address: string;
  token0: {
    symbol: string;
    decimals: number;
    address: string;
  };
  token1: {
    symbol: string;
    decimals: number;
    address: string;
  };
}

// Pool metadata cache
const poolMetadataCache: Record<string, PoolMetadata> = {};

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
  poolAddress: string,
  targetToken: string,
  poolMetadata: Record<string, PoolMetadata>
): Promise<void> {
  try {
    // Pharaoh.exchange CL pool price fetching logic
    log(`Fetching Pharaoh pool price for ${chainName} at ${poolAddress} (targeting ${targetToken})`);

    // Get the pool metadata for this chain
    const metadata = poolMetadata[chainName];
    if (!metadata) {
      throw new Error(`No pool metadata found for ${chainName}`);
    }

    // Determine which index the target token is in this pool
    const targetTokenIndex = metadata.token0.symbol.toLowerCase() === targetToken.toLowerCase() ? 0 : 1;
    log(`📍 ${targetToken} is token${targetTokenIndex} in ${chainName} pool`);

    // Implementation using Uniswap V3 ABI
    const poolContract = getContract({ address: poolAddress as `0x${string}`, abi: POOL_ABI, client });

    // Get slot0 data
    const slot0Data = await poolContract.read.slot0();

    // Calculate price from sqrtPriceX96 (price of token1 in terms of token0)
    const sqrtPriceX96 = slot0Data[0];
    const price = calculatePriceFromSqrtPriceX96(sqrtPriceX96, metadata.token0.decimals, metadata.token1.decimals);

    // Store the prices
    const { tokens0PerToken1, tokens1PerToken0 } = lastPrices[chainName] = {
      tokens0PerToken1: 1 / Number(price), // tokens0 per token1 (USDCs per USDT, the ticker being: USDT/USDC)
      tokens1PerToken0: Number(price),     // tokens1 per token0 (USDTs per USDC, the ticker being: USDC/USDT)
      timestamp: Date.now()
    };

    const targetTokenPrice = targetTokenIndex === 1 ? tokens0PerToken1 : tokens1PerToken0;

    const quoteTokenSymbol = targetTokenIndex === 1 ? metadata.token0.symbol : metadata.token1.symbol;
    const targetTokenSymbol = targetTokenIndex === 1 ? metadata.token1.symbol : metadata.token0.symbol;
    log(`${chainName} Pharaoh pool price: ${targetTokenPrice.toFixed(6)} ${quoteTokenSymbol}s per ${targetTokenSymbol}`);

  } catch (error) {
    log(`Failed to get ${chainName} Pharaoh pool price: ${error}`, 'error');
  }
}

export async function getShadowPoolPrice(
  client: PublicClient,
  chainName: string,
  poolAddress: string,
  targetToken: string,
  poolMetadata: Record<string, PoolMetadata>
): Promise<void> {
  try {
    // Shadow CL pool price fetching logic
    log(`Fetching Shadow pool price for ${chainName} at ${poolAddress} (targeting ${targetToken})`);

    // Get the pool metadata for this chain
    const metadata = poolMetadata[chainName];
    if (!metadata) {
      throw new Error(`No pool metadata found for ${chainName}`);
    }

    // Determine which index the target token is in this pool
    const targetTokenIndex = metadata.token0.symbol.toLowerCase() === targetToken.toLowerCase() ? 0 : 1;
    log(`📍 ${targetToken} is token${targetTokenIndex} in ${chainName} pool`);

    // Implementation using Uniswap V3 ABI
    const poolContract = getContract({ address: poolAddress as `0x${string}`, abi: POOL_ABI, client });

    // Get slot0 data
    const slot0Data = await poolContract.read.slot0();

    // Calculate price from sqrtPriceX96 (price of token1 in terms of token0)
    const sqrtPriceX96 = slot0Data[0];
    const price = calculatePriceFromSqrtPriceX96(sqrtPriceX96, metadata.token0.decimals, metadata.token1.decimals);

    // Store the prices
    const { tokens0PerToken1, tokens1PerToken0 } = lastPrices[chainName] = {
      tokens0PerToken1: 1 / Number(price), // tokens0 per token1 (USDCs per USDT, the ticker being: USDT/USDC)
      tokens1PerToken0: Number(price),     // tokens1 per token0 (USDTs per USDC, the ticker being: USDC/USDT)
      timestamp: Date.now()
    };

    const targetTokenPrice = targetTokenIndex === 1 ? tokens0PerToken1 : tokens1PerToken0;

    const quoteTokenSymbol = targetTokenIndex === 1 ? metadata.token0.symbol : metadata.token1.symbol;
    const targetTokenSymbol = targetTokenIndex === 1 ? metadata.token1.symbol : metadata.token0.symbol;
    log(`${chainName} Shadow pool price: ${targetTokenPrice.toFixed(6)} ${quoteTokenSymbol}s per ${targetTokenSymbol}`);

  } catch (error) {
    log(`Failed to get ${chainName} Shadow pool price: ${error}`, 'error');
  }
}

// Helper function to calculate price from sqrtPriceX96 (Uniswap V3)
function calculatePriceFromSqrtPriceX96(sqrtPriceX96: bigint, token0Decimals: number = 6, token1Decimals: number = 6): number {
  // Convert sqrtPriceX96 to price
  // price = (sqrtPriceX96 / 2^96)^2 * 10^(token1Decimals - token0Decimals)
  const Q96 = 2n ** 96n;
  const price = Number(sqrtPriceX96 * sqrtPriceX96 * (10n ** BigInt(token1Decimals))) / Number(Q96 * Q96 * (10n ** BigInt(token0Decimals)));
  return price;
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

    // Get pool metadata first
    const poolMetadata = await getAllPoolMetadata();

    // Get pool prices for USDC/USDT pairs
    await getPharaohPoolPrice(clients.avalanche, 'avalanche', PHARAOH_POOL_AVALANCHE, 'USDT', poolMetadata);
    await getShadowPoolPrice(clients.sonic, 'sonic', SHADOW_POOL_SONIC, 'USDT', poolMetadata);

    log('Completed pool price collection');
  } catch (error) {
    log(`Failed to get all pool prices: ${error}`, 'error');
  }
}

// Get pool metadata (token addresses, symbols, decimals)
export async function getPoolMetadata(
  client: PublicClient,
  poolName: string,
  chainName: string,
  poolAddress: string
): Promise<PoolMetadata> {
  // Check cache first
  const cacheKey = `${chainName}-${poolAddress}`;
  if (poolMetadataCache[cacheKey]) {
    return poolMetadataCache[cacheKey];
  }

  try {
    const poolContract = getContract({ address: poolAddress as `0x${string}`, abi: POOL_ABI, client });

    // Get token addresses
    const [token0Address, token1Address] = await Promise.all([
      poolContract.read.token0(),
      poolContract.read.token1(),
    ]);

    // Get token contracts
    const token0Contract = getContract({ address: token0Address, abi: ERC20_ABI, client });
    const token1Contract = getContract({ address: token1Address, abi: ERC20_ABI, client });

    // Get token symbols and decimals
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.read.symbol(),
      token0Contract.read.decimals(),
      token1Contract.read.symbol(),
      token1Contract.read.decimals(),
    ]);

    const metadata: PoolMetadata = {
      name: poolName,
      chain: chainName,
      address: poolAddress,
      token0: {
        symbol: token0Symbol,
        decimals: token0Decimals,
        address: token0Address,
      },
      token1: {
        symbol: token1Symbol,
        decimals: token1Decimals,
        address: token1Address,
      },
    };

    // Cache the result
    poolMetadataCache[cacheKey] = metadata;

    log(`📋 Pool metadata for ${poolName}: ${token0Symbol} (${token0Address}) / ${token1Symbol} (${token1Address})`);

    return metadata;

  } catch (error) {
    log(`Failed to get pool metadata for ${poolName}: ${error}`, 'error');
    throw error;
  }
}

// Get all pool metadata
export async function getAllPoolMetadata(): Promise<Record<string, PoolMetadata>> {
  try {
    // Pool addresses
    const PHARAOH_POOL_AVALANCHE = '0x184b487c7e811f1d9734d49e78293e00b3768079';
    const SHADOW_POOL_SONIC = '0x9053fe060f412ad5677f934f89e07524343ee8e7';

    // Get metadata for all pools
    const [pharaohMetadata, shadowMetadata] = await Promise.all([
      getPoolMetadata(clients.avalanche, 'Pharaoh', 'avalanche', PHARAOH_POOL_AVALANCHE),
      getPoolMetadata(clients.sonic, 'Shadow', 'sonic', SHADOW_POOL_SONIC),
    ]);

    // Return as object keyed by chain names
    return {
      avalanche: pharaohMetadata,
      sonic: shadowMetadata,
    };
  } catch (error) {
    log(`Failed to get all pool metadata: ${error}`, 'error');
    throw error;
  }
}