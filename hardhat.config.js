require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },

  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 20,
    coinmarketcap: null,
    showTimeSpent: true,
    showMethodSig: true,
    excludeContracts: [
      "contracts/CompositionAccountingDemo.sol",
      "contracts/ReservableNFTDemo.sol"
    ]
  }
};