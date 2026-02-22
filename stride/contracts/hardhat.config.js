require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/i0LVrVeAYQXGCrndin2RS",
      chainId: 11155111,
      accounts: ["c6d681a00d4f9cb14fc26bb8baf68e69063f012128594947b159530d68453a28"],
    },
    monadTestnet: {
      url: "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: ["c6d681a00d4f9cb14fc26bb8baf68e69063f012128594947b159530d68453a28"],
    },
  },
};
