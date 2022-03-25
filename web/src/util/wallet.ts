import type { ExternalProvider, JsonRpcProvider } from '@ethersproject/providers';
import { Web3Provider } from '@ethersproject/providers';
import detectEthereumProvider from '@metamask/detect-provider';
import { ref } from 'vue';

export class WalletService {
  private externalProvider: ExternalProvider | null = null;
  private provider: JsonRpcProvider | null = null;

  address = ref(null as string|null);

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
    }
    else {
      throw new Error('No metamask found');
    }
  }

  getProvider() {
    return this.provider;
  }
}

export const wallet = new WalletService();
