import JSZip from 'jszip'
import { supabase, STORAGE_BUCKET } from './supabase'
import {
  getDataSheet,
  getAllProjectImages,
  getProjectImageBytes,
} from './storage'
import { sheetToXlsxBase64, base64ByteLength } from './dataSheet'
import { listProjects, type Project } from './db'

/** Decode a data: URL to { mime, bytes }. */
function dataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const [meta, b64] = dataUrl.split(',')
  const mimeMatch = meta.match(/data:([^;]+)/)
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return { mime, bytes: arr }
}

/**
 * Estimate total upload size in bytes:
 *   - xlsx sheet bytes (base64-encoded; we round to the decoded byte length)
 *   - sum of all image data-URL byte lengths
 */
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

/**
 * Upload flow:
 *   1. Re-export the data_sheet to an xlsx file (base64 → Blob → upload).
 *   2. Zip every saved image for this project, naming each `{photo_id}.jpg`.
 *   3. Upload xlsx + zip to Supabase Storage under `${user_id}/{uuid}.{ext}`.
 *   4. Insert a row into `id_project_data` with the public URLs + metadata.
 */
export interface UploadCallbacks {
  onStage?: (stage: 'preparing' | 'uploading-sheet' | 'uploading-zip' | 'inserting' | 'done') => void
  onProgress?: (pct: number) => void
}

export async function uploadProjectToHarryGraphics(
  projectId: string,
  message: string,
  cb: UploadCallbacks = {}
): Promise<{ sheetUrl: string; zipUrl: string; recordId: string }> {
  cb.onStage?.('preparing')
  cb.onProgress?.(5)

  // ─── 1. Auth check ─────────────────────────────────────────────────
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error('You must be signed in to upload.')
  }
  const userId = user.id

  // ─── 2. Load project + sheet ───────────────────────────────────────
  const project = await getProjectById(projectId)
  if (!project) throw new Error('Project not found in local DB.')

  const sheet = await getDataSheet(projectId)
  if (!sheet) throw new Error('Project has no data sheet to upload.')
  if (sheet.rows.length === 0) throw new Error('Data sheet has no rows.')

  const xlsxBase64 = sheetToXlsxBase64(sheet)
  // Convert base64 → Uint8Array → Blob for upload.
  const xlsxBytes = Uint8Array.from(atob(xlsxBase64), c => c.charCodeAt(0))
  const xlsxBlob = new Blob([xlsxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  // ─── 3. Zip images ─────────────────────────────────────────────────
  const images = await getAllProjectImages(projectId)
  if (images.length === 0) {
    throw new Error('No images captured yet — nothing to upload.')
  }
  const zip = new JSZip()
  for (const img of images) {
    // Sanitize filename — strip path separators etc.
    const safeName = img.name.replace(/[^a-zA-Z0-9_\-]/g, '_')
    const { bytes } = dataUrlToBytes(img.dataUrl)
    zip.file(`${safeName}.jpg`, bytes)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

  cb.onProgress?.(30)
  cb.onStage?.('uploading-sheet')

  // ─── 4. Upload xlsx ────────────────────────────────────────────────
  const xlsxPath = `${userId}/${crypto.randomUUID()}.xlsx`
  const { error: xlsxErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(xlsxPath, xlsxBlob, {
      contentType: xlsxBlob.type,
      upsert: false,
    })
  if (xlsxErr) throw new Error(`Sheet upload failed: ${xlsxErr.message}`)

  cb.onProgress?.(55)
  cb.onStage?.('uploading-zip')

  // ─── 5. Upload zip ─────────────────────────────────────────────────
  const zipPath = `${userId}/${crypto.randomUUID()}.zip`
  const { error: zipErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(zipPath, zipBlob, {
      contentType: 'application/zip',
      upsert: false,
    })
  if (zipErr) throw new Error(`Zip upload failed: ${zipErr.message}`)

  const { data: xlsxPub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(xlsxPath)
  const { data: zipPub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(zipPath)
  const sheetUrl = xlsxPub.publicUrl
  const zipUrl = zipPub.publicUrl

  cb.onProgress?.(80)
  cb.onStage?.('inserting')

  // ─── 6. Insert row into id_project_data ────────────────────────────
  // data_sheet column stored as JSONB (the sheet's columns + rows).
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
      // data_download_link-style: store the xlsx URL too for parity.
      // If the table doesn't have this column, the insert will fail and
      // the user can drop this line. Keeping it commented for safety.
      // data_download_link: sheetUrl,
    })
    .select('id')
    .single()
  if (insErr) throw new Error(`Database insert failed: ${insErr.message}`)

  cb.onProgress?.(100)
  cb.onStage?.('done')

  return { sheetUrl, zipUrl, recordId: inserted.id }
}

/** Tiny helper exposed for the UI layer. */
export async function getProjectById(projectId: string): Promise<Project | null> {
  const all = await listProjects()
  return all.find(p => p.project_id === projectId) ?? null
}
