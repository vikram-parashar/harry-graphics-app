import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ArrowLeft, Check, X, Search, Filter as FilterIcon } from 'lucide-react-native'
import {
  getDataSheet,
  getSettings,
  setSettings,
  listImageNames,
  type DataSheet,
  type ProjectSettings,
  type ColumnFilter,
} from '@/lib/storage'
import { touchProject } from '@/lib/db'

export default function FilterScreen() {
  const { project_id, project_name } = useLocalSearchParams<{
    project_id: string
    project_name: string
  }>()

  const [sheet, setSheet] = useState<DataSheet | null>(null)
  const [settings, setSettingsState] = useState<ProjectSettings | null>(null)
  const [imageNames, setImageNames] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ColumnFilter[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [s, st, names] = await Promise.all([
      getDataSheet(project_id),
      getSettings(project_id),
      listImageNames(project_id),
    ])
    setSheet(s)
    setSettingsState(st)
    setImageNames(new Set(names))
    if (st) {
      setFilters(st.filters ?? [])
    }
    setLoading(false)
  }, [project_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleApply = async () => {
    if (!settings) return
    const next = { ...settings, filters }
    await setSettings(project_id, next)
    await touchProject(project_id)
    router.back()
  }

  const handleClearAll = () => {
    setFilters([])
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 bg-cream">
        {/* Header */}
        <View className="border-b border-charcoal/20 bg-white px-4 py-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <FilterIcon size={18} color="#1A1A1A" />
              <Text className="text-base font-bold text-charcoal">Filters</Text>
            </View>
            <TouchableOpacity onPress={handleClearAll}>
              <Text className="font-mono text-xs uppercase tracking-widest text-magenta">
                Clear All
              </Text>
            </TouchableOpacity>
          </View>
          <Text className="mt-1 font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
            {sheet.rows.length} total rows · {filters.filter(f => f.excludedValues.length > 0 || f.hasImageOnly).length} active filter{filters.filter(f => f.excludedValues.length > 0 || f.hasImageOnly).length === 1 ? '' : 's'}
          </Text>
        </View>

        {/* Column filters */}
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, gap: 12 }}>
          {sheet.columns.map(col => (
            <ColumnFilterSection
              key={col}
              column={col}
              sheet={sheet}
              filter={filters.find(f => f.column === col) ?? { column: col, excludedValues: [] }}
              isPhotoIdCol={col === settings.photo_id_column}
              imageNames={imageNames}
              onChange={(updated) => {
                setFilters(prev => {
                  const existing = prev.findIndex(f => f.column === col)
                  if (existing >= 0) {
                    const next = [...prev]
                    next[existing] = updated
                    return next
                  }
                  return [...prev, updated]
                })
              }}
              onRemove={() => {
                setFilters(prev => prev.filter(f => f.column !== col))
              }}
            />
          ))}
        </ScrollView>

        {/* Apply button */}
        <View className="border-t border-charcoal/20 bg-white px-4 py-3">
          <TouchableOpacity
            onPress={handleApply}
            className="h-12 items-center justify-center border-2 border-cyan bg-cyan active:bg-cyan/90"
          >
            <Text className="font-mono text-sm uppercase tracking-widest text-white">
              Apply Filters
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function ColumnFilterSection({
  column,
  sheet,
  filter,
  isPhotoIdCol,
  imageNames,
  onChange,
  onRemove,
}: {
  column: string
  sheet: DataSheet
  filter: ColumnFilter
  isPhotoIdCol: boolean
  imageNames: Set<string>
  onChange: (f: ColumnFilter) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { uniqueValues, tooManyUnique } = useMemo(() => {
    const seen = new Set<string>()
    const values: string[] = []

    for (const row of sheet.rows) {
      const v = String(row[column] ?? "")

      if (!seen.has(v)) {
        seen.add(v)
        values.push(v)
      }
    }

    values.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )

    if (values.length > 60 && isPhotoIdCol) {
      return {
        uniqueValues: values,
        tooManyUnique: true,
      }
    }
    if (values.length > 60) {
      return {
        uniqueValues: [],
        tooManyUnique: true,
      }
    }
    return {
      uniqueValues: values,
      tooManyUnique: false,
    }
  }, [sheet.rows, column])

  const displayedValues = searchQuery.trim()
    ? uniqueValues.filter(v => v.toLowerCase().includes(searchQuery.toLowerCase()))
    : uniqueValues

  const activeCount = filter.excludedValues.length + (filter.hasImageOnly ? 1 : 0)
  const isActive = activeCount > 0

  const toggleValue = (value: string) => {
    if (filter.excludedValues.includes(value)) {
      onChange({
        ...filter,
        excludedValues: filter.excludedValues.filter(v => v !== value),
      })
    } else {
      onChange({
        ...filter,
        excludedValues: [...filter.excludedValues, value],
      })
    }
  }

  const selectAll = () => {
    onChange({ ...filter, excludedValues: [] })
  }

  const clearAll = () => {
    onChange({ ...filter, excludedValues: [...uniqueValues] })
  }

  const toggleHasImageOnly = () => {
    onChange({
      ...filter,
      hasImageOnly: !filter.hasImageOnly,
    })
  }

  const hasImageCount = isPhotoIdCol
    ? uniqueValues.filter(v => imageNames.has(v)).length
    : 0

  if (isPhotoIdCol || displayedValues.length == 0) return (<></>)
  return (
    <View className={`border ${isActive ? 'border-cyan/50 bg-cyan/5' : 'border-charcoal/20 bg-white'}`}>
      {/* Column header */}
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-row items-center gap-2 flex-1">
          <Text className="text-sm font-semibold text-charcoal">{column}</Text>
          {isPhotoIdCol ? (
            <View className="bg-cyan/20 px-1.5 py-0.5">
              <Text className="font-mono text-[9px] uppercase tracking-widest text-cyan">
                Photo ID
              </Text>
            </View>
          ) : null}
          {isActive ? (
            <View className="bg-magenta/20 px-1.5 py-0.5">
              <Text className="font-mono text-[9px] uppercase tracking-widest text-magenta">
                {activeCount} filter{activeCount > 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          {isActive ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              className="p-1"
            >
              <X size={14} color="#D32F2F" />
            </TouchableOpacity>
          ) : null}
          <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expanded filter content */}
      {expanded && (
        <View className="border-t border-charcoal/10 px-4 py-3">
          {/* Photo ID: Has image toggle */}
          {isPhotoIdCol && (
            <TouchableOpacity
              onPress={toggleHasImageOnly}
              className={`mb-3 flex-row items-center justify-between border p-3 ${filter.hasImageOnly ? 'border-cyan bg-cyan/10' : 'border-charcoal/20 bg-cream'
                }`}
            >
              <View className="flex-1">
                <Text className="text-xs font-semibold text-charcoal">
                  Only rows with images
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
                  {hasImageCount} of {uniqueValues.length} values have images
                </Text>
              </View>
              {filter.hasImageOnly ? (
                <Check size={16} color="#00AEEF" />
              ) : (
                <View className="h-4 w-4 border border-charcoal/30" />
              )}
            </TouchableOpacity>
          )}
          {/* Select All / Clear All */}
          <View className="mb-2 flex-row items-center gap-3">
            <TouchableOpacity onPress={selectAll} className="px-2 py-1 border border-charcoal/20 bg-cream">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal">
                Select All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAll} className="px-2 py-1 border border-charcoal/20 bg-cream">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal">
                Clear All
              </Text>
            </TouchableOpacity>
            <Text className="flex-1 text-right font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
              {uniqueValues.length - filter.excludedValues.length}/{uniqueValues.length} shown
            </Text>
          </View>

          {/* Search within column values */}
          <View className="mb-2 flex-row items-center border border-charcoal/20 bg-cream px-2">
            <Search size={12} color="#6B6B6B" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search values…"
              placeholderTextColor="#6B6B6B"
              className="h-10 flex-1 text-xs text-charcoal px-2"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={10} color="#6B6B6B" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Value checkboxes */}
          <View className="max-h-48 overflow-hidden">
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              {displayedValues.map(value => {
                const isExcluded = filter.excludedValues.includes(value)
                const hasImage = isPhotoIdCol && imageNames.has(value)
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => toggleValue(value)}
                    className={`flex-row items-center gap-2 border-b border-charcoal/5 px-2 py-2 ${isExcluded ? 'bg-cream-dark/50' : ''
                      }`}
                  >
                    <View
                      className={`h-4 w-4 items-center justify-center border ${isExcluded
                        ? 'border-charcoal/30 bg-white'
                        : 'border-cyan bg-cyan'
                        }`}
                    >
                      {!isExcluded ? <Check size={10} color="#FFFFFF" /> : null}
                    </View>
                    <Text
                      className={`flex-1 text-xs ${isExcluded ? 'text-charcoal-light line-through' : 'text-charcoal'
                        }`}
                      numberOfLines={1}
                    >
                      {value || '(empty)'}
                    </Text>
                    {isPhotoIdCol && hasImage && !isExcluded ? (
                      <View className="bg-green-200 px-1 py-0.5">
                        <Text className="font-mono text-[8px] uppercase tracking-widest text-green-800">
                          IMG
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </View>
      )
      }
    </View >
  )
}
