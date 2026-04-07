import { colors } from "@/lib/theme";
import { getIsOnline } from "@/services/offlineSyncService";
import {
  fetchAutocompleteSuggestions,
  fetchPlaceDetails,
  type PlacePrediction,
} from "@/services/googlePlacesService";
import type { ParsedAddress } from "@/utils/addressUtils";
import { MapPin } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { v4 as uuidv4 } from "uuid";

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onAddressSelected: (address: ParsedAddress) => void;
  placeholder?: string;
  inputStyle?: StyleProp<ViewStyle>;
  /** Render suggestions inline (pushes content down) instead of absolute overlay */
  inline?: boolean;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChangeText,
  onAddressSelected,
  placeholder = "Search address...",
  inputStyle,
  inline = false,
}) => {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const sessionTokenRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFocus = useCallback(() => {
    sessionTokenRef.current = uuidv4();
  }, []);

  const handleBlur = useCallback(() => {
    // Delay to allow tap on suggestion to register
    setTimeout(() => setShowDropdown(false), 200);
  }, []);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (!getIsOnline()) return;

    setLoading(true);
    const results = await fetchAutocompleteSuggestions(
      text,
      sessionTokenRef.current,
    );
    setSuggestions(results);
    setShowDropdown(results.length > 0);
    setLoading(false);
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(text), 300);
    },
    [onChangeText, fetchSuggestions],
  );

  const handleSelect = useCallback(
    async (prediction: PlacePrediction) => {
      setShowDropdown(false);
      setSuggestions([]);
      setLoading(true);

      const details = await fetchPlaceDetails(
        prediction.place_id,
        sessionTokenRef.current,
      );

      // Reset session token after selection (billing session complete)
      sessionTokenRef.current = uuidv4();
      setLoading(false);

      if (details) {
        onAddressSelected(details);
        // Don't call onChangeText — parent updates display via onAddressSelected callback.
        // OrderTypeDrawer: value derives from formatAddress(delivery_address)
        // CustomerSheet: sets addressDisplay in onAddressSelected handler
      } else {
        // Fallback: use the description as plain text
        onChangeText(prediction.description);
      }
    },
    [onAddressSelected, onChangeText],
  );

  const dropdownContent = showDropdown && suggestions.length > 0 && (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          marginTop: 4,
          overflow: "hidden",
        },
        !inline && {
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 999,
        },
      ]}
    >
      {suggestions.map((item, index) => (
        <TouchableOpacity
          key={item.place_id}
          onPress={() => handleSelect(item)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 10,
            borderTopWidth: index > 0 ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <MapPin size={14} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.heading, fontSize: 12, fontWeight: "600" }}
              numberOfLines={1}
            >
              {item.structured_formatting.main_text}
            </Text>
            <Text
              style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}
              numberOfLines={1}
            >
              {item.structured_formatting.secondary_text}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.muted, fontSize: 9, textAlign: "right" }}>
          Powered by Google
        </Text>
      </View>
    </View>
  );

  return (
    <View style={inline ? undefined : { zIndex: 999 }}>
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            height: 38,
            paddingHorizontal: 12,
          },
          inputStyle,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={{
            flex: 1,
            color: colors.heading,
            fontSize: 13,
            padding: 0,
          }}
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={colors.teal}
            style={{ marginLeft: 6 }}
          />
        )}
      </View>
      {dropdownContent}
    </View>
  );
};
