import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Check, X, ArrowUp, ArrowDown } from 'lucide-react-native'
import {
  getDataSheet,
  getSettings,
  setSettings,
  DEFAULT_SETTINGS,
  type DataSheet,
  type ProjectSettings,
  type SortColumn,
} from '@/lib/storage'
import { touchProject } from '@/lib/db'

export default function SettingsScreen() {
  const { project_id, project_name } = useLocalSearchParams<{
    project_id: string
    project_name: string
  }>()

  const [sheet, setSheetState] = useState<DataSheet | null>(null)
  const [settings, setSettingsState] = useState<ProjectSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
      ; (async () => {
        const [s, st] = await Promise.all([
          getDataSheet(project_id),
          getSettings(project_id),
        ])
        if (!mounted) return
        setSheetState(s)
        if (s) {
          const firstCol = s.columns[0] ?? ''
          setSettingsState(
            st ?? {
              photo_id_column: firstCol,
              sort_by: [{ column: firstCol, direction: 'asc' }],
              search_in: [firstCol],
              filters: [],
              ...DEFAULT_SETTINGS,
            }
          )
        } else {
          setSettingsState(st)
        }
        setLoading(false)
      })()
    return () => {
      mounted = false
    }
  }, [project_id])


  const handleOk = async () => {
    if (!settings || !sheet) return
    setSaving(true)
    try {
      // Validate photo_id_column
      if (!sheet.columns.includes(settings.photo_id_column)) {
        settings.photo_id_column = sheet.columns[0]
      }
      // Validate sort_by columns
      settings.sort_by = settings.sort_by.filter(
        sc => sheet.columns.includes(sc.column)
      )
      if (settings.sort_by.length === 0) {
        settings.sort_by = [{ column: sheet.columns[0], direction: 'asc' }]
      }
      // Validate search_in columns
      settings.search_in = settings.search_in.filter(
        c => sheet.columns.includes(c)
      )
      if (settings.search_in.length === 0) {
        settings.search_in = [sheet.columns[0]]
      }
      await setSettings(project_id, settings)
      await touchProject(project_id)
      router.replace({
        pathname: '/capture',
        params: { project_id, project_name },
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !sheet || !settings) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#1A1A1A" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Back to projects */}
        <TouchableOpacity
          onPress={() => router.replace('/projects')}
          className="flex-row items-center gap-2 py-2"
        >
          <ArrowLeft size={16} color="#6B6B6B" />
          <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
            Back to Projects
          </Text>
        </TouchableOpacity>

        <View className="border-b-2 border-charcoal pb-4">
          <Text className="text-2xl font-bold text-charcoal">{project_name}</Text>
          <Text className="mt-1 font-mono text-xs uppercase tracking-widest text-charcoal-light">
            {sheet.rows.length} rows · {sheet.columns.length} columns
          </Text>
        </View>

        {/* A. Photo ID column */}
        <Section title="A. Photo ID column">
          <Text className="mb-2 text-xs text-charcoal-light">
            Column whose value is used as the filename when saving captured photos.
          </Text>
          <SingleColumnPicker
            columns={sheet.columns}
            value={settings.photo_id_column}
            onChange={c => setSettingsState({ ...settings, photo_id_column: c })}
          />
        </Section>

        {/* B. Sort by — multi-column with pills */}
        <Section title="B. Sort by (multi-column)">
          <Text className="mb-2 text-xs text-charcoal-light">
            Tap a column to add it to the sort order. Pills show current sort columns — tap direction to toggle asc/desc, tap ✕ to remove.
          </Text>

          {/* Pill list of active sort columns */}
          {settings.sort_by.length > 0 && (
            <View className="mb-3 flex-row flex-wrap gap-2">
              {settings.sort_by.map((sc, idx) => (
                <View
                  key={`${sc.column}-${idx}`}
                  className="flex-row items-center border border-charcoal/30 bg-white px-2 py-1"
                >
                  <Text className="text-xs text-charcoal">{sc.column}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const next = [...settings.sort_by]
                      next[idx] = {
                        ...next[idx],
                        direction: next[idx].direction === 'asc' ? 'desc' : 'asc',
                      }
                      setSettingsState({ ...settings, sort_by: next })
                    }}
                    className="mx-1 px-1"
                  >
                    {sc.direction === 'asc' ? (
                      <ArrowUp size={12} color="#00AEEF" />
                    ) : (
                      <ArrowDown size={12} color="#FF6B35" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const next = settings.sort_by.filter((_, i) => i !== idx)
                      setSettingsState({ ...settings, sort_by: next })
                    }}
                    className="ml-0.5"
                  >
                    <X size={12} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Column list to add to sort */}
          <View className="border border-charcoal/20 bg-white">
            {sheet.columns.map(c => {
              const isAdded = settings.sort_by.some(sc => sc.column === c)
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => {
                    if (isAdded) {
                      // Remove from sort
                      setSettingsState({
                        ...settings,
                        sort_by: settings.sort_by.filter(sc => sc.column !== c),
                      })
                    } else {
                      // Add to sort
                      setSettingsState({
                        ...settings,
                        sort_by: [...settings.sort_by, { column: c, direction: 'asc' as const }],
                      })
                    }
                  }}
                  className={`flex-row items-center justify-between border-b border-charcoal/10 px-3 py-3 ${isAdded ? 'bg-cyan/10' : ''
                    }`}
                >
                  <Text className="text-sm text-charcoal">{c}</Text>
                  {isAdded ? (
                    <View className="flex-row items-center gap-1">
                      <Text className="font-mono text-[10px] text-cyan">
                        {settings.sort_by.find(sc => sc.column === c)?.direction === 'asc' ? 'ASC' : 'DESC'}
                      </Text>
                      <Check size={14} color="#00AEEF" />
                    </View>
                  ) : (
                    <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
                      Tap to add
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </Section>

        {/* C. Search in — multi-select */}
        <Section title="C. Search in (multi-select)">
          <Text className="mb-2 text-xs text-charcoal-light">
            Select columns to search across. Multiple columns allow broader fuzzy matching.
          </Text>
          <MultiColumnPicker
            columns={sheet.columns}
            values={settings.search_in}
            onChange={cols => setSettingsState({ ...settings, search_in: cols })}
          />
        </Section>

        {/* D. Photo size */}
        <Section title="D. Photo size (mm)">
          <Text className="mb-2 text-xs text-charcoal-light">
            Print dimensions per photo. Used purely as a label — the camera captures at full sensor
            resolution.
          </Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
                Width (mm)
              </Text>
              <TextInput
                value={String(settings.photo_width_mm)}
                onChangeText={t => {
                  const n = parseInt(t, 10)
                  if (!isNaN(n) && n > 0) setSettingsState({ ...settings, photo_width_mm: n })
                }}
                keyboardType="number-pad"
                className="h-12 w-full border border-charcoal/20 bg-white px-4 text-charcoal"
              />
            </View>
            <Text className="mt-6 text-2xl text-charcoal-light">×</Text>
            <View className="flex-1">
              <Text className="py-2 text-xs font-semibold uppercase tracking-widest text-charcoal">
                Height (mm)
              </Text>
              <TextInput
                value={String(settings.photo_height_mm)}
                onChangeText={t => {
                  const n = parseInt(t, 10)
                  if (!isNaN(n) && n > 0) setSettingsState({ ...settings, photo_height_mm: n })
                }}
                keyboardType="number-pad"
                className="h-12 w-full border border-charcoal/20 bg-white px-4 text-charcoal"
              />
            </View>
          </View>
        </Section>

        {/* E. OK */}
        <View className="flex-row items-center justify-end gap-2 border-t-2 border-charcoal pt-4">
          <TouchableOpacity
            onPress={handleOk}
            disabled={saving}
            className="flex-row items-center gap-2 border-2 border-cyan bg-cyan px-6 py-3 active:bg-cyan/90 disabled:opacity-50"
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Check size={16} color="#FFFFFF" />}
            <Text className="font-mono text-sm uppercase tracking-widest text-white w-7">OK</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="border border-charcoal/20 p-4">
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-charcoal">
        {title}
      </Text>
      {children}
    </View>
  )
}

function SingleColumnPicker({
  columns,
  value,
  onChange
}: {
  columns: string[]
  value: string
  onChange: (c: string) => void
}) {
  return (
    <View className="border border-charcoal/20 bg-white">
      {columns.map(c => (
        <TouchableOpacity
          key={c}
          onPress={() => onChange(c)}
          className={`flex-row items-center justify-between border-b border-charcoal/10 px-3 py-3 ${value === c ? 'bg-cyan/10' : ''
            }`}
        >
          <Text className="text-sm text-charcoal">{c}</Text>
          {value === c ? <Check size={14} color="#00AEEF" /> : null}
        </TouchableOpacity>
      ))}
    </View>
  )
}

function MultiColumnPicker({
  columns,
  values,
  onChange
}: {
  columns: string[]
  values: string[]
  onChange: (cols: string[]) => void
}) {
  const toggle = (col: string) => {
    if (values.includes(col)) {
      // Don't allow deselecting if it's the last one
      if (values.length <= 1) return
      onChange(values.filter(c => c !== col))
    } else {
      onChange([...values, col])
    }
  }

  return (
    <View className="border border-charcoal/20 bg-white">
      {columns.map(c => {
        const isSelected = values.includes(c)
        return (
          <TouchableOpacity
            key={c}
            onPress={() => toggle(c)}
            className={`flex-row items-center justify-between border-b border-charcoal/10 px-3 py-3 ${isSelected ? 'bg-cyan/10' : ''
              }`}
          >
            <Text className="text-sm text-charcoal">{c}</Text>
            {isSelected ? <Check size={14} color="#00AEEF" /> : null}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
