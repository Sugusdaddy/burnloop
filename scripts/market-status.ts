/**
 * Market Status
 * 
 * Shows current state of the BurnLoop market.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import chalk from "chalk";
import * as fs from "fs";

import { loadConfig, getConnection } from "../src/utils/config.js";
import { parseEngine, parseHeader, parseConfig, parseParams, parseUsedIndices, parseAccount } from "../src/solana/slab.js";
import { getPoolPrice } from "../src/utils/pumpswap.js";

async function main() {
  console.log(chalk.bold.cyan("\n📊 BURNLOOP MARKET STATUS\n"));
  
  const config = loadConfig();
  const connection = getConnection(config);
  
  if (!fs.existsSync("deployment.json")) {
    console.log(chalk.red("ERROR: deployment.json not found. Run init-market first."));
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
  const slab = new PublicKey(deployment.slab);
  const vault = new PublicKey(deployment.vault);
  
  // Fetch slab data
  const slabInfo = await connection.getAccountInfo(slab);
  if (!slabInfo) {
    console.log(chalk.red("ERROR: Market not found"));
    process.exit(1);
  }
  
  const header = parseHeader(slabInfo.data);
  const marketConfig = parseConfig(slabInfo.data);
  const params = parseParams(slabInfo.data);
  const engine = parseEngine(slabInfo.data);
  const usedIndices = parseUsedIndices(slabInfo.data);
  
  const decimals = config.memecoin.decimals;
  const symbol = config.memecoin.symbol;
  
  // Header
  console.log(chalk.bold("═".repeat(60)));
  console.log(chalk.bold.white(`  ${config.memecoin.name} (${symbol}) Perpetuals Market`));
  console.log(chalk.bold("═".repeat(60)));
  
  // Admin status
  const isAdminRenounced = header.admin.toBase58() === "11111111111111111111111111111111";
  console.log(chalk.bold("\n📋 ADMIN STATUS:"));
  if (isAdminRenounced) {
    console.log(chalk.green("  ✓ Admin RENOUNCED - Market is immutable"));
  } else {
    console.log(chalk.yellow(`  ⚠️  Admin: ${header.admin.toBase58()}`));
    console.log(chalk.gray("     (Run 'renounce-admin' to make immutable)"));
  }
  
  // Vault balance
  console.log(chalk.bold("\n💰 VAULT:"));
  try {
    const vaultInfo = await getAccount(connection, vault);
    console.log(chalk.white(`  Balance: ${(Number(vaultInfo.amount) / 10**decimals).toFixed(4)} ${symbol}`));
  } catch {
    console.log(chalk.gray("  Could not fetch vault balance"));
  }
  
  // Insurance fund (soft burn)
  console.log(chalk.bold("\n🔥 SOFT BURN (Insurance Fund):"));
  const insurance = BigInt(engine.insuranceFund?.balance || 0);
  const feeRevenue = BigInt(engine.insuranceFund?.feeRevenue || 0);
  console.log(chalk.green(`  Total Locked:    ${(Number(insurance) / 10**decimals).toFixed(4)} ${symbol}`));
  console.log(chalk.green(`  From Fees:       ${(Number(feeRevenue) / 10**decimals).toFixed(4)} ${symbol}`));
  console.log(chalk.gray("  (These tokens are burned forever)"));
  
  // Market parameters
  console.log(chalk.bold("\n⚙️  MARKET PARAMETERS:"));
  console.log(chalk.white(`  Trading Fee:     ${params.tradingFeeBps / 100}%`));
  console.log(chalk.white(`  Maint. Margin:   ${params.maintenanceMarginBps / 100}%`));
  console.log(chalk.white(`  Init. Margin:    ${params.initialMarginBps / 100}%`));
  console.log(chalk.white(`  Liq. Fee:        ${params.liquidationFeeBps / 100}%`));
  
  // Accounts
  console.log(chalk.bold("\n👥 ACCOUNTS:"));
  console.log(chalk.white(`  Total Used:      ${usedIndices.length}`));
  
  let lpCount = 0;
  let userCount = 0;
  let totalOI = 0n;
  
  for (const idx of usedIndices) {
    const acc = parseAccount(slabInfo.data, idx);
    if (acc) {
      if (acc.kind === 1) { // LP
        lpCount++;
      } else {
        userCount++;
      }
      totalOI += BigInt(Math.abs(Number(acc.positionSize || 0)));
    }
  }
  
  console.log(chalk.white(`  LPs:             ${lpCount}`));
  console.log(chalk.white(`  Users:           ${userCount}`));
  
  // Open Interest
  console.log(chalk.bold("\n📈 OPEN INTEREST:"));
  console.log(chalk.white(`  Total:           ${(Number(totalOI) / 10**decimals).toFixed(4)} ${symbol}`));
  
  // PumpSwap price
  if (config.oracle.poolAddress) {
    console.log(chalk.bold("\n💱 PUMPSWAP PRICE:"));
    try {
      const poolAddress = new PublicKey(config.oracle.poolAddress);
      const { price, baseBalance, quoteBalance } = await getPoolPrice(
        connection,
        poolAddress,
        decimals
      );
      console.log(chalk.white(`  Price:           ${price.toFixed(9)} SOL/${symbol}`));
      console.log(chalk.white(`  ${symbol} Liquidity: ${(Number(baseBalance) / 10**decimals).toFixed(2)}`));
      console.log(chalk.white(`  SOL Liquidity:   ${(Number(quoteBalance) / LAMPORTS_PER_SOL).toFixed(4)}`));
    } catch (e) {
      console.log(chalk.gray(`  Could not fetch: ${(e as Error).message}`));
    }
  }
  
  // Contract addresses
  console.log(chalk.bold("\n📍 ADDRESSES:"));
  console.log(chalk.gray(`  Slab:    ${slab.toBase58()}`));
  console.log(chalk.gray(`  Vault:   ${vault.toBase58()}`));
  console.log(chalk.gray(`  Mint:    ${deployment.mint}`));
  console.log(chalk.gray(`  Program: ${deployment.programId}`));
  
  console.log("\n" + "═".repeat(60) + "\n");
}

main().catch(err => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
