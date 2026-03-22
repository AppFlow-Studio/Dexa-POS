import VendorFormModal from "@/components/inventory/VendorFormModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { Vendor } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList,
} from "@gorhom/bottom-sheet";
import { Link, useRouter } from "expo-router";
import {
  Building2,
  Edit,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const VendorRow: React.FC<{
  item: Vendor;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  return (
    <Link href={`/inventory/vendors/${item.id}`} asChild>
      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Name */}
        <View style={{ width: "22%", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: colors.teal + "15",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={14} color={colors.teal} />
          </View>
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, fontWeight: "600", color: colors.heading, flex: 1 }}
          >
            {item.name}
          </Text>
        </View>

        {/* Contact */}
        <View style={{ width: "18%", flexDirection: "row", alignItems: "center", gap: 6 }}>
          <User size={12} color={colors.muted} />
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.label }}>
            {item.contactPerson || "—"}
          </Text>
        </View>

        {/* Email */}
        <View style={{ width: "30%", flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Mail size={12} color={colors.muted} />
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.label }}>
            {item.email || "—"}
          </Text>
        </View>

        {/* Phone */}
        <View style={{ width: "20%", flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Phone size={12} color={colors.muted} />
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.label }}>
            {item.phone || "—"}
          </Text>
        </View>

        {/* Actions */}
        <View style={{ width: "10%", alignItems: "flex-end" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity style={{ padding: 6 }}>
                <MoreHorizontal size={16} color={colors.muted} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-44"
              style={{ backgroundColor: colors.panel, borderColor: colors.border }}
            >
              <DropdownMenuItem onPress={onEdit}>
                <Edit size={14} color={colors.label} />
                <Text style={{ fontSize: 13, color: colors.heading, marginLeft: 8 }}>
                  Edit Vendor
                </Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={onDelete}>
                <Trash2 size={14} color={colors.danger} />
                <Text style={{ fontSize: 13, color: colors.danger, marginLeft: 8 }}>
                  Delete Vendor
                </Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </TouchableOpacity>
    </Link>
  );
};

const VendorScreen = () => {
  const { vendors, addVendor, updateVendor, deleteVendor } = useInventoryStore();
  const router = useRouter();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  const filteredVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.name, v.contactPerson, v.email, v.phone]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }, [searchQuery, vendors]);

  const groupedVendors = useMemo(() => {
    const map: Record<string, Vendor[]> = {};
    for (const v of filteredVendors) {
      const first = (v.name || "?")[0].toUpperCase();
      const key = /[A-Z]/.test(first) ? first : "#";
      if (!map[key]) map[key] = [];
      map[key].push(v);
    }
    const letters = Object.keys(map).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
    return letters.map((letter) => ({ title: letter, data: map[letter] }));
  }, [filteredVendors]);

  const handleOpenAddModal = () => {
    setSelectedVendor(null);
    setModalMode("add");
  };

  const handleOpenEditModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setModalMode("edit");
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedVendor(null);
  };

  const handleSaveVendor = (data: Omit<Vendor, "id">, id?: string) => {
    if (id) {
      updateVendor(id, data);
    } else {
      addVendor(data);
    }
  };

  const handleOpenDeleteConfirm = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedVendor) {
      deleteVendor(selectedVendor.id);
    }
    setDeleteConfirmOpen(false);
    setSelectedVendor(null);
  };

  const TABLE_HEADERS = ["Vendor Name", "Contact", "Email", "Phone", ""];

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
        }}
      >
        {/* Table Header */}
        <View
          style={{
            flexDirection: "row",
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: colors.screen,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            alignItems: "center",
          }}
        >
          {TABLE_HEADERS.map((header) => {
            let widthStyle: any = {};
            switch (header) {
              case "Vendor Name": widthStyle = { width: "22%" }; break;
              case "Contact":     widthStyle = { width: "18%" }; break;
              case "Email":       widthStyle = { width: "30%" }; break;
              case "Phone":       widthStyle = { width: "20%" }; break;
              default:            widthStyle = { width: "10%" }; break;
            }
            return (
              <Text
                key={header}
                style={[
                  {
                    fontSize: 11,
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  },
                  widthStyle,
                ]}
              >
                {header}
              </Text>
            );
          })}

          {/* Actions */}
          <View
            style={{
              position: "absolute",
              right: 12,
              top: 0,
              bottom: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                setIsSearchOpen(true);
                setTimeout(() => sheetRef.current?.expand(), 0);
              }}
              style={{
                backgroundColor: colors.teal + "15",
                borderRadius: 8,
                padding: 7,
              }}
            >
              <Search size={16} color={colors.teal} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenAddModal}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 7,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: 8,
              }}
            >
              <Plus size={14} color={colors.teal} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                Add Vendor
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        <FlatList
          data={vendors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VendorRow
              item={item}
              onEdit={() => handleOpenEditModal(item)}
              onDelete={() => handleOpenDeleteConfirm(item)}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: colors.teal + "15",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 4,
                }}
              >
                <Building2 size={20} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.heading }}>
                No vendors yet
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Add your first vendor to get started
              </Text>
            </View>
          }
        />
      </View>

      <VendorFormModal
        isOpen={modalMode === "add" || modalMode === "edit"}
        onClose={handleCloseModal}
        onSave={handleSaveVendor}
        initialData={selectedVendor}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Vendor"
        description={`Are you sure you want to permanently delete "${selectedVendor?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Search Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View
            style={{
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                height: 40,
                gap: 8,
              }}
            >
              <Search size={15} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search vendors..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 14, color: colors.heading }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
        <BottomSheetSectionList
          sections={groupedVendors}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingVertical: 4, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 }}>
              <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                sheetRef.current?.close();
                setIsSearchOpen(false);
                router.push(`/inventory/vendors/${item.id}`);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.teal + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={15} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
                  {item.contactPerson} · {item.phone}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted }}>{item.email}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>No vendors found</Text>
            </View>
          }
        />
      </BottomSheet>
    </View>
  );
};

export default VendorScreen;
