# <img width="20" height="20" alt="apple-touch-icon" src="https://github.com/user-attachments/assets/0ddce653-a77e-46fe-8419-c36c97a5d553" /> ZeroCore v0.1.0

<p align="center">
  <img width="1226" height="708" alt="ZeroCore Screenshot" src="https://github.com/user-attachments/assets/5d7c6dd2-a778-4c9e-995e-46bba986fdbe" />
</p>

## The Serverless Crypto Wallet

ZeroCore is a fully serverless, open-source desktop crypto wallet built around one core principle:

> No central server. No tracking. No single point of failure.

Every API request goes directly to public blockchain infrastructure using automatic fallback logic.  
If one endpoint is unavailable, another takes over silently.

---

## Download

Prebuilt binaries for Linux and Windows are available here:

https://github.com/FastFrontDev/ZeroCore/releases/tag/0.1.0

---

## Supported Networks

ZeroCore v0.1.0 supports:

- Ethereum (including ERC-20 tokens)
- Bitcoin
- Solana (including SPL tokens)
- Litecoin
- Dogecoin

Multi-chain management from a single unified interface.

---

## Architecture

ZeroCore does not operate a backend server.

All balance checks, transaction lookups, price data, and broadcasts are performed directly against public infrastructure providers.

### Balance & Transactions

- Ethereum RPC (PublicNode, Cloudflare, LlamaRPC)
- Etherscan, Ethplorer, Blockscout, ETHScan
- Solana RPC (mainnet-beta)
- Solscan API v2
- mempool.space (BTC)
- litecoinspace.org (LTC)
- BlockCypher (BTC, LTC, DOGE)

### Broadcasting

- Ethereum — public JSON-RPC nodes
- Solana — multi-RPC fallback (3 endpoints)
- Bitcoin / Litecoin / Dogecoin — BlockCypher broadcast

### Price Data

- CoinGecko public API
- Multiple fallback endpoints

### Fee Estimation

- Ethereum — Blockscout gas stats
- Bitcoin — mempool.space fee API
- Solana — getRecentPrioritizationFees RPC
- Litecoin — litecoinspace.org fee API

All calls are distributed across multiple providers to eliminate single points of failure.

---

## Built for Real Use

Every feature is designed around security, reliability, and practical day-to-day crypto management.

### Serverless by Design
Every request is distributed across multiple public RPC nodes and APIs. There is no central infrastructure operated by ZeroCore.

### Multi-Chain Wallet
Manage Bitcoin, Ethereum, Solana, Litecoin, and Dogecoin from one interface. Send, receive, and track balances across all five chains.

### Token Support
Automatic detection and display of:
- ERC-20 tokens
- SPL tokens

View balances, transaction history, and send tokens directly.

### 12-Word Recovery
Industry-standard BIP-39 mnemonic seed phrases.  
Import or export your wallet at any time. Your keys remain yours.

### Desktop Native
Built with Electron and TypeScript.

Security features include:
- Context isolation
- Sandbox mode
- Secure IPC channels

Private keys never leave your device.

### Fee Control
Real-time fee estimation from public APIs.  
Custom priority control allows you to balance cost vs confirmation speed.

---

## Privacy

- No backend server
- No telemetry
- No tracking
- No analytics

ZeroCore does not collect user data.

---

## Roadmap

Future releases will expand:

- Additional public RPC endpoints for redundancy
- Additional blockchain support
- Improved token indexing reliability
- Performance optimisations

---

## Open Source

ZeroCore is fully open source.

You can inspect the code, verify the architecture, and build from source.

Source repository:
https://github.com/FastFrontDev/ZeroCore

---

## Platforms

Currently available for:

- Linux
- Windows

---

## Disclaimer

ZeroCore interacts with public blockchain infrastructure providers.  
Availability and rate limits may depend on third-party services.

Always verify transactions before broadcasting.
