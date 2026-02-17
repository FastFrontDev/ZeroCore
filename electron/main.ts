import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function getAppIcon(): string | undefined {
  // Try multiple icon paths — __dirname is dist-electron/ at runtime
  const candidates = [
    path.join(__dirname, '..', 'public', 'icons', 'android-chrome-512x512.png'),
    path.join(__dirname, '..', 'public', 'icons', 'android-chrome-192x192.png'),
    path.join(__dirname, '..', 'public', 'icons', 'favicon-32x32.png'),
    path.join(app.getAppPath(), 'public', 'icons', 'android-chrome-512x512.png'),
    path.join(app.getAppPath(), 'public', 'icons', 'android-chrome-192x192.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  const iconPath = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1245,
    minHeight: 700,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    autoHideMenuBar: true,
    title: 'ZeroCore Wallet'
  });

  // In development, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for wallet operations
ipcMain.handle('wallet:check-exists', async () => {
  try {
    const { StorageService } = require('./services/StorageService');
    return { success: true, exists: StorageService.walletExists() };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:create', async (_event, password: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');
    
    const wallet = WalletService.createWallet();
    const multiAccount = WalletService.deriveMultiChainAccount(wallet.mnemonic, 0);
    
    StorageService.saveWallet(password, {
      mnemonic: wallet.mnemonic,
      accounts: [
        {
          index: 0,
          name: 'Account 1',
          address: multiAccount.address
        }
      ]
    });
    
    return { 
      success: true, 
      mnemonic: wallet.mnemonic,
      accounts: [{
        index: 0,
        name: 'Account 1',
        address: multiAccount.address,
        addresses: multiAccount.addresses,
        accountType: 'from_seed' as const,
      }]
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:unlock', async (_event, password: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');
    const data = StorageService.loadWallet(password);
    
    // Enrich stored accounts with multi-chain addresses
    const enriched = data.accounts.map((acc: any) => {
      if (acc.accountType === 'from_key' || acc.accountType === 'just_view') {
        // Single-chain account — return as-is with stored info
        const chainNames: Record<string, string> = { ethereum: 'Ethereum', bitcoin: 'Bitcoin', solana: 'Solana', litecoin: 'Litecoin', dogecoin: 'Dogecoin' };
        return {
          index: acc.index,
          name: acc.name,
          address: acc.address,
          accountType: acc.accountType,
          singleChain: acc.chain,
          singleSymbol: acc.symbol,
          addresses: [{
            chain: acc.chain,
            symbol: acc.symbol,
            name: chainNames[acc.chain] || acc.chain,
            address: acc.address,
          }],
        };
      }
      // from_seed account — derive all chains from mnemonic
      const multi = WalletService.deriveMultiChainAccount(data.mnemonic, acc.index);
      return {
        index: acc.index,
        name: acc.name,
        address: acc.address,
        addresses: multi.addresses,
        accountType: 'from_seed' as const,
      };
    });
    
    return { success: true, accounts: enriched };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:add-account', async (_event, password: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');
    
    const data = StorageService.loadWallet(password);
    const nextIndex = data.accounts.length;
    const multi = WalletService.deriveMultiChainAccount(data.mnemonic, nextIndex);
    
    data.accounts.push({
      index: nextIndex,
      name: `Account ${nextIndex + 1}`,
      address: multi.address,
      accountType: 'from_seed',
    });
    
    StorageService.saveWallet(password, data);
    
    return { 
      success: true, 
      account: {
        index: nextIndex,
        name: `Account ${nextIndex + 1}`,
        address: multi.address,
        addresses: multi.addresses,
        accountType: 'from_seed' as const,
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:rename-account', async (_event, password: string, index: number, name: string) => {
  try {
    const { StorageService } = require('./services/StorageService');
    
    const data = StorageService.loadWallet(password);
    const account = data.accounts.find((acc: any) => acc.index === index);
    
    if (!account) {
      throw new Error('Account not found');
    }
    
    account.name = name;
    StorageService.saveWallet(password, data);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:remove-account', async (_event, password: string, index: number) => {
  try {
    const { StorageService } = require('./services/StorageService');

    const data = StorageService.loadWallet(password);

    if (data.accounts.length <= 1) {
      throw new Error('Cannot remove the only account');
    }

    const targetIdx = data.accounts.findIndex((acc: any) => acc.index === index);
    if (targetIdx === -1) {
      throw new Error('Account not found');
    }

    // Remove the account
    data.accounts.splice(targetIdx, 1);

    // Re-index remaining accounts sequentially
    data.accounts.forEach((acc: any, i: number) => {
      acc.index = i;
    });

    StorageService.saveWallet(password, data);

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-account', async (_event, password: string, index: number) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');
    
    const data = StorageService.loadWallet(password);
    const storedAcc = data.accounts[index];
    if (!storedAcc) throw new Error('Account not found');

    if (storedAcc.accountType === 'just_view') {
      // Watch-only — no private key
      return {
        success: true,
        account: {
          index: storedAcc.index,
          name: storedAcc.name,
          address: storedAcc.address,
          accountType: 'just_view' as const,
          singleChain: storedAcc.chain,
          singleSymbol: storedAcc.symbol,
        }
      };
    }

    if (storedAcc.accountType === 'from_key') {
      // Imported key — return the stored private key
      return {
        success: true,
        account: {
          index: storedAcc.index,
          name: storedAcc.name,
          address: storedAcc.address,
          privateKey: storedAcc.privateKey,
          accountType: 'from_key' as const,
          singleChain: storedAcc.chain,
          singleSymbol: storedAcc.symbol,
        }
      };
    }

    // from_seed — derive from mnemonic
    const multi = WalletService.deriveMultiChainAccount(data.mnemonic, index);
    return { 
      success: true, 
      account: {
        index: multi.index,
        name: storedAcc.name || `Account ${index + 1}`,
        address: multi.address,
        privateKey: multi.privateKey,
        addresses: multi.addresses,
        accountType: 'from_seed' as const,
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-balance', async (_event, address: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const balance = await WalletService.getBalance(address);
    return { success: true, balance };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-all-balances', async (_event, addresses: Array<{ chain: string; symbol: string; address: string }>) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const data = await WalletService.getMultiChainBalances(addresses);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:send-transaction', async (_event, params: {
  fromAddress: string;
  toAddress: string;
  amount: string;
  privateKey: string;
}) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const txHash = await WalletService.sendTransaction(
      params.fromAddress,
      params.toAddress,
      params.amount,
      params.privateKey
    );
    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:estimate-fees', async (_event, chain: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const fees = await WalletService.estimateFees(chain);
    return { success: true, fees };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:send-multi-chain', async (_event, params: {
  chain: string;
  privateKey: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  feeRate?: number;
  token?: { contractAddress: string; decimals: number; symbol: string };
}) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const txHash = await WalletService.sendMultiChainTransaction(params);
    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-mnemonic', async (_event, password: string) => {
  try {
    const { StorageService } = require('./services/StorageService');
    const data = StorageService.loadWallet(password);
    return { success: true, mnemonic: data.mnemonic };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-private-keys', async (_event, password: string, index: number) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');
    const data = StorageService.loadWallet(password);
    const storedAcc = data.accounts[index];

    if (storedAcc?.accountType === 'just_view') {
      return { success: true, keys: [] };
    }

    if (storedAcc?.accountType === 'from_key') {
      return {
        success: true,
        keys: [{ chain: storedAcc.chain, symbol: storedAcc.symbol, privateKey: storedAcc.privateKey }],
      };
    }

    const keys = WalletService.deriveAllPrivateKeys(data.mnemonic, index);
    return { success: true, keys };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:change-password', async (_event, currentPassword: string, newPassword: string) => {
  try {
    const { StorageService } = require('./services/StorageService');
    const data = StorageService.loadWallet(currentPassword);
    StorageService.saveWallet(newPassword, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:reset', async (_event, password: string) => {
  try {
    const { StorageService } = require('./services/StorageService');

    // Verify password first
    StorageService.loadWallet(password);

    // Delete the wallet file
    StorageService.deleteWallet();

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:import', async (_event, mnemonic: string, password: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');

    const wallet = WalletService.importWallet(mnemonic.trim());
    const multiAccount = WalletService.deriveMultiChainAccount(wallet.mnemonic, 0);

    StorageService.saveWallet(password, {
      mnemonic: wallet.mnemonic,
      accounts: [{ index: 0, name: 'Account 1', address: multiAccount.address }]
    });

    return {
      success: true,
      accounts: [{
        index: 0,
        name: 'Account 1',
        address: multiAccount.address,
        addresses: multiAccount.addresses,
        accountType: 'from_seed' as const,
      }]
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// --- Import Private Key Account ---
ipcMain.handle('wallet:add-imported-account', async (_event, password: string, chain: string, symbol: string, privateKey: string, name?: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');

    // Validate and derive address from private key
    const address = WalletService.addressFromPrivateKey(chain, privateKey);

    const data = StorageService.loadWallet(password);
    const nextIndex = data.accounts.length;
    const chainNames: Record<string, string> = { ethereum: 'Ethereum', bitcoin: 'Bitcoin', solana: 'Solana', litecoin: 'Litecoin', dogecoin: 'Dogecoin' };
    const accName = name || `${chainNames[chain] || chain} ${nextIndex + 1}`;

    data.accounts.push({
      index: nextIndex,
      name: accName,
      address,
      accountType: 'from_key',
      chain,
      symbol,
      privateKey,
    });

    StorageService.saveWallet(password, data);

    return {
      success: true,
      account: {
        index: nextIndex,
        name: accName,
        address,
        accountType: 'from_key' as const,
        singleChain: chain,
        singleSymbol: symbol,
        addresses: [{ chain, symbol, name: chainNames[chain] || chain, address }],
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// --- Watch Address Account ---
ipcMain.handle('wallet:add-watch-account', async (_event, password: string, chain: string, symbol: string, publicAddress: string, name?: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const { StorageService } = require('./services/StorageService');

    // Validate address format
    if (!WalletService.isValidChainAddress(chain, publicAddress)) {
      throw new Error('Invalid address for ' + chain);
    }

    const data = StorageService.loadWallet(password);
    const nextIndex = data.accounts.length;
    const chainNames: Record<string, string> = { ethereum: 'Ethereum', bitcoin: 'Bitcoin', solana: 'Solana', litecoin: 'Litecoin', dogecoin: 'Dogecoin' };
    const accName = name || `Watch ${chainNames[chain] || chain} ${nextIndex + 1}`;

    data.accounts.push({
      index: nextIndex,
      name: accName,
      address: publicAddress,
      accountType: 'just_view',
      chain,
      symbol,
    });

    StorageService.saveWallet(password, data);

    return {
      success: true,
      account: {
        index: nextIndex,
        name: accName,
        address: publicAddress,
        accountType: 'just_view' as const,
        singleChain: chain,
        singleSymbol: symbol,
        addresses: [{ chain, symbol, name: chainNames[chain] || chain, address: publicAddress }],
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

/* ============================================================
   Transaction Detail
   ============================================================ */

ipcMain.handle('wallet:get-transaction-detail', async (_event: any, chain: string, hash: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const detail = await WalletService.getTransactionDetail(chain, hash);
    return { success: true, detail };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('shell:open-external', async (_event: any, url: string) => {
  // Only allow known explorer URLs for security
  const allowedPrefixes = [
    'https://etherscan.io/',
    'https://solscan.io/',
    'https://mempool.space/',
    'https://live.blockcypher.com/',
    'https://eth.blockscout.com/',
    'https://btcscan.org/',
    'https://litecoinspace.org/',
    'https://blockexplorer.one/',
    'https://blockchair.com/',
  ];
  if (allowedPrefixes.some(p => url.startsWith(p))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'URL not allowed' };
});

/* ============================================================
   Token List & Prices
   ============================================================ */

ipcMain.handle('wallet:get-token-list', async () => {
  try {
    const { WalletService } = require('./services/WalletService');
    const data = await WalletService.getTokenList();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-token-balances', async (_event: any, chain: string, address: string, currency: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const tokens = await WalletService.getTokenBalances(chain, address, currency);
    return { success: true, tokens };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:get-prices', async (_event: any, currency: string) => {
  try {
    const { WalletService } = require('./services/WalletService');
    const prices = await WalletService.getPrices(currency);
    return { success: true, prices };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('wallet:clear-price-caches', async () => {
  try {
    const { WalletService } = require('./services/WalletService');
    WalletService.clearPriceCaches();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});
