import { PublicClient } from 'viem';
import { clients, wsClients, CONFIG, CHAIN_NAMES, type ChainName } from './clients';
import { log, sleep } from './utils';
import {
  lastPrices,
  gasCosts,
  getAllChainData,
  calculateTotalArbitrageGasCost,
  getGasCostInUSD,
  getPoolPrice,
  getAllPoolMetadata,
  type PoolMetadata
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
  avalanche: { usdc: 50000, usdt: 50000, timestamp: Date.now() }, // Start with 5k USDC and 5k USDT
  sonic: { usdc: 50000, usdt: 50000, timestamp: Date.now() },     // Start with 5k USDC and 5k USDT
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

// Execute USDC-targeted arbitrage: Start with USDC, end with more USDC
export async function executeUSDCTargetedArbitrage(
  buyChain: string,
  sellChain: string,
  buyPriceUSDCperUSDT: number,
  sellPriceUSDCperUSDT: number,
  tradeAmountUSDC: number
): Promise<void> {
  try {
    log(`Executing USDC-targeted arbitrage: Buy USDT on ${buyChain} at ${buyPriceUSDCperUSDT} USDC/USDT, sell on ${sellChain} at ${sellPriceUSDCperUSDT} USDC/USDT (Amount: ${tradeAmountUSDC} USDC)`);

    // Paper trading logic for USDC-targeted arbitrage
    const sourceBalance = getPaperBalance(buyChain);
    const targetBalance = getPaperBalance(sellChain);

    // Log balances before trade
    log(`📊 Pre-trade balances:`);
    log(`  ${buyChain}: ${sourceBalance.usdc.toFixed(2)} USDC, ${sourceBalance.usdt.toFixed(2)} USDT`);
    log(`  ${sellChain}: ${targetBalance.usdc.toFixed(2)} USDC, ${targetBalance.usdt.toFixed(2)} USDT`);

    // Check if we have enough USDC to execute the trade
    if (sourceBalance.usdc < tradeAmountUSDC) {
      log(`Insufficient USDC on ${buyChain} for USDC-targeted paper trade. Available: ${sourceBalance.usdc}, Required: ${tradeAmountUSDC}`, 'warn');
      return;
    }

    // USDC-targeted arbitrage calculation
    // 1. Buy USDT with USDC on buyChain (cheaper price)
    // 2. Transfer USDT to sellChain (cross-chain bridge)
    // 3. Sell USDT for USDC on sellChain (more expensive price)
    // 4. End with USDC only on sellChain

    const usdtReceived = tradeAmountUSDC / buyPriceUSDCperUSDT; // USDT received from buying
    const usdcReceived = usdtReceived * sellPriceUSDCperUSDT; // USDC received from selling

    // Calculate profits in USDC terms
    const grossProfitUSDC = usdcReceived - tradeAmountUSDC;
    const [sourceGasUSD, targetGasUSD] = await Promise.all([
      getGasCostInUSD(buyChain),
      getGasCostInUSD(sellChain)
    ]);
    const gasCostUSD = sourceGasUSD + targetGasUSD;
    const netProfitUSD = grossProfitUSDC - gasCostUSD;

    // Only execute and record the trade if it's profitable
    if (netProfitUSD > CONFIG.PROFIT_THRESHOLD) {
      // Update paper balances - simulate cross-chain transfer
      const newSourceBalance = {
        usdc: sourceBalance.usdc - tradeAmountUSDC, // Spend USDC
        usdt: sourceBalance.usdt, // No USDT left (transferred to other chain)
        timestamp: Date.now()
      };

      const newTargetBalance = {
        usdc: targetBalance.usdc + usdcReceived, // Receive USDC from selling USDT
        usdt: targetBalance.usdt, // No USDT left (sold for USDC)
        timestamp: Date.now()
      };

      // Record the paper trade
      addPaperTrade({
        sourceChain: buyChain,
        targetChain: sellChain,
        sourcePrice: buyPriceUSDCperUSDT,
        targetPrice: sellPriceUSDCperUSDT,
        amount: tradeAmountUSDC,
        profit: grossProfitUSDC,
        gasCost: gasCostUSD,
        netProfit: netProfitUSD,
        status: 'executed'
      });

      // Update balances
      updatePaperBalance(buyChain, newSourceBalance.usdc, newSourceBalance.usdt);
      updatePaperBalance(sellChain, newTargetBalance.usdc, newTargetBalance.usdt);

      // Log post-trade balances
      log(`📊 Post-trade balances:`);
      log(`  ${buyChain}: ${newSourceBalance.usdc.toFixed(2)} USDC, ${newSourceBalance.usdt.toFixed(2)} USDT`);
      log(`  ${sellChain}: ${newTargetBalance.usdc.toFixed(2)} USDC, ${newTargetBalance.usdt.toFixed(2)} USDT`);

      // Log trade summary
      const stats = getPaperTradingStats();
      log(`📊 USDC-Targeted Paper Trade Summary:`);
      log(`  Start: ${tradeAmountUSDC} USDC`);
      log(`  End: ${usdcReceived.toFixed(4)} USDC`);
      log(`  Gross Profit: ${grossProfitUSDC.toFixed(4)} USDC`);
      log(`  Gas Cost: $${gasCostUSD.toFixed(4)}`);
      log(`  Net Profit: $${netProfitUSD.toFixed(4)}`);
      log(`  Total Portfolio Value: $${stats.totalValue.toFixed(2)}`);
      log(`  Total Profit: $${stats.totalProfit.toFixed(4)}`);
      log(`  Win Rate: ${stats.winRate.toFixed(1)}%`);

    } else {
      log(`USDC-targeted paper trade not executed - insufficient profit (Net: $${netProfitUSD.toFixed(4)}, Threshold: $${CONFIG.PROFIT_THRESHOLD})`, 'warn');
    }

  } catch (error) {
    log(`Failed to execute USDC-targeted arbitrage: ${error}`, 'error');
  }
}

// Execute USDT-targeted arbitrage: Start with USDT, end with more USDT
export async function executeUSDTTargetedArbitrage(
  buyChain: string,
  sellChain: string,
  buyPriceUSDTperUSDC: number,
  sellPriceUSDTperUSDC: number,
  tradeAmountUSDT: number
): Promise<void> {
  try {
    log(`Executing USDT-targeted arbitrage: Sell USDT on ${buyChain} at ${buyPriceUSDTperUSDC} USDT/USDC, buy on ${sellChain} at ${sellPriceUSDTperUSDC} USDT/USDC (Amount: ${tradeAmountUSDT} USDT)`);

    // Paper trading logic for USDT-targeted arbitrage
    const sourceBalance = getPaperBalance(buyChain);
    const targetBalance = getPaperBalance(sellChain);

    // Log balances before trade
    log(`📊 Pre-trade balances:`);
    log(`  ${buyChain}: ${sourceBalance.usdc.toFixed(2)} USDC, ${sourceBalance.usdt.toFixed(2)} USDT`);
    log(`  ${sellChain}: ${targetBalance.usdc.toFixed(2)} USDC, ${targetBalance.usdt.toFixed(2)} USDT`);

    // Check if we have enough USDT to execute the trade
    if (sourceBalance.usdt < tradeAmountUSDT) {
      log(`Insufficient USDT on ${buyChain} for USDT-targeted paper trade. Available: ${sourceBalance.usdt}, Required: ${tradeAmountUSDT}`, 'warn');
      return;
    }

    // USDT-targeted arbitrage calculation
    // 1. Sell USDT for USDC on buyChain (cheaper price = more USDC per USDT)
    // 2. Transfer USDC to sellChain (cross-chain bridge)
    // 3. Buy USDT with USDC on sellChain (more expensive price = less USDC per USDT)
    // 4. End with USDT only on sellChain

    const usdcReceived = tradeAmountUSDT * buyPriceUSDTperUSDC; // USDC received from selling USDT
    const usdtReceived = usdcReceived / sellPriceUSDTperUSDC; // USDT received from buying

    // Calculate profits in USDT terms
    const grossProfitUSDT = usdtReceived - tradeAmountUSDT;
    const [sourceGasUSD, targetGasUSD] = await Promise.all([
      getGasCostInUSD(buyChain),
      getGasCostInUSD(sellChain)
    ]);
    const gasCostUSD = sourceGasUSD + targetGasUSD;
    const netProfitUSD = grossProfitUSDT - gasCostUSD;

    // Only execute and record the trade if it's profitable
    if (netProfitUSD > CONFIG.PROFIT_THRESHOLD) {
      // Update paper balances - simulate cross-chain transfer
      const newSourceBalance = {
        usdc: sourceBalance.usdc, // No USDC left (transferred to other chain)
        usdt: sourceBalance.usdt - tradeAmountUSDT, // Spend USDT
        timestamp: Date.now()
      };

      const newTargetBalance = {
        usdc: targetBalance.usdc, // No USDC left (spent buying USDT)
        usdt: targetBalance.usdt + usdtReceived, // Receive USDT from buying
        timestamp: Date.now()
      };

      // Record the paper trade
      addPaperTrade({
        sourceChain: buyChain,
        targetChain: sellChain,
        sourcePrice: buyPriceUSDTperUSDC,
        targetPrice: sellPriceUSDTperUSDC,
        amount: tradeAmountUSDT,
        profit: grossProfitUSDT,
        gasCost: gasCostUSD,
        netProfit: netProfitUSD,
        status: 'executed'
      });

      // Update balances
      updatePaperBalance(buyChain, newSourceBalance.usdc, newSourceBalance.usdt);
      updatePaperBalance(sellChain, newTargetBalance.usdc, newTargetBalance.usdt);

      // Log post-trade balances
      log(`📊 Post-trade balances:`);
      log(`  ${buyChain}: ${newSourceBalance.usdc.toFixed(2)} USDC, ${newSourceBalance.usdt.toFixed(2)} USDT`);
      log(`  ${sellChain}: ${newTargetBalance.usdc.toFixed(2)} USDC, ${newTargetBalance.usdt.toFixed(2)} USDT`);

      // Log trade summary
      const stats = getPaperTradingStats();
      log(`📊 USDT-Targeted Paper Trade Summary:`);
      log(`  Start: ${tradeAmountUSDT} USDT`);
      log(`  End: ${usdtReceived.toFixed(4)} USDT`);
      log(`  Gross Profit: ${grossProfitUSDT.toFixed(4)} USDT`);
      log(`  Gas Cost: $${gasCostUSD.toFixed(4)}`);
      log(`  Net Profit: $${netProfitUSD.toFixed(4)}`);
      log(`  Total Portfolio Value: $${stats.totalValue.toFixed(2)}`);
      log(`  Total Profit: $${stats.totalProfit.toFixed(4)}`);
      log(`  Win Rate: ${stats.winRate.toFixed(1)}%`);

    } else {
      log(`USDT-targeted paper trade not executed - insufficient profit (Net: $${netProfitUSD.toFixed(4)}, Threshold: $${CONFIG.PROFIT_THRESHOLD})`, 'warn');
    }

  } catch (error) {
    log(`Failed to execute USDT-targeted arbitrage: ${error}`, 'error');
  }
}

// Legacy function - keeping for backward compatibility but marking as deprecated
export async function executeArbitrage(
  sourceChain: string,
  targetChain: string,
  tokenAddress: string,
  sourcePrice: number,
  targetPrice: number
): Promise<void> {
  log(`⚠️  executeArbitrage is deprecated. Use executeUSDCTargetedArbitrage or executeUSDTTargetedArbitrage instead.`, 'warn');

  // For backward compatibility, assume USDC-targeted arbitrage
  await executeUSDCTargetedArbitrage(sourceChain, targetChain, sourcePrice, targetPrice, 1000);
}

// Check for arbitrage opportunities between the pools
async function checkArbitrageOpportunities(): Promise<void> {
  try {
    // Get pool metadata first
    const poolMetadata = await getAllPoolMetadata();

    // Determine which token we're targeting based on current balances
    const targetToken = determineTargetToken(poolMetadata);

    // Determine which index the target token is in each pool
    const avalancheTargetIndex = poolMetadata['avalanche'].token0.symbol.toLowerCase() === targetToken.toLowerCase() ? 0 : 1;
    const sonicTargetIndex = poolMetadata['sonic'].token0.symbol.toLowerCase() === targetToken.toLowerCase() ? 0 : 1;

    log(`📍 ${targetToken} is token${avalancheTargetIndex} in avalanche pool, token${sonicTargetIndex} in sonic pool`);

    // Get pool prices targeting the token we're running low on
    await getPoolPrice(clients.avalanche, 'avalanche', avalancheTargetIndex, poolMetadata);
    await getPoolPrice(clients.sonic, 'sonic', sonicTargetIndex, poolMetadata);

    const avalanchePrice = lastPrices['avalanche'];
    const sonicPrice = lastPrices['sonic'];

    if (!avalanchePrice || !sonicPrice) {
      return; // Wait for both prices to be available
    }

    // Log current balances before checking arbitrage
    logBalances();

    // Calculate gas costs in USD
    const [avalancheGasUSD, sonicGasUSD] = await Promise.all([
      getGasCostInUSD('avalanche'),
      getGasCostInUSD('sonic')
    ]);
    const totalGasUSD = avalancheGasUSD + sonicGasUSD;

    log(`Gas costs: Avalanche $${avalancheGasUSD.toFixed(4)}, Sonic $${sonicGasUSD.toFixed(4)}, Total $${totalGasUSD.toFixed(4)}`);

    // Price comparison and arbitrage direction - use the appropriate logic based on target token
    let priceDiff: number;
    let percentageDiff: number;
    let buyChain: string;
    let sellChain: string;
    let buyPriceUSDCperUSDT: number;
    let sellPriceUSDCperUSDT: number;

    if (targetToken === 'USDT') {
      // When targeting USDT, we're doing USDC-targeted arbitrage
      // Use the correct price direction based on each chain's token index
      const avalanchePriceUSDCperUSDT = avalancheTargetIndex === 1 ? avalanchePrice.tokens0PerToken1 : avalanchePrice.tokens1PerToken0;
      const sonicPriceUSDCperUSDT = sonicTargetIndex === 1 ? sonicPrice.tokens0PerToken1 : sonicPrice.tokens1PerToken0;

      priceDiff = Math.abs(avalanchePriceUSDCperUSDT - sonicPriceUSDCperUSDT);
      percentageDiff = (priceDiff / Math.min(avalanchePriceUSDCperUSDT, sonicPriceUSDCperUSDT)) * 100;
      log(`Price comparison: Avalanche USDT=${avalanchePriceUSDCperUSDT.toFixed(6)} USDC/USDT, Sonic USDT=${sonicPriceUSDCperUSDT.toFixed(6)} USDC/USDT, Diff=${percentageDiff.toFixed(4)}%`);

      // Determine arbitrage direction for USDC-targeted arbitrage
      buyChain = avalanchePriceUSDCperUSDT < sonicPriceUSDCperUSDT ? 'avalanche' : 'sonic';
      sellChain = avalanchePriceUSDCperUSDT < sonicPriceUSDCperUSDT ? 'sonic' : 'avalanche';
      buyPriceUSDCperUSDT = Math.min(avalanchePriceUSDCperUSDT, sonicPriceUSDCperUSDT);
      sellPriceUSDCperUSDT = Math.max(avalanchePriceUSDCperUSDT, sonicPriceUSDCperUSDT);

      log(`🎯 Checking USDC-targeted arbitrage (we're running low on USDT, so we'll use USDC to buy USDT)`);
      await checkUSDCTargetedArbitrage(buyChain, sellChain, buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, totalGasUSD);
    } else {
      // When targeting USDC, we're doing USDT-targeted arbitrage
      // Use the correct price direction based on each chain's token index
      const avalanchePriceUSDTperUSDC = avalancheTargetIndex === 0 ? avalanchePrice.tokens0PerToken1 : avalanchePrice.tokens1PerToken0;
      const sonicPriceUSDTperUSDC = sonicTargetIndex === 0 ? sonicPrice.tokens0PerToken1 : sonicPrice.tokens1PerToken0;

      priceDiff = Math.abs(avalanchePriceUSDTperUSDC - sonicPriceUSDTperUSDC);
      percentageDiff = (priceDiff / Math.min(avalanchePriceUSDTperUSDC, sonicPriceUSDTperUSDC)) * 100;
      log(`Price comparison: Avalanche USDC=${avalanchePriceUSDTperUSDC.toFixed(6)} USDT/USDC, Sonic USDC=${sonicPriceUSDTperUSDC.toFixed(6)} USDT/USDC, Diff=${percentageDiff.toFixed(4)}%`);

      // Determine arbitrage direction for USDT-targeted arbitrage
      buyChain = avalanchePriceUSDTperUSDC < sonicPriceUSDTperUSDC ? 'avalanche' : 'sonic';
      sellChain = avalanchePriceUSDTperUSDC < sonicPriceUSDTperUSDC ? 'sonic' : 'avalanche';
      const buyPriceUSDTperUSDC = Math.min(avalanchePriceUSDTperUSDC, sonicPriceUSDTperUSDC);
      const sellPriceUSDTperUSDC = Math.max(avalanchePriceUSDTperUSDC, sonicPriceUSDTperUSDC);

      log(`🎯 Checking USDT-targeted arbitrage (we're running low on USDC, so we'll use USDT to buy USDC)`);
      await checkUSDTTargetedArbitrage(buyChain, sellChain, buyPriceUSDTperUSDC, sellPriceUSDTperUSDC, totalGasUSD);
    }

    // Log updated balances after arbitrage checks
    logBalances();

  } catch (error) {
    log(`Failed to check arbitrage opportunities: ${error}`, 'error');
  }
}

// Log current balances on all chains
function logBalances(): void {
  log('💰 Current Paper Trading Balances:');

  const avalancheBalance = getPaperBalance('avalanche');
  const sonicBalance = getPaperBalance('sonic');

  // Calculate total portfolio value
  const avalancheValue = avalancheBalance.usdc + avalancheBalance.usdt;
  const sonicValue = sonicBalance.usdc + sonicBalance.usdt;
  const totalValue = avalancheValue + sonicValue;

  log(`  🏔️  Avalanche:`);
  log(`    USDC: ${avalancheBalance.usdc.toFixed(2)} ($${avalancheBalance.usdc.toFixed(2)})`);
  log(`    USDT: ${avalancheBalance.usdt.toFixed(2)} ($${avalancheBalance.usdt.toFixed(2)})`);
  log(`    Total: $${avalancheValue.toFixed(2)}`);

  log(`  🎵 Sonic:`);
  log(`    USDC: ${sonicBalance.usdc.toFixed(2)} ($${sonicBalance.usdc.toFixed(2)})`);
  log(`    USDT: ${sonicBalance.usdt.toFixed(2)} ($${sonicBalance.usdt.toFixed(2)})`);
  log(`    Total: $${sonicValue.toFixed(2)}`);

  log(`  📊 Portfolio Total: $${totalValue.toFixed(2)}`);

  // Show trading stats
  const stats = getPaperTradingStats();
  log(`  📈 Trading Stats:`);
  log(`    Total Trades: ${stats.totalTrades}`);
  log(`    Profitable Trades: ${stats.profitableTrades}`);
  log(`    Total Profit: $${stats.totalProfit.toFixed(4)}`);
  log(`    Win Rate: ${stats.winRate.toFixed(1)}%`);

  log('─'.repeat(50));
}

// Determine which token we're running low on across all chains
function determineTargetToken(poolMetadata: Record<string, PoolMetadata>): 'USDC' | 'USDT' {
  const avalancheBalance = getPaperBalance('avalanche');
  const sonicBalance = getPaperBalance('sonic');

  // Calculate combined balances across all chains
  const totalUSDC = avalancheBalance.usdc + sonicBalance.usdc;
  const totalUSDT = avalancheBalance.usdt + sonicBalance.usdt;

  log(`📊 Combined balances: USDC=${totalUSDC.toFixed(2)}, USDT=${totalUSDT.toFixed(2)}`);

  // Determine which token we have less of (the one we're running out of)
  if (totalUSDC <= totalUSDT) {
    log(`🎯 Target token determined: USDC (${totalUSDC.toFixed(2)} vs ${totalUSDT.toFixed(2)} USDT)`);
    return 'USDC';
  } else {
    log(`🎯 Target token determined: USDT (${totalUSDT.toFixed(2)} vs ${totalUSDC.toFixed(2)} USDC)`);
    return 'USDT';
  }
}

// Calculate minimum trade amount needed to achieve required profit
function calculateMinimumTradeAmount(
  buyPrice: number,
  sellPrice: number,
  totalGasUSD: number,
  isUSDCTargeted: boolean
): number {
  const ATOMIC_UNIT = 0.000001; // 1 atomic unit (6 decimal places)
  const requiredNetProfit = totalGasUSD + CONFIG.PROFIT_THRESHOLD + ATOMIC_UNIT;

  if (isUSDCTargeted) {
    // USDC-targeted arbitrage: Start with USDC, end with more USDC
    // We buy USDT with USDC on buyChain (cheaper price), then sell USDT for USDC on sellChain (more expensive price)
    // buyPrice and sellPrice are in USDC per USDT
    // Formula: requiredNetProfit = (tradeAmount / buyPrice * sellPrice) - tradeAmount - totalGasUSD
    // Solving for tradeAmount: tradeAmount = (requiredNetProfit + totalGasUSD) / ((sellPrice / buyPrice) - 1)
    const priceRatio = sellPrice / buyPrice;
    if (priceRatio <= 1) {
      return 0; // No profit possible
    }
    const minTradeAmount = (requiredNetProfit + totalGasUSD) / (priceRatio - 1);
    return Math.ceil(minTradeAmount * 1000000) / 1000000; // Round up to 6 decimal places
  } else {
    // USDT-targeted arbitrage: Start with USDT, end with more USDT
    // We sell USDT for USDC on buyChain (cheaper price = more USDC per USDT), then buy USDT with USDC on sellChain (more expensive price = less USDC per USDT)
    // buyPrice and sellPrice are in USDT per USDC
    // Formula: requiredNetProfit = (tradeAmount * buyPrice / sellPrice) - tradeAmount - totalGasUSD
    // Solving for tradeAmount: tradeAmount = (requiredNetProfit + totalGasUSD) / ((buyPrice / sellPrice) - 1)
    const priceRatio = buyPrice / sellPrice;
    if (priceRatio <= 1) {
      return 0; // No profit possible
    }
    const minTradeAmount = (requiredNetProfit + totalGasUSD) / (priceRatio - 1);
    return Math.ceil(minTradeAmount * 1000000) / 1000000; // Round up to 6 decimal places
  }
}

// Check USDC-targeted arbitrage: Start with USDC, end with more USDC
async function checkUSDCTargetedArbitrage(
  buyChain: string,
  sellChain: string,
  buyPriceUSDCperUSDT: number,
  sellPriceUSDCperUSDT: number,
  totalGasUSD: number
): Promise<void> {
  const sourceBalance = getPaperBalance(buyChain);

  // Calculate minimum trade amount needed to achieve required profit
  const minTradeAmountUSDC = calculateMinimumTradeAmount(buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, totalGasUSD, true);

  if (minTradeAmountUSDC === 0) {
    log(`USDC-targeted arbitrage not profitable: price ratio ${(sellPriceUSDCperUSDT / buyPriceUSDCperUSDT).toFixed(6)} <= 1`, 'warn');
    return;
  }

  // Dynamic trade sizing: use up to 50% of available USDC balance
  const maxTradeAmountUSDC = Math.floor(sourceBalance.usdc * 0.5);
  const absoluteMinTradeAmountUSDC = 100; // Absolute minimum trade size

  if (maxTradeAmountUSDC < Math.max(minTradeAmountUSDC, absoluteMinTradeAmountUSDC)) {
    log(`Insufficient USDC on ${buyChain} for USDC-targeted arbitrage. Available: ${sourceBalance.usdc}, Min required: ${Math.max(minTradeAmountUSDC, absoluteMinTradeAmountUSDC).toFixed(6)}`, 'warn');
    return;
  }

  // Use the minimum trade amount that achieves required profit, but not more than 50% of balance
  const tradeAmountUSDC = Math.min(maxTradeAmountUSDC, Math.max(minTradeAmountUSDC, absoluteMinTradeAmountUSDC));

  log(`USDC trade sizing: Available ${sourceBalance.usdc} USDC, Min profitable: ${minTradeAmountUSDC.toFixed(6)} USDC, Max 50%: ${maxTradeAmountUSDC} USDC, Using ${tradeAmountUSDC.toFixed(6)} USDC`);

  // USDC-targeted arbitrage logic:
  // 1. Buy USDT with USDC on buyChain (cheaper price)
  // 2. Sell USDT for USDC on sellChain (more expensive price)
  // 3. End with more USDC than we started with

  const usdtReceived = tradeAmountUSDC / buyPriceUSDCperUSDT; // USDT received from buying
  const usdcReceived = usdtReceived * sellPriceUSDCperUSDT; // USDC received from selling

  // Calculate profit in USDC terms
  const grossProfitUSDC = usdcReceived - tradeAmountUSDC;
  const netProfitUSD = grossProfitUSDC - totalGasUSD; // Convert to USD for comparison

  log(`USDC-targeted arbitrage: Start ${tradeAmountUSDC.toFixed(6)} USDC → End ${usdcReceived.toFixed(6)} USDC = ${grossProfitUSDC.toFixed(6)} USDC profit`);
  log(`Net profit after gas: $${netProfitUSD.toFixed(6)}, Threshold: $${CONFIG.PROFIT_THRESHOLD} USD`);

  if (netProfitUSD > CONFIG.PROFIT_THRESHOLD) {
    log(`🚨 ARBITRAGE OPPORTUNITY FOUND! ${netProfitUSD.toFixed(6)} USD profit`, 'info');
    await executeUSDCTargetedArbitrage(buyChain, sellChain, buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, tradeAmountUSDC);
  } else {
    log(`USDC-targeted arbitrage not profitable after gas costs (Net: $${netProfitUSD.toFixed(6)}, Threshold: $${CONFIG.PROFIT_THRESHOLD})`, 'warn');
  }
}

// Check USDT-targeted arbitrage: Start with USDT, end with more USDT
async function checkUSDTTargetedArbitrage(
  buyChain: string,
  sellChain: string,
  buyPriceUSDTperUSDC: number,
  sellPriceUSDTperUSDC: number,
  totalGasUSD: number
): Promise<void> {
  const sourceBalance = getPaperBalance(buyChain);

  // Calculate minimum trade amount needed to achieve required profit
  const minTradeAmountUSDT = calculateMinimumTradeAmount(buyPriceUSDTperUSDC, sellPriceUSDTperUSDC, totalGasUSD, false);

  if (minTradeAmountUSDT === 0) {
    log(`USDT-targeted arbitrage not profitable: price ratio ${(buyPriceUSDTperUSDC / sellPriceUSDTperUSDC).toFixed(6)} <= 1`, 'warn');
    return;
  }

  // Dynamic trade sizing: use up to 50% of available USDT balance
  const maxTradeAmountUSDT = Math.floor(sourceBalance.usdt * 0.5);
  const absoluteMinTradeAmountUSDT = 100; // Absolute minimum trade size

  if (maxTradeAmountUSDT < Math.max(minTradeAmountUSDT, absoluteMinTradeAmountUSDT)) {
    log(`Insufficient USDT on ${buyChain} for USDT-targeted arbitrage. Available: ${sourceBalance.usdt}, Min required: ${Math.max(minTradeAmountUSDT, absoluteMinTradeAmountUSDT).toFixed(6)}`, 'warn');
    return;
  }

  // Use the minimum trade amount that achieves required profit, but not more than 50% of balance
  const tradeAmountUSDT = Math.min(maxTradeAmountUSDT, Math.max(minTradeAmountUSDT, absoluteMinTradeAmountUSDT));

  log(`USDT trade sizing: Available ${sourceBalance.usdt} USDT, Min profitable: ${minTradeAmountUSDT.toFixed(6)} USDT, Max 50%: ${maxTradeAmountUSDT} USDT, Using ${tradeAmountUSDT.toFixed(6)} USDT`);

  // USDT-targeted arbitrage logic:
  // 1. Sell USDT for USDC on buyChain (cheaper price = more USDC per USDT)
  // 2. Transfer USDC to sellChain (cross-chain bridge)
  // 3. Buy USDT with USDC on sellChain (more expensive price = less USDC per USDT)
  // 4. End with USDT only on sellChain

  const usdcReceived = tradeAmountUSDT * buyPriceUSDTperUSDC; // USDC received from selling USDT
  const usdtReceived = usdcReceived / sellPriceUSDTperUSDC; // USDT received from buying

  // Calculate profits in USDT terms
  const grossProfitUSDT = usdtReceived - tradeAmountUSDT;
  const netProfitUSD = grossProfitUSDT - totalGasUSD;

  log(`USDT-targeted arbitrage: Start ${tradeAmountUSDT.toFixed(6)} USDT → End ${usdtReceived.toFixed(6)} USDT = ${grossProfitUSDT.toFixed(6)} USDT profit`);
  log(`Net profit after gas: $${netProfitUSD.toFixed(6)}, Threshold: $${CONFIG.PROFIT_THRESHOLD} USD`);

  if (netProfitUSD > CONFIG.PROFIT_THRESHOLD) {
    log(`🚨 ARBITRAGE OPPORTUNITY FOUND! ${netProfitUSD.toFixed(6)} USD profit`, 'info');
    await executeUSDTTargetedArbitrage(buyChain, sellChain, buyPriceUSDTperUSDC, sellPriceUSDTperUSDC, tradeAmountUSDT);
  } else {
    log(`USDT-targeted arbitrage not profitable after gas costs (Net: $${netProfitUSD.toFixed(6)}, Threshold: $${CONFIG.PROFIT_THRESHOLD})`, 'warn');
  }
}

// Continuous price monitoring function
export async function monitorPrices(): Promise<void> {
  log('Starting price monitoring...');
  log(`💰 Profit threshold set to: $${CONFIG.PROFIT_THRESHOLD}`);

  // Log initial balances
  log('🚀 Initial Portfolio State:');
  logBalances();

  while (true) {
    try {
      // Get all chain data (including gas costs)
      await getAllChainData('avalanche');
      await getAllChainData('sonic');

      // Calculate total arbitrage gas cost
      const totalGasCost = calculateTotalArbitrageGasCost();

      // Check for arbitrage opportunities (this will fetch pool prices and check opportunities)
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