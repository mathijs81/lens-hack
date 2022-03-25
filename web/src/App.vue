
<template>
  <div class="container app position-relative">
    <div class="float-end">
      <button class="btn btn-sm btn-light" @click="forwardtime()">
        Forward time
      </button>
    </div>
    <h1 class="h1 pt-4">
      Auction Lens posts demo
    </h1>
    <h5 class="h5 py-2">
      LFGrow 2022
    </h5>
    <button
      v-if="wallet.address.value == null"
      class="connect-btn btn btn-light"
      @click="connect()"
    >
      Connect to Wallet
    </button>
    <p v-else>
      Connected as {{ wallet.address.value }}
    </p>
    <PostList :profile-id="1" />
  </div>
</template>

<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup
import { computed, ref, watch } from 'vue';
import JsonRpcProvider, { UrlJsonRpcProvider } from '@ethersproject/providers';
import { providers } from 'ethers';
import { wallet } from './util/wallet';
import PostList from './components/PostList.vue';

const connect = () => {
  wallet.connect();
};

const forwardtime = async() => {
  const provider = new providers.JsonRpcProvider('http://localhost:8545');

  const blockNumber = await provider.send('eth_blockNumber', []);
  const block = await provider.send('eth_getBlockByNumber', [blockNumber, false]);
  await provider.send('evm_setNextBlockTimestamp', [Number(block.timestamp) + 1 * 60]);
  await provider.send('evm_mine', []);
};

</script>

<style>
.app {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
}
.connect-btn {
  min-width: 300px;
}
</style>
