/**
 * Fund Insurance Fund
 * 
 * Tops up the insurance fund with memecoin.
 * This is the "soft burn" - tokens locked here can NEVER be withdrawn.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import chalk from "chalk";
import * as fs from "fs";
import * as readline from "readline";

import { loadConfig, loadWallet, getConnection } from "../src/utils/config.js";
import { encodeTopUpInsurance } from "../src/abi/instructions.js";
import { ACCOUNTS_TOPUP_INSURANCE, buildAccountMetas } from "../src/abi/accounts.js";
import { buildIx } from "../src/utils/tx.js";

async function main() {
  console.log(chalk.bold.cyan("\n🔥 FUND INSURANCE (SOFT BURN)\n"));
  console.log(chalk.yellow("⚠️  WARNING: Tokens sent to insurance fund are LOCKED FOREVER!"));
  console.log(chalk.yellow("   Once admin is renounced, they can NEVER be withdrawn.\n"));
  
  const config = loadConfig();
  const connection = getConnection(config);
  const payer = loadWallet();
  
  if (!fs.existsSync("deployment.json")) {
    console.log(chalk.red("ERROR: deployment.json not found. Run init-market first."));
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
  const slab = new PublicKey(deployment.slab);
  const vault = new PublicKey(deployment.vault);
  const mint = new PublicKey(deployment.mint);
  const programId = new PublicKey(deployment.programId);
  
  // Get payer's token balance
  const payerAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, payer.publicKey
  );
  const balance = await getAccount(connection, payerAta.address);
  
  console.log(chalk.gray(`Your ${config.memecoin.symbol} balance: ${Number(balance.amount) / 10**config.memecoin.decimals}`));
  console.log(chalk.gray(`Configured insurance amount: ${Number(config.market.initialInsurance) / 10**config.memecoin.decimals}`));
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const amountStr = await new Promise<string>(resolve => {
    rl.question(chalk.cyan(`\nAmount to burn (or press Enter for configured amount): `), resolve);
  });
  rl.close();
  
  const amount = amountStr ? BigInt(Math.floor(parseFloat(amountStr) * 10**config.memecoin.decimals)) : BigInt(config.market.initialInsurance);
  
  if (amount > balance.amount) {
    console.log(chalk.red(`\nERROR: Insufficient balance. You have ${Number(balance.amount) / 10**config.memecoin.decimals} ${config.memecoin.symbol}`));
    process.exit(1);
  }
  
  console.log(chalk.red(`\n🔥 Burning ${Number(amount) / 10**config.memecoin.decimals} ${config.memecoin.symbol} to insurance fund...`));
  
  const topupData = encodeTopUpInsurance({ amount: amount.toString() });
  const topupKeys = buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [
    payer.publicKey,
    slab,
    payerAta.address,
    vault,
    TOKEN_PROGRAM_ID,
  ]);
  
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }));
  tx.add(buildIx({ programId, keys: topupKeys, data: topupData }));
  
  await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
  
  console.log(chalk.green(`\n✓ 🔥 Burned ${Number(amount) / 10**config.memecoin.decimals} ${config.memecoin.symbol} to insurance fund`));
  console.log(chalk.gray("  These tokens are now locked forever."));
}

main().catch(err => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
