import { task, types } from 'hardhat/config'

task('deploy-dummy', 'deploy DummyStaking')
  .addParam('supply', 'initial supply', '1000000000000000000', types.string)
  .setAction(async (args, hre) => {
    const { ethers } = hre

    const DummyStakingFac = await ethers.getContractFactory('DummyStaking')
    const DummyStaking = await DummyStakingFac.deploy('DummyStaking', 'DST', ethers.utils.parseEther(args.supply), {
      gasPrice: 40000000000
    })
    console.log(DummyStaking)
    await DummyStaking.deployed()

    console.log(DummyStaking.address)
  })
