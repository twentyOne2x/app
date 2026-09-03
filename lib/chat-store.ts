import { Pool } from 'pg'

import {
  clearLocalChats,
  deleteLocalChat,
  getLocalChat,
  getLocalSharedChat,
  listLocalChats,
  putLocalChat,
  putLocalSharedChat
} from '@/lib/local-chat-store'
import type { ChatScope } from '@/lib/chat-scope'
import { isCanonicalChatScope } from '@/lib/chat-scope'
import { isProductionRuntime } from '@/lib/internal-service'
import type { Chat } from '@/lib/types'
import { PUBLIC_SHARE_ID_PATTERN } from '@/lib/chat-id'

const CHAT_ID = /^[A-Za-z0-9_-]{1,64}$/

type QueryResult<Row = Record<string, unknown>> = {
  rows: Row[]
  rowCount: number | null
}

export type ChatDatabaseClient = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>>
  release(): void
}

export type ChatDatabasePool = {
  connect(): Promise<ChatDatabaseClient>
}

export interface ChatStore {
  health(): Promise<void>
  list(scope: ChatScope): Promise<Chat[]>
  get(scope: ChatScope, id: string): Promise<Chat | null>
  put(scope: ChatScope, chat: Chat): Promise<Chat>
  remove(scope: ChatScope, id: string): Promise<void>
  clear(scope: ChatScope): Promise<void>
  putShared(scope: ChatScope, chat: Chat): Promise<Chat>
  getShared(id: string): Promise<Chat | null>
}

function assertChatId(id: string): void {
  if (!CHAT_ID.test(id)) throw new Error('chat id is invalid')
}

function assertScope(scope: ChatScope): void {
  if (!isCanonicalChatScope(scope))
    throw new Error('canonical chat scope is invalid')
}

function assertOwnedChat(scope: ChatScope, chat: Chat): void {
  assertScope(scope)
  assertChatId(chat.id)
  if (chat.userId !== scope.userId)
    throw new Error('chat owner does not match canonical scope')
  if (!Number.isSafeInteger(chat.createdAt) || chat.createdAt <= 0) {
    throw new Error(
      'chat createdAt must be a positive integer epoch millisecond value'
    )
  }
  if (
    !Array.isArray(chat.messages) ||
    !Array.isArray(chat.structured_metadata)
  ) {
    throw new Error('chat payload arrays are invalid')
  }
}

function rowChat(value: unknown): Chat {
  const candidate = typeof value === 'string' ? JSON.parse(value) : value
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('database returned an invalid chat payload')
  }
  return candidate as Chat
}

export class PostgresChatStore implements ChatStore {
  constructor(private readonly pool: ChatDatabasePool) {}

  async health(): Promise<void> {
    const client = await this.pool.connect()
    try {
      const schema = await client.query<{ table_name: string | null }>(
        "SELECT to_regclass('public.app_chats')::text AS table_name"
      )
      if (!schema.rows[0]?.table_name)
        throw new Error('app_chats schema is unavailable')
      await client.query('SELECT count(*)::int AS visible_rows FROM app_chats')
    } finally {
      client.release()
    }
  }

  private async scoped<T>(
    scope: ChatScope,
    operation: (client: ChatDatabaseClient) => Promise<T>
  ): Promise<T> {
    assertScope(scope)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT set_config('app.tenant_id', $1, true), " +
          "set_config('app.principal_user_id', $2, true)",
        [scope.tenantId, scope.userId]
      )
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async list(scope: ChatScope): Promise<Chat[]> {
    return this.scoped(scope, async client => {
      const result = await client.query<{ payload_json: unknown }>(
        'SELECT payload_json FROM app_chats ' +
          'WHERE tenant_id=$1 AND principal_user_id=$2 AND is_shared=false ' +
          'ORDER BY created_at_ms DESC, id ASC',
        [scope.tenantId, scope.userId]
      )
      return result.rows.map(row => rowChat(row.payload_json))
    })
  }

  async get(scope: ChatScope, id: string): Promise<Chat | null> {
    assertChatId(id)
    return this.scoped(scope, async client => {
      const result = await client.query<{ payload_json: unknown }>(
        'SELECT payload_json FROM app_chats ' +
          'WHERE id=$1 AND tenant_id=$2 AND principal_user_id=$3 AND is_shared=false',
        [id, scope.tenantId, scope.userId]
      )
      return result.rows.length ? rowChat(result.rows[0].payload_json) : null
    })
  }

  async put(scope: ChatScope, chat: Chat): Promise<Chat> {
    assertOwnedChat(scope, chat)
    if (chat.readOnly || chat.sharePath || chat.originalChatId) {
      throw new Error('private chat payload carries shared-chat fields')
    }
    return this.scoped(scope, async client => {
      const result = await client.query<{ payload_json: unknown }>(
        'INSERT INTO app_chats ' +
          '(id,tenant_id,principal_user_id,created_at_ms,is_shared,original_chat_id,payload_json) ' +
          'VALUES ($1,$2,$3,$4,false,NULL,$5::jsonb) ' +
          'ON CONFLICT (id) DO UPDATE SET ' +
          'created_at_ms=EXCLUDED.created_at_ms,payload_json=EXCLUDED.payload_json,updated_at=now() ' +
          'WHERE app_chats.tenant_id=EXCLUDED.tenant_id ' +
          'AND app_chats.principal_user_id=EXCLUDED.principal_user_id ' +
          'AND app_chats.is_shared=false RETURNING payload_json',
        [
          chat.id,
          scope.tenantId,
          scope.userId,
          chat.createdAt,
          JSON.stringify(chat)
        ]
      )
      if (result.rowCount !== 1)
        throw new Error('chat id is owned by another scope')
      return rowChat(result.rows[0].payload_json)
    })
  }

  async remove(scope: ChatScope, id: string): Promise<void> {
    assertChatId(id)
    await this.scoped(scope, async client => {
      await client.query(
        'DELETE FROM app_chats WHERE tenant_id=$1 AND principal_user_id=$2 ' +
          'AND id=$3 AND is_shared=false',
        [scope.tenantId, scope.userId, id]
      )
    })
  }

  async clear(scope: ChatScope): Promise<void> {
    await this.scoped(scope, async client => {
      await client.query(
        'DELETE FROM app_chats WHERE tenant_id=$1 AND principal_user_id=$2 ' +
          'AND is_shared=false',
        [scope.tenantId, scope.userId]
      )
    })
  }

  async putShared(scope: ChatScope, chat: Chat): Promise<Chat> {
    assertOwnedChat(scope, chat)
    if (!PUBLIC_SHARE_ID_PATTERN.test(chat.id)) {
      throw new Error('public share id is invalid')
    }
    assertChatId(chat.originalChatId ?? '')
    if (!chat.readOnly || chat.sharePath !== `/share/${chat.id}`) {
      throw new Error('shared chat payload is not immutable and canonical')
    }
    return this.scoped(scope, async client => {
      const result = await client.query<{ payload_json: unknown }>(
        'INSERT INTO app_chats ' +
          '(id,tenant_id,principal_user_id,created_at_ms,is_shared,' +
          'original_chat_id,original_chat_is_shared,payload_json) ' +
          'SELECT $1,$2,$3,$4,true,$5,false,$6::jsonb ' +
          'WHERE EXISTS (SELECT 1 FROM app_chats WHERE id=$5 AND tenant_id=$2 ' +
          'AND principal_user_id=$3 AND is_shared=false) ' +
          'ON CONFLICT (id) DO NOTHING RETURNING payload_json',
        [
          chat.id,
          scope.tenantId,
          scope.userId,
          chat.createdAt,
          chat.originalChatId,
          JSON.stringify(chat)
        ]
      )
      if (result.rowCount !== 1) {
        throw new Error('shared chat id exists or original chat is unavailable')
      }
      return rowChat(result.rows[0].payload_json)
    })
  }

  async getShared(id: string): Promise<Chat | null> {
    assertChatId(id)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT set_config('app.share_id', $1, true)", [id])
      const result = await client.query<{ payload_json: unknown }>(
        'SELECT payload_json FROM app_chats ' +
          "WHERE id=$1 AND is_shared=true AND payload_json->>'sharePath'=$2",
        [id, `/share/${id}`]
      )
      await client.query('COMMIT')
      return result.rows.length ? rowChat(result.rows[0].payload_json) : null
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
}

class DevelopmentChatStore implements ChatStore {
  async health() {}
  async list(scope: ChatScope) {
    return listLocalChats(scope.userId)
  }
  async get(scope: ChatScope, id: string) {
    const chat = getLocalChat(id)
    return chat?.userId === scope.userId ? chat : null
  }
  async put(_scope: ChatScope, chat: Chat) {
    putLocalChat(chat)
    return chat
  }
  async remove(scope: ChatScope, id: string) {
    deleteLocalChat(scope.userId, id)
  }
  async clear(scope: ChatScope) {
    clearLocalChats(scope.userId)
  }
  async putShared(_scope: ChatScope, chat: Chat) {
    putLocalSharedChat(chat)
    return chat
  }
  async getShared(id: string) {
    return getLocalSharedChat(id)
  }
}

const runtime = globalThis as typeof globalThis & {
  __ICMFYI_CHAT_POOL__?: Pool
  __ICMFYI_CHAT_POOL_URL__?: string
  __ICMFYI_POSTGRES_CHAT_STORE__?: PostgresChatStore
  __ICMFYI_DEVELOPMENT_CHAT_STORE__?: DevelopmentChatStore
}

export function isPostgresChatStoreConfigured(): boolean {
  return Boolean(process.env.APP_DATABASE_URL?.trim())
}

export function chatStore(): ChatStore {
  const databaseUrl = process.env.APP_DATABASE_URL?.trim() ?? ''
  if (!databaseUrl) {
    if (isProductionRuntime()) {
      throw new Error('APP_DATABASE_URL is required in production')
    }
    runtime.__ICMFYI_DEVELOPMENT_CHAT_STORE__ ??= new DevelopmentChatStore()
    return runtime.__ICMFYI_DEVELOPMENT_CHAT_STORE__
  }

  const parsed = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('APP_DATABASE_URL must use PostgreSQL')
  }
  if (
    runtime.__ICMFYI_CHAT_POOL_URL__ &&
    runtime.__ICMFYI_CHAT_POOL_URL__ !== databaseUrl
  ) {
    throw new Error(
      'APP_DATABASE_URL changed after the runtime pool was initialized'
    )
  }
  if (!runtime.__ICMFYI_CHAT_POOL__) {
    runtime.__ICMFYI_CHAT_POOL__ = new Pool({
      connectionString: databaseUrl,
      application_name: 'icmfyi-app',
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      query_timeout: 10000,
      statement_timeout: 10000,
      allowExitOnIdle: true
    })
    runtime.__ICMFYI_CHAT_POOL_URL__ = databaseUrl
    runtime.__ICMFYI_POSTGRES_CHAT_STORE__ = new PostgresChatStore(
      runtime.__ICMFYI_CHAT_POOL__ as unknown as ChatDatabasePool
    )
  }
  return runtime.__ICMFYI_POSTGRES_CHAT_STORE__!
}

export async function chatStoreHealth(): Promise<void> {
  await chatStore().health()
}
