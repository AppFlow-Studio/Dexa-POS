import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { format, parseISO } from "date-fns";
import { colors } from "@/lib/theme";
import { AlertCircle, CheckCircle2, Clock, MapPin, XCircle } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

const getStatusConfig = (status: string) => {
  switch (status) {
    case "approved": return { icon: <CheckCircle2 size={15} color={colors.success} />, color: colors.success, label: "Approved" };
    case "denied": return { icon: <XCircle size={15} color={colors.danger} />, color: colors.danger, label: "Denied" };
    default: return { icon: <AlertCircle size={15} color={colors.warning} />, color: colors.warning, label: "Pending" };
  }
};

const formatTime = (time: string): string => {
  if (!time) return "N/A";
  const [hours, minutes] = time.split(":");
  const h = Number.parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${minutes} ${ampm}`;
};

const DropRequestsTab = () => {
  const { loggedInEmployee } = useEmployeeStore();
  const { dropRequests, cancelDropRequest } = useScheduleStore();

  const myDropRequests = dropRequests.filter(
    (r) => r.shift.employeeId === loggedInEmployee?.id
  );

  if (myDropRequests.length === 0) {
    return (
      <View style={{ padding: 40, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
        <AlertCircle size={36} color={colors.muted} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.heading, marginTop: 12 }}>No Drop Requests</Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>You have not submitted any drop requests.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {myDropRequests.map((request) => {
        const config = getStatusConfig(request.status);
        return (
          <View key={request.id} style={{ padding: 14, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {config.icon}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, marginBottom: 2 }}>{request.shift.role}</Text>
                  <Text style={{ fontSize: 11, color: colors.label }}>{format(parseISO(request.shift.date), "EEE, MMM d, yyyy")}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} color={colors.muted} />
                      <Text style={{ fontSize: 11, color: colors.label }}>{formatTime(request.shift.startTime)} – {formatTime(request.shift.endTime)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} color={colors.muted} />
                      <Text style={{ fontSize: 11, color: colors.label }}>{request.shift.location}</Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: config.color + '15' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: config.color }}>{config.label}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.muted }}>Submitted {format(parseISO(request.submittedAt), "MMM d")}</Text>
              </View>
            </View>

            {request.status === "denied" && request.denialReason && (
              <View style={{ padding: 10, backgroundColor: colors.danger + '10', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.danger + '30' }}>
                <Text style={{ fontSize: 12, color: colors.danger }}>Reason: {request.denialReason}</Text>
              </View>
            )}

            {request.status === "pending" && (
              <TouchableOpacity
                onPress={() => cancelDropRequest(request.id)}
                style={{ paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>Cancel Request</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default DropRequestsTab;
