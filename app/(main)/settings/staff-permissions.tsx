import { PermissionMatrixBottomSheet } from "@/components/settings/PermissionMatrixBottomSheet";
import { Switch } from "@/components/ui/switch";
import { colors } from "@/lib/theme";
import { Permission, useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { Calendar, Check, ChevronDown, ChevronUp, Coffee, Edit3, Lock, Plus, Shield, Trash2, UserCog, X } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";


const ROLE_KEYS = ["admin", "manager", "server", "kitchen", "host"] as const;
const ROLE_LABELS = { admin: "Admin", manager: "Manager", server: "Server", kitchen: "Kitchen", host: "Host" };

interface Role {
  id: number;
  name: string;
  count: number;
  color: string;
}

const StaffPermissionsScreen = () => {
  // Zustand store
  const {
    permissions,
    setPermissions,
    clockInSettings,
    setClockInSettings,
  } = useSettingsStore();

  const isBreakAndSwitchEnabled = useStoreSettingsStore((s) => s.isBreakAndSwitchEnabled);
  const setIsBreakAndSwitchEnabled = useStoreSettingsStore((s) => s.setIsBreakAndSwitchEnabled);
  const ptoAccrualRate = useStoreSettingsStore((s) => s.ptoAccrualRate);
  const setPtoAccrualRate = useStoreSettingsStore((s) => s.setPtoAccrualRate);
  const minimumPtoNoticeDays = useStoreSettingsStore((s) => s.minimumPtoNoticeDays);
  const updateField = useStoreSettingsStore((s) => s.updateField);

  // Roles state (local for now)
  const [roles, setRoles] = useState<Role[]>([
    { id: 1, name: "Admin", count: 2, color: "#ef4444" },
    { id: 2, name: "Manager", count: 3, color: "#f97316" },
    { id: 3, name: "Server", count: 12, color: "#22c55e" },
    { id: 4, name: "Kitchen", count: 8, color: "#eab308" },
    { id: 5, name: "Host", count: 4, color: "#3b82f6" },
  ]);

  const [expandedSections, setExpandedSections] = useState({
    roles: true,
    matrix: true,
    breakLogin: true,
    pto: true,
    clockin: true,
  });

  // Edit Matrix Bottom Sheet
  const permissionSheetRef = useRef<BottomSheet>(null);

  // Add Role Modal
  const [addRoleModal, setAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedColor, setSelectedColor] = useState("#3b82f6");

  // Edit/Delete Role
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editRoleModal, setEditRoleModal] = useState(false);

  const ROLE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Permission Matrix handlers
  const openEditMatrix = () => {
    permissionSheetRef.current?.expand();
  };

  const closeEditMatrix = () => {
    permissionSheetRef.current?.close();
  };

  const saveMatrix = (newPermissions: Permission[]) => {
    setPermissions(newPermissions);
  };

  // Role handlers
  const openAddRoleModal = () => {
    setNewRoleName("");
    setSelectedColor("#3b82f6");
    setAddRoleModal(true);
  };

  const closeAddRoleModal = () => {
    setAddRoleModal(false);
    setNewRoleName("");
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) return;
    const newRole: Role = {
      id: Date.now(),
      name: newRoleName.trim(),
      count: 0,
      color: selectedColor,
    };
    setRoles(prev => [...prev, newRole]);
    closeAddRoleModal();
  };

  const openEditRoleModal = (role: Role) => {
    setSelectedRole(role);
    setNewRoleName(role.name);
    setSelectedColor(role.color);
    setEditRoleModal(true);
  };

  const closeEditRoleModal = () => {
    setEditRoleModal(false);
    setSelectedRole(null);
    setNewRoleName("");
  };

  const handleEditRole = () => {
    if (!selectedRole || !newRoleName.trim()) return;
    setRoles(prev => prev.map(r => r.id === selectedRole.id ? { ...r, name: newRoleName.trim(), color: selectedColor } : r));
    closeEditRoleModal();
  };

  const handleDeleteRole = () => {
    if (!selectedRole) return;
    setRoles(prev => prev.filter(r => r.id !== selectedRole.id));
    closeEditRoleModal();
  };

  const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        backgroundColor: colors.panel,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: colors.teal + "15",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}>
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{title}</Text>
      </View>
      {expandedSections[section]
        ? <ChevronUp size={16} color={colors.label} />
        : <ChevronDown size={16} color={colors.label} />}
    </TouchableOpacity>
  );

  const renderToggleRow = (label: string, description: string, value: boolean, onToggle: (val: boolean) => void, isLast = false) => (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: colors.border,
    }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 13, color: colors.heading, fontWeight: "600" }}>{label}</Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>{description}</Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

  const renderAddRoleModal = () => (
    <Modal visible={addRoleModal} transparent animationType="fade" onRequestClose={closeAddRoleModal} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16 }}>
        <View style={{
          width: "100%",
          maxWidth: 400,
          backgroundColor: colors.panel,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}>
          <View style={{
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.card,
          }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Add New Role</Text>
            <TouchableOpacity onPress={closeAddRoleModal} style={{ padding: 4 }}>
              <X size={18} color={colors.label} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 14 }}>
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600", marginBottom: 6 }}>Role Name</Text>
              <TextInput
                value={newRoleName}
                onChangeText={setNewRoleName}
                placeholder="Enter role name"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  color: colors.heading,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600", marginBottom: 8 }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ROLE_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: selectedColor === color ? colors.heading : "transparent",
                      backgroundColor: color,
                    }}
                  >
                    {selectedColor === color && <Check size={16} color="white" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={{
            padding: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: "row",
            gap: 10,
          }}>
            <TouchableOpacity
              onPress={closeAddRoleModal}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddRole}
              disabled={!newRoleName.trim()}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: newRoleName.trim() ? colors.teal + "20" : colors.teal + "0A",
                borderWidth: 1,
                borderColor: newRoleName.trim() ? colors.teal + "50" : colors.border,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: newRoleName.trim() ? colors.teal : colors.muted }}>Add Role</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderEditRoleModal = () => (
    <Modal visible={editRoleModal} transparent animationType="fade" onRequestClose={closeEditRoleModal} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16 }}>
        <View style={{
          width: "100%",
          maxWidth: 400,
          backgroundColor: colors.panel,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}>
          <View style={{
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.card,
          }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Edit Role</Text>
            <TouchableOpacity onPress={closeEditRoleModal} style={{ padding: 4 }}>
              <X size={18} color={colors.label} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 14 }}>
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600", marginBottom: 6 }}>Role Name</Text>
              <TextInput
                value={newRoleName}
                onChangeText={setNewRoleName}
                placeholder="Enter role name"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  color: colors.heading,
                }}
              />
            </View>

            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600", marginBottom: 8 }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ROLE_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: selectedColor === color ? colors.heading : "transparent",
                      backgroundColor: color,
                    }}
                  >
                    {selectedColor === color && <Check size={16} color="white" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{
              backgroundColor: colors.danger + "10",
              borderWidth: 1,
              borderColor: colors.danger + "30",
              borderRadius: 8,
              padding: 10,
            }}>
              <Text style={{ fontSize: 12, color: colors.danger, textAlign: "center" }}>
                This role has {selectedRole?.count || 0} staff members assigned.
              </Text>
            </View>
          </View>

          <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={closeEditRoleModal}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditRole}
                disabled={!newRoleName.trim()}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: newRoleName.trim() ? colors.teal + "20" : colors.teal + "0A",
                  borderWidth: 1,
                  borderColor: newRoleName.trim() ? colors.teal + "50" : colors.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: newRoleName.trim() ? colors.teal : colors.muted }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleDeleteRole}
              style={{
                paddingVertical: 10,
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "30",
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Trash2 size={14} color={colors.danger} />
              <Text style={{ fontSize: 12, color: colors.danger, fontWeight: "600" }}>Delete Role</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
        {renderAddRoleModal()}
        {renderEditRoleModal()}

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Staff & Permissions</Text>
          <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>Manage roles, permissions, and employee access.</Text>
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* Roles Management */}
          <View style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
          }}>
            {renderSectionHeader("Role Management", <UserCog size={16} color={colors.teal} />, "roles")}
            {expandedSections.roles && (
              <View style={{ padding: 14 }}>
                <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>Tap a role to edit. Define roles to categorize your staff members.</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                  {roles.map(role => (
                    <TouchableOpacity
                      key={role.id}
                      onPress={() => openEditRoleModal(role)}
                      style={{
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: 7, backgroundColor: role.color }} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading, marginRight: 6 }}>{role.name}</Text>
                      <View style={{
                        backgroundColor: colors.screen,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 10,
                      }}>
                        <Text style={{ fontSize: 11, color: colors.label }}>{role.count}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={openAddRoleModal}
                    style={{
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Plus size={13} color={colors.teal} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal, marginLeft: 4 }}>Add Role</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Permission Matrix */}
          <View style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
          }}>
            {renderSectionHeader("Permission Matrix", <Shield size={16} color={colors.warning} />, "matrix")}
            {expandedSections.matrix && (
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: "row", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Permission</Text>
                  </View>
                  {ROLE_KEYS.map(role => (
                    <View key={role} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {ROLE_LABELS[role].substring(0, 4)}
                      </Text>
                    </View>
                  ))}
                </View>

                {permissions.map((perm) => (
                  <View key={perm.id} style={{
                    flexDirection: "row",
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    alignItems: "center",
                  }}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: 12, color: colors.heading }}>{perm.name}</Text>
                    </View>
                    {ROLE_KEYS.map(role => (
                      <View key={role} style={{ flex: 1, alignItems: "center" }}>
                        {perm[role]
                          ? <Check size={14} color={colors.success} />
                          : <X size={14} color={colors.danger} />}
                      </View>
                    ))}
                  </View>
                ))}

                <TouchableOpacity
                  onPress={openEditMatrix}
                  style={{
                    marginTop: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: 8,
                    paddingVertical: 10,
                    gap: 6,
                  }}
                >
                  <Edit3 size={14} color={colors.teal} />
                  <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }}>Edit Permission Matrix</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Break & Login */}
          <View style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
          }}>
            {renderSectionHeader("Break & Login", <Coffee size={16} color="#f472b6" />, "breakLogin")}
            {expandedSections.breakLogin && (
              <View style={{ padding: 14 }}>
                {renderToggleRow(
                  "Enable Break & Switch Account",
                  "Allow another employee to log in while someone is on break.",
                  isBreakAndSwitchEnabled,
                  (v) => setIsBreakAndSwitchEnabled(v),
                  true
                )}
              </View>
            )}
          </View>

          {/* Paid Time Off (PTO) */}
          <View style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
          }}>
            {renderSectionHeader("Paid Time Off (PTO)", <Calendar size={16} color={colors.success} />, "pto")}
            {expandedSections.pto && (
              <View style={{ padding: 14 }}>
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, marginBottom: 2 }}>PTO Accrual Rate</Text>
                  <Text style={{ fontSize: 11, color: colors.label, marginBottom: 8 }}>Rate at which employees accrue PTO per hour worked.</Text>
                  <TextInput
                    value={ptoAccrualRate.toString()}
                    onChangeText={(text) => {
                      const val = parseFloat(text);
                      if (!isNaN(val)) setPtoAccrualRate(val);
                      else if (text === "") setPtoAccrualRate(0);
                    }}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      color: colors.heading,
                    }}
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, marginBottom: 2 }}>Minimum PTO Request Notice (Days)</Text>
                  <Text style={{ fontSize: 11, color: colors.label, marginBottom: 8 }}>Minimum number of days in advance an employee can request PTO.</Text>
                  <TextInput
                    value={minimumPtoNoticeDays.toString()}
                    onChangeText={(text) => {
                      const val = parseInt(text);
                      if (!isNaN(val)) updateField("minimumPtoNoticeDays", val);
                      else if (text === "") updateField("minimumPtoNoticeDays", 0);
                    }}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      color: colors.heading,
                    }}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Clock-In Settings */}
          <View style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
          }}>
            {renderSectionHeader("Clock-In Security", <Lock size={16} color={colors.teal} />, "clockin")}
            {expandedSections.clockin && (
              <View style={{ padding: 14 }}>
                {renderToggleRow(
                  "Require PIN for Clock-In",
                  "Staff must enter their unique PIN to clock in/out",
                  clockInSettings.pinRequired,
                  (v) => setClockInSettings({ pinRequired: v })
                )}
                {renderToggleRow(
                  "Require Photo Verification",
                  "Take a photo of the staff member on clock-in",
                  clockInSettings.photoRequired,
                  (v) => setClockInSettings({ photoRequired: v })
                )}
                {renderToggleRow(
                  "Prevent Early Clock-In",
                  "Restrict clock-in to 15 mins before scheduled shift",
                  clockInSettings.preventEarlyClockIn,
                  (v) => setClockInSettings({ preventEarlyClockIn: v })
                )}
                {renderToggleRow(
                  "Open Checks Restriction",
                  "Prevent clock-out if staff has open orders",
                  clockInSettings.preventOpenOrdersClockOut,
                  (v) => setClockInSettings({ preventOpenOrdersClockOut: v }),
                  true
                )}
              </View>
            )}
          </View>

        </ScrollView>
      </View>

      <PermissionMatrixBottomSheet
        bottomSheetRef={permissionSheetRef}
        permissions={permissions}
        onSave={saveMatrix}
        onClose={closeEditMatrix}
      />
    </GestureHandlerRootView>
  );
};

export default StaffPermissionsScreen;
