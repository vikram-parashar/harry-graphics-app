import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * AsyncStorage is our localStorage equivalent.
 *
 * Per-project keys:
 *   - `data_sheet:{project_id}`            — the Excel sheet (JSON)
 *   - `settings:{project_id}`              — capture screen settings
 *   - `image:{project_id}:{photo_id}`      — JPEG data URL of one captured photo
 *
 * We use namespaced keys so per-project deletion is a simple scan.
 *
 * NOTE on the user's "no cap" choice: AsyncStorage has a 6 MB ceiling
 * on Android by default. We do not enforce a cap, but if QuotaExceeded
 * is thrown we rethrow it up to the UI for surfacing.
 */

export interface DataSheet {
  /** Original sheet name (for display). */
  sheetName: string
  /** Column headers in original order. */
  columns: string[]
  /** Rows as objects keyed by column name. */
  rows: Record<string, string | number | boolean | null>[]
}

export interface ProjectSettings {
  /** Column whose value is used as the filename when saving photos. */
  photo_id_column: string
  /** Column used to sort rows before navigating prev/next. */
  sort_by: string
  /** Column whose value is shown in the search bar + used for fuzzy match. */
  search_in: string
  /** Photo print size in mm. */
  photo_width_mm: number
  photo_height_mm: number
  /** Index into the *sorted* rows array; -1 means "no reference yet". */
  referenced_row_number: number
}

export const DEFAULT_SETTINGS: Omit<ProjectSettings, 'photo_id_column' | 'sort_by' | 'search_in'> = {
  photo_width_mm: 35,
  photo_height_mm: 45,
  referenced_row_number: 0,
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
    return JSON.parse(raw) as ProjectSettings
  } catch {
    return null
  }
}

export async function setSettings(projectId: string, settings: ProjectSettings): Promise<void> {
  await AsyncStorage.setItem(keySettings(projectId), JSON.stringify(settings))
}

// ─── Images ──────────────────────────────────────────────────────────

/** Returns a list of photo_id values that have a saved image. */
export async function listImageNames(projectId: string): Promise<string[]> {
  const allKeys = await AsyncStorage.getAllKeys()
  const prefix = keyImagePrefix(projectId)
  const matches = allKeys.filter(k => typeof k === 'string' && k.startsWith(prefix))
  return matches.map(k => (k as string).slice(prefix.length))
}

export async function getImage(
  projectId: string,
  photoId: string
): Promise<string | null> {
  return AsyncStorage.getItem(keyImage(projectId, photoId))
}

export async function setImage(
  projectId: string,
  photoId: string,
  jpegDataUrl: string
): Promise<void> {
  await AsyncStorage.setItem(keyImage(projectId, photoId), jpegDataUrl)
}

export async function deleteImage(projectId: string, photoId: string): Promise<void> {
  await AsyncStorage.removeItem(keyImage(projectId, photoId))
}

/**
 * Compute approximate byte size of all images for a project.
 * Used by the upload modal's size-estimate prompt.
 */
export async function getProjectImageBytes(projectId: string): Promise<number> {
  const names = await listImageNames(projectId)
  let total = 0
  for (const n of names) {
    const v = await getImage(projectId, n)
    if (v) total += v.length
  }
  return total
}

/**
 * Returns { name, dataUrl } for every image saved for this project.
 * Used when zipping images for upload.
 */
export async function getAllProjectImages(
  projectId: string
): Promise<{ name: string; dataUrl: string }[]> {
  const names = await listImageNames(projectId)
  const out: { name: string; dataUrl: string }[] = []
  for (const n of names) {
    const v = await getImage(projectId, n)
    if (v) out.push({ name: n, dataUrl: v })
  }
  return out
}

/** Delete all storage keys belonging to a project. Call when deleting a project. */
export async function wipeProjectStorage(projectId: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys()
  const toRemove = allKeys.filter(
    k =>
      typeof k === 'string' &&
      (k === keySheet(projectId) ||
        k === keySettings(projectId) ||
        k.startsWith(keyImagePrefix(projectId)))
  )
  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove as string[])
}

// ─── Key builders ────────────────────────────────────────────────────

const keySheet = (projectId: string) => `data_sheet:${projectId}`
const keySettings = (projectId: string) => `settings:${projectId}`
const keyImagePrefix = (projectId: string) => `image:${projectId}:`
const keyImage = (projectId: string, photoId: string) =>
  `${keyImagePrefix(projectId)}${photoId}`
