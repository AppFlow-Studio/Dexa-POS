import { colors } from "@/lib/theme";
import { PTORequest } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react-native";
import { Text, View, TouchableOpacity } from "react-native";

interface PTOHistoryCardProps {
  request: PTORequest;
  onCancelRequest: (requestId: string) => void;
}

const getStatusConfig = (status: PTORequest["status"]) => {
  switch (status) {
    case "approved":
      return { icon: <CheckCircle2 size={16} color={colors.success} />, color: colors.success, label: "Approved" };
    case "denied":
      return { icon: <XCircle size={16} color={colors.danger} />, color: colors.danger, label: "Denied" };
    case "pending":
      return { icon: <AlertCircle size={16} color={colors.warning} />, color: colors.warning, label: "Pending" };
  }
};

const PTOHistoryCard: React.FC<PTOHistoryCardProps> = ({ request, onCancelRequest }) => {
  const config = getStatusConfig(request.status);

  return (
    <View style={{ padding: 14, borderRadius: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center gap-2 flex-1">
          {config.icon}
          <View className="flex-1">
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, marginBottom: 2 }}>
              {format(parseISO(request.startDate), "MMM d")} – {format(parseISO(request.endDate), "MMM d, yyyy")}
            </Text>
            <Text style={{ fontSize: 11, color: colors.label }}>
              {request.hours}h requested · Submitted {format(parseISO(request.submittedAt), "MMM d")}
            </Text>
            {request.status === "denied" && request.denialReason && (
              <Text style={{ fontSize: 11, color: colors.danger, marginTop: 2 }}>
                Reason: {request.denialReason}
              </Text>
            )}
          </View>
        </View>

        <View className="items-end gap-2">
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: config.color + '15' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: config.color }}>{config.label}</Text>
          </View>
          {request.status === "pending" && (
            <TouchableOpacity
              onPress={() => onCancelRequest(request.id)}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.danger }}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default PTOHistoryCard;
