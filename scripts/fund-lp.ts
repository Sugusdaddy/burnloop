/**
 * Fund LP Account
 * 
 * Deposits memecoin collateral into the LP account.
 * This provides liquidity for traders.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import chalk from "chalk";
import * as fs from "fs";
import * as readline from "readline";

import { loadConfig, loadWallet, getConnection } from "../src/utils/config.js";
import { encodeDepositCollateral } from "../src/abi/instructions.js";
import { ACCOUNTS_DEPOSIT_COLLATERAL, buildAccountMetas } from "../src/abi/accounts.js";
import { buildIx } from "../src/utils/tx.js";

async function main() {
  console.log(chalk.bold.cyan("\n🏦 FUND LP ACCOUNT\n"));
  
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
  console.log(chalk.gray(`Configured LP collateral: ${Number(config.market.initialLpCollateral) / 10**config.memecoin.decimals}`));
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const amountStr = await new Promise<string>(resolve => {
    rl.question(chalk.cyan(`\nAmount to deposit (or press Enter for configured amount): `), resolve);
  });
  rl.close();
  
  const amount = amountStr ? BigInt(Math.floor(parseFloat(amountStr) * 10**config.memecoin.decimals)) : BigInt(config.market.initialLpCollateral);
  
  if (amount > balance.amount) {
    console.log(chalk.red(`\nERROR: Insufficient balance. You have ${Number(balance.amount) / 10**config.memecoin.decimals} ${config.memecoin.symbol}`));
    process.exit(1);
  }
  
  console.log(chalk.yellow(`\nDepositing ${Number(amount) / 10**config.memecoin.decimals} ${config.memecoin.symbol} to LP...`));
  
  const depositData = encodeDepositCollateral({ 
    userIdx: deployment.lp.index, 
    amount: amount.toString() 
  });
  const depositKeys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
    payer.publicKey,
    slab,
    payerAta.address,
    vault,
    TOKEN_PROGRAM_ID,
    SYSVAR_CLOCK_PUBKEY,
  ]);
  
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }));
  tx.add(buildIx({ programId, keys: depositKeys, data: depositData }));
  
  await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
  
  console.log(chalk.green(`\n✓ Deposited ${Number(amount) / 10**config.memecoin.decimals} ${config.memecoin.symbol} to LP`));
}

main().catch(err => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
