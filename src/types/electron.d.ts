export interface ChainAddress {
  chain: string;
  symbol: string;
  name: string;
  address: string;
}

export type AccountType = 'from_seed' | 'from_key' | 'just_view';

export interface TokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  logoURI?: string;
  price: number;
}

export interface Account {
  index: number;
  name: string;
  address: string;
  privateKey?: string;
  addresses?: ChainAddress[];
  accountType: AccountType;
  /** For from_key / just_view — the single chain this account is for */
  singleChain?: string;
  /** For from_key / just_view — the single symbol */
  singleSymbol?: string;
}

export interface ElectronAPI {
  wallet: {
    checkExists: () => Promise<{ success: boolean; exists?: boolean; error?: string }>;
    create: (password: string) => Promise<{ 
      success: boolean; 
      mnemonic?: string; 
      accounts?: Account[];
      error?: string 
    }>;
    unlock: (password: string) => Promise<{ 
      success: boolean; 
      accounts?: Account[];
      error?: string 
    }>;
    addAccount: (password: string) => Promise<{ 
      success: boolean; 
      account?: Account;
      error?: string 
    }>;
    addImportedAccount: (password: string, chain: string, symbol: string, privateKey: string, name?: string) => Promise<{
      success: boolean;
      account?: Account;
      error?: string;
    }>;
    addWatchAccount: (password: string, chain: string, symbol: string, publicAddress: string, name?: string) => Promise<{
      success: boolean;
      account?: Account;
      error?: string;
    }>;
    renameAccount: (password: string, index: number, name: string) => Promise<{ 
      success: boolean; 
      error?: string 
    }>;
    removeAccount: (password: string, index: number) => Promise<{
      success: boolean;
      error?: string;
    }>;
    getAccount: (password: string, index: number) => Promise<{ 
      success: boolean; 
      account?: Account;
      error?: string 
    }>;
    getBalance: (address: string) => Promise<{ 
      success: boolean; 
      balance?: string; 
      error?: string 
    }>;
    getAllBalances: (addresses: Array<{ chain: string; symbol: string; address: string }>) => Promise<{
      success: boolean;
      data?: Array<{ chain: string; symbol: string; balance: string; transactions: Array<{
        hash: string; type: string; amount: string; symbol: string;
        confirmed: boolean; confirmations: number; timestamp: number;
        from: string; to: string;
      }> }>;
      error?: string;
    }>;
    sendTransaction: (params: {
      fromAddress: string;
      toAddress: string;
      amount: string;
      privateKey: string;
    }) => Promise<{ success: boolean; txHash?: string; error?: string }>;
    estimateFees: (chain: string) => Promise<{
      success: boolean;
      fees?: { slow: number; average: number; fast: number; unit: string };
      error?: string;
    }>;
    sendMultiChain: (params: {
      chain: string;
      privateKey: string;
      fromAddress: string;
      toAddress: string;
      amount: string;
      feeRate?: number;
      token?: { contractAddress: string; decimals: number; symbol: string };
    }) => Promise<{ success: boolean; txHash?: string; error?: string }>;
    getMnemonic: (password: string) => Promise<{ 
      success: boolean; 
      mnemonic?: string; 
      error?: string 
    }>;
    getPrivateKeys: (password: string, index: number) => Promise<{
      success: boolean;
      keys?: Array<{ chain: string; symbol: string; privateKey: string }>;
      error?: string;
    }>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    resetWallet: (password: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    importWallet: (mnemonic: string, password: string) => Promise<{
      success: boolean;
      accounts?: Account[];
      error?: string;
    }>;
    getTokenList: () => Promise<{
      success: boolean;
      data?: { ethereum: any[]; solana: any[] };
      error?: string;
    }>;
    getTokenBalances: (chain: string, address: string, currency: string) => Promise<{
      success: boolean;
      tokens?: TokenBalance[];
      error?: string;
    }>;
    getPrices: (currency: string) => Promise<{
      success: boolean;
      prices?: Record<string, number>;
      error?: string;
    }>;
    clearPriceCaches: () => Promise<{
      success: boolean;
      error?: string;
    }>;
    getTransactionDetail: (chain: string, hash: string) => Promise<{
      success: boolean;
      detail?: any;
      error?: string;
    }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
