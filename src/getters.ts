import { PublicClient } from 'viem';
import { clients, CONFIG } from './clients';
import { log, withRetry } from './utils';

// Price storage for each chain
export const lastPrices: Record<string, { usdc: number; usdt: number; timestamp: number }> = {};

// Gas cost storage for each chain
export const gasCosts: Record<string, {
  gasPrice: bigint;
  estimatedGas: bigint;
  totalCost: bigint;
  timestamp: number
}> = {};

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

    log(`${chainName} gas cost: ${gasPrice} wei/gas × ${estimatedGas} gas = ${totalCost} wei (${Number(totalCost) / 1e18} ETH)`);

  } catch (error) {
    log(`Failed to estimate ${chainName} swap gas cost: ${error}`, 'error');
  }
}

// Calculate total gas cost for arbitrage (both chains)
export function calculateTotalArbitrageGasCost(): bigint {
  const avalancheCost = gasCosts['avalanche']?.totalCost || 0n;
  const sonicCost = gasCosts['sonic']?.totalCost || 0n;

  const totalCost = avalancheCost + sonicCost;

  log(`Total arbitrage gas cost: ${avalancheCost} + ${sonicCost} = ${totalCost} wei (${Number(totalCost) / 1e18} ETH)`);

  return totalCost;
}

// Get gas cost in USD (approximate)
export function getGasCostInUSD(chainName: string): number {
  const gasCost = gasCosts[chainName];
  if (!gasCost) return 0;

  // Approximate ETH prices (you might want to fetch these dynamically)
  const ethPrices: Record<string, number> = {
    avalanche: 25.0, // AVAX price in USD
    sonic: 1.0,      // Assuming Sonic uses ETH or similar pricing
  };

  const ethPrice = ethPrices[chainName] || 1.0;
  const costInEth = Number(gasCost.totalCost) / 1e18;
  const costInUSD = costInEth * ethPrice;

  return costInUSD;
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