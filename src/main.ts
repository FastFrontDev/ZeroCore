import './style.css';
import type { Account, TokenBalance } from './types/electron';
import QRCode from 'qrcode';

/* ============================================================
   Inline SVG Icons (16×16)
   ============================================================ */
const Icons = {
  edit: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M8 3L4 7M8 3L12 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  receive: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M8 13L4 9M8 13L12 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8C2 4.68629 4.68629 2 8 2C10.2208 2 12.1599 3.25064 13.1973 5.08658M14 8C14 11.3137 11.3137 14 8 14C5.77915 14 3.84012 12.7494 2.80269 10.9134M13 2V5.5H9.5M3 14V10.5H6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shield: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6V12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12V6L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  key: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  spinner: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="icon-spin"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="28" stroke-dashoffset="8" stroke-linecap="round"/></svg>`,
};

/* ============================================================
   Supported Currencies
   ============================================================ */
const CURRENCIES: Record<string, { symbol: string; name: string }> = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  CHF: { symbol: 'Fr', name: 'Swiss Franc' },
  CNY: { symbol: '¥', name: 'Chinese Yuan' },
};

/* ============================================================
   Application State
   ============================================================ */
interface Transaction {
  hash: string;
  type: string;
  amount: string;
  symbol: string;
  confirmed: boolean;
  confirmations: number;
  timestamp: number;
  from: string;
  to: string;
  chain: string;
}

interface AppState {
  isUnlocked: boolean;
  password: string;
  accounts: Account[];
  currentAccountIndex: number;
  balances: Map<string, string>;
  transactions: Transaction[];
  currency: string;
  isLoading: boolean;
  prices: Map<string, number>;
  tokenBalances: Map<string, TokenBalance[]>;
}

/* ============================================================
   Wallet Application
   ============================================================ */
class WalletApp {
  private state: AppState = {
    isUnlocked: false,
    password: '',
    accounts: [],
    currentAccountIndex: 0,
    balances: new Map(),
    transactions: [],
    currency: localStorage.getItem('zerocore-currency') || 'USD',
    isLoading: true,
    prices: new Map(),
    tokenBalances: new Map(),
  };

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  /** Monotonically increasing ID to cancel stale load requests */
  private loadRequestId: number = 0;

  constructor() {
    this.init();
  }

  /* --- Helpers --- */

  private async sha256(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async getProfilePicture(address: string): Promise<string> {
    const hash = await this.sha256(address.toLowerCase());
    return `https://api.dicebear.com/9.x/glass/svg?seed=${hash}`;
  }

  private el(id: string) {
    return document.getElementById(id)!;
  }

  private formatCurrency(value: string, chain?: string): string {
    const val = parseFloat(value) || 0;
    const cur = CURRENCIES[this.state.currency] || CURRENCIES.USD;
    const price = chain ? (this.state.prices.get(chain) || 0) : 0;
    const fiat = val * price;
    return `${cur.symbol}${fiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** Compute total fiat value for an account (native balances + tokens) */
  private computeAccountFiat(acc: Account): string {
    const cur = CURRENCIES[this.state.currency] || CURRENCIES.USD;
    const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
    let total = 0;

    for (const c of chains) {
      const bal = parseFloat(this.getChainBalance(c.chain, c.address)) || 0;
      const price = this.state.prices.get(c.chain) || 0;
      total += bal * price;

      // Add token values
      const tokenKey = `${c.chain}:${c.address}`;
      const tokens = this.state.tokenBalances.get(tokenKey) || [];
      for (const t of tokens) {
        total += (parseFloat(t.balance) || 0) * (t.price || 0);
      }
    }

    return `${cur.symbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private getChainBalanceKey(chain: string, address: string): string {
    return `${chain}:${address}`;
  }

  private getChainBalance(chain: string, address: string): string {
    return this.state.balances.get(this.getChainBalanceKey(chain, address)) || '0';
  }

  private formatNativeBalance(balance: string, decimals: number = 6): string {
    const val = parseFloat(balance) || 0;
    if (val === 0) return '0';
    // Trim trailing zeros but show at least a few decimals for readability
    return val.toFixed(decimals).replace(/\.?0+$/, '') || '0';
  }

  /* --- Init --- */

  private async init() {
    if (!window.electronAPI) {
      this.renderError('Electron API not available. Run inside the desktop app.');
      return;
    }
    const result = await window.electronAPI.wallet.checkExists();
    if (result.success && result.exists) {
      this.renderUnlockScreen();
    } else {
      this.renderSetupScreen();
    }
  }

  /* --- Error --- */

  private renderError(message: string) {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="error-screen"><p>${message}</p></div>
    `;
  }

  /* ============================================================
     Setup Screen
     ============================================================ */

  private renderSetupScreen() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-header">
            <div class="auth-logo">
              <span class="logo-mark"></span>
              ZeroCore
            </div>
            <div class="auth-title">Get started</div>
            <div class="auth-subtitle">Create a new wallet or restore from a recovery phrase.</div>
          </div>
          <div class="auth-form">
            <button id="setup-create-btn" class="btn-primary" style="width:100%">Create New Wallet</button>
            <button id="setup-import-btn" class="btn-secondary" style="width:100%">Import Recovery Phrase</button>
          </div>
        </div>
      </div>
    `;

    this.el('setup-create-btn').addEventListener('click', () => this.renderCreateScreen());
    this.el('setup-import-btn').addEventListener('click', () => this.renderImportScreen());
  }

  /* ============================================================
     Create Wallet Screen
     ============================================================ */

  private renderCreateScreen() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-header">
            <div class="auth-logo">
              <span class="logo-mark"></span>
              ZeroCore
            </div>
            <div class="auth-title">Create your wallet</div>
            <div class="auth-subtitle">Set a password to encrypt your recovery phrase.</div>
          </div>
          <div class="auth-form">
            <div class="field">
              <label class="field-label" for="setup-password">Password</label>
              <input type="password" id="setup-password" class="input" placeholder="Min. 8 characters" autocomplete="new-password" />
            </div>
            <div class="field">
              <label class="field-label" for="setup-password-confirm">Confirm password</label>
              <input type="password" id="setup-password-confirm" class="input" placeholder="Re-enter password" autocomplete="new-password" />
            </div>
            <button id="create-wallet-btn" class="btn-primary">Create Wallet</button>
            <button id="back-to-setup" class="btn-secondary">Back</button>
            <div id="setup-error" class="error-text"></div>
          </div>
        </div>
      </div>
    `;

    const pw = this.el('setup-password') as HTMLInputElement;
    const confirm = this.el('setup-password-confirm') as HTMLInputElement;
    const errEl = this.el('setup-error');
    pw.focus();

    const handle = async () => {
      if (!pw.value || pw.value.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters';
        return;
      }
      if (pw.value !== confirm.value) {
        errEl.textContent = 'Passwords do not match';
        return;
      }
      const res = await window.electronAPI.wallet.create(pw.value);
      if (res.success && res.mnemonic && res.accounts) {
        this.state.password = pw.value;
        this.state.accounts = res.accounts;
        this.state.isUnlocked = true;
        this.renderBackupScreen(res.mnemonic);
      } else {
        errEl.textContent = res.error || 'Failed to create wallet';
      }
    };

    this.el('create-wallet-btn').addEventListener('click', handle);
    this.el('back-to-setup').addEventListener('click', () => this.renderSetupScreen());
    confirm.addEventListener('keypress', (e) => { if (e.key === 'Enter') handle(); });
  }

  /* ============================================================
     Import Wallet Screen
     ============================================================ */

  private renderImportScreen() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card auth-card-wide">
          <div class="auth-header">
            <div class="auth-logo">
              <span class="logo-mark"></span>
              ZeroCore
            </div>
            <div class="auth-title">Import wallet</div>
            <div class="auth-subtitle">Enter your 12-word recovery phrase to restore your wallet.</div>
          </div>
          <div class="auth-form">
            <div class="field">
              <label class="field-label">Recovery Phrase</label>
              <div class="import-grid" id="import-grid">
                ${Array.from({ length: 12 }, (_, i) => `
                  <div class="import-word-field">
                    <span class="import-word-num">${i + 1}</span>
                    <input type="text" class="import-word-input" data-index="${i}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="field">
              <label class="field-label" for="import-password">Password</label>
              <input type="password" id="import-password" class="input" placeholder="Min. 8 characters" autocomplete="new-password" />
            </div>
            <div class="field">
              <label class="field-label" for="import-password-confirm">Confirm password</label>
              <input type="password" id="import-password-confirm" class="input" placeholder="Re-enter password" autocomplete="new-password" />
            </div>
            <button id="import-wallet-btn" class="btn-primary">Restore Wallet</button>
            <button id="back-to-setup" class="btn-secondary">Back</button>
            <div id="import-error" class="error-text"></div>
          </div>
        </div>
      </div>
    `;

    const grid = this.el('import-grid');
    const wordInputs = grid.querySelectorAll<HTMLInputElement>('.import-word-input');
    const pw = this.el('import-password') as HTMLInputElement;
    const confirm = this.el('import-password-confirm') as HTMLInputElement;
    const errEl = this.el('import-error');

    // Handle paste of full phrase into first field
    wordInputs[0].addEventListener('paste', (e) => {
      const pasted = e.clipboardData?.getData('text')?.trim();
      if (pasted && pasted.split(/\s+/).length === 12) {
        e.preventDefault();
        const words = pasted.split(/\s+/);
        wordInputs.forEach((input, i) => {
          input.value = words[i] || '';
        });
        pw.focus();
      }
    });

    // Tab forward on space
    wordInputs.forEach((input, i) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === ' ' && i < 11) {
          e.preventDefault();
          wordInputs[i + 1].focus();
        }
      });
    });

    wordInputs[0].focus();

    const handle = async () => {
      const words = Array.from(wordInputs).map((el) => el.value.trim().toLowerCase());
      if (words.some((w) => !w)) {
        errEl.textContent = 'Please fill in all 12 words';
        return;
      }
      if (!pw.value || pw.value.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters';
        return;
      }
      if (pw.value !== confirm.value) {
        errEl.textContent = 'Passwords do not match';
        return;
      }
      const mnemonic = words.join(' ');
      const res = await window.electronAPI.wallet.importWallet(mnemonic, pw.value);
      if (res.success && res.accounts) {
        this.state.password = pw.value;
        this.state.accounts = res.accounts;
        this.state.isUnlocked = true;
        this.renderMainApp();
        this.loadBalances();
      } else {
        errEl.textContent = res.error || 'Invalid recovery phrase';
      }
    };

    this.el('import-wallet-btn').addEventListener('click', handle);
    this.el('back-to-setup').addEventListener('click', () => this.renderSetupScreen());
    confirm.addEventListener('keypress', (e) => { if (e.key === 'Enter') handle(); });
  }

  /* ============================================================
     Mnemonic Backup Screen
     ============================================================ */

  private renderBackupScreen(mnemonic: string) {
    const words = mnemonic.split(' ');
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="backup-screen">
        <div class="backup-card">
          <div class="backup-header">
            <div class="backup-icon">${Icons.shield}</div>
            <div class="backup-title">Recovery Phrase</div>
            <div class="backup-desc">Write down these ${words.length} words in order. This is the only way to recover your wallet if you lose access.</div>
          </div>
          <div class="mnemonic-grid">
            ${words.map((w, i) => `
              <div class="mnemonic-word">
                <span class="word-number">${i + 1}</span>
                <span class="word-text">${w}</span>
              </div>
            `).join('')}
          </div>
          <div class="backup-warning-box">
            <p><span class="warn-dot"></span>Never share this phrase with anyone</p>
            <p><span class="warn-dot"></span>Store it offline in a secure location</p>
            <p><span class="warn-dot"></span>Anyone with this phrase can access your funds</p>
          </div>
          <button id="continue-btn" class="btn-primary">I've saved my recovery phrase</button>
        </div>
      </div>
    `;

    this.el('continue-btn').addEventListener('click', () => {
      this.renderMainApp();
      this.loadBalances();
    });
  }

  /* ============================================================
     Unlock Screen
     ============================================================ */

  private renderUnlockScreen() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-header">
            <div class="auth-logo">
              <span class="logo-mark"></span>
              ZeroCore
            </div>
            <div class="auth-title">Welcome back</div>
            <div class="auth-subtitle">Enter your password to unlock.</div>
          </div>
          <div class="auth-form">
            <div class="field">
              <label class="field-label" for="unlock-password">Password</label>
              <input type="password" id="unlock-password" class="input" placeholder="Enter password" autocomplete="current-password" />
            </div>
            <button id="unlock-btn" class="btn-primary">Unlock</button>
            <div id="unlock-error" class="error-text"></div>
          </div>
        </div>
      </div>
    `;

    const pw = this.el('unlock-password') as HTMLInputElement;
    const errEl = this.el('unlock-error');

    const handle = async () => {
      if (!pw.value) { errEl.textContent = 'Enter your password'; return; }
      const res = await window.electronAPI.wallet.unlock(pw.value);
      if (res.success && res.accounts) {
        this.state.password = pw.value;
        this.state.accounts = res.accounts;
        this.state.isUnlocked = true;
        this.renderMainApp();
        this.loadBalances();
      } else {
        errEl.textContent = 'Incorrect password';
        pw.value = '';
      }
    };

    this.el('unlock-btn').addEventListener('click', handle);
    pw.addEventListener('keypress', (e) => { if (e.key === 'Enter') handle(); });
    pw.focus();
  }

  /* ============================================================
     Main App Shell
     ============================================================ */

  private renderMainApp() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="main-layout">
        <div class="sidebar">
          <div class="sidebar-header">
            <div class="logo">
              <span class="logo-mark"></span>
              ZeroCore
            </div>
          </div>
          <div class="accounts-section">
            <div class="section-label">Accounts</div>
            <div id="accounts-list" class="accounts-list"></div>
            <button id="add-account-btn" class="btn-add-account">
              <span class="plus-icon">+</span>
              Add Account
            </button>
          </div>
          <div class="sidebar-footer">
            <button id="settings-btn" class="btn-settings">
              ${Icons.settings}
              Settings
            </button>
          </div>
        </div>
        <div class="main-content">
          <div class="content-container">
            <div id="main-view"></div>
          </div>
        </div>
      </div>
    `;

    this.el('add-account-btn').addEventListener('click', () => this.addAccount());
    this.el('settings-btn').addEventListener('click', () => this.showSettings());
    this.renderAccountsList();
    this.renderAccountView();
  }

  /* ============================================================
     Sidebar Accounts List
     ============================================================ */

  async renderAccountsList() {
    const listEl = this.el('accounts-list');

    const items = await Promise.all(
      this.state.accounts.map(async (acc, idx) => {
        const active = idx === this.state.currentAccountIndex;
        const pic = await this.getProfilePicture(acc.address);
        const isSingle = acc.accountType === 'from_key' || acc.accountType === 'just_view';
        const balChain = isSingle ? (acc.singleChain || 'ethereum') : 'ethereum';
        const balAddr = isSingle ? acc.address : acc.address;
        const hasCache = this.state.balances.has(this.getChainBalanceKey(balChain, balAddr));
        const sidebarFiat = this.computeAccountFiat(acc);
        const balDisplay = (!hasCache && this.state.isLoading)
          ? '<span class="skel skel-inline"></span>'
          : `${sidebarFiat} ${this.state.currency}`;
        const typeBadge = acc.accountType === 'just_view'
          ? '<span class="acc-type-badge acc-type-watch" title="Watch only"><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg></span>'
          : acc.accountType === 'from_key'
            ? '<span class="acc-type-badge acc-type-imported" title="Imported key">' + Icons.key + '</span>'
            : '';
        return `
          <div class="account-item${active ? ' active' : ''}" data-index="${idx}">
            <img src="${pic}" alt="" class="account-avatar" />
            <div class="account-info">
              <div class="account-name">${acc.name}${typeBadge ? ' ' + typeBadge : ''}</div>
              <div class="account-balance">${balDisplay}</div>
            </div>
          </div>`;
      }),
    );

    listEl.innerHTML = items.join('');
    listEl.querySelectorAll('.account-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10);
        this.switchAccount(idx);
      });
    });
  }

  /* ============================================================
     Account Detail View
     ============================================================ */

  private async renderAccountView() {
    const view = this.el('main-view');
    const acc = this.state.accounts[this.state.currentAccountIndex];
    const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
    const pic = await this.getProfilePicture(acc.address);
    const loading = this.state.isLoading;
    const isSingle = acc.accountType === 'from_key' || acc.accountType === 'just_view';
    const isWatchOnly = acc.accountType === 'just_view';

    /* Compute hero balance — use the primary chain for this account */
    const heroChain = isSingle ? (acc.singleChain || chains[0]?.chain || 'ethereum') : 'ethereum';
    const heroAddr = isSingle ? acc.address : acc.address;
    const heroSymbol = isSingle ? (acc.singleSymbol || chains[0]?.symbol || 'ETH') : 'ETH';
    const heroBal = this.getChainBalance(heroChain, heroAddr);

    const chainsHTML = chains.map((c) => {
      const bal = this.getChainBalance(c.chain, c.address);
      const formatted = this.formatNativeBalance(bal);
      let chainRowHtml = `
        <div class="chain-row" data-chain="${c.chain}" data-address="${c.address}">
          <div class="chain-badge"><img src="./crypto-icons/${this.chainIconFile[c.chain] || c.symbol.toLowerCase()}.svg" alt="${c.symbol}" class="chain-icon-img" /></div>
          <div class="chain-info">
            <div class="chain-name">${c.name}</div>
            <div class="chain-address">${c.address.slice(0, 8)}...${c.address.slice(-6)}</div>
          </div>
          <div class="chain-balance-col">
            ${loading
              ? '<div class="skel skel-bal"></div><div class="skel skel-bal-sm"></div>'
              : `<div class="chain-bal-value">${formatted} ${c.symbol}</div>
                 <div class="chain-bal-fiat">${this.formatCurrency(bal, c.chain)}</div>`
            }
          </div>
          <button class="btn-copy chain-copy-btn" data-address="${c.address}" title="Copy ${c.name} address">${Icons.copy}</button>
        </div>
      `;

      // Add token rows for ETH/SOL chains
      if (!loading && (c.chain === 'ethereum' || c.chain === 'solana')) {
        const tokenKey = `${c.chain}:${c.address}`;
        const tokens = this.state.tokenBalances.get(tokenKey) || [];
        for (const t of tokens) {
          const tBal = this.formatNativeBalance(t.balance, 4);
          const tFiat = t.price > 0
            ? `${(CURRENCIES[this.state.currency] || CURRENCIES.USD).symbol}${((parseFloat(t.balance) || 0) * t.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '';
          const iconSrc = t.logoURI || `./crypto-icons/${t.symbol.toLowerCase()}.svg`;
          chainRowHtml += `
            <div class="token-row" data-contract="${t.contractAddress}">
              <div class="token-icon-wrap"><img src="${iconSrc}" alt="${t.symbol}" class="token-icon-img" onerror="this.style.display='none'" /></div>
              <div class="token-info">
                <div class="token-name">${t.symbol}</div>
                <div class="token-fullname">${t.name}</div>
              </div>
              <div class="token-balance-col">
                <div class="token-bal-value">${tBal} ${t.symbol}</div>
                ${tFiat ? `<div class="token-bal-fiat">${tFiat}</div>` : ''}
              </div>
            </div>
          `;
        }
      }

      return chainRowHtml;
    }).join('');

    const accountTypeBadge = isWatchOnly
      ? '<span class="account-type-label watch-label">Watch Only</span>'
      : acc.accountType === 'from_key'
        ? '<span class="account-type-label imported-label">Imported</span>'
        : '';

    view.innerHTML = `
      <div class="account-view">
        <div class="account-header-card">
          <div class="account-header-top">
            <img src="${pic}" alt="" class="account-detail-avatar" />
            <div class="account-header-left" id="account-name-area">
              <h2>${acc.name}</h2>
              ${accountTypeBadge}
              <button id="edit-name-btn" class="btn-edit" title="Rename">${Icons.edit}</button>
            </div>
          </div>
          <div class="balance-block">
            ${loading
              ? '<div class="skel skel-hero"></div><div class="skel skel-hero-sub"></div>'
              : `<div class="balance-value" id="hero-balance-value">${this.computeAccountFiat(acc)}</div>
                 <div class="balance-sub" id="hero-balance-sub">${this.formatNativeBalance(heroBal, 4)} ${heroSymbol}</div>`
            }
          </div>
          ${!isWatchOnly ? `<button id="account-keys-btn" class="account-keys-btn" title="View private keys">${Icons.key}</button>` : ''}
        </div>

        <div class="chains-card">
          <div class="chains-card-header">Balances</div>
          <div id="chains-list" class="chains-list">
            ${chainsHTML}
          </div>
        </div>

        <div class="actions-row">
          ${!isWatchOnly ? `<button id="send-btn" class="btn-action">${Icons.send} Send</button>` : ''}
          <button id="receive-btn" class="btn-action">${Icons.receive} Receive</button>
          <button id="refresh-btn" class="btn-action"><span id="refresh-icon" class="refresh-icon">${Icons.refresh}</span> Refresh</button>
        </div>

        <div id="transaction-area" class="transaction-area"></div>
      </div>
    `;

    this.el('edit-name-btn').addEventListener('click', () => this.startRenameAccount());
    if (!isWatchOnly) {
      this.el('account-keys-btn').addEventListener('click', () => this.showAccountKeys());
      this.el('send-btn').addEventListener('click', () => this.showSendForm());
    }
    this.el('receive-btn').addEventListener('click', () => this.showReceive());
    this.el('refresh-btn').addEventListener('click', () => this.refreshBalance());

    document.querySelectorAll('.chain-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const addr = target.dataset.address!;
        navigator.clipboard.writeText(addr);
        target.innerHTML = Icons.check;
        target.classList.add('copied');
        setTimeout(() => {
          target.innerHTML = Icons.copy;
          target.classList.remove('copied');
        }, 2000);
      });
    });

    if (loading) {
      const area = document.getElementById('transaction-area');
      if (area) {
        area.innerHTML = `
          <div class="tx-card">
            <div class="tx-card-header">Transactions</div>
            <div class="tx-skel-list">
              ${Array.from({ length: 4 }, () => `
                <div class="tx-skel-row">
                  <div class="skel skel-circle"></div>
                  <div class="tx-skel-lines">
                    <div class="skel skel-line-md"></div>
                    <div class="skel skel-line-sm"></div>
                  </div>
                  <div class="tx-skel-right">
                    <div class="skel skel-line-md"></div>
                    <div class="skel skel-line-xs"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>`;
      }
    } else {
      this.renderTransactions();
    }
  }

  /** Update balance values in DOM without full re-render (used by auto-refresh) */
  private updateBalancesInPlace() {
    const acc = this.state.accounts[this.state.currentAccountIndex];
    const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
    const isSingle = acc.accountType === 'from_key' || acc.accountType === 'just_view';

    // Update hero balance
    const heroChain = isSingle ? (acc.singleChain || chains[0]?.chain || 'ethereum') : 'ethereum';
    const heroSymbol = isSingle ? (acc.singleSymbol || chains[0]?.symbol || 'ETH') : 'ETH';
    const heroBal = this.getChainBalance(heroChain, acc.address);
    const heroVal = document.getElementById('hero-balance-value');
    const heroSub = document.getElementById('hero-balance-sub');
    if (heroVal) heroVal.textContent = this.computeAccountFiat(acc);
    if (heroSub) heroSub.textContent = `${this.formatNativeBalance(heroBal, 4)} ${heroSymbol}`;

    // Update each chain row
    for (const c of chains) {
      const row = document.querySelector(`.chain-row[data-chain="${c.chain}"][data-address="${c.address}"]`);
      if (!row) continue;
      const bal = this.getChainBalance(c.chain, c.address);
      const valEl = row.querySelector('.chain-bal-value');
      const fiatEl = row.querySelector('.chain-bal-fiat');
      if (valEl) valEl.textContent = `${this.formatNativeBalance(bal)} ${c.symbol}`;
      if (fiatEl) fiatEl.textContent = this.formatCurrency(bal, c.chain);
    }

    // Update token rows
    this.updateTokenRowsInPlace();
  }

  /** Update token row values in DOM without full re-render */
  private updateTokenRowsInPlace() {
    const cur = CURRENCIES[this.state.currency] || CURRENCIES.USD;
    document.querySelectorAll('.token-row').forEach((row) => {
      const contract = (row as HTMLElement).dataset.contract;
      if (!contract) return;
      // Find the token in state
      for (const [, tokens] of this.state.tokenBalances) {
        const token = tokens.find(t => t.contractAddress === contract);
        if (token) {
          const valEl = row.querySelector('.token-bal-value');
          const fiatEl = row.querySelector('.token-bal-fiat');
          if (valEl) valEl.textContent = `${this.formatNativeBalance(token.balance, 4)} ${token.symbol}`;
          if (fiatEl && token.price > 0) {
            const fiat = (parseFloat(token.balance) || 0) * token.price;
            fiatEl.textContent = `${cur.symbol}${fiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
          break;
        }
      }
    });
  }

  /* ============================================================
     Transaction List
     ============================================================ */

  private readonly txExplorerUrls: Record<string, string> = {
    bitcoin: 'https://mempool.space/tx/',
    ethereum: 'https://etherscan.io/tx/',
    solana: 'https://solscan.io/tx/',
    litecoin: 'https://live.blockcypher.com/ltc/tx/',
    dogecoin: 'https://live.blockcypher.com/doge/tx/',
  };

  private renderTransactions() {
    const area = document.getElementById('transaction-area');
    if (!area) return;

    const txs = this.state.transactions;
    if (!txs.length) {
      area.innerHTML = `
        <div class="tx-card">
          <div class="tx-card-header">Transactions</div>
          <div class="tx-empty">No transactions found</div>
        </div>`;
      return;
    }

    const rows = txs.slice(0, 25).map((tx) => {
      const iconFile = this.chainIconFile[tx.chain] || tx.symbol.toLowerCase();
      const isSend = tx.type === 'send';
      const arrow = isSend
        ? '<span class="tx-dir tx-dir-send">&#8593;</span>'
        : '<span class="tx-dir tx-dir-receive">&#8595;</span>';
      const label = isSend ? 'Sent' : 'Received';
      const amountClass = isSend ? 'tx-amount-send' : 'tx-amount-receive';
      const sign = isSend ? '-' : '+';
      const timeStr = tx.timestamp
        ? new Date(tx.timestamp * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      const statusIcon = tx.confirmed
        ? `<span class="tx-confirmed" title="Confirmed (${tx.confirmations})">${Icons.check}</span>`
        : `<span class="tx-pending icon-spin" title="Unconfirmed">${Icons.spinner}</span>`;
      const hashShort = tx.hash.slice(0, 10) + '...' + tx.hash.slice(-6);

      return `
        <div class="tx-row${tx.confirmed ? '' : ' tx-unconfirmed'}" data-tx-hash="${tx.hash}" data-tx-chain="${tx.chain}">
          <div class="tx-chain-icon"><img src="./crypto-icons/${iconFile}.svg" alt="${tx.symbol}" /></div>
          <div class="tx-dir-col">${arrow}</div>
          <div class="tx-info">
            <div class="tx-label">${label}</div>
            <span class="tx-hash">${hashShort}</span>
          </div>
          <div class="tx-meta">
            <div class="${amountClass}">${sign}${parseFloat(tx.amount).toFixed(6)} ${tx.symbol}</div>
            <div class="tx-time">${timeStr}</div>
          </div>
          <div class="tx-status">${statusIcon}</div>
        </div>`;
    }).join('');

    area.innerHTML = `
      <div class="tx-card">
        <div class="tx-card-header">Transactions</div>
        <div class="tx-list">${rows}</div>
      </div>`;

    // Attach click handlers for tx detail
    area.querySelectorAll('.tx-row[data-tx-hash]').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Don't trigger if clicking the hash link
        if ((e.target as HTMLElement).closest('.tx-hash')) return;
        const hash = (row as HTMLElement).dataset.txHash!;
        const chain = (row as HTMLElement).dataset.txChain!;
        this.showTransactionDetail(chain, hash);
      });
      (row as HTMLElement).style.cursor = 'pointer';
    });

    // Also make hash text clickable for detail
    area.querySelectorAll('.tx-hash').forEach((hashEl) => {
      hashEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = (hashEl as HTMLElement).closest('.tx-row') as HTMLElement;
        if (!row) return;
        const hash = row.dataset.txHash!;
        const chain = row.dataset.txChain!;
        this.showTransactionDetail(chain, hash);
      });
    });
  }

  /* ============================================================
     Transaction Detail
     ============================================================ */

  private async showTransactionDetail(chain: string, hash: string) {
    // Show loading modal immediately
    this.showModal(`
      <div class="tx-detail-modal">
        <div class="tx-detail-header">
          <div class="modal-title">Transaction Details</div>
          <button id="tx-detail-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="tx-detail-loading">
          <span class="icon-spin">${Icons.spinner}</span>
          <span>Loading transaction details...</span>
        </div>
      </div>
    `);

    this.el('tx-detail-close').addEventListener('click', () => this.closeModal());

    try {
      const res = await window.electronAPI.wallet.getTransactionDetail(chain, hash);
      if (!res.success || !res.detail) {
        this.renderTxDetailError(chain, hash, res.error || 'Failed to load transaction details');
        return;
      }

      const d = res.detail;
      if (chain === 'ethereum') {
        this.renderEthTxDetail(d);
      } else if (chain === 'solana') {
        this.renderSolTxDetail(d);
      } else if (chain === 'bitcoin' || chain === 'litecoin' || chain === 'dogecoin') {
        this.renderUtxoTxDetail(d);
      } else {
        this.renderTxDetailError(chain, hash, 'Transaction details not available for this chain');
      }
    } catch (err) {
      this.renderTxDetailError(chain, hash, err instanceof Error ? err.message : 'Unknown error');
    }
  }

  private renderTxDetailError(chain: string, hash: string, error: string) {
    const explorerBase = this.txExplorerUrls[chain] || '';
    const modal = document.querySelector('.tx-detail-modal');
    if (!modal) return;

    const loadingEl = modal.querySelector('.tx-detail-loading');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div class="tx-detail-error">${error}</div>
        ${explorerBase ? `
          <button class="btn-explorer" id="tx-open-explorer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open In Explorer
          </button>
        ` : ''}
      `;
      if (explorerBase) {
        document.getElementById('tx-open-explorer')?.addEventListener('click', () => {
          window.electronAPI.shell.openExternal(`${explorerBase}${hash}`);
        });
      }
    }
  }

  private renderEthTxDetail(d: any) {
    const modal = document.querySelector('.tx-detail-modal');
    if (!modal) return;

    const statusClass = d.status === 'success' ? 'tx-detail-status-ok' : 'tx-detail-status-fail';
    const statusLabel = d.status === 'success' ? 'Success' : 'Failed';
    const timeStr = d.timestamp
      ? new Date(d.timestamp).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';

    const typeTags = (d.transactionTypes || []).map((t: string) =>
      `<span class="tx-detail-tag">${t.replace(/_/g, ' ')}</span>`
    ).join('');

    // Token transfers
    let transfersHtml = '';
    if (d.tokenTransfers && d.tokenTransfers.length > 0) {
      const transferRows = d.tokenTransfers.map((tt: any) => `
        <div class="tx-detail-transfer-row">
          <div class="tx-detail-transfer-icon">
            ${tt.iconUrl ? `<img src="${tt.iconUrl}" alt="${tt.symbol}" />` : `<div class="tx-detail-transfer-placeholder">${tt.symbol.charAt(0)}</div>`}
          </div>
          <div class="tx-detail-transfer-info">
            <div class="tx-detail-transfer-amount">${tt.amount} ${tt.symbol}</div>
            <div class="tx-detail-transfer-name">${tt.name}</div>
          </div>
          <div class="tx-detail-transfer-dir">
            <div class="tx-detail-addr-label">From</div>
            <div class="tx-detail-addr-short">${tt.fromName || (tt.from.slice(0, 8) + '...' + tt.from.slice(-6))}</div>
            <div class="tx-detail-addr-label" style="margin-top: 4px;">To</div>
            <div class="tx-detail-addr-short">${tt.toName || (tt.to.slice(0, 8) + '...' + tt.to.slice(-6))}</div>
          </div>
        </div>
      `).join('');
      transfersHtml = `
        <div class="tx-detail-section">
          <div class="tx-detail-section-label">Token Transfers</div>
          ${transferRows}
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="tx-detail-header">
        <div class="modal-title">Transaction Details</div>
        <button id="tx-detail-close" class="receive-close-btn">${Icons.close}</button>
      </div>

      <div class="tx-detail-status-bar">
        <span class="tx-detail-status ${statusClass}">${statusLabel}</span>
        <span class="tx-detail-time">${timeStr}</span>
      </div>

      ${typeTags ? `<div class="tx-detail-tags">${typeTags}</div>` : ''}

      <div class="tx-detail-section">
        <div class="tx-detail-row">
          <span class="tx-detail-label">Hash</span>
          <span class="tx-detail-value tx-detail-mono">${d.hash.slice(0, 14)}...${d.hash.slice(-8)}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Block</span>
          <span class="tx-detail-value">${(d.blockNumber || 0).toLocaleString()}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">From</span>
          <span class="tx-detail-value tx-detail-mono">${d.fromName ? d.fromName + ' ' : ''}${d.from.slice(0, 10)}...${d.from.slice(-6)}${d.fromIsContract ? ' <span class="tx-detail-tag-sm">Contract</span>' : ''}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">To</span>
          <span class="tx-detail-value tx-detail-mono">${d.toName ? d.toName + ' ' : ''}${d.to.slice(0, 10)}...${d.to.slice(-6)}${d.toIsContract ? ' <span class="tx-detail-tag-sm">Contract</span>' : ''}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Value</span>
          <span class="tx-detail-value">${d.value} ETH</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Fee</span>
          <span class="tx-detail-value">${d.fee} ETH</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Gas Used</span>
          <span class="tx-detail-value">${parseInt(d.gasUsed || '0').toLocaleString()} / ${parseInt(d.gasLimit || '0').toLocaleString()}</span>
        </div>
        ${d.nonce !== undefined ? `
          <div class="tx-detail-row">
            <span class="tx-detail-label">Nonce</span>
            <span class="tx-detail-value">${d.nonce}</span>
          </div>
        ` : ''}
        <div class="tx-detail-row">
          <span class="tx-detail-label">Confirmations</span>
          <span class="tx-detail-value">${(d.confirmations || 0).toLocaleString()}</span>
        </div>
      </div>

      ${transfersHtml}

      <div class="tx-detail-footer">
        <button class="btn-explorer" id="tx-open-explorer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open In Explorer
        </button>
      </div>
    `;

    this.el('tx-detail-close').addEventListener('click', () => this.closeModal());
    this.el('tx-open-explorer').addEventListener('click', () => {
      window.electronAPI.shell.openExternal(`https://etherscan.io/tx/${d.hash}`);
    });
  }

  private renderSolTxDetail(d: any) {
    const modal = document.querySelector('.tx-detail-modal');
    if (!modal) return;

    const statusClass = d.status === 'success' ? 'tx-detail-status-ok' : 'tx-detail-status-fail';
    const statusLabel = d.status === 'success' ? 'Success' : 'Failed';
    const timeStr = d.timestamp
      ? new Date(d.timestamp).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';

    const tagHtml = (d.tags || []).map((t: string) =>
      `<span class="tx-detail-tag">${t}</span>`
    ).join('');

    // Token transfers
    let transfersHtml = '';
    if (d.tokenTransfers && d.tokenTransfers.length > 0) {
      const transferRows = d.tokenTransfers.map((tt: any) => `
        <div class="tx-detail-transfer-row">
          <div class="tx-detail-transfer-icon">
            ${tt.iconUrl ? `<img src="${tt.iconUrl}" alt="${tt.symbol}" />` : `<div class="tx-detail-transfer-placeholder">${tt.symbol.charAt(0)}</div>`}
          </div>
          <div class="tx-detail-transfer-info">
            <div class="tx-detail-transfer-amount">${tt.amount} ${tt.symbol}</div>
            <div class="tx-detail-transfer-name">${tt.name}</div>
          </div>
          <div class="tx-detail-transfer-dir">
            <div class="tx-detail-addr-label">From</div>
            <div class="tx-detail-addr-short">${tt.from.slice(0, 6)}...${tt.from.slice(-4)}</div>
            <div class="tx-detail-addr-label" style="margin-top: 4px;">To</div>
            <div class="tx-detail-addr-short">${tt.to.slice(0, 6)}...${tt.to.slice(-4)}</div>
          </div>
        </div>
      `).join('');
      transfersHtml = `
        <div class="tx-detail-section">
          <div class="tx-detail-section-label">Token Transfers</div>
          ${transferRows}
        </div>
      `;
    }

    // Programs
    let programsHtml = '';
    if (d.programs && d.programs.length > 0) {
      const programRows = d.programs.map((p: any) => `
        <div class="tx-detail-program-row">
          <span class="tx-detail-program-name">${p.name}</span>
          <span class="tx-detail-addr-short tx-detail-mono">${p.id.slice(0, 8)}...${p.id.slice(-4)}</span>
        </div>
      `).join('');
      programsHtml = `
        <div class="tx-detail-section">
          <div class="tx-detail-section-label">Programs</div>
          ${programRows}
        </div>
      `;
    }

    // SOL balance changes
    let solChangesHtml = '';
    if (d.solChanges && d.solChanges.length > 0) {
      const changeRows = d.solChanges.map((sc: any) => `
        <div class="tx-detail-row">
          <span class="tx-detail-value tx-detail-mono" style="font-size: 11px;">${sc.address.slice(0, 8)}...${sc.address.slice(-4)}</span>
          <span class="tx-detail-value ${sc.direction === 'out' ? 'tx-amount-send' : 'tx-amount-receive'}">${sc.direction === 'out' ? '-' : '+'}${sc.change} SOL</span>
        </div>
      `).join('');
      solChangesHtml = `
        <div class="tx-detail-section">
          <div class="tx-detail-section-label">SOL Changes</div>
          ${changeRows}
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="tx-detail-header">
        <div class="modal-title">Transaction Details</div>
        <button id="tx-detail-close" class="receive-close-btn">${Icons.close}</button>
      </div>

      <div class="tx-detail-status-bar">
        <span class="tx-detail-status ${statusClass}">${statusLabel}</span>
        <span class="tx-detail-time">${timeStr}</span>
        ${d.txStatus ? `<span class="tx-detail-tag-sm">${d.txStatus}</span>` : ''}
      </div>

      ${tagHtml ? `<div class="tx-detail-tags">${tagHtml}</div>` : ''}

      <div class="tx-detail-section">
        <div class="tx-detail-row">
          <span class="tx-detail-label">Signature</span>
          <span class="tx-detail-value tx-detail-mono">${d.hash.slice(0, 14)}...${d.hash.slice(-8)}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Block</span>
          <span class="tx-detail-value">${(d.blockNumber || 0).toLocaleString()}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Signer</span>
          <span class="tx-detail-value tx-detail-mono">${d.signers?.[0] ? d.signers[0].slice(0, 10) + '...' + d.signers[0].slice(-6) : '—'}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Fee</span>
          <span class="tx-detail-value">${d.fee} SOL</span>
        </div>
        ${d.computeUnits ? `
          <div class="tx-detail-row">
            <span class="tx-detail-label">Compute Units</span>
            <span class="tx-detail-value">${d.computeUnits.toLocaleString()}</span>
          </div>
        ` : ''}
      </div>

      ${solChangesHtml}
      ${transfersHtml}
      ${programsHtml}

      <div class="tx-detail-footer">
        <button class="btn-explorer" id="tx-open-explorer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open In Explorer
        </button>
      </div>
    `;

    this.el('tx-detail-close').addEventListener('click', () => this.closeModal());
    this.el('tx-open-explorer').addEventListener('click', () => {
      window.electronAPI.shell.openExternal(`https://solscan.io/tx/${d.hash}`);
    });
  }

  private readonly utxoExplorerUrls: Record<string, string> = {
    bitcoin: 'https://mempool.space/tx/',
    litecoin: 'https://litecoinspace.org/tx/',
    dogecoin: 'https://blockchair.com/dogecoin/transaction/',
  };

  private renderUtxoTxDetail(d: any) {
    const modal = document.querySelector('.tx-detail-modal');
    if (!modal) return;

    const isPending = d.status === 'pending';
    const statusClass = isPending ? 'tx-detail-status-pending' : 'tx-detail-status-ok';
    const statusLabel = isPending ? 'Pending' : 'Confirmed';
    const timeStr = d.timestamp
      ? new Date(d.timestamp).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';

    const chainLabel = d.chain.charAt(0).toUpperCase() + d.chain.slice(1);

    // Inputs table
    let inputsHtml = '';
    if (d.inputs && d.inputs.length > 0) {
      const rows = d.inputs.map((inp: any) => `
        <div class="tx-detail-utxo-row">
          <span class="tx-detail-utxo-addr tx-detail-mono">${inp.address === 'coinbase' ? 'Coinbase' : inp.address.slice(0, 10) + '...' + inp.address.slice(-6)}</span>
          <span class="tx-detail-utxo-val">${inp.value} ${d.symbol}</span>
        </div>
      `).join('');
      inputsHtml = `
        <div class="tx-detail-section">
          <div class="tx-detail-section-label">Inputs (${d.inputs.length})</div>
          ${rows}
        </div>
      `;
    }

    // Outputs table
    let outputsHtml = '';
    if (d.outputs && d.outputs.length > 0) {
      const rows = d.outputs.map((out: any) => `
        <div class="tx-detail-utxo-row">
          <span class="tx-detail-utxo-addr tx-detail-mono">${out.address === 'Unknown' ? 'OP_RETURN' : out.address.slice(0, 10) + '...' + out.address.slice(-6)}</span>
          <span class="tx-detail-utxo-val">${out.value} ${d.symbol}</span>
        </div>
      `).join('');
      outputsHtml = `
        <div class="tx-detail-section">
          <div class="tx-detail-section-label">Outputs (${d.outputs.length})</div>
          ${rows}
        </div>
      `;
    }

    const explorerBase = this.utxoExplorerUrls[d.chain] || this.txExplorerUrls[d.chain] || '#';

    modal.innerHTML = `
      <div class="tx-detail-header">
        <div class="modal-title">${chainLabel} Transaction</div>
        <button id="tx-detail-close" class="receive-close-btn">${Icons.close}</button>
      </div>

      <div class="tx-detail-status-bar">
        <span class="tx-detail-status ${statusClass}">${statusLabel}</span>
        <span class="tx-detail-time">${timeStr}</span>
      </div>

      <div class="tx-detail-section">
        <div class="tx-detail-row">
          <span class="tx-detail-label">Hash</span>
          <span class="tx-detail-value tx-detail-mono">${d.hash.slice(0, 14)}...${d.hash.slice(-8)}</span>
        </div>
        ${d.blockNumber ? `
        <div class="tx-detail-row">
          <span class="tx-detail-label">Block</span>
          <span class="tx-detail-value">${d.blockNumber.toLocaleString()}</span>
        </div>` : ''}
        <div class="tx-detail-row">
          <span class="tx-detail-label">Fee</span>
          <span class="tx-detail-value">${d.fee} ${d.symbol}</span>
        </div>
        ${d.size ? `
        <div class="tx-detail-row">
          <span class="tx-detail-label">Size</span>
          <span class="tx-detail-value">${d.size} bytes${d.weight ? ` / ${d.weight} WU` : ''}</span>
        </div>` : ''}
        <div class="tx-detail-row">
          <span class="tx-detail-label">Confirmations</span>
          <span class="tx-detail-value">${d.confirmations}</span>
        </div>
      </div>

      ${inputsHtml}
      ${outputsHtml}

      ${d.totalIn && d.totalOut ? `
      <div class="tx-detail-section">
        <div class="tx-detail-row">
          <span class="tx-detail-label">Total In</span>
          <span class="tx-detail-value">${d.totalIn} ${d.symbol}</span>
        </div>
        <div class="tx-detail-row">
          <span class="tx-detail-label">Total Out</span>
          <span class="tx-detail-value">${d.totalOut} ${d.symbol}</span>
        </div>
      </div>` : ''}

      <div class="tx-detail-footer">
        <button class="btn-explorer" id="tx-open-explorer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open In Explorer
        </button>
      </div>
    `;

    this.el('tx-detail-close').addEventListener('click', () => this.closeModal());
    this.el('tx-open-explorer').addEventListener('click', () => {
      window.electronAPI.shell.openExternal(`${explorerBase}${d.hash}`);
    });
  }

  /* ============================================================
     Account Actions
     ============================================================ */

  private showAccountKeys() {
    this.showModal(`
      <div class="receive-modal">
        <div class="receive-modal-header">
          <div class="modal-title">Private Keys</div>
          <button id="keys-modal-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="modal-desc">Enter your password to reveal private keys for this account.</div>
        <div class="keys-password-wrap">
          <input type="password" id="keys-password" class="input" placeholder="Enter password" autocomplete="off" />
          <div id="keys-error" class="keys-error"></div>
        </div>
        <div class="modal-actions">
          <button id="keys-unlock-btn" class="btn-primary">Unlock</button>
          <button id="keys-cancel-btn" class="btn-secondary">Cancel</button>
        </div>
      </div>
    `);

    this.el('keys-modal-close').addEventListener('click', () => this.closeModal());
    this.el('keys-cancel-btn').addEventListener('click', () => this.closeModal());

    const passwordInput = this.el('keys-password') as HTMLInputElement;
    passwordInput.focus();

    const doUnlock = async () => {
      const pw = passwordInput.value;
      if (!pw) return;
      const errorEl = this.el('keys-error');
      errorEl.textContent = '';

      const btn = this.el('keys-unlock-btn');
      btn.textContent = 'Verifying...';
      btn.setAttribute('disabled', 'true');

      try {
        const result = await window.electronAPI.wallet.getPrivateKeys(pw, this.state.currentAccountIndex);
        if (!result.success || !result.keys) {
          errorEl.textContent = result.error || 'Incorrect password';
          btn.textContent = 'Unlock';
          btn.removeAttribute('disabled');
          return;
        }
        this.renderPrivateKeys(result.keys);
      } catch {
        errorEl.textContent = 'Failed to retrieve keys';
        btn.textContent = 'Unlock';
        btn.removeAttribute('disabled');
      }
    };

    this.el('keys-unlock-btn').addEventListener('click', doUnlock);
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doUnlock();
    });
  }

  private renderPrivateKeys(keys: Array<{ chain: string; symbol: string; privateKey: string }>) {
    const modal = document.querySelector('.modal') as HTMLElement;
    if (!modal) return;

    const keysHTML = keys.map((k) => {
      const iconKey = this.chainIconFile[k.chain] || k.symbol.toLowerCase();
      return `
        <div class="key-row">
          <div class="key-row-header">
            <img src="./crypto-icons/${iconKey}.svg" alt="${k.symbol}" class="key-chain-icon" />
            <span class="key-chain-name">${k.symbol}</span>
            <button class="btn-copy key-copy-btn" data-key="${k.privateKey}" title="Copy private key">${Icons.copy}</button>
          </div>
          <div class="key-value">${k.privateKey}</div>
        </div>`;
    }).join('');

    modal.innerHTML = `
      <div class="receive-modal">
        <div class="receive-modal-header">
          <div class="modal-title">Private Keys</div>
          <button id="keys-modal-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="keys-warning">
          ${Icons.shield}
          <span>Never share your private keys. Anyone with access can steal your funds.</span>
        </div>
        <div class="keys-list">
          ${keysHTML}
        </div>
        <div class="modal-actions">
          <button id="keys-done-btn" class="btn-secondary">Done</button>
        </div>
      </div>
    `;

    this.el('keys-modal-close').addEventListener('click', () => this.closeModal());
    this.el('keys-done-btn').addEventListener('click', () => this.closeModal());

    document.querySelectorAll('.key-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const key = target.dataset.key!;
        navigator.clipboard.writeText(key);
        target.innerHTML = Icons.check;
        target.classList.add('copied');
        setTimeout(() => {
          target.innerHTML = Icons.copy;
          target.classList.remove('copied');
        }, 2000);
      });
    });
  }

  private async switchAccount(index: number) {
    const reqId = ++this.loadRequestId;
    this.state.currentAccountIndex = index;
    this.state.isLoading = true;
    this.state.transactions = []; // clear stale txs from previous account
    this.renderAccountsList();
    this.renderAccountView();

    // Fetch fresh data for this account
    await Promise.all([
      this.fetchPrices(),
      this.fetchAccountData(index),
    ]);
    if (this.loadRequestId !== reqId) return; // cancelled by another switch

    await this.fetchTokenBalances(index);
    if (this.loadRequestId !== reqId) return; // cancelled

    this.state.isLoading = false;
    this.renderAccountView();
    this.renderAccountsList();
    this.startAutoRefresh();
  }

  private async addAccount() {
    const supportedChains = [
      { chain: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
      { chain: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
      { chain: 'solana', symbol: 'SOL', name: 'Solana' },
      { chain: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
      { chain: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
    ];

    this.showModal(`
      <div class="receive-modal">
        <div class="receive-modal-header">
          <div class="modal-title">Add Account</div>
          <button id="add-acc-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="modal-desc">Choose how to add an account</div>
        <div class="add-acc-options">
          <button class="add-acc-option" id="add-acc-seed">
            <div class="add-acc-option-icon">${Icons.shield}</div>
            <div class="add-acc-option-info">
              <div class="add-acc-option-title">Create New Account</div>
              <div class="add-acc-option-desc">Derive from your recovery phrase — all currencies</div>
            </div>
            <span class="receive-chain-arrow"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
          <button class="add-acc-option" id="add-acc-import">
            <div class="add-acc-option-icon">${Icons.key}</div>
            <div class="add-acc-option-info">
              <div class="add-acc-option-title">Import Private Key</div>
              <div class="add-acc-option-desc">Import a single‑currency account by private key</div>
            </div>
            <span class="receive-chain-arrow"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
          <button class="add-acc-option" id="add-acc-watch">
            <div class="add-acc-option-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/></svg></div>
            <div class="add-acc-option-info">
              <div class="add-acc-option-title">Watch Address</div>
              <div class="add-acc-option-desc">View‑only — no send capability</div>
            </div>
            <span class="receive-chain-arrow"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
        </div>
      </div>
    `);

    this.el('add-acc-close').addEventListener('click', () => this.closeModal());

    // Option 1: Create from seed (existing behavior)
    this.el('add-acc-seed').addEventListener('click', async () => {
      this.closeModal();
      const res = await window.electronAPI.wallet.addAccount(this.state.password);
      if (res.success && res.account) {
        this.state.accounts.push(res.account);
        this.state.currentAccountIndex = this.state.accounts.length - 1;
        this.renderAccountsList();
        this.renderAccountView();
        this.refreshBalance();
      }
    });

    // Option 2: Import Private Key
    this.el('add-acc-import').addEventListener('click', () => {
      this.showImportKeyForm(supportedChains);
    });

    // Option 3: Watch Address
    this.el('add-acc-watch').addEventListener('click', () => {
      this.showWatchAddressForm(supportedChains);
    });
  }

  private showImportKeyForm(chains: Array<{ chain: string; symbol: string; name: string }>) {
    const modal = document.querySelector('.modal') as HTMLElement;
    if (!modal) return;

    const chainOptions = chains.map(c =>
      `<button class="receive-chain-item import-chain-opt" data-chain="${c.chain}" data-symbol="${c.symbol}" data-name="${c.name}">
        <div class="receive-chain-icon"><img src="./crypto-icons/${this.chainIconFile[c.chain] || c.symbol.toLowerCase()}.svg" alt="${c.symbol}" class="receive-chain-icon-img" /></div>
        <div class="receive-chain-info">
          <div class="receive-chain-name">${c.name}</div>
          <div class="receive-chain-sub">${c.symbol}</div>
        </div>
      </button>`
    ).join('');

    modal.innerHTML = `
      <div class="receive-modal">
        <div class="receive-modal-header">
          <button id="import-back-btn" class="receive-back-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="modal-title">Import Private Key</div>
          <button id="import-close-btn" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div id="import-step-1">
          <div class="modal-desc">Select the currency</div>
          <div class="receive-chain-list">${chainOptions}</div>
        </div>
        <div id="import-step-2" style="display:none">
          <div class="modal-desc">Enter the private key for <strong id="import-chain-label"></strong></div>
          <div class="field" style="margin-top:12px">
            <label class="field-label">Account Name (optional)</label>
            <input type="text" id="import-name" class="input" placeholder="My imported account" maxlength="50" />
          </div>
          <div class="field" style="margin-top:8px">
            <label class="field-label">Private Key</label>
            <input type="password" id="import-key-input" class="input input-mono" placeholder="Enter private key" autocomplete="off" />
          </div>
          <div id="import-error" class="modal-error"></div>
          <div class="modal-actions">
            <button id="import-confirm-btn" class="btn-primary">Import</button>
          </div>
        </div>
      </div>
    `;

    this.el('import-close-btn').addEventListener('click', () => this.closeModal());
    this.el('import-back-btn').addEventListener('click', () => {
      this.closeModal();
      this.addAccount();
    });

    let selectedChain = '';
    let selectedSymbol = '';

    document.querySelectorAll('.import-chain-opt').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        selectedChain = target.dataset.chain!;
        selectedSymbol = target.dataset.symbol!;
        const chainName = target.dataset.name!;
        this.el('import-chain-label').textContent = `${chainName} (${selectedSymbol})`;
        (this.el('import-step-1') as HTMLElement).style.display = 'none';
        (this.el('import-step-2') as HTMLElement).style.display = 'block';
        (this.el('import-key-input') as HTMLInputElement).focus();
      });
    });

    this.el('import-confirm-btn').addEventListener('click', async () => {
      const keyInput = this.el('import-key-input') as HTMLInputElement;
      const nameInput = this.el('import-name') as HTMLInputElement;
      const errEl = this.el('import-error');
      const key = keyInput.value.trim();
      if (!key) { errEl.textContent = 'Enter a private key'; return; }

      const btn = this.el('import-confirm-btn');
      btn.textContent = 'Importing...';
      btn.setAttribute('disabled', 'true');

      const res = await window.electronAPI.wallet.addImportedAccount(
        this.state.password, selectedChain, selectedSymbol, key, nameInput.value.trim() || undefined
      );

      if (res.success && res.account) {
        this.state.accounts.push(res.account);
        this.state.currentAccountIndex = this.state.accounts.length - 1;
        this.closeModal();
        this.renderAccountsList();
        this.renderAccountView();
        this.refreshBalance();
      } else {
        errEl.textContent = res.error || 'Invalid private key';
        btn.textContent = 'Import';
        btn.removeAttribute('disabled');
      }
    });
  }

  private showWatchAddressForm(chains: Array<{ chain: string; symbol: string; name: string }>) {
    const modal = document.querySelector('.modal') as HTMLElement;
    if (!modal) return;

    const chainOptions = chains.map(c =>
      `<button class="receive-chain-item watch-chain-opt" data-chain="${c.chain}" data-symbol="${c.symbol}" data-name="${c.name}">
        <div class="receive-chain-icon"><img src="./crypto-icons/${this.chainIconFile[c.chain] || c.symbol.toLowerCase()}.svg" alt="${c.symbol}" class="receive-chain-icon-img" /></div>
        <div class="receive-chain-info">
          <div class="receive-chain-name">${c.name}</div>
          <div class="receive-chain-sub">${c.symbol}</div>
        </div>
      </button>`
    ).join('');

    modal.innerHTML = `
      <div class="receive-modal">
        <div class="receive-modal-header">
          <button id="watch-back-btn" class="receive-back-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="modal-title">Watch Address</div>
          <button id="watch-close-btn" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div id="watch-step-1">
          <div class="modal-desc">Select the currency to watch</div>
          <div class="receive-chain-list">${chainOptions}</div>
        </div>
        <div id="watch-step-2" style="display:none">
          <div class="modal-desc">Enter the public address for <strong id="watch-chain-label"></strong></div>
          <div class="field" style="margin-top:12px">
            <label class="field-label">Account Name (optional)</label>
            <input type="text" id="watch-name" class="input" placeholder="My watched wallet" maxlength="50" />
          </div>
          <div class="field" style="margin-top:8px">
            <label class="field-label">Public Address</label>
            <input type="text" id="watch-addr-input" class="input input-mono" placeholder="Enter address" autocomplete="off" />
          </div>
          <div id="watch-error" class="modal-error"></div>
          <div class="modal-actions">
            <button id="watch-confirm-btn" class="btn-primary">Watch</button>
          </div>
        </div>
      </div>
    `;

    this.el('watch-close-btn').addEventListener('click', () => this.closeModal());
    this.el('watch-back-btn').addEventListener('click', () => {
      this.closeModal();
      this.addAccount();
    });

    let selectedChain = '';
    let selectedSymbol = '';

    document.querySelectorAll('.watch-chain-opt').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        selectedChain = target.dataset.chain!;
        selectedSymbol = target.dataset.symbol!;
        const chainName = target.dataset.name!;
        this.el('watch-chain-label').textContent = `${chainName} (${selectedSymbol})`;
        (this.el('watch-step-1') as HTMLElement).style.display = 'none';
        (this.el('watch-step-2') as HTMLElement).style.display = 'block';
        (this.el('watch-addr-input') as HTMLInputElement).focus();
      });
    });

    this.el('watch-confirm-btn').addEventListener('click', async () => {
      const addrInput = this.el('watch-addr-input') as HTMLInputElement;
      const nameInput = this.el('watch-name') as HTMLInputElement;
      const errEl = this.el('watch-error');
      const addr = addrInput.value.trim();
      if (!addr) { errEl.textContent = 'Enter an address'; return; }

      const btn = this.el('watch-confirm-btn');
      btn.textContent = 'Adding...';
      btn.setAttribute('disabled', 'true');

      const res = await window.electronAPI.wallet.addWatchAccount(
        this.state.password, selectedChain, selectedSymbol, addr, nameInput.value.trim() || undefined
      );

      if (res.success && res.account) {
        this.state.accounts.push(res.account);
        this.state.currentAccountIndex = this.state.accounts.length - 1;
        this.closeModal();
        this.renderAccountsList();
        this.renderAccountView();
        this.refreshBalance();
      } else {
        errEl.textContent = res.error || 'Invalid address';
        btn.textContent = 'Watch';
        btn.removeAttribute('disabled');
      }
    });
  }

  private startRenameAccount() {
    const acc = this.state.accounts[this.state.currentAccountIndex];
    const area = this.el('account-name-area');

    area.innerHTML = `
      <input type="text" id="rename-input" class="rename-input" value="${acc.name}" maxlength="50" />
      <button id="rename-save" class="btn-edit" title="Save">${Icons.check}</button>
      <button id="rename-cancel" class="btn-edit" title="Cancel">${Icons.close}</button>
    `;

    const input = this.el('rename-input') as HTMLInputElement;
    input.focus();
    input.select();

    const save = async () => {
      const newName = input.value.trim();
      if (!newName || newName.length < 1 || newName.length > 50) return;
      if (newName !== acc.name) {
        const res = await window.electronAPI.wallet.renameAccount(this.state.password, acc.index, newName);
        if (res.success) {
          acc.name = newName;
          this.renderAccountsList();
        }
      }
      this.renderAccountView();
    };

    const cancel = () => this.renderAccountView();

    this.el('rename-save').addEventListener('click', save);
    this.el('rename-cancel').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    });
  }

  private async loadBalances() {
    const reqId = ++this.loadRequestId;
    this.state.isLoading = true;
    this.renderAccountView();

    // Fetch prices + balances + tokens in parallel
    await Promise.all([
      this.fetchPrices(),
      this.fetchAccountData(this.state.currentAccountIndex),
    ]);
    if (this.loadRequestId !== reqId) return; // cancelled

    // Fetch token balances after we have prices
    await this.fetchTokenBalances(this.state.currentAccountIndex);
    if (this.loadRequestId !== reqId) return; // cancelled

    this.state.isLoading = false;
    this.renderAccountsList();
    this.renderAccountView();
    this.startAutoRefresh();

    // Background-fetch other accounts (balances only for sidebar cache)
    this.cacheOtherAccounts();
  }

  /** Fetch native coin prices from CoinGecko */
  private async fetchPrices() {
    try {
      const res = await window.electronAPI.wallet.getPrices(this.state.currency);
      if (res.success && res.prices) {
        for (const [chain, price] of Object.entries(res.prices)) {
          this.state.prices.set(chain, price);
        }
      }
    } catch (err) {
      console.log('Price fetch failed:', err);
    }
  }

  /** Fetch token balances for ETH/SOL chains of an account */
  private async fetchTokenBalances(accIndex: number) {
    const acc = this.state.accounts[accIndex];
    if (!acc) return;
    const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
    const tokenChains = chains.filter(c => c.chain === 'ethereum' || c.chain === 'solana');
    if (tokenChains.length === 0) return;

    await Promise.all(tokenChains.map(async (c) => {
      try {
        const res = await window.electronAPI.wallet.getTokenBalances(c.chain, c.address, this.state.currency);
        const key = `${c.chain}:${c.address}`;
        if (res.success && res.tokens) {
          this.state.tokenBalances.set(key, res.tokens);
        } else {
          this.state.tokenBalances.set(key, []);
        }
      } catch {
        /* swallow */
      }
    }));
  }

  /** Fetch balances + transactions for a single account by index */
  private async fetchAccountData(accIndex: number) {
    const acc = this.state.accounts[accIndex];
    if (!acc) return;
    const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
    const addrList = chains.map((c) => ({ chain: c.chain, symbol: c.symbol, address: c.address }));
    const res = await window.electronAPI.wallet.getAllBalances(addrList);
    if (res.success && res.data) {
      const allTxs: Transaction[] = [];
      for (const d of res.data) {
        const addr = chains.find((c) => c.chain === d.chain)?.address || '';
        this.state.balances.set(this.getChainBalanceKey(d.chain, addr), d.balance);
        for (const tx of d.transactions) {
          allTxs.push({ ...tx, chain: d.chain });
        }
      }
      // Only set transactions if this is still the active account
      if (accIndex === this.state.currentAccountIndex && allTxs.length > 0) {
        this.state.transactions = allTxs.sort((a, b) => b.timestamp - a.timestamp);
      }
    }
  }

  /** Background-fetch balances for non-active accounts (no txs needed) */
  private async cacheOtherAccounts() {
    const current = this.state.currentAccountIndex;
    const others = this.state.accounts.filter((_, i) => i !== current);
    await Promise.all(others.map(async (acc) => {
      const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
      const addrList = chains.map((c) => ({ chain: c.chain, symbol: c.symbol, address: c.address }));
      try {
        const res = await window.electronAPI.wallet.getAllBalances(addrList);
        if (res.success && res.data) {
          for (const d of res.data) {
            const addr = chains.find((c) => c.chain === d.chain)?.address || '';
            this.state.balances.set(this.getChainBalanceKey(d.chain, addr), d.balance);
          }
        }
      } catch { /* swallow — sidebar just stays with cached/zero */ }
    }));
    this.renderAccountsList();
  }

  /** Manual refresh — full skeleton + spinning icon */
  private async refreshBalance() {
    const reqId = ++this.loadRequestId;
    this.state.isLoading = true;
    this.state.transactions = [];
    this.renderAccountView();
    await Promise.all([
      this.fetchPrices(),
      this.fetchAccountData(this.state.currentAccountIndex),
    ]);
    if (this.loadRequestId !== reqId) return;
    await this.fetchTokenBalances(this.state.currentAccountIndex);
    if (this.loadRequestId !== reqId) return;
    this.state.isLoading = false;
    this.renderAccountView();
    this.renderAccountsList();
  }

  /** Auto-refresh — no skeleton, just spin the refresh icon */
  private async autoRefresh() {
    const reqId = this.loadRequestId; // don't increment — auto-refresh shouldn't cancel user actions
    this.setRefreshSpinning(true);
    await Promise.all([
      this.fetchPrices(),
      this.fetchAccountData(this.state.currentAccountIndex),
    ]);
    if (this.loadRequestId !== reqId) { this.setRefreshSpinning(false); return; }
    this.setRefreshSpinning(false);
    this.updateBalancesInPlace();
    this.renderTransactions();
    this.renderAccountsList();
  }

  private setRefreshSpinning(spinning: boolean) {
    const icon = document.getElementById('refresh-icon');
    if (!icon) return;
    if (spinning) {
      icon.classList.add('icon-spin');
    } else {
      icon.classList.remove('icon-spin');
    }
  }

  private startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => this.autoRefresh(), 15000);
  }

  private stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /* ============================================================
     Send Transaction
     ============================================================ */

  private sendState = {
    chain: '',
    symbol: '',
    address: '',
    balance: '',
    token: null as null | { contractAddress: string; decimals: number; symbol: string; name: string; balance: string; logoURI?: string },
    fees: { slow: 0, average: 0, fast: 0, unit: '' },
    feeRate: 0,
  };

  private showSendForm() {
    const acc = this.state.accounts[this.state.currentAccountIndex];
    const isSingle = acc.accountType === 'from_key' || acc.accountType === 'just_view';

    if (acc.accountType === 'just_view') {
      this.showModal(`
        <div class="send-modal">
          <div class="send-modal-header">
            <div class="modal-title">Send</div>
            <button id="send-modal-close" class="receive-close-btn">${Icons.close}</button>
          </div>
          <div class="modal-desc">Watch-only accounts cannot send transactions.</div>
        </div>
      `);
      this.el('send-modal-close').addEventListener('click', () => this.closeModal());
      return;
    }

    // Build currency list: only chains/tokens with balance > 0
    const currencies: Array<{
      chain: string; symbol: string; name: string; address: string;
      balance: string; icon: string;
      token?: { contractAddress: string; decimals: number; symbol: string; name: string; balance: string; logoURI?: string };
    }> = [];

    const chains = acc.addresses || [{ chain: isSingle ? (acc.singleChain || 'ethereum') : 'ethereum', symbol: isSingle ? (acc.singleSymbol || 'ETH') : 'ETH', name: isSingle ? (acc.singleChain || 'Ethereum') : 'Ethereum', address: acc.address }];

    for (const c of chains) {
      const balKey = `${c.chain}:${c.address}`;
      const bal = this.state.balances.get(balKey) || '0';
      if (parseFloat(bal) > 0) {
        currencies.push({
          chain: c.chain, symbol: c.symbol, name: c.name, address: c.address,
          balance: bal, icon: `./crypto-icons/${this.chainIconFile[c.chain] || c.symbol.toLowerCase()}.svg`,
        });
      }

      // Add tokens for ETH/SOL
      if (c.chain === 'ethereum' || c.chain === 'solana') {
        const tokens = this.state.tokenBalances.get(balKey) || [];
        for (const t of tokens) {
          if (parseFloat(t.balance) > 0) {
            currencies.push({
              chain: c.chain, symbol: t.symbol, name: t.name, address: c.address,
              balance: t.balance,
              icon: t.logoURI || `./crypto-icons/${this.chainIconFile[c.chain] || c.symbol.toLowerCase()}.svg`,
              token: { contractAddress: t.contractAddress, decimals: t.decimals, symbol: t.symbol, name: t.name, balance: t.balance, logoURI: t.logoURI },
            });
          }
        }
      }
    }

    if (currencies.length === 0) {
      this.showModal(`
        <div class="send-modal">
          <div class="send-modal-header">
            <div class="modal-title">Send</div>
            <button id="send-modal-close" class="receive-close-btn">${Icons.close}</button>
          </div>
          <div class="modal-desc">No currencies with a balance available to send.</div>
        </div>
      `);
      this.el('send-modal-close').addEventListener('click', () => this.closeModal());
      return;
    }

    // If single-chain with only one option, skip selection
    if (currencies.length === 1) {
      const c = currencies[0];
      this.sendState = {
        chain: c.chain, symbol: c.symbol, address: c.address, balance: c.balance,
        token: c.token || null, fees: { slow: 0, average: 0, fast: 0, unit: '' }, feeRate: 0,
      };
      this.showModal(`<div class="send-modal"></div>`);
      this.showSendFormDetails();
      return;
    }

    // Show currency selection
    const currHTML = currencies.map((c, i) => `
      <button class="send-currency-item" data-idx="${i}">
        <div class="send-currency-icon"><img src="${c.icon}" alt="${c.symbol}" onerror="this.style.display='none'" /></div>
        <div class="send-currency-info">
          <div class="send-currency-name">${c.symbol}</div>
          <div class="send-currency-sub">${c.name}${c.token ? ' (Token)' : ''}</div>
        </div>
        <div class="send-currency-bal">${parseFloat(c.balance).toFixed(6)}</div>
      </button>
    `).join('');

    this.showModal(`
      <div class="send-modal">
        <div class="send-modal-header">
          <div class="modal-title">Send</div>
          <button id="send-modal-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="modal-desc">Select a currency to send</div>
        <div class="send-currency-list">
          ${currHTML}
        </div>
      </div>
    `);

    this.el('send-modal-close').addEventListener('click', () => this.closeModal());

    document.querySelectorAll('.send-currency-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx!, 10);
        const c = currencies[idx];
        this.sendState = {
          chain: c.chain, symbol: c.symbol, address: c.address, balance: c.balance,
          token: c.token || null, fees: { slow: 0, average: 0, fast: 0, unit: '' }, feeRate: 0,
        };
        this.showSendFormDetails();
      });
    });
  }

  private async showSendFormDetails() {
    const modal = document.querySelector('.send-modal');
    if (!modal) return;

    const { chain, symbol, balance, token } = this.sendState;
    const placeholders: Record<string, string> = {
      ethereum: '0x...', bitcoin: 'bc1... or 1...', solana: 'Base58 address',
      litecoin: 'ltc1... or L...', dogecoin: 'D...',
    };

    modal.innerHTML = `
      <div class="send-modal-header">
        <div class="send-header-left">
          <button id="send-back-btn" class="send-back-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 13L5 8L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="modal-title">Send ${symbol}</div>
        </div>
        <button id="send-modal-close" class="receive-close-btn">${Icons.close}</button>
      </div>

      <div class="send-balance-row">
        <span class="send-balance-label">Available</span>
        <span class="send-balance-value">${parseFloat(token ? token.balance : balance).toFixed(6)} ${symbol}</span>
      </div>

      <div class="send-field-group">
        <label class="send-field-label">Recipient</label>
        <input type="text" id="send-to" class="input input-mono" placeholder="${placeholders[chain] || 'Address'}" autocomplete="off" spellcheck="false" />
      </div>

      <div class="send-field-group">
        <label class="send-field-label">Amount</label>
        <div class="send-amount-wrap">
          <input type="text" id="send-amount" class="input send-amount-input" placeholder="0.00" autocomplete="off" />
          <button id="send-max-btn" class="send-max-btn">MAX</button>
        </div>
      </div>

      <div class="send-advanced-toggle" id="send-advanced-toggle">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 5L8 11L14 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Advanced
      </div>

      <div class="send-advanced-panel" id="send-advanced-panel" style="display: none;">
        <div class="send-fee-section">
          <div class="send-fee-header">
            <span class="send-field-label">Fee Priority</span>
            <span class="send-fee-value" id="send-fee-display">Loading...</span>
          </div>
          <div class="send-slider-wrap">
            <div class="send-slider-track" id="send-slider-track">
              <div class="send-slider-fill" id="send-slider-fill"></div>
              <div class="send-slider-thumb" id="send-slider-thumb"></div>
            </div>
            <div class="send-slider-labels">
              <span>Slow</span>
              <span>Average</span>
              <span>Fast</span>
            </div>
          </div>
        </div>
      </div>

      <div id="send-status" class="send-status"></div>

      <div class="send-actions">
        <button id="send-confirm-btn" class="btn-primary send-confirm-btn">Send ${symbol}</button>
      </div>
    `;

    this.el('send-modal-close').addEventListener('click', () => this.closeModal());
    this.el('send-back-btn').addEventListener('click', () => this.showSendForm());
    this.el('send-confirm-btn').addEventListener('click', () => this.executeSend());

    // MAX button
    this.el('send-max-btn').addEventListener('click', () => {
      const amtEl = this.el('send-amount') as HTMLInputElement;
      amtEl.value = token ? token.balance : balance;
    });

    // Advanced toggle
    this.el('send-advanced-toggle').addEventListener('click', () => {
      const panel = this.el('send-advanced-panel');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      const toggle = this.el('send-advanced-toggle');
      toggle.classList.toggle('open', !isOpen);
    });

    // Load fees and init slider
    this.initFeeSlider();
  }

  private async initFeeSlider() {
    const { chain } = this.sendState;
    const display = document.getElementById('send-fee-display');

    try {
      const res = await window.electronAPI.wallet.estimateFees(chain);
      if (res.success && res.fees) {
        this.sendState.fees = res.fees;
        this.sendState.feeRate = res.fees.average;
        if (display) display.textContent = `${res.fees.average.toFixed(2)} ${res.fees.unit}`;
      }
    } catch {
      if (display) display.textContent = 'Default';
    }

    this.setupSliderInteraction();
  }

  private setupSliderInteraction() {
    const track = document.getElementById('send-slider-track');
    const thumb = document.getElementById('send-slider-thumb');
    const fill = document.getElementById('send-slider-fill');
    const display = document.getElementById('send-fee-display');
    if (!track || !thumb || !fill) return;

    const { slow, fast, unit } = this.sendState.fees;
    if (fast <= 0) return;

    const setPosition = (pct: number) => {
      pct = Math.max(0, Math.min(1, pct));
      const feeVal = slow + (fast - slow) * pct;
      this.sendState.feeRate = feeVal;
      thumb.style.left = `${pct * 100}%`;
      fill.style.width = `${pct * 100}%`;
      if (display) display.textContent = `${feeVal.toFixed(2)} ${unit}`;
    };

    // Set initial to average (50%)
    const avgPct = fast > slow ? (this.sendState.fees.average - slow) / (fast - slow) : 0.5;
    setPosition(avgPct);

    const onMove = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      setPosition(pct);
    };

    // Mouse events
    let dragging = false;
    const onMouseMove = (e: MouseEvent) => { if (dragging) onMove(e.clientX); };
    const onMouseUp = () => { dragging = false; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };

    thumb.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    track.addEventListener('click', (e) => {
      onMove(e.clientX);
    });
  }

  private async executeSend() {
    const toEl = document.getElementById('send-to') as HTMLInputElement;
    const amtEl = document.getElementById('send-amount') as HTMLInputElement;
    const st = document.getElementById('send-status');
    const btn = document.getElementById('send-confirm-btn') as HTMLButtonElement;
    if (!toEl || !amtEl || !st || !btn) return;

    const to = toEl.value.trim();
    const amount = amtEl.value.trim();

    if (!to) { st.className = 'send-status send-error'; st.textContent = 'Enter a recipient address'; return; }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      st.className = 'send-status send-error'; st.textContent = 'Enter a valid amount'; return;
    }

    const maxBal = this.sendState.token ? this.sendState.token.balance : this.sendState.balance;
    if (parseFloat(amount) > parseFloat(maxBal)) {
      st.className = 'send-status send-error'; st.textContent = 'Insufficient balance'; return;
    }

    // Disable button and show progress
    btn.disabled = true;
    btn.textContent = 'Sending...';
    st.className = 'send-status';
    st.textContent = '';

    try {
      // Get private keys for the chain
      const keysRes = await window.electronAPI.wallet.getPrivateKeys(
        this.state.password,
        this.state.currentAccountIndex,
      );

      if (!keysRes.success || !keysRes.keys) {
        throw new Error('Failed to retrieve private keys');
      }

      // Find matching key for the chain
      const { chain, address, feeRate, token } = this.sendState;
      const chainKey = keysRes.keys.find((k) => k.chain === chain);
      if (!chainKey) {
        throw new Error(`No private key found for ${chain}`);
      }

      const res = await window.electronAPI.wallet.sendMultiChain({
        chain,
        privateKey: chainKey.privateKey,
        fromAddress: address,
        toAddress: to,
        amount,
        feeRate: feeRate > 0 ? feeRate : undefined,
        token: token ? { contractAddress: token.contractAddress, decimals: token.decimals, symbol: token.symbol } : undefined,
      });

      if (res.success && res.txHash) {
        st.className = 'send-status send-success';
        const shortHash = res.txHash.length > 20 ? res.txHash.slice(0, 10) + '...' + res.txHash.slice(-6) : res.txHash;
        st.innerHTML = `<span class="send-success-icon">${Icons.check}</span> Sent — ${shortHash}`;
        btn.textContent = 'Done';
        btn.disabled = true;

        // Refresh after delay
        setTimeout(() => {
          this.closeModal();
          this.refreshBalance();
        }, 2500);
      } else {
        throw new Error(res.error || 'Transaction failed');
      }
    } catch (err) {
      st.className = 'send-status send-error';
      st.textContent = err instanceof Error ? err.message : 'Transaction failed';
      btn.disabled = false;
      btn.textContent = `Send ${this.sendState.symbol}`;
    }
  }

  /* ============================================================
     Receive — Chain & Token Selection
     ============================================================ */

  private tokenListCache: { ethereum: any[]; solana: any[] } | null = null;

  private readonly chainIconFile: Record<string, string> = {
    ethereum: 'eth', bitcoin: 'btc', solana: 'sol', litecoin: 'ltc', dogecoin: 'doge',
  };

  private readonly explorerUrls: Record<string, string> = {
    bitcoin: 'https://mempool.space/address/',
    ethereum: 'https://etherscan.io/address/',
    solana: 'https://solscan.io/account/',
    litecoin: 'https://live.blockcypher.com/ltc/address/',
    dogecoin: 'https://live.blockcypher.com/doge/address/',
  };

  private async fetchTokenLists(): Promise<{ ethereum: any[]; solana: any[] }> {
    if (this.tokenListCache) return this.tokenListCache;

    try {
      const res = await window.electronAPI.wallet.getTokenList();
      if (res.success && res.data) {
        this.tokenListCache = res.data;
        return this.tokenListCache;
      }
      return { ethereum: [], solana: [] };
    } catch {
      return { ethereum: [], solana: [] };
    }
  }

  private showReceive() {
    const acc = this.state.accounts[this.state.currentAccountIndex];
    const chains = acc.addresses || [{ chain: 'ethereum', symbol: 'ETH', name: 'Ethereum', address: acc.address }];
    const isSingle = acc.accountType === 'from_key' || acc.accountType === 'just_view';

    const hasTokens = (chain: string) => chain === 'ethereum' || chain === 'solana';

    // Single-chain accounts skip chain selection entirely
    if (isSingle && chains.length === 1) {
      const c = chains[0];
      if (hasTokens(c.chain)) {
        this.showModal(`<div class="receive-modal"></div>`);
        this.showTokenList(c.chain, c.symbol, c.name, c.address, true);
      } else {
        this.showModal(`<div class="receive-modal"></div>`);
        this.showReceiveAddress(c.name, c.symbol, c.address, null, c.chain, true);
      }
      return;
    }

    const chainsHTML = chains.map((c) => `
      <button class="receive-chain-item" data-chain="${c.chain}" data-symbol="${c.symbol}" data-name="${c.name}" data-address="${c.address}">
        <div class="receive-chain-icon"><img src="./crypto-icons/${this.chainIconFile[c.chain] || c.symbol.toLowerCase()}.svg" alt="${c.symbol}" class="receive-chain-icon-img" /></div>
        <div class="receive-chain-info">
          <div class="receive-chain-name">${c.name}</div>
          <div class="receive-chain-sub">${hasTokens(c.chain) ? 'Select a token to receive' : c.symbol + ' only'}</div>
        </div>
        <span class="receive-chain-arrow">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
    `).join('');

    this.showModal(`
      <div class="receive-modal">
        <div class="receive-modal-header">
          <div class="modal-title">Receive</div>
          <button id="receive-modal-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="modal-desc">Select a chain to receive tokens on</div>
        <div class="receive-chain-list" id="receive-chain-list">
          ${chainsHTML}
        </div>
      </div>
    `);

    this.el('receive-modal-close').addEventListener('click', () => this.closeModal());

    document.querySelectorAll('.receive-chain-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement);
        const chain = target.dataset.chain!;
        const symbol = target.dataset.symbol!;
        const name = target.dataset.name!;
        const address = target.dataset.address!;

        if (hasTokens(chain)) {
          this.showTokenList(chain, symbol, name, address);
        } else {
          this.showReceiveAddress(name, symbol, address, null, chain);
        }
      });
    });
  }

  private async showTokenList(chain: string, nativeSymbol: string, chainName: string, chainAddress: string, singleChain: boolean = false) {
    const modal = document.querySelector('.modal') as HTMLElement;
    if (!modal) return;

    modal.innerHTML = `
      <div class="receive-modal">
        <div class="receive-modal-header">
          ${singleChain ? '' : `<button id="receive-back-btn" class="receive-back-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>`}
          <div class="modal-title">${chainName} Tokens</div>
          <button id="receive-modal-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="receive-search-wrap">
          <input type="text" id="token-search" class="input receive-search" placeholder="Search by name or symbol..." autocomplete="off" />
        </div>
        <div class="receive-token-list" id="receive-token-list">
          <div class="receive-loading">Loading tokens...</div>
        </div>
      </div>
    `;

    this.el('receive-modal-close').addEventListener('click', () => this.closeModal());
    if (!singleChain) {
      this.el('receive-back-btn').addEventListener('click', () => {
        this.closeModal();
        this.showReceive();
      });
    }

    const lists = await this.fetchTokenLists();
    const rawTokens = chain === 'solana' ? lists.solana : lists.ethereum;

    /* Priority tokens at top */
    const priorityAddresses: Record<string, string[]> = {
      solana: [
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',   // USDT
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',   // USDC
      ],
      ethereum: [
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',      // USDT
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',      // USDC
        '0x6B175474E89094C44Da98b954EedeAC495271d0F',       // DAI
      ],
    };

    const prioritySet = new Set((priorityAddresses[chain] || []).map((a) => a.toLowerCase()));
    const priorityTokens = rawTokens.filter((t: any) => prioritySet.has(t.address.toLowerCase()));
    const otherTokens = rawTokens.filter((t: any) => !prioritySet.has(t.address.toLowerCase()));

    /* Native token as first entry */
    const nativeIconKey = this.chainIconFile[chain] || nativeSymbol.toLowerCase();
    const nativeToken = {
      address: chainAddress,
      symbol: nativeSymbol,
      name: chainName,
      logoURI: `./crypto-icons/${nativeIconKey}.svg`,
      isNative: true,
    };

    const allTokens = [nativeToken, ...priorityTokens, ...otherTokens];

    const renderTokens = (tokens: any[]) => {
      const listEl = this.el('receive-token-list');
      if (tokens.length === 0) {
        listEl.innerHTML = `<div class="receive-empty">No tokens found</div>`;
        return;
      }

      listEl.innerHTML = tokens.map((t: any) => {
        const isLocalIcon = t.isNative || (t.logoURI && t.logoURI.startsWith('./crypto-icons/'));
        const logoClass = isLocalIcon ? 'receive-token-logo receive-token-logo--native' : 'receive-token-logo';
        const logoSrc = t.logoURI ? `<img src="${t.logoURI}" alt="" class="${logoClass}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="receive-token-fallback" style="display:none">${t.symbol.charAt(0)}</span>` : `<span class="receive-token-fallback">${t.symbol.charAt(0)}</span>`;
        return `
          <button class="receive-token-item" data-address="${chainAddress}" data-symbol="${t.symbol}" data-name="${t.name}" data-token-address="${t.address}" data-is-native="${t.isNative || false}">
            <div class="receive-token-icon">${logoSrc}</div>
            <div class="receive-token-info">
              <div class="receive-token-symbol">${t.symbol}</div>
              <div class="receive-token-name">${t.name}</div>
            </div>
          </button>
        `;
      }).join('');

      listEl.querySelectorAll('.receive-token-item').forEach((el) => {
        el.addEventListener('click', (e) => {
          const target = (e.currentTarget as HTMLElement);
          const addr = target.dataset.address!;
          const symbol = target.dataset.symbol!;
          const name = target.dataset.name!;
          const isNative = target.dataset.isNative === 'true';
          const tokenAddr = target.dataset.tokenAddress!;
          this.showReceiveAddress(name, symbol, addr, isNative ? null : tokenAddr, chain, singleChain);
        });
      });
    };

    renderTokens(allTokens);

    /* Search filtering */
    const searchInput = this.el('token-search') as HTMLInputElement;
    searchInput.focus();
    let debounceTimer: ReturnType<typeof setTimeout>;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) {
          renderTokens(allTokens);
          return;
        }
        const filtered = allTokens.filter(
          (t: any) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
        );
        renderTokens(filtered);
      }, 150);
    });
  }

  private showReceiveAddress(name: string, symbol: string, address: string, tokenAddress: string | null, chain: string, singleChain: boolean = false) {
    const modal = document.querySelector('.modal') as HTMLElement;
    if (!modal) return;

    const displayLabel = tokenAddress
      ? `${symbol} on ${name.includes('Ethereum') ? 'Ethereum' : name.includes('Solana') ? 'Solana' : name}`
      : `${symbol}`;

    const explorerUrl = this.explorerUrls[chain];
    const iconKey = this.chainIconFile[chain] || symbol.toLowerCase();

    modal.innerHTML = `
      <div class="receive-modal">
        <div class="receive-modal-header">
          ${singleChain && !tokenAddress ? '' : `<button id="receive-back-token" class="receive-back-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>`}
          <div class="modal-title">Receive ${displayLabel}</div>
          <button id="receive-modal-close" class="receive-close-btn">${Icons.close}</button>
        </div>
        <div class="receive-qr-wrap" id="receive-qr-wrap"></div>
        <div class="receive-address-card">
          <div class="receive-address-label">Your ${name} address</div>
          <div class="receive-address-value">${address}</div>
          ${tokenAddress ? `<div class="receive-token-contract"><span class="receive-contract-label">Token contract</span><span class="receive-contract-value">${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-6)}</span></div>` : ''}
        </div>
        <div class="modal-actions">
          <button id="receive-copy-addr" class="btn-primary">Copy Address</button>
          ${tokenAddress ? `<button id="receive-copy-contract" class="btn-secondary">Copy Contract</button>` : `<button id="receive-done" class="btn-secondary">Done</button>`}
        </div>
        ${explorerUrl ? `<button id="receive-explorer" class="receive-explorer-btn">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3H3V13H13V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 2H14V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2L7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Open in Explorer
        </button>` : ''}
      </div>
    `;

    /* Generate QR code with centered coin icon */
    this.generateQRCode(address, iconKey);

    this.el('receive-modal-close').addEventListener('click', () => this.closeModal());
    if (!singleChain || tokenAddress) {
      this.el('receive-back-token').addEventListener('click', () => {
        if (singleChain && tokenAddress) {
          // Go back to token list for single-chain ETH/SOL
          const acc = this.state.accounts[this.state.currentAccountIndex];
          const c = (acc.addresses || [])[0];
          if (c) {
            this.showTokenList(c.chain, c.symbol, c.name, c.address, true);
          } else {
            this.closeModal();
          }
        } else {
          this.closeModal();
          this.showReceive();
        }
      });
    }

    this.el('receive-copy-addr').addEventListener('click', () => {
      navigator.clipboard.writeText(address);
      const btn = this.el('receive-copy-addr');
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy Address'; }, 2000);
    });

    if (tokenAddress) {
      this.el('receive-copy-contract').addEventListener('click', () => {
        navigator.clipboard.writeText(tokenAddress);
        const btn = this.el('receive-copy-contract');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy Contract'; }, 2000);
      });
    } else {
      this.el('receive-done').addEventListener('click', () => this.closeModal());
    }

    if (explorerUrl) {
      this.el('receive-explorer').addEventListener('click', () => {
        window.open(explorerUrl + address, '_blank');
      });
    }
  }

  private async generateQRCode(address: string, iconKey: string) {
    const wrap = this.el('receive-qr-wrap');
    if (!wrap) return;

    try {
      const canvas = document.createElement('canvas');
      const size = 200;
      await QRCode.toCanvas(canvas, address, {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#ececec',
          light: '#161616',
        },
      });

      /* Draw coin icon in center */
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const iconSize = 28;
        const iconPad = 6;
        const bgSize = iconSize + iconPad * 2;

        /* Dark circle background behind icon */
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, bgSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#161616';
        ctx.fill();

        /* Load and draw coin icon */
        const img = new Image();
        img.src = `./crypto-icons/${iconKey}.svg`;
        img.onload = () => {
          const ix = (size - iconSize) / 2;
          const iy = (size - iconSize) / 2;
          ctx.drawImage(img, ix, iy, iconSize, iconSize);
        };
      }

      canvas.classList.add('receive-qr-canvas');
      wrap.appendChild(canvas);
    } catch {
      wrap.innerHTML = `<div class="receive-qr-error">QR code unavailable</div>`;
    }
  }

  private showSettings() {
    this.stopAutoRefresh();
    const view = this.el('main-view');
    const curEntry = CURRENCIES[this.state.currency];
    const curLabel = `${this.state.currency} — ${curEntry.name}`;
    const curItems = Object.entries(CURRENCIES).map(([code, c]) =>
      `<div class="custom-select-item${code === this.state.currency ? ' selected' : ''}" data-value="${code}">
        <span>${code} — ${c.name}</span>
        ${code === this.state.currency ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
      </div>`
    ).join('');

    view.innerHTML = `
      <div class="settings-view">
        <div class="settings-header">
          <button id="settings-back-btn" class="settings-back">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Back
          </button>
          <h2>Settings</h2>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">Display</div>
          <div class="settings-card">
            <div class="settings-row">
              <div>
                <div class="settings-row-title">Currency</div>
                <div class="settings-row-desc">Choose your display currency</div>
              </div>
              <div class="custom-select" id="currency-select">
                <button class="custom-select-trigger" id="currency-trigger">
                  <span id="currency-label">${curLabel}</span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="custom-select-dropdown" id="currency-dropdown">
                  ${curItems}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">Security</div>
          <div class="settings-card">
            <button class="settings-row settings-row-btn" id="view-phrase-btn">
              <div>
                <div class="settings-row-title">Recovery Phrase</div>
                <div class="settings-row-desc">View your 12-word recovery phrase</div>
              </div>
              <span class="settings-chevron">›</span>
            </button>
            <button class="settings-row settings-row-btn" id="change-pw-btn">
              <div>
                <div class="settings-row-title">Change Password</div>
                <div class="settings-row-desc">Update your wallet encryption password</div>
              </div>
              <span class="settings-chevron">›</span>
            </button>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">Accounts</div>
          <div class="settings-card">
            <button class="settings-row settings-row-btn" id="manage-accounts-btn">
              <div>
                <div class="settings-row-title">Manage Accounts</div>
                <div class="settings-row-desc">Remove accounts from your wallet</div>
              </div>
              <span class="settings-chevron">›</span>
            </button>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">Wallet</div>
          <div class="settings-card">
            <button class="settings-row settings-row-btn" id="lock-btn">
              <div>
                <div class="settings-row-title">Lock Wallet</div>
                <div class="settings-row-desc">Return to the unlock screen</div>
              </div>
              <span class="settings-chevron">›</span>
            </button>
            <button class="settings-row settings-row-btn settings-row-danger" id="reset-btn">
              <div>
                <div class="settings-row-title">Reset Wallet</div>
                <div class="settings-row-desc">Delete all data and create a new wallet</div>
              </div>
              <span class="settings-chevron">›</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Custom currency dropdown
    const trigger = this.el('currency-trigger');
    const dropdown = this.el('currency-dropdown');
    const selectWrap = this.el('currency-select');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      selectWrap.classList.toggle('open');
    });

    dropdown.querySelectorAll('.custom-select-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = (item as HTMLElement).dataset.value!;
        if (code === this.state.currency) {
          selectWrap.classList.remove('open');
          return;
        }
        this.state.currency = code;
        localStorage.setItem('zerocore-currency', this.state.currency);
        // Update label
        const entry = CURRENCIES[code];
        this.el('currency-label').textContent = `${code} — ${entry.name}`;
        // Update selected state
        dropdown.querySelectorAll('.custom-select-item').forEach((si) => {
          const isSelected = (si as HTMLElement).dataset.value === code;
          si.classList.toggle('selected', isSelected);
          const checkSvg = si.querySelector('svg');
          if (isSelected && !checkSvg) {
            si.insertAdjacentHTML('beforeend', '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
          } else if (!isSelected && checkSvg) {
            checkSvg.remove();
          }
        });
        selectWrap.classList.remove('open');
        // Clear backend price caches so prices re-fetch in new currency
        await window.electronAPI.wallet.clearPriceCaches();
        // Clear frontend price + token caches
        this.state.prices.clear();
        this.state.tokenBalances.clear();
        // Re-render immediately with zeroed prices, then fetch fresh
        this.renderAccountsList();
        this.loadBalances();
      });
    });

    // Close dropdown when clicking outside
    const closeDropdown = () => selectWrap.classList.remove('open');
    document.addEventListener('click', closeDropdown);
    // Clean up when leaving settings (using MutationObserver)
    const observer = new MutationObserver(() => {
      if (!document.contains(selectWrap)) {
        document.removeEventListener('click', closeDropdown);
        observer.disconnect();
      }
    });
    observer.observe(view, { childList: true });

    this.el('settings-back-btn').addEventListener('click', () => this.renderAccountView());
    this.el('manage-accounts-btn').addEventListener('click', () => this.showManageAccounts());
    this.el('view-phrase-btn').addEventListener('click', () => this.viewRecoveryPhrase());
    this.el('change-pw-btn').addEventListener('click', () => this.showChangePassword());
    this.el('lock-btn').addEventListener('click', () => this.lockWallet());
    this.el('reset-btn').addEventListener('click', () => this.showResetWallet());
  }

  /* ============================================================
     Modal Helpers
     ============================================================ */

  private handleModalEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.closeModal();
  };

  private showModal(content: string): void {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">${content}</div>`;
    document.getElementById('app')!.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });
    document.addEventListener('keydown', this.handleModalEscape);
  }

  private closeModal(): void {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', this.handleModalEscape);
  }

  /* ============================================================
     Settings Actions
     ============================================================ */

  private viewRecoveryPhrase() {
    this.showModal(`
      <div class="modal-title">View Recovery Phrase</div>
      <div class="modal-desc">Enter your password to reveal your recovery phrase. Never share this with anyone.</div>
      <div class="field">
        <label class="field-label" for="modal-pw">Password</label>
        <input type="password" id="modal-pw" class="input" placeholder="Enter password" autocomplete="current-password" />
      </div>
      <div id="modal-error" class="modal-error"></div>
      <div id="phrase-display"></div>
      <div class="modal-actions">
        <button id="modal-confirm" class="btn-primary">Reveal</button>
        <button id="modal-cancel" class="btn-secondary">Cancel</button>
      </div>
    `);

    const pwInput = this.el('modal-pw') as HTMLInputElement;
    pwInput.focus();

    this.el('modal-confirm').addEventListener('click', async () => {
      const pw = pwInput.value;
      if (!pw) { this.el('modal-error').textContent = 'Enter your password'; return; }

      const res = await window.electronAPI.wallet.getMnemonic(pw);
      if (res.success && res.mnemonic) {
        const words = res.mnemonic.split(' ');
        this.el('phrase-display').innerHTML = `
          <div class="mnemonic-grid" style="margin-top: 16px;">
            ${words.map((w, i) => `
              <div class="mnemonic-word">
                <span class="word-number">${i + 1}</span>
                <span class="word-text">${w}</span>
              </div>
            `).join('')}
          </div>
        `;
        this.el('modal-error').textContent = '';
        this.el('modal-confirm').textContent = 'Done';
        this.el('modal-confirm').onclick = () => this.closeModal();
      } else {
        this.el('modal-error').textContent = 'Incorrect password';
        pwInput.value = '';
      }
    });

    this.el('modal-cancel').addEventListener('click', () => this.closeModal());
    pwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.el('modal-confirm').click();
    });
  }

  private showChangePassword() {
    this.showModal(`
      <div class="modal-title">Change Password</div>
      <div class="modal-desc">Enter your current password and choose a new one.</div>
      <div class="field">
        <label class="field-label" for="current-pw">Current Password</label>
        <input type="password" id="current-pw" class="input" placeholder="Current password" autocomplete="current-password" />
      </div>
      <div class="field">
        <label class="field-label" for="new-pw">New Password</label>
        <input type="password" id="new-pw" class="input" placeholder="Min. 8 characters" autocomplete="new-password" />
      </div>
      <div class="field">
        <label class="field-label" for="confirm-pw">Confirm New Password</label>
        <input type="password" id="confirm-pw" class="input" placeholder="Re-enter new password" autocomplete="new-password" />
      </div>
      <div id="modal-error" class="modal-error"></div>
      <div class="modal-actions">
        <button id="modal-confirm" class="btn-primary">Update Password</button>
        <button id="modal-cancel" class="btn-secondary">Cancel</button>
      </div>
    `);

    const currentPw = this.el('current-pw') as HTMLInputElement;
    currentPw.focus();

    this.el('modal-confirm').addEventListener('click', async () => {
      const errEl = this.el('modal-error');
      const cur = currentPw.value;
      const newPw = (this.el('new-pw') as HTMLInputElement).value;
      const confirmPw = (this.el('confirm-pw') as HTMLInputElement).value;

      if (!cur) { errEl.textContent = 'Enter your current password'; return; }
      if (!newPw || newPw.length < 8) { errEl.textContent = 'New password must be at least 8 characters'; return; }
      if (newPw !== confirmPw) { errEl.textContent = 'Passwords do not match'; return; }

      const res = await window.electronAPI.wallet.changePassword(cur, newPw);
      if (res.success) {
        this.state.password = newPw;
        errEl.className = 'modal-success';
        errEl.textContent = 'Password updated successfully';
        this.el('modal-confirm').textContent = 'Done';
        this.el('modal-confirm').onclick = () => this.closeModal();
      } else {
        errEl.className = 'modal-error';
        errEl.textContent = res.error || 'Failed to change password';
      }
    });

    this.el('modal-cancel').addEventListener('click', () => this.closeModal());
  }

  private lockWallet() {
    this.stopAutoRefresh();
    this.state.isUnlocked = false;
    this.state.password = '';
    this.state.accounts = [];
    this.state.currentAccountIndex = 0;
    this.state.balances.clear();
    this.state.transactions = [];
    this.renderUnlockScreen();
  }

  private async showManageAccounts() {
    const view = this.el('main-view');
    const accountItems = await Promise.all(
      this.state.accounts.map(async (acc) => {
        const pic = await this.getProfilePicture(acc.address);
        const typeLabel = acc.accountType === 'just_view'
          ? 'Watch only'
          : acc.accountType === 'from_key'
            ? 'Imported'
            : 'Derived';
        const typeBadgeClass = acc.accountType === 'just_view'
          ? 'acc-type-watch'
          : acc.accountType === 'from_key'
            ? 'acc-type-imported'
            : '';
        return `
          <div class="manage-account-row" data-index="${acc.index}">
            <div class="manage-account-left">
              <img src="${pic}" alt="" class="account-avatar" />
              <div class="manage-account-info">
                <div class="manage-account-name">${acc.name}</div>
                <div class="manage-account-meta">
                  <span class="manage-account-type${typeBadgeClass ? ' ' + typeBadgeClass : ''}">${typeLabel}</span>
                  <span class="manage-account-addr">${acc.address.slice(0, 8)}...${acc.address.slice(-6)}</span>
                </div>
              </div>
            </div>
            ${this.state.accounts.length > 1 ? `
              <button class="manage-account-remove" data-index="${acc.index}" title="Remove account">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            ` : ''}
          </div>`;
      })
    );

    view.innerHTML = `
      <div class="settings-view">
        <div class="settings-header">
          <button id="manage-back-btn" class="settings-back">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Settings
          </button>
          <h2>Manage Accounts</h2>
        </div>
        <div class="settings-section">
          <div class="settings-card manage-accounts-card">
            ${accountItems.join('')}
          </div>
        </div>
      </div>
    `;

    this.el('manage-back-btn').addEventListener('click', () => this.showSettings());

    view.querySelectorAll('.manage-account-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.index!, 10);
        const acc = this.state.accounts.find(a => a.index === idx);
        if (acc) this.showRemoveAccountConfirm(acc);
      });
    });
  }

  private showRemoveAccountConfirm(acc: Account) {
    const isWatchOnly = acc.accountType === 'just_view';
    const isFromSeed = acc.accountType === 'from_seed';

    let warningHtml: string;
    if (isWatchOnly) {
      warningHtml = `
        <div class="modal-desc">
          This will remove the watch-only address <strong>${acc.name}</strong> from your wallet.
          You can re-add it anytime.
        </div>
      `;
    } else if (isFromSeed) {
      warningHtml = `
        <div class="modal-desc">
          This will remove <strong>${acc.name}</strong> from your wallet.
          Since this account was derived from your recovery phrase, you can re-add it later.
        </div>
        <div class="backup-warning-box" style="margin-bottom: 16px;">
          <p><span class="warn-dot"></span>Account will be removed from the sidebar</p>
          <p><span class="warn-dot"></span>Can be re-created from your recovery phrase</p>
        </div>
      `;
    } else {
      warningHtml = `
        <div class="modal-desc">
          This will permanently remove <strong>${acc.name}</strong> and its private key from your wallet.
          This action is irreversible unless you have backed up the private key elsewhere.
        </div>
        <div class="backup-warning-box" style="margin-bottom: 16px;">
          <p><span class="warn-dot" style="background: var(--red);"></span>Private key will be permanently deleted</p>
          <p><span class="warn-dot" style="background: var(--red);"></span>This cannot be undone</p>
          <p><span class="warn-dot" style="background: var(--red);"></span>Ensure you have a backup of your key</p>
        </div>
      `;
    }

    this.showModal(`
      <div class="modal-title"${isWatchOnly ? '' : ' style="color: var(--red);"'}>Remove Account</div>
      ${warningHtml}
      <div id="modal-error" class="modal-error"></div>
      <div class="modal-actions">
        <button id="modal-confirm" class="${isWatchOnly ? 'btn-primary' : 'btn-danger'}">Remove</button>
        <button id="modal-cancel" class="btn-secondary">Cancel</button>
      </div>
    `);

    this.el('modal-confirm').addEventListener('click', async () => {
      const errEl = this.el('modal-error');
      const res = await window.electronAPI.wallet.removeAccount(this.state.password, acc.index);
      if (res.success) {
        // Remove from local state
        this.state.accounts = this.state.accounts.filter(a => a.index !== acc.index);
        // Re-index local accounts to match backend
        this.state.accounts.forEach((a, i) => { a.index = i; });
        // Adjust current account index
        if (this.state.currentAccountIndex >= this.state.accounts.length) {
          this.state.currentAccountIndex = this.state.accounts.length - 1;
        }
        this.closeModal();
        this.renderAccountsList();
        // Refresh manage accounts view
        this.showManageAccounts();
      } else {
        errEl.textContent = res.error || 'Failed to remove account';
      }
    });

    this.el('modal-cancel').addEventListener('click', () => this.closeModal());
  }

  private showResetWallet() {
    this.showModal(`
      <div class="modal-title" style="color: var(--red);">Reset Wallet</div>
      <div class="modal-desc">
        This will permanently delete your wallet, all accounts, and all data.
        This action cannot be undone. Any funds will be lost unless you have your recovery phrase.
      </div>
      <div class="backup-warning-box" style="margin-bottom: 16px;">
        <p><span class="warn-dot"></span>All accounts will be deleted</p>
        <p><span class="warn-dot"></span>All balances will be lost</p>
        <p><span class="warn-dot"></span>A new wallet will be created</p>
      </div>
      <div class="field">
        <label class="field-label" for="reset-pw">Enter password to confirm</label>
        <input type="password" id="reset-pw" class="input" placeholder="Enter password" autocomplete="current-password" />
      </div>
      <div id="modal-error" class="modal-error"></div>
      <div class="modal-actions">
        <button id="modal-confirm" class="btn-danger">Reset Wallet</button>
        <button id="modal-cancel" class="btn-secondary">Cancel</button>
      </div>
    `);

    const pwInput = this.el('reset-pw') as HTMLInputElement;
    pwInput.focus();

    this.el('modal-confirm').addEventListener('click', async () => {
      const pw = pwInput.value;
      if (!pw) { this.el('modal-error').textContent = 'Enter your password'; return; }

      const res = await window.electronAPI.wallet.resetWallet(pw);
      if (res.success) {
        this.closeModal();
        this.state.isUnlocked = false;
        this.state.password = '';
        this.state.accounts = [];
        this.state.currentAccountIndex = 0;
        this.state.balances.clear();
        this.renderSetupScreen();
      } else {
        this.el('modal-error').textContent = res.error || 'Incorrect password';
        pwInput.value = '';
      }
    });

    this.el('modal-cancel').addEventListener('click', () => this.closeModal());
    pwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.el('modal-confirm').click();
    });
  }
}

/* --- Bootstrap --- */
new WalletApp();
