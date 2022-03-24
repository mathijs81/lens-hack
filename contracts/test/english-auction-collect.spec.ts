import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { BigNumberish } from 'ethers';
import { formatEther, parseEther } from 'ethers/lib/utils';
import { MAX_UINT256, ZERO_ADDRESS } from '../lens_src/test/helpers/constants';
import { ERRORS } from '../lens_src/test/helpers/errors';
import { CollectNFT__factory } from '../lens_src/typechain-types';
import { getTimestamp, setNextBlockTimestamp } from './helpers/utils';
import {
  abiCoder,
  currency,
  englishAuctionCollectModule,
  FIRST_PROFILE_ID,
  governance,
  lensHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  moduleGlobals,
  userAddress,
  userThree,
  userThreeAddress,
  userTwo,
  userTwoAddress,
} from './__setup.spec';

/*
    uint40 endTimestamp;
    address recipient;
    address currency;
    address highestBidder;
    uint256 highestBid;
    bool onlyFollowers;
*/

function createData(endTimestamp: number, startAmount: number, onlyFollowers: boolean) {
  return abiCoder.encode(
    ['uint40', 'address', 'address', 'address', 'uint256', 'bool'],
    [
      endTimestamp,
      userAddress,
      currency.address,
      ZERO_ADDRESS,
      parseEther('' + startAmount),
      onlyFollowers,
    ]
  );
}

function asNum(bn: BigNumberish): number {
  return parseFloat(formatEther(bn));
}

makeSuiteCleanRoom('English Auction Collect Module', function () {
  beforeEach(async function () {
    await expect(
      lensHub.createProfile({
        to: userAddress,
        handle: MOCK_PROFILE_HANDLE,
        imageURI: MOCK_PROFILE_URI,
        followModule: ZERO_ADDRESS,
        followModuleData: [],
        followNFTURI: MOCK_FOLLOW_NFT_URI,
      })
    ).to.not.be.reverted;
    await expect(
      lensHub.connect(governance).whitelistCollectModule(englishAuctionCollectModule.address, true)
    ).to.not.be.reverted;
    await expect(
      moduleGlobals.connect(governance).whitelistCurrency(currency.address, true)
    ).to.not.be.reverted;
    // Give usertwo money to potentially pay for the collect
    await expect(currency.mint(userTwoAddress, parseEther('1000'))).to.not.be.reverted;
    await expect(
      currency.connect(userTwo).approve(englishAuctionCollectModule.address, MAX_UINT256)
    ).to.not.be.reverted;
  });

  context('Scenarios', function () {
    it('UserTwo should successfully collect after sending highest bid', async function () {
      const currentTimestamp = await getTimestamp();
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: englishAuctionCollectModule.address,
          collectModuleData: createData(Number(currentTimestamp) + 100, 1, false),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;
      const module = englishAuctionCollectModule.connect(userTwo);
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1'))
      ).to.not.be.reverted;
      await setNextBlockTimestamp(Number(currentTimestamp) + 101);
      await expect(
        englishAuctionCollectModule.finishAuction(FIRST_PROFILE_ID, 1)
      ).to.not.be.reverted;

      // Check that NFT ended up in the right wallet
      const collectNFTAddr = await lensHub.getCollectNFT(FIRST_PROFILE_ID, 1);
      expect(collectNFTAddr).to.not.eq(ZERO_ADDRESS);
      const collectNFT = CollectNFT__factory.connect(collectNFTAddr, userTwo);
      const owner = await collectNFT.ownerOf(1);

      expect(owner).to.be.equal(userTwoAddress);
    });
    it('Refunding previous highest bidder should work correctly', async function () {
      await expect(currency.mint(userThreeAddress, parseEther('100'))).to.not.be.reverted;
      await expect(
        currency.connect(userThree).approve(englishAuctionCollectModule.address, MAX_UINT256)
      ).to.not.be.reverted;

      const currentTimestamp = await getTimestamp();
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: englishAuctionCollectModule.address,
          collectModuleData: createData(Number(currentTimestamp) + 100, 1, false),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;
      let module = englishAuctionCollectModule.connect(userThree);

      expect(asNum(await currency.balanceOf(userThreeAddress))).to.be.closeTo(100, 1e-6);
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1'))
      ).to.not.be.reverted;
      expect(asNum(await currency.balanceOf(userThreeAddress))).to.be.closeTo(99, 1e-6);
      expect(asNum(await currency.balanceOf(englishAuctionCollectModule.address))).to.be.closeTo(
        1,
        1e-6
      );

      // User2 now makes higher bid
      module = englishAuctionCollectModule.connect(userTwo);
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1.1'))
      ).to.not.be.reverted;

      expect(asNum(await currency.balanceOf(userThreeAddress))).to.be.closeTo(100, 1e-6);
      expect(asNum(await currency.balanceOf(englishAuctionCollectModule.address))).to.be.closeTo(
        1.1,
        1e-6
      );

      await setNextBlockTimestamp(Number(currentTimestamp) + 101);
      await expect(
        englishAuctionCollectModule.finishAuction(FIRST_PROFILE_ID, 1)
      ).to.not.be.reverted;

      // Check that NFT ended up in the right wallet
      const collectNFTAddr = await lensHub.getCollectNFT(FIRST_PROFILE_ID, 1);
      expect(collectNFTAddr).to.not.eq(ZERO_ADDRESS);
      const collectNFT = CollectNFT__factory.connect(collectNFTAddr, userTwo);
      const owner = await collectNFT.ownerOf(1);

      expect(owner).to.be.equal(userTwoAddress);
    });

    it('Bids must increase by 5% or more', async function () {
      const currentTimestamp = await getTimestamp();
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: englishAuctionCollectModule.address,
          collectModuleData: createData(Number(currentTimestamp) + 100, 1, false),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;
      const module = englishAuctionCollectModule.connect(userTwo);
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1'))
      ).to.not.be.reverted;

      expect(asNum(await module.getMinimumBid(FIRST_PROFILE_ID, 1))).to.be.closeTo(1.05, 1e-6);
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1.04'))
      ).to.be.revertedWith('BidTooLow');
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1.05'))
      ).to.not.be.reverted;
    });

    it('Only followers can bid when specified', async function () {
      const currentTimestamp = await getTimestamp();
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: englishAuctionCollectModule.address,
          collectModuleData: createData(Number(currentTimestamp) + 100, 1, true),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;
      const module = englishAuctionCollectModule.connect(userTwo);
      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1'))
      ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);

      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      // Works after following

      await expect(
        module.makeBid(FIRST_PROFILE_ID, 1, currency.address, parseEther('1'))
      ).to.not.be.reverted;
    });
  });
});
