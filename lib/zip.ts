import JSZip from 'jszip'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase, STORAGE_BUCKET } from './supabase'
import {
  getDataSheet,
  getAllProjectImageUris,
  getProjectImageBytes,
} from './storage'
import { sheetToXlsxBase64, base64ByteLength } from './dataSheet'
import { listProjects, type Project } from './db'

// ─── File read helpers ───────────────────────────────────────────────
// These avoid "Creating blobs from 'ArrayBuffer' not supported" in Expo Go
// by reading files from disk via fetch() instead of Blob constructors.

/**
 * Read a local file as an ArrayBuffer.
 * Uses fetch() with the file URI, falling back to base64 decode.
 */
async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch(uri)
    return await response.arrayBuffer()
  } catch {
    // Fallback: read as base64 via FileSystem, then decode
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
}

/**
 * Read a local file as a Blob.
 * Uses fetch() with the file URI, falling back to data-URL trick.
 */
async function readFileAsBlob(uri: string, mimeType: string): Promise<Blob> {
  try {
    const response = await fetch(uri)
    return await response.blob()
  } catch {
    // Fallback: read as base64, construct data URL, fetch as blob
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const dataUrl = `data:${mimeType};base64,${b64}`
    const response = await fetch(dataUrl)
    return await response.blob()
  }
}

/**
 * Write an ArrayBuffer to a temp file on disk and return its URI.
 */
async function writeTempFile(
  data: Uint8Array | ArrayBuffer,
  extension: string
): Promise<string> {
  // Convert to base64 for FileSystem.writeAsStringAsync
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j])
    }
  }
  const b64 = btoa(binary)
  const tmpPath = `${FileSystem.cacheDirectory}upload_${Date.now()}.${extension}`
  await FileSystem.writeAsStringAsync(tmpPath, b64, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return tmpPath
}

// ─── Public API ──────────────────────────────────────────────────────

export async function estimateUploadSize(projectId: string): Promise<{
  sheetBytes: number
  imageBytes: number
  totalBytes: number
}> {
  const sheet = await getDataSheet(projectId)
  let sheetBytes = 0
  if (sheet) {
    const b64 = sheetToXlsxBase64(sheet)
    sheetBytes = base64ByteLength(b64)
  }
  const imageBytes = await getProjectImageBytes(projectId)
  return { sheetBytes, imageBytes, totalBytes: sheetBytes + imageBytes }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export interface UploadCallbacks {
  onStage?: (stage: 'preparing' | 'uploading-sheet' | 'uploading-zip' | 'inserting' | 'done') => void
  onProgress?: (pct: number) => void
}

export async function uploadProjectToHarryGraphics(
  projectId: string,
  message: string,
  cb: UploadCallbacks = {}
): Promise<{ recordId: string }> {
  cb.onStage?.('preparing')
  cb.onProgress?.(5)

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error('You must be signed in to upload.')
  }
  const userId = user.id

  const project = await getProjectById(projectId)
  if (!project) throw new Error('Project not found in local DB.')

  const sheet = await getDataSheet(projectId)
  if (!sheet) throw new Error('Project has no data sheet to upload.')
  if (sheet.rows.length === 0) throw new Error('Data sheet has no rows.')

  // ─── Prepare XLSX file on disk ────────────────────────────────────
  cb.onProgress?.(10)
  const xlsxBase64 = sheetToXlsxBase64(sheet)
  const xlsxTmpPath = `${FileSystem.cacheDirectory}upload_${Date.now()}.xlsx`
  await FileSystem.writeAsStringAsync(xlsxTmpPath, xlsxBase64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  // ─── Build ZIP from disk files ────────────────────────────────────
  const imageUris = await getAllProjectImageUris(projectId)
  if (imageUris.length === 0) {
    throw new Error('No images captured yet — nothing to upload.')
  }

  cb.onProgress?.(20)
  const zip = new JSZip()
  for (let i = 0; i < imageUris.length; i++) {
    const img = imageUris[i]
    const safeName = img.name.replace(/[^a-zA-Z0-9_\-]/g, '_')
    // Read image file directly from disk as ArrayBuffer (no base64 conversion)
    const arrayBuffer = await readFileAsArrayBuffer(img.uri)
    zip.file(`${safeName}.jpg`, arrayBuffer)
    cb.onProgress?.(20 + Math.round((i / imageUris.length) * 10))
  }

  // Generate zip as Uint8Array, write to temp file on disk
  const zipData = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  })
  const zipTmpPath = await writeTempFile(zipData, 'zip')

  // ─── Upload XLSX ──────────────────────────────────────────────────
  cb.onProgress?.(35)
  cb.onStage?.('uploading-sheet')

  const xlsxPath =
    `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.xlsx`;
  const xlsxBuffer = await readFileAsArrayBuffer(xlsxTmpPath)

  const { error: xlsxErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(xlsxPath, xlsxBuffer, {
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })
  if (xlsxErr) {
    console.log('fdak', xlsxErr)
    throw new Error(`Sheet upload failed: ${xlsxErr.message}`)
  }

  // Clean up xlsx temp file
  await FileSystem.deleteAsync(xlsxTmpPath, { idempotent: true })

  // ─── Upload ZIP ───────────────────────────────────────────────────
  cb.onProgress?.(55)
  cb.onStage?.('uploading-zip')

  const zipBuffer = await readFileAsArrayBuffer(zipTmpPath)
  const zipPath =
    `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.zip`;
  const { error: zipErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(zipPath, zipBuffer, {
      contentType: 'application/zip',
      upsert: false,
    })
  if (zipErr) throw new Error(`Zip upload failed: ${zipErr.message}`)

  // Clean up zip temp file
  await FileSystem.deleteAsync(zipTmpPath, { idempotent: true })

  const { data: xlsxPub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(xlsxPath)
  const { data: zipPub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(zipPath)
  const sheetUrl = xlsxPub.publicUrl
  const zipUrl = zipPub.publicUrl

  // ─── Insert DB record ─────────────────────────────────────────────
  cb.onProgress?.(80)
  cb.onStage?.('inserting')

  const now = new Date().toISOString()
  const { data: inserted, error: insErr } = await supabase
    .from('id_project_data')
    .insert({
      project_id: projectId,
      name: project.name,
      created_on: now,
      updated_on: now,
      data_sheet: sheet,
      user_id: userId,
      message: message || null,
      image_zip: zipUrl,
    })
    .select('id')
    .single()
  if (insErr) throw new Error(`Database insert failed: ${insErr.message}`)

  cb.onProgress?.(100)
  cb.onStage?.('done')

  return { recordId: inserted.id }
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const all = await listProjects()
  return all.find(p => p.project_id === projectId) ?? null
}
