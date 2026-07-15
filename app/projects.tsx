import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { Plus, Trash2, UploadCloud, FileSpreadsheet, FileX, LogOut } from 'lucide-react-native'
import {
  listProjects,
  createProject,
  deleteProject,
  type Project,
} from '@/lib/db'
import { setDataSheet, wipeProjectStorage, getProjectImageBytes } from '@/lib/storage'
import { signOut, getCurrentProfile, type Profile } from '@/lib/auth'
import CreateProjectModal from '@/components/CreateProjectModal'
import DeleteProjectModal from '@/components/DeleteProjectModal'
import UploadToHarryGraphicsModal from '@/components/UploadToHarryGraphicsModal'

/**
 * Screen 2 — Projects list.
 *
 * Lists all locally-stored projects (SQLite). Each row exposes:
 *   - tap → Settings screen (Screen 3)
 *   - "Upload to Harry Graphics" button → upload modal
 *   - delete button → confirm modal
 *
 * "New Project" button opens CreateProjectModal, which collects name +
 * either an uploaded Excel sheet or a blank sheet, then writes both
 * a SQLite row and an AsyncStorage data_sheet entry.
 */
export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [deletingLoading, setDeletingLoading] = useState(false)
  const [uploadingProject, setUploadingProject] = useState<Project | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [ps, p] = await Promise.all([listProjects(), getCurrentProfile()])
      setProjects(ps)
      setProfile(p)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async (name: string, sheet: import('@/lib/storage').DataSheet) => {
    const proj = await createProject(name)
    await setDataSheet(proj.project_id, sheet)
    await refresh()
  }

  const handleDeleteConfirm = async () => {
    if (!deleting) return
    setDeletingLoading(true)
    try {
      await wipeProjectStorage(deleting.project_id)
      await deleteProject(deleting.project_id)
      setDeleting(null)
      await refresh()
    } finally {
      setDeletingLoading(false)
    }
  }

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will be returned to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/')
        },
      },
    ])
  }

  const renderItem = ({ item }: { item: Project }) => (
    <ProjectRow
      project={item}
      onOpen={() =>
        router.push({
          pathname: '/settings',
          params: { project_id: item.project_id, project_name: item.name },
        })
      }
      onUpload={() => setUploadingProject(item)}
      onDelete={() => setDeleting(item)}
    />
  )

  return (
    <View className="flex-1 bg-cream">
      {/* Header — matches dashboard-shell pattern */}
      <View className="flex-row items-center justify-between border-b-2 border-charcoal bg-charcoal px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Text className="text-lg font-bold text-cream">Harry Graphics</Text>
          <Text className="font-mono text-xs uppercase tracking-widest text-charcoal-light">
            Studio
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleSignOut}
          className="flex-row items-center gap-2 border border-charcoal-light px-3 py-1.5 active:bg-charcoal-soft"
        >
          <LogOut size={14} color="#F5F1E8" />
          <Text className="font-mono text-xs uppercase tracking-widest text-cream">
            Sign Out
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sub-header — title + count + create button */}
      <View className="border-b-2 border-charcoal px-4 pb-4 pt-6">
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-3xl font-bold text-charcoal">Projects</Text>
            <Text className="mt-1 font-mono text-xs uppercase tracking-widest text-charcoal-light">
              {profile?.full_name ?? profile?.email ?? 'Operator'} · {projects.length} total
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setCreateOpen(true)}
            className="flex-row items-center gap-2 border-2 border-highlight bg-highlight px-4 py-2 active:bg-highlight/90"
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={3} />
            <Text className="font-mono text-xs uppercase tracking-widest text-white">
              New Project
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={projects}
        keyExtractor={p => p.project_id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1A1A1A" />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View className="border-2 border-dashed border-charcoal/20 py-20 items-center">
            <FileX size={40} color="#1A1A1A" />
            <Text className="mt-3 font-mono text-xs uppercase tracking-widest text-charcoal-light">
              No projects yet
            </Text>
            <Text className="mt-1 text-xs text-charcoal-light">
              Tap "New Project" to get started.
            </Text>
          </View>
        }
      />

      {/* Modals */}
      <CreateProjectModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <DeleteProjectModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDeleteConfirm}
        projectName={deleting?.name ?? ''}
        loading={deletingLoading}
      />
      <UploadToHarryGraphicsModal
        isOpen={!!uploadingProject}
        onClose={() => setUploadingProject(null)}
        projectId={uploadingProject?.project_id ?? ''}
        projectName={uploadingProject?.name ?? ''}
      />
    </View>
  )
}

function ProjectRow({
  project,
  onOpen,
  onUpload,
  onDelete,
}: {
  project: Project
  onOpen: () => void
  onUpload: () => void
  onDelete: () => void
}) {
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [imageBytes, setImageBytes] = useState<number>(0)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const bytes = await getProjectImageBytes(project.project_id)
      if (!mounted) return
      setImageBytes(bytes)
      // We don't have an easy "count" API; approximate from bytes / 150KB
      // (avg JPEG 0.7 size). The upload modal computes the real count.
      setImageCount(bytes > 0 ? Math.max(1, Math.round(bytes / 150_000)) : 0)
    })()
    return () => {
      mounted = false
    }
  }, [project.project_id])

  return (
    <View className="border border-charcoal/10 bg-white">
      {/* Top row — tap to open settings */}
      <TouchableOpacity onPress={onOpen} className="flex-row items-center gap-3 p-4 active:bg-cream-dark">
        <View className="h-12 w-12 items-center justify-center border border-charcoal/10 bg-cream-dark">
          <FileSpreadsheet size={20} color="#1A1A1A" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-charcoal">{project.name}</Text>
          <Text className="mt-1 font-mono text-xs uppercase tracking-widest text-charcoal-light">
            Created {new Date(project.created_on).toLocaleDateString()} · Updated {new Date(project.updated_on).toLocaleDateString()}
          </Text>
          {imageCount !== null && imageCount > 0 ? (
            <Text className="mt-1 text-xs text-charcoal-light">
              ~{imageCount} image{imageCount === 1 ? '' : 's'} · {(imageBytes / 1_000_000).toFixed(2)} MB
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* Action row */}
      <View className="flex-row border-t border-charcoal/10">
        <TouchableOpacity
          onPress={onUpload}
          className="flex-1 flex-row items-center justify-center gap-2 py-3 active:bg-cyan/10"
        >
          <UploadCloud size={14} color="#00AEEF" />
          <Text className="font-mono text-xs uppercase tracking-widest text-cyan">
            Upload to Harry Graphics
          </Text>
        </TouchableOpacity>
        <View className="w-px bg-charcoal/10" />
        <TouchableOpacity
          onPress={onDelete}
          className="flex-row items-center justify-center gap-2 px-4 py-3 active:bg-magenta/10"
        >
          <Trash2 size={14} color="#D32F2F" />
          <Text className="font-mono text-xs uppercase tracking-widest text-magenta">
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
