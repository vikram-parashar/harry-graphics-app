import * as SQLite from 'expo-sqlite'
import { nanoid } from '../lib/nanoid'

/**
 * SQLite is the source of truth for projects on-device.
 * Supabase is touched only for auth and for the "Upload to Harry Graphics"
 * flow. The `data_sheet` blob is stored separately in AsyncStorage
 * (see lib/storage.ts) because it can be large and is JSON-shaped.
 */

export interface Project {
  project_id: string
  name: string
  created_on: number // epoch ms
  updated_on: number // epoch ms
  // data_sheet stored in AsyncStorage (lib/storage.ts), keyed by project_id.
}

const DB_NAME = 'harry_graphics.db'
let db: SQLite.SQLiteDatabase | null = null

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME)
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL,
        created_on   INTEGER NOT NULL,
        updated_on   INTEGER NOT NULL
      );
    `)
  }
  return db
}

export async function listProjects(): Promise<Project[]> {
  const d = await getDb()
  const rows = await d.getAllAsync<Project>(
    `SELECT project_id, name, created_on, updated_on
       FROM projects
       ORDER BY updated_on DESC`
  )
  return rows
}

export async function createProject(name: string): Promise<Project> {
  const d = await getDb()
  const now = Date.now()
  const project_id = nanoid()
  await d.runAsync(
    `INSERT INTO projects (project_id, name, created_on, updated_on)
       VALUES (?, ?, ?, ?)`,
    [project_id, name.trim(), now, now]
  )
  return { project_id, name: name.trim(), created_on: now, updated_on: now }
}

export async function touchProject(project_id: string): Promise<void> {
  const d = await getDb()
  await d.runAsync(
    `UPDATE projects SET updated_on = ? WHERE project_id = ?`,
    [Date.now(), project_id]
  )
}

export async function renameProject(
  project_id: string,
  name: string
): Promise<void> {
  const d = await getDb()
  await d.runAsync(
    `UPDATE projects SET name = ?, updated_on = ? WHERE project_id = ?`,
    [name.trim(), Date.now(), project_id]
  )
}

export async function deleteProject(project_id: string): Promise<void> {
  const d = await getDb()
  await d.runAsync(`DELETE FROM projects WHERE project_id = ?`, [project_id])
}
