import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

export interface BurnloopConfig {
  network: string;
  rpcUrl: string;
  memecoin: {
    mint: string;
    decimals: number;
    symbol: string;
    name: string;
  };
  oracle: {
    type: "switchboard" | "pumpswap" | "authority";
    feedAddress?: string;
    poolAddress: string;
    maxStalenessSeconds: number;
    confidenceFilterBps: number;
  };
  programs: {
    percolator: string;
    matcher: string;
  };
  market: {
    slabAddress?: string;
    vaultAddress?: string;
    initialLpCollateral: string;
    initialInsurance: string;
    tradingFeeBps: number;
    maintenanceMarginBps: number;
    initialMarginBps: number;
    liquidationFeeBps: number;
    liquidationBufferBps: number;
    maxAccounts: number;
    newAccountFee: string;
    inverted: boolean;
  };
  keeper: {
    intervalMs: number;
    maxRetries: number;
  };
}

export function loadConfig(configPath?: string): BurnloopConfig {
  const cfgPath = configPath || process.env.CONFIG_PATH || "./config/mainnet.json";
  const fullPath = path.resolve(cfgPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }
  
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as BurnloopConfig;
}

export function saveConfig(config: BurnloopConfig, configPath?: string): void {
  const cfgPath = configPath || process.env.CONFIG_PATH || "./config/mainnet.json";
  const fullPath = path.resolve(cfgPath);
  
  fs.writeFileSync(fullPath, JSON.stringify(config, null, 2));
  console.log(`Config saved to ${fullPath}`);
}

export function loadWallet(walletPath?: string): Keypair {
  const wPath = walletPath || process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const expandedPath = wPath.replace("~", process.env.HOME || "");
  
  if (!fs.existsSync(expandedPath)) {
    throw new Error(`Wallet not found: ${expandedPath}`);
  }
  
  const secretKey = JSON.parse(fs.readFileSync(expandedPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

export function getConnection(config: BurnloopConfig): Connection {
  return new Connection(config.rpcUrl, "confirmed");
}

// PumpSwap constants
export const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const PUMPSWAP_GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw");

// Percolator devnet programs (will deploy our own on mainnet)
export const PERCOLATOR_DEVNET_PROGRAM = new PublicKey("2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp");
export const MATCHER_DEVNET_PROGRAM = new PublicKey("4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy");
