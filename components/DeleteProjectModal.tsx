import { Modal, View, Text, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'

interface DeleteProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  projectName: string
  loading: boolean
}

/** Mirrors dashboard/products/delete-confirm-modal.tsx visually. */
export default function DeleteProjectModal({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  loading,
}: DeleteProjectModalProps) {
  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-charcoal/60" onPress={onClose}>
        <Pressable
          onPress={e => e.stopPropagation()}
          className="m-auto w-full max-w-md bg-white border border-charcoal/10 p-6"
        >
          <View className="flex-row items-start gap-4">
            <View className="h-10 w-10 items-center justify-center border border-magenta/20 bg-magenta/10">
              <AlertTriangle size={20} color="#D32F2F" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-charcoal">Delete Project</Text>
              <Text className="mt-2 text-sm text-charcoal-light">
                Are you sure you want to delete{' '}
                <Text className="font-semibold text-charcoal">{projectName}</Text>? This will also
                remove all associated images and the data sheet. This action cannot be undone.
              </Text>
            </View>
          </View>

          <View className="mt-6 flex-row items-center justify-end gap-2 border-t border-charcoal/10 pt-4">
            <TouchableOpacity
              onPress={onClose}
              disabled={loading}
              className="h-10 items-center justify-center px-5 active:bg-charcoal/5 disabled:opacity-50"
            >
              <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={loading}
              className="h-10 flex-row items-center justify-center gap-2 border-2 border-magenta bg-magenta px-5 active:bg-magenta/90 disabled:opacity-50"
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text className="font-mono text-xs uppercase tracking-widest text-white">Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
