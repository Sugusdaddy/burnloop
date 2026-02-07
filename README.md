# 🔥 BurnLoop

**Deflationary Perpetuals Exchange on Solana**

Trade perpetual futures using memecoins as collateral. Trading fees are permanently locked in an insurance fund, creating a soft-burn mechanism that reduces circulating supply over time.

> Based on [Toly's vision](https://x.com/toly) for sustainable memecoin economics using [Percolator](https://github.com/aeyakovenko/percolator-prog).

---

## 🎯 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        BURNLOOP                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User deposits MEME as collateral                          │
│              ↓                                               │
│   Opens long/short position on MEME/USD perp                │
│              ↓                                               │
│   Trading fee (0.1%) → Insurance Fund                       │
│              ↓                                               │
│   Insurance Fund = LOCKED FOREVER (no admin)                │
│              ↓                                               │
│   Circulating supply decreases over time                    │
│              ↓                                               │
│   More trading = more burn = potential price appreciation   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚠️ CRITICAL DISCLAIMERS

**THIS CODE IS NOT AUDITED. USE AT YOUR OWN RISK.**

- The underlying Percolator protocol is experimental
- Once admin is renounced, bugs CANNOT be fixed
- You could lose ALL deposited funds
- This is not financial advice

---

## 🏗️ Architecture

| Component | Description |
|-----------|-------------|
| **Percolator Program** | Core perpetuals exchange smart contract |
| **Matcher Program** | Passive LP with 50bps spread |
| **Switchboard Oracle** | Permissionless price feed from DEX pools |
| **BurnLoop CLI** | Deployment and management scripts |

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/Sugusdaddy/burnloop.git
cd burnloop

# Install dependencies
pnpm install

# Configure your wallet
export WALLET_PATH=~/.config/solana/id.json

# Configure for your token
cp config/mainnet.example.json config/mainnet.json
# Edit config/mainnet.json with your token details
```

---

## 🚀 Deployment

### Prerequisites

1. **Memecoin already launched** with liquidity pool on Raydium/Orca
2. **Solana wallet** with ~15 SOL for deployment costs
3. **Switchboard oracle** configured for your token

### Deploy to Mainnet

```bash
# 1. Deploy the programs (one-time)
pnpm run deploy:programs

# 2. Initialize the market
pnpm run init:market

# 3. Fund the LP
pnpm run fund:lp

# 4. Fund insurance
pnpm run fund:insurance

# 5. Start the keeper bot
pnpm run keeper

# 6. (IRREVERSIBLE) Renounce admin
pnpm run renounce:admin
```

---

## 📊 Economics

### Fee Structure

| Action | Fee | Destination |
|--------|-----|-------------|
| Open Position | 0.1% | Insurance Fund |
| Close Position | 0.1% | Insurance Fund |
| Liquidation | 1% | Insurance Fund |

### Burn Projection

| Daily Volume | Daily Burn | Annual Burn |
|--------------|------------|-------------|
| 100K tokens | 100 tokens | 36,500 tokens |
| 1M tokens | 1,000 tokens | 365,000 tokens |
| 10M tokens | 10,000 tokens | 3,650,000 tokens |

---

## 🔧 Configuration

Edit `config/mainnet.json`:

```json
{
  "network": "mainnet-beta",
  "rpcUrl": "https://api.mainnet-beta.solana.com",
  "memecoin": {
    "mint": "<YOUR_TOKEN_MINT>",
    "decimals": 9,
    "symbol": "MEME"
  },
  "oracle": {
    "switchboardFeed": "<YOUR_SWITCHBOARD_FEED>",
    "poolAddress": "<YOUR_RAYDIUM_POOL>"
  },
  "market": {
    "initialLpCollateral": 1000000000000,
    "initialInsurance": 500000000000,
    "tradingFeeBps": 10,
    "maintenanceMarginBps": 500,
    "initialMarginBps": 1000
  }
}
```

---

## 🛡️ Security Considerations

### Before Renouncing Admin

- [ ] Verify all market parameters are correct
- [ ] Test with small amounts first
- [ ] Confirm oracle is reporting accurate prices
- [ ] Ensure LP has sufficient collateral
- [ ] Insurance fund is adequately funded

### Oracle Security

- Use Switchboard with multiple data sources
- Ensure underlying pool has sufficient liquidity (>$100K recommended)
- Monitor for price manipulation attempts

---

## 📚 Resources

- [Percolator Documentation](https://github.com/aeyakovenko/percolator-prog)
- [Switchboard Docs](https://docs.switchboard.xyz/)
- [Solana Cookbook](https://solanacookbook.com/)

---

## 📄 License

Apache 2.0 - See [LICENSE](LICENSE)

---

## 🤝 Contributing

This is experimental software. Contributions welcome but please understand the risks involved.

---

**Built for the Solana ecosystem 🌊**
