import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ZERO_ADDRESS } from '../lens_src/test/helpers/constants';
import {
  approvalFollowModule,
  FIRST_PROFILE_ID,
  governance,
  lensHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  secretCodeCollectModule,
  user,
  userAddress,
  userTwo,
  userTwoAddress,
} from './__setup.spec';

const wrongData = defaultAbiCoder.encode(['uint256'], ['42068']);
const data = defaultAbiCoder.encode(['uint256'], ['42069']);

makeSuiteCleanRoom('Secret Code Collect Module', function () {
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
      lensHub.connect(governance).whitelistCollectModule(secretCodeCollectModule.address, true)
    ).to.not.be.reverted;
    await expect(
      lensHub.post({
        profileId: FIRST_PROFILE_ID,
        contentURI: MOCK_URI,
        collectModule: secretCodeCollectModule.address,
        collectModuleData: data,
        referenceModule: ZERO_ADDRESS,
        referenceModuleData: [],
      })
    ).to.not.be.reverted;
  });

  context('Negatives', function () {
    context('Collecting', function () {
      it('UserTwo should fail to collect without passcode', async function () {
        await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, [])).to.be.reverted;
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, wrongData)
        ).to.be.revertedWith('PasscodeInvalid');
      });

      it('UserTwo should mirror the original post, fail to collect from their mirror without passcode', async function () {
        const secondProfileId = FIRST_PROFILE_ID + 1;
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModule: ZERO_ADDRESS,
            referenceModuleData: [],
          })
        ).to.not.be.reverted;

        await expect(
          lensHub.connect(userTwo).collect(secondProfileId, 1, wrongData)
        ).to.be.revertedWith('PasscodeInvalid');
      });
    });
  });

  context('Scenarios', function () {
    it('UserTwo should collect with success when sending right passcode', async function () {
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
    });

    it('UserTwo should mirror the original post, collect with success from their mirror with passcode', async function () {
      const secondProfileId = FIRST_PROFILE_ID + 1;
      await expect(
        lensHub.connect(userTwo).createProfile({
          to: userTwoAddress,
          handle: 'usertwo',
          imageURI: MOCK_PROFILE_URI,
          followModule: ZERO_ADDRESS,
          followModuleData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
      await expect(
        lensHub.connect(userTwo).mirror({
          profileId: secondProfileId,
          profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModule: ZERO_ADDRESS,
          referenceModuleData: [],
        })
      ).to.not.be.reverted;

      await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.not.be.reverted;
    });
  });
});
