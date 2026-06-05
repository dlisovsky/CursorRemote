import * as vscode from 'vscode';

const SECRET_KEY = 'cursorRemote.licenseKey';
const KEY_FORMAT = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function validateKey(key: string): boolean {
  const trimmed = key.trim().toUpperCase();
  if (!KEY_FORMAT.test(trimmed)) return false;
  const chars = trimmed.replace(/-/g, '');
  const sum = [...chars].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return sum % 42 === 0;
}

export class LicenseManager {
  private context: vscode.ExtensionContext;
  private onLicenseValid: () => void;

  constructor(context: vscode.ExtensionContext, onLicenseValid: () => void) {
    this.context = context;
    this.onLicenseValid = onLicenseValid;
  }

  async getKey(): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEY);
  }

  async checkLicense(): Promise<boolean> {
    return true;
  }

  async promptForKey(): Promise<void> {
    const input = await vscode.window.showInputBox({
      title: 'CursorRemote — License Key',
      prompt: 'Enter your license key (format: XXXX-XXXX-XXXX-XXXX-XXXX)',
      placeHolder: 'XXXX-XXXX-XXXX-XXXX-XXXX',
      validateInput: (value) => {
        const upper = value.trim().toUpperCase();
        if (!upper) return 'License key is required';
        if (!KEY_FORMAT.test(upper)) return 'Invalid format. Expected XXXX-XXXX-XXXX-XXXX-XXXX';
        if (!validateKey(upper)) return 'Invalid license key';
        return null;
      },
    });

    if (input) {
      const normalized = input.trim().toUpperCase();
      await this.context.secrets.store(SECRET_KEY, normalized);
      vscode.window.showInformationMessage('License key saved.');
      this.onLicenseValid();
    }
  }

  async clearKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage('License key cleared.');
  }
}
