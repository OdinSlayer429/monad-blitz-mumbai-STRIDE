

# 🏃‍♂️ STRIDE — Stake. Walk. Win.

<img width="1080" height="956" alt="image" src="https://github.com/user-attachments/assets/07cd9a25-7df0-4584-bcab-cb2916d8817c" />


> **"Proof of Step"** — Stop dreaming, start walking. STRIDE is a high-performance fitness accountability protocol built on **Monad**, where your discipline pays, and your laziness costs.

----------

## 💡 The Core Concept

Current fitness apps offer digital badges that mean nothing. **STRIDE** offers skin in the game.

Users join a pool, stake tokens, and set a daily step goal. If you hit your goal, you stay in the game and earn rewards. If you fail, your stake is redistributed to the winners. We take a **5% commission** only from the losers' pool to keep the protocol sustainable.

----------

## 🚀 Key Features

**Feature**

**Description**

**STRICT Mode**

The ultimate test. Miss a single day, and you forfeit your entire stake.

**FLEX Mode**

Volume-based. Missing a day only reduces your share of that day's reward.

**Spoof-Proof**

Oracle-signed verification ensures your steps are real physical effort, not phone-shaking.

**Monad Speed**

Near-instant leaderboard updates and ~$0.001 gas fees per daily check-in.

**Soulbound NFTs**

Earn permanent on-chain badges like _Iron Strider_ and _Squad Captain_.

----------

## 🛠 Tech Stack

### **The Engine**

-   **Blockchain:** Solidity Smart Contracts (StridePool.sol).
    
-   **Primary Network:** **Monad Testnet** (Optimized for high-throughput and 1s finality).
    
-   **Secondary Network:** Sepolia (for legacy testing).
    

### **The Interface**

-   **Frontend:** Single-page Web App (HTML5/CSS3/JS).
    
-   **Interaction:** Ethers.js / Web3.js for wallet-based login.
    
-   **UI/UX:** Bold Red-on-Black "High-Performance" Aesthetic.
    

### **The Truth Layer (Oracle)**

-   **Backend:** Node.js / Express.
    
-   **Verification:** Cryptographically signs step data from mobile sensors/cloud APIs before submission.
    
-   **Trust:** The smart contract rejects any payload not signed by the verified STRIDE Oracle.
    

----------

## 🔄 User Flow

1.  **Connect:** Link your EVM wallet (MetaMask/Rabbit) and sync your fitness data.
    
2.  **Commit:** Select a Pool (STRICT or FLEX), set your goal, and stake your MON.
    
3.  **Move:** Hit the pavement. The Oracle verifies your activity in real-time.
    
4.  **Claim:** Once the challenge ends, the smart contract redistributes the "Lazy Stakes" to the "Disciplined Winners."
    
<img width="1424" height="591" alt="image" src="https://github.com/user-attachments/assets/db498dfa-2555-4158-8581-2e995664dbb4" />

----------

## 💻 Setup for Developers

### **1. Clone & Install**

Bash

```
git clone https://github.com/your-repo/stride.git
cd stride
npm install

```

### **2. Configure Environment**

Create a `.env` file in both the `frontend` and `oracle` directories:

Code snippet

```
RPC_URL=https://testnet-rpc.monad.xyz
CONTRACT_ADDRESS=0x...
ORACLE_PRIVATE_KEY=your_key_here

```

### **3. Deploy & Run**

Bash

```
# Deploy Contracts
npx hardhat run scripts/deploy.js --network monad

# Start Oracle
cd oracle && node server.js

# Start Frontend
cd frontend && npm start

```

----------

## 🛡 Security & Fairness

-   **Zero-Inference Verifiability:** We only track step counts, not your location.
    
-   **Non-Custodial:** The protocol never "holds" your winners' principal; it is always yours to claim.
    
-   **Transparent Fees:** 5% commission is only deducted from the losers' pool, never the winners' capital.
    

----------

### **Visual Asset Suggestions**

Since you are a **professional photographer and content creator**, I recommend adding the following assets to this README to make it stand out to judges:

-   **Hero Image:** A high-contrast, professional shot of a runner in a dark urban environment with red "Neon" STRIDE branding overlaid.
    
-   **GIF Demo:** A 15-second loop of the Monad transaction confirmation showing that **1-second finality**.
    
-   **Infographic:** A clean diagram showing the flow of tokens from the "Loser Pool" $\rightarrow$ "STRIDE Commission" $\rightarrow$ "Winner Payout."
    

**Would you like me to generate a prompt for an AI image generator to create that "Hero Image" for you?**
