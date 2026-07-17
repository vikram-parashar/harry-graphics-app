import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  getDataSheet,
  getSettings,
  listImageNames,
  type DataSheet,
  type ProjectSettings,
} from '@/lib/storage'
import { sortedRowIndices } from '@/lib/search'

const CELL_WIDTH = 120
const CELL_HEIGHT = 40
const HEADER_HEIGHT = 44
const ROW_NUM_WIDTH = 50

export default function ViewSheetScreen() {
  const { project_id, project_name } = useLocalSearchParams<{
    project_id: string
    project_name: string
  }>()

  const [sheet, setSheet] = useState<DataSheet | null>(null)
  const [settings, setSettings] = useState<ProjectSettings | null>(null)
  const [imageNames, setImageNames] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [gotoRow, setGotoRow] = useState('')

  const flatListRef = useRef<ScrollView>(null)

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const [s, st, names] = await Promise.all([
        getDataSheet(project_id),
        getSettings(project_id),
        listImageNames(project_id),
      ])
      setSheet(s)
      setSettings(st)
      setImageNames(new Set(names))
    } catch (e) {
      console.error(e)
      Alert.alert("Error", String(e))
    } finally {
      setLoading(false)
    }
  }, [project_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Sorted indices
  const sortedIdx = useMemo(() => {
    if (!sheet || !settings) return []
    return sortedRowIndices(sheet, settings.sort_by)
  }, [sheet, settings])

  // Handle goto row
  const handleGotoRow = useCallback(() => {
    const rowNum = parseInt(gotoRow, 10)
    if (isNaN(rowNum) || rowNum < 1 || rowNum > sortedIdx.length) {
      Alert.alert('Invalid row', `Enter a row number between 1 and ${sortedIdx.length}`)
      return
    }
    // Scroll to that row (0-indexed sorted position)
    const targetY = HEADER_HEIGHT + (rowNum - 1) * CELL_HEIGHT
    flatListRef.current?.scrollTo?.({ y: targetY, animated: true })
  }, [gotoRow, sortedIdx.length])

  if (loading || !sheet || !settings) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#1A1A1A" />
      </View>
    )
  }

  const photoIdCol = settings.photo_id_column

  return (
    <View className="flex-1 bg-cream">
      {/* Goto row bar */}
      <View className="border-b border-charcoal/20 bg-white px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
            Go to row:
          </Text>
          <TextInput
            value={gotoRow}
            onChangeText={setGotoRow}
            onSubmitEditing={handleGotoRow}
            keyboardType="number-pad"
            placeholder={`1–${sortedIdx.length}`}
            placeholderTextColor="#6B6B6B"
            className="h-9 w-20 border border-charcoal/20 bg-cream px-2 text-charcoal"
          />
          <TouchableOpacity
            onPress={handleGotoRow}
            className="border border-charcoal/20 bg-charcoal px-3 py-1.5 active:bg-charcoal-soft"
          >
            <Text className="font-mono text-xs uppercase tracking-widest text-cream">Go</Text>
          </TouchableOpacity>
          <View className="flex-1" />
          <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
            {sortedIdx.length} rows · {sheet.columns.length} cols
          </Text>
        </View>
      </View>

      {/* Spreadsheet */}
      <ScrollView ref={flatListRef} className="flex-1">
        <View className="flex-col">
          {/* Header row */}
          <View className="flex-row border-b-2 border-charcoal bg-charcoal-soft">
            {/* Row number column */}
            <View
              style={{ width: ROW_NUM_WIDTH, height: HEADER_HEIGHT }}
              className="items-center justify-center border-r border-charcoal/30"
            >
              <Text className="font-mono text-[10px] font-bold uppercase tracking-widest text-cream">
                #
              </Text>
            </View>
            <View className="flex-row">
              {sheet.columns.map(col => (
                <View
                  key={col}
                  style={{ width: CELL_WIDTH, height: HEADER_HEIGHT }}
                  className={`items-center justify-center border-r border-charcoal/30 px-1 ${col === photoIdCol ? 'bg-cyan/30' : ''
                    }`}
                >
                  <Text
                    className="font-mono text-[10px] font-bold uppercase tracking-widest text-cream"
                    numberOfLines={2}
                  >
                    {col}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Data rows */}
          {sortedIdx.map((origIdx, sortedPos) => {
            const row = sheet.rows[origIdx]
            if (!row) return null
            const photoIdValue = String(row[photoIdCol] ?? '')
            const hasImage = photoIdValue && imageNames.has(photoIdValue)

            return (
              <View
                key={origIdx}
                className={`flex-row border-b border-charcoal/10 ${sortedPos % 2 === 0 ? 'bg-white' : 'bg-cream-dark/30'
                  }`}
              >
                {/* Row number */}
                <View
                  style={{ width: ROW_NUM_WIDTH, height: CELL_HEIGHT }}
                  className="items-center justify-center border-r border-charcoal/10"
                >
                  <Text className="font-mono text-[10px] text-charcoal-light">
                    {sortedPos + 1}
                  </Text>
                </View>
                <View className="flex-row">
                  {sheet.columns.map(col => {
                    const cellValue = String(row[col] ?? '')
                    const isPhotoIdCol = col === photoIdCol
                    const cellHasImage = isPhotoIdCol && hasImage

                    return (
                      <TouchableOpacity
                        key={col}
                        style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}
                        className={`justify-center border-r border-charcoal/5 px-2 ${cellHasImage ? 'bg-green-200' : isPhotoIdCol ? 'bg-green-50' : ''
                          }`}
                        onPress={() => {
                          if (cellHasImage) {
                            router.push({
                              pathname: '/photo_gallery',
                              params: {
                                project_id,
                                project_name,
                                jump_to: photoIdValue,
                              },
                            })
                          }
                        }}
                        disabled={!cellHasImage}
                        activeOpacity={cellHasImage ? 0.7 : 1}
                      >
                        <Text
                          className={`text-xs ${cellHasImage ? 'text-green-800 font-semibold' : 'text-charcoal'
                            }`}
                          numberOfLines={1}
                        >
                          {cellValue}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}
