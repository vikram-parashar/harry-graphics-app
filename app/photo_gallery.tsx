import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { X, Search } from 'lucide-react-native'
import {
  listImageNames,
  getImageUri,
  type ProjectSettings,
  type DataSheet,
} from '@/lib/storage'

const SCREEN_W = Dimensions.get('window').width
const COL_COUNT = 2
const CARD_GAP = 8
const CARD_W = (SCREEN_W - 16 - CARD_GAP) / COL_COUNT

/**
 * Photo Gallery screen — 2-column grid of images with search.
 */
export default function PhotoGalleryScreen() {
  const { project_id, project_name, jump_to } = useLocalSearchParams<{
    project_id: string
    project_name: string
    jump_to?: string
  }>()

  const [images, setImages] = useState<{ name: string; uri: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const scrollViewRef = useRef<ScrollView>(null)
  const jumpToRef = useRef<string | null>(jump_to ?? null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const names = await listImageNames(project_id)
    const loaded: { name: string; uri: string }[] = []
    for (const n of names) {
      const uri = await getImageUri(project_id, n)
      if (uri) loaded.push({ name: n, uri })
    }
    loaded.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setImages(loaded)
    setLoading(false)
  }, [project_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter images by search query
  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return images
    const q = searchQuery.toLowerCase()
    return images.filter(img => img.name.toLowerCase().includes(q))
  }, [images, searchQuery])

  // Auto-scroll to jump_to image after load
  useEffect(() => {
    if (loading || !jumpToRef.current) return
    const targetIdx = filteredImages.findIndex(img => img.name === jumpToRef.current)
    if (targetIdx >= 0) {
      const rowIdx = Math.floor(targetIdx / COL_COUNT)
      const targetY = rowIdx * (CARD_W * 1.2 + CARD_GAP + 28)
      setTimeout(() => {
        scrollViewRef.current?.scrollTo?.({ y: targetY, animated: true })
      }, 300)
    }
    jumpToRef.current = null
  }, [loading, filteredImages])

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#1A1A1A" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-cream">
      {/* Search bar */}
      <View className="border-b border-charcoal/20 bg-white px-4 py-3">
        <View className="flex-row items-center gap-2 border border-charcoal/20 bg-cream px-3">
          <Search size={16} color="#6B6B6B" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search image name…"
            placeholderTextColor="#6B6B6B"
            className="h-10 flex-1 text-charcoal"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={14} color="#6B6B6B" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Image count */}
      <View className="px-4 py-2">
        <Text className="font-mono text-[10px] uppercase tracking-widest text-charcoal-light">
          {filteredImages.length} image{filteredImages.length === 1 ? '' : 's'}
          {searchQuery ? ` matching "${searchQuery}"` : ''}
        </Text>
      </View>

      {/* Image grid — 2 columns */}
      {filteredImages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
            {searchQuery ? 'No images match your search' : 'No photos captured yet'}
          </Text>
        </View>
      ) : (
        <ScrollView ref={scrollViewRef} className="flex-1" contentContainerStyle={{ padding: 8 }}>
          <View className="flex-row flex-wrap" style={{ gap: CARD_GAP }}>
            {filteredImages.map((img) => (
              <View
                key={img.name}
                style={{ width: CARD_W }}
                className="border border-charcoal/10 bg-white"
              >
                <FileImage uri={img.uri} width={CARD_W} height={CARD_W * 1.2} />
                <View className="px-2 py-1.5">
                  <Text className="text-xs text-charcoal" numberOfLines={1}>
                    {img.name}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

/**
 * FileImage — renders a local file URI as an Image.
 * Supports file:// URIs from filesystem storage.
 */
function FileImage({
  uri,
  width,
  height,
}: {
  uri: string
  width: number
  height: number
}) {
  const { Image } = require('react-native')
  return (
    <Image
      source={{ uri }}
      style={{ width, height }}
      resizeMode="cover"
    />
  )
}
