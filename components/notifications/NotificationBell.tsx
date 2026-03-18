import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { Bell } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

const NotificationBell = () => {
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);
  const openSheet = useNotificationSheetStore((state) => state.openSheet);

  const unreadCount = useNotificationStore((state) =>
    loggedInEmployee
      ? state.notifications.filter(
          (n) => n.employeeId === loggedInEmployee.id && !n.isRead
        ).length
      : 0
  );

  return (
    <TouchableOpacity
      onPress={openSheet}
      style={{ padding: 7, backgroundColor: colors.teal + '10', borderRadius: 10, borderWidth: 1, borderColor: colors.teal + '30' }}
    >
      <Bell size={18} color={colors.teal} />
      {unreadCount > 0 && (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, backgroundColor: colors.teal, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: colors.screen }}>
          <Text style={{ color: '#0C0F1A', fontSize: 9, fontWeight: '700' }}>{unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export default NotificationBell;
