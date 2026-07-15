import { useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  FlatList,
} from 'react-native'
import { X, FileSpreadsheet, FilePlus } from 'lucide-react-native'
import { pickExcelFile, loadSheetFromFile, blankSheet } from '@/lib/dataSheet'
import type { DataSheet } from '@/lib/storage'

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, sheet: DataSheet) => Promise<void>
}

type Source = 'none' | 'upload' | 'blank'

/**
 * Create-project modal. User picks a name and either:
 *   - uploads an Excel file and selects a sheet from it, or
 *   - starts with a blank sheet (one column: `photo_id`).
 *
 * Mirrors the visual pattern of the dashboard's ProductFormModal:
 *   bordered cream box, header with bottom border, footer with top border,
 *   no rounded corners, no shadows.
 */
export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
}: CreateProjectModalProps) {
  const [name, setName] = useState('')
  const [source, setSource] = useState<Source>('none')
  const [pickedUri, setPickedUri] = useState<string | null>(null)
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setName('')
    setSource('none')
    setPickedUri(null)
    setPickedName(null)
    setSheets([])
    setSelectedSheet(null)
    setError('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const handlePickFile = async () => {
    setError('')
    setLoading(true)
    try {
      const picked = await pickExcelFile()
      if (!picked) {
        setLoading(false)
        return
      }
      setPickedUri(picked.uri)
      setPickedName(picked.name)
      setSheets(picked.sheets)
      setSelectedSheet(picked.sheets[0] ?? null)
      setSource('upload')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file.')
    } finally {
      setLoading(false)
    }
  }

  const handlePickBlank = () => {
    setSource('blank')
    setPickedUri(null)
    setPickedName(null)
    setSheets([])
    setSelectedSheet(null)
  }

  const canCreate =
    name.trim().length > 0 &&
    ((source === 'blank') ||
      (source === 'upload' && !!pickedUri && !!selectedSheet))

  const handleCreate = async () => {
    setError('')
    setLoading(true)
    try {
      let sheet: DataSheet
      if (source === 'blank') {
        sheet = blankSheet()
      } else if (source === 'upload' && pickedUri && selectedSheet) {
        sheet = await loadSheetFromFile(pickedUri, selectedSheet)
        // Spec: "if blank add a photo_id column" — only the *blank* path
        // auto-adds photo_id. Uploaded sheets keep their original columns.
      } else {
        throw new Error('Pick a sheet source first.')
      }
      await onCreate(name.trim(), sheet)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
      <Pressable className="flex-1 bg-charcoal/60" onPress={close}>
        <Pressable
          onPress={e => e.stopPropagation()}
          className="m-auto w-full max-w-md bg-cream border border-charcoal/10"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-charcoal/10 p-6 pb-4">
            <Text className="text-2xl font-bold text-charcoal">New Project</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={20} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <View className="p-6">
            {error ? (
              <View className="mb-4 border-l-4 border-magenta bg-magenta/10 p-3">
                <Text className="text-sm text-magenta">{error}</Text>
              </View>
            ) : null}

            {/* Project name */}
            <View className="mb-6">
              <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
                Project Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. School ID Cards — Grade 10"
                placeholderTextColor="#6B6B6B"
                className="h-12 w-full border border-charcoal/20 bg-white px-4 text-charcoal focus:border-charcoal"
              />
            </View>

            {/* Data source picker */}
            <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
              Data Sheet *
            </Text>
            <View className="flex-row gap-3 pb-3">
              <SourceCard
                active={source === 'upload'}
                onPress={handlePickFile}
                icon={<FileSpreadsheet size={20} color={source === 'upload' ? '#F5F1E8' : '#1A1A1A'} />}
                title="Upload Excel"
                subtitle="Pick a sheet"
              />
              <SourceCard
                active={source === 'blank'}
                onPress={handlePickBlank}
                icon={<FilePlus size={20} color={source === 'blank' ? '#F5F1E8' : '#1A1A1A'} />}
                title="Blank Sheet"
                subtitle="Auto-adds photo_id"
              />
            </View>

            {/* Picked file info + sheet picker */}
            {pickedName && sheets.length > 0 ? (
              <View className="mb-2 border border-charcoal/10 bg-white p-3">
                <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
                  File
                </Text>
                <Text className="mt-1 text-sm text-charcoal">{pickedName}</Text>
                {sheets.length > 1 ? (
                  <View className="mt-3">
                    <Text className="py-1 text-xs font-semibold uppercase tracking-widest text-charcoal">
                      Sheet
                    </Text>
                    <View className="border border-charcoal/20">
                      <FlatList
                        data={sheets}
                        keyExtractor={s => s}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            onPress={() => setSelectedSheet(item)}
                            className={`flex-row items-center justify-between border-b border-charcoal/10 px-3 py-2 ${
                              selectedSheet === item ? 'bg-cyan/10' : ''
                            }`}
                          >
                            <Text className="text-sm text-charcoal">{item}</Text>
                            {selectedSheet === item ? (
                              <Text className="font-mono text-xs uppercase text-cyan">Selected</Text>
                            ) : null}
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  </View>
                ) : (
                  <Text className="mt-2 text-xs text-charcoal-light">
                    Single sheet detected: <Text className="text-charcoal">{sheets[0]}</Text>
                  </Text>
                )}
              </View>
            ) : null}

            {source === 'blank' ? (
              <View className="mb-2 border border-charcoal/10 bg-white p-3">
                <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
                  Sheet preview
                </Text>
                <Text className="mt-1 text-sm text-charcoal">Columns: photo_id</Text>
                <Text className="mt-1 text-xs text-charcoal-light">Rows: 0</Text>
              </View>
            ) : null}
          </View>

          {/* Footer */}
          <View className="flex-row items-center justify-end gap-2 border-t border-charcoal/10 p-4">
            <TouchableOpacity
              onPress={close}
              disabled={loading}
              className="h-10 items-center justify-center border border-charcoal/30 bg-cream px-5 active:bg-charcoal/5 disabled:opacity-50"
            >
              <Text className="font-mono text-xs uppercase tracking-widest text-charcoal">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={loading || !canCreate}
              className="h-10 flex-row items-center justify-center gap-2 bg-cyan px-5 active:bg-cyan/90 disabled:opacity-50"
            >
              {loading ? (
                <ActivityIndicator color="#F5F1E8" />
              ) : (
                <Text className="font-mono text-xs uppercase tracking-widest text-white">
                  Create
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function SourceCard({
  active,
  onPress,
  icon,
  title,
  subtitle,
}: {
  active: boolean
  onPress: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-1 border p-3 ${active ? 'border-cyan bg-cyan' : 'border-charcoal/20 bg-cream'}`}
    >
      <View className="mb-1">{icon}</View>
      <Text
        className={`text-sm font-semibold ${active ? 'text-cream' : 'text-charcoal'}`}
      >
        {title}
      </Text>
      <Text
        className={`mt-0.5 text-[10px] ${active ? 'text-cream/80' : 'text-charcoal-light'}`}
      >
        {subtitle}
      </Text>
    </TouchableOpacity>
  )
}
