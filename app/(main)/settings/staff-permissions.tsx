import { Check, ChevronDown, ChevronUp, Edit3, Lock, Plus, Shield, Trash2, UserCog, X } from "lucide-react-native";
import React, { useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Switch } from "~/components/ui/switch";
import { Permission, useSettingsPageStore } from "~/stores/useSettingsPageStore";

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
  } = useSettingsPageStore();

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
    clockin: true,
  });

  // Edit Matrix Modal
  const [editMatrixModal, setEditMatrixModal] = useState(false);
  const [tempPermissions, setTempPermissions] = useState<Permission[]>([]);

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
    setTempPermissions(JSON.parse(JSON.stringify(permissions)));
    setEditMatrixModal(true);
  };

  const closeEditMatrix = () => {
    setEditMatrixModal(false);
    setTempPermissions([]);
  };

  const saveMatrix = () => {
    setPermissions(tempPermissions);
    setEditMatrixModal(false);
  };

  const toggleTempPermission = (permId: number, role: keyof Permission) => {
    setTempPermissions(prev =>
      prev.map(p => p.id === permId ? { ...p, [role]: !p[role] } : p)
    );
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
      className="flex-row items-center justify-between p-4 bg-[#353535] rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-[#454545] rounded-lg items-center justify-center mr-3">
          {icon}
        </View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? <ChevronUp size={20} color="#9ca3af" /> : <ChevronDown size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );

  const renderToggleRow = (label: string, description: string, value: boolean, onToggle: (val: boolean) => void) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
      <View className="flex-1 pr-4">
        <Text className="text-white font-medium">{label}</Text>
        <Text className="text-gray-400 text-sm">{description}</Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

  const renderEditMatrixModal = () => (
    <Modal visible={editMatrixModal} transparent animationType="fade" onRequestClose={closeEditMatrix} statusBarTranslucent>
      <View className="flex-1 justify-center items-center bg-black/70 px-4">
        <View className="w-full max-w-[650px] bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
          <View className="p-4 border-b border-gray-700 flex-row items-center justify-between bg-[#353535]">
            <Text className="text-xl font-bold text-white">Edit Permission Matrix</Text>
            <TouchableOpacity onPress={closeEditMatrix} className="p-2"><X size={24} color="#9ca3af" /></TouchableOpacity>
          </View>

          <View className="p-4">
            <Text className="text-gray-400 text-sm mb-4">Tap on any cell to toggle permission.</Text>

            <View className="flex-row mb-3 pb-2 border-b border-gray-600">
              <View className="flex-[2.5]"><Text className="text-gray-400 text-xs font-bold uppercase">Permission</Text></View>
              {ROLE_KEYS.map(role => (
                <View key={role} className="flex-1 items-center">
                  <Text className="text-gray-400 text-xs font-bold uppercase">{ROLE_LABELS[role].substring(0, 4)}</Text>
                </View>
              ))}
            </View>

            <ScrollView className="max-h-[350px]" showsVerticalScrollIndicator={true}>
              {tempPermissions.map((perm) => (
                <View key={perm.id} className="flex-row py-3 border-b border-gray-700/50 items-center">
                  <View className="flex-[2.5] pr-2">
                    <Text className="text-white text-sm">{perm.name}</Text>
                  </View>
                  {ROLE_KEYS.map(role => (
                    <TouchableOpacity
                      key={role}
                      onPress={() => toggleTempPermission(perm.id, role)}
                      className="flex-1 items-center py-1"
                    >
                      <View className={`w-9 h-9 rounded-lg items-center justify-center ${perm[role] ? 'bg-green-600' : 'bg-red-600/30 border border-red-600/50'}`}>
                        {perm[role] ? <Check size={18} color="white" /> : <X size={18} color="#ef4444" />}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>

          <View className="p-4 border-t border-gray-700 flex-row gap-3 bg-[#2a2a2a]">
            <TouchableOpacity onPress={closeEditMatrix} className="flex-1 py-3 bg-[#404040] rounded-lg">
              <Text className="text-white font-medium text-center">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveMatrix} className="flex-1 py-3 bg-blue-600 rounded-lg">
              <Text className="text-white font-medium text-center">Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderAddRoleModal = () => (
    <Modal visible={addRoleModal} transparent animationType="fade" onRequestClose={closeAddRoleModal} statusBarTranslucent>
      <View className="flex-1 justify-center items-center bg-black/70 px-4">
        <View className="w-full max-w-[400px] bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
          <View className="p-4 border-b border-gray-700 flex-row items-center justify-between bg-[#353535]">
            <Text className="text-xl font-bold text-white">Add New Role</Text>
            <TouchableOpacity onPress={closeAddRoleModal} className="p-2"><X size={24} color="#9ca3af" /></TouchableOpacity>
          </View>

          <View className="p-4">
            <View className="mb-4">
              <Text className="text-gray-300 font-medium mb-2">Role Name</Text>
              <TextInput
                value={newRoleName}
                onChangeText={setNewRoleName}
                placeholder="Enter role name"
                placeholderTextColor="#6b7280"
                className="bg-[#404040] border border-gray-600 rounded-lg p-3 text-white"
              />
            </View>

            <View>
              <Text className="text-gray-300 font-medium mb-2">Color</Text>
              <View className="flex-row flex-wrap gap-2">
                {ROLE_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-lg items-center justify-center border-2 ${selectedColor === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  >
                    {selectedColor === color && <Check size={18} color="white" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View className="p-4 border-t border-gray-700 flex-row gap-3">
            <TouchableOpacity onPress={closeAddRoleModal} className="flex-1 py-3 bg-[#404040] rounded-lg">
              <Text className="text-white font-medium text-center">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAddRole} disabled={!newRoleName.trim()} className={`flex-1 py-3 rounded-lg ${newRoleName.trim() ? 'bg-blue-600' : 'bg-blue-600/50'}`}>
              <Text className="text-white font-medium text-center">Add Role</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderEditRoleModal = () => (
    <Modal visible={editRoleModal} transparent animationType="fade" onRequestClose={closeEditRoleModal} statusBarTranslucent>
      <View className="flex-1 justify-center items-center bg-black/70 px-4">
        <View className="w-full max-w-[400px] bg-[#303030] rounded-2xl border border-gray-700 overflow-hidden">
          <View className="p-4 border-b border-gray-700 flex-row items-center justify-between bg-[#353535]">
            <Text className="text-xl font-bold text-white">Edit Role</Text>
            <TouchableOpacity onPress={closeEditRoleModal} className="p-2"><X size={24} color="#9ca3af" /></TouchableOpacity>
          </View>

          <View className="p-4">
            <View className="mb-4">
              <Text className="text-gray-300 font-medium mb-2">Role Name</Text>
              <TextInput
                value={newRoleName}
                onChangeText={setNewRoleName}
                placeholder="Enter role name"
                placeholderTextColor="#6b7280"
                className="bg-[#404040] border border-gray-600 rounded-lg p-3 text-white"
              />
            </View>

            <View className="mb-4">
              <Text className="text-gray-300 font-medium mb-2">Color</Text>
              <View className="flex-row flex-wrap gap-2">
                {ROLE_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-lg items-center justify-center border-2 ${selectedColor === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  >
                    {selectedColor === color && <Check size={18} color="white" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
              <Text className="text-red-400 text-sm text-center">This role has {selectedRole?.count || 0} staff members assigned.</Text>
            </View>
          </View>

          <View className="p-4 border-t border-gray-700">
            <View className="flex-row gap-3 mb-3">
              <TouchableOpacity onPress={closeEditRoleModal} className="flex-1 py-3 bg-[#404040] rounded-lg">
                <Text className="text-white font-medium text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEditRole} disabled={!newRoleName.trim()} className={`flex-1 py-3 rounded-lg ${newRoleName.trim() ? 'bg-blue-600' : 'bg-blue-600/50'}`}>
                <Text className="text-white font-medium text-center">Save Changes</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={handleDeleteRole} className="py-3 bg-red-600/20 border border-red-600 rounded-lg flex-row items-center justify-center">
              <Trash2 size={18} color="#f87171" />
              <Text className="text-red-400 font-medium ml-2">Delete Role</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View className="flex-1 bg-[#212121] p-6">
      {renderEditMatrixModal()}
      {renderAddRoleModal()}
      {renderEditRoleModal()}

      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Staff & Permissions</Text>
        <Text className="text-gray-400 mt-2">Manage roles, permissions, and employee access.</Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Roles Management */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Role Management", <UserCog size={20} color="#60a5fa" />, "roles")}
          {expandedSections.roles && (
            <View className="p-5">
              <Text className="text-gray-400 text-sm mb-4">Tap a role to edit. Define roles to categorize your staff members.</Text>
              <View className="flex-row flex-wrap gap-3 mb-4">
                {roles.map(role => (
                  <TouchableOpacity
                    key={role.id}
                    onPress={() => openEditRoleModal(role)}
                    className="bg-[#404040] border border-gray-600 px-4 py-3 rounded-xl flex-row items-center"
                  >
                    <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: role.color }} />
                    <Text className="text-white font-bold mr-2">{role.name}</Text>
                    <View className="bg-[#505050] px-2 py-0.5 rounded-full">
                      <Text className="text-xs text-gray-300">{role.count}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={openAddRoleModal} className="bg-blue-600/20 border border-blue-600 px-4 py-3 rounded-xl flex-row items-center">
                  <Plus size={16} color="#60a5fa" />
                  <Text className="text-blue-400 font-bold ml-1">Add Role</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Permission Matrix */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Permission Matrix", <Shield size={20} color="#f97316" />, "matrix")}
          {expandedSections.matrix && (
            <View className="p-5">
              <View className="flex-row mb-3 pb-2 border-b border-gray-600">
                <View className="flex-[2]"><Text className="text-gray-400 text-xs uppercase tracking-wider">Permission</Text></View>
                {ROLE_KEYS.map(role => (
                  <View key={role} className="flex-1 items-center">
                    <Text className="text-gray-400 text-xs uppercase tracking-wider">{ROLE_LABELS[role].substring(0, 4)}</Text>
                  </View>
                ))}
              </View>

              {permissions.map((perm) => (
                <View key={perm.id} className="flex-row py-2 border-b border-gray-700 items-center">
                  <View className="flex-[2]"><Text className="text-white text-sm">{perm.name}</Text></View>
                  {ROLE_KEYS.map(role => (
                    <View key={role} className="flex-1 items-center">
                      {perm[role] ? <Check size={16} color="#4ade80" /> : <X size={16} color="#ef4444" />}
                    </View>
                  ))}
                </View>
              ))}

              <TouchableOpacity onPress={openEditMatrix} className="mt-4 flex-row items-center justify-center bg-[#404040] py-3 rounded-lg border border-gray-600">
                <Edit3 size={16} color="#60a5fa" />
                <Text className="text-blue-400 font-medium ml-2">Edit Permission Matrix</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Clock-In Settings */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader("Clock-In Security", <Lock size={20} color="#a78bfa" />, "clockin")}
          {expandedSections.clockin && (
            <View className="p-5">
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
                (v) => setClockInSettings({ preventOpenOrdersClockOut: v })
              )}
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
};

export default StaffPermissionsScreen;
