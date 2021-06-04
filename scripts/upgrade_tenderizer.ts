// // scripts/upgrade-box.js
// const { ethers, upgrades } = require("hardhat");

// async function main() {
//   const BoxV2 = await ethers.getContractFactory("BoxV2");
//   const box = await upgrades.upgradeProxy(BOX_ADDRESS, BoxV2);
//   console.log("Box upgraded");
// }

// main();


// upgrades must be submitted through the Controller, so create the transaction data instead of submitting it directly