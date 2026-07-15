import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import { ArrowLeft, MoreVertical, Search, Check, X, RotateCcw, Camera as CameraIcon, Plus, Settings as SettingsIcon } from 'lucide-react-native'
import Fuse from 'fuse.js'
import {
  getDataSheet,
  setDataSheet,
  getSettings,
  setSettings,
  setImage,
  listImageNames,
  type DataSheet,
  type ProjectSettings,
} from '@/lib/storage'
import { appendRowWithPhotoId } from '@/lib/dataSheet'
import { sortedRowIndices } from '@/lib/search'
import { hash4 } from '@/lib/nanoid'
import { touchProject } from '@/lib/db'

const SCREEN_W = Dimensions.get('window').width

/**
 * Screen 4 — Capture.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │ [search bar]  ........ [⋮ menu] │ ← top
 *   │  top-5 fuzzy match dropdown     │
 *   ├─────────────────────────────────┤
 *   │                                 │
 *   │                                 │
 *   │            CAMERA               │  ← 80vh
 *   │      [ orange 2px rectangle ]   │
 *   │                                 │
 *   │            (○)                  │  ← shutter
 *   ├─────────────────────────────────┤
 *   │  ← prev   {first-row value}     │  ← bottom
 *   │            {search_in value}    │
 *   │           next →                │
 *   └─────────────────────────────────┘
 *
 * Behaviors:
 *   - Shutter → takePictureAsync → preview replaces camera
 *   - Preview → Retake (discard) | Save (filename = photo_id value)
 *   - Save → if name collides, prompt for custom name; placeholder =
 *     `{search_in value}+{4-char hash}`
 *   - Search bar: fuzzy top-5 matches against `search_in` column;
 *     onSelect sets referenced_row_number.
 *   - 3-dot menu: Settings (→ Screen 3), Add new entry (prompt for unique
 *     name → append row → shoot → save with that name → restore prior
 *     referenced_row_number).
 *   - Bottom: shows first-row value + search_in value of referenced row;
 *     Prev/Next moves referenced_row_number through the *sorted* table.
 */
export default function CaptureScreen() {
  const { project_id, project_name } = useLocalSearchParams<{
    project_id: string
    project_name: string
  }>()

  const [sheet, setSheetState] = useState<DataSheet | null>(null)
  const [settings, setSettingsState] = useState<ProjectSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [refRowIdx, setRefRowIdx] = useState(0) // index into sorted order
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())

  // Camera state
  const cameraRef = useRef<CameraView | null>(null)
  const [perm, requestPerm] = useCameraPermissions()
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [shooting, setShooting] = useState(false)

  // Search state
  const [query, setQuery] = useState('')
  const [matchesOpen, setMatchesOpen] = useState(false)

  // Menu + add-entry modal
  const [menuOpen, setMenuOpen] = useState(false)
  const [addEntryOpen, setAddEntryOpen] = useState(false)

  // Name-collision modal
  const [collisionOpen, setCollisionOpen] = useState(false)
  const [collisionDefault, setCollisionDefault] = useState('')
  const [collisionValue, setCollisionValue] = useState('')
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [pendingIsNewEntry, setPendingIsNewEntry] = useState(false)

  // ─── Load project data ─────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true)
    const [s, st, names] = await Promise.all([
      getDataSheet(project_id),
      getSettings(project_id),
      listImageNames(project_id),
    ])
    setSheetState(s)
    setSettingsState(st)
    setExistingNames(new Set(names))
    if (st) setRefRowIdx(Math.max(0, Math.min(st.referenced_row_number, (s?.rows.length ?? 1) - 1)))
    setLoading(false)
  }, [project_id])

  useEffect(() => {
    reload()
  }, [reload])

  // Request camera permission on mount
  useEffect(() => {
    if (!perm?.granted) requestPerm()
  }, [perm, requestPerm])

  // ─── Derived: sorted rows + fuse searcher ──────────────────────────
  const sortedIdx = useMemo(() => {
    if (!sheet || !settings) return []
    return sortedRowIndices(sheet, settings.sort_by)
  }, [sheet, settings])

  const fuse = useMemo(() => {
    if (!sheet || !settings) return null
    const items = sheet.rows.map((r, i) => ({
      rowIndex: i,
      value: String(r[settings.search_in] ?? ''),
    }))
    return new Fuse(items, {
      keys: ['value'],
      includeScore: false,
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 1,
    })
  }, [sheet, settings])

  const matches = useMemo(() => {
    if (!fuse || !query.trim()) return []
    return fuse.search(query, { limit: 5 }).map(r => ({
      value: r.item.value,
      rowIndex: r.item.rowIndex,
    }))
  }, [fuse, query])

  // ─── Referenced row data ───────────────────────────────────────────
  const refRow = useMemo(() => {
    if (!sheet || !settings || sortedIdx.length === 0) return null
    const safeIdx = Math.max(0, Math.min(refRowIdx, sortedIdx.length - 1))
    const origIdx = sortedIdx[safeIdx]
    return {
      origIdx,
      row: sheet.rows[origIdx],
      firstColValue: String(sheet.rows[origIdx]?.[sheet.columns[0] ?? ''] ?? ''),
      searchInValue: String(sheet.rows[origIdx]?.[settings.search_in] ?? ''),
      photoIdValue: String(sheet.rows[origIdx]?.[settings.photo_id_column] ?? ''),
    }
  }, [sheet, settings, sortedIdx, refRowIdx])

  // ─── Camera handlers ───────────────────────────────────────────────
  const handleShutter = useCallback(async () => {
    if (!cameraRef.current || shooting) return
    setShooting(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      })
      if (!photo?.uri) {
        Alert.alert('Camera error', 'Failed to capture photo.')
        return
      }
      setPreviewUri(photo.uri)
      // Stash the photo for the save flow.
      setPendingPhotoUri(photo.uri)
    } catch (e) {
      Alert.alert('Camera error', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setShooting(false)
    }
  }, [shooting])

  const handleRetake = useCallback(() => {
    setPreviewUri(null)
    setPendingPhotoUri(null)
  }, [])

  /**
   * Save flow:
   *   1. Compute target filename = current row's photo_id value.
   *   2. If that name already has a saved image → open collision modal
   *      with placeholder = `{search_in_value}+{hash4()}`.
   *   3. Once a unique name is resolved, read the photo as base64 JPEG
   *      and write it to AsyncStorage under `image:{pid}:{name}`.
   */
  const beginSave = useCallback(
    async (opts: { isNewEntry?: boolean; fixedName?: string } = {}) => {
      if (!pendingPhotoUri || !settings || !sheet) return
      let targetName = opts.fixedName ?? refRow?.photoIdValue ?? ''
      if (!targetName) {
        Alert.alert('No photo_id value', 'The current row has no value in the photo_id column.')
        return
      }
      if (existingNames.has(targetName) && !opts.fixedName) {
        // Collision → prompt for custom name
        const placeholder = `${refRow?.searchInValue ?? 'photo'}_${hash4()}`
        setCollisionDefault(placeholder)
        setCollisionValue(placeholder)
        setCollisionOpen(true)
        setPendingIsNewEntry(!!opts.isNewEntry)
        return
      }
      await finalizeSave(targetName, !!opts.isNewEntry)
    },
    [pendingPhotoUri, settings, sheet, refRow, existingNames]
  )

  const finalizeSave = useCallback(
    async (name: string, isNewEntry: boolean) => {
      if (!pendingPhotoUri) return
      try {
        // Read photo as base64.
        const b64 = await FileSystem.readAsStringAsync(pendingPhotoUri, {
          encoding: FileSystem.EncodingType.Base64,
        })
        const dataUrl = `data:image/jpeg;base64,${b64}`
        await setImage(project_id, name, dataUrl)
        setExistingNames(prev => new Set(prev).add(name))

        // Persist updated referenced_row_number.
        if (settings) {
          await setSettings(project_id, { ...settings, referenced_row_number: refRowIdx })
        }
        await touchProject(project_id)

        // Clean up preview state.
        setPreviewUri(null)
        setPendingPhotoUri(null)
        setCollisionOpen(false)

        if (isNewEntry) {
          // New-entry flow: the caller (add-entry modal) already saved
          // referenced_row_number in its closure and will restore it.
          setAddEntryOpen(false)
          await reload()
        }
      } catch (e) {
        Alert.alert(
          'Save failed',
          e instanceof Error ? e.message : 'Could not save photo to local storage.'
        )
      }
    },
    [pendingPhotoUri, project_id, settings, refRowIdx, reload]
  )

  // ─── Prev / Next ───────────────────────────────────────────────────
  const goPrev = useCallback(() => {
    setRefRowIdx(i => Math.max(0, i - 1))
  }, [])
  const goNext = useCallback(() => {
    setRefRowIdx(i => Math.min((sortedIdx.length || 1) - 1, i + 1))
  }, [sortedIdx.length])

  const handleMatchSelect = useCallback(
    (origIdx: number) => {
      const sortedPos = sortedIdx.indexOf(origIdx)
      if (sortedPos >= 0) setRefRowIdx(sortedPos)
      setQuery('')
      setMatchesOpen(false)
    },
    [sortedIdx]
  )

  // ─── Add new entry flow ────────────────────────────────────────────
  const handleAddNewEntry = useCallback(
    async (newName: string) => {
      if (!sheet || !settings) return
      if (existingNames.has(newName)) {
        Alert.alert('Name already used', 'Pick a unique photo_id value.')
        return
      }
      // Append a row to the data sheet with this photo_id value.
      const { sheet: nextSheet } = appendRowWithPhotoId(sheet, newName)
      const prevRefRow = refRowIdx
      await setDataSheet(project_id, nextSheet)
      setSheetState(nextSheet)
      // Point the capture screen at the new row (last in the sorted view
      // — its sort key is whatever value the user typed in).
      // For simplicity, sort it like other rows; the new row will appear
      // at its sorted position. We re-find it via the photo_id value.
      const newSortedIdx = sortedRowIndices(nextSheet, settings.sort_by)
      const newOrigIdx = nextSheet.rows.findIndex(
        r => String(r[settings.photo_id_column] ?? '') === newName
      )
      const newSortedPos = newSortedIdx.indexOf(newOrigIdx)
      setRefRowIdx(newSortedPos >= 0 ? newSortedPos : newSortedIdx.length - 1)

      // Open camera for this new entry; remember to restore refRowIdx
      // after the shot is saved.
      setAddEntryOpen(false)
        // Stash the "previous" ref so finalizeSave's isNewEntry branch
        // can restore it after the photo is taken and saved.
        ; (handleAddNewEntry as any)._prevRefRow = prevRefRow
    },
    [sheet, settings, project_id, existingNames, refRowIdx]
  )

  // After saving a new-entry photo, restore the original referenced row.
  useEffect(() => {
    if (!previewUri && !addEntryOpen) {
      const prev = (handleAddNewEntry as any)._prevRefRow
      if (typeof prev === 'number') {
        setRefRowIdx(prev)
          ; (handleAddNewEntry as any)._prevRefRow = undefined
      }
    }
  }, [previewUri, addEntryOpen, handleAddNewEntry])

  // ─── Render ────────────────────────────────────────────────────────
  if (loading || !sheet || !settings) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#1A1A1A" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-charcoal">
      {/* ── TOP — search bar + 3-dot menu ──────────────────────────── */}
      <View className="border-b border-charcoal-light/30 bg-cream px-3 pb-2 pt-12">
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <View className="flex-row items-center gap-2 border border-charcoal/20 bg-white px-3">
              <Search size={16} color="#6B6B6B" />
              <TextInput
                value={query}
                onChangeText={t => {
                  setQuery(t)
                  setMatchesOpen(true)
                }}
                onFocus={() => setMatchesOpen(true)}
                placeholder={`Search in "${settings.search_in}"…`}
                placeholderTextColor="#6B6B6B"
                className="h-12 flex-1 text-charcoal"
              />
              {query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <X size={14} color="#6B6B6B" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setMenuOpen(true)}
            className="h-12 w-12 items-center justify-center border border-charcoal/20 bg-white active:bg-cream-dark"
          >
            <MoreVertical size={20} color="#1A1A1A" />
          </TouchableOpacity>
        </View>

        {/* Fuzzy top-5 matches */}
        {matchesOpen && matches.length > 0 ? (
          <View className="mt-2 border border-charcoal/20 bg-white">
            {matches.map(m => (
              <TouchableOpacity
                key={m.rowIndex}
                onPress={() => handleMatchSelect(m.rowIndex)}
                className="flex-row items-center justify-between border-b border-charcoal/10 px-3 py-2 active:bg-cream-dark"
              >
                <Text className="text-sm text-charcoal">{m.value}</Text>
                <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
                  Row {m.rowIndex + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {/* ── MIDDLE — camera / preview (80vh) ───────────────────────── */}
      <View style={{ height: SCREEN_W * 1.6 }} className="bg-black">
        {previewUri ? (
          <PreviewView
            uri={previewUri}
            onRetake={handleRetake}
            onSave={() => beginSave({ isNewEntry: false })}
            saving={shooting}
          />
        ) : (
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="back"
            className="flex-1"
          >
            <Overlay photoWidthMm={settings.photo_width_mm} photoHeightMm={settings.photo_height_mm} />
            <ShutterButton onPress={handleShutter} disabled={shooting} shooting={shooting} />
          </CameraView>
        )}
      </View>

      {/* ── BOTTOM — referenced row + prev/next ───────────────────── */}
      <View className="flex-1 border-t border-charcoal-light/30 bg-cream px-4 py-3">
        {refRow ? (
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={goPrev}
                disabled={refRowIdx === 0}
                className="flex-row items-center gap-1 px-3 py-2 active:bg-charcoal/5 disabled:opacity-30"
              >
                <ArrowLeft size={16} color="#1A1A1A" />
                <Text className="font-mono text-xs uppercase tracking-widest text-charcoal">
                  Prev
                </Text>
              </TouchableOpacity>
              <View className="flex-1 items-center px-4">
                <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
                  {sheet.columns[0]} (row {refRow.origIdx + 1}/{sheet.rows.length})
                </Text>
                <Text className="mt-0.5 text-base font-semibold text-charcoal" numberOfLines={1}>
                  {refRow.firstColValue || '—'}
                </Text>
                <Text className="mt-0.5 text-xs text-charcoal-light" numberOfLines={1}>
                  {settings.search_in}: {refRow.searchInValue || '—'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={goNext}
                disabled={refRowIdx >= sortedIdx.length - 1}
                className="flex-row items-center gap-1 px-3 py-2 active:bg-charcoal/5 disabled:opacity-30"
              >
                <Text className="font-mono text-xs uppercase tracking-widest text-charcoal">
                  Next
                </Text>
                <ArrowLeft size={16} color="#1A1A1A" style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>
            </View>

            {/* Photo status */}
            <View className="mt-2 items-center">
              {existingNames.has(refRow.photoIdValue) ? (
                <View className="flex-row items-center gap-1 border border-cyan/30 bg-cyan/10 px-3 py-1">
                  <Check size={12} color="#00AEEF" />
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-cyan">
                    Photo saved as "{refRow.photoIdValue}"
                  </Text>
                </View>
              ) : (
                <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
                  Photo ID: {refRow.photoIdValue || '(empty)'} — no photo yet
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
              No rows in sheet — add an entry from the menu.
            </Text>
          </View>
        )}
      </View>

      {/* ── 3-dot menu ─────────────────────────────────────────────── */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
          className="flex-1 bg-charcoal/40"
        >
          <View className="absolute right-3 top-14 w-56 bg-cream border border-charcoal/20">
            <MenuItem
              icon={<SettingsIcon size={16} color="#1A1A1A" />}
              label="Settings"
              onPress={() => {
                setMenuOpen(false)
                router.push({
                  pathname: '/settings',
                  params: { project_id, project_name },
                })
              }}
            />
            <View className="h-px bg-charcoal/10" />
            <MenuItem
              icon={<Plus size={16} color="#1A1A1A" />}
              label="Add new entry"
              onPress={() => {
                setMenuOpen(false)
                setAddEntryOpen(true)
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add new entry modal ────────────────────────────────────── */}
      <AddEntryModal
        isOpen={addEntryOpen}
        existingNames={existingNames}
        existingPhotoIds={new Set(sheet.rows.map(r => String(r[settings.photo_id_column] ?? '')))}
        onClose={() => setAddEntryOpen(false)}
        onCreate={handleAddNewEntry}
      />

      {/* ── Name collision modal ───────────────────────────────────── */}
      <CollisionModal
        isOpen={collisionOpen}
        defaultValue={collisionDefault}
        value={collisionValue}
        onChangeText={setCollisionValue}
        existingNames={existingNames}
        onClose={() => {
          setCollisionOpen(false)
          // Discard the photo if user cancels.
          setPreviewUri(null)
          setPendingPhotoUri(null)
        }}
        onConfirm={() => finalizeSave(collisionValue, pendingIsNewEntry)}
      />
    </View>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

/**
 * Camera overlay — 2px solid orange rectangle, no fill, centred on
 * the camera view. Sized roughly to the photo aspect ratio (W:H in mm).
 *
 * Implementation note: position absolute, centred with flexbox.
 */
function Overlay({ photoWidthMm, photoHeightMm }: { photoWidthMm: number; photoHeightMm: number }) {
  // Make the box 70% of camera width, but cap by height; keep aspect
  // ratio of photoWidthMm:photoHeightMm.
  const aspect = photoHeightMm / photoWidthMm
  const w = SCREEN_W * 0.7
  const h = w * aspect
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: w,
          height: Math.min(h, SCREEN_W * 1.2),
          borderWidth: 2,
          borderColor: '#FF6B35',
          backgroundColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 4,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#FF6B35', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5 }}>
          {photoWidthMm} × {photoHeightMm} mm
        </Text>
      </View>
    </View>
  )
}

/** Circular shutter button — bottom-centre of the camera view. */
function ShutterButton({
  onPress,
  disabled,
  shooting,
}: {
  onPress: () => void
  disabled: boolean
  shooting: boolean
}) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          borderWidth: 3,
          borderColor: '#FFFFFF',
          backgroundColor: disabled ? 'rgba(255,255,255,0.4)' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {shooting ? (
          <ActivityIndicator color="#1A1A1A" />
        ) : (
          <CameraIcon size={28} color="#1A1A1A" />
        )}
      </TouchableOpacity>
    </View>
  )
}

/** Preview screen — replaces the camera view after a shot. */
function PreviewView({
  uri,
  onRetake,
  onSave,
  saving,
}: {
  uri: string
  onRetake: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* We use a plain View + Image pattern. expo-camera's takePictureAsync
            returns a file URI; we render it with the Image component. */}
        <FastImage uri={uri} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.2)',
        }}
      >
        <TouchableOpacity
          onPress={onRetake}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 18,
          }}
        >
          <RotateCcw size={18} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Retake
          </Text>
        </TouchableOpacity>
        <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 18,
            backgroundColor: '#00AEEF',
          }}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Check size={18} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Save
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

/** Minimal image renderer — using react-native's Image (no FastImage dep). */
function FastImage({ uri }: { uri: string }) {
  // Use require/import inline so we don't fight the bundler.
  const { Image } = require('react-native')
  return (
    <Image
      source={{ uri }}
      style={{ width: SCREEN_W, height: SCREEN_W * 1.6 }}
      resizeMode="contain"
    />
  )
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-cream-dark"
    >
      {icon}
      <Text className="font-mono text-xs uppercase tracking-widest text-charcoal">
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function AddEntryModal({
  isOpen,
  existingNames,
  existingPhotoIds,
  onClose,
  onCreate,
}: {
  isOpen: boolean
  existingNames: Set<string>
  existingPhotoIds: Set<string>
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  useEffect(() => {
    if (isOpen) setName('')
  }, [isOpen])

  if (!isOpen) return null

  const taken = existingNames.has(name.trim()) || existingPhotoIds.has(name.trim())
  const canCreate = name.trim().length > 0 && !taken

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-charcoal/60 p-4"
      >
        <View className="w-full max-w-md bg-cream border border-charcoal/10 p-6">
          <Text className="text-xl font-bold text-charcoal">Add new entry</Text>
          <Text className="mt-2 text-xs text-charcoal-light">
            Adds a new row to the data sheet with this value in the photo_id column.
            After you shoot the photo, the referenced row will return to where it was.
          </Text>
          <View className="mt-4">
            <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
              Photo ID value *
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. EMP042"
              placeholderTextColor="#6B6B6B"
              autoFocus
              className="h-12 w-full border border-charcoal/20 bg-white px-4 text-charcoal"
            />
            {taken ? (
              <Text className="mt-2 text-xs text-magenta">
                This name is already used. Pick a unique value.
              </Text>
            ) : null}
          </View>
          <View className="mt-6 flex-row items-center justify-end gap-2 border-t border-charcoal/10 pt-4">
            <TouchableOpacity onPress={onClose} className="px-5 py-2 active:bg-charcoal/5">
              <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!canCreate}
              onPress={() => onCreate(name.trim())}
              className="border-2 border-cyan bg-cyan px-5 py-2 active:bg-cyan/90 disabled:opacity-50"
            >
              <Text className="font-mono text-xs uppercase tracking-widest text-white">
                Add & Shoot
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function CollisionModal({
  isOpen,
  defaultValue,
  value,
  onChangeText,
  existingNames,
  onClose,
  onConfirm,
}: {
  isOpen: boolean
  defaultValue: string
  value: string
  onChangeText: (t: string) => void
  existingNames: Set<string>
  onClose: () => void
  onConfirm: () => void
}) {
  if (!isOpen) return null
  const taken = existingNames.has(value.trim())
  const canConfirm = value.trim().length > 0 && !taken

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center bg-charcoal/60 p-4"
      >
        <View className="w-full max-w-md bg-cream border border-charcoal/10 p-6">
          <Text className="text-xl font-bold text-charcoal">Name already used</Text>
          <Text className="mt-2 text-xs text-charcoal-light">
            A photo with that name is already saved for this project. Enter a different name.
          </Text>
          <View className="mt-4">
            <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
              Custom photo name *
            </Text>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder={defaultValue}
              placeholderTextColor="#6B6B6B"
              autoFocus
              className="h-12 w-full border border-charcoal/20 bg-white px-4 text-charcoal"
            />
            {taken ? (
              <Text className="mt-2 text-xs text-magenta">
                That name is also taken. Try another.
              </Text>
            ) : null}
          </View>
          <View className="mt-6 flex-row items-center justify-end gap-2 border-t border-charcoal/10 pt-4">
            <TouchableOpacity onPress={onClose} className="px-5 py-2 active:bg-charcoal/5">
              <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
                Discard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!canConfirm}
              onPress={onConfirm}
              className="border-2 border-cyan bg-cyan px-5 py-2 active:bg-cyan/90 disabled:opacity-50"
            >
              <Text className="font-mono text-xs uppercase tracking-widest text-white">
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
