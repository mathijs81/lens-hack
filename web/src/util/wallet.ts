import type { ExternalProvider, JsonRpcProvider } from '@ethersproject/providers';
import { Web3Provider } from '@ethersproject/providers';
import detectEthereumProvider from '@metamask/detect-provider';
import type { BigNumber } from 'ethers';
import { providers, utils } from 'ethers';
import { ref } from 'vue';
import { Currency__factory } from '../lens-types/factories/Currency__factory';
import { lensAddr } from './addresses';

// For demo, keep a direct connection to hardhat instead of going through metamask
// that caches stuff for 20s (see https://github.com/MetaMask/metamask-extension/issues/13302)
export const directProvider = new providers.JsonRpcProvider('http://localhost:8545');
directProvider.send('evm_setIntervalMining', [5000]);
export const currency = Currency__factory.connect(lensAddr.currency, directProvider);
directProvider.pollingInterval = 1000; // Faster, better for demo.

export class WalletService {
  private externalProvider: ExternalProvider | null = null;
  private provider: JsonRpcProvider | null = null;

  address = ref(null as string|null);
  blockNumber = ref(0);

  async connect() {
    this.externalProvider = await detectEthereumProvider() as ExternalProvider;
    if (this.externalProvider) {
      await this.externalProvider.request!({ method: 'eth_requestAccounts' });
      this.provider = new Web3Provider(this.externalProvider);
      const accounts = await this.provider.listAccounts();
      if (accounts.length > 0)
        this.address.value = accounts[0];
      else
        throw new Error('No accounts returned from metamask');
      directProvider.on('block', number => this.blockNumber.value = number);
    }
    else {
      throw new Error('No metamask found');
    }
  }

  getProvider() {
    return this.provider;
  }
}

export function formatBn(bn: BigNumber) {
  return parseFloat(utils.formatEther(bn)).toFixed(2);
}

export const wallet = new WalletService();
