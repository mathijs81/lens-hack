import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { formatEther, parseEther } from 'ethers/lib/utils';
import { parse } from 'path';
import { MAX_UINT256, ZERO_ADDRESS } from '../lens_src/test/helpers/constants';
import { ERRORS } from '../lens_src/test/helpers/errors';
import { getTimestamp, mine, setNextBlockTimestamp } from './helpers/utils';
import {
  abiCoder,
  currency,
  dutchAuctionCollectModule,
  FIRST_PROFILE_ID,
  governance,
  lensHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  moduleGlobals,
  REFERRAL_FEE_BPS,
  userAddress,
  userTwo,
  userTwoAddress,
} from './__setup.spec';

/*
    uint256 startAmount;
    uint256 endAmount;
    uint40 runtimeSeconds;
    address recipient;
    address currency;
    uint16 referralFee;
    bool shouldFollow;
*/

function createData(
  startAmount: number,
  endAmount: number,
  runtimeSeconds: number,
  shouldFollow: boolean
) {
  return abiCoder.encode(
    ['uint256', 'uint256', 'uint40', 'address', 'address', 'uint16', 'bool'],
    [
      parseEther('' + startAmount),
      parseEther('' + endAmount),
      runtimeSeconds,
      userAddress,
      currency.address,
      REFERRAL_FEE_BPS,
      shouldFollow,
    ]
  );
}

makeSuiteCleanRoom('Dutch Auction Collect Module', function () {
  const DEFAULT_COLLECT_PRICE = parseEther('20');
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
      lensHub.connect(governance).whitelistCollectModule(dutchAuctionCollectModule.address, true)
    ).to.not.be.reverted;
    await expect(
      moduleGlobals.connect(governance).whitelistCurrency(currency.address, true)
    ).to.not.be.reverted;
    // Give usertwo money to potentially pay for the collect
    await expect(currency.mint(userTwoAddress, MAX_UINT256)).to.not.be.reverted;
    await expect(
      currency.connect(userTwo).approve(dutchAuctionCollectModule.address, MAX_UINT256)
    ).to.not.be.reverted;
  });

  context('Negatives', function () {
    context('Posting', function () {
      it("Can't post with wrong data", async function () {
        // no data
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: dutchAuctionCollectModule.address,
            collectModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleData: [],
          })
        ).to.be.reverted;
        // end price that's higher than start price
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: dutchAuctionCollectModule.address,
            collectModuleData: createData(10, 20, 123, true),
            referenceModule: ZERO_ADDRESS,
            referenceModuleData: [],
          })
        ).to.be.reverted;
      });
    });
    context('Collecting', function () {
      it('UserTwo should fail to collect with no/too low payment', async function () {
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: dutchAuctionCollectModule.address,
            collectModuleData: createData(20, 20, 10000, false),
            referenceModule: ZERO_ADDRESS,
            referenceModuleData: [],
          })
        ).to.not.be.reverted;
        await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.be.reverted;
        const data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, parseEther('19.9')]
        );
        await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.be.reverted;
      });

      it('UserTwo should fail to collect when following is required', async function () {
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: dutchAuctionCollectModule.address,
            collectModuleData: createData(20, 20, 10000, true),
            referenceModule: ZERO_ADDRESS,
            referenceModuleData: [],
          })
        ).to.not.be.reverted;
        const data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });

      it('UserTwo should fail to collect after the end timestmap', async function () {
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: dutchAuctionCollectModule.address,
            collectModuleData: createData(20, 20, 10000, false),
            referenceModule: ZERO_ADDRESS,
            referenceModuleData: [],
          })
        ).to.not.be.reverted;

        const currentTimestamp = await getTimestamp();
        await setNextBlockTimestamp(Number(currentTimestamp) + 10001);

        const data = abiCoder.encode(
          ['address', 'uint256'],
          [currency.address, DEFAULT_COLLECT_PRICE]
        );
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.COLLECT_EXPIRED);
      });
    });
  });

  context('Scenarios', function () {
    it('UserTwo should successfully collect when sending right amount', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: dutchAuctionCollectModule.address,
          collectModuleData: createData(20, 20, 10000, false),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;
      const data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
    });

    it('UserTwo should successfully collect when sending right amount and following', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: dutchAuctionCollectModule.address,
          collectModuleData: createData(20, 20, 10000, true),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      const data = abiCoder.encode(
        ['address', 'uint256'],
        [currency.address, DEFAULT_COLLECT_PRICE]
      );
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;

      // Can only collect once, so subsequent one fails:
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.be.revertedWith(
        ERRORS.MINT_LIMIT_EXCEEDED
      );
    });

    it('UserTwo should successfully collect at reduced price', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: dutchAuctionCollectModule.address,
          collectModuleData: createData(20, 10, 10000, false),
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;

      const currentTimestamp = await getTimestamp();
      expect(
        parseFloat(
          formatEther(await dutchAuctionCollectModule.getCurrentPrice(FIRST_PROFILE_ID, 1))
        )
      ).to.be.closeTo(20, 1e-6);

      await setNextBlockTimestamp(Number(currentTimestamp) + 2500);
      await mine(1);
      expect(
        parseFloat(
          formatEther(await dutchAuctionCollectModule.getCurrentPrice(FIRST_PROFILE_ID, 1))
        )
      ).to.be.closeTo(17.5, 1e-6);

      // Halfway collection interval, price should now be 15
      await setNextBlockTimestamp(Number(currentTimestamp) + 5000);

      let data = abiCoder.encode(['address', 'uint256'], [currency.address, parseEther('14.9')]);
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.be.reverted;
      data = abiCoder.encode(['address', 'uint256'], [currency.address, parseEther('15.0')]);
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
      expect(
        parseFloat(
          formatEther(await dutchAuctionCollectModule.getCurrentPrice(FIRST_PROFILE_ID, 1))
        )
      ).to.be.closeTo(15, 1e-6);
    });
  });
});
