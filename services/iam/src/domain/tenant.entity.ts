import { v4 as uuidv4 } from 'uuid';

export class Tenant {
  readonly id: string;
  private _name: string;
  readonly slug: string;
  private _nui: string;
  readonly createdAt: string;
  private _active: boolean;

  private constructor(id: string, name: string, slug: string, nui: string, active: boolean, createdAt: string) {
    this.id = id;
    this._name = name;
    this.slug = slug;
    this._nui = nui;
    this._active = active;
    this.createdAt = createdAt;
  }

  static create(name: string, nui: string): Tenant {
    if (!name || !name.trim()) {
      throw new Error('Tenant name is required.');
    }
    if (!nui || !nui.trim()) {
      throw new Error('Tenant NUI is required.');
    }
    if (!/^8\d{8}$/.test(nui.trim())) {
      throw new Error('NUI is incorrect');
    }
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return new Tenant(uuidv4(), name.trim(), slug, nui.trim().toUpperCase(), true, new Date().toISOString());
  }

  static rehydrate(id: string, name: string, slug: string, nui: string, active: boolean, createdAt: string): Tenant {
    return new Tenant(id, name, slug, nui, active, createdAt);
  }

  get active(): boolean {
    return this._active;
  }

  get name(): string {
    return this._name;
  }

  get nui(): string {
    return this._nui;
  }

  deactivate(): void {
    this._active = false;
  }

  updateBusiness(input: { name?: string; nui?: string }): void {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('Tenant name is required.');
      this._name = name;
    }
    if (input.nui !== undefined) {
      const nui = input.nui.trim().toUpperCase();
      if (!/^8\d{8}$/.test(nui)) throw new Error('NUI is incorrect');
      this._nui = nui;
    }
  }
}
