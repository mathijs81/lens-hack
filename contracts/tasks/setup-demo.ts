import { defaultAbiCoder, parseEther } from 'ethers/lib/utils';
import { task } from 'hardhat/config';
import {
  deployContract,
  getAddrs,
  initEnv,
  ProtocolState,
  waitForTx,
  ZERO_ADDRESS,
} from '../../lens-protocol/tasks/helpers/utils';
import { LensHub__factory } from '../../lens-protocol/typechain-types';
import { CreateProfileDataStruct } from '../../lens-protocol/typechain-types/LensHub';
import { Currency__factory } from '../lens_src/typechain-types/factories/Currency__factory';
import { DutchAuctionCollectModule__factory } from '../typechain-types/factories/DutchAuctionCollectModule__factory';
import { EnglishAuctionCollectModule__factory } from '../typechain-types/factories/EnglishAuctionCollectModule__factory';

function createDutchAuctionData(
  startAmount: number,
  endAmount: number,
  userAddress: string,
  currencyAddress: string,
  runtimeSeconds: number
) {
  return defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint40', 'address', 'address', 'uint16', 'bool'],
    [
      parseEther('' + startAmount),
      parseEther('' + endAmount),
      runtimeSeconds,
      userAddress,
      currencyAddress,
      250,
      false,
    ]
  );
}

function createEnglishAuctionData(
  endTimestamp: number,
  startAmount: number,
  userAddress: string,
  currencyAddress: string
) {
  return defaultAbiCoder.encode(
    ['uint40', 'address', 'address', 'address', 'uint256', 'bool'],
    [endTimestamp, userAddress, currencyAddress, ZERO_ADDRESS, parseEther('' + startAmount), false]
  );
}

task('setup-demo', 'Sets up the Demo in web/ after `npm run full-deploy-local`').setAction(
  async ({}, hre) => {
    const [governance, , user] = await initEnv(hre);
    const addrs = getAddrs();
    const lensHub = LensHub__factory.connect(addrs['lensHub proxy'], governance);

    await waitForTx(lensHub.setState(ProtocolState.Unpaused));
    await waitForTx(lensHub.whitelistProfileCreator(user.address, true));

    const inputStruct: CreateProfileDataStruct = {
      to: user.address,
      handle: 'demoaccount',
      imageURI:
        'https://ipfs.fleek.co/ipfs/ghostplantghostplantghostplantghostplantghostplantghostplan',
      followModule: ZERO_ADDRESS,
      followModuleData: [],
      followNFTURI:
        'https://ipfs.fleek.co/ipfs/ghostplantghostplantghostplantghostplantghostplantghostplan',
    };
    await waitForTx(lensHub.connect(user).createProfile(inputStruct));

    const moduleGlobals = addrs['module globals'] as string;

    // deploy & whitelist auction modules
    const dutchAuctionCollectModule = await deployContract(
      new DutchAuctionCollectModule__factory(governance).deploy(lensHub.address, moduleGlobals)
    );
    const englishAuctionCollectModule = await deployContract(
      new EnglishAuctionCollectModule__factory(governance).deploy(lensHub.address, moduleGlobals)
    );
    await waitForTx(lensHub.whitelistCollectModule(dutchAuctionCollectModule.address, true));
    await waitForTx(lensHub.whitelistCollectModule(englishAuctionCollectModule.address, true));

    console.log(`Dutch auction addr: ${dutchAuctionCollectModule.address}`);
    console.log(`English auction addr: ${englishAuctionCollectModule.address}`);

    for (const [post, collectModule, data] of [
      ['Hi, this is a regular post', addrs['empty collect module'], []],
      [
        'Hey, check out this Dutch auction',
        dutchAuctionCollectModule.address,
        createDutchAuctionData(200, 50, user.address, addrs['currency'], 3600),
      ],
      [
        'First Lens auctioned post - Going Once, Going Twice...',
        englishAuctionCollectModule.address,
        createEnglishAuctionData(
          Math.ceil(Date.now() / 1000 + 3600),
          10,
          user.address,
          addrs['currency']
        ),
      ],
    ]) {
      await waitForTx(
        lensHub.connect(user).post({
          profileId: 1,
          contentURI: 'data:' + post,
          collectModule: collectModule,
          collectModuleData: data,
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      );
    }

    const allAddresses = await hre.ethers.getSigners();
    console.log(`user: ${user.address}`);
    console.log(`addtl. user: ${allAddresses[4].address}`);
    console.log(`addtl. user: ${allAddresses[5].address}`);
    console.log(`addtl. user: ${allAddresses[6].address}`);

    const currency = Currency__factory.connect(addrs['currency'], governance);
    for (let i = 4; i <= 6; i++) {
      const addr = allAddresses[i];
      await waitForTx(currency.mint(addr.address, parseEther('1000')));
      await waitForTx(
        currency.connect(addr).approve(englishAuctionCollectModule.address, parseEther('1000'))
      );
      await waitForTx(
        currency.connect(addr).approve(dutchAuctionCollectModule.address, parseEther('1000'))
      );

      await waitForTx(lensHub.connect(addr).follow([1], [[]]));
    }
  }
);
