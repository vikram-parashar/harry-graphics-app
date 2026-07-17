import { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import {
  X,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Link2,
} from 'lucide-react-native'
import {
  uploadProjectToHarryGraphics,
  estimateUploadSize,
  formatBytes,
  type UploadCallbacks,
} from '@/lib/zip'

type Stage =
  | 'idle'
  | 'confirming'
  | 'preparing'
  | 'uploading-sheet'
  | 'uploading-zip'
  | 'inserting'
  | 'done'
  | 'error'

const STAGE_LABEL: Record<Stage, string> = {
  idle: 'Idle',
  confirming: 'Waiting for confirmation…',
  preparing: 'Preparing files…',
  'uploading-sheet': 'Uploading Excel sheet…',
  'uploading-zip': 'Uploading image zip…',
  inserting: 'Saving project record…',
  done: 'Upload complete!',
  error: 'Upload failed',
}

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
}

/**
 * Upload-to-Harry-Graphics modal. Mirrors the web's
 * upload-to-harry-graphics-modal.tsx flow:
 *   1. Estimate size (xlsx + images), show a "Sure to upload?" prompt
 *      with the size breakdown.
 *   2. On confirm: zip images, upload xlsx + zip to Supabase storage,
 *      insert a row into `id_project_data`.
 *   3. Show the resulting public URLs.
 */
export default function UploadToHarryGraphicsModal({
  isOpen,
  onClose,
  projectId,
  projectName,
}: UploadModalProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<{ recordId: string } | null>(null)
  const [sizeInfo, setSizeInfo] = useState<{ sheetBytes: number; imageBytes: number; totalBytes: number } | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setStage('confirming')
    setProgress(0)
    setErrorMsg(null)
    setResult(null)
    setSizeInfo(null)
    setMessage('')
      ; (async () => {
        try {
          const sizes = await estimateUploadSize(projectId)
          setSizeInfo(sizes)
        } catch (e) {
          setErrorMsg(e instanceof Error ? e.message : 'Failed to estimate size.')
          setStage('error')
        }
      })()
  }, [isOpen, projectId])

  const handleConfirm = async () => {
    setErrorMsg(null)
    setStage('preparing')
    const cb: UploadCallbacks = {
      onStage: s => setStage(s as Stage),
      onProgress: p => setProgress(p),
    }
    try {
      const res = await uploadProjectToHarryGraphics(projectId, message, cb)
      setResult(res)
      setStage('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      setStage('error')
    }
  }

  const handleClose = () => {
    if (stage !== 'idle' && stage !== 'done' && stage !== 'error' && stage !== 'confirming') {
      // Block closing while an upload is in flight.
      return
    }
    onClose()
  }

  const uploading = stage !== 'idle' && stage !== 'done' && stage !== 'error' && stage !== 'confirming'

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable className="flex-1 bg-black/50" onPress={handleClose}>
        <Pressable
          onPress={e => e.stopPropagation()}
          className="m-auto w-full max-w-lg bg-cream border border-charcoal"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-charcoal bg-charcoal px-5 py-3">
            <Text className="flex-row items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-cream">
              <UploadCloud size={16} color="#F5F1E8" />  Upload to Harry Graphics
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              disabled={uploading}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={18} color={uploading ? '#6B6B6B' : '#F5F1E8'} />
            </TouchableOpacity>
          </View>

          <View className="gap-4 p-5">
            <Text className="text-xs leading-relaxed text-charcoal-light">
              Zips all captured images, exports your data sheet,
              uploads to Harry Graphics storage.
            </Text>

            {/* Confirming stage — show size estimate + message field */}
            {stage === 'confirming' && (
              <View className="gap-3">
                {!sizeInfo ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#1A1A1A" />
                    <Text className="text-xs text-charcoal-light">Estimating upload size…</Text>
                  </View>
                ) : (
                  <View className="border border-charcoal/10 bg-cream-dark p-3">
                    <Row label="Excel sheet" value={formatBytes(sizeInfo.sheetBytes)} />
                    <Row label="Images (zip)" value={formatBytes(sizeInfo.imageBytes)} />
                    <View className="mt-2 border-t border-charcoal/20 pt-2">
                      <Row label="Total upload" value={formatBytes(sizeInfo.totalBytes)} bold />
                    </View>
                  </View>
                )}

                <View>
                  <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
                    Message (optional)
                  </Text>
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Notes regarding project"
                    placeholderTextColor="#6B6B6B"
                    multiline
                    className="min-h-[60px] w-full border border-charcoal/20 bg-white p-3 text-charcoal"
                  />
                </View>

                <View className="flex-row items-center gap-2 border-l-4 border-yellow bg-yellow/10 p-3">
                  <AlertTriangle size={14} color="#FBC02D" />
                  <Text className="flex-1 text-xs text-charcoal">
                    Project: <Text className="font-semibold">{projectName}</Text>. Are you sure you want to upload? Please do not close app or modal while uploading.
                  </Text>
                </View>
              </View>
            )}

            {/* Upload progress */}
            {uploading && (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#1A1A1A" />
                  <Text className="font-mono text-xs uppercase tracking-widest text-charcoal">
                    {STAGE_LABEL[stage]}
                  </Text>
                </View>
                <View className="h-2 w-full overflow-hidden bg-charcoal/10">
                  <View
                    className="h-full bg-cyan"
                    style={{ width: `${Math.round(progress)}%` }}
                  />
                </View>
                <Text className="font-mono text-[10px] text-charcoal-light">
                  {Math.round(progress)}% — please keep the app open.
                </Text>
              </View>
            )}

            {/* Done */}
            {stage === 'done' && result && (
              <View className="gap-3">
                <View className="flex-row items-start gap-2 border border-cyan/30 bg-cyan/5 p-3">
                  <CheckCircle2 size={14} color="#00AEEF" />
                  <Text className="flex-1 text-xs text-charcoal">
                    Upload complete!
                  </Text>
                </View>
              </View>
            )}

            {/* Error */}
            {stage === 'error' && (
              <View className="flex-row items-start gap-2 border border-magenta/30 bg-magenta/5 p-3">
                <AlertTriangle size={14} color="#D32F2F" />
                <Text className="flex-1 text-xs text-charcoal">
                  {errorMsg || 'Upload failed. Please try again.'}
                </Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View className="flex-row items-center justify-end gap-2 border-t border-charcoal/10 bg-cream-dark p-4">
            {stage === 'done' ? (
              <TouchableOpacity
                onPress={handleClose}
                className="h-10 items-center justify-center border border-cyan bg-cyan px-5 active:bg-cyan/90"
              >
                <Text className="font-mono text-xs uppercase tracking-widest text-white">Done</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={handleClose}
                  disabled={uploading}
                  className="h-10 items-center justify-center border border-charcoal/30 bg-cream px-5 active:bg-charcoal/5 disabled:opacity-50"
                >
                  <Text className="font-mono text-xs uppercase tracking-widest text-charcoal">
                    {stage === 'error' ? 'Close' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={uploading || stage !== 'confirming' || !sizeInfo}
                  className="h-10 flex-row items-center justify-center gap-2 border border-cyan bg-cyan px-5 active:bg-cyan/90 disabled:opacity-50"
                >
                  {uploading ? <ActivityIndicator color="#FFFFFF" /> : null}
                  <Text className="font-mono text-xs uppercase tracking-widest text-white">
                    Upload
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
        {label}
      </Text>
      <Text className={`font-mono text-xs text-charcoal ${bold ? 'font-bold' : ''}`}>{value}</Text>
    </View>
  )
}
