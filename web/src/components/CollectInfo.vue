<template>
  <div class="d-flex justify-content-end align-items-center">
    <span v-if="type == 'default'">FREE</span>
    <span v-else-if="type == 'english'">Current bid: {{ currentBid }}</span>
    <span v-else-if="type == 'dutch'">
      <div v-if="progress != null" class="progress">
        <div class="progress-bar" role="progressbar" :style="'width: ' + progress + '%'" />
      </div>
      Price: {{ price }}
    </span>
    <span v-else>Collection module unknown?</span>
    <a href="#" class="btn btn-primary btn-sm">Collect</a>
  </div>
</template>

<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core';
import { ref } from 'vue';
import { BigNumber, utils } from 'ethers';
import type { PublicationStructStructOutput } from '../lens-types/ILensHub';
import { DutchAuctionCollectModule__factory } from '../typechain-types/factories/DutchAuctionCollectModule__factory';
import { addressesEqual, lensAddr, myAddr } from '../util/addresses';
import { wallet } from '../util/wallet';
import type { Post } from '../data/post';
import { EnglishAuctionCollectModule__factory } from '../typechain-types/factories/EnglishAuctionCollectModule__factory';

const props = defineProps({
  post: Object as () => Post,
});

let type = 'unknown';

if (addressesEqual(props.post?.raw.collectModule, myAddr.dutchAuction))
  type = 'dutch';

else if (addressesEqual(props.post?.raw.collectModule, myAddr.englishAuction))
  type = 'english';

else if (addressesEqual(props.post?.raw.collectModule, lensAddr['empty collect module']))
  type = 'default';

const price = ref('---');
const expired = ref(false);
const progress = ref(null as number|null);

const updateDutchPrice = async() => {
  console.log('update dutch');
  const contract = await DutchAuctionCollectModule__factory.connect(myAddr.dutchAuction, wallet.getProvider()!.getSigner());
  const settings = await contract.getSettings(props.post!.profileId, props.post!.pubId);
  const t = Date.now() / 1000;
  expired.value = t > settings.endTimestamp;
  if (!expired.value) {
    const priceBn = await contract.getCurrentPrice(props.post!.profileId, props.post!.pubId);
    progress.value = Math.round((100.0 * (t - settings.startTimestamp)) / (settings.endTimestamp - settings.startTimestamp));
    price.value = utils.formatEther(priceBn);
  }
};

const currentBid = ref('---');

const updateEnglishPrice = async() => {
  const contract = await EnglishAuctionCollectModule__factory.connect(myAddr.englishAuction, wallet.getProvider()!.getSigner());
  const minBid = await contract.getMinimumBid(props.post!.profileId, props.post!.pubId);
  currentBid.value = utils.formatEther(minBid);
};

switch (type) {
  case 'dutch':
    updateDutchPrice();
    useIntervalFn(() => updateDutchPrice(), 5000);
    break;
  case 'english':
    updateEnglishPrice();
    // For demo: update every 5 seconds. TODO: update based on contract events.
    useIntervalFn(() => updateEnglishPrice(), 5000);
}

</script>
