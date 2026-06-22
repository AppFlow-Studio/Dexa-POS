import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  fetchAutocompleteSuggestions,
  fetchPlaceDetails,
  type PlacePrediction
} from '@/services/googlePlacesService'
import { getIsOnline } from '@/services/offlineSyncService'
import type { ParsedAddress } from '@/utils/addressUtils'
import { MapPin } from 'lucide-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle
} from 'react-native'
import { v4 as uuidv4 } from 'uuid'

interface AddressAutocompleteProps {
  value: string
  onChangeText: (text: string) => void
  onAddressSelected: (address: ParsedAddress) => void
  placeholder?: string
  inputStyle?: StyleProp<ViewStyle>
  /** Render suggestions inline (pushes content down) instead of absolute overlay */
  inline?: boolean
  /** Where to render the suggestions dropdown relative to the input.
   *  "below" (default) — absolutely positioned below the input.
   *  "right"           — absolutely positioned to the right of the input,
   *                      useful inside narrow drawers where the keyboard
   *                      would cover a below-positioned dropdown.
   *  "top"             — absolutely positioned above the input, useful
   *                      when the drawer boundary should contain the popup. */
  dropdownPosition?: 'below' | 'right' | 'top'
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChangeText,
  onAddressSelected,
  placeholder = 'Search address...',
  inputStyle,
  inline = false,
  dropdownPosition = 'below'
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState(value)

  const sessionTokenRef = useRef<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypedValueRef = useRef(value)
  const isFocusedRef = useRef(false)
  const latestExternalValueRef = useRef(value)

  useEffect(() => {
    latestExternalValueRef.current = value
    // While the user is actively typing, ignore store echoes entirely.
    // The parent round-trips each keystroke through Zustand + formatting,
    // and those updates can arrive out of order relative to fast typing.
    if (!isFocusedRef.current) {
      setInputValue(value)
    }
  }, [value])

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true
    sessionTokenRef.current = uuidv4()
  }, [])

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false
    // Delay to allow tap on suggestion to register
    setTimeout(() => setShowDropdown(false), 200)
  }, [])

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    if (!getIsOnline()) return

    setLoading(true)
    const results = await fetchAutocompleteSuggestions(
      text,
      sessionTokenRef.current
    )
    setSuggestions(results)
    setShowDropdown(results.length > 0)
    setLoading(false)
  }, [])

  const handleChangeText = useCallback(
    (text: string) => {
      setInputValue(text)
      lastTypedValueRef.current = text
      onChangeText(text)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => fetchSuggestions(text), 300)
    },
    [onChangeText, fetchSuggestions]
  )

  const handleSelect = useCallback(
    async (prediction: PlacePrediction) => {
      setShowDropdown(false)
      setSuggestions([])
      setLoading(true)

      const details = await fetchPlaceDetails(
        prediction.place_id,
        sessionTokenRef.current
      )

      // Reset session token after selection (billing session complete)
      sessionTokenRef.current = uuidv4()
      setLoading(false)

      if (details) {
        const formatted = [
          details.street,
          details.city,
          details.state,
          details.zip
        ]
          .filter(Boolean)
          .join(', ')
        setInputValue(formatted)
        lastTypedValueRef.current = ''
        onAddressSelected(details)
      } else {
        // Fallback: use the description as plain text
        setInputValue(prediction.description)
        lastTypedValueRef.current = prediction.description
        onChangeText(prediction.description)
      }
    },
    [onAddressSelected, onChangeText]
  )

  const dropdownContent = showDropdown && suggestions.length > 0 && (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          overflow: 'hidden',
          elevation: 24
        },
        !inline &&
          dropdownPosition === 'right' && {
            width: 280,
            position: 'absolute',
            top: 0,
            left: '100%',
            marginLeft: 8,
            zIndex: 999
          },
        !inline &&
          dropdownPosition === 'top' && {
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 4,
            zIndex: 999
          },
        !inline &&
          dropdownPosition === 'below' && {
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 999
          }
      ]}
    >
      {suggestions.slice(0, 3).map((item, index) => (
        <TouchableOpacity
          key={item.place_id}
          onPress={() => handleSelect(item)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: s(12),
            paddingVertical: s(10),
            gap: s(10),
            borderTopWidth: index > 0 ? 1 : 0,
            borderColor: colors.border
          }}
        >
          <MapPin size={s(14)} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.heading, fontSize: s(12), fontWeight: '600' }}
              numberOfLines={1}
            >
              {item.structured_formatting.main_text}
            </Text>
            <Text
              style={{ color: colors.muted, fontSize: s(11), marginTop: 1 }}
              numberOfLines={1}
            >
              {item.structured_formatting.secondary_text}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
      <View
        style={{
          paddingHorizontal: s(12),
          paddingVertical: s(6),
          borderTopWidth: 1,
          borderColor: colors.border
        }}
      >
        <Text style={{ color: colors.muted, fontSize: s(9), textAlign: 'right' }}>
          Powered by Google
        </Text>
      </View>
    </View>
  )

  return (
    <View
      style={
        inline
          ? undefined
          : { zIndex: 999, elevation: 24, position: 'relative' }
      }
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(8),
            minHeight: s(44),
            paddingHorizontal: s(12),
            paddingVertical: s(7)
          },
          inputStyle
        ]}
      >
        <TextInput
          value={inputValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.heading}
          multiline
          numberOfLines={2}
          scrollEnabled={false}
          style={{
            flex: 1,
            color: colors.heading,
            fontSize: s(13),
            padding: 0,
            includeFontPadding: false,
            lineHeight: s(17),
            maxHeight: s(54),
            textAlignVertical: inputValue ? 'top' : 'center'
          }}
        />
        {loading && (
          <ActivityIndicator
            size='small'
            color={colors.teal}
            style={{ marginLeft: 6 }}
          />
        )}
      </View>
      {dropdownContent}
    </View>
  )
}
