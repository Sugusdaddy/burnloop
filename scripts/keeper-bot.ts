/**
 * BurnLoop Keeper Bot
 * 
 * Runs continuously to:
 * 1. Update oracle price from PumpSwap pool
 * 2. Run keeper cranks (funding, liquidations)
 * 3. Monitor insurance fund growth (soft burn)
 * 
 * IMPORTANT: Keep this bot running 24/7 for the market to function!
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import chalk from "chalk";
import * as fs from "fs";

import { loadConfig, loadWallet, getConnection } from "../src/utils/config.js";
import { getPoolPrice } from "../src/utils/pumpswap.js";
import { encodeKeeperCrank, encodePushOraclePrice } from "../src/abi/instructions.js";
import { ACCOUNTS_KEEPER_CRANK, buildAccountMetas } from "../src/abi/accounts.js";
import { parseEngine, parseHeader } from "../src/solana/slab.js";
import { buildIx } from "../src/utils/tx.js";

interface KeeperState {
  startTime: number;
  lastCrank: number;
  lastPricePush: number;
  crankCount: number;
  priceUpdates: number;
  startInsurance: bigint;
  errors: number;
}

const state: KeeperState = {
  startTime: Date.now(),
  lastCrank: 0,
  lastPricePush: 0,
  crankCount: 0,
  priceUpdates: 0,
  startInsurance: 0n,
  errors: 0,
};

async function pushOraclePrice(
  connection: Connection,
  payer: any,
  slab: PublicKey,
  programId: PublicKey,
  priceE6: bigint
): Promise<boolean> {
  try {
    const pushPriceData = encodePushOraclePrice({
      priceE6: priceE6.toString(),
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
    tx.add(buildIx({
      programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: slab, isSigner: false, isWritable: true },
      ],
      data: pushPriceData,
    }));
    
    await sendAndConfirmTransaction(connection, tx, [payer], { 
      commitment: "confirmed",
      skipPreflight: true 
    });
    
    state.priceUpdates++;
    state.lastPricePush = Date.now();
    return true;
  } catch (error) {
    console.error(chalk.red("  Price push failed:"), (error as Error).message);
    state.errors++;
    return false;
  }
}

async function runKeeperCrank(
  connection: Connection,
  payer: any,
  slab: PublicKey,
  programId: PublicKey
): Promise<boolean> {
  try {
    const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
    const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
      payer.publicKey,
      slab,
      SYSVAR_CLOCK_PUBKEY,
      slab, // Oracle placeholder
    ]);
    
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
    tx.add(buildIx({ programId, keys: crankKeys, data: crankData }));
    
    await sendAndConfirmTransaction(connection, tx, [payer], { 
      commitment: "confirmed",
      skipPreflight: true 
    });
    
    state.crankCount++;
    state.lastCrank = Date.now();
    return true;
  } catch (error) {
    // Crank failures are often normal (nothing to do)
    return false;
  }
}

async function getMarketState(connection: Connection, slab: PublicKey) {
  const slabInfo = await connection.getAccountInfo(slab);
  if (!slabInfo) return null;
  
  const engine = parseEngine(slabInfo.data);
  const header = parseHeader(slabInfo.data);
  
  return { engine, header };
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

async function printStatus(connection: Connection, slab: PublicKey, symbol: string) {
  const marketState = await getMarketState(connection, slab);
  if (!marketState) {
    console.log(chalk.red("Could not fetch market state"));
    return;
  }
  
  const { engine } = marketState;
  const currentInsurance = BigInt(engine.insuranceFund?.balance || 0);
  const burnedSinceStart = currentInsurance - state.startInsurance;
  const elapsed = Date.now() - state.startTime;
  const burnRate = elapsed > 0 ? Number(burnedSinceStart) / (elapsed / 3600000) : 0;
  
  console.log(chalk.bold("\n" + "─".repeat(60)));
  console.log(chalk.bold.cyan("🔥 BURNLOOP KEEPER STATUS"));
  console.log("─".repeat(60));
  console.log(chalk.white(`  Uptime:           ${formatDuration(elapsed)}`));
  console.log(chalk.white(`  Cranks:           ${state.crankCount}`));
  console.log(chalk.white(`  Price Updates:    ${state.priceUpdates}`));
  console.log(chalk.white(`  Errors:           ${state.errors}`));
  console.log();
  console.log(chalk.bold.green("  SOFT BURN (Insurance Fund):"));
  console.log(chalk.green(`    Current:        ${(Number(currentInsurance) / 1e9).toFixed(6)} ${symbol}`));
  console.log(chalk.green(`    Burned:         +${(Number(burnedSinceStart) / 1e9).toFixed(6)} ${symbol}`));
  console.log(chalk.green(`    Rate:           ${(burnRate / 1e9).toFixed(6)} ${symbol}/hour`));
  console.log("─".repeat(60) + "\n");
}

async function main() {
  console.log(chalk.bold.cyan("\n" + "=".repeat(60)));
  console.log(chalk.bold.cyan("🔥 BURNLOOP KEEPER BOT"));
  console.log(chalk.bold.cyan("=".repeat(60)));
  console.log(chalk.yellow("Press Ctrl+C to stop\n"));
  
  const config = loadConfig();
  const connection = getConnection(config);
  const payer = loadWallet();
  
  // Check if deployment exists
  if (!fs.existsSync("deployment.json")) {
    console.log(chalk.red("ERROR: deployment.json not found. Run init-market first."));
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
  const slab = new PublicKey(deployment.slab);
  const programId = new PublicKey(deployment.programId);
  const poolAddress = config.oracle.poolAddress ? new PublicKey(config.oracle.poolAddress) : null;
  
  console.log(chalk.gray(`Slab: ${slab.toBase58()}`));
  console.log(chalk.gray(`Pool: ${poolAddress?.toBase58() || "N/A"}`));
  console.log(chalk.gray(`Wallet: ${payer.publicKey.toBase58()}\n`));
  
  // Get initial insurance balance
  const initialState = await getMarketState(connection, slab);
  if (initialState) {
    state.startInsurance = BigInt(initialState.engine.insuranceFund?.balance || 0);
    console.log(chalk.cyan(`Initial insurance: ${(Number(state.startInsurance) / 1e9).toFixed(6)} ${config.memecoin.symbol}`));
  }
  
  let lastPrice = 0n;
  let iteration = 0;
  
  // Main loop
  while (true) {
    iteration++;
    
    try {
      // 1. Fetch price from PumpSwap
      if (poolAddress) {
        const { priceE6, price } = await getPoolPrice(
          connection,
          poolAddress,
          config.memecoin.decimals
        );
        
        // Only push if price changed significantly (>0.1%)
        const priceDiff = lastPrice > 0n ? Math.abs(Number(priceE6 - lastPrice) / Number(lastPrice)) : 1;
        
        if (priceDiff > 0.001 || iteration % 60 === 0) {
          process.stdout.write(chalk.blue(`📈 Price: ${price.toFixed(9)} `));
          
          const pushed = await pushOraclePrice(connection, payer, slab, programId, priceE6);
          if (pushed) {
            console.log(chalk.green("✓"));
            lastPrice = priceE6;
          } else {
            console.log(chalk.red("✗"));
          }
        }
      }
      
      // 2. Run keeper crank
      const cranked = await runKeeperCrank(connection, payer, slab, programId);
      if (cranked) {
        process.stdout.write(chalk.cyan("⚙️ "));
      }
      
      // 3. Print status every 60 iterations (~5 minutes)
      if (iteration % 60 === 0) {
        await printStatus(connection, slab, config.memecoin.symbol);
      }
      
    } catch (error) {
      console.error(chalk.red(`\nError: ${(error as Error).message}`));
      state.errors++;
    }
    
    // Wait before next iteration
    await new Promise(r => setTimeout(r, config.keeper.intervalMs));
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log(chalk.yellow("\n\nShutting down keeper..."));
  
  const config = loadConfig();
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
  const connection = getConnection(config);
  const slab = new PublicKey(deployment.slab);
  
  await printStatus(connection, slab, config.memecoin.symbol);
  
  console.log(chalk.cyan("Keeper stopped. Remember to restart for market to function!"));
  process.exit(0);
});

main().catch(err => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
