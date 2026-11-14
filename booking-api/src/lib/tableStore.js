import { TableClient, odata } from '@azure/data-tables'

export class ConflictError extends Error {
  constructor() {
    super('Entity already exists')
    this.name = 'ConflictError'
    this.code = 'conflict'
  }
}

export class PreconditionError extends Error {
  constructor() {
    super('Entity changed or missing')
    this.name = 'PreconditionError'
    this.code = 'precondition'
  }
}

function clean(entity) {
  if (!entity) return null
  const rest = { ...entity }
  delete rest['odata.metadata']
  if (rest.timestamp) rest.timestamp = String(rest.timestamp)
  return rest
}

/**
 * Azure Table Storage adapter.
 * v2 site data is stored in Azure SQL. This adapter remains for QVM v1 and the Azurite test.
 * An endpoint drops any connection string so an account key is not used.
 * Constructing a client does not create an account or a table.
 */
export class AzureTableStore {
  constructor({ accountName, credential, connectionString, endpoint } = {}) {
    this.accountName = accountName || ''
    this.credential = credential || null
    this.endpoint = endpoint || ''
    this.connectionString = this.endpoint ? '' : (connectionString || '')
    this.clients = new Map()
  }

  client(table) {
    if (!this.clients.has(table)) {
      const client = this.connectionString
        ? TableClient.fromConnectionString(this.connectionString, table, { allowInsecureConnection: true })
        : new TableClient(this.endpoint || `https://${this.accountName}.table.core.windows.net`, table, this.credential)
      this.clients.set(table, client)
    }
    return this.clients.get(table)
  }

  async get(table, partitionKey, rowKey) {
    try {
      return clean(await this.client(table).getEntity(partitionKey, rowKey))
    } catch (err) {
      if (err.statusCode === 404) return null
      throw err
    }
  }

  async create(table, entity) {
    try {
      const res = await this.client(table).createEntity(entity)
      return res.etag
    } catch (err) {
      if (err.statusCode === 409) throw new ConflictError()
      throw err
    }
  }

  /** Inserts all entities atomically. They must share a PartitionKey. */
  async createAll(table, entities) {
    try {
      await this.client(table).submitTransaction(entities.map((e) => ['create', e]))
    } catch (err) {
      if (err.statusCode === 409) throw new ConflictError()
      throw err
    }
  }

  async update(table, entity, etag) {
    try {
      const res = await this.client(table).updateEntity(entity, 'Merge', { etag })
      return res.etag
    } catch (err) {
      if (err.statusCode === 412 || err.statusCode === 404) throw new PreconditionError()
      throw err
    }
  }

  async delete(table, partitionKey, rowKey, etag = '*') {
    try {
      await this.client(table).deleteEntity(partitionKey, rowKey, { etag })
    } catch (err) {
      if (err.statusCode === 404) return
      if (err.statusCode === 412) throw new PreconditionError()
      throw err
    }
  }

  async *list(table, partitionKey, fromRowKey, toRowKey) {
    const filter = odata`PartitionKey eq ${partitionKey} and RowKey ge ${fromRowKey} and RowKey lt ${toRowKey}`
    for await (const entity of this.client(table).listEntities({ queryOptions: { filter } })) {
      yield clean(entity)
    }
  }
}
