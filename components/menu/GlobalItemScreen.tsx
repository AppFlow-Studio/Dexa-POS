import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { router } from "expo-router";
import { ArrowLeft, Copy, Globe } from "lucide-react-native";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface GlobalItemScreenProps {
  type: "Menu" | "Category" | "Item" | "Modifier";
  onMakeLocalCopy?: () => void;
  isMakingLocalCopy?: boolean;
}

export function GlobalItemScreen({
  type,
  onMakeLocalCopy,
  isMakingLocalCopy,
}: GlobalItemScreenProps) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Content */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: s(32),
        }}
      >
        {/* Icon */}
        <View
          style={{
            width: s(64),
            height: s(64),
            borderRadius: s(18),
            backgroundColor: colors.teal + "15",
            borderWidth: 1,
            borderColor: colors.teal + "30",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: s(20),
          }}
        >
          <Globe size={s(28)} color={colors.teal} />
        </View>

        {/* Badge */}
        <View
          style={{
            paddingHorizontal: s(10),
            paddingVertical: s(4),
            borderRadius: s(6),
            backgroundColor: colors.teal + "18",
            borderWidth: 1,
            borderColor: colors.teal + "35",
            marginBottom: s(12),
          }}
        >
          <Text
            style={{
              fontSize: s(11),
              fontWeight: "700",
              color: colors.teal,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Global {type}
          </Text>
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: s(18),
            fontWeight: "700",
            color: colors.heading,
            marginBottom: s(10),
          }}
        >
          Read-Only {type}
        </Text>

        {/* Description */}
        <Text
          style={{
            fontSize: s(13),
            color: colors.muted,
            textAlign: "center",
            lineHeight: s(21),
            marginBottom: s(28),
            maxWidth: s(320),
          }}
        >
          This {type.toLowerCase()} is managed globally across all locations and
          cannot be edited here.
          {onMakeLocalCopy
            ? " You can make a local copy to customize it for this location."
            : " Contact your administrator to make changes."}
        </Text>

        {/* Info card */}
        <View
          style={{
            backgroundColor: colors.card + "cc",
            borderRadius: s(10),
            borderWidth: 1,
            borderColor: colors.border,
            padding: s(14),
            gap: s(8),
            width: "100%",
            maxWidth: s(320),
            marginBottom: s(24),
          }}
        >
          {(type === "Item"
            ? [
                "Name, description & details are locked",
                "Price & availability are set per location from the menu list",
              ]
            : type === "Modifier"
              ? [
                  "Name & options are locked",
                  "Option availability is set per location from the menu list",
                ]
              : [
                  "Name & details are locked",
                  "Managed globally across all locations",
                ]
          ).map((line, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
            >
              <View
                style={{
                  width: s(4),
                  height: s(4),
                  borderRadius: s(2),
                  backgroundColor: colors.muted,
                }}
              />
              <Text style={{ fontSize: s(12), color: colors.muted, flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        {/* Make local copy button */}
        {onMakeLocalCopy && (
          <TouchableOpacity
            onPress={onMakeLocalCopy}
            disabled={isMakingLocalCopy}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(8),
              paddingHorizontal: s(20),
              paddingVertical: s(10),
              borderRadius: s(8),
              backgroundColor: colors.teal,
              marginBottom: s(12),
              opacity: isMakingLocalCopy ? 0.7 : 1,
            }}
          >
            {isMakingLocalCopy ? (
              <ActivityIndicator size="small" color={colors.onSolid} />
            ) : (
              <Copy size={s(14)} color={colors.onSolid} />
            )}
            <Text
              style={{
                fontSize: s(13),
                color: colors.onSolid,
                fontWeight: "600",
              }}
            >
              {isMakingLocalCopy ? "Creating Local Copy..." : "Make Local Copy"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(8),
            paddingHorizontal: s(20),
            paddingVertical: s(10),
            borderRadius: s(8),
            backgroundColor: colors.teal + "18",
            borderWidth: 1,
            borderColor: colors.teal + "35",
          }}
        >
          <ArrowLeft size={s(14)} color={colors.teal} />
          <Text
            style={{ fontSize: s(13), color: colors.teal, fontWeight: "600" }}
          >
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
