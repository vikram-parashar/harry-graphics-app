import * as SQLite from 'expo-sqlite'
import { nanoid } from '../lib/nanoid'
import { getCurrentUserId } from './storage'

export interface Project {
  project_id: string
  name: string
  created_on: number // epoch ms
  updated_on: number // epoch ms
  user_id: string | null
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
        updated_on   INTEGER NOT NULL,
        user_id      TEXT
      );
    `)
    // Migration: add user_id column if it doesn't exist
    try {
      await db.execAsync(`ALTER TABLE projects ADD COLUMN user_id TEXT;`)
    } catch {
      // Column already exists — ignore
    }
  }
  return db
}

export async function listProjects(): Promise<Project[]> {
  const d = await getDb()
  const userId = getCurrentUserId()
  const rows = await d.getAllAsync<Project>(
    `SELECT project_id, name, created_on, updated_on, user_id
       FROM projects
       WHERE user_id = ? OR user_id IS NULL
       ORDER BY updated_on DESC`,
    [userId ?? '']
  )
  return rows
}

export async function createProject(name: string): Promise<Project> {
  const d = await getDb()
  const now = Date.now()
  const project_id = nanoid()
  const userId = getCurrentUserId()
  await d.runAsync(
    `INSERT INTO projects (project_id, name, created_on, updated_on, user_id)
       VALUES (?, ?, ?, ?, ?)`,
    [project_id, name.trim(), now, now, userId]
  )
  return { project_id, name: name.trim(), created_on: now, updated_on: now, user_id: userId }
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
