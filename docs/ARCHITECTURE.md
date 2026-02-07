# BurnLoop Architecture

## Overview

BurnLoop is a deflationary perpetuals exchange built on Solana using Toly's Percolator protocol. The core innovation is using a memecoin as both the trading asset AND the collateral, with trading fees permanently locked in an insurance fund.

## System Components

```
┌────────────────────────────────────────────────────────────────┐
│                         BURNLOOP                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │  PumpSwap   │────▶│   Oracle    │────▶│ Percolator  │      │
│  │   Pool      │     │  (Keeper)   │     │   Market    │      │
│  └─────────────┘     └─────────────┘     └─────────────┘      │
│        │                    │                   │              │
│        │                    │                   │              │
│        ▼                    ▼                   ▼              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │  Memecoin   │     │   Price     │     │  Insurance  │      │
│  │  Liquidity  │     │   Feed      │     │    Fund     │      │
│  └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                 │              │
│                                                 ▼              │
│                                          LOCKED FOREVER        │
│                                          (Soft Burn)           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Price Discovery

```
PumpSwap Pool ──▶ Keeper Bot ──▶ Oracle Authority ──▶ Percolator Market
     │                 │
     │                 │
     ▼                 ▼
  AMM Price      Push Price TX
  (x*y=k)        every 5 seconds
```

The keeper bot reads the current price from the PumpSwap pool and pushes it to the Percolator market via the oracle authority mechanism.

### 2. Trading Flow

```
User ──▶ Deposit Memecoin ──▶ Open Position ──▶ Trading Fee
                                    │              │
                                    │              ▼
                                    │         Insurance Fund
                                    │         (Locked Forever)
                                    ▼
                              Position P&L
                                    │
                                    ▼
                              Close Position ──▶ Trading Fee
                                    │              │
                                    │              ▼
                                    │         Insurance Fund
                                    ▼
                              Withdraw Memecoin
```

### 3. Soft Burn Mechanism

Every trade generates fees that go to the insurance fund:

```
Trade Volume: 100,000 MEME
Trading Fee:  0.1%
              ─────────────
Burned:       100 MEME (locked forever)
```

Over time, this reduces circulating supply:

```
Month 1:   100M supply,   10K burned → 99.99M
Month 6:   99.99M supply, 50K burned → 99.94M  
Year 1:    99.94M supply, 100K burned → 99.84M
Year 5:    ...continued burning...
```

## Smart Contract Architecture

### Percolator Program (Core)

- **Slab Account**: Single account containing all market state
  - Header: admin, nonce, version
  - Config: mint, vault, oracle settings
  - Risk Parameters: margins, fees, liquidation settings
  - Engine State: positions, balances, funding

- **Key Instructions**:
  - `InitMarket`: Create new perpetuals market
  - `InitUser/InitLP`: Create trading accounts
  - `Deposit/Withdraw`: Manage collateral
  - `TradeCpi`: Execute trades via matcher
  - `KeeperCrank`: Process funding, liquidations
  - `UpdateAdmin`: Change admin (zero = renounce)

### Matcher Program (Pricing)

- Passive market maker with 50bps spread
- Executes all trades at oracle price ± spread
- LP takes opposite side of every trade

### Oracle System

Two modes supported:

1. **Oracle Authority** (Default for BurnLoop)
   - Keeper bot pushes prices from PumpSwap
   - More centralized but works immediately
   - Admin can disable by setting authority to zero

2. **Switchboard Feed** (Recommended for production)
   - Decentralized oracle reads from PumpSwap
   - Requires setup and ongoing fees
   - More manipulation resistant

## Security Model

### Trust Assumptions

| Component | Trust Level | Risk |
|-----------|-------------|------|
| Percolator Program | High | Code bugs |
| Matcher Program | Medium | Pricing manipulation |
| Oracle Authority | High | Price manipulation |
| PumpSwap Pool | Medium | Liquidity attacks |

### Risk Mitigations

1. **Admin Renounce**: After setup, admin can be set to zero address
2. **Insurance Fund**: Absorbs losses from liquidations
3. **Risk Parameters**: Configurable margins and fees
4. **Keeper Crank**: Anyone can run liquidations

### Known Risks

⚠️ **This code is NOT audited**

- Smart contract bugs could drain funds
- Oracle manipulation could cause unfair liquidations
- Low liquidity pools are vulnerable to price attacks
- No recovery possible after admin renounce

## Deployment Checklist

1. [ ] Create memecoin on pump.fun
2. [ ] Wait for migration to PumpSwap
3. [ ] Deploy Percolator programs (or use existing)
4. [ ] Initialize market with memecoin as collateral
5. [ ] Set oracle authority to keeper wallet
6. [ ] Fund LP with collateral
7. [ ] Fund insurance fund
8. [ ] Start keeper bot
9. [ ] Test all operations
10. [ ] (Optional) Renounce admin

## Monitoring

Key metrics to track:

- **Insurance Fund Balance**: Should grow over time
- **Open Interest**: Total position sizes
- **Funding Rate**: Premium/discount to oracle
- **Liquidation Events**: Should be rare
- **Oracle Freshness**: Price should update regularly
