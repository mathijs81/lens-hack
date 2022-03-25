<template>
  <div>
    <div v-for="post of posts" :key="post.content" class="card m-2 text-dark post mx-auto">
      <div class="card-body">
        <span class="post-content">
          {{ post.content }}
        </span>
        <div class="post-info d-flex justify-content-between">
          <span><img src="/at.svg">{{ post.profileHandle }}</span>
          <span><img src="/clock.svg">{{ dayjs(post.timestamp).fromNow() }}</span>
        </div>
        <CollectInfo :post="post" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">import { reactive, watch, watchEffect } from 'vue';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { BigNumber, constants } from 'ethers';
import { LensHub__factory } from '../lens-types';
import { wallet } from '../util/wallet';
import { lensAddr } from '../util/addresses';
import type { PublicationStructStructOutput } from '../lens-types/ILensHub';
import { PostCreatedEvent } from '../lens-types/Events';
import type { Post } from '../data/post';
import CollectInfo from './CollectInfo.vue';
dayjs.extend(relativeTime);

defineProps({
  profileId: Number,
});

const posts = reactive([] as Post[]);

function resolveUriContent(uri: string) {
  // Demo: just support data URLs
  if (uri.startsWith('data:'))
    return uri.substring(5);

  return uri;
}

const profileId = 1;

watch([wallet.address], async() => {
  posts.splice(0, posts.length);
  const provider = wallet.getProvider();
  if (provider) {
    const lensHub = await LensHub__factory.connect(lensAddr['lensHub proxy'], provider.getSigner());
    const profile = await lensHub.getProfile(profileId);
    const pubCount = profile.pubCount.toNumber();
    for (let i = 1; i <= pubCount; i++) {
      const post = await lensHub.getPub(profileId, i);

      posts.push({
        content: resolveUriContent(post.contentURI),
        profileId: BigNumber.from(profileId),
        pubId: BigNumber.from(i),
        raw: post,
        profileHandle: profile.handle,
        timestamp: Date.now(),
      });
    }
  }
});
</script>

<style scoped>
.post {
  max-width: 600px;
}
.post-info {
  margin-top: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}
.post-info img {
  height: 16px;
  margin-right: 4px;
}
.post-content {
  font-size: 26px;
  font-weight: bold;
}
</style>
