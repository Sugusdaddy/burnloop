/**
 * Initialize BurnLoop Market on Mainnet
 * 
 * Creates a perpetuals market using your memecoin as collateral.
 * Trading fees go to insurance fund (soft burn).
 * 
 * DISCLAIMER: NOT AUDITED. USE AT YOUR OWN RISK.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import chalk from "chalk";

import { loadConfig, saveConfig, loadWallet, getConnection } from "../src/utils/config.js";
import { getPoolPrice } from "../src/utils/pumpswap.js";
import {
  encodeInitMarket,
  encodeInitLP,
  encodeDepositCollateral,
  encodeTopUpInsurance,
  encodeKeeperCrank,
  encodeSetOracleAuthority,
  encodePushOraclePrice,
} from "../src/abi/instructions.js";
import {
  ACCOUNTS_INIT_MARKET,
  ACCOUNTS_INIT_LP,
  ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_TOPUP_INSURANCE,
  ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas,
} from "../src/abi/accounts.js";
import { deriveVaultAuthority, deriveLpPda } from "../src/solana/pda.js";
import { buildIx } from "../src/utils/tx.js";

// Market slab size (from percolator)
const SLAB_SIZE = 992560;
const MATCHER_CTX_SIZE = 320;

async function main() {
  console.log(chalk.bold.red("\n" + "=".repeat(70)));
  console.log(chalk.bold.red("⚠️  BURNLOOP MAINNET MARKET INITIALIZATION"));
  console.log(chalk.bold.red("=".repeat(70)));
  console.log(chalk.yellow("\n*** THIS CODE IS NOT AUDITED ***"));
  console.log(chalk.yellow("*** YOU COULD LOSE ALL FUNDS ***\n"));
  
  // Load config
  const config = loadConfig();
  const connection = getConnection(config);
  const payer = loadWallet();
  
  console.log(chalk.cyan(`Network: ${config.network}`));
  console.log(chalk.cyan(`Wallet: ${payer.publicKey.toBase58()}`));
  
  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(chalk.cyan(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`));
  
  if (balance < 5 * LAMPORTS_PER_SOL) {
    console.log(chalk.red("ERROR: Need at least 5 SOL for deployment"));
    process.exit(1);
  }
  
  // Validate memecoin
  const mint = new PublicKey(config.memecoin.mint);
  console.log(chalk.blue(`Memecoin: ${config.memecoin.symbol} (${mint.toBase58()})`));
  
  // Check PumpSwap pool price
  if (config.oracle.poolAddress) {
    console.log(chalk.blue("\nFetching price from PumpSwap..."));
    try {
      const poolAddress = new PublicKey(config.oracle.poolAddress);
      const { price, baseBalance, quoteBalance } = await getPoolPrice(
        connection,
        poolAddress,
        config.memecoin.decimals
      );
      console.log(chalk.green(`  Pool: ${poolAddress.toBase58()}`));
      console.log(chalk.green(`  Price: ${price.toFixed(9)} SOL per ${config.memecoin.symbol}`));
      console.log(chalk.green(`  Liquidity: ${Number(baseBalance) / 10**config.memecoin.decimals} ${config.memecoin.symbol}`));
      console.log(chalk.green(`  Liquidity: ${Number(quoteBalance) / LAMPORTS_PER_SOL} SOL`));
    } catch (e) {
      console.log(chalk.red(`  Error: ${(e as Error).message}`));
      console.log(chalk.yellow("  Continuing without price validation..."));
    }
  }
  
  // Confirm deployment
  console.log(chalk.yellow("\n⚠️  FINAL WARNING:"));
  console.log(chalk.yellow("   This will deploy real smart contracts on Solana mainnet."));
  console.log(chalk.yellow("   Once admin is renounced, this CANNOT be undone.\n"));
  
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const confirm = await new Promise<string>(resolve => {
    rl.question(chalk.bold('Type "DEPLOY" to continue: '), resolve);
  });
  rl.close();
  
  if (confirm !== "DEPLOY") {
    console.log(chalk.red("\nAborted."));
    process.exit(0);
  }
  
  console.log(chalk.green("\n🚀 Starting deployment...\n"));
  
  // Step 1: Create slab account
  console.log(chalk.blue("Step 1: Creating slab account..."));
  const slab = Keypair.generate();
  const rentExempt = await connection.getMinimumBalanceForRentExemption(SLAB_SIZE);
  
  console.log(chalk.gray(`  Slab: ${slab.publicKey.toBase58()}`));
  console.log(chalk.gray(`  Rent: ${(rentExempt / LAMPORTS_PER_SOL).toFixed(4)} SOL`));
  
  // We need to use the devnet programs for now, or deploy our own
  const PROGRAM_ID = new PublicKey(config.programs.percolator || "2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp");
  const MATCHER_PROGRAM_ID = new PublicKey(config.programs.matcher || "4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy");
  
  const createSlabTx = new Transaction();
  createSlabTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }));
  createSlabTx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: slab.publicKey,
    lamports: rentExempt,
    space: SLAB_SIZE,
    programId: PROGRAM_ID,
  }));
  
  await sendAndConfirmTransaction(connection, createSlabTx, [payer, slab], { commitment: "confirmed" });
  console.log(chalk.green("  ✓ Slab account created"));
  
  // Step 2: Derive vault PDA
  console.log(chalk.blue("\nStep 2: Setting up vault..."));
  const [vaultPda, vaultBump] = deriveVaultAuthority(PROGRAM_ID, slab.publicKey);
  console.log(chalk.gray(`  Vault PDA: ${vaultPda.toBase58()}`));
  
  // Create vault ATA for the memecoin
  const vaultAccount = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, vaultPda, true
  );
  const vault = vaultAccount.address;
  console.log(chalk.gray(`  Vault ATA: ${vault.toBase58()}`));
  console.log(chalk.green("  ✓ Vault created"));
  
  // Step 3: Initialize market with oracle authority mode
  console.log(chalk.blue("\nStep 3: Initializing market..."));
  
  // Use all-zeros feed ID for oracle authority mode
  const feedId = "0".repeat(64);
  
  // Get initial price from PumpSwap pool
  let initialPriceE6 = BigInt(1000000); // Default 1.0 if no pool
  if (config.oracle.poolAddress) {
    try {
      const { priceE6 } = await getPoolPrice(
        connection,
        new PublicKey(config.oracle.poolAddress),
        config.memecoin.decimals
      );
      initialPriceE6 = priceE6;
    } catch (e) {
      console.log(chalk.yellow("  Warning: Could not fetch pool price, using default"));
    }
  }
  
  const initMarketData = encodeInitMarket({
    admin: payer.publicKey,
    collateralMint: mint,
    indexFeedId: feedId,
    maxStalenessSecs: String(config.oracle.maxStalenessSeconds),
    confFilterBps: config.oracle.confidenceFilterBps,
    invert: config.market.inverted ? 1 : 0,
    unitScale: 0,
    initialMarkPriceE6: initialPriceE6.toString(),
    warmupPeriodSlots: "10",
    maintenanceMarginBps: String(config.market.maintenanceMarginBps),
    initialMarginBps: String(config.market.initialMarginBps),
    tradingFeeBps: String(config.market.tradingFeeBps),
    maxAccounts: String(config.market.maxAccounts),
    newAccountFee: config.market.newAccountFee,
    riskReductionThreshold: "0",
    maintenanceFeePerSlot: "0",
    maxCrankStalenessSlots: "200",
    liquidationFeeBps: String(config.market.liquidationFeeBps),
    liquidationFeeCap: "1000000000000", // 1000 tokens
    liquidationBufferBps: String(config.market.liquidationBufferBps),
    minLiquidationAbs: "100000",
  });
  
  const initMarketKeys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
    payer.publicKey,
    slab.publicKey,
    mint,
    vault,
    TOKEN_PROGRAM_ID,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    vaultPda,
    SystemProgram.programId,
  ]);
  
  const initTx = new Transaction();
  initTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }));
  initTx.add(buildIx({ programId: PROGRAM_ID, keys: initMarketKeys, data: initMarketData }));
  
  await sendAndConfirmTransaction(connection, initTx, [payer], { commitment: "confirmed" });
  console.log(chalk.green("  ✓ Market initialized"));
  
  // Step 4: Set oracle authority (the keeper bot)
  console.log(chalk.blue("\nStep 4: Setting oracle authority..."));
  
  const setOracleAuthData = encodeSetOracleAuthority({ newAuthority: payer.publicKey });
  const setOracleAuthTx = new Transaction();
  setOracleAuthTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  setOracleAuthTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: slab.publicKey, isSigner: false, isWritable: true },
    ],
    data: setOracleAuthData,
  }));
  
  await sendAndConfirmTransaction(connection, setOracleAuthTx, [payer], { commitment: "confirmed" });
  console.log(chalk.green(`  ✓ Oracle authority set to: ${payer.publicKey.toBase58()}`));
  
  // Step 5: Push initial price
  console.log(chalk.blue("\nStep 5: Pushing initial price..."));
  
  const pushPriceData = encodePushOraclePrice({
    priceE6: initialPriceE6.toString(),
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  const pushPriceTx = new Transaction();
  pushPriceTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  pushPriceTx.add(buildIx({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: slab.publicKey, isSigner: false, isWritable: true },
    ],
    data: pushPriceData,
  }));
  
  await sendAndConfirmTransaction(connection, pushPriceTx, [payer], { commitment: "confirmed" });
  console.log(chalk.green(`  ✓ Initial price set: ${Number(initialPriceE6) / 1e6}`));
  
  // Step 6: Create LP with matcher
  console.log(chalk.blue("\nStep 6: Creating LP account..."));
  
  const matcherCtxKp = Keypair.generate();
  const matcherRent = await connection.getMinimumBalanceForRentExemption(MATCHER_CTX_SIZE);
  
  const createMatcherTx = new Transaction();
  createMatcherTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  createMatcherTx.add(SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: matcherCtxKp.publicKey,
    lamports: matcherRent,
    space: MATCHER_CTX_SIZE,
    programId: MATCHER_PROGRAM_ID,
  }));
  
  await sendAndConfirmTransaction(connection, createMatcherTx, [payer, matcherCtxKp], { commitment: "confirmed" });
  console.log(chalk.gray(`  Matcher context: ${matcherCtxKp.publicKey.toBase58()}`));
  
  // Derive LP PDA
  const lpIndex = 0;
  const [lpPda] = deriveLpPda(PROGRAM_ID, slab.publicKey, lpIndex);
  console.log(chalk.gray(`  LP PDA: ${lpPda.toBase58()}`));
  
  // Initialize matcher context
  const initMatcherTx = new Transaction();
  initMatcherTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  initMatcherTx.add({
    programId: MATCHER_PROGRAM_ID,
    keys: [
      { pubkey: lpPda, isSigner: false, isWritable: false },
      { pubkey: matcherCtxKp.publicKey, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([1]), // Init instruction
  });
  
  await sendAndConfirmTransaction(connection, initMatcherTx, [payer], { commitment: "confirmed" });
  
  // Get payer's token account
  const payerAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, payer.publicKey
  );
  
  // Initialize LP account
  const initLpData = encodeInitLP({
    matcherProgram: MATCHER_PROGRAM_ID,
    matcherContext: matcherCtxKp.publicKey,
    feePayment: "1000000", // 0.001 tokens fee
  });
  const initLpKeys = buildAccountMetas(ACCOUNTS_INIT_LP, [
    payer.publicKey,
    slab.publicKey,
    payerAta.address,
    vault,
    TOKEN_PROGRAM_ID,
  ]);
  
  const initLpTx = new Transaction();
  initLpTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  initLpTx.add(buildIx({ programId: PROGRAM_ID, keys: initLpKeys, data: initLpData }));
  
  await sendAndConfirmTransaction(connection, initLpTx, [payer], { commitment: "confirmed" });
  console.log(chalk.green("  ✓ LP account created"));
  
  // Step 7: Run initial keeper crank
  console.log(chalk.blue("\nStep 7: Running initial keeper crank..."));
  
  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer.publicKey,
    slab.publicKey,
    SYSVAR_CLOCK_PUBKEY,
    slab.publicKey, // Oracle placeholder (we use authority mode)
  ]);
  
  const crankTx = new Transaction();
  crankTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
  crankTx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));
  
  await sendAndConfirmTransaction(connection, crankTx, [payer], { commitment: "confirmed", skipPreflight: true });
  console.log(chalk.green("  ✓ Keeper crank executed"));
  
  // Update config with deployed addresses
  config.market.slabAddress = slab.publicKey.toBase58();
  config.market.vaultAddress = vault.toBase58();
  saveConfig(config);
  
  // Print summary
  console.log(chalk.bold.green("\n" + "=".repeat(70)));
  console.log(chalk.bold.green("✓ BURNLOOP MARKET DEPLOYED"));
  console.log(chalk.bold.green("=".repeat(70)));
  console.log(chalk.white(`
Market Details:
  Slab:             ${slab.publicKey.toBase58()}
  Vault:            ${vault.toBase58()}
  Memecoin:         ${config.memecoin.symbol} (${mint.toBase58()})
  Initial Price:    ${Number(initialPriceE6) / 1e6}

LP (50bps Passive Matcher):
  Index:            ${lpIndex}
  PDA:              ${lpPda.toBase58()}
  Matcher Ctx:      ${matcherCtxKp.publicKey.toBase58()}

Oracle:
  Mode:             Authority (keeper pushes price)
  Authority:        ${payer.publicKey.toBase58()}

Admin:              ${payer.publicKey.toBase58()}

${chalk.yellow("⚠️  NEXT STEPS:")}
  1. Fund the LP:        pnpm run fund:lp
  2. Fund insurance:     pnpm run fund:insurance
  3. Start keeper:       pnpm run keeper
  4. Renounce admin:     pnpm run renounce:admin (IRREVERSIBLE!)
`));
  
  // Save deployment info
  const deploymentInfo = {
    network: config.network,
    deployedAt: new Date().toISOString(),
    programId: PROGRAM_ID.toBase58(),
    matcherProgramId: MATCHER_PROGRAM_ID.toBase58(),
    slab: slab.publicKey.toBase58(),
    mint: mint.toBase58(),
    vault: vault.toBase58(),
    vaultPda: vaultPda.toBase58(),
    lp: {
      index: lpIndex,
      pda: lpPda.toBase58(),
      matcherContext: matcherCtxKp.publicKey.toBase58(),
    },
    oracleAuthority: payer.publicKey.toBase58(),
    admin: payer.publicKey.toBase58(),
  };
  
  fs.writeFileSync("deployment.json", JSON.stringify(deploymentInfo, null, 2));
  console.log(chalk.gray("\nDeployment info saved to deployment.json"));
}

main().catch(err => {
  console.error(chalk.red("\n❌ Deployment failed:"), err);
  process.exit(1);
});
