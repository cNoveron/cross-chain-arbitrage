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
  buyPriceUSDCperUSDT: number,
  sellPriceUSDCperUSDT: number,
  tradeAmountUSDT: number
): Promise<void> {
  try {
    log(`Executing USDT-targeted arbitrage: Sell USDT on ${buyChain} at ${buyPriceUSDCperUSDT} USDC/USDT, buy on ${sellChain} at ${sellPriceUSDCperUSDT} USDC/USDT (Amount: ${tradeAmountUSDT} USDT)`);

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

    const usdcReceived = tradeAmountUSDT * buyPriceUSDCperUSDT; // USDC received from selling USDT
    const usdtReceived = usdcReceived / sellPriceUSDCperUSDT; // USDT received from buying

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
        sourcePrice: buyPriceUSDCperUSDT,
        targetPrice: sellPriceUSDCperUSDT,
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
    const avalanchePrice = lastPrices['avalanche'];
    const sonicPrice = lastPrices['sonic'];

    if (!avalanchePrice || !sonicPrice) {
      return; // Wait for both prices to be available
    }

    // Log current balances before checking arbitrage
    logBalances();

    // Price comparison - USDT price denominated in USDC (how many USDC per 1 USDT)
    const priceDiff = Math.abs(avalanchePrice.usdt - sonicPrice.usdt);
    const percentageDiff = (priceDiff / Math.min(avalanchePrice.usdt, sonicPrice.usdt)) * 100;

    log(`Price comparison: Avalanche USDT=${avalanchePrice.usdt.toFixed(6)} USDC/USDT, Sonic USDT=${sonicPrice.usdt.toFixed(6)} USDC/USDT, Diff=${percentageDiff.toFixed(4)}%`);

    // Calculate gas costs in USD
    const [avalancheGasUSD, sonicGasUSD] = await Promise.all([
      getGasCostInUSD('avalanche'),
      getGasCostInUSD('sonic')
    ]);
    const totalGasUSD = avalancheGasUSD + sonicGasUSD;

    log(`Gas costs: Avalanche $${avalancheGasUSD.toFixed(4)}, Sonic $${sonicGasUSD.toFixed(4)}, Total $${totalGasUSD.toFixed(4)}`);

    // Determine arbitrage direction
    const buyChain = avalanchePrice.usdt < sonicPrice.usdt ? 'avalanche' : 'sonic';
    const sellChain = avalanchePrice.usdt < sonicPrice.usdt ? 'sonic' : 'avalanche';
    const buyPriceUSDCperUSDT = Math.min(avalanchePrice.usdt, sonicPrice.usdt);
    const sellPriceUSDCperUSDT = Math.max(avalanchePrice.usdt, sonicPrice.usdt);

    // Check both arbitrage scenarios: USDC-targeted and USDT-targeted
    await checkUSDCTargetedArbitrage(buyChain, sellChain, buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, totalGasUSD);
    await checkUSDTTargetedArbitrage(buyChain, sellChain, buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, totalGasUSD);

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

// Check USDC-targeted arbitrage: Start with USDC, end with more USDC
async function checkUSDCTargetedArbitrage(
  buyChain: string,
  sellChain: string,
  buyPriceUSDCperUSDT: number,
  sellPriceUSDCperUSDT: number,
  totalGasUSD: number
): Promise<void> {
  const sourceBalance = getPaperBalance(buyChain);

  // Dynamic trade sizing: use up to 50% of available USDC balance
  const maxTradeAmountUSDC = Math.floor(sourceBalance.usdc * 0.5);
  const minTradeAmountUSDC = 100; // Minimum trade size to cover gas costs

  if (maxTradeAmountUSDC < minTradeAmountUSDC) {
    log(`Insufficient USDC on ${buyChain} for USDC-targeted arbitrage. Available: ${sourceBalance.usdc}, Min required: ${minTradeAmountUSDC}`, 'warn');
    return;
  }

  // Use the smaller of max trade amount or 1000 USDC (original trade size)
  const tradeAmountUSDC = Math.min(maxTradeAmountUSDC, 1000);

  log(`USDC trade sizing: Available ${sourceBalance.usdc} USDC, Max 50% = ${maxTradeAmountUSDC} USDC, Using ${tradeAmountUSDC} USDC`);

  // USDC-targeted arbitrage logic:
  // 1. Buy USDT with USDC on buyChain (cheaper price)
  // 2. Sell USDT for USDC on sellChain (more expensive price)
  // 3. End with more USDC than we started with

  const usdtReceived = tradeAmountUSDC / buyPriceUSDCperUSDT; // USDT received from buying
  const usdcReceived = usdtReceived * sellPriceUSDCperUSDT; // USDC received from selling

  // Calculate profit in USDC terms
  const grossProfitUSDC = usdcReceived - tradeAmountUSDC;
  const netProfitUSD = grossProfitUSDC - totalGasUSD; // Convert to USD for comparison

  log(`USDC-targeted arbitrage: Start ${tradeAmountUSDC} USDC → End ${usdcReceived.toFixed(4)} USDC = ${grossProfitUSDC.toFixed(4)} USDC profit`);
  log(`Net profit after gas: $${netProfitUSD.toFixed(4)}, Threshold: $${CONFIG.PROFIT_THRESHOLD} USD`);

  if (netProfitUSD > CONFIG.PROFIT_THRESHOLD) {
    log(`🚨 ARBITRAGE OPPORTUNITY FOUND! ${netProfitUSD.toFixed(4)}% difference`, 'info');
    await executeUSDCTargetedArbitrage(buyChain, sellChain, buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, tradeAmountUSDC);
  } else {
    log(`USDC-targeted arbitrage not profitable after gas costs (Net: $${netProfitUSD.toFixed(4)}, Threshold: $${CONFIG.PROFIT_THRESHOLD})`, 'warn');
  }
}

// Check USDT-targeted arbitrage: Start with USDT, end with more USDT
async function checkUSDTTargetedArbitrage(
  buyChain: string,
  sellChain: string,
  buyPriceUSDCperUSDT: number,
  sellPriceUSDCperUSDT: number,
  totalGasUSD: number
): Promise<void> {
  const sourceBalance = getPaperBalance(buyChain);

  // Dynamic trade sizing: use up to 50% of available USDT balance
  const maxTradeAmountUSDT = Math.floor(sourceBalance.usdt * 0.5);
  const minTradeAmountUSDT = 100; // Minimum trade size to cover gas costs

  if (maxTradeAmountUSDT < minTradeAmountUSDT) {
    log(`Insufficient USDT on ${buyChain} for USDT-targeted arbitrage. Available: ${sourceBalance.usdt}, Min required: ${minTradeAmountUSDT}`, 'warn');
    return;
  }

  // Use the smaller of max trade amount or 1000 USDT (original trade size)
  const tradeAmountUSDT = Math.min(maxTradeAmountUSDT, 1000);

  log(`USDT trade sizing: Available ${sourceBalance.usdt} USDT, Max 50% = ${maxTradeAmountUSDT} USDT, Using ${tradeAmountUSDT} USDT`);

  // USDT-targeted arbitrage logic:
  // 1. Sell USDT for USDC on buyChain (cheaper price = more USDC per USDT)
  // 2. Transfer USDC to sellChain (cross-chain bridge)
  // 3. Buy USDT with USDC on sellChain (more expensive price = less USDC per USDT)
  // 4. End with USDT only on sellChain

  const usdcReceived = tradeAmountUSDT * buyPriceUSDCperUSDT; // USDC received from selling USDT
  const usdtReceived = usdcReceived / sellPriceUSDCperUSDT; // USDT received from buying

  // Calculate profits in USDT terms
  const grossProfitUSDT = usdtReceived - tradeAmountUSDT;
  const [sourceGasUSD, targetGasUSD] = await Promise.all([
    getGasCostInUSD(buyChain),
    getGasCostInUSD(sellChain)
  ]);
  const gasCostUSD = sourceGasUSD + targetGasUSD;
  const netProfitUSD = grossProfitUSDT - gasCostUSD;

  log(`USDT-targeted arbitrage: Start ${tradeAmountUSDT} USDT → End ${usdtReceived.toFixed(4)} USDT = ${grossProfitUSDT.toFixed(4)} USDT profit`);
  log(`Net profit after gas: $${netProfitUSD.toFixed(4)}, Threshold: $${CONFIG.PROFIT_THRESHOLD} USD`);

  if (netProfitUSD > CONFIG.PROFIT_THRESHOLD) {
    log(`🚨 ARBITRAGE OPPORTUNITY FOUND! ${netProfitUSD.toFixed(4)}% difference`, 'info');
    await executeUSDTTargetedArbitrage(buyChain, sellChain, buyPriceUSDCperUSDT, sellPriceUSDCperUSDT, tradeAmountUSDT);
  } else {
    log(`USDT-targeted arbitrage not profitable after gas costs (Net: $${netProfitUSD.toFixed(4)}, Threshold: $${CONFIG.PROFIT_THRESHOLD})`, 'warn');
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