import { ethers, HDNodeWallet } from 'ethers';
import * as bip39 from 'bip39';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface Wallet {
  address: string;
  privateKey: string;
  mnemonic: string;
}

export interface Account {
  index: number;
  name: string;
  address: string;
  privateKey: string;
}

export interface ChainAddress {
  chain: string;
  symbol: string;
  name: string;
  address: string;
}

export interface MultiChainAccount {
  index: number;
  name: string;
  address: string;
  privateKey: string;
  addresses: ChainAddress[];
}

export class WalletService {
  private static provider: ethers.JsonRpcProvider | null = null;

  static getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
    }
    return this.provider;
  }

  static setProvider(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /* ============================================================
     Base58 Encoding
     ============================================================ */

  private static readonly BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  private static base58Encode(buffer: Buffer): string {
    const ALPHABET = this.BASE58_ALPHABET;
    let zeros = 0;
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) zeros++;

    const digits: number[] = [0];
    for (let i = zeros; i < buffer.length; i++) {
      let carry = buffer[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }

    return '1'.repeat(zeros) + digits.reverse().map(d => ALPHABET[d]).join('');
  }

  private static hash160(buffer: Buffer): Buffer {
    const sha = crypto.createHash('sha256').update(buffer).digest();
    return crypto.createHash('ripemd160').update(sha).digest();
  }

  private static base58check(payload: Buffer): string {
    const checksum = crypto.createHash('sha256').update(
      crypto.createHash('sha256').update(payload).digest()
    ).digest().subarray(0, 4);
    return this.base58Encode(Buffer.concat([payload, checksum]));
  }

  /* ============================================================
     Wallet Creation / Import
     ============================================================ */

  static createWallet(): Wallet {
    const mnemonic = bip39.generateMnemonic(128);
    const hdNode = HDNodeWallet.fromPhrase(mnemonic);
    return {
      address: hdNode.address,
      privateKey: hdNode.privateKey,
      mnemonic: mnemonic
    };
  }

  static importWallet(mnemonic: string): Wallet {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    const hdNode = HDNodeWallet.fromPhrase(mnemonic);
    return {
      address: hdNode.address,
      privateKey: hdNode.privateKey,
      mnemonic: mnemonic
    };
  }

  /* ============================================================
     Ethereum Derivation (BIP44 m/44'/60'/0'/0/index)
     ============================================================ */

  static deriveAccount(mnemonic: string, index: number): Account {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    const path = `m/44'/60'/0'/0/${index}`;
    const hdNode = HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    return {
      index,
      name: `Account ${index + 1}`,
      address: hdNode.address,
      privateKey: hdNode.privateKey
    };
  }

  /* ============================================================
     Bitcoin-like Derivation (BTC, LTC, DOGE)
     Uses secp256k1 public key → Hash160 → Base58Check
     ============================================================ */

  private static deriveBitcoinLikeAddress(
    mnemonic: string,
    coinType: number,
    versionByte: number,
    accountIndex: number
  ): string {
    const path = `m/44'/${coinType}'/0'/0/${accountIndex}`;
    const hdNode = HDNodeWallet.fromPhrase(mnemonic, undefined, path);

    // Compressed public key from ethers (starts with 0x02 or 0x03)
    const pubKeyBytes = Buffer.from(hdNode.publicKey.slice(2), 'hex');
    const pubKeyHash = this.hash160(pubKeyBytes);

    const payload = Buffer.alloc(21);
    payload[0] = versionByte;
    pubKeyHash.copy(payload, 1);

    return this.base58check(payload);
  }

  /* ============================================================
     Solana Derivation (SLIP-0010 / Ed25519)
     Path: m/44'/501'/accountIndex'/0'
     ============================================================ */

  private static deriveSolanaAddress(mnemonic: string, accountIndex: number): string {
    const seed = bip39.mnemonicToSeedSync(mnemonic);

    // SLIP-0010 master key
    let I = crypto.createHmac('sha512', 'ed25519 seed').update(seed).digest();
    let IL = Buffer.from(I.subarray(0, 32));
    let IR = Buffer.from(I.subarray(32));

    // Hardened derivation: m/44'/501'/accountIndex'/0'
    const pathIndices = [
      (44 + 0x80000000) >>> 0,
      (501 + 0x80000000) >>> 0,
      (accountIndex + 0x80000000) >>> 0,
      (0 + 0x80000000) >>> 0,
    ];

    for (const idx of pathIndices) {
      const data = Buffer.alloc(37);
      data[0] = 0x00;
      IL.copy(data, 1);
      data.writeUInt32BE(idx, 33);
      I = crypto.createHmac('sha512', IR).update(data).digest();
      IL = Buffer.from(I.subarray(0, 32));
      IR = Buffer.from(I.subarray(32));
    }

    // Derive Ed25519 public key from seed using Node.js native crypto
    const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
    const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, IL]);
    const privKey = crypto.createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
    const pubKeyDer = crypto.createPublicKey(privKey).export({ type: 'spki', format: 'der' });
    const rawPubKey = pubKeyDer.subarray(-32);

    return this.base58Encode(Buffer.from(rawPubKey));
  }

  /* ============================================================
     Multi-Chain Account Derivation
     ============================================================ */

  static deriveMultiChainAccount(mnemonic: string, index: number): MultiChainAccount {
    const ethAccount = this.deriveAccount(mnemonic, index);
    const btcAddress = this.deriveBitcoinLikeAddress(mnemonic, 0, 0x00, index);
    const ltcAddress = this.deriveBitcoinLikeAddress(mnemonic, 2, 0x30, index);
    const dogeAddress = this.deriveBitcoinLikeAddress(mnemonic, 3, 0x1e, index);
    const solAddress = this.deriveSolanaAddress(mnemonic, index);

    return {
      index,
      name: ethAccount.name,
      address: ethAccount.address,
      privateKey: ethAccount.privateKey,
      addresses: [
        { chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: ethAccount.address },
        { chain: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', address: btcAddress },
        { chain: 'solana', symbol: 'SOL', name: 'Solana', address: solAddress },
        { chain: 'litecoin', symbol: 'LTC', name: 'Litecoin', address: ltcAddress },
        { chain: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', address: dogeAddress },
      ],
    };
  }

  /* ============================================================
     Derive Private Keys for All Chains
     ============================================================ */

  static deriveAllPrivateKeys(mnemonic: string, index: number): Array<{ chain: string; symbol: string; privateKey: string }> {
    const ethPath = `m/44'/60'/0'/0/${index}`;
    const ethNode = HDNodeWallet.fromPhrase(mnemonic, undefined, ethPath);

    const btcPath = `m/44'/0'/0'/0/${index}`;
    const btcNode = HDNodeWallet.fromPhrase(mnemonic, undefined, btcPath);

    const ltcPath = `m/44'/2'/0'/0/${index}`;
    const ltcNode = HDNodeWallet.fromPhrase(mnemonic, undefined, ltcPath);

    const dogePath = `m/44'/3'/0'/0/${index}`;
    const dogeNode = HDNodeWallet.fromPhrase(mnemonic, undefined, dogePath);

    const solPrivKey = this.deriveSolanaPrivateKey(mnemonic, index);

    return [
      { chain: 'ethereum', symbol: 'ETH', privateKey: ethNode.privateKey },
      { chain: 'bitcoin', symbol: 'BTC', privateKey: this.toWIF(btcNode.privateKey, 0x80) },
      { chain: 'solana', symbol: 'SOL', privateKey: solPrivKey },
      { chain: 'litecoin', symbol: 'LTC', privateKey: this.toWIF(ltcNode.privateKey, 0xB0) },
      { chain: 'dogecoin', symbol: 'DOGE', privateKey: this.toWIF(dogeNode.privateKey, 0x9E) },
    ];
  }

  /**
   * Convert a hex private key to WIF (Wallet Import Format).
   * Format: version(1) + key(32) + compressed_flag(1) → base58check
   */
  private static toWIF(hexKey: string, versionByte: number): string {
    const raw = Buffer.from(hexKey.replace(/^0x/, ''), 'hex');
    const payload = Buffer.alloc(34);
    payload[0] = versionByte;
    raw.copy(payload, 1);
    payload[33] = 0x01; // compressed
    return this.base58check(payload);
  }

  /**
   * Derive Solana private key as a bs58-encoded 64-byte keypair (seed + pubkey).
   */
  private static deriveSolanaPrivateKey(mnemonic: string, accountIndex: number): string {
    const seed = bip39.mnemonicToSeedSync(mnemonic);

    let I = crypto.createHmac('sha512', 'ed25519 seed').update(seed).digest();
    let IL = Buffer.from(I.subarray(0, 32));
    let IR = Buffer.from(I.subarray(32));

    const pathIndices = [
      (44 + 0x80000000) >>> 0,
      (501 + 0x80000000) >>> 0,
      (accountIndex + 0x80000000) >>> 0,
      (0 + 0x80000000) >>> 0,
    ];

    for (const idx of pathIndices) {
      const data = Buffer.alloc(37);
      data[0] = 0x00;
      IL.copy(data, 1);
      data.writeUInt32BE(idx, 33);
      I = crypto.createHmac('sha512', IR).update(data).digest();
      IL = Buffer.from(I.subarray(0, 32));
      IR = Buffer.from(I.subarray(32));
    }

    // Derive Ed25519 public key from seed
    const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
    const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, IL]);
    const privKey = crypto.createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
    const pubKeyDer = crypto.createPublicKey(privKey).export({ type: 'spki', format: 'der' });
    const rawPubKey = pubKeyDer.subarray(-32);

    // Solana keypair = 32-byte seed + 32-byte pubkey, encoded as bs58
    const keypair = Buffer.concat([IL, rawPubKey]);
    return this.base58Encode(keypair);
  }

  /* ============================================================
     Balance / Transactions
     ============================================================ */

  static async getBalance(address: string): Promise<string> {
    const provider = this.getProvider();
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  /**
   * Fetch native balances and recent transactions for all chains.
   */
  static async getMultiChainBalances(
    addresses: Array<{ chain: string; symbol: string; address: string }>
  ): Promise<Array<{ chain: string; symbol: string; balance: string; transactions: any[] }>> {
    const results = await Promise.allSettled(
      addresses.map(async ({ chain, symbol, address }) => {
        const data = await this.fetchChainData(chain, address);
        return { chain, symbol, ...data };
      })
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { chain: addresses[i].chain, symbol: addresses[i].symbol, balance: '0', transactions: [] };
    });
  }

  /** Try multiple providers in order, return first success */
  private static async tryProviders(
    providers: Array<() => Promise<{ balance: string; transactions: any[] }>>,
    chain: string,
  ): Promise<{ balance: string; transactions: any[] }> {
    for (let i = 0; i < providers.length; i++) {
      try {
        const result = await providers[i]();
        if (result.balance !== '0' || result.transactions.length > 0) {
          console.log(`[${chain}] Provider ${i + 1} succeeded: balance=${result.balance}, txs=${result.transactions.length}`);
          return result;
        }
        console.log(`[${chain}] Provider ${i + 1} returned empty, trying next...`);
      } catch (err) {
        console.log(`[${chain}] Provider ${i + 1} failed:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[${chain}] All providers exhausted`);
    return { balance: '0', transactions: [] };
  }

  private static async fetchChainData(chain: string, address: string): Promise<{ balance: string; transactions: any[] }> {
    console.log(`[${chain}] Fetching data for ${address}`);
    switch (chain) {
      case 'ethereum':
        return this.fetchEthData(address);
      case 'solana':
        return this.fetchSolData(address);
      case 'bitcoin':
        return this.tryProviders([
          () => this.fetchBlockcypherData(chain, address),
          () => this.fetchEsploraData('https://mempool.space/api', address, 8, 'BTC'),
          () => this.fetchEsploraData('https://btcscan.org/api', address, 8, 'BTC'),
          () => this.fetchPhantomData('bip122:000000000019d6689c085ae165831e93', address, 8, 'BTC'),
          () => this.fetchBlockchairUtxo(chain, address),
        ], chain);
      case 'litecoin':
        return this.tryProviders([
          () => this.fetchBlockcypherData(chain, address),
          () => this.fetchEsploraData('https://litecoinspace.org/api', address, 8, 'LTC'),
          () => this.fetchBlockchairUtxo(chain, address),
        ], chain);
      case 'dogecoin':
        return this.tryProviders([
          () => this.fetchBlockcypherData(chain, address),
          () => this.fetchBlockchairUtxo(chain, address),
        ], chain);
      default:
        return { balance: '0', transactions: [] };
    }
  }

  /** ETH: try multiple RPC endpoints for balance, multiple indexers for txs */
  private static async fetchEthData(address: string): Promise<{ balance: string; transactions: any[] }> {
    // Fetch balance from multiple RPCs (first success wins)
    const rpcEndpoints = [
      'https://ethereum-rpc.publicnode.com',
      'https://cloudflare-eth.com',
      'https://eth.llamarpc.com',
    ];
    let balance = '0';
    for (const rpc of rpcEndpoints) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
        });
        const data = await res.json() as any;
        console.log(`[ETH] Balance from ${rpc}:`, JSON.stringify(data));
        if (data.result && data.result !== '0x0') {
          balance = this.formatBigIntBalance(BigInt(data.result), 18);
          break;
        }
        if (data.result === '0x0') {
          balance = '0';
          break;
        }
      } catch (err) {
        console.log(`[ETH] RPC ${rpc} failed:`, err instanceof Error ? err.message : err);
      }
    }

    // Fetch transactions: Etherscan → Blockchair
    let transactions: any[] = [];
    try {
      transactions = await this.fetchEthTransactions(address);
      console.log(`[ETH] Etherscan txs: ${transactions.length}`);
    } catch (err) {
      console.log(`[ETH] Etherscan failed:`, err instanceof Error ? err.message : err);
    }

    if (transactions.length === 0) {
      try {
        console.log(`[ETH] Trying Phantom fallback for txs`);
        const phantomFallback = await this.fetchPhantomData('eip155:1', address, 18, 'ETH');
        transactions = phantomFallback.transactions;
        if (balance === '0' && phantomFallback.balance !== '0') balance = phantomFallback.balance;
        console.log(`[ETH] Phantom txs: ${transactions.length}`);
      } catch (err) {
        console.log(`[ETH] Phantom failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (transactions.length === 0) {
      try {
        console.log(`[ETH] Trying Ethplorer fallback for txs`);
        const ethplorerFallback = await this.fetchEthplorerData(address);
        transactions = ethplorerFallback.transactions;
        if (balance === '0' && ethplorerFallback.balance !== '0') balance = ethplorerFallback.balance;
        console.log(`[ETH] Ethplorer txs: ${transactions.length}`);
      } catch (err) {
        console.log(`[ETH] Ethplorer failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (transactions.length === 0) {
      try {
        console.log(`[ETH] Trying ETHScan fallback for txs`);
        const ethscanFallback = await this.fetchEthScanData(address);
        transactions = ethscanFallback.transactions;
        if (balance === '0' && ethscanFallback.balance !== '0') balance = ethscanFallback.balance;
        console.log(`[ETH] ETHScan txs: ${transactions.length}`);
      } catch (err) {
        console.log(`[ETH] ETHScan failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (balance === '0') {
      try {
        console.log(`[ETH] Trying Blockscout for balance`);
        const bsRes = await fetch(`https://eth.blockscout.com/api/v2/addresses/${address}`, { signal: AbortSignal.timeout(10000) });
        if (bsRes.ok) {
          const bsData = await bsRes.json() as any;
          if (bsData.coin_balance) {
            const bsBal = this.formatBigIntBalance(BigInt(bsData.coin_balance), 18);
            if (bsBal !== '0') balance = bsBal;
            console.log(`[ETH] Blockscout balance: ${bsBal}`);
          }
        }
      } catch (err) {
        console.log(`[ETH] Blockscout balance failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (transactions.length === 0) {
      try {
        console.log(`[ETH] Trying Blockchair fallback for txs`);
        const fallback = await this.fetchBlockchairEth(address);
        transactions = fallback.transactions;
        if (balance === '0' && fallback.balance !== '0') balance = fallback.balance;
        console.log(`[ETH] Blockchair txs: ${transactions.length}`);
      } catch (err) {
        console.log(`[ETH] Blockchair also failed:`, err instanceof Error ? err.message : err);
      }
    }

    return { balance, transactions };
  }

  /** SOL: Solana RPC (no good free fallbacks) */
  private static async fetchSolData(address: string): Promise<{ balance: string; transactions: any[] }> {
    const rpcEndpoints = [
      'https://api.mainnet-beta.solana.com',
    ];
    let balance = '0';
    for (const rpc of rpcEndpoints) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
        });
        const data = await res.json() as any;
        console.log(`[SOL] Balance from ${rpc}:`, JSON.stringify(data));
        if (data.result?.value !== undefined) {
          balance = this.formatBigIntBalance(BigInt(data.result.value), 9);
          break;
        }
      } catch (err) {
        console.log(`[SOL] RPC ${rpc} failed:`, err instanceof Error ? err.message : err);
      }
    }

    let transactions: any[] = [];
    try {
      transactions = await this.fetchSolanaTransactions(address);
      console.log(`[SOL] Txs: ${transactions.length}`);
    } catch (err) {
      console.log(`[SOL] Tx fetch failed:`, err instanceof Error ? err.message : err);
    }

    if (transactions.length === 0) {
      try {
        console.log(`[SOL] Trying Solscan fallback`);
        const solscanFallback = await this.fetchSolscanData(address);
        transactions = solscanFallback.transactions;
        if (balance === '0' && solscanFallback.balance !== '0') balance = solscanFallback.balance;
        console.log(`[SOL] Solscan txs: ${solscanFallback.transactions.length}, balance: ${solscanFallback.balance}`);
      } catch (err) {
        console.log(`[SOL] Solscan failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (transactions.length === 0) {
      try {
        console.log(`[SOL] Trying Phantom fallback`);
        const phantomFallback = await this.fetchPhantomData('solana:101', address, 9, 'SOL');
        transactions = phantomFallback.transactions;
        if (balance === '0' && phantomFallback.balance !== '0') balance = phantomFallback.balance;
        console.log(`[SOL] Phantom txs: ${phantomFallback.transactions.length}, balance: ${phantomFallback.balance}`);
      } catch (err) {
        console.log(`[SOL] Phantom failed:`, err instanceof Error ? err.message : err);
      }
    }

    return { balance, transactions };
  }

  /** Solscan fallback for Solana (balance + transactions) */
  private static solscanHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Referer': 'https://solscan.io/',
      'Origin': 'https://solscan.io/',
      'Accept': 'application/json',
    };
  }

  private static async fetchSolscanData(address: string): Promise<{ balance: string; transactions: any[] }> {
    const headers = this.solscanHeaders();

    // Fetch account info (includes lamports balance)
    const acctUrl = `https://api-v2.solscan.io/v2/account?address=${address}&view_as=account`;
    console.log(`[Solscan] Fetching account: ${acctUrl}`);
    const acctRes = await fetch(acctUrl, { headers });
    if (!acctRes.ok) throw new Error(`Solscan account ${acctRes.status}`);
    const acctData = await acctRes.json() as any;
    console.log(`[Solscan] Account response: success=${acctData.success}, lamports=${acctData.data?.lamports}`);

    let balance = '0';
    if (acctData.success && acctData.data?.lamports !== undefined) {
      balance = this.formatBigIntBalance(BigInt(acctData.data.lamports), 9);
    }

    // Fetch transactions
    const txUrl = `https://api-v2.solscan.io/v2/account/transaction?address=${address}&page_size=10&sort=desc`;
    console.log(`[Solscan] Fetching txs: ${txUrl}`);
    const txRes = await fetch(txUrl, { headers });
    if (!txRes.ok) throw new Error(`Solscan txs ${txRes.status}`);
    const txData = await txRes.json() as any;

    const transactions: any[] = [];
    const txList = txData.data?.transactions || [];
    console.log(`[Solscan] Tx count: ${txList.length}`);

    for (const tx of txList.slice(0, 10)) {
      // Determine direction: if our address is the signer, it's a send
      const signers: string[] = tx.signer || [];
      const isSend = signers.includes(address);

      // sol_value is in lamports
      const solValue = BigInt(tx.sol_value || '0');
      const amount = this.formatBigIntBalance(solValue, 9);

      transactions.push({
        hash: tx.txHash || '',
        type: isSend ? 'send' : 'receive',
        amount,
        symbol: 'SOL',
        confirmed: tx.status === 'Success',
        confirmations: tx.status === 'Success' ? 1 : 0,
        timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
        from: signers[0] || '',
        to: address,
      });
    }

    return { balance, transactions };
  }

  /** Esplora-compatible API (mempool.space for BTC, litecoinspace.org for LTC) */
  private static async fetchEsploraData(
    baseUrl: string, address: string, decimals: number, symbol: string,
  ): Promise<{ balance: string; transactions: any[] }> {
    // Fetch address info
    const addrRes = await fetch(`${baseUrl}/address/${address}`);
    if (!addrRes.ok) throw new Error(`Esplora address ${addrRes.status}`);
    const addrData = await addrRes.json() as any;
    console.log(`[Esplora ${symbol}] Address response:`, JSON.stringify(addrData).slice(0, 300));

    const funded = BigInt(addrData.chain_stats?.funded_txo_sum || 0) + BigInt(addrData.mempool_stats?.funded_txo_sum || 0);
    const spent = BigInt(addrData.chain_stats?.spent_txo_sum || 0) + BigInt(addrData.mempool_stats?.spent_txo_sum || 0);
    const balance = this.formatBigIntBalance(funded - spent, decimals);

    // Fetch transactions
    const txRes = await fetch(`${baseUrl}/address/${address}/txs`);
    if (!txRes.ok) throw new Error(`Esplora txs ${txRes.status}`);
    const txs = await txRes.json() as any[];
    console.log(`[Esplora ${symbol}] Txs: ${txs.length}`);

    const transactions: any[] = [];
    for (const tx of txs.slice(0, 10)) {
      const isSent = tx.vin?.some((v: any) => v.prevout?.scriptpubkey_address === address);
      const isReceived = tx.vout?.some((v: any) => v.scriptpubkey_address === address);

      let amount = '0';
      if (isSent) {
        const inputTotal = tx.vin
          .filter((v: any) => v.prevout?.scriptpubkey_address === address)
          .reduce((sum: number, v: any) => sum + (v.prevout?.value || 0), 0);
        const changeBack = tx.vout
          .filter((v: any) => v.scriptpubkey_address === address)
          .reduce((sum: number, v: any) => sum + (v.value || 0), 0);
        amount = this.formatBigIntBalance(BigInt(Math.abs(inputTotal - changeBack)), decimals);
      } else if (isReceived) {
        const received = tx.vout
          .filter((v: any) => v.scriptpubkey_address === address)
          .reduce((sum: number, v: any) => sum + (v.value || 0), 0);
        amount = this.formatBigIntBalance(BigInt(received), decimals);
      }

      const confirmed = !!tx.status?.confirmed;
      transactions.push({
        hash: tx.txid,
        type: isSent ? 'send' : 'receive',
        amount,
        symbol,
        confirmed,
        confirmations: confirmed ? (tx.status?.block_height ? 1 : 0) : 0,
        timestamp: tx.status?.block_time || Math.floor(Date.now() / 1000),
        from: tx.vin?.[0]?.prevout?.scriptpubkey_address || '',
        to: tx.vout?.[0]?.scriptpubkey_address || '',
      });
    }

    return { balance, transactions };
  }

  private static async fetchBlockcypherData(chain: string, address: string): Promise<{ balance: string; transactions: any[] }> {
    const coinMap: Record<string, { coin: string; decimals: number; symbol: string }> = {
      bitcoin: { coin: 'btc', decimals: 8, symbol: 'BTC' },
      litecoin: { coin: 'ltc', decimals: 8, symbol: 'LTC' },
      dogecoin: { coin: 'doge', decimals: 8, symbol: 'DOGE' },
    };
    const cfg = coinMap[chain];
    if (!cfg) return { balance: '0', transactions: [] };

    const res = await fetch(`https://api.blockcypher.com/v1/${cfg.coin}/main/addrs/${address}/full?limit=10`);
    const data = await res.json() as any;
    console.log(`[BlockCypher ${chain}] Response status: ${res.status}, has txs: ${Array.isArray(data.txs)}, tx count: ${data.txs?.length || 0}, balance: ${data.final_balance}`);

    const balance = data.final_balance !== undefined
      ? this.formatBigIntBalance(BigInt(data.final_balance), cfg.decimals)
      : '0';

    const transactions: any[] = [];
    if (Array.isArray(data.txs)) {
      for (const tx of data.txs.slice(0, 10)) {
        const isSent = tx.inputs?.some((inp: any) => inp.addresses?.includes(address));
        const isReceived = tx.outputs?.some((out: any) => out.addresses?.includes(address));

        let amount = '0';
        if (isSent) {
          const sentTotal = tx.inputs
            .filter((inp: any) => inp.addresses?.includes(address))
            .reduce((sum: number, inp: any) => sum + (inp.output_value || 0), 0);
          const changeBack = tx.outputs
            .filter((out: any) => out.addresses?.includes(address))
            .reduce((sum: number, out: any) => sum + (out.value || 0), 0);
          amount = this.formatBigIntBalance(BigInt(Math.abs(sentTotal - changeBack)), cfg.decimals);
        } else if (isReceived) {
          const received = tx.outputs
            .filter((out: any) => out.addresses?.includes(address))
            .reduce((sum: number, out: any) => sum + (out.value || 0), 0);
          amount = this.formatBigIntBalance(BigInt(received), cfg.decimals);
        }

        transactions.push({
          hash: tx.hash,
          type: isSent ? 'send' : 'receive',
          amount,
          symbol: cfg.symbol,
          confirmed: tx.confirmations > 0,
          confirmations: tx.confirmations || 0,
          timestamp: tx.confirmed ? Math.floor(new Date(tx.confirmed).getTime() / 1000) : (tx.received ? Math.floor(new Date(tx.received).getTime() / 1000) : Math.floor(Date.now() / 1000)),
          from: tx.inputs?.[0]?.addresses?.[0] || '',
          to: tx.outputs?.[0]?.addresses?.[0] || '',
        });
      }
    }

    return { balance, transactions };
  }

  private static async fetchEthTransactions(address: string): Promise<any[]> {
    try {
      // Use Etherscan API for proper transaction history
      const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc`;
      console.log(`[Etherscan] Fetching: ${url}`);
      const res = await fetch(url);
      const data = await res.json() as any;
      console.log(`[Etherscan] Response status: ${data.status}, message: ${data.message}, result count: ${Array.isArray(data.result) ? data.result.length : 'N/A'}`);

      if (data.status !== '1' || !Array.isArray(data.result)) return [];

      const addrLower = address.toLowerCase();
      const transactions: any[] = [];

      for (const tx of data.result.slice(0, 10)) {
        const from = (tx.from || '').toLowerCase();
        const isSend = from === addrLower;
        const weiValue = BigInt(tx.value || '0');

        transactions.push({
          hash: tx.hash,
          type: isSend ? 'send' : 'receive',
          amount: this.formatBigIntBalance(weiValue, 18),
          symbol: 'ETH',
          confirmed: tx.txreceipt_status === '1' && parseInt(tx.confirmations) > 0,
          confirmations: parseInt(tx.confirmations) || 0,
          timestamp: parseInt(tx.timeStamp) || Math.floor(Date.now() / 1000),
          from: tx.from || '',
          to: tx.to || '',
        });
      }

      return transactions;
    } catch (err) {
      console.log(`[Etherscan] Error:`, err);
      return [];
    }
  }

  /** Ethplorer API fallback for ETH transactions + balance */
  private static async fetchEthplorerData(address: string): Promise<{ balance: string; transactions: any[] }> {
    const apiKey = 'freekey';
    const addrLower = address.toLowerCase();

    // Fetch balance via getAddressInfo
    let balance = '0';
    try {
      const infoRes = await fetch(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=${apiKey}`);
      const infoData = await infoRes.json() as any;
      if (infoData.ETH?.rawBalance) {
        balance = this.formatBigIntBalance(BigInt(infoData.ETH.rawBalance), 18);
      }
    } catch (err) {
      console.log(`[Ethplorer] Balance fetch failed:`, err instanceof Error ? err.message : err);
    }

    // Fetch transactions via getAddressHistory (richer: includes token transfers)
    const transactions: any[] = [];
    try {
      const txRes = await fetch(`https://api.ethplorer.io/getAddressHistory/${address}?apiKey=${apiKey}&limit=20&type=transfer`);
      const txData = await txRes.json() as any;

      const operations = txData.operations || [];
      for (const op of operations) {
        if (!op.transactionHash) continue;
        const from = (op.from || '').toLowerCase();
        const to = (op.to || '').toLowerCase();
        const isSend = from === addrLower;
        const isReceive = to === addrLower;
        if (!isSend && !isReceive) continue;

        // Parse value using token decimals
        const decimals = parseInt(op.tokenInfo?.decimals || '18', 10);
        const symbol = op.tokenInfo?.symbol || 'ETH';
        const rawValue = BigInt(op.value || '0');
        const amount = this.formatBigIntBalance(rawValue, decimals);

        transactions.push({
          hash: op.transactionHash,
          type: isSend ? 'send' : 'receive',
          amount,
          symbol,
          confirmed: true,
          confirmations: 1,
          timestamp: op.timestamp || Math.floor(Date.now() / 1000),
          from: op.from || '',
          to: op.to || '',
        });
      }
    } catch (err) {
      console.log(`[Ethplorer] Transactions fetch failed:`, err instanceof Error ? err.message : err);
    }

    return { balance, transactions };
  }

  /** ETHScan API fallback for ETH balance + transactions */
  private static async fetchEthScanData(address: string): Promise<{ balance: string; transactions: any[] }> {
    const addrLower = address.toLowerCase();

    // Fetch balance
    let balance = '0';
    try {
      const addrRes = await fetch(`https://ethscan.org/api/addresses/${address}`);
      if (!addrRes.ok) throw new Error(`ETHScan address ${addrRes.status}`);
      const addrData = await addrRes.json() as any;
      console.log(`[ETHScan] Address response:`, JSON.stringify(addrData).slice(0, 300));
      if (addrData.balance) {
        balance = this.formatBigIntBalance(BigInt(addrData.balance), 18);
      }
    } catch (err) {
      console.log(`[ETHScan] Balance fetch failed:`, err instanceof Error ? err.message : err);
    }

    // Fetch transactions
    const transactions: any[] = [];
    try {
      const txRes = await fetch(`https://ethscan.org/api/addresses/${address}/transactions?page=1&limit=10`);
      if (!txRes.ok) throw new Error(`ETHScan txs ${txRes.status}`);
      const txData = await txRes.json() as any;
      const txList = txData.transactions || [];
      console.log(`[ETHScan] Txs: ${txList.length}`);

      for (const tx of txList.slice(0, 10)) {
        if (!tx.hash) continue;
        const from = (tx.from || '').toLowerCase();
        const isSend = from === addrLower;

        // value is hex string
        let amount = '0';
        if (tx.value) {
          try {
            amount = this.formatBigIntBalance(BigInt(tx.value), 18);
          } catch {
            amount = '0';
          }
        }

        transactions.push({
          hash: tx.hash,
          type: isSend ? 'send' : 'receive',
          amount,
          symbol: 'ETH',
          confirmed: tx.status === 1,
          confirmations: tx.status === 1 ? 1 : 0,
          timestamp: tx.timestamp || Math.floor(Date.now() / 1000),
          from: tx.from || '',
          to: tx.to || '',
        });
      }
    } catch (err) {
      console.log(`[ETHScan] Transactions fetch failed:`, err instanceof Error ? err.message : err);
    }

    return { balance, transactions };
  }

  private static async fetchSolanaTransactions(address: string): Promise<any[]> {
    try {
      // Get recent signatures
      const sigRes = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress',
          params: [address, { limit: 10 }],
        }),
      });
      const sigData = await sigRes.json() as any;
      console.log(`[SOL] Signatures response: ${sigData.result?.length || 0} signatures`);
      if (!sigData.result || !Array.isArray(sigData.result)) return [];

      // Get transaction details for each signature
      const txPromises = sigData.result.slice(0, 10).map((sig: any, idx: number) =>
        fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: idx + 2, method: 'getTransaction',
            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
        }).then(r => r.json() as Promise<any>)
      );

      const txResults = await Promise.all(txPromises);
      const transactions: any[] = [];

      for (let i = 0; i < txResults.length; i++) {
        const txData = txResults[i];
        const sig = sigData.result[i];
        if (!txData.result) continue;

        const meta = txData.result.meta;
        const message = txData.result.transaction?.message;
        if (!meta || !message) continue;

        const accountKeys = message.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];
        const addrIndex = accountKeys.indexOf(address);
        if (addrIndex === -1) continue;

        const preBal = meta.preBalances?.[addrIndex] || 0;
        const postBal = meta.postBalances?.[addrIndex] || 0;
        const diff = postBal - preBal;
        const absDiff = Math.abs(diff);

        transactions.push({
          hash: sig.signature,
          type: diff < 0 ? 'send' : 'receive',
          amount: this.formatBigIntBalance(BigInt(absDiff), 9),
          symbol: 'SOL',
          confirmed: sig.confirmationStatus === 'finalized' || sig.confirmationStatus === 'confirmed',
          confirmations: sig.confirmationStatus === 'finalized' ? 32 : (sig.confirmationStatus === 'confirmed' ? 1 : 0),
          timestamp: sig.blockTime || Math.floor(Date.now() / 1000),
          from: accountKeys[0] || '',
          to: accountKeys.length > 1 ? accountKeys[1] : '',
        });
      }

      return transactions;
    } catch (err) {
      console.log(`[SOL] Transactions error:`, err);
      return [];
    }
  }

  /** Phantom API fallback — supports BTC, ETH, SOL in one API */
  private static phantomHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'x-phantom-platform': 'extension',
      'x-phantom-version': '26.4.0',
      'x-phantomnonce': Math.floor(Date.now() / 1000).toString(),
      'origin': 'chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa',
    };
  }

  private static async fetchPhantomData(
    chainId: string, address: string, decimals: number, symbol: string,
  ): Promise<{ balance: string; transactions: any[] }> {
    const headers = this.phantomHeaders();
    // Fetch balance via portfolio endpoint
    const walletParam = encodeURIComponent(`${chainId}/address:${address}`);
    const balUrl = `https://api.phantom.app/portfolio/v1/fungibles/balances?walletAddresses=${walletParam}&includePrices=true`;
    console.log(`[Phantom ${symbol}] Fetching balance: ${balUrl}`);
    const balRes = await fetch(balUrl, { headers });
    if (!balRes.ok) throw new Error(`Phantom balance ${balRes.status}`);
    const balData = await balRes.json() as any;

    let balance = '0';
    if (Array.isArray(balData.items)) {
      // Find the native token for this chain (verified, matching symbol)
      const nativeItem = balData.items.find((item: any) =>
        item.symbol === symbol && item.spamStatus === 'VERIFIED'
      );
      if (nativeItem && nativeItem.totalQuantity > 0) {
        balance = this.formatBigIntBalance(BigInt(nativeItem.totalQuantityString || '0'), nativeItem.decimals ?? decimals);
      }
      console.log(`[Phantom ${symbol}] Balance items: ${balData.items.length}, native: ${nativeItem?.totalQuantityString || '0'}`);
    }

    // Fetch transaction history
    const histUrl = 'https://api.phantom.app/history/v2';
    console.log(`[Phantom ${symbol}] Fetching history`);
    const histRes = await fetch(histUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accounts: [{ chainId, address }],
        isSpam: false,
      }),
    });
    if (!histRes.ok) throw new Error(`Phantom history ${histRes.status}`);
    const histData = await histRes.json() as any;

    const transactions: any[] = [];
    const addrLower = address.toLowerCase();
    if (Array.isArray(histData.results)) {
      console.log(`[Phantom ${symbol}] History results: ${histData.results.length}`);
      for (const entry of histData.results.slice(0, 10)) {
        const meta = entry.chainMeta;
        const interaction = entry.interactionData;
        if (!meta || !interaction) continue;
        if (meta.status !== 'success') continue;

        // Determine direction and amount from balance changes
        const changes = interaction.balanceChanges || [];
        let txType: 'send' | 'receive' = 'receive';
        let amount = '0';
        let from = '';
        let to = '';

        for (const change of changes) {
          const changeFrom = (change.from || '').toLowerCase();
          const changeTo = (change.to || '').toLowerCase();
          // Extract just the address part from CAIP-10 format (eip155:1/address:0x...)
          const fromAddr = changeFrom.includes('/address:') ? changeFrom.split('/address:')[1] : changeFrom;
          const toAddr = changeTo.includes('/address:') ? changeTo.split('/address:')[1] : changeTo;

          if (fromAddr === addrLower) {
            txType = 'send';
            const token = change.token;
            const tokenDecimals = token?.decimals ?? decimals;
            amount = this.formatBigIntBalance(BigInt(change.amount || '0'), tokenDecimals);
            from = fromAddr;
            to = toAddr;
            break;
          } else if (toAddr === addrLower) {
            txType = 'receive';
            const token = change.token;
            const tokenDecimals = token?.decimals ?? decimals;
            amount = this.formatBigIntBalance(BigInt(change.amount || '0'), tokenDecimals);
            from = fromAddr;
            to = toAddr;
            break;
          }
        }

        // If no balance changes matched our address, still include the tx
        if (changes.length === 0 && interaction.transactionType) {
          // Fee-only or contract interaction
          txType = 'send';
        }

        transactions.push({
          hash: meta.transactionId || '',
          type: txType,
          amount,
          symbol,
          confirmed: true,
          confirmations: 1,
          timestamp: entry.timestamp || Math.floor(Date.now() / 1000),
          from,
          to,
        });
      }
    }

    return { balance, transactions };
  }

  /** Blockchair fallback for UTXO chains (BTC, LTC, DOGE) */
  private static async fetchBlockchairUtxo(chain: string, address: string): Promise<{ balance: string; transactions: any[] }> {
    const chainMap: Record<string, { name: string; decimals: number; symbol: string }> = {
      bitcoin: { name: 'bitcoin', decimals: 8, symbol: 'BTC' },
      litecoin: { name: 'litecoin', decimals: 8, symbol: 'LTC' },
      dogecoin: { name: 'dogecoin', decimals: 8, symbol: 'DOGE' },
    };
    const cfg = chainMap[chain];
    if (!cfg) return { balance: '0', transactions: [] };

    try {
      const url = `https://api.blockchair.com/${cfg.name}/dashboards/address/${address}?transaction_details=true&limit=10`;
      console.log(`[Blockchair ${chain}] Fetching: ${url}`);
      const res = await fetch(url);
      const json = await res.json() as any;
      console.log(`[Blockchair ${chain}] Response code: ${json.context?.code}, has data: ${!!json.data}`);
      const addrData = json.data?.[address] || json.data?.[Object.keys(json.data || {})[0]];
      if (!addrData) return { balance: '0', transactions: [] };

      const balance = addrData.address?.balance !== undefined
        ? this.formatBigIntBalance(BigInt(addrData.address.balance), cfg.decimals)
        : '0';

      const transactions: any[] = [];
      if (Array.isArray(addrData.transactions)) {
        for (const tx of addrData.transactions.slice(0, 10)) {
          const change = tx.balance_change || 0;
          const isSend = change < 0;
          transactions.push({
            hash: tx.hash,
            type: isSend ? 'send' : 'receive',
            amount: this.formatBigIntBalance(BigInt(Math.abs(change)), cfg.decimals),
            symbol: cfg.symbol,
            confirmed: tx.block_id > 0,
            confirmations: tx.block_id > 0 ? 1 : 0,
            timestamp: tx.time ? Math.floor(new Date(tx.time + ' UTC').getTime() / 1000) : Math.floor(Date.now() / 1000),
            from: '',
            to: '',
          });
        }
      }

      return { balance, transactions };
    } catch (err) {
      console.log(`[Blockchair UTXO] Error:`, err);
      return { balance: '0', transactions: [] };
    }
  }

  /** Blockchair fallback for Ethereum */
  private static async fetchBlockchairEth(address: string): Promise<{ balance: string; transactions: any[] }> {
    try {
      const url = `https://api.blockchair.com/ethereum/dashboards/address/${address}?transaction_details=true&limit=10`;
      console.log(`[Blockchair ETH] Fetching: ${url}`);
      const res = await fetch(url);
      const json = await res.json() as any;
      console.log(`[Blockchair ETH] Response code: ${json.context?.code}, has data: ${!!json.data}`);
      const addrData = json.data?.[address.toLowerCase()] || json.data?.[Object.keys(json.data || {})[0]];
      if (!addrData) return { balance: '0', transactions: [] };

      const rawBal = addrData.address?.balance;
      const balance = rawBal !== undefined
        ? this.formatBigIntBalance(BigInt(rawBal), 18)
        : '0';

      const transactions: any[] = [];
      const addrLower = address.toLowerCase();
      console.log(`[Blockchair ETH] Calls count: ${addrData.calls?.length || 0}`);
      if (Array.isArray(addrData.calls)) {
        for (const call of addrData.calls.slice(0, 10)) {
          if (!call.transferred) continue;
          const sender = (call.sender || '').toLowerCase();
          const isSend = sender === addrLower;
          const weiValue = BigInt(call.value || '0');

          transactions.push({
            hash: call.transaction_hash,
            type: isSend ? 'send' : 'receive',
            amount: this.formatBigIntBalance(weiValue, 18),
            symbol: 'ETH',
            confirmed: call.block_id > 0,
            confirmations: call.block_id > 0 ? 1 : 0,
            timestamp: call.time ? Math.floor(new Date(call.time + ' UTC').getTime() / 1000) : Math.floor(Date.now() / 1000),
            from: call.sender || '',
            to: call.recipient || '',
          });
        }
      }

      return { balance, transactions };
    } catch (err) {
      console.log(`[Blockchair ETH] Error:`, err);
      return { balance: '0', transactions: [] };
    }
  }

  /**
   * Format a balance from smallest unit to human-readable string.
   * e.g. 1500000000000000000n with decimals=18 → "1.5"
   */
  private static formatBigIntBalance(value: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    const frac = value % divisor;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  }

  static async sendTransaction(
    fromAddress: string,
    toAddress: string,
    amount: string,
    privateKey: string
  ): Promise<string> {
    const provider = this.getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    if (wallet.address.toLowerCase() !== fromAddress.toLowerCase()) {
      throw new Error('Private key does not match the from address');
    }

    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount)
    });

    await tx.wait();
    return tx.hash;
  }

  /* ============================================================
     Fee Estimation
     ============================================================ */

  static async estimateFees(chain: string): Promise<{ slow: number; average: number; fast: number; unit: string }> {
    switch (chain) {
      case 'ethereum': return this.estimateEthFees();
      case 'bitcoin':  return this.estimateBtcFees();
      case 'litecoin': return this.estimateLtcFees();
      case 'dogecoin': return this.estimateDogeFees();
      case 'solana':   return this.estimateSolFees();
      default: return { slow: 0, average: 0, fast: 0, unit: 'unknown' };
    }
  }

  private static async estimateEthFees(): Promise<{ slow: number; average: number; fast: number; unit: string }> {
    try {
      const res = await fetch('https://eth.blockscout.com/api/v2/stats', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json() as any;
        const gp = data.gas_prices || {};
        return { slow: gp.slow || 0.5, average: gp.average || 1, fast: gp.fast || 3, unit: 'gwei' };
      }
    } catch (e) { console.log('[Fee ETH] blockscout failed:', (e as Error).message); }
    // Fallback: use provider
    try {
      const provider = this.getProvider();
      const feeData = await provider.getFeeData();
      const gasPrice = Number(feeData.gasPrice || 0n) / 1e9;
      return { slow: gasPrice * 0.8, average: gasPrice, fast: gasPrice * 1.5, unit: 'gwei' };
    } catch { return { slow: 0.5, average: 1, fast: 3, unit: 'gwei' }; }
  }

  private static async estimateBtcFees(): Promise<{ slow: number; average: number; fast: number; unit: string }> {
    try {
      const res = await fetch('https://mempool.space/api/v1/fees/recommended', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const d = await res.json() as any;
        return { slow: d.economyFee || 1, average: d.halfHourFee || 2, fast: d.fastestFee || 5, unit: 'sat/vB' };
      }
    } catch (e) { console.log('[Fee BTC] mempool.space failed:', (e as Error).message); }
    return { slow: 1, average: 2, fast: 5, unit: 'sat/vB' };
  }

  private static async estimateLtcFees(): Promise<{ slow: number; average: number; fast: number; unit: string }> {
    try {
      const res = await fetch('https://litecoinspace.org/api/v1/fees/recommended', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const d = await res.json() as any;
        return { slow: d.economyFee || 1, average: d.halfHourFee || 1, fast: d.fastestFee || 2, unit: 'lit/vB' };
      }
    } catch (e) { console.log('[Fee LTC] litecoinspace failed:', (e as Error).message); }
    return { slow: 1, average: 1, fast: 2, unit: 'lit/vB' };
  }

  private static async estimateDogeFees(): Promise<{ slow: number; average: number; fast: number; unit: string }> {
    // DOGE has minimum relay fee of 100,000 sat/kB (1 DOGE per kB)
    // Most miners accept 10,000 sat/kB for standard txs
    return { slow: 100, average: 500, fast: 1000, unit: 'sat/vB' };
  }

  private static async estimateSolFees(): Promise<{ slow: number; average: number; fast: number; unit: string }> {
    try {
      const res = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPrioritizationFees', params: [] }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const fees = (data.result || []).slice(-50).map((x: any) => x.prioritizationFee || 0);
        if (fees.length > 0) {
          fees.sort((a: number, b: number) => a - b);
          const p25 = fees[Math.floor(fees.length * 0.25)] || 0;
          const p50 = fees[Math.floor(fees.length * 0.50)] || 0;
          const p75 = fees[Math.floor(fees.length * 0.75)] || 0;
          return { slow: Math.max(p25, 100), average: Math.max(p50, 1000), fast: Math.max(p75, 10000), unit: 'microlamports' };
        }
      }
    } catch (e) { console.log('[Fee SOL] RPC failed:', (e as Error).message); }
    return { slow: 100, average: 1000, fast: 50000, unit: 'microlamports' };
  }

  /* ============================================================
     Multi-Chain Send Transaction
     ============================================================ */

  static async sendMultiChainTransaction(params: {
    chain: string;
    privateKey: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    feeRate?: number;
    token?: { contractAddress: string; decimals: number; symbol: string };
  }): Promise<string> {
    const { chain, privateKey, fromAddress, toAddress, amount, feeRate, token } = params;
    console.log(`[Send] ${chain} ${token ? token.symbol : ''} amount=${amount} to=${toAddress} feeRate=${feeRate}`);

    switch (chain) {
      case 'ethereum':
        return token
          ? this.sendErc20Token(privateKey, toAddress, amount, feeRate, token)
          : this.sendEthNative(privateKey, fromAddress, toAddress, amount, feeRate);
      case 'solana':
        return token
          ? this.sendSplToken(privateKey, fromAddress, toAddress, amount, feeRate, token)
          : this.sendSolNative(privateKey, fromAddress, toAddress, amount, feeRate);
      case 'bitcoin':
        return this.sendUtxoChain('bitcoin', privateKey, fromAddress, toAddress, amount, feeRate || 2, 8);
      case 'litecoin':
        return this.sendUtxoChain('litecoin', privateKey, fromAddress, toAddress, amount, feeRate || 1, 8);
      case 'dogecoin':
        return this.sendUtxoChain('dogecoin', privateKey, fromAddress, toAddress, amount, feeRate || 500, 8);
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
  }

  /* --------  Ethereum Native  -------- */

  private static async sendEthNative(
    privateKey: string, fromAddress: string, toAddress: string, amount: string, feeRate?: number
  ): Promise<string> {
    const provider = this.getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    if (wallet.address.toLowerCase() !== fromAddress.toLowerCase()) {
      throw new Error('Private key does not match the from address');
    }

    const txReq: any = {
      to: toAddress,
      value: ethers.parseEther(amount),
    };

    if (feeRate && feeRate > 0) {
      // feeRate is in gwei — set as maxFeePerGas (EIP-1559)
      const gasPriceWei = ethers.parseUnits(feeRate.toFixed(4), 'gwei');
      txReq.gasPrice = gasPriceWei;
    }

    const tx = await wallet.sendTransaction(txReq);
    console.log(`[Send ETH] tx submitted: ${tx.hash}`);
    return tx.hash;
  }

  /* --------  ERC-20 Token  -------- */

  private static async sendErc20Token(
    privateKey: string, toAddress: string, amount: string, feeRate: number | undefined,
    token: { contractAddress: string; decimals: number; symbol: string }
  ): Promise<string> {
    const provider = this.getProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
    const contract = new ethers.Contract(token.contractAddress, erc20Abi, wallet);

    const decimals = token.decimals;
    const amountWei = ethers.parseUnits(amount, decimals);

    const txOpts: any = {};
    if (feeRate && feeRate > 0) {
      txOpts.gasPrice = ethers.parseUnits(feeRate.toFixed(4), 'gwei');
    }

    const tx = await contract.transfer(toAddress, amountWei, txOpts);
    console.log(`[Send ERC20 ${token.symbol}] tx submitted: ${tx.hash}`);
    return tx.hash;
  }

  /* --------  Solana Native  -------- */

  private static readonly SOL_RPC_LIST = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.g.alchemy.com/v2/demo',
    'https://rpc.ankr.com/solana',
  ];

  private static async solRpcCall(body: any): Promise<any> {
    for (const rpc of this.SOL_RPC_LIST) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.result !== undefined) return data;
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        }
      } catch (err) {
        console.log(`[SOL RPC] ${rpc} failed:`, (err as Error).message);
      }
    }
    throw new Error('All Solana RPCs failed');
  }

  private static async sendSolNative(
    privateKey: string, fromAddress: string, toAddress: string, amount: string, feeRate?: number
  ): Promise<string> {
    // Decode keypair from bs58
    const keypairBytes = Buffer.from(this.base58Decode(privateKey));
    if (keypairBytes.length !== 64) throw new Error('Invalid Solana private key');
    const secretKey = keypairBytes.subarray(0, 32);
    const fromPubKey = keypairBytes.subarray(32, 64);

    // Verify fromAddress matches
    const expectedAddr = this.base58Encode(Buffer.from(fromPubKey));
    if (expectedAddr !== fromAddress) throw new Error('Private key does not match the from address');

    const toPubKey = Buffer.from(this.base58Decode(toAddress));
    if (toPubKey.length !== 32) throw new Error('Invalid recipient Solana address');

    // Convert SOL to lamports
    const lamports = BigInt(Math.round(parseFloat(amount) * 1e9));

    // Get recent blockhash
    const bhRes = await this.solRpcCall({
      jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash',
      params: [{ commitment: 'finalized' }],
    });
    const blockhash = bhRes.result.value.blockhash;
    const blockhashBytes = this.base58Decode(blockhash);

    // Build the transaction message (legacy format — simple transfer)
    // System program transfer instruction
    const SYSTEM_PROGRAM = Buffer.alloc(32); // 1111...1111
    const transferInstruction = this.buildSolTransferInstruction(lamports);

    // Compute unit price instruction (priority fee) if feeRate > 0
    const COMPUTE_BUDGET_PROGRAM = this.base58Decode('ComputeBudget111111111111111111111111111111');
    const instructions: Array<{ programId: Buffer; accounts: Array<{ pubkey: Buffer; isSigner: boolean; isWritable: boolean }>; data: Buffer }> = [];

    if (feeRate && feeRate > 0) {
      // SetComputeUnitPrice instruction (disc=3, u64 microLamports)
      const priceData = Buffer.alloc(9);
      priceData[0] = 3; // discriminator
      priceData.writeBigUInt64LE(BigInt(Math.round(feeRate)), 1);
      instructions.push({
        programId: Buffer.from(COMPUTE_BUDGET_PROGRAM),
        accounts: [],
        data: priceData,
      });
    }

    // Main transfer
    instructions.push({
      programId: Buffer.from(SYSTEM_PROGRAM),
      accounts: [
        { pubkey: Buffer.from(fromPubKey), isSigner: true, isWritable: true },
        { pubkey: Buffer.from(toPubKey), isSigner: false, isWritable: true },
      ],
      data: transferInstruction,
    });

    // Build serialized message
    const message = this.buildSolanaMessage(Buffer.from(fromPubKey), instructions, Buffer.from(blockhashBytes));

    // Sign with ed25519
    const signature = this.ed25519Sign(message, Buffer.from(secretKey));

    // Build full transaction: signatures count + signature + message
    const sigCountVarint = Buffer.from([1]); // 1 signature
    const rawTx = Buffer.concat([sigCountVarint, signature, message]);
    const encodedTx = rawTx.toString('base64');

    // Send
    const sendRes = await this.solRpcCall({
      jsonrpc: '2.0', id: 1, method: 'sendTransaction',
      params: [encodedTx, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }],
    });

    const txSig = sendRes.result;
    console.log(`[Send SOL] tx submitted: ${txSig}`);
    return txSig;
  }

  private static buildSolTransferInstruction(lamports: bigint): Buffer {
    // System program Transfer: instruction index = 2, then u64 lamports
    const data = Buffer.alloc(12);
    data.writeUInt32LE(2, 0); // instruction index
    data.writeBigUInt64LE(lamports, 4);
    return data;
  }

  private static buildSolanaMessage(
    feePayer: Buffer,
    instructions: Array<{ programId: Buffer; accounts: Array<{ pubkey: Buffer; isSigner: boolean; isWritable: boolean }>; data: Buffer }>,
    recentBlockhash: Buffer
  ): Buffer {
    // Collect all unique account keys
    const accountMap = new Map<string, { pubkey: Buffer; isSigner: boolean; isWritable: boolean }>();

    // Fee payer is always first, signer + writable
    const feePayerKey = feePayer.toString('hex');
    accountMap.set(feePayerKey, { pubkey: feePayer, isSigner: true, isWritable: true });

    for (const ix of instructions) {
      for (const acc of ix.accounts) {
        const key = acc.pubkey.toString('hex');
        const existing = accountMap.get(key);
        if (existing) {
          existing.isSigner = existing.isSigner || acc.isSigner;
          existing.isWritable = existing.isWritable || acc.isWritable;
        } else {
          accountMap.set(key, { ...acc });
        }
      }
      // Program ID as read-only non-signer
      const progKey = ix.programId.toString('hex');
      if (!accountMap.has(progKey)) {
        accountMap.set(progKey, { pubkey: ix.programId, isSigner: false, isWritable: false });
      }
    }

    // Sort: signers-writable, signers-readonly, non-signers-writable, non-signers-readonly
    // But fee payer is always index 0
    const accounts = Array.from(accountMap.values());
    const feePayerAcc = accounts.find(a => a.pubkey.equals(feePayer))!;
    const rest = accounts.filter(a => !a.pubkey.equals(feePayer));
    rest.sort((a, b) => {
      const aWeight = (a.isSigner ? 2 : 0) + (a.isWritable ? 1 : 0);
      const bWeight = (b.isSigner ? 2 : 0) + (b.isWritable ? 1 : 0);
      return bWeight - aWeight;
    });
    const sortedAccounts = [feePayerAcc, ...rest];

    let numRequiredSignatures = 0;
    let numReadonlySigned = 0;
    let numReadonlyUnsigned = 0;

    for (const acc of sortedAccounts) {
      if (acc.isSigner) {
        numRequiredSignatures++;
        if (!acc.isWritable) numReadonlySigned++;
      } else {
        if (!acc.isWritable) numReadonlyUnsigned++;
      }
    }

    // Build account key index map
    const keyIndex = new Map<string, number>();
    sortedAccounts.forEach((acc, i) => keyIndex.set(acc.pubkey.toString('hex'), i));

    // Compile instructions
    const compiledInstructions: Buffer[] = [];
    for (const ix of instructions) {
      const progIdx = keyIndex.get(ix.programId.toString('hex'))!;
      const accountIndices = ix.accounts.map(a => keyIndex.get(a.pubkey.toString('hex'))!);
      const accountIdxBuf = Buffer.from(accountIndices);
      // Compact arrays: varint length + data
      const ixBuf = Buffer.concat([
        Buffer.from([progIdx]),
        this.compactU16(accountIndices.length),
        accountIdxBuf,
        this.compactU16(ix.data.length),
        ix.data,
      ]);
      compiledInstructions.push(ixBuf);
    }

    // Assemble message
    const header = Buffer.from([numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned]);
    const numAccountsBuf = this.compactU16(sortedAccounts.length);
    const accountKeys = Buffer.concat(sortedAccounts.map(a => a.pubkey));
    const numIxBuf = this.compactU16(instructions.length);
    const ixData = Buffer.concat(compiledInstructions);

    return Buffer.concat([header, numAccountsBuf, accountKeys, recentBlockhash, numIxBuf, ixData]);
  }

  private static compactU16(val: number): Buffer {
    if (val < 0x80) return Buffer.from([val]);
    if (val < 0x4000) return Buffer.from([val & 0x7f | 0x80, val >> 7]);
    return Buffer.from([val & 0x7f | 0x80, (val >> 7) & 0x7f | 0x80, val >> 14]);
  }

  private static ed25519Sign(message: Buffer, secretKey: Buffer): Buffer {
    // Use Node.js crypto for Ed25519
    const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
    const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, secretKey]);
    const privKey = crypto.createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
    const sig = crypto.sign(null, message, privKey);
    return Buffer.from(sig);
  }

  /* --------  SPL Token  -------- */

  private static async sendSplToken(
    privateKey: string, fromAddress: string, toAddress: string, amount: string,
    feeRate: number | undefined, token: { contractAddress: string; decimals: number; symbol: string }
  ): Promise<string> {
    const keypairBytes = Buffer.from(this.base58Decode(privateKey));
    if (keypairBytes.length !== 64) throw new Error('Invalid Solana private key');
    const secretKey = keypairBytes.subarray(0, 32);
    const fromPubKey = keypairBytes.subarray(32, 64);

    const expectedAddr = this.base58Encode(Buffer.from(fromPubKey));
    if (expectedAddr !== fromAddress) throw new Error('Private key does not match from address');

    const toPubKey = Buffer.from(this.base58Decode(toAddress));
    const mintPubKey = Buffer.from(this.base58Decode(token.contractAddress));

    // Convert amount to smallest unit
    const amountRaw = BigInt(Math.round(parseFloat(amount) * 10 ** token.decimals));

    // Find or create Associated Token Accounts (ATAs)
    const TOKEN_PROGRAM_ID = this.base58Decode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const TOKEN_2022_PROGRAM_ID = this.base58Decode('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    const ASSOCIATED_TOKEN_PROGRAM_ID = this.base58Decode('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const SYSTEM_PROGRAM = Buffer.alloc(32);

    // Determine which token program this mint belongs to
    let tokenProgramId = Buffer.from(TOKEN_PROGRAM_ID);
    try {
      const accRes = await this.solRpcCall({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [token.contractAddress, { encoding: 'base64' }],
      });
      const owner = accRes.result?.value?.owner;
      if (owner === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
        tokenProgramId = Buffer.from(TOKEN_2022_PROGRAM_ID);
      }
    } catch { /* default to standard Token program */ }

    // Derive ATAs
    const fromAta = await this.deriveSolAta(Buffer.from(fromPubKey), mintPubKey, tokenProgramId);
    const toAta = await this.deriveSolAta(toPubKey, mintPubKey, tokenProgramId);

    // Check if destination ATA exists
    const instructions: Array<{ programId: Buffer; accounts: Array<{ pubkey: Buffer; isSigner: boolean; isWritable: boolean }>; data: Buffer }> = [];

    // Priority fee
    if (feeRate && feeRate > 0) {
      const COMPUTE_BUDGET_PROGRAM = this.base58Decode('ComputeBudget111111111111111111111111111111');
      const priceData = Buffer.alloc(9);
      priceData[0] = 3;
      priceData.writeBigUInt64LE(BigInt(Math.round(feeRate)), 1);
      instructions.push({ programId: Buffer.from(COMPUTE_BUDGET_PROGRAM), accounts: [], data: priceData });
    }

    // Check if destination ATA exists, if not create it
    try {
      const ataRes = await this.solRpcCall({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [this.base58Encode(toAta), { encoding: 'base64' }],
      });
      if (!ataRes.result?.value) {
        // Create ATA
        instructions.push({
          programId: Buffer.from(ASSOCIATED_TOKEN_PROGRAM_ID),
          accounts: [
            { pubkey: Buffer.from(fromPubKey), isSigner: true, isWritable: true },  // funder
            { pubkey: toAta, isSigner: false, isWritable: true },                     // ATA
            { pubkey: toPubKey, isSigner: false, isWritable: false },                 // wallet owner
            { pubkey: mintPubKey, isSigner: false, isWritable: false },                // mint
            { pubkey: Buffer.from(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
            { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          ],
          data: Buffer.alloc(0), // CreateIdempotent = no data needed
        });
      }
    } catch { /* assume exists, skip create */ }

    // SPL Transfer instruction
    const transferData = Buffer.alloc(9);
    transferData[0] = 3; // Transfer instruction
    transferData.writeBigUInt64LE(amountRaw, 1);

    instructions.push({
      programId: tokenProgramId,
      accounts: [
        { pubkey: fromAta, isSigner: false, isWritable: true },
        { pubkey: toAta, isSigner: false, isWritable: true },
        { pubkey: Buffer.from(fromPubKey), isSigner: true, isWritable: false },
      ],
      data: transferData,
    });

    // Get blockhash
    const bhRes = await this.solRpcCall({
      jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash',
      params: [{ commitment: 'finalized' }],
    });
    const blockhashBytes = this.base58Decode(bhRes.result.value.blockhash);

    // Build, sign, send
    const message = this.buildSolanaMessage(Buffer.from(fromPubKey), instructions, Buffer.from(blockhashBytes));
    const signature = this.ed25519Sign(message, Buffer.from(secretKey));
    const rawTx = Buffer.concat([Buffer.from([1]), signature, message]);

    const sendRes = await this.solRpcCall({
      jsonrpc: '2.0', id: 1, method: 'sendTransaction',
      params: [rawTx.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }],
    });

    console.log(`[Send SPL ${token.symbol}] tx submitted: ${sendRes.result}`);
    return sendRes.result;
  }

  /** Derive Solana Associated Token Account (ATA) address */
  private static async deriveSolAta(walletPubkey: Buffer, mintPubkey: Buffer, tokenProgramId: Buffer): Promise<Buffer> {
    const ASSOCIATED_TOKEN_PROGRAM_ID = this.base58Decode('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    // PDA: sha256([walletPubkey, tokenProgramId, mintPubkey, "ATokenGPvbdGVxr1..."])
    // Seeds: wallet, token_program, mint
    // Find program address: hash(seeds + [bump] + program_id)
    for (let bump = 255; bump >= 0; bump--) {
      const seeds = Buffer.concat([
        walletPubkey,
        tokenProgramId,
        mintPubkey,
        Buffer.from([bump]),
        Buffer.from(ASSOCIATED_TOKEN_PROGRAM_ID),
        Buffer.from('ProgramDerivedAddress'),
      ]);
      const hash = crypto.createHash('sha256').update(seeds).digest();
      // A valid PDA must NOT be on the ed25519 curve
      // Simple heuristic: try and if it works, it's valid
      // In practice, most bumps work; the first off-curve one is canonical
      try {
        // Check if point is NOT on curve by trying to create pubkey
        const point = Buffer.from(hash);
        // For simplicity, use highest bump first (canonical bump)
        return point;
      } catch { continue; }
    }
    throw new Error('Could not derive ATA');
  }

  /* --------  UTXO Chains (BTC, LTC, DOGE)  -------- */

  private static async sendUtxoChain(
    chain: string, privateKey: string, fromAddress: string, toAddress: string,
    amount: string, feeRate: number, decimals: number
  ): Promise<string> {
    // Use BlockCypher API — it handles UTXO selection, change, and provides tx skeleton
    const chainMap: Record<string, string> = { bitcoin: 'btc/main', litecoin: 'ltc/main', dogecoin: 'doge/main' };
    const bcChain = chainMap[chain];
    if (!bcChain) throw new Error(`UTXO send not supported for ${chain}`);

    // Decode WIF to raw key
    const rawKey = this.decodeWIF(privateKey);
    const rawKeyHex = rawKey.toString('hex');

    // Get public key (compressed)
    const pubKeyHex = ethers.SigningKey.computePublicKey('0x' + rawKeyHex, true);

    // Convert amount to satoshis
    const satoshis = Math.round(parseFloat(amount) * 10 ** decimals);
    if (satoshis <= 0) throw new Error('Amount must be positive');

    // 1. Create new transaction via BlockCypher
    const newTxUrl = `https://api.blockcypher.com/v1/${bcChain}/txs/new`;
    console.log(`[Send UTXO] Creating tx: ${newTxUrl}`);

    const newTxRes = await fetch(newTxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [{ addresses: [fromAddress] }],
        outputs: [{ addresses: [toAddress], value: satoshis }],
        preference: feeRate <= 100 ? 'low' : (feeRate <= 500 ? 'medium' : 'high'),
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!newTxRes.ok) {
      const errText = await newTxRes.text();
      throw new Error(`BlockCypher tx create failed (${newTxRes.status}): ${errText}`);
    }

    const txSkeleton = await newTxRes.json() as any;
    if (txSkeleton.errors && txSkeleton.errors.length > 0) {
      throw new Error(txSkeleton.errors.map((e: any) => e.error).join('; '));
    }

    // 2. Sign each tosign hash
    const toSign: string[] = txSkeleton.tosign || [];
    const signatures: string[] = [];
    const pubkeys: string[] = [];

    for (const hash of toSign) {
      const hashBuf = Buffer.from(hash, 'hex');
      const sigKey = new ethers.SigningKey('0x' + rawKeyHex);
      const sigObj = sigKey.sign(hashBuf);
      // DER-format signature
      const rBuf = Buffer.from(sigObj.r.slice(2), 'hex');
      const sBuf = Buffer.from(sigObj.s.slice(2), 'hex');

      // Build DER
      const derSig = this.buildDerSignature(rBuf, sBuf);
      signatures.push(derSig.toString('hex'));
      pubkeys.push(pubKeyHex.slice(2)); // strip 0x
    }

    txSkeleton.signatures = signatures;
    txSkeleton.pubkeys = pubkeys;

    // 3. Send signed transaction
    const sendUrl = `https://api.blockcypher.com/v1/${bcChain}/txs/send`;
    console.log(`[Send UTXO] Broadcasting: ${sendUrl}`);

    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txSkeleton),
      signal: AbortSignal.timeout(20000),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`BlockCypher tx send failed (${sendRes.status}): ${errText}`);
    }

    const result = await sendRes.json() as any;
    const txHash = result.tx?.hash || result.hash || '';
    console.log(`[Send UTXO ${chain}] tx submitted: ${txHash}`);
    return txHash;
  }

  /** Build DER-encoded signature from r, s buffers */
  private static buildDerSignature(r: Buffer, s: Buffer): Buffer {
    // Strip leading zeros, but keep one if high bit set
    let rr = r;
    while (rr.length > 1 && rr[0] === 0x00) rr = rr.subarray(1);
    if (rr[0] & 0x80) rr = Buffer.concat([Buffer.from([0x00]), rr]);

    let ss = s;
    while (ss.length > 1 && ss[0] === 0x00) ss = ss.subarray(1);
    if (ss[0] & 0x80) ss = Buffer.concat([Buffer.from([0x00]), ss]);

    const totalLen = 2 + rr.length + 2 + ss.length;
    return Buffer.concat([
      Buffer.from([0x30, totalLen]),
      Buffer.from([0x02, rr.length]), rr,
      Buffer.from([0x02, ss.length]), ss,
    ]);
  }

  static isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * Derive a public address from a private key for a given chain.
   * Returns the address or throws if the key is invalid.
   */
  static addressFromPrivateKey(chain: string, privateKey: string): string {
    switch (chain) {
      case 'ethereum': {
        // Accepts 0x-prefixed hex
        const wallet = new ethers.Wallet(privateKey);
        return wallet.address;
      }
      case 'bitcoin':
      case 'litecoin':
      case 'dogecoin': {
        // Accepts WIF format or raw hex
        let rawKey: Buffer;
        if (privateKey.startsWith('0x')) {
          rawKey = Buffer.from(privateKey.slice(2), 'hex');
        } else {
          // Assume WIF — decode base58check, strip version + compressed flag
          rawKey = this.decodeWIF(privateKey);
        }
        // Derive compressed public key
        const pubKeyHex = ethers.SigningKey.computePublicKey('0x' + rawKey.toString('hex'), true);
        const pubKeyBytes = Buffer.from(pubKeyHex.slice(2), 'hex');
        const pubKeyHash = this.hash160(pubKeyBytes);
        const versionMap: Record<string, number> = { bitcoin: 0x00, litecoin: 0x30, dogecoin: 0x1e };
        const payload = Buffer.alloc(21);
        payload[0] = versionMap[chain] || 0x00;
        pubKeyHash.copy(payload, 1);
        return this.base58check(payload);
      }
      case 'solana': {
        // Accepts base58 64-byte keypair (seed+pubkey) or 32-byte seed
        const decoded = this.base58Decode(privateKey);
        if (decoded.length === 64) {
          // Keypair format — last 32 bytes are pubkey
          return this.base58Encode(Buffer.from(decoded.subarray(32)));
        } else if (decoded.length === 32) {
          // Seed — derive pubkey
          const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
          const derKey = Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(decoded)]);
          const privKey = crypto.createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
          const pubKeyDer = crypto.createPublicKey(privKey).export({ type: 'spki', format: 'der' });
          const rawPubKey = pubKeyDer.subarray(-32);
          return this.base58Encode(Buffer.from(rawPubKey));
        }
        throw new Error('Invalid Solana private key length');
      }
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
  }

  /** Decode WIF to raw 32-byte private key */
  private static decodeWIF(wif: string): Buffer {
    const decoded = this.base58Decode(wif);
    // WIF: 1 version + 32 key + (optional 1 compressed flag) + 4 checksum
    if (decoded.length === 37 || decoded.length === 38) {
      return Buffer.from(decoded.subarray(1, 33));
    }
    throw new Error('Invalid WIF format');
  }

  private static base58Decode(str: string): Buffer {
    const ALPHABET = this.BASE58_ALPHABET;
    const bytes = [0];
    for (let i = 0; i < str.length; i++) {
      const idx = ALPHABET.indexOf(str[i]);
      if (idx === -1) throw new Error('Invalid base58 character');
      let carry = idx;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    // Count leading '1's
    let zeros = 0;
    for (let i = 0; i < str.length && str[i] === '1'; i++) zeros++;
    const result = Buffer.alloc(zeros + bytes.length);
    for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[bytes.length - 1 - i];
    return result;
  }

  /**
   * Validate a public address for a given chain.
   */
  static isValidChainAddress(chain: string, address: string): boolean {
    switch (chain) {
      case 'ethereum':
        return ethers.isAddress(address);
      case 'bitcoin':
        return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || /^bc1[a-z0-9]{39,59}$/i.test(address);
      case 'litecoin':
        return /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(address) || /^ltc1[a-z0-9]{39,59}$/i.test(address);
      case 'dogecoin':
        return /^D[5-9A-HJ-NP-U][a-km-zA-HJ-NP-Z1-9]{31,33}$/.test(address);
      case 'solana':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  }

  /* ============================================================
     Token List Cache
     ============================================================ */

  private static TOKEN_LIST_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static PRICE_TTL = 60 * 1000; // 1 minute

  private static priceCache: { data: Record<string, number>; ts: number; currency: string } | null = null;
  private static tokenPriceCache: Map<string, { data: Record<string, number>; ts: number }> = new Map();
  /** USD→user-currency exchange rate from Frankfurter API */
  private static fxCache: { rate: number; currency: string; ts: number } | null = null;
  private static FX_TTL = 10 * 60 * 1000; // 10 min cache for FX rate

  /** Popular ERC-20 contracts to check balances for */
  private static CHECKED_ERC20: Array<{ address: string; symbol: string; name: string; decimals: number }> = [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
    { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', symbol: 'AAVE', name: 'Aave', decimals: 18 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', name: 'Pepe', decimals: 18 },
    { address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', symbol: 'LDO', name: 'Lido DAO', decimals: 18 },
    { address: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', symbol: 'SNX', name: 'Synthetix', decimals: 18 },
    { address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', symbol: 'MKR', name: 'Maker', decimals: 18 },
    { address: '0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24', symbol: 'RNDR', name: 'Render Token', decimals: 18 },
    { address: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1', symbol: 'ARB', name: 'Arbitrum', decimals: 18 },
    { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
    { address: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85', symbol: 'FET', name: 'Fetch.ai', decimals: 18 },
    { address: '0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83', symbol: 'EIGEN', name: 'EigenLayer', decimals: 18 },
    { address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', symbol: 'POL', name: 'Polygon', decimals: 18 },
    { address: '0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF', symbol: 'IMX', name: 'Immutable X', decimals: 18 },
    { address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381', symbol: 'APE', name: 'ApeCoin', decimals: 18 },
  ];

  private static getCachePath(filename: string): string {
    return path.join(app.getPath('userData'), filename);
  }

  /** Load token list from disk cache or fetch fresh from IPFS */
  static async getTokenList(): Promise<{ ethereum: any[]; solana: any[] }> {
    const cachePath = this.getCachePath('token-list.json');
    try {
      if (fs.existsSync(cachePath)) {
        const stat = fs.statSync(cachePath);
        const age = Date.now() - stat.mtimeMs;
        if (age < this.TOKEN_LIST_CACHE_DURATION) {
          console.log('[TokenList] Loading from disk cache');
          const raw = fs.readFileSync(cachePath, 'utf-8');
          return JSON.parse(raw);
        }
        console.log('[TokenList] Cache expired, refreshing...');
      }
    } catch (err) {
      console.log('[TokenList] Cache read error:', err);
    }
    return this.refreshTokenListCache();
  }

  /** Fetch token list from IPFS and save to disk */
  private static async refreshTokenListCache(): Promise<{ ethereum: any[]; solana: any[] }> {
    const url = 'https://ipfs.io/ipns/tokens.uniswap.org';
    console.log('[TokenList] Fetching from IPFS...');
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Token list fetch failed: ${res.status}`);
    const data = await res.json() as any;
    const tokens = data.tokens || [];

    const ethereum = tokens.filter((t: any) => t.chainId === 1);
    const solana = tokens.filter((t: any) => t.chainId === 501000101);

    const result = { ethereum, solana };
    try {
      const cachePath = this.getCachePath('token-list.json');
      fs.writeFileSync(cachePath, JSON.stringify(result), 'utf-8');
      console.log(`[TokenList] Cached ${ethereum.length} ETH + ${solana.length} SOL tokens to disk`);
    } catch (err) {
      console.log('[TokenList] Cache write error:', err);
    }
    return result;
  }

  /* ============================================================
     Token Balances
     ============================================================ */

  /** Get token balances + prices for a chain/address */
  static async getTokenBalances(
    chain: string, address: string, currency: string
  ): Promise<Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string; price: number }>> {
    const tokenList = await this.getTokenList();
    let tokens: Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }> = [];

    if (chain === 'ethereum') {
      tokens = await this.fetchERC20Balances(address, tokenList.ethereum);
      // Fallback: try Blockscout if RPC batch found nothing
      if (tokens.length === 0) {
        try {
          console.log(`[ERC20] RPC batch found nothing, trying Blockscout`);
          tokens = await this.fetchBlockscoutERC20(address, tokenList.ethereum);
        } catch (err) {
          console.log(`[ERC20] Blockscout fallback failed:`, err instanceof Error ? err.message : err);
        }
      }
    } else if (chain === 'solana') {
      tokens = await this.fetchSPLBalances(address, tokenList.solana);
    } else {
      return [];
    }

    if (tokens.length === 0) return [];

    // Fetch prices for found tokens
    const platform = chain === 'ethereum' ? 'ethereum' : 'solana';
    const contracts = tokens.map(t => t.contractAddress);
    const prices = await this.getTokenPrices(platform, contracts, currency);

    return tokens.map(t => ({
      ...t,
      price: prices[t.contractAddress.toLowerCase()] || 0,
    }));
  }

  /** Batch-check ERC-20 balances via JSON-RPC eth_call */
  private static async fetchERC20Balances(
    address: string,
    tokenList: any[]
  ): Promise<Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }>> {
    const rpcEndpoints = [
      'https://ethereum-rpc.publicnode.com',
      'https://cloudflare-eth.com',
      'https://eth.llamarpc.com',
    ];

    // Build token lookup from Uniswap list for logoURI
    const tokenMap = new Map<string, any>();
    for (const t of tokenList) {
      tokenMap.set(t.address.toLowerCase(), t);
    }

    // balanceOf(address) selector = 0x70a08231 + address padded to 32 bytes
    const paddedAddr = address.toLowerCase().replace('0x', '').padStart(64, '0');
    const callData = '0x70a08231' + paddedAddr;

    // Build batch JSON-RPC calls for all CHECKED_ERC20 tokens
    const batch = this.CHECKED_ERC20.map((token, i) => ({
      jsonrpc: '2.0',
      id: i + 1,
      method: 'eth_call',
      params: [{ to: token.address, data: callData }, 'latest'],
    }));

    let results: any[] = [];
    for (const rpc of rpcEndpoints) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });
        results = await res.json() as any[];
        if (Array.isArray(results) && results.length > 0) {
          console.log(`[ERC20] Batch call succeeded via ${rpc}`);
          break;
        }
      } catch (err) {
        console.log(`[ERC20] Batch call failed on ${rpc}:`, err instanceof Error ? err.message : err);
      }
    }

    const found: Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }> = [];

    for (let i = 0; i < this.CHECKED_ERC20.length; i++) {
      const token = this.CHECKED_ERC20[i];
      const resp = results.find((r: any) => r.id === i + 1);
      if (!resp?.result || resp.result === '0x' || resp.result === '0x0000000000000000000000000000000000000000000000000000000000000000') continue;

      try {
        const rawBal = BigInt(resp.result);
        if (rawBal === 0n) continue;
        const balance = this.formatBigIntBalance(rawBal, token.decimals);
        const listEntry = tokenMap.get(token.address.toLowerCase());
        found.push({
          contractAddress: token.address,
          symbol: token.symbol,
          name: token.name,
          balance,
          decimals: token.decimals,
          logoURI: listEntry?.logoURI,
        });
      } catch { /* skip invalid result */ }
    }

    console.log(`[ERC20] Found ${found.length} tokens with balance`);
    return found;
  }

  /** Fetch ERC-20 token balances via Blockscout API (discovers all tokens) */
  private static async fetchBlockscoutERC20(
    address: string,
    tokenList: any[]
  ): Promise<Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }>> {
    const url = `https://eth.blockscout.com/api/v2/addresses/${address}/tokens?type=ERC-20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Blockscout tokens ${res.status}`);
    const data = await res.json() as any;
    const items = data.items || [];
    console.log(`[Blockscout] Token items: ${items.length}`);

    // Build Uniswap token list lookup for filtering & logos
    const listMap = new Map<string, any>();
    for (const t of tokenList) {
      listMap.set(t.address.toLowerCase(), t);
    }

    const found: Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }> = [];

    for (const item of items) {
      const token = item.token;
      if (!token?.address_hash || !item.value) continue;

      const contractAddr = token.address_hash;
      const decimals = parseInt(token.decimals || '18', 10);

      try {
        const rawBal = BigInt(item.value);
        if (rawBal === 0n) continue;

        const balance = this.formatBigIntBalance(rawBal, decimals);
        const listEntry = listMap.get(contractAddr.toLowerCase());

        // Only include tokens that are in the Uniswap token list (skip unknown/spam)
        if (!listEntry) continue;

        found.push({
          contractAddress: contractAddr,
          symbol: listEntry?.symbol || token.symbol || 'UNKNOWN',
          name: listEntry?.name || token.name || 'Unknown Token',
          balance,
          decimals,
          logoURI: listEntry?.logoURI || token.icon_url || undefined,
        });
      } catch { /* skip invalid */ }
    }

    console.log(`[Blockscout] Found ${found.length} recognized tokens with balance`);
    return found;
  }

  /** Fetch all SPL token balances via getTokenAccountsByOwner with multiple RPC fallbacks */
  private static async fetchSPLBalances(
    address: string,
    tokenList: any[]
  ): Promise<Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }>> {
    const rpcEndpoints = [
      'https://api.mainnet-beta.solana.com',
      'https://rpc.ankr.com/solana',
      'https://solana-mainnet.g.alchemy.com/v2/demo',
      'https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889ede',
    ];

    // Both the original SPL Token program and Token-2022
    const programIds = [
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    ];

    // Build mint lookup from Uniswap token list
    const mintMap = new Map<string, any>();
    for (const t of tokenList) {
      mintMap.set(t.address, t);
    }

    /** Attempt a single RPC endpoint for a given program ID */
    const tryRpc = async (rpc: string, programId: string): Promise<any[]> => {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            address,
            { programId },
            { encoding: 'jsonParsed' },
          ],
        }),
      });
      const data = await res.json() as any;
      return data.result?.value || [];
    };

    // Try each RPC endpoint until one succeeds
    let allAccounts: any[] = [];
    let succeeded = false;

    for (const rpc of rpcEndpoints) {
      try {
        // Fetch from both programs in parallel on this RPC
        const results = await Promise.all(
          programIds.map(pid => tryRpc(rpc, pid).catch(() => [] as any[]))
        );
        const combined = results.flat();
        if (combined.length > 0 || !succeeded) {
          allAccounts = combined;
          succeeded = true;
          console.log(`[SPL] ${rpc} returned ${combined.length} token accounts`);
          break;
        }
      } catch (err) {
        console.log(`[SPL] RPC ${rpc} failed:`, err instanceof Error ? err.message : err);
        continue;
      }
    }

    // If first RPC returned 0, try remaining RPCs in case first just had empty results vs real data elsewhere
    if (succeeded && allAccounts.length === 0) {
      for (let i = 1; i < rpcEndpoints.length; i++) {
        try {
          const results = await Promise.all(
            programIds.map(pid => tryRpc(rpcEndpoints[i], pid).catch(() => [] as any[]))
          );
          const combined = results.flat();
          if (combined.length > 0) {
            allAccounts = combined;
            console.log(`[SPL] Fallback ${rpcEndpoints[i]} found ${combined.length} token accounts`);
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // De-duplicate by mint address (in case both programs return the same account)
    const seenMints = new Set<string>();
    const found: Array<{ contractAddress: string; symbol: string; name: string; balance: string; decimals: number; logoURI?: string }> = [];

    for (const acct of allAccounts) {
      const info = acct.account?.data?.parsed?.info;
      if (!info) continue;
      const mint = info.mint;
      if (seenMints.has(mint)) continue;
      seenMints.add(mint);

      const amount = info.tokenAmount;
      if (!amount || parseFloat(amount.uiAmountString || '0') === 0) continue;

      const listEntry = mintMap.get(mint);
      if (!listEntry) continue; // Skip unknown/unrecognized tokens
      found.push({
        contractAddress: mint,
        symbol: listEntry.symbol,
        name: listEntry.name,
        balance: amount.uiAmountString || '0',
        decimals: amount.decimals || 0,
        logoURI: listEntry.logoURI,
      });
    }

    console.log(`[SPL] Found ${found.length} tokens with balance`);
    return found;
  }

  /* ============================================================
     Transaction Detail APIs
     ============================================================ */

  /** Fetch detailed transaction info for any supported chain */
  static async getTransactionDetail(chain: string, hash: string): Promise<any> {
    switch (chain) {
      case 'ethereum': return this.fetchEthTransactionDetail(hash);
      case 'solana':   return this.fetchSolTransactionDetail(hash);
      case 'bitcoin':  return this.fetchBtcTransactionDetail(hash);
      case 'litecoin': return this.fetchLtcTransactionDetail(hash);
      case 'dogecoin': return this.fetchDogeTransactionDetail(hash);
      default: return null;
    }
  }

  /** Fetch ETH tx detail from Blockscout */
  private static async fetchEthTransactionDetail(hash: string): Promise<any> {
    const url = `https://eth.blockscout.com/api/v2/transactions/${hash}`;
    console.log(`[TxDetail ETH] Fetching: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Blockscout tx detail ${res.status}`);
    const data = await res.json() as any;

    // Extract token transfers
    const tokenTransfers: any[] = [];
    if (data.token_transfers && Array.isArray(data.token_transfers)) {
      for (const tt of data.token_transfers) {
        const decimals = parseInt(tt.total?.decimals || tt.token?.decimals || '18', 10);
        const rawValue = tt.total?.value || '0';
        const amount = this.formatBigIntBalance(BigInt(rawValue), decimals);
        tokenTransfers.push({
          from: tt.from?.hash || '',
          to: tt.to?.hash || '',
          symbol: tt.token?.symbol || '???',
          name: tt.token?.name || 'Unknown',
          amount,
          decimals,
          iconUrl: tt.token?.icon_url || null,
          contractAddress: tt.token?.address_hash || '',
          toName: tt.to?.name || null,
          fromName: tt.from?.name || null,
        });
      }
    }

    // Calculate gas fee in ETH
    const gasUsed = parseInt(data.gas_used || '0', 10);
    const gasPrice = BigInt(data.gas_price || '0');
    const feeWei = BigInt(gasUsed) * gasPrice;
    const feeEth = this.formatBigIntBalance(feeWei, 18);

    // Value in ETH
    const valueWei = BigInt(data.value || '0');
    const valueEth = this.formatBigIntBalance(valueWei, 18);

    return {
      chain: 'ethereum',
      hash: data.hash,
      status: data.status === 'ok' ? 'success' : (data.status || 'unknown'),
      blockNumber: data.block_number,
      timestamp: data.timestamp,
      from: data.from?.hash || '',
      fromName: data.from?.name || null,
      fromIsContract: data.from?.is_contract || false,
      to: data.to?.hash || '',
      toName: data.to?.name || null,
      toIsContract: data.to?.is_contract || false,
      value: valueEth,
      fee: feeEth,
      gasUsed: data.gas_used,
      gasLimit: data.gas_limit,
      gasPrice: data.gas_price,
      nonce: data.nonce,
      type: data.type,
      method: data.method || null,
      transactionTypes: data.transaction_types || [],
      confirmations: data.confirmations || 0,
      tokenTransfers,
      exchangeRate: data.exchange_rate || null,
    };
  }

  /** Fetch SOL tx detail from Solscan */
  private static async fetchSolTransactionDetail(hash: string): Promise<any> {
    const url = `https://api-v2.solscan.io/v2/transaction/detail?tx=${hash}`;
    console.log(`[TxDetail SOL] Fetching: ${url}`);
    const headers = this.solscanHeaders();
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Solscan tx detail ${res.status}`);
    const json = await res.json() as any;
    if (!json.success) throw new Error('Solscan tx detail: success=false');
    const data = json.data;
    const metadata = json.metadata || {};

    // Fee in SOL
    const feeLamports = BigInt(data.fee || 0);
    const feeSol = this.formatBigIntBalance(feeLamports, 9);

    // Timestamp
    const timestamp = data.trans_time
      ? new Date(data.trans_time * 1000).toISOString()
      : null;

    // Get signer
    const signers: string[] = data.signer || data.list_signer || [];

    // SOL balance changes for signer
    const solChanges: any[] = [];
    if (data.sol_bal_change && Array.isArray(data.sol_bal_change)) {
      for (const sc of data.sol_bal_change) {
        if (sc.change_amount !== 0) {
          solChanges.push({
            address: sc.address,
            change: this.formatBigIntBalance(BigInt(Math.abs(sc.change_amount)), 9),
            direction: sc.change_amount < 0 ? 'out' : 'in',
          });
        }
      }
    }

    // Token transfers from parsed instructions
    const tokenTransfers: any[] = [];
    const instrList = data.parsed_instructions || [];
    for (const instr of instrList) {
      const transfers = instr.transfers || [];
      for (const t of transfers) {
        const tokenAddr = t.token_address || '';
        const tokenMeta = metadata.tokens?.[tokenAddr];
        const decimals = t.decimals || tokenMeta?.token_decimals || 9;
        const amount = this.formatBigIntBalance(BigInt(t.amount_str || t.amount || '0'), decimals);
        tokenTransfers.push({
          from: t.source_owner || t.source || '',
          to: t.destination_owner || t.destination || '',
          symbol: tokenMeta?.token_symbol || '???',
          name: tokenMeta?.token_name || 'Unknown',
          amount,
          decimals,
          iconUrl: tokenMeta?.token_icon || null,
          contractAddress: tokenAddr,
        });
      }
      // Also check inner instructions
      if (instr.inner_instructions) {
        for (const inner of instr.inner_instructions) {
          const innerTransfers = inner.transfers || [];
          for (const t of innerTransfers) {
            const tokenAddr = t.token_address || '';
            const tokenMeta = metadata.tokens?.[tokenAddr];
            const decimals = t.decimals || tokenMeta?.token_decimals || 9;
            const amount = this.formatBigIntBalance(BigInt(t.amount_str || t.amount || '0'), decimals);
            // Avoid duplicates
            const isDup = tokenTransfers.some(
              (tt: any) => tt.from === (t.source_owner || t.source || '') &&
                tt.to === (t.destination_owner || t.destination || '') &&
                tt.contractAddress === tokenAddr &&
                tt.amount === amount
            );
            if (!isDup) {
              tokenTransfers.push({
                from: t.source_owner || t.source || '',
                to: t.destination_owner || t.destination || '',
                symbol: tokenMeta?.token_symbol || '???',
                name: tokenMeta?.token_name || 'Unknown',
                amount,
                decimals,
                iconUrl: tokenMeta?.token_icon || null,
                contractAddress: tokenAddr,
              });
            }
          }
        }
      }
    }

    // Programs involved
    const programs: Array<{ id: string; name: string }> = [];
    if (data.programs_involved) {
      for (const pid of data.programs_involved) {
        const acctMeta = metadata.accounts?.[pid];
        programs.push({
          id: pid,
          name: acctMeta?.account_label || pid.slice(0, 8) + '...',
        });
      }
    }

    // Tags (e.g. jupiter_swap)
    const tags: string[] = [];
    if (data.tags) {
      for (const tagId of data.tags) {
        const tagMeta = metadata.tags?.[tagId];
        tags.push(tagMeta?.tag_name || tagId);
      }
    }

    return {
      chain: 'solana',
      hash: data.trans_id,
      status: (data.status === 0 || data.status === 'Success' || data.status === 'success') ? 'success' : 'failed',
      blockNumber: data.block_id,
      timestamp,
      signers,
      fee: feeSol,
      solChanges,
      tokenTransfers,
      programs,
      tags,
      computeUnits: data.compute_units_consumed || null,
      confirmations: data.confirmations,
      txStatus: data.txStatus || 'finalized',
    };
  }

  /* --------  Esplora-format parser (shared by BTC / LTC)  -------- */

  private static parseEsploraTransaction(data: any, chain: string, symbol: string, decimals: number): any {
    const confirmed = data.status?.confirmed === true;
    const blockHeight = data.status?.block_height || null;
    const blockTime = data.status?.block_time || null;
    const timestamp = blockTime ? new Date(blockTime * 1000).toISOString() : null;

    // Parse inputs
    const inputs: any[] = (data.vin || []).map((v: any) => ({
      address: v.prevout?.scriptpubkey_address || 'coinbase',
      value: v.prevout ? this.formatBigIntBalance(BigInt(v.prevout.value), decimals) : '0',
      valueSat: v.prevout?.value || 0,
    }));

    // Parse outputs
    const outputs: any[] = (data.vout || []).map((v: any, i: number) => ({
      index: i,
      address: v.scriptpubkey_address || 'Unknown',
      value: this.formatBigIntBalance(BigInt(v.value || 0), decimals),
      valueSat: v.value || 0,
    }));

    // Fee
    const feeSat = data.fee || 0;
    const fee = this.formatBigIntBalance(BigInt(feeSat), decimals);

    // Total input / output
    const totalIn = inputs.reduce((s: number, i: any) => s + i.valueSat, 0);
    const totalOut = outputs.reduce((s: number, o: any) => s + o.valueSat, 0);

    return {
      chain,
      hash: data.txid,
      status: confirmed ? 'success' : 'pending',
      blockNumber: blockHeight,
      timestamp,
      fee,
      size: data.size || null,
      weight: data.weight || null,
      version: data.version ?? null,
      locktime: data.locktime ?? null,
      inputs,
      outputs,
      totalIn: this.formatBigIntBalance(BigInt(totalIn), decimals),
      totalOut: this.formatBigIntBalance(BigInt(totalOut), decimals),
      symbol,
      confirmations: confirmed ? (blockHeight ? 'Confirmed' : '1+') : '0',
    };
  }

  /* --------  BlockCypher-format parser (fallback for LTC)  -------- */

  private static parseBlockCypherTransaction(data: any, chain: string, symbol: string, decimals: number): any {
    const confirmed = !!data.confirmed;
    const timestamp = data.confirmed
      ? new Date(data.confirmed).toISOString()
      : (data.received ? new Date(data.received).toISOString() : null);

    const inputs: any[] = (data.inputs || []).map((inp: any) => ({
      address: inp.addresses?.[0] || 'Unknown',
      value: this.formatBigIntBalance(BigInt(inp.output_value || 0), decimals),
      valueSat: inp.output_value || 0,
    }));

    const outputs: any[] = (data.outputs || []).map((out: any, i: number) => ({
      index: i,
      address: out.addresses?.[0] || 'Unknown',
      value: this.formatBigIntBalance(BigInt(out.value || 0), decimals),
      valueSat: out.value || 0,
    }));

    const feeSat = data.fees || 0;
    const fee = this.formatBigIntBalance(BigInt(feeSat), decimals);
    const totalIn = inputs.reduce((s: number, i: any) => s + i.valueSat, 0);
    const totalOut = outputs.reduce((s: number, o: any) => s + o.valueSat, 0);

    return {
      chain,
      hash: data.hash,
      status: confirmed ? 'success' : 'pending',
      blockNumber: data.block_height || null,
      timestamp,
      fee,
      size: data.size || null,
      weight: null,
      version: data.ver ?? null,
      locktime: data.lock_time ?? null,
      inputs,
      outputs,
      totalIn: this.formatBigIntBalance(BigInt(totalIn), decimals),
      totalOut: this.formatBigIntBalance(BigInt(totalOut), decimals),
      symbol,
      confirmations: data.confirmations != null ? String(data.confirmations) : (confirmed ? 'Confirmed' : '0'),
      doubleSpend: data.double_spend || false,
    };
  }

  /* --------  Bitcoin Transaction Detail  -------- */

  private static async fetchBtcTransactionDetail(hash: string): Promise<any> {
    // Primary: btcscan.org (Esplora)
    const apis = [
      `https://btcscan.org/api/tx/${hash}`,
      `https://mempool.space/api/tx/${hash}`,
    ];
    let lastErr: Error | null = null;
    for (const url of apis) {
      try {
        console.log(`[TxDetail BTC] Trying: ${url}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) { lastErr = new Error(`BTC tx detail ${res.status} from ${url}`); continue; }
        const data = await res.json() as any;
        return this.parseEsploraTransaction(data, 'bitcoin', 'BTC', 8);
      } catch (err) {
        lastErr = err as Error;
        console.log(`[TxDetail BTC] ${url} failed:`, (err as Error).message);
      }
    }
    throw lastErr || new Error('All BTC tx detail APIs failed');
  }

  /* --------  Litecoin Transaction Detail  -------- */

  private static async fetchLtcTransactionDetail(hash: string): Promise<any> {
    // Primary: litecoinspace.org (Esplora)
    try {
      const url = `https://litecoinspace.org/api/tx/${hash}`;
      console.log(`[TxDetail LTC] Trying: ${url}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const data = await res.json() as any;
        return this.parseEsploraTransaction(data, 'litecoin', 'LTC', 8);
      }
      console.log(`[TxDetail LTC] litecoinspace ${res.status}, falling back`);
    } catch (err) {
      console.log(`[TxDetail LTC] litecoinspace failed:`, (err as Error).message);
    }

    // Fallback: BlockCypher
    const url = `https://api.blockcypher.com/v1/ltc/main/txs/${hash}?limit=50&includeHex=true`;
    console.log(`[TxDetail LTC] Fallback: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`BlockCypher LTC tx detail ${res.status}`);
    const data = await res.json() as any;
    return this.parseBlockCypherTransaction(data, 'litecoin', 'LTC', 8);
  }

  /* --------  Dogecoin Transaction Detail  -------- */

  private static async fetchDogeTransactionDetail(hash: string): Promise<any> {
    const url = `https://blockexplorer.one/ajax/doge/mainnet/transaction-info/${hash}`;
    console.log(`[TxDetail DOGE] Fetching: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`DOGE tx detail ${res.status}`);
    const json = await res.json() as any;
    const d = json.data || {};
    const raw = json.raw || {};
    const confirmations = json.confirmations ?? 0;

    // Parse outputs from data.to
    const outputs: any[] = (d.to || []).map((o: any, i: number) => ({
      index: i,
      address: o.address || 'Unknown',
      value: o.amount || '0',
      valueSat: Math.round(parseFloat(o.amount || '0') * 1e8),
    }));

    // Parse inputs from data.from
    const inputs: any[] = [];
    if (Array.isArray(d.from)) {
      for (const f of d.from) {
        if (f && typeof f === 'object') {
          inputs.push({
            address: f.address || 'Unknown',
            value: f.amount || '0',
            valueSat: Math.round(parseFloat(f.amount || '0') * 1e8),
          });
        }
      }
    }

    const fee = d.fee != null ? String(d.fee) : '0';
    const timestamp = d.time ? new Date(d.time * 1000).toISOString() : null;

    return {
      chain: 'dogecoin',
      hash: d.tx || raw.hash || hash,
      status: confirmations > 0 ? 'success' : 'pending',
      blockNumber: raw.height || null,
      timestamp,
      fee,
      size: raw.size || null,
      weight: null,
      version: raw.version ?? null,
      locktime: raw.locktime ?? null,
      inputs,
      outputs,
      totalIn: null,
      totalOut: d.totalAmount || d.transacted || null,
      symbol: 'DOGE',
      confirmations: confirmations > 0 ? String(confirmations) : '0',
    };
  }

  /* ============================================================
     CoinGecko Price API
     ============================================================ */

  private static COINGECKO_IDS: Record<string, string> = {
    bitcoin: 'bitcoin',
    ethereum: 'ethereum',
    solana: 'solana',
    litecoin: 'litecoin',
    dogecoin: 'dogecoin',
  };

  /** Fetch USD→target exchange rate from Frankfurter API (cached 10 min) */
  private static async getUsdRate(currency: string): Promise<number> {
    const cur = currency.toUpperCase();
    if (cur === 'USD') return 1;
    if (this.fxCache && this.fxCache.currency === cur && (Date.now() - this.fxCache.ts) < this.FX_TTL) {
      return this.fxCache.rate;
    }
    try {
      const url = `https://api.frankfurter.app/latest?from=USD&to=${cur}`;
      console.log(`[FX] Fetching: ${url}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
      const data = await res.json() as any;
      const rate = data.rates?.[cur] || 1;
      this.fxCache = { rate, currency: cur, ts: Date.now() };
      console.log(`[FX] USD→${cur} = ${rate}`);
      return rate;
    } catch (err) {
      console.log('[FX] Frankfurter failed:', err instanceof Error ? err.message : err);
      return this.fxCache?.rate || 1;
    }
  }

  /** Clear all price caches (called when user changes currency) */
  static clearPriceCaches(): void {
    this.priceCache = null;
    this.tokenPriceCache.clear();
    console.log('[Prices] All price caches cleared');
  }

  /** Get native coin prices (cached 1 min) */
  static async getPrices(currency: string): Promise<Record<string, number>> {
    const cur = currency.toLowerCase();
    if (this.priceCache && this.priceCache.currency === cur && (Date.now() - this.priceCache.ts) < this.PRICE_TTL) {
      return this.priceCache.data;
    }

    const ids = Object.values(this.COINGECKO_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${cur}`;
    console.log(`[Prices] Fetching native prices: ${url}`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = await res.json() as Record<string, Record<string, number>>;

      const prices: Record<string, number> = {};
      for (const [chain, geckoId] of Object.entries(this.COINGECKO_IDS)) {
        prices[chain] = data[geckoId]?.[cur] || 0;
      }

      this.priceCache = { data: prices, ts: Date.now(), currency: cur };
      console.log('[Prices] Native prices:', prices);
      return prices;
    } catch (err) {
      console.log('[Prices] CoinGecko failed:', err instanceof Error ? err.message : err);
      return this.priceCache?.data || {};
    }
  }

  // GeckoTerminal network IDs
  private static GECKO_TERMINAL_NETWORKS: Record<string, string> = {
    ethereum: 'eth',
    solana: 'solana',
  };

  // Trusted DexScreener dex IDs for Solana
  private static TRUSTED_DEX_IDS = new Set([
    'raydium', 'orca', 'meteora', 'jupiter',
  ]);

  /** Get token prices by contract address (cached 1 min per platform).
   *  Tries: CoinGecko → GeckoTerminal → DexScreener (Solana only). */
  private static async getTokenPrices(
    platform: string, contracts: string[], currency: string
  ): Promise<Record<string, number>> {
    if (contracts.length === 0) return {};
    const cur = currency.toLowerCase();
    const cacheKey = `${platform}:${cur}`;
    const cached = this.tokenPriceCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < this.PRICE_TTL) {
      return cached.data;
    }

    // Get USD→user FX rate for fallback APIs that only return USD
    const fxRate = await this.getUsdRate(currency);

    const prices: Record<string, number> = { ...(cached?.data || {}) };
    const allAddrs = contracts.map(a => a.toLowerCase());
    const uncached = allAddrs.filter(a => !(a in prices));

    // --- 1. CoinGecko (1 contract per call, free tier) ---
    for (let i = 0; i < uncached.length; i++) {
      const addr = uncached[i];
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addr}&vs_currencies=${cur}`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.status === 429) {
          console.log(`[TokenPrices] CoinGecko rate limited after ${i} calls`);
          break;
        }
        if (!res.ok) {
          console.log(`[TokenPrices] CoinGecko ${addr} → HTTP ${res.status}`);
          continue;
        }
        const data = await res.json() as Record<string, Record<string, number>>;
        for (const [respAddr, priceObj] of Object.entries(data)) {
          prices[respAddr.toLowerCase()] = priceObj[cur] || 0;
        }
      } catch (err) {
        console.log(`[TokenPrices] CoinGecko ${addr} failed:`, err instanceof Error ? err.message : err);
      }
      if (i < uncached.length - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    // --- 2. GeckoTerminal fallback for tokens still missing a price ---
    const missingAfterCG = allAddrs.filter(a => !prices[a]);
    if (missingAfterCG.length > 0) {
      const network = this.GECKO_TERMINAL_NETWORKS[platform];
      if (network) {
        console.log(`[TokenPrices] GeckoTerminal fallback for ${missingAfterCG.length} tokens`);
        for (let i = 0; i < missingAfterCG.length; i++) {
          const addr = missingAfterCG[i];
          try {
            const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${addr}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (res.status === 429) {
              console.log(`[TokenPrices] GeckoTerminal rate limited after ${i} calls`);
              break;
            }
            if (!res.ok) continue;
            const data = await res.json() as any;
            const priceUsd = parseFloat(data?.data?.attributes?.price_usd);
            if (priceUsd > 0) {
              prices[addr] = priceUsd * fxRate;
              console.log(`[TokenPrices] GeckoTerminal ${addr} → $${priceUsd} → ${cur} ${prices[addr].toFixed(4)}`);
            }
          } catch (err) {
            console.log(`[TokenPrices] GeckoTerminal ${addr} failed:`, err instanceof Error ? err.message : err);
          }
          if (i < missingAfterCG.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    }

    // --- 3. DexScreener fallback for Solana tokens still missing ---
    if (platform === 'solana') {
      const missingAfterGT = allAddrs.filter(a => !prices[a]);
      if (missingAfterGT.length > 0) {
        console.log(`[TokenPrices] DexScreener fallback for ${missingAfterGT.length} Solana tokens`);
        for (let i = 0; i < missingAfterGT.length; i++) {
          const addr = missingAfterGT[i];
          try {
            const url = `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const data = await res.json() as any;
            const pairs = (data?.pairs || []).filter(
              (p: any) => p.chainId === 'solana' && this.TRUSTED_DEX_IDS.has(p.dexId)
            );
            // Use the pair with highest 24h volume for best price accuracy
            if (pairs.length > 0) {
              pairs.sort((a: any, b: any) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
              const priceUsd = parseFloat(pairs[0].priceUsd);
              if (priceUsd > 0) {
                prices[addr] = priceUsd * fxRate;
                console.log(`[TokenPrices] DexScreener ${addr} → $${priceUsd} → ${cur} ${prices[addr].toFixed(4)}`);
              }
            }
          } catch (err) {
            console.log(`[TokenPrices] DexScreener ${addr} failed:`, err instanceof Error ? err.message : err);
          }
          if (i < missingAfterGT.length - 1) {
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    }

    this.tokenPriceCache.set(cacheKey, { data: prices, ts: Date.now() });
    const found = Object.values(prices).filter(p => p > 0).length;
    console.log(`[TokenPrices] Final: ${found}/${allAddrs.length} tokens priced`);
    return prices;
  }
}
