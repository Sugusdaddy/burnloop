/**
 * PumpSwap Pool Price Reader
 * 
 * Reads price from PumpSwap AMM pools (post-bonding curve migration)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";

export const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/**
 * PumpSwap Pool account structure
 */
export interface PumpSwapPool {
  poolBump: number;
  index: number;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  lpSupply: bigint;
}

/**
 * Parse PumpSwap Pool account data
 */
export function parsePumpSwapPool(data: Buffer): PumpSwapPool {
  // Pool structure (244 bytes with mayhem mode flag):
  // 0: pool_bump (u8)
  // 1-2: index (u16)
  // 3-34: creator (pubkey, 32 bytes)
  // 35-66: base_mint (pubkey, 32 bytes)
  // 67-98: quote_mint (pubkey, 32 bytes)
  // 99-130: lp_mint (pubkey, 32 bytes)
  // 131-162: pool_base_token_account (pubkey, 32 bytes)
  // 163-194: pool_quote_token_account (pubkey, 32 bytes)
  // 195-202: lp_supply (u64)
  // 203: is_mayhem_mode (bool) - optional
  
  return {
    poolBump: data.readUInt8(0),
    index: data.readUInt16LE(1),
    creator: new PublicKey(data.subarray(3, 35)),
    baseMint: new PublicKey(data.subarray(35, 67)),
    quoteMint: new PublicKey(data.subarray(67, 99)),
    lpMint: new PublicKey(data.subarray(99, 131)),
    poolBaseTokenAccount: new PublicKey(data.subarray(131, 163)),
    poolQuoteTokenAccount: new PublicKey(data.subarray(163, 195)),
    lpSupply: data.readBigUInt64LE(195),
  };
}

/**
 * Derive PumpSwap pool address
 * Seeds: ["pool", index (u16 le), creator, baseMint, quoteMint]
 */
export function derivePumpSwapPool(
  index: number,
  creator: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(2);
  indexBuffer.writeUInt16LE(index, 0);
  
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      indexBuffer,
      creator.toBuffer(),
      baseMint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    PUMPSWAP_PROGRAM_ID
  );
}

/**
 * Find canonical PumpSwap pool for a token (index = 0, migrated from pump.fun)
 */
export async function findCanonicalPool(
  connection: Connection,
  tokenMint: PublicKey
): Promise<{ poolAddress: PublicKey; pool: PumpSwapPool } | null> {
  // Get all pool accounts owned by PumpSwap program
  // For canonical pools, we need to search by baseMint
  
  // This is a simplified approach - in production you'd use getProgramAccounts with filters
  // For now, we'll need the pool address to be provided in config
  
  console.log("Note: findCanonicalPool requires pool address in config for efficiency");
  return null;
}

/**
 * Get pool price in quote tokens per base token
 * For MEME/SOL pool: returns SOL per MEME
 */
export async function getPoolPrice(
  connection: Connection,
  poolAddress: PublicKey,
  baseDecimals: number = 9,
  quoteDecimals: number = 9
): Promise<{
  price: number;
  priceE6: bigint;
  baseBalance: bigint;
  quoteBalance: bigint;
}> {
  // Fetch pool account
  const poolInfo = await connection.getAccountInfo(poolAddress);
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolAddress.toBase58()}`);
  }
  
  const pool = parsePumpSwapPool(poolInfo.data);
  
  // Fetch token account balances
  const [baseAccount, quoteAccount] = await Promise.all([
    getAccount(connection, pool.poolBaseTokenAccount),
    getAccount(connection, pool.poolQuoteTokenAccount),
  ]);
  
  const baseBalance = baseAccount.amount;
  const quoteBalance = quoteAccount.amount;
  
  // Calculate price: quote / base (adjusted for decimals)
  // price = (quoteBalance / 10^quoteDecimals) / (baseBalance / 10^baseDecimals)
  // priceE6 = quoteBalance * 10^6 * 10^baseDecimals / (baseBalance * 10^quoteDecimals)
  
  const decimalAdjustment = baseDecimals - quoteDecimals;
  const scaledQuote = BigInt(quoteBalance) * BigInt(10 ** 6) * BigInt(10 ** Math.max(0, decimalAdjustment));
  const scaledBase = BigInt(baseBalance) * BigInt(10 ** Math.max(0, -decimalAdjustment));
  
  const priceE6 = scaledBase > 0n ? scaledQuote / scaledBase : 0n;
  const price = Number(priceE6) / 1e6;
  
  return {
    price,
    priceE6,
    baseBalance,
    quoteBalance,
  };
}

/**
 * Get price with TWAP-like smoothing (reads multiple times)
 */
export async function getPoolPriceSmoothed(
  connection: Connection,
  poolAddress: PublicKey,
  samples: number = 3,
  delayMs: number = 1000,
  baseDecimals: number = 9,
  quoteDecimals: number = 9
): Promise<{
  price: number;
  priceE6: bigint;
  minPrice: number;
  maxPrice: number;
}> {
  const prices: number[] = [];
  
  for (let i = 0; i < samples; i++) {
    const { price } = await getPoolPrice(connection, poolAddress, baseDecimals, quoteDecimals);
    prices.push(price);
    
    if (i < samples - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const priceE6 = BigInt(Math.floor(avgPrice * 1e6));
  
  return {
    price: avgPrice,
    priceE6,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  };
}

/**
 * Monitor pool for significant price changes
 */
export async function* monitorPoolPrice(
  connection: Connection,
  poolAddress: PublicKey,
  intervalMs: number = 5000,
  baseDecimals: number = 9,
  quoteDecimals: number = 9
): AsyncGenerator<{
  price: number;
  priceE6: bigint;
  timestamp: number;
}> {
  while (true) {
    try {
      const { price, priceE6 } = await getPoolPrice(
        connection,
        poolAddress,
        baseDecimals,
        quoteDecimals
      );
      
      yield {
        price,
        priceE6,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("Error fetching pool price:", error);
    }
    
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
