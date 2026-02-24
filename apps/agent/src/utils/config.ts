import Store from 'electron-store';

interface StoreSchema {
  connectionId: string;
  password: string;
  agentId: string;
  userId: string;
  authToken: string;
  apiUrl: string;
  signalingUrl: string;
  autoStart: boolean;
  minimizeToTray: boolean;
}

const defaults: StoreSchema = {
  connectionId: '',
  password: '',
  agentId: '',
  userId: '',
  authToken: '',
  apiUrl: 'http://localhost:3000',
  signalingUrl: 'http://localhost:3001',
  autoStart: false,
  minimizeToTray: true,
};

export class ConfigStore {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'securedesk-agent-config',
      defaults,
      encryptionKey: 'securedesk-agent-encryption-key',
    });
  }

  get<K extends keyof StoreSchema>(key: K, defaultValue?: StoreSchema[K]): StoreSchema[K] {
    return this.store.get(key, defaultValue) as StoreSchema[K];
  }

  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) {
    this.store.set(key, value);
  }

  getAll(): StoreSchema {
    return this.store.store;
  }

  clear() {
    this.store.clear();
  }
}
