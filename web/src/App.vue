
<template>
  <div>
    <div class="position-absolute end-0 m-3 alert alert-info text-center dev-panel">
      <button class="btn btn-sm btn-primary" @click="forwardtime()">
        Advance time
      </button>
      <h3 class="mt-3">
        Balances
      </h3>
      <table class="table-fixed">
        <tr v-for="array of balances" :key="array[0]">
          <td class="pe-3">
            {{ array[0] }}
          </td>
          <td class="text-end">
            {{ array[2] }}
          </td>
        </tr>
      </table>
    </div>

    <div class="container app position-relative">
      <h1 class="h1 pt-4">
        Lens Collect Auctions
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
        Connected as <Address :address="wallet.address.value" />
      </p>
      <PostList :profile-id="1" />
    </div>
  </div>
</template>

<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup
import { providers } from 'ethers';
import { reactive } from 'vue';
import Address from './components/Address.vue';
import PostList from './components/PostList.vue';
import { currency, directProvider, formatBn, wallet } from './util/wallet';
import { Currency__factory } from './lens-types/factories/Currency__factory';
import { lensAddr } from './util/addresses';

const connect = () => {
  wallet.connect();
};

const balances = reactive([
  ['Treasury', '0xE5904695748fe4A84b40b3fc79De2277660BD1D3', ''],
  ['Poster', '0x92561F28Ec438Ee9831D00D1D59fbDC981b762b2', ''],
  ['User 2', '0x2fFd013AaA7B5a7DA93336C2251075202b33FB2B', ''],
]);

async function refreshBalances() {
  balances.forEach(async(array) => {
    array[2] = formatBn(await currency.balanceOf(array[1]));
  });
}

currency.on(currency.filters.Transfer(), transferEvent => refreshBalances());
refreshBalances();

const forwardtime = async() => {
  const blockNumber = await directProvider.send('eth_blockNumber', []);
  const block = await directProvider.send('eth_getBlockByNumber', [blockNumber, false]);
  await directProvider.send('evm_setNextBlockTimestamp', [Number(block.timestamp) + 5 * 60]);
  await directProvider.send('evm_mine', []);
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
td {
  font-size: 18px;
  font-weight: bold;
}
.dev-panel {
  z-index: 1000;
}
</style>
