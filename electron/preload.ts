import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  wallet: {
    checkExists: () => ipcRenderer.invoke('wallet:check-exists'),
    create: (password: string) => ipcRenderer.invoke('wallet:create', password),
    unlock: (password: string) => ipcRenderer.invoke('wallet:unlock', password),
    addAccount: (password: string) => ipcRenderer.invoke('wallet:add-account', password),
    addImportedAccount: (password: string, chain: string, symbol: string, privateKey: string, name?: string) =>
      ipcRenderer.invoke('wallet:add-imported-account', password, chain, symbol, privateKey, name),
    addWatchAccount: (password: string, chain: string, symbol: string, publicAddress: string, name?: string) =>
      ipcRenderer.invoke('wallet:add-watch-account', password, chain, symbol, publicAddress, name),
    renameAccount: (password: string, index: number, name: string) => 
      ipcRenderer.invoke('wallet:rename-account', password, index, name),
    removeAccount: (password: string, index: number) =>
      ipcRenderer.invoke('wallet:remove-account', password, index),
    getAccount: (password: string, index: number) => 
      ipcRenderer.invoke('wallet:get-account', password, index),
    getBalance: (address: string) => ipcRenderer.invoke('wallet:get-balance', address),
    getAllBalances: (addresses: Array<{ chain: string; symbol: string; address: string }>) =>
      ipcRenderer.invoke('wallet:get-all-balances', addresses),
    sendTransaction: (params: {
      fromAddress: string;
      toAddress: string;
      amount: string;
      privateKey: string;
    }) => ipcRenderer.invoke('wallet:send-transaction', params),
    estimateFees: (chain: string) => ipcRenderer.invoke('wallet:estimate-fees', chain),
    sendMultiChain: (params: {
      chain: string;
      privateKey: string;
      fromAddress: string;
      toAddress: string;
      amount: string;
      feeRate?: number;
      token?: { contractAddress: string; decimals: number; symbol: string };
    }) => ipcRenderer.invoke('wallet:send-multi-chain', params),
    getMnemonic: (password: string) => ipcRenderer.invoke('wallet:get-mnemonic', password),
    getPrivateKeys: (password: string, index: number) =>
      ipcRenderer.invoke('wallet:get-private-keys', password, index),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('wallet:change-password', currentPassword, newPassword),
    resetWallet: (password: string) => ipcRenderer.invoke('wallet:reset', password),
    importWallet: (mnemonic: string, password: string) =>
      ipcRenderer.invoke('wallet:import', mnemonic, password),
    getTokenList: () => ipcRenderer.invoke('wallet:get-token-list'),
    getTokenBalances: (chain: string, address: string, currency: string) =>
      ipcRenderer.invoke('wallet:get-token-balances', chain, address, currency),
    getPrices: (currency: string) => ipcRenderer.invoke('wallet:get-prices', currency),
    clearPriceCaches: () => ipcRenderer.invoke('wallet:clear-price-caches'),
    getTransactionDetail: (chain: string, hash: string) =>
      ipcRenderer.invoke('wallet:get-transaction-detail', chain, hash),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  }
});
