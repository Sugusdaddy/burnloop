# 🔥 BurnLoop Deployment Status

## Token Info

| Field | Value |
|-------|-------|
| **Name** | BurnLoop |
| **Symbol** | BurnLoop |
| **Mint** | `968zAsb2uRZhZAqpAJAt3khAEuK2KfZFMo9cAqKjpump` |
| **Decimals** | 6 |

## PumpSwap Pool

| Field | Value |
|-------|-------|
| **Pool Address** | `AhJFcrmvk5thQvyCQut6YrPQDpvAXRo4oZUkH6y46nyv` |
| **DEX** | PumpSwap |
| **Quote** | SOL |

## Links

- [Pump.fun](https://pump.fun/coin/968zAsb2uRZhZAqpAJAt3khAEuK2KfZFMo9cAqKjpump)
- [DexScreener](https://dexscreener.com/solana/AhJFcrmvk5thQvyCQut6YrPQDpvAXRo4oZUkH6y46nyv)
- [Solscan](https://solscan.io/token/968zAsb2uRZhZAqpAJAt3khAEuK2KfZFMo9cAqKjpump)

## Deployment Checklist

- [x] Token created on pump.fun
- [x] Token migrated to PumpSwap
- [ ] Percolator programs deployed to mainnet
- [ ] Market initialized
- [ ] LP funded
- [ ] Insurance fund topped up
- [ ] Keeper bot running
- [ ] Admin renounced

## ⚠️ Blocker: Percolator Programs

The Percolator programs are currently only deployed on **devnet**:

- `percolator-prog`: `2SSnp35m7FQ7cRLNKGdW5UzjYFF6RBUNq7d3m5mqNByp` (devnet)
- `percolator-match`: `4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy` (devnet)

**To deploy on mainnet, we need to:**

1. Clone and compile the programs
2. Deploy to mainnet (~5-10 SOL in fees)
3. Update config with new program IDs

---

*Last updated: 2026-02-07*
