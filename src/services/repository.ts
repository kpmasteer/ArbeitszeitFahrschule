import {
  DEFAULT_APP_STORES,
  type EntityRecord,
} from './models'
import { cloneValue } from './serviceUtils'

export type RepositoryMode = 'uninitialized' | 'indexeddb' | 'memory'
export type RepositoryFallback = 'memory' | 'throw'

export interface LocalRepositoryOptions {
  databaseName?: string
  version?: number
  stores?: readonly string[]
  /** Inject null in tests to deterministically select the memory backend. */
  indexedDBFactory?: IDBFactory | null
  fallback?: RepositoryFallback
  forceMemory?: boolean
}

export interface LocalRepository {
  readonly mode: RepositoryMode
  readonly stores: readonly string[]
  readonly fallbackReason: unknown
  ready(): Promise<Exclude<RepositoryMode, 'uninitialized'>>
  get<T extends EntityRecord>(store: string, id: string): Promise<T | undefined>
  getAll<T extends EntityRecord>(store: string): Promise<T[]>
  put<T extends EntityRecord>(store: string, record: T): Promise<T>
  putMany<T extends EntityRecord>(store: string, records: readonly T[]): Promise<T[]>
  remove(store: string, id: string): Promise<void>
  clear(store: string): Promise<void>
  count(store: string): Promise<number>
  replaceStore<T extends EntityRecord>(store: string, records: readonly T[]): Promise<void>
  /** Atomically replaces all named stores when IndexedDB is active. */
  replaceStores(recordsByStore: Readonly<Record<string, readonly EntityRecord[]>>): Promise<void>
  dumpStores(storeNames?: readonly string[]): Promise<Record<string, EntityRecord[]>>
  close(): void
}

interface MemoryState {
  stores: Map<string, Map<string, EntityRecord>>
}

const DEFAULT_DATABASE_NAME = 'fahrschulzeit-local-v1'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB-Anfrage fehlgeschlagen.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(
      transaction.error ?? new Error('IndexedDB-Transaktion wurde abgebrochen.'),
    )
    transaction.onerror = () => reject(
      transaction.error ?? new Error('IndexedDB-Transaktion ist fehlgeschlagen.'),
    )
  })
}

function resolveDefaultFactory(): IDBFactory | null {
  try {
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB
  } catch {
    return null
  }
}

function assertEntity(record: EntityRecord): void {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id.trim()) {
    throw new TypeError('Ein Repository-Datensatz benötigt eine nicht leere String-ID.')
  }
}

/**
 * Local-first repository. It uses IndexedDB when available and falls back to an
 * isolated in-memory backend in SSR/test/private-mode environments where opening
 * IndexedDB is impossible. Runtime transaction failures are surfaced instead of
 * silently splitting data across two backends.
 */
export class IndexedDbRepository implements LocalRepository {
  readonly stores: readonly string[]
  private readonly databaseName: string
  private readonly version: number
  private readonly factory: IDBFactory | null
  private readonly fallback: RepositoryFallback
  private readonly memory: MemoryState
  private database: IDBDatabase | null = null
  private initialization: Promise<Exclude<RepositoryMode, 'uninitialized'>> | null = null
  private currentMode: RepositoryMode = 'uninitialized'
  private currentFallbackReason: unknown = null

  constructor(options: LocalRepositoryOptions = {}) {
    const stores = options.stores ?? DEFAULT_APP_STORES
    if (stores.length === 0 || stores.some((store) => !store.trim())) {
      throw new TypeError('Mindestens ein gültiger Repository-Store ist erforderlich.')
    }
    if (new Set(stores).size !== stores.length) {
      throw new TypeError('Repository-Store-Namen müssen eindeutig sein.')
    }
    this.stores = Object.freeze([...stores])
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME
    this.version = options.version ?? 1
    if (!Number.isInteger(this.version) || this.version < 1) {
      throw new RangeError('Die IndexedDB-Version muss eine positive ganze Zahl sein.')
    }
    this.factory = options.forceMemory
      ? null
      : options.indexedDBFactory === undefined
        ? resolveDefaultFactory()
        : options.indexedDBFactory
    this.fallback = options.fallback ?? 'memory'
    this.memory = {
      stores: new Map(this.stores.map((store) => [store, new Map()])),
    }
  }

  get mode(): RepositoryMode {
    return this.currentMode
  }

  get fallbackReason(): unknown {
    return this.currentFallbackReason
  }

  ready(): Promise<Exclude<RepositoryMode, 'uninitialized'>> {
    if (!this.initialization) this.initialization = this.initialize()
    return this.initialization
  }

  async get<T extends EntityRecord>(store: string, id: string): Promise<T | undefined> {
    this.assertStore(store)
    if ((await this.ready()) === 'memory') {
      const value = this.memory.stores.get(store)?.get(id)
      return value ? cloneValue(value as T) : undefined
    }
    const transaction = this.requireDatabase().transaction(store, 'readonly')
    const request = transaction.objectStore(store).get(id) as IDBRequest<T | undefined>
    const [result] = await Promise.all([requestResult(request), transactionComplete(transaction)])
    return result === undefined ? undefined : cloneValue(result)
  }

  async getAll<T extends EntityRecord>(store: string): Promise<T[]> {
    this.assertStore(store)
    if ((await this.ready()) === 'memory') {
      return [...(this.memory.stores.get(store)?.values() ?? [])]
        .map((item) => cloneValue(item as T))
    }
    const transaction = this.requireDatabase().transaction(store, 'readonly')
    const request = transaction.objectStore(store).getAll() as IDBRequest<T[]>
    const [result] = await Promise.all([requestResult(request), transactionComplete(transaction)])
    return result.map(cloneValue)
  }

  async put<T extends EntityRecord>(store: string, record: T): Promise<T> {
    const [saved] = await this.putMany(store, [record])
    return saved
  }

  async putMany<T extends EntityRecord>(store: string, records: readonly T[]): Promise<T[]> {
    this.assertStore(store)
    records.forEach(assertEntity)
    const copies = records.map(cloneValue)
    if (copies.length === 0) return []
    if ((await this.ready()) === 'memory') {
      const target = this.memory.stores.get(store)
      copies.forEach((record) => target?.set(record.id, record))
      return copies.map(cloneValue)
    }
    const transaction = this.requireDatabase().transaction(store, 'readwrite')
    const objectStore = transaction.objectStore(store)
    copies.forEach((record) => objectStore.put(record))
    await transactionComplete(transaction)
    return copies.map(cloneValue)
  }

  async remove(store: string, id: string): Promise<void> {
    this.assertStore(store)
    if ((await this.ready()) === 'memory') {
      this.memory.stores.get(store)?.delete(id)
      return
    }
    const transaction = this.requireDatabase().transaction(store, 'readwrite')
    transaction.objectStore(store).delete(id)
    await transactionComplete(transaction)
  }

  async clear(store: string): Promise<void> {
    this.assertStore(store)
    if ((await this.ready()) === 'memory') {
      this.memory.stores.get(store)?.clear()
      return
    }
    const transaction = this.requireDatabase().transaction(store, 'readwrite')
    transaction.objectStore(store).clear()
    await transactionComplete(transaction)
  }

  async count(store: string): Promise<number> {
    this.assertStore(store)
    if ((await this.ready()) === 'memory') {
      return this.memory.stores.get(store)?.size ?? 0
    }
    const transaction = this.requireDatabase().transaction(store, 'readonly')
    const request = transaction.objectStore(store).count()
    const [result] = await Promise.all([requestResult(request), transactionComplete(transaction)])
    return result
  }

  async replaceStore<T extends EntityRecord>(store: string, records: readonly T[]): Promise<void> {
    await this.replaceStores({ [store]: records })
  }

  async replaceStores(
    recordsByStore: Readonly<Record<string, readonly EntityRecord[]>>,
  ): Promise<void> {
    const entries = Object.entries(recordsByStore)
    if (entries.length === 0) return
    entries.forEach(([store, records]) => {
      this.assertStore(store)
      records.forEach(assertEntity)
      const ids = records.map((record) => record.id)
      if (new Set(ids).size !== ids.length) {
        throw new TypeError(`Store „${store}“ enthält doppelte IDs.`)
      }
    })
    const copies = Object.fromEntries(
      entries.map(([store, records]) => [store, records.map(cloneValue)]),
    ) as Record<string, EntityRecord[]>
    if ((await this.ready()) === 'memory') {
      // Prepare all maps first, then swap their contents as one synchronous operation.
      const replacements = new Map(
        Object.entries(copies).map(([store, records]) => [
          store,
          new Map(records.map((record) => [record.id, record])),
        ]),
      )
      replacements.forEach((records, store) => this.memory.stores.set(store, records))
      return
    }
    const storeNames = Object.keys(copies)
    const transaction = this.requireDatabase().transaction(storeNames, 'readwrite')
    Object.entries(copies).forEach(([store, records]) => {
      const objectStore = transaction.objectStore(store)
      objectStore.clear()
      records.forEach((record) => objectStore.put(record))
    })
    await transactionComplete(transaction)
  }

  async dumpStores(storeNames: readonly string[] = this.stores): Promise<Record<string, EntityRecord[]>> {
    storeNames.forEach((store) => this.assertStore(store))
    if ((await this.ready()) === 'memory') {
      return Object.fromEntries(
        storeNames.map((store) => [
          store,
          [...(this.memory.stores.get(store)?.values() ?? [])].map(cloneValue),
        ]),
      )
    }
    const transaction = this.requireDatabase().transaction([...storeNames], 'readonly')
    const requests = storeNames.map((store) =>
      requestResult(transaction.objectStore(store).getAll() as IDBRequest<EntityRecord[]>),
    )
    const results = await Promise.all([...requests, transactionComplete(transaction)])
    return Object.fromEntries(
      storeNames.map((store, index) => [store, (results[index] as EntityRecord[]).map(cloneValue)]),
    )
  }

  close(): void {
    this.database?.close()
    this.database = null
    // Reopening after close remains possible and keeps the selected backend.
    if (this.currentMode === 'indexeddb') {
      this.currentMode = 'uninitialized'
      this.initialization = null
    }
  }

  private async initialize(): Promise<'indexeddb' | 'memory'> {
    if (!this.factory) {
      this.currentFallbackReason = new Error('IndexedDB ist in dieser Umgebung nicht verfügbar.')
      if (this.fallback === 'throw') throw this.currentFallbackReason
      this.currentMode = 'memory'
      return 'memory'
    }
    try {
      this.database = await this.openDatabase(this.factory)
      const missingStore = this.stores.find(
        (store) => !this.database?.objectStoreNames.contains(store),
      )
      if (missingStore) {
        this.database.close()
        this.database = null
        throw new Error(
          `IndexedDB-Schema enthält den Store „${missingStore}“ nicht; erhöhe die Datenbankversion.`,
        )
      }
      this.currentMode = 'indexeddb'
      return 'indexeddb'
    } catch (error) {
      this.currentFallbackReason = error
      if (this.fallback === 'throw') throw error
      this.currentMode = 'memory'
      return 'memory'
    }
  }

  private openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(this.databaseName, this.version)
      let settled = false
      request.onupgradeneeded = () => {
        const database = request.result
        this.stores.forEach((store) => {
          if (!database.objectStoreNames.contains(store)) {
            database.createObjectStore(store, { keyPath: 'id' })
          }
        })
      }
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }
        settled = true
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }
      request.onerror = () => {
        if (settled) return
        settled = true
        reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'))
      }
      request.onblocked = () => {
        if (settled) return
        settled = true
        reject(new Error('IndexedDB-Aktualisierung wird durch eine andere App-Instanz blockiert.'))
      }
    })
  }

  private assertStore(store: string): void {
    if (!this.stores.includes(store)) {
      throw new RangeError(`Unbekannter Repository-Store: ${store}`)
    }
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new Error('IndexedDB ist nicht initialisiert.')
    return this.database
  }
}

export function createLocalRepository(options: LocalRepositoryOptions = {}): LocalRepository {
  return new IndexedDbRepository(options)
}

export function createMemoryRepository(
  stores: readonly string[] = DEFAULT_APP_STORES,
): LocalRepository {
  return new IndexedDbRepository({ stores, forceMemory: true })
}
