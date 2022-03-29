<template>
  <div class="d-flex justify-content-end align-items-center">
    <div v-if="expired" class="text-muted">
      Collect time window expired
    </div>
    <div v-else-if="collectAddress != null" class="text-muted">
      Collected by <Address :address="collectAddress" />
    </div>
    <template v-else>
      <span v-if="type == 'default'">FREE</span>
      <template v-else-if="type == 'english'">
        {{ timeLeft }}
        <a v-if="!canBeCollected" href="#" class="ms-2 btn btn-primary btn-sm" @click="runBid()">Bid $ {{ currentBid }}</a>
      </template>
      <template v-else-if="type == 'dutch'">
        <div class="dutch-progress">
          {{ timeLeft }}
          <div v-if="progress != null" class="progress">
            <div class="progress-bar" role="progressbar" :style="'width: ' + progress + '%'" />
          </div>
        </div>
        <span class="ms-2">
          <img src="/dollar.svg">{{ price }}
        </span>
      </template>
      <span v-else>Collection module unknown?</span>
      <a v-if="canBeCollected" href="#" class="ms-2 btn btn-primary btn-sm" @click="runCollect()">Collect</a>
    </template>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import { useIntervalFn } from '@vueuse/core';
import type { BigNumber } from 'ethers';
import { constants, utils } from 'ethers';
import { defaultAbiCoder } from 'ethers/lib/utils';
import { ref, watch } from 'vue';
import type { Post } from '../data/post';
import { LensHub__factory } from '../lens-types/factories/LensHub__factory';
import { DutchAuctionCollectModule__factory } from '../typechain-types/factories/DutchAuctionCollectModule__factory';
import { EnglishAuctionCollectModule__factory } from '../typechain-types/factories/EnglishAuctionCollectModule__factory';
import { addressesEqual, lensAddr, myAddr } from '../util/addresses';
import { directProvider, formatBn, wallet } from '../util/wallet';
import { CollectNFT__factory } from '../lens-types/factories/CollectNFT__factory';
import Address from './Address.vue';

const props = defineProps({
  post: Object as () => Post,
});

let type = 'unknown';
let collect = async() => { console.log('not implemented'); };
let bid = async() => { console.log('not implemented'); };

const runCollect = () => { collect(); };
const runBid = () => { bid(); };

const price = ref('---');
const expired = ref(false);
const progress = ref(null as number | null);
const timeLeft = ref('');

const currentBid = ref(null as string | null);
const collectAddress = ref(null as null | string);
const canBeCollected = ref(true);

async function setCollectorAddress() {
  const lensHub = await LensHub__factory.connect(lensAddr['lensHub proxy'], directProvider.getSigner(2));
  const collectNftAddress = await lensHub.getCollectNFT(props.post!.profileId, props.post!.pubId);
  if (collectNftAddress !== constants.AddressZero) {
    const collectNft = await CollectNFT__factory.connect(collectNftAddress, directProvider);
    collectAddress.value = await collectNft.ownerOf(1);
    return true;
  }
  return false;
}

if (addressesEqual(props.post?.raw.collectModule, myAddr.dutchAuction)) {
  type = 'dutch';
  (async() => {
    const readContract = await DutchAuctionCollectModule__factory.connect(myAddr.dutchAuction, directProvider);
    let settings = await readContract.getSettings(props.post!.profileId, props.post!.pubId);

    collect = async() => {
      const lensHub = await LensHub__factory.connect(lensAddr['lensHub proxy'], wallet.getProvider()!.getSigner());
      const price = await readContract.getCurrentPrice(props.post!.profileId, props.post!.pubId);
      const data = defaultAbiCoder.encode(
        ['address', 'uint256'],
        [settings.currency, price],
      );
      await lensHub.collect(props.post!.profileId, props.post!.pubId, data);
    };

    const updateDutchPrice = async() => {
      settings = await readContract.getSettings(props.post!.profileId, props.post!.pubId);
      const t = (await directProvider.getBlock('latest')).timestamp;
      if ((settings.flags.toNumber() & 0x1) === 0x1) {
        await setCollectorAddress();
        return;
      }

      expired.value = t > settings.endTimestamp;
      if (!expired.value) {
        const priceBn = await readContract.getCurrentPrice(props.post!.profileId, props.post!.pubId);
        progress.value = Math.round((100.0 * (t - settings.startTimestamp)) / (settings.endTimestamp - settings.startTimestamp));
        timeLeft.value = `${dayjs(settings.endTimestamp * 1000).from(t * 1000, true)} left`;
        price.value = formatBn(priceBn);
      }
    };
    updateDutchPrice();
    watch(wallet.blockNumber, () => updateDutchPrice());
  })();
}
else if (addressesEqual(props.post?.raw.collectModule, myAddr.englishAuction)) {
  type = 'english';
  canBeCollected.value = false;
  (async() => {
    const readContract = await EnglishAuctionCollectModule__factory.connect(myAddr.englishAuction, directProvider);
    const writeContract = await EnglishAuctionCollectModule__factory.connect(myAddr.englishAuction, wallet.getProvider()!.getSigner());
    let settings = await readContract.getSettings(props.post!.profileId, props.post!.pubId);

    const updateEnglishPrice = async() => {
      console.log('update englihs');
      settings = await readContract.getSettings(props.post!.profileId, props.post!.pubId);
      const minBid = await readContract.getMinimumBid(props.post!.profileId, props.post!.pubId);
      currentBid.value = formatBn(minBid);
      bid = async() => {
        await writeContract.makeBid(props.post!.profileId, props.post!.pubId, settings.currency, minBid);
      };
      const t = (await directProvider.getBlock('latest')).timestamp;
      expired.value = t > settings.endTimestamp;
      if (!expired.value) { timeLeft.value = `${dayjs(settings.endTimestamp * 1000).from(t * 1000, true)} left`; }
      else {
        let timeLeftStr = '';
        if (settings.highestBidder !== constants.AddressZero) {
          canBeCollected.value = true;
          expired.value = false;
          timeLeftStr = `Highest bid is $ ${formatBn(await readContract.getCurrentBid(props.post!.profileId, props.post!.pubId))}`;
        }
        else {
          if (await setCollectorAddress())
            expired.value = false;
        }
        timeLeft.value = timeLeftStr;
      }
    };
    updateEnglishPrice();
    // For demo: update every block. TODO: update based on contract events.
    watch(wallet.blockNumber, () => updateEnglishPrice());

    collect = async() => {
      writeContract.finishAuction(props.post!.profileId, props.post!.pubId);
    };
  })();
}
else if (addressesEqual(props.post?.raw.collectModule, lensAddr['empty collect module'])) {
  type = 'default';
  collect = async() => {
    const lensHub = await LensHub__factory.connect(lensAddr['lensHub proxy'], wallet.getProvider()!.getSigner());
    await lensHub.collect(props.post!.profileId, props.post!.pubId, []);
  };
}
</script>
<style>
.dutch-progress {
  min-width: 200px;
}</style>
