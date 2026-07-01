import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { FloorPlanService } from "@/services/floorPlanService";
import {
    getFloorPlanClient,
    useFloorPlanStore,
} from "@/stores/useFloorPlanStore";
import { Href, useRouter } from "expo-router";
import { Edit2, LayoutGrid, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const LayoutNameModal = ({
  isOpen,
  onClose,
  onSave,
  initialName = "",
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  initialName?: string;
  title: string;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      >
        <View
          style={{
            width: s(420),
            backgroundColor: colors.card,
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: s(18),
              paddingVertical: s(14),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.heading,
                fontSize: s(14),
                fontWeight: "700",
              }}
            >
              {title}
            </Text>
          </View>
          <View style={{ padding: s(18), gap: s(12) }}>
            <View>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: s(10),
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: s(6),
                }}
              >
                Room Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Main Dining, Patio"
                placeholderTextColor={colors.muted}
                autoFocus
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(8),
                  paddingHorizontal: s(12),
                  paddingVertical: s(10),
                  fontSize: s(14),
                  color: colors.heading,
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: s(8) }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: s(10),
                  borderRadius: s(8),
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.screen,
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontWeight: "600",
                    fontSize: s(13),
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  flex: 1,
                  paddingVertical: s(10),
                  borderRadius: s(8),
                  alignItems: "center",
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "60",
                }}
              >
                <Text
                  style={{
                    color: colors.teal,
                    fontWeight: "700",
                    fontSize: s(13),
                  }}
                >
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const FloorPlanManagementScreen = () => {
  const router = useRouter();
  const {
    floorPlans,
    createFloorPlan,
    updateFloorPlan,
    deleteFloorPlan,
    setActiveFloorPlan,
    activeFloorPlanId,
  } = useFloorPlanStore();
  const activeTables = useFloorPlanStore((s) => s.tables);

  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  useEffect(() => {
    const { locationId, setFloorPlans } = useFloorPlanStore.getState();
    const supabase = getFloorPlanClient();
    if (!locationId || !supabase) return;
    FloorPlanService.getLocationFloorPlans(supabase, locationId).then(
      ({ data }) => {
        if (data) setFloorPlans(data);
      },
    );
  }, []);

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<
    (typeof floorPlans)[0] | null
  >(null);

  const handleAddNewLayout = async (name: string) => {
    try {
      await createFloorPlan(name);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditLayout = async (name: string) => {
    if (selectedLayout) {
      try {
        await updateFloorPlan(selectedLayout.id, { name });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteLayout = async () => {
    if (selectedLayout) {
      setIsDeleting(true);
      try {
        await deleteFloorPlan(selectedLayout.id);
        setDeleteModalOpen(false);
        setSelectedLayout(null);
      } catch (e) {
        console.error("[FloorPlanScreen] deleteFloorPlan failed:", e);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: s(16),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <View>
          <Text
            style={{
              color: colors.heading,
              fontSize: s(15),
              fontWeight: "700",
            }}
          >
            Floor Plans
          </Text>
          <Text
            style={{ color: colors.muted, fontSize: s(11), marginTop: s(1) }}
          >
            {floorPlans.length} room{floorPlans.length !== 1 ? "s" : ""}{" "}
            configured
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setAddModalOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(6),
            paddingHorizontal: s(14),
            paddingVertical: s(8),
            borderRadius: s(8),
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "60",
          }}
        >
          <Plus size={s(14)} color={colors.teal} />
          <Text
            style={{ color: colors.teal, fontWeight: "700", fontSize: s(13) }}
          >
            New Room
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={floorPlans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: s(14), gap: s(8) }}
        renderItem={({ item }) => {
          const isActive = item.id === activeFloorPlanId;
          const tableCount = isActive
            ? activeTables.filter(
                (t) => t.category === "table" || t.category === "booth",
              ).length
            : item.table_count || 0;
          return (
            <TouchableOpacity
              onPress={() => {
                void setActiveFloorPlan(item.id);
                router.push(`/tables/edit-layout?layoutId=${item.id}` as Href);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: s(14),
                backgroundColor: colors.card,
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: isActive ? colors.teal + "50" : colors.border,
              }}
            >
              {/* Icon */}
              <View
                style={{
                  width: s(42),
                  height: s(42),
                  borderRadius: s(10),
                  backgroundColor: isActive
                    ? colors.teal + "18"
                    : colors.screen,
                  borderWidth: 1,
                  borderColor: isActive ? colors.teal + "40" : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: s(12),
                }}
              >
                <LayoutGrid
                  size={s(18)}
                  color={isActive ? colors.teal : colors.muted}
                />
              </View>

              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(8),
                  }}
                >
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: s(14),
                      fontWeight: "700",
                    }}
                  >
                    {item.name}
                  </Text>
                  {isActive && (
                    <View
                      style={{
                        paddingHorizontal: s(6),
                        paddingVertical: s(2),
                        borderRadius: s(4),
                        backgroundColor: colors.teal + "18",
                        borderWidth: 1,
                        borderColor: colors.teal + "40",
                      }}
                    >
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: s(9),
                          fontWeight: "700",
                        }}
                      >
                        ACTIVE
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(11),
                    marginTop: s(2),
                  }}
                >
                  {tableCount} table{tableCount !== 1 ? "s" : ""}
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: s(6) }}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedLayout(item);
                    setEditModalOpen(true);
                  }}
                  style={{
                    padding: s(8),
                    borderRadius: s(8),
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Edit2 size={s(15)} color={colors.label} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedLayout(item);
                    setDeleteModalOpen(true);
                  }}
                  style={{
                    padding: s(8),
                    borderRadius: s(8),
                    backgroundColor: colors.danger + "12",
                    borderWidth: 1,
                    borderColor: colors.danger + "40",
                  }}
                >
                  <Trash2 size={s(15)} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: s(48),
            }}
          >
            <LayoutGrid size={s(32)} color={colors.muted} />
            <Text
              style={{
                color: colors.label,
                fontSize: s(14),
                fontWeight: "600",
                marginTop: s(12),
              }}
            >
              No rooms yet
            </Text>
            <Text
              style={{ color: colors.muted, fontSize: s(12), marginTop: s(4) }}
            >
              Tap "New Room" to create your first floor plan
            </Text>
          </View>
        }
      />

      <LayoutNameModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAddNewLayout}
        title="New Room"
      />
      <LayoutNameModal
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleEditLayout}
        title="Rename Room"
        initialName={selectedLayout?.name || ""}
      />
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) setDeleteModalOpen(false);
        }}
        onConfirm={handleDeleteLayout}
        title="Delete Layout"
        description={`Are you sure you want to permanently delete "${selectedLayout?.name}"? All tables within it will be removed.`}
        confirmText="Delete"
        variant="destructive"
        loading={isDeleting}
      />
    </View>
  );
};

export default FloorPlanManagementScreen;
