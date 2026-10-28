import * as SQLite from "expo-sqlite";

let databasePromise;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync("pdf-toolkit.db");

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          uri TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
      `);

      // Safely migrate existing databases without deleting documents.
      const columns = await db.getAllAsync("PRAGMA table_info(documents);");

      const columnNames = new Set(columns.map((column) => column.name));

      if (!columnNames.has("page_count")) {
        await db.execAsync(`
          ALTER TABLE documents
          ADD COLUMN page_count INTEGER NOT NULL DEFAULT 0;
        `);
      }

      if (!columnNames.has("last_opened_at")) {
        await db.execAsync(`
          ALTER TABLE documents
          ADD COLUMN last_opened_at INTEGER;
        `);
      }

      return db;
    })().catch((error) => {
      // Allow a later attempt if database initialization fails.
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}

export async function getDocuments() {
  const db = await getDatabase();

  return db.getAllAsync(`
    SELECT
      id,
      name,
      uri,
      size,
      created_at,
      page_count,
      last_opened_at
    FROM documents
    ORDER BY created_at DESC;
  `);
}

export async function saveDocument(document) {
  const db = await getDatabase();

  if (!document?.id || !document?.name || !document?.uri) {
    throw new Error("Document ID, name, and URI are required.");
  }

  await db.runAsync(
    `INSERT INTO documents (
      id,
      name,
      uri,
      size,
      created_at,
      page_count,
      last_opened_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?);`,
    document.id,
    document.name,
    document.uri,
    document.size ?? 0,
    Date.now(),
    document.pageCount ?? 0,
    null,
  );
}

export async function renameDocument(id, newName) {
  const db = await getDatabase();

  return db.runAsync("UPDATE documents SET name = ? WHERE id = ?;", [
    newName,
    id,
  ]);
}

export async function deleteDocument(id) {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM documents WHERE id = ?;", [id]);
}

export async function markDocumentOpened(id) {
  const db = await getDatabase();

  await db.runAsync("UPDATE documents SET last_opened_at = ? WHERE id = ?;", [
    Date.now(),
    id,
  ]);
}

export async function updateDocumentPageCount(id, pageCount) {
  const db = await getDatabase();

  await db.runAsync("UPDATE documents SET page_count = ? WHERE id = ?;", [
    pageCount,
    id,
  ]);
}
