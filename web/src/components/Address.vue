<template>
  <span>
    <img :src="blockieSrc" class="rounded-circle">{{ format(address) }}
  </span>
</template>

<script setup lang="ts">
import { createIcon } from '@download/blockies';
const props = defineProps({
  address: {
    type: String,
    required: true,
  },
},
);

const canvas = createIcon({
  seed: props.address.toLowerCase(),
});
const blockieSrc = canvas.toDataURL();
function format(addr: string) {
  const lAddr = addr.toLowerCase();
  return `${lAddr.substring(0, 7)}...${lAddr.substring(lAddr.length - 6, lAddr.length)}`;
}
</script>

<style scoped>
img {
    margin-right: 4px;
}
</style>
