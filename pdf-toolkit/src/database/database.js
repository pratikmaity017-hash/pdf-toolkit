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

      return db;
    })();
  }

  return databasePromise;
}

export async function getDocuments() {
  const db = await getDatabase();

  return db.getAllAsync(
    `SELECT id, name, uri, size
     FROM documents
     ORDER BY created_at DESC;`,
  );
}

export async function saveDocument(document) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO documents (id, name, uri, size, created_at)
     VALUES (?, ?, ?, ?, ?);`,
    document.id,
    document.name,
    document.uri,
    document.size,
    Date.now(),
  );
}
