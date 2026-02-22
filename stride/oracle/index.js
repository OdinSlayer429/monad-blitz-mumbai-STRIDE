const express = require("express");
const ethers = require("ethers");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// This MUST be the private key of 0x6C16351D940d1c35dc5B7E5e6e44Ae1E3F4f5283
// Same account you used to deploy — it's the trusted oracle
const ORACLE_PRIVATE_KEY = "0xc6d681a00d4f9cb14fc26bb8baf68e69063f012128594947b159530d68453a28";
const wallet = new ethers.Wallet(ORACLE_PRIVATE_KEY);

console.log("🔮 Oracle address:", wallet.address);
console.log("✅ Oracle server running on http://localhost:3001");

// Frontend calls this — sends wallet address + pool ID + steps
// Oracle signs it and returns the signature
app.post("/sign-steps", async (req, res) => {
  try {
    const { walletAddress, poolId, steps, date } = req.body;

    if (!walletAddress || poolId === undefined || !steps || !date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Must match EXACTLY how the contract hashes it
    const messageHash = ethers.utils.solidityKeccak256(
      ["address", "uint256", "uint256", "uint256"],
      [walletAddress, poolId, steps, date]
    );

    // Sign the hash
    const signature = await wallet.signMessage(
      ethers.utils.arrayify(messageHash)
    );

    console.log(`✍️  Signed: wallet=${walletAddress} pool=${poolId} steps=${steps} date=${date}`);

    res.json({
      signature,
      steps: parseInt(steps),
      date: parseInt(date),
      oracleAddress: wallet.address,
    });

  } catch (err) {
    console.error("Sign error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check — frontend can ping this to confirm oracle is running
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    oracle: wallet.address 
  });
});

app.listen(3001, '0.0.0.0');
