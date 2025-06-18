import { PublicClient } from 'viem';
import { clients, wsClients, CONFIG, CHAIN_NAMES, type ChainName } from './clients';
import { log, sleep } from './utils';
import {
  lastPrices,
  gasCosts,
  getAllChainData,
  getAllPoolPrices,
  calculateTotalArbitrageGasCost,
  getGasCostInUSD
} from './getters';

// Paper trading balance tracking
export interface TokenBalance {
  usdc: number;
  usdt: number;
  timestamp: number;
}

export interface PaperTrade {
  id: string;
  sourceChain: string;
  targetChain: string;
  sourcePrice: number;
  targetPrice: number;
  amount: number;
  profit: number;
  gasCost: number;
  netProfit: number;
  timestamp: number;
  status: 'executed' | 'failed' | 'pending';
}

// Paper trading state
export const paperBalances: Record<string, TokenBalance> = {
  avalanche: { usdc: 10000, usdt: 0, timestamp: Date.now() }, // Start with 10k USDC
  sonic: { usdc: 10000, usdt: 0, timestamp: Date.now() },     // Start with 10k USDC
};

export const paperTrades: PaperTrade[] = [];

// Paper trading functions
export function getPaperBalance(chainName: string): TokenBalance {
  return paperBalances[chainName] || { usdc: 0, usdt: 0, timestamp: Date.now() };
}

export function updatePaperBalance(chainName: string, usdc: number, usdt: number): void {
  paperBalances[chainName] = {
    usdc,
    usdt,
    timestamp: Date.now()
  };

  log(`Paper balance updated for ${chainName}: USDC=${usdc.toFixed(2)}, USDT=${usdt.toFixed(2)}`);
}

export function addPaperTrade(trade: Omit<PaperTrade, 'id' | 'timestamp'>): void {
  const paperTrade: PaperTrade = {
    ...trade,
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };

  paperTrades.push(paperTrade);
  log(`Paper trade recorded: ${paperTrade.id} - ${trade.sourceChain} → ${trade.targetChain} - Profit: $${trade.netProfit.toFixed(4)}`);
}

export function calculateTotalPaperValue(): number {
  let totalValue = 0;

  for (const [chainName, balance] of Object.entries(paperBalances)) {
    const usdcValue = balance.usdc * 1.0; // USDC = $1
    const usdtValue = balance.usdt * 1.0; // USDT = $1
    totalValue += usdcValue + usdtValue;
  }

  return totalValue;
}

export function getPaperTradingStats(): {
  totalTrades: number;
  profitableTrades: number;
  totalProfit: number;
  totalValue: number;
  winRate: number;
} {
  const totalTrades = paperTrades.length;
  const profitableTrades = paperTrades.filter(trade => trade.netProfit > 0).length;
  const totalProfit = paperTrades.reduce((sum, trade) => sum + trade.netProfit, 0);
  const totalValue = calculateTotalPaperValue();
  const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

  return {
    totalTrades,
    profitableTrades,
    totalProfit,
    totalValue,
    winRate
  };
}

// Arbitrage-specific functions
export async function checkPriceDifference(
  client1: PublicClient,
  client2: PublicClient,
  chain1: string,
  chain2: string,
  tokenAddress: string
): Promise<void> {
  try {
    // This is a placeholder for actual price checking logic
    // You would implement token price fetching here
    log(`Checking price difference for ${tokenAddress} between ${chain1} and ${chain2}`);

    // Example: Get token prices from both chains
    // const price1 = await getTokenPrice(client1, tokenAddress);
    // const price2 = await getTokenPrice(client2, tokenAddress);
    // const difference = Math.abs(price1 - price2);
    // const percentage = (difference / Math.min(price1, price2)) * 100;

    // if (percentage > ARBITRAGE_THRESHOLD) {
    //   log(`Arbitrage opportunity found! ${percentage.toFixed(2)}% difference`, 'info');
    //   await executeArbitrage(chain1, chain2, tokenAddress, price1, price2);
    // }

  } catch (error) {
    log(`Failed to check price difference: ${error}`, 'error');
  }
}

export async function executeArbitrage(
  sourceChain: string,
  targetChain: string,
  tokenAddress: string,
  sourcePrice: number,
  targetPrice: number
): Promise<void> {
  try {
    log(`Executing arbitrage: Buy on ${sourceChain} at ${sourcePrice}, sell on ${targetChain} at ${targetPrice}`);

    // Paper trading logic
    const tradeAmount = 1000; // $1000 USDC per trade
    const sourceBalance = getPaperBalance(sourceChain);
    const targetBalance = getPaperBalance(targetChain);

    // Check if we have enough USDC to execute the trade
    if (sourceBalance.usdc < tradeAmount) {
      log(`Insufficient USDC on ${sourceChain} for paper trade. Available: ${sourceBalance.usdc}, Required: ${tradeAmount}`, 'warn');
      return;
    }

    // Calculate trade details
    const usdtReceived = tradeAmount * sourcePrice; // USDT received from buying
    const usdcReceived = usdtReceived / targetPrice; // USDC received from selling

    // Calculate profits and costs
    const grossProfit = usdcReceived - tradeAmount;
    const gasCostUSD = getGasCostInUSD(sourceChain) + getGasCostInUSD(targetChain);
    const netProfit = grossProfit - gasCostUSD;

    // Update paper balances
    const newSourceBalance = {
      usdc: sourceBalance.usdc - tradeAmount,
      usdt: sourceBalance.usdt + usdtReceived,
      timestamp: Date.now()
    };

    const newTargetBalance = {
      usdc: targetBalance.usdc + usdcReceived,
      usdt: targetBalance.usdt,
      timestamp: Date.now()
    };

    // Record the paper trade
    addPaperTrade({
      sourceChain,
      targetChain,
      sourcePrice,
      targetPrice,
      amount: tradeAmount,
      profit: grossProfit,
      gasCost: gasCostUSD,
      netProfit,
      status: netProfit > 0 ? 'executed' : 'failed'
    });

    // Update balances if trade is profitable
    if (netProfit > 0) {
      updatePaperBalance(sourceChain, newSourceBalance.usdc, newSourceBalance.usdt);
      updatePaperBalance(targetChain, newTargetBalance.usdc, newTargetBalance.usdt);

      // Log trade summary
      const stats = getPaperTradingStats();
      log(`📊 Paper Trade Summary:`);
      log(`  Trade Amount: $${tradeAmount}`);
      log(`  Gross Profit: $${grossProfit.toFixed(4)}`);
      log(`  Gas Cost: $${gasCostUSD.toFixed(4)}`);
      log(`  Net Profit: $${netProfit.toFixed(4)}`);
      log(`  Total Portfolio Value: $${stats.totalValue.toFixed(2)}`);
      log(`  Total Profit: $${stats.totalProfit.toFixed(4)}`);
      log(`  Win Rate: ${stats.winRate.toFixed(1)}%`);

    } else {
      log(`Paper trade not executed - unprofitable after gas costs (Net: $${netProfit.toFixed(4)})`, 'warn');
    }

    // This is where you would implement the actual arbitrage execution
    // 1. Calculate optimal amounts
    // 2. Execute buy transaction on source chain
    // 3. Execute sell transaction on target chain
    // 4. Handle gas costs and slippage

  } catch (error) {
    log(`Failed to execute arbitrage: ${error}`, 'error');
  }
}

// Check for arbitrage opportunities between the pools
async function checkArbitrageOpportunities(): Promise<void> {
  try {
    const avalanchePrice = lastPrices['avalanche'];
    const sonicPrice = lastPrices['sonic'];

    if (!avalanchePrice || !sonicPrice) {
      return; // Wait for both prices to be available
    }

    const priceDiff = Math.abs(avalanchePrice.usdt - sonicPrice.usdt);
    const percentageDiff = (priceDiff / Math.min(avalanchePrice.usdt, sonicPrice.usdt)) * 100;

    log(`Price comparison: Avalanche USDT=${avalanchePrice.usdt.toFixed(6)}, Sonic USDT=${sonicPrice.usdt.toFixed(6)}, Diff=${percentageDiff.toFixed(4)}%`);

    // Calculate gas costs in USD
    const avalancheGasUSD = getGasCostInUSD('avalanche');
    const sonicGasUSD = getGasCostInUSD('sonic');
    const totalGasUSD = avalancheGasUSD + sonicGasUSD;

    log(`Gas costs: Avalanche $${avalancheGasUSD.toFixed(4)}, Sonic $${sonicGasUSD.toFixed(4)}, Total $${totalGasUSD.toFixed(4)}`);

    // Arbitrage threshold (adjust as needed)
    const ARBITRAGE_THRESHOLD = 0.1; // 0.1%

    if (percentageDiff > ARBITRAGE_THRESHOLD) {
      log(`🚨 ARBITRAGE OPPORTUNITY FOUND! ${percentageDiff.toFixed(4)}% difference`, 'info');

      // Determine which chain has the lower price (buy there) and which has higher (sell there)
      const buyChain = avalanchePrice.usdt < sonicPrice.usdt ? 'avalanche' : 'sonic';
      const sellChain = avalanchePrice.usdt < sonicPrice.usdt ? 'sonic' : 'avalanche';
      const buyPrice = Math.min(avalanchePrice.usdt, sonicPrice.usdt);
      const sellPrice = Math.max(avalanchePrice.usdt, sonicPrice.usdt);

      // Calculate potential profit (simplified)
      const tradeAmount = 1000; // $1000 USDC
      const profitUSD = (sellPrice - buyPrice) * tradeAmount;
      const netProfitUSD = profitUSD - totalGasUSD;

      log(`Potential profit: $${profitUSD.toFixed(4)} - $${totalGasUSD.toFixed(4)} gas = $${netProfitUSD.toFixed(4)} net`);

      if (netProfitUSD > 0) {
        await executeArbitrage(buyChain, sellChain, 'USDC/USDT', buyPrice, sellPrice);
      } else {
        log(`Arbitrage not profitable after gas costs`, 'warn');
      }
    }

  } catch (error) {
    log(`Failed to check arbitrage opportunities: ${error}`, 'error');
  }
}

// Continuous price monitoring function
export async function monitorPrices(): Promise<void> {
  log('Starting price monitoring...');

  while (true) {
    try {
      // Get all pool prices
      await getAllPoolPrices();

      // Get all chain data (including gas costs)
      await getAllChainData('avalanche');
      await getAllChainData('sonic');

      // Calculate total arbitrage gas cost
      const totalGasCost = calculateTotalArbitrageGasCost();

      // Check for arbitrage opportunities
      await checkArbitrageOpportunities();

      log('Completed price monitoring cycle');
      await sleep(CONFIG.PRICE_POLLING_INTERVAL);

    } catch (error) {
      log(`Error in price monitoring loop: ${error}`, 'error');
      await sleep(CONFIG.RETRY_DELAY);
    }
  }
}

// Main monitoring loop
export async function monitorChains(): Promise<void> {
  log('Starting chain monitoring...');

  while (true) {
    try {
      // Monitor all chains
      for (const [chainName, client] of Object.entries(clients)) {
        await getAllChainData(chainName);

        // Example: monitor a specific address (replace with actual address)
        // await getBalance(client, chainName, '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6');
      }

      // Check for arbitrage opportunities between chains
      if (CHAIN_NAMES.length >= 2) {
        const chain1 = CHAIN_NAMES[0];
        const chain2 = CHAIN_NAMES[1];

        // Example: Check arbitrage for a specific token
        // await checkPriceDifference(
        //   clients[chain1],
        //   clients[chain2],
        //   chain1,
        //   chain2,
        //   '0x...' // token address
        // );
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
export async function setupWebSocketMonitoring(): Promise<void> {
  log('Setting up WebSocket monitoring...');

  for (const [chainName, wsClient] of Object.entries(wsClients)) {
    try {
      // Watch for new blocks
      const unwatch = await wsClient.watchBlocks({
        onBlock: (block) => {
          //log(`${chainName} new block: ${block.number}`);
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

// Export clients for use in other modules
export { clients, wsClients, CONFIG, CHAIN_NAMES };