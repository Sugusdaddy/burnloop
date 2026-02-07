/**
 * Renounce Admin - IRREVERSIBLE!
 * 
 * Sets admin to zero address, making the market completely immutable.
 * 
 * After this:
 * - No one can change market parameters
 * - No one can withdraw from insurance fund
 * - No one can fix bugs
 * - The market exists forever
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import chalk from "chalk";
import * as fs from "fs";
import * as readline from "readline";

import { loadConfig, loadWallet, getConnection } from "../src/utils/config.js";
import { encodeUpdateAdmin, encodeSetOracleAuthority } from "../src/abi/instructions.js";
import { buildIx } from "../src/utils/tx.js";

// Zero address (system program = effectively null)
const ZERO_ADDRESS = new PublicKey("11111111111111111111111111111111");

async function main() {
  console.log(chalk.bold.red("\n" + "=".repeat(70)));
  console.log(chalk.bold.red("⚠️  RENOUNCE ADMIN - THIS IS IRREVERSIBLE!"));
  console.log(chalk.bold.red("=".repeat(70)));
  
  console.log(chalk.yellow(`
After renouncing admin:
  ❌ NO ONE can change market parameters
  ❌ NO ONE can withdraw from insurance fund  
  ❌ NO ONE can fix bugs
  ❌ NO ONE can update oracle authority
  ✓ The market exists forever (immutable)
  ✓ Trading fees burn tokens forever (soft burn)
`));
  
  const config = loadConfig();
  const connection = getConnection(config);
  const payer = loadWallet();
  
  if (!fs.existsSync("deployment.json")) {
    console.log(chalk.red("ERROR: deployment.json not found. Run init-market first."));
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
  const slab = new PublicKey(deployment.slab);
  const programId = new PublicKey(deployment.programId);
  
  console.log(chalk.gray(`Slab: ${slab.toBase58()}`));
  console.log(chalk.gray(`Current Admin: ${payer.publicKey.toBase58()}`));
  console.log(chalk.gray(`New Admin: ${ZERO_ADDRESS.toBase58()} (null)\n`));
  
  // Multiple confirmations
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const confirm1 = await new Promise<string>(resolve => {
    rl.question(chalk.red('Type "I UNDERSTAND THIS IS PERMANENT" to continue: '), resolve);
  });
  
  if (confirm1 !== "I UNDERSTAND THIS IS PERMANENT") {
    console.log(chalk.yellow("\nAborted. Admin NOT renounced."));
    rl.close();
    process.exit(0);
  }
  
  const confirm2 = await new Promise<string>(resolve => {
    rl.question(chalk.red('\nType "RENOUNCE" to finalize: '), resolve);
  });
  rl.close();
  
  if (confirm2 !== "RENOUNCE") {
    console.log(chalk.yellow("\nAborted. Admin NOT renounced."));
    process.exit(0);
  }
  
  console.log(chalk.yellow("\n🔥 Renouncing admin..."));
  
  // Step 1: Disable oracle authority (set to zero)
  console.log(chalk.gray("  1. Disabling oracle authority..."));
  
  const disableOracleData = encodeSetOracleAuthority({ newAuthority: ZERO_ADDRESS });
  const disableOracleTx = new Transaction();
  disableOracleTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  disableOracleTx.add(buildIx({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: slab, isSigner: false, isWritable: true },
    ],
    data: disableOracleData,
  }));
  
  await sendAndConfirmTransaction(connection, disableOracleTx, [payer], { commitment: "confirmed" });
  console.log(chalk.green("     ✓ Oracle authority disabled"));
  
  // Step 2: Renounce admin
  console.log(chalk.gray("  2. Renouncing admin..."));
  
  const renounceData = encodeUpdateAdmin({ newAdmin: ZERO_ADDRESS });
  const renounceTx = new Transaction();
  renounceTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 50000 }));
  renounceTx.add(buildIx({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: slab, isSigner: false, isWritable: true },
    ],
    data: renounceData,
  }));
  
  await sendAndConfirmTransaction(connection, renounceTx, [payer], { commitment: "confirmed" });
  console.log(chalk.green("     ✓ Admin renounced"));
  
  // Update deployment info
  deployment.admin = ZERO_ADDRESS.toBase58();
  deployment.oracleAuthority = ZERO_ADDRESS.toBase58();
  deployment.adminRenounced = true;
  deployment.renouncedAt = new Date().toISOString();
  fs.writeFileSync("deployment.json", JSON.stringify(deployment, null, 2));
  
  console.log(chalk.bold.green(`
${"=".repeat(70)}
✓ ADMIN RENOUNCED - MARKET IS NOW IMMUTABLE
${"=".repeat(70)}

The BurnLoop market is now:
  • Completely decentralized (no admin)
  • Immutable (no one can change it)
  • Eternal (runs forever on Solana)

Trading fees will accumulate in the insurance fund forever.
This is the soft burn mechanism - supply reduces over time.

⚠️  IMPORTANT: 
    Since oracle authority is disabled, you need a Switchboard feed
    or the market will use the last pushed price forever.
    Consider setting up a Switchboard oracle for live price updates.
`));
}

main().catch(err => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
