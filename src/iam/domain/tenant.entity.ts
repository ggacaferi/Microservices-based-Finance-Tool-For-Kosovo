import { v4 as uuidv4 } from 'uuid';

export class Tenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: string;
  private _active: boolean;

  private constructor(id: string, name: string, slug: string, active: boolean, createdAt: string) {
    this.id = id;
    this.name = name;
    this.slug = slug;
    this._active = active;
    this.createdAt = createdAt;
  }

  static create(name: string): Tenant {
    if (!name || !name.trim()) {
      throw new Error('Tenant name is required.');
    }
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return new Tenant(uuidv4(), name.trim(), slug, true, new Date().toISOString());
  }

  static rehydrate(id: string, name: string, slug: string, active: boolean, createdAt: string): Tenant {
    return new Tenant(id, name, slug, active, createdAt);
  }

  get active(): boolean {
    return this._active;
  }

  deactivate(): void {
    this._active = false;
  }
}
