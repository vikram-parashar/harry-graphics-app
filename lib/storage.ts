import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'

export interface DataSheet {
  sheetName: string
  columns: string[]
  rows: Record<string, string | number | boolean | null>[]
}

export interface SortColumn {
  column: string
  direction: 'asc' | 'desc'
}

export interface ColumnFilter {
  column: string
  excludedValues: string[]
  hasImageOnly?: boolean
}

export interface ProjectSettings {
  photo_id_column: string
  sort_by: SortColumn[]
  search_in: string[]
  photo_width_mm: number
  photo_height_mm: number
  referenced_row_number: number
  filters: ColumnFilter[]
}

export const DEFAULT_SETTINGS: Omit<ProjectSettings, 'photo_id_column' | 'sort_by' | 'search_in' | 'filters'> = {
  photo_width_mm: 35,
  photo_height_mm: 45,
  referenced_row_number: 0,
}

// ─── User ID scoping ─────────────────────────────────────────────────

let _currentUserId: string | null = null

export function setCurrentUserId(userId: string | null) {
  _currentUserId = userId
}

export function getCurrentUserId(): string | null {
  return _currentUserId
}

// ─── Images directory (filesystem, not AsyncStorage) ──────────────────

function getImagesDir(projectId: string): string {
  const uid = _currentUserId ?? 'anon'
  return `${FileSystem.documentDirectory}projects/${uid}/${projectId}/images/`
}

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
  }
}

// ─── Data sheet ──────────────────────────────────────────────────────

export async function getDataSheet(projectId: string): Promise<DataSheet | null> {
  const raw = await AsyncStorage.getItem(keySheet(projectId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as DataSheet
  } catch {
    return null
  }
}

export async function setDataSheet(projectId: string, sheet: DataSheet): Promise<void> {
  await AsyncStorage.setItem(keySheet(projectId), JSON.stringify(sheet))
}

// ─── Settings ────────────────────────────────────────────────────────

export async function getSettings(projectId: string): Promise<ProjectSettings | null> {
  const raw = await AsyncStorage.getItem(keySettings(projectId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // Migrate old format: sort_by was a single string
    if (typeof parsed.sort_by === 'string') {
      parsed.sort_by = [{ column: parsed.sort_by, direction: 'asc' as const }]
    }
    // Migrate old format: search_in was a single string
    if (typeof parsed.search_in === 'string') {
      parsed.search_in = [parsed.search_in]
    }
    // Migrate: filters field missing
    if (!Array.isArray(parsed.filters)) {
      parsed.filters = []
    }
    return parsed as ProjectSettings
  } catch {
    return null
  }
}

export async function setSettings(projectId: string, settings: ProjectSettings): Promise<void> {
  await AsyncStorage.setItem(keySettings(projectId), JSON.stringify(settings))
}

// ─── Images (filesystem-based) ───────────────────────────────────────

export async function listImageNames(projectId: string): Promise<string[]> {
  const dir = getImagesDir(projectId)
  const info = await FileSystem.getInfoAsync(dir)
  if (!info.exists) return []
  try {
    const files = await FileSystem.readDirectoryAsync(dir)
    return files
      .filter(f => f.endsWith('.jpg'))
      .map(f => f.replace(/\.jpg$/, ''))
  } catch {
    return []
  }
}

/**
 * Returns the file URI for a stored image, or null if not found.
 */
export async function getImageUri(
  projectId: string,
  photoId: string
): Promise<string | null> {
  const path = `${getImagesDir(projectId)}${photoId}.jpg`
  const info = await FileSystem.getInfoAsync(path)
  return info.exists ? path : null
}

/**
 * Store an image by copying/moving from a source URI (e.g. camera cache).
 * Source URI can be a file:// URI from the camera or another location.
 */
export async function setImage(
  projectId: string,
  photoId: string,
  sourceUri: string
): Promise<void> {
  const dir = getImagesDir(projectId)
  await ensureDir(dir)
  const destPath = `${dir}${photoId}.jpg`
  // If destination already exists, overwrite it
  const existing = await FileSystem.getInfoAsync(destPath)
  if (existing.exists) {
    await FileSystem.deleteAsync(destPath, { idempotent: true })
  }
  await FileSystem.copyAsync({ from: sourceUri, to: destPath })
}

export async function deleteImage(projectId: string, photoId: string): Promise<void> {
  const path = `${getImagesDir(projectId)}${photoId}.jpg`
  const info = await FileSystem.getInfoAsync(path)
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true })
  }
}

/**
 * Returns total bytes used by images for a project (from file sizes).
 */
export async function getProjectImageBytes(projectId: string): Promise<number> {
  const names = await listImageNames(projectId)
  const dir = getImagesDir(projectId)
  let total = 0
  for (const n of names) {
    const path = `${dir}${n}.jpg`
    const info = await FileSystem.getInfoAsync(path)
    if (info.exists && (info as any).size) {
      total += (info as any).size as number
    }
  }
  return total
}

/**
 * Returns all image URIs for a project (for upload & gallery).
 */
export async function getAllProjectImageUris(
  projectId: string
): Promise<{ name: string; uri: string }[]> {
  const names = await listImageNames(projectId)
  const dir = getImagesDir(projectId)
  const out: { name: string; uri: string }[] = []
  for (const n of names) {
    const path = `${dir}${n}.jpg`
    const info = await FileSystem.getInfoAsync(path)
    if (info.exists) {
      out.push({ name: n, uri: path })
    }
  }
  return out
}

export async function wipeProjectStorage(projectId: string): Promise<void> {
  // Delete settings and data_sheet from AsyncStorage
  const allKeys = await AsyncStorage.getAllKeys()
  const toRemove = allKeys.filter(
    k =>
      typeof k === 'string' &&
      (k === keySheet(projectId) ||
        k === keySettings(projectId))
  )
  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove as string[])

  // Delete images directory from filesystem
  const dir = getImagesDir(projectId)
  const info = await FileSystem.getInfoAsync(dir)
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true })
  }
}

// ─── Key builders (scoped by user_id, for AsyncStorage) ──────────────

const keySheet = (projectId: string) =>
  `user:${_currentUserId ?? 'anon'}:data_sheet:${projectId}`
const keySettings = (projectId: string) =>
  `user:${_currentUserId ?? 'anon'}:settings:${projectId}`
