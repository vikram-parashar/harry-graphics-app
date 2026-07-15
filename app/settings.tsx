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
import { ArrowLeft, Check } from 'lucide-react-native'
import {
  getDataSheet,
  getSettings,
  setSettings,
  DEFAULT_SETTINGS,
  type DataSheet,
  type ProjectSettings,
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
              sort_by: firstCol,
              search_in: firstCol,
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
      // Make sure photo_id column actually exists (in case user picked a
      // deleted one — defensive).
      if (!sheet.columns.includes(settings.photo_id_column)) {
        settings.photo_id_column = sheet.columns[0]
      }
      if (!sheet.columns.includes(settings.sort_by)) {
        settings.sort_by = sheet.columns[0]
      }
      if (!sheet.columns.includes(settings.search_in)) {
        settings.search_in = sheet.columns[0]
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
          <ColumnPicker
            columns={sheet.columns}
            value={settings.photo_id_column}
            onChange={c => setSettingsState({ ...settings, photo_id_column: c })}
          />
        </Section>

        {/* B. Sort by */}
        <Section title="B. Sort by">
          <Text className="mb-2 text-xs text-charcoal-light">
            Column used to sort rows before navigating Prev/Next on the capture screen.
          </Text>
          <ColumnPicker
            columns={sheet.columns}
            value={settings.sort_by}
            onChange={c => setSettingsState({ ...settings, sort_by: c })}
          />
        </Section>

        {/* C. Search in */}
        <Section title="C. Search in">
          <Text className="mb-2 text-xs text-charcoal-light">
            Column whose value powers the fuzzy-search bar at the top of the capture screen.
          </Text>
          <ColumnPicker
            columns={sheet.columns}
            value={settings.search_in}
            onChange={c => setSettingsState({ ...settings, search_in: c })}
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

function ColumnPicker({
  columns,
  value,
  onChange
}: {
  columns: string[]
  value: string
  onChange: (c: string) => void
}) {
  return (
    <View>
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
    </View>
  )
}
