/**
 * The single lock that serializes EVERY statement on the local SQLite
 * connection.
 *
 * expo-sqlite does NOT queue async operations: two overlapping ones on one
 * connection fail with "database is locked" / "cannot start a transaction
 * within a transaction", and `busy_timeout` cannot fix a same-connection
 * conflict (the busy handler only applies across connections). One connection
 * + one mutex is what makes a lock conflict impossible by construction.
 *
 * Lives in its own module (not write.ts) so that index.ts — the module that
 * opens the connection — can use it too without creating an import cycle
 * between index.ts and write.ts. write.ts re-exports it, so every existing
 * caller keeps importing it from the write boundary.
 *
 * The alternative — `withExclusiveTransactionAsync` — is deliberately NOT used
 * anywhere in this codebase: expo-sqlite runs it on a SECOND native connection
 * to the same file (Transaction.createAsync -> useNewConnection) that does not
 * inherit busy_timeout, so its writes abort instantly with "database is
 * locked" whenever the main connection has any statement in flight. See
 * write.ts for the full rationale.
 */
import { Mutex } from "async-mutex";

export const dbWriteMutex = new Mutex();
