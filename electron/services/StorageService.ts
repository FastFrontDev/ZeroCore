import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface SecureStorage {
  mnemonic: string;
  accounts: Array<{
    index: number;
    name: string;
    address: string;
  }>;
}

export class StorageService {
  private static getStoragePath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'wallet.enc');
  }

  /**
   * Derives a key from a password using PBKDF2
   */
  private static deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  /**
   * Encrypts and stores wallet data
   */
  static saveWallet(password: string, data: SecureStorage): void {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const plaintext = JSON.stringify(data);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    // Format: salt + iv + authTag + encryptedData
    const resultBuffer = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    const storagePath = this.getStoragePath();
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, resultBuffer);
  }

  /**
   * Decrypts and loads wallet data
   */
  static loadWallet(password: string): SecureStorage {
    const storagePath = this.getStoragePath();
    
    if (!fs.existsSync(storagePath)) {
      throw new Error('No wallet found');
    }

    const data = fs.readFileSync(storagePath);

    // Extract components
    const salt = data.slice(0, SALT_LENGTH);
    const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.slice(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = data.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = this.deriveKey(password, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Invalid password or corrupted data');
    }
  }

  /**
   * Checks if a wallet file exists
   */
  static walletExists(): boolean {
    return fs.existsSync(this.getStoragePath());
  }

  /**
   * Deletes the wallet file
   */
  static deleteWallet(): void {
    const storagePath = this.getStoragePath();
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  }

  /**
   * Verifies if a password is correct without loading full data
   */
  static verifyPassword(password: string): boolean {
    try {
      this.loadWallet(password);
      return true;
    } catch {
      return false;
    }
  }
}
