# AI On-Chain Community Steward

A Discord-first, AI-powered Web3 community governance tool. Members bind wallets via MetaMask to establish on-chain identity. The bot monitors messages in real-time, detects spam/scam/FUD risks, and generates AI suggestions. Admins confirm moderation actions entirely inside Discord, then batch-write reputation records to the Sepolia testnet. On-chain reputation is globally verifiable across servers. A soulbound community pass NFT serves as anti-sybil identity proof.

## Demo

![Demo Screenshot](docs/demo.png)

[▶️ Watch on Bilibili](https://www.bilibili.com/video/BV1ms756PE3A/) · [▶️ Watch on YouTube](https://youtu.be/4LcXbNWcJxY)


## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Discord Server                       │
│  Members: /bind   /profile   /appeal                │
│  Admins:  /risk   /config   /queue   /write-batch    │
│  Bot monitors messages → creates pending risk cards  │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│              Next.js Backend (localhost:3000)          │
│  API Routes: bind-challenge, verify, profile,        │
│  moderation, member-pass, events, demo, rules       │
│  AI Agent: DeepSeek/OpenAI → risk suggestions       │
│  Rule Engine: keyword detection + scoring model     │
│  Storage: data/community.json (local MVP store)      │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│               Sepolia Testnet                         │
│  CommunityReputation: recordEvent / batchRecordEvents │
│  MemberPassNFT: soulbound identity pass              │
│  On-chain: wallet + eventHash + eventType + scoreDelta│
│  Off-chain: full context + Discord ID + reason        │
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Bot | discord.js v14, WebSocket |
| Frontend | Next.js 15, React 19, TypeScript |
| Smart Contracts | Solidity 0.8.28, Hardhat |
| Blockchain | Sepolia testnet (Ethereum L1) |
| AI | DeepSeek / OpenAI-compatible API |
| Storage | JSON file (MVP), postgres-ready schema |

## Features

### Discord Bot (10 commands)

- `/bind` — Get a wallet binding link (opens browser for MetaMask signing)
- `/profile` — View your community identity: score, review mode, pass status, breakdown
- `/appeal reason` — Submit an appeal for admin review
- `/rules` — View the complete scoring and penalty rules
- `/health` — Community health summary
- `/risk user:@member` — Admin: inspect a member's full risk profile
- `/config admin-channel #channel` — Admin: set the moderation operations channel
- `/positive-contribution @user reason` — Admin: reward a member (+5~+20)
- `/write-batch limit` — Admin: batch-write pending records to Sepolia in one tx
- `/queue` — Admin: pending moderation summary
- `/demo spam|fud|vip|repeat|contribution` — Demo scenarios
- `/issue-pass @user` / `/refresh-pass @user` — Pass management

### Real-time Message Monitoring

- Rule engine scans messages for spam, scam, and FUD keywords
- Detected risks enter a pending queue — AI never auto-punishes
- Risk card notification with interactive buttons in admin channel

### On-Chain Reputation (Sepolia)

- Every confirmed moderation record writes wallet + eventHash + eventType + scoreDelta
- `batchRecordEvents()` batches up to 25 records into a single transaction
- Cross-server reputation via `getReputation(address)` — same wallet, same history
- Event hash (keccak256 of full context) links on-chain proof to off-chain audit trail

### Community Pass (Soulbound NFT)

- Non-transferable `MemberPassNFT` — one per wallet, cannot be sold or transferred
- Holding a pass grants +8 trust score and reduces sybil risk signals
- Only trusted guilds can mint passes

### Universal Discord Interaction Model (Optional)
Currently, the bot uses a hybrid model: `/bind` requires a browser for MetaMask, while all other admin operations (moderation, positive governance, pass management) have been consolidated into Discord using buttons and modals. When combined with role permissions and a hidden admin channel, this creates a universal management model.

### Anti-Sybil Detection

System identifies 7 risk signals without KYC:

- No wallet bound (+25 risk)
- Wallet bound < 24 hours (+10)
- No pass or token holdings (+10)
- No on-chain reputation history (+10)
- Same wallet bound to multiple Discord IDs in same guild (+30)
- Same Discord ID switching wallets (+15~25)
- Historical wallet has negative records (+25)

These signals only raise scrutiny — they never auto-ban.

## Scoring Model

```
Final Score = 60 (base)
            + holdingScore       (pass +8, VIP token ≥10 +35)
            + localEventScore    (moderation history in this server)
            + onchainScoreContribution (-40 ~ +20, from Sepolia)
            - sybilPenalty       (0 ~ -60)
            - newWalletPenalty   (-20 if unbound)

Result clamped to [0, 100]
```

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Discord account + your own server
- MetaMask browser extension
- Sepolia testnet ETH (free from [sepoliafaucet.com](https://sepoliafaucet.com))
- Infura or Alchemy account for Sepolia RPC URL

### 1. Install

```bash
git clone <repo-url>
cd project
npm install
```

### 2. Configure

```bash
cp .env.example .env.local
# Fill in .env.local with your keys:

# CHAIN_ID=11155111
# EVM_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
# EXPLORER_BASE_URL=https://sepolia.etherscan.io
# SERVICE_WALLET_PRIVATE_KEY=your_sepolia_wallet_key
# DISCORD_BOT_TOKEN=your_bot_token
# DISCORD_CLIENT_ID=your_client_id
# DISCORD_GUILD_ID=your_server_id
# DISCORD_ADMIN_CHANNEL_ID=your_admin_channel_id
# ADMIN_DASHBOARD_PASSWORD=your_password
# TRUSTED_GUILD_IDS=your_server_id
# LLM_API_KEY=your_deepseek_or_openai_key
```

### 3. Enable Discord Message Content Intent

[Discord Developer Portal](https://discord.com/developers/applications) → Your App → Bot → Privileged Gateway Intents → **Message Content Intent** → ON → Save.

### 4. Deploy Contracts to Sepolia

```bash
npm run deploy:sepolia        # CommunityReputation
npm run deploy:pass:sepolia   # MemberPassNFT

# Copy the output addresses into .env.local:
# REPUTATION_CONTRACT_ADDRESS=0x...
# VIP_NFT_ADDRESS=0x...
```

### 5. Register Discord Commands

```bash
npm run register:commands
```

### 6. Start

```bash
# Terminal A: Start Next.js first
npm run dev

# Terminal B: Start bot (waits for API readiness)
npm run bot
```

### 7. Open

- Dashboard: `http://localhost:3000`
- Setup diagnostics: `http://localhost:3000/setup`

## Smart Contracts (Sepolia)

### CommunityReputation

- `recordEvent(address wallet, bytes32 eventHash, uint8 eventType, int256 scoreDelta)` — single write
- `batchRecordEvents(address[] wallets, bytes32[] eventHashes, uint8[] eventTypes, int256[] scoreDeltas)` — batch write
- `getReputation(address wallet) → (int256 score, uint256 eventCount)` — read

### MemberPassNFT

- Soulbound ERC-721: no transfer, one per wallet
- `mint(address to)` — owner-only, issues a pass
- `balanceOf(address) → uint256` — check pass ownership

## Discord Admin Workflow

```
1. Member sends risky message → Bot detects → Admin channel gets card:
   [Confirm] [Dismiss]

2. Admin clicks [Confirm] → Modal pre-fills reason & score
   → Submit → Record becomes "pending"

3. Admin runs /write-batch limit:10
   → All pending records → single Sepolia tx → shared txHash

4. Verify on Sepolia Etherscan
```

## Trusted Guild Model

Only servers in `TRUSTED_GUILD_IDS` can write to Sepolia and issue passes. Other servers get local-only records (`chainStatus: local_only`). This prevents untrusted admins from polluting global reputation.

## Security

- **Never commit `.env.local`** (gitignored by default)
- Sepolia private key stored in `.env.local` — use a test-only wallet
- Discord Bot Token and LLM API Key must be reset if exposed
- AI only generates suggestions — never auto-bans or auto-writes to chain
- On-chain data: only wallet + eventHash + eventType + scoreDelta (no Discord ID, username, or chat content)
- Event hash = keccak256(full off-chain context) for audit verification

## Project Structure

```
project/
├── contracts/
│   ├── CommunityReputation.sol    # On-chain reputation ledger
│   └── MemberPassNFT.sol          # Soulbound identity pass
├── scripts/
│   ├── bot.cjs                    # Discord bot (interaction handlers)
│   ├── deploy.cjs                 # Deploy reputation contract
│   ├── deploy-pass.cjs            # Deploy pass contract
│   ├── mint-pass.cjs              # Manual pass minting
│   ├── register-commands.cjs      # Register Discord slash commands
│   ├── doctor.cjs                 # Config validation tool
│   └── load-env.cjs               # .env.local loader
├── src/
│   ├── app/
│   │   ├── api/                   # Next.js API routes
│   │   │   ├── wallet/            # bind-challenge, verify
│   │   │   ├── users/             # profile
│   │   │   ├── moderation/        # appeal, positive, event
│   │   │   ├── member-pass/       # issue, refresh, candidates
│   │   │   ├── events/            # pending, confirm, dismiss, retry-chain, write-batch
│   │   │   ├── discord/           # message, invite-url
│   │   │   ├── dashboard/health   # community health endpoint
│   │   │   ├── demo/              # demo message & seed
│   │   │   ├── guild-config       # per-guild settings
│   │   │   ├── rules              # global rules endpoint
│   │   │   └── setup/status       # environment diagnostics
│   │   ├── bind/                  # Wallet binding page
│   │   ├── users/[discordId]/     # User profile page
│   │   ├── settings/              # Rules viewer (read-only)
│   │   ├── setup/                 # Setup diagnostics page
│   │   └── ui/                    # Dashboard client component
│   └── lib/
│       ├── types.ts               # All TypeScript types
│       ├── config.ts              # Environment config + trusted guild check
│       ├── store.ts               # JSON file persistence + data migrations
│       ├── rules.ts               # Rule engine + scoring + sybil detection
│       ├── reputation.ts          # On-chain read/write/batch + caching
│       ├── chain.ts               # Holdings snapshot fetcher
│       ├── moderation.ts          # Confirm pending + backfill awaiting wallet
│       ├── agent.ts               # AI agent + dedup + sybil cluster detection
│       ├── member-pass.ts         # Pass issue, refresh, candidates
│       └── security.ts            # Nonce, ID, admin auth, rate limiting
└── tests/                         # Vitest unit tests
```

## Commands

```bash
npm run dev                     # Next.js dev server
npm run bot                     # Discord bot (waits for API)
npm run register:commands       # Register slash commands
npm run deploy:sepolia          # Deploy reputation to Sepolia
npm run deploy:pass:sepolia     # Deploy pass to Sepolia
npm run doctor                  # Validate .env.local config
npm run test                    # Run unit tests
npm run hardhat:test            # Run contract tests
npm run build                   # Production build
```

## License

MIT
