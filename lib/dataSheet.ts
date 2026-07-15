import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { read, utils, write } from 'xlsx'
import type { DataSheet } from './storage'

/**
 * Excel sheet handling.
 *
 * Two entry points:
 *   1. `pickAndLoadExcel()` — opens the document picker, returns the
 *      list of sheet names so the user can pick one (or just the first).
 *   2. `loadSheetFromFile()` — given a file URI + sheet name, returns a
 *      DataSheet (the shape we persist in AsyncStorage).
 *
 * Also includes helpers for:
 *   - Creating a blank sheet with one `photo_id` column.
 *   - Re-exporting a DataSheet back to an xlsx Blob for upload.
 *   - Appending a new row with a given photo_id value.
 */

/** Pick an .xlsx/.xls/.csv file from the device. */
export async function pickExcelFile(): Promise<{
  uri: string
  name: string
  sheets: string[]
} | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'public.spreadsheet',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled || !result.assets?.[0]) return null
  const asset = result.assets[0]
  const sheets = await listSheetNames(asset.uri)
  return { uri: asset.uri, name: asset.name, sheets }
}

/** Read an xlsx file and return the names of its sheets. */
export async function listSheetNames(uri: string): Promise<string[]> {
  // FileSystem.readAsStringAsync handles `file://` and `content://` on Android.
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const wb = read(b64, { type: 'base64' })
  return wb.SheetNames
}

/** Load a specific sheet from a file into a DataSheet. */
export async function loadSheetFromFile(
  uri: string,
  sheetName: string
): Promise<DataSheet> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const wb = read(b64, { type: 'base64' })
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`)
  const json = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (json.length === 0) {
    return { sheetName, columns: [], rows: [] }
  }
  const columns = Object.keys(json[0])
  const rows = json.map(r => {
    const out: Record<string, string | number | boolean | null> = {}
    for (const c of columns) {
      const v = r[c]
      if (v == null) out[c] = ''
      else if (typeof v === 'number' || typeof v === 'boolean') out[c] = v
      else out[c] = String(v)
    }
    return out
  })
  return { sheetName, columns, rows }
}

/**
 * Create a blank DataSheet with a single `photo_id` column.
 * Used when the user picks "blank sheet" on project creation.
 */
export function blankSheet(): DataSheet {
  return {
    sheetName: 'Sheet1',
    columns: ['photo_id'],
    rows: [],
  }
}

/**
 * Append a new row to a DataSheet with a specific value in the photo_id
 * column and blank values for every other column. Used by Screen 4's
 * "Add new entry" flow.
 */
export function appendRowWithPhotoId(
  sheet: DataSheet,
  photoId: string
): { sheet: DataSheet; rowIndex: number } {
  const newRow: Record<string, string | number | boolean | null> = {}
  for (const c of sheet.columns) {
    newRow[c] = c === sheet.columns[0] ? photoId : ''
  }
  // Make sure photo_id column actually exists (it might not if the user
  // uploaded a custom sheet without one). If it doesn't, we still need
  // a place to write the value, so we add it.
  // (The settings screen enforces this normally, but be defensive.)
  const idCol = findPhotoIdColumn(sheet)
  if (idCol) {
    newRow[idCol] = photoId
  }
  const next: DataSheet = {
    ...sheet,
    rows: [...sheet.rows, newRow],
  }
  return { sheet: next, rowIndex: next.rows.length - 1 }
}

/**
 * Convenience: find which column is the "photo_id" column. Defaults to
 * the first column (per the user's spec: "default to first column name").
 */
export function findPhotoIdColumn(sheet: DataSheet): string {
  return sheet.columns[0] ?? 'photo_id'
}

/**
 * Add a brand-new column to the sheet. Used by Screen 3's "create new
 * photo_id column" dropdown option.
 */
export function addColumn(sheet: DataSheet, columnName: string): DataSheet {
  if (sheet.columns.includes(columnName)) return sheet
  const newColumns = [...sheet.columns, columnName]
  const newRows = sheet.rows.map(r => ({ ...r, [columnName]: '' }))
  return { ...sheet, columns: newColumns, rows: newRows }
}

/**
 * Serialize a DataSheet back to an xlsx Blob for upload.
 * Returns a base64 string (because that's what expo-file-system gives us
 * for reading; supabase-js accepts Blob or ArrayBuffer or base64 — we
 * convert to a Blob via base64-decode in lib/zip.ts).
 */
export function sheetToXlsxBase64(sheet: DataSheet): string {
  const wb = utils.book_new()
  const ws = utils.json_to_sheet(sheet.rows, { header: sheet.columns })
  utils.book_append_sheet(wb, ws, sheet.sheetName || 'Sheet1')
  // `write` with type:'base64' returns a base64 string of the xlsx file.
  return write(wb, { type: 'base64', bookType: 'xlsx' })
}

/** Rough size of the xlsx file in bytes, given a base64 string. */
export function base64ByteLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}
