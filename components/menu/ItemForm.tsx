import AddIngredientModal from '@/components/inventory/AddIngredientModal'
import RecipeIngredientSheet from '@/components/inventory/RecipeIngredientSheet'
import { ItemModifierStockSection } from '@/components/menu/ItemModifierStockSection'
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'
import { useToast } from '@/contexts/ToastContext'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import {
  DEFAULT_MENU_ITEM_PLACEHOLDER_ICON,
  encodeMenuItemPlaceholderIconKey,
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  MENU_ITEM_PLACEHOLDER_ICON_OPTIONS,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { MENU_IMAGE_MAP } from '@/lib/mockData'
import { bottomSheetTheme, colors } from '@/lib/theme'
import { MenuItemType, RecipeItem } from '@/lib/types'
import { useUiScale } from '@/lib/uiScale'
import { useInventoryStore } from '@/stores/useInventoryStore'
import { useMenuStore } from '@/stores/useMenuStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList
} from '@gorhom/bottom-sheet'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator
} from 'react-native-draggable-flatlist'

export interface MenuItemFormData {
  name: string
  description: string
  price: string
  cashPrice: string
  categories: string[]
  meal: MenuItemType['meal']
  image: string
  imageBase64?: string
  placeholderIcon: MenuItemPlaceholderIconKey
  availability: boolean
  modifiers: string[]
  recipe: RecipeItem[]
}

interface ItemFormProps {
  initialData?: MenuItemType
  onSubmit: (data: Omit<MenuItemType, 'id'>) => Promise<boolean>
  isSaving: boolean
  title: string
  submitButtonLabel: string
  onDelete?: () => void
}

const MEAL_OPTIONS: MenuItemType['meal'][number][] = [
  'Lunch',
  'Dinner',
  'Brunch',
  'Specials'
]

const ItemForm: React.FC<ItemFormProps> = ({
  initialData,
  onSubmit,
  isSaving,
  title,
  submitButtonLabel,
  onDelete
}) => {
  const categories = useMenuStore(s => s.categories)
  const modifierGroups = useMenuStore(s => s.modifierGroups)
  const { show } = useToast()
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const selectedStoreForPricing = useStoreSettingsStore(s => s.selectedStore)
  const pricingStrategy = selectedStoreForPricing?.pricing_strategy
  const dualPricingPercentage = selectedStoreForPricing?.dual_pricing_percentage
  const isDualPricing =
    pricingStrategy === 'dual' &&
    typeof dualPricingPercentage === 'number' &&
    dualPricingPercentage > 0

  const [formData, setFormData] = useState<MenuItemFormData>({
    name: '',
    description: '',
    price: '',
    cashPrice: '',
    categories: [],
    meal: ['Lunch'],
    image: '',
    imageBase64: undefined,
    placeholderIcon: DEFAULT_MENU_ITEM_PLACEHOLDER_ICON,
    availability: true,
    modifiers: [],
    recipe: []
  })

  const [errors, setErrors] = useState<Partial<MenuItemFormData>>({})
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const hasSavedRef = useRef(false)
  const [initialFormData, setInitialFormData] =
    useState<MenuItemFormData | null>(null)

  const [isRecipeModalOpen, setRecipeModalOpen] = useState(false)
  const recipeSheetRef = React.useRef<any>(null)
  const [editingRecipeItemIndex, setEditingRecipeItemIndex] = useState<
    number | null
  >(null)
  const inventorySelectionSheetRef = React.useRef<BottomSheet>(null)
  const inventorySnapPoints = useMemo(() => ['70%'], [])
  const [inventorySearchQuery, setInventorySearchQuery] = useState('')
  const { inventoryItems } = useInventoryStore()

  const [recipeQuantities, setRecipeQuantities] = useState<
    Record<string, string>
  >({})
  const [modifierSearch, setModifierSearch] = useState('')
  const [expandedModifiers, setExpandedModifiers] = useState<
    Record<string, boolean>
  >({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  )

  useEffect(() => {
    Keyboard.dismiss()
  }, [])

  useEffect(() => {
    if (initialData) {
      let cashPriceStr = initialData.cashPrice?.toString() || ''
      if (
        isDualPricing &&
        dualPricingPercentage &&
        !cashPriceStr &&
        initialData.price > 0
      ) {
        const derivedCash =
          initialData.price / (1 + dualPricingPercentage / 100)
        cashPriceStr = derivedCash.toFixed(2)
      }
      const data: MenuItemFormData = {
        name: initialData.name,
        description: initialData.description || '',
        price: initialData.price.toString(),
        cashPrice: cashPriceStr,
        categories: Array.isArray(initialData.category)
          ? initialData.category
          : [initialData.category],
        meal: initialData.meal || ['Lunch'],
        image: initialData.image || '',
        imageBase64: undefined,
        placeholderIcon:
          (initialData.placeholderIcon as
            | MenuItemPlaceholderIconKey
            | undefined) ||
          extractMenuItemPlaceholderIconKey(initialData.cardBgColor) ||
          DEFAULT_MENU_ITEM_PLACEHOLDER_ICON,
        availability: initialData.availability !== false,
        modifiers: initialData.modifierGroupIds || [],
        recipe: initialData.recipe || []
      }
      setFormData(data)
      setInitialFormData(data)
    } else {
      setInitialFormData({
        name: '',
        description: '',
        price: '',
        cashPrice: '',
        categories: [],
        meal: ['Lunch'],
        image: '',
        imageBase64: undefined,
        placeholderIcon: DEFAULT_MENU_ITEM_PLACEHOLDER_ICON,
        availability: true,
        modifiers: [],
        recipe: []
      })
    }
  }, [initialData, isDualPricing, dualPricingPercentage])

  useEffect(() => {
    if (initialFormData) {
      setHasChanges(
        JSON.stringify(formData) !== JSON.stringify(initialFormData)
      )
    }
  }, [formData, initialFormData])

  const validateForm = (): boolean => {
    const newErrors: Partial<MenuItemFormData> = {}
    if (!formData.name.trim()) newErrors.name = 'Name is required'
    if (!formData.price.trim()) {
      newErrors.price = 'Price is required'
    } else if (
      isNaN(parseFloat(formData.price)) ||
      parseFloat(formData.price) < 0
    ) {
      newErrors.price = 'Price must be a valid positive number'
    }
    if (isDualPricing && !formData.cashPrice.trim()) {
      newErrors.cashPrice = 'Cash price is required for dual pricing'
    } else if (
      formData.cashPrice &&
      (isNaN(parseFloat(formData.cashPrice)) ||
        parseFloat(formData.cashPrice) < 0)
    ) {
      newErrors.cashPrice = 'Cash price must be a valid positive number'
    }
    if (formData.categories.length === 0) {
      ;(newErrors as any).categories = 'Please select at least one category'
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      show({
        title: 'Validation Error',
        message: 'Please correct the highlighted fields before saving.',
        type: 'error'
      })
    }
    return Object.keys(newErrors).length === 0
  }

  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permissionResult.granted === false) {
      Alert.alert(
        'Permission Required',
        'Permission to access camera roll is required!'
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setFormData(prev => ({
        ...prev,
        imageBase64: asset.base64 || undefined,
        image: asset.base64 ? '' : asset.uri
      }))
    }
  }

  const removeImage = () => {
    setFormData(prev => ({ ...prev, image: '', imageBase64: undefined }))
  }

  const getImageSource = (): any => {
    if (formData.imageBase64)
      return { uri: `data:image/jpeg;base64,${formData.imageBase64}` }
    if (formData.image) {
      if (MENU_IMAGE_MAP[formData.image as keyof typeof MENU_IMAGE_MAP]) {
        return MENU_IMAGE_MAP[formData.image as keyof typeof MENU_IMAGE_MAP]
      }
      return { uri: formData.image }
    }
    return undefined
  }

  const SelectedPlaceholderIcon = useMemo(
    () => getMenuItemPlaceholderIcon(formData.placeholderIcon),
    [formData.placeholderIcon]
  )

  const handleSave = () => {
    if (!validateForm()) return
    setShowConfirmation(true)
  }

  const confirmSave = async () => {
    setShowConfirmation(false)
    const payload: Omit<MenuItemType, 'id'> = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      price: parseFloat(formData.price),
      cashPrice: formData.cashPrice
        ? parseFloat(formData.cashPrice)
        : undefined,
      category: formData.categories,
      meal: formData.meal,
      image: formData.imageBase64 || formData.image || undefined,
      placeholderIcon: formData.placeholderIcon,
      cardBgColor: encodeMenuItemPlaceholderIconKey(formData.placeholderIcon),
      availability: formData.availability,
      modifierGroupIds:
        formData.modifiers.length > 0 ? formData.modifiers : undefined,
      recipe: formData.recipe
    }
    const success = await onSubmit(payload)
    if (success) {
      hasSavedRef.current = true
      setHasChanges(false)
      if (router.canGoBack()) router.back()
    }
  }

  const toggleCategory = (categoryName: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryName)
        ? prev.categories.filter(c => c !== categoryName)
        : [...prev.categories, categoryName]
    }))
  }

  const toggleMeal = (meal: MenuItemType['meal'][number]) => {
    setFormData(prev => ({
      ...prev,
      meal: prev.meal.includes(meal)
        ? prev.meal.filter(m => m !== meal)
        : [...prev.meal, meal]
    }))
  }

  const toggleModifier = (modifierId: string) => {
    setFormData(prev => ({
      ...prev,
      modifiers: prev.modifiers.includes(modifierId)
        ? prev.modifiers.filter(m => m !== modifierId)
        : [...prev.modifiers, modifierId]
    }))
  }

  const toggleModifierExpand = (modifierId: string) => {
    setExpandedModifiers(prev => ({ ...prev, [modifierId]: !prev[modifierId] }))
  }

  const openInventorySelection = () => {
    setInventorySearchQuery('')
    inventorySelectionSheetRef.current?.expand()
  }

  const selectInventoryItem = (inventoryItemId: string) => {
    if (editingRecipeItemIndex !== null) {
      const oldItem = formData.recipe[editingRecipeItemIndex]
      setFormData(prev => ({
        ...prev,
        recipe: prev.recipe.map((item, index) =>
          index === editingRecipeItemIndex ? { ...item, inventoryItemId } : item
        )
      }))
      setRecipeQuantities(prev => {
        const next = { ...prev }
        if (next[oldItem.inventoryItemId]) {
          next[inventoryItemId] = next[oldItem.inventoryItemId]
          delete next[oldItem.inventoryItemId]
        }
        return next
      })
      setEditingRecipeItemIndex(null)
    } else {
      setFormData(prev => ({
        ...prev,
        recipe: [...prev.recipe, { inventoryItemId, quantity: 1 }]
      }))
    }
    inventorySelectionSheetRef.current?.close()
  }

  const updateRecipeItemQuantity = (index: number, quantity: string) => {
    const item = formData.recipe[index]
    setRecipeQuantities(prev => ({ ...prev, [item.inventoryItemId]: quantity }))
    setFormData(prev => ({
      ...prev,
      recipe: prev.recipe.map((item, i) =>
        i === index ? { ...item, quantity: parseFloat(quantity) || 0 } : item
      )
    }))
  }

  const removeRecipeItem = (index: number) => {
    const itemToRemove = formData.recipe[index]
    setRecipeQuantities(prev => {
      const next = { ...prev }
      delete next[itemToRemove.inventoryItemId]
      return next
    })
    setFormData(prev => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index)
    }))
  }

  const filteredInventoryItems = useMemo(() => {
    if (!inventorySearchQuery.trim()) return inventoryItems
    const query = inventorySearchQuery.toLowerCase()
    return inventoryItems.filter(
      item =>
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
    )
  }, [inventorySearchQuery, inventoryItems])

  const groupedInventoryItems = useMemo(() => {
    const map: Record<string, typeof inventoryItems> = {}
    for (const item of filteredInventoryItems) {
      const first = (item.name || '?')[0].toUpperCase()
      const key = /[A-Z]/.test(first) ? first : '#'
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    const letters = Object.keys(map).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
    return letters.map(letter => ({ title: letter, data: map[letter] }))
  }, [filteredInventoryItems])

  const filteredModifierGroups = useMemo(() => {
    const query = modifierSearch.toLowerCase()
    const matchingGroups = !modifierSearch.trim()
      ? modifierGroups
      : modifierGroups.filter(
          m =>
            m.name.toLowerCase().includes(query) ||
            (m.description || '').toLowerCase().includes(query)
        )

    return [...matchingGroups].sort((a, b) => {
      const orderDiff =
        (a.displayOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
      if (orderDiff !== 0) return orderDiff
      return a.name.localeCompare(b.name)
    })
  }, [modifierSearch, modifierGroups])

  const selectedModifierGroups = useMemo(
    () =>
      formData.modifiers
        .map(modifierId => modifierGroups.find(m => m.id === modifierId))
        .filter((modifier): modifier is (typeof modifierGroups)[number] =>
          Boolean(modifier)
        ),
    [formData.modifiers, modifierGroups]
  )

  const getInventoryItemName = (id: string) =>
    inventoryItems.find(i => i.id === id)?.name || 'Unknown Item'
  const getInventoryItemUnit = (id: string) =>
    inventoryItems.find(i => i.id === id)?.unit || ''

  const handleAddIngredient = (ingredient: RecipeItem) => {
    if (
      !formData.recipe.some(
        item => item.inventoryItemId === ingredient.inventoryItemId
      )
    ) {
      setFormData(prev => ({ ...prev, recipe: [...prev.recipe, ingredient] }))
    } else {
      Alert.alert('Duplicate Item', 'This ingredient is already in the recipe.')
    }
  }

  const renderInventoryBackdrop = useMemo(
    () => (backdropProps: any) =>
      (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
    []
  )

  const selectedStore = selectedStoreForPricing
  const currentLocationId = selectedStore?.id

  const handleCashPriceChange = (text: string) => {
    setFormData(prev => {
      const updated = { ...prev, cashPrice: text }
      if (isDualPricing && text) {
        const cashVal = parseFloat(text)
        if (!isNaN(cashVal) && cashVal >= 0) {
          updated.price = (
            cashVal *
            (1 + dualPricingPercentage! / 100)
          ).toFixed(2)
        }
      }
      return updated
    })
  }

  const handleCardPriceChange = (text: string) => {
    setFormData(prev => ({ ...prev, price: text }))
  }

  const availableCategories = categories
    .filter(cat => cat.isActive && cat.location_id === currentLocationId)
    .sort((a, b) => a.order - b.order)

  // Section label style
  const sectionLabel = {
    fontSize: s(10),
    fontWeight: '600' as const,
    color: colors.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: s(8)
  }
  const card = {
    backgroundColor: colors.card,
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: colors.border,
    padding: s(12),
    marginBottom: s(12)
  }
  const inputStyle = {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(8),
    paddingHorizontal: s(10),
    paddingVertical: s(8),
    fontSize: s(13),
    color: colors.heading
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: s(16),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel
        }}
      >
        <Text
          style={{ fontSize: s(15), fontWeight: '700', color: colors.heading }}
        >
          {title}
        </Text>

        <View style={{ flexDirection: 'row', gap: s(10), alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              paddingHorizontal: s(12),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
          {initialData && onDelete && (
            <TouchableOpacity
              onPress={() => setShowDeleteDialog(true)}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                borderRadius: s(8),
                backgroundColor: colors.danger + '15',
                borderWidth: 1,
                borderColor: colors.danger + '30'
              }}
            >
              <Trash2 size={s(14)} color={colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(6),
              paddingHorizontal: s(14),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.teal,
              opacity: isSaving ? 0.7 : 1
            }}
          >
            {isSaving ? (
              <ActivityIndicator size='small' color={colors.onSolid} />
            ) : (
              <Check size={s(14)} color={colors.onSolid} />
            )}
            <Text
              style={{ fontSize: s(12), fontWeight: '600', color: colors.onSolid }}
            >
              {isSaving ? 'Saving...' : submitButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, flexDirection: 'row' }}
      >
        {/* Left: Form */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: s(14) }}
          showsVerticalScrollIndicator={false}
        >
          {/* Basic Info */}
          <View style={card}>
            <Text style={sectionLabel}>Basic Information</Text>

            {/* Name */}
            <View style={{ marginBottom: s(10) }}>
              <Text
                style={{ fontSize: s(11), color: colors.label, marginBottom: s(4) }}
              >
                Name *
              </Text>
              <TextInput
                autoFocus={false}
                style={[
                  inputStyle,
                  errors.name ? { borderColor: colors.danger } : {}
                ]}
                placeholder='Enter item name'
                placeholderTextColor={colors.muted}
                value={formData.name}
                onChangeText={text =>
                  setFormData(prev => ({ ...prev, name: text }))
                }
              />
              {errors.name && (
                <Text
                  style={{ fontSize: s(11), color: colors.danger, marginTop: s(3) }}
                >
                  {errors.name}
                </Text>
              )}
            </View>

            {/* Description */}
            <View style={{ marginBottom: s(10) }}>
              <Text
                style={{ fontSize: s(11), color: colors.label, marginBottom: s(4) }}
              >
                Description
              </Text>
              <TextInput
                style={[inputStyle, { height: s(70), textAlignVertical: 'top' }]}
                placeholder='Enter item description'
                placeholderTextColor={colors.muted}
                value={formData.description}
                onChangeText={text =>
                  setFormData(prev => ({ ...prev, description: text }))
                }
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Image */}
            <View>
              <Text
                style={{ fontSize: s(11), color: colors.label, marginBottom: s(6) }}
              >
                Image
              </Text>
              {getImageSource() && (
                <View
                  style={{
                    marginBottom: s(8),
                    borderRadius: s(8),
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  <Image
                    source={getImageSource()}
                    style={{ width: '100%', height: s(120), borderRadius: s(8) }}
                    resizeMode='cover'
                  />
                  <TouchableOpacity
                    onPress={removeImage}
                    style={{
                      position: 'absolute',
                      top: s(6),
                      right: s(6),
                      backgroundColor: colors.danger,
                      borderRadius: s(20),
                      padding: s(4)
                    }}
                  >
                    <X size={s(12)} color='#fff' />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                onPress={pickImage}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: s(6),
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(8),
                  paddingVertical: s(8)
                }}
              >
                <Camera size={s(14)} color={colors.muted} />
                <Text style={{ fontSize: s(12), color: colors.label }}>
                  {getImageSource() ? 'Change Image' : 'Pick Image'}
                </Text>
              </TouchableOpacity>

              {!getImageSource() && (
                <View style={{ marginTop: s(10) }}>
                  <Text
                    style={{
                      fontSize: s(11),
                      color: colors.label,
                      marginBottom: s(6)
                    }}
                  >
                    Placeholder Icon
                  </Text>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}
                  >
                    {MENU_ITEM_PLACEHOLDER_ICON_OPTIONS.map(option => {
                      const isSelected = formData.placeholderIcon === option.key
                      const Icon = getMenuItemPlaceholderIcon(option.key)
                      return (
                        <TouchableOpacity
                          key={option.key}
                          onPress={() =>
                            setFormData(prev => ({
                              ...prev,
                              placeholderIcon: option.key
                            }))
                          }
                          style={{
                            width: s(68),
                            borderRadius: s(8),
                            borderWidth: 1,
                            borderColor: isSelected
                              ? colors.teal
                              : colors.border,
                            backgroundColor: isSelected
                              ? `${colors.teal}18`
                              : colors.screen,
                            alignItems: 'center',
                            paddingVertical: s(8),
                            gap: s(4)
                          }}
                        >
                          <Icon
                            size={s(18)}
                            color={isSelected ? colors.teal : colors.muted}
                            strokeWidth={2}
                          />
                          <Text
                            style={{
                              fontSize: s(10),
                              fontWeight: '600',
                              color: isSelected ? colors.teal : colors.label
                            }}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Pricing */}
          <View style={card}>
            <Text style={sectionLabel}>Pricing</Text>

            {isDualPricing && (
              <View
                style={{
                  backgroundColor: colors.teal + '12',
                  borderWidth: 1,
                  borderColor: colors.teal + '40',
                  borderRadius: s(8),
                  padding: s(8),
                  marginBottom: s(10)
                }}
              >
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.teal,
                    fontWeight: '600'
                  }}
                >
                  Dual Pricing Active ({dualPricingPercentage}%)
                </Text>
                <Text
                  style={{
                    fontSize: s(11),
                    color: colors.teal + 'aa',
                    marginTop: s(2)
                  }}
                >
                  Edit Cash Price — Card Price is automatically{' '}
                  {dualPricingPercentage}% higher
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: s(10) }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: s(11), color: colors.label, marginBottom: s(4) }}
                >
                  {isDualPricing ? 'Cash Price *' : 'Cash Price (Optional)'}
                </Text>
                <View
                  style={[
                    inputStyle,
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 0,
                      height: s(38)
                    },
                    errors.cashPrice ? { borderColor: colors.danger } : {}
                  ]}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      color: colors.muted,
                      marginRight: s(4)
                    }}
                  >
                    $
                  </Text>
                  <TextInput
                    style={{ flex: 1, fontSize: s(13), color: colors.heading }}
                    placeholder='0.00'
                    placeholderTextColor={colors.muted}
                    value={formData.cashPrice}
                    onChangeText={handleCashPriceChange}
                    keyboardType='numeric'
                  />
                </View>
                {errors.cashPrice && (
                  <Text
                    style={{ fontSize: s(11), color: colors.danger, marginTop: s(3) }}
                  >
                    {errors.cashPrice}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: s(11), color: colors.label, marginBottom: s(4) }}
                >
                  {isDualPricing ? 'Card Price (Auto)' : 'Price *'}
                </Text>
                <View
                  style={[
                    inputStyle,
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 0,
                      height: s(38),
                      opacity: isDualPricing ? 0.6 : 1
                    },
                    errors.price ? { borderColor: colors.danger } : {}
                  ]}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      color: colors.muted,
                      marginRight: s(4)
                    }}
                  >
                    $
                  </Text>
                  <TextInput
                    style={{ flex: 1, fontSize: s(13), color: colors.heading }}
                    placeholder='0.00'
                    placeholderTextColor={colors.muted}
                    value={formData.price}
                    onChangeText={handleCardPriceChange}
                    keyboardType='numeric'
                    editable={!isDualPricing}
                  />
                </View>
                {errors.price && (
                  <Text
                    style={{ fontSize: s(11), color: colors.danger, marginTop: s(3) }}
                  >
                    {errors.price}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Availability Toggle */}
          <View style={card}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Text style={sectionLabel}>Availability</Text>
              <TouchableOpacity
                onPress={() =>
                  setFormData(prev => ({
                    ...prev,
                    availability: !prev.availability
                  }))
                }
                style={{
                  width: s(44),
                  height: s(24),
                  borderRadius: s(12),
                  backgroundColor: formData.availability
                    ? colors.teal
                    : colors.card,
                  borderWidth: 1,
                  borderColor: formData.availability
                    ? colors.teal
                    : colors.border,
                  justifyContent: 'center',
                  paddingHorizontal: s(2)
                }}
              >
                <View
                  style={{
                    width: s(20),
                    height: s(20),
                    borderRadius: s(10),
                    backgroundColor: colors.onSolid,
                    alignSelf: formData.availability ? 'flex-end' : 'flex-start'
                  }}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Meal Types */}
          <View style={card}>
            <Text style={sectionLabel}>Available For</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}>
              {MEAL_OPTIONS.map(meal => {
                const selected = formData.meal.includes(meal)
                return (
                  <TouchableOpacity
                    key={meal}
                    onPress={() => toggleMeal(meal)}
                    style={{
                      paddingHorizontal: s(10),
                      paddingVertical: s(5),
                      borderRadius: s(20),
                      borderWidth: 1,
                      backgroundColor: selected
                        ? colors.teal + '20'
                        : colors.screen,
                      borderColor: selected ? colors.teal + '60' : colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        color: selected ? colors.teal : colors.label,
                        fontWeight: selected ? '600' : '400'
                      }}
                    >
                      {meal}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Categories */}
          <View style={card}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: s(10)
              }}
            >
              <Text style={sectionLabel}>Categories</Text>
              <TouchableOpacity
                onPress={() => router.push('/menu/add-category')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(4),
                  paddingHorizontal: s(8),
                  paddingVertical: s(4),
                  borderRadius: s(6),
                  backgroundColor: colors.teal + '15',
                  borderWidth: 1,
                  borderColor: colors.teal + '40'
                }}
              >
                <Plus size={11} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.teal,
                    fontWeight: '600'
                  }}
                >
                  New
                </Text>
              </TouchableOpacity>
            </View>

            {availableCategories.length === 0 ? (
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}
                >
                  No categories yet
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/menu/add-category')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50'
                  }}
                >
                  <Plus size={12} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.teal,
                      fontWeight: '600'
                    }}
                  >
                    Create Category
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {availableCategories.map(category => {
                  const selected = formData.categories.includes(category.name)
                  return (
                    <TouchableOpacity
                      key={category.id}
                      onPress={() => toggleCategory(category.name)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                        borderWidth: 1,
                        backgroundColor: selected
                          ? colors.teal + '20'
                          : colors.screen,
                        borderColor: selected
                          ? colors.teal + '60'
                          : colors.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {selected && <Check size={10} color={colors.teal} />}
                      <Text
                        style={{
                          fontSize: 12,
                          color: selected ? colors.teal : colors.label,
                          fontWeight: selected ? '600' : '400'
                        }}
                      >
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
            {(errors as any).categories && (
              <Text
                style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}
              >
                {(errors as any).categories}
              </Text>
            )}
          </View>

          {/* Modifier Groups */}
          <View style={card}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10
              }}
            >
              <Text style={sectionLabel}>Modifier Groups</Text>
              <View
                style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    gap: 4
                  }}
                >
                  <Search size={11} color={colors.muted} />
                  <TextInput
                    value={modifierSearch}
                    onChangeText={setModifierSearch}
                    placeholder='Search...'
                    placeholderTextColor={colors.muted}
                    style={{
                      fontSize: 12,
                      color: colors.heading,
                      width: 80,
                      paddingVertical: 2
                    }}
                  />
                  {modifierSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setModifierSearch('')}>
                      <X size={11} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/menu/add-modifier')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: colors.teal + '15',
                    borderWidth: 1,
                    borderColor: colors.teal + '40'
                  }}
                >
                  <Plus size={11} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.teal,
                      fontWeight: '600'
                    }}
                  >
                    New
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              {filteredModifierGroups.map(modifier => {
                const selected = formData.modifiers.includes(modifier.id)
                const expanded = !!expandedModifiers[modifier.id]
                const isRequired = modifier.type === 'required'
                return (
                  <View
                    key={modifier.id}
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: selected
                        ? colors.teal + '50'
                        : colors.border,
                      backgroundColor: selected
                        ? colors.teal + '08'
                        : colors.screen,
                      overflow: 'hidden'
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 10,
                        gap: 8
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => toggleModifier(modifier.id)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8
                        }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 1.5,
                            borderColor: selected ? colors.teal : colors.border,
                            backgroundColor: selected
                              ? colors.teal
                              : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {selected && <Check size={10} color='#fff' />}
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: colors.heading,
                            flex: 1
                          }}
                          numberOfLines={1}
                        >
                          {modifier.name}
                        </Text>
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 20,
                            backgroundColor: isRequired
                              ? colors.danger + '15'
                              : colors.teal + '15',
                            borderWidth: 1,
                            borderColor: isRequired
                              ? colors.danger + '40'
                              : colors.teal + '40'
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: isRequired ? colors.danger : colors.teal
                            }}
                          >
                            {isRequired ? 'Required' : 'Optional'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleModifierExpand(modifier.id)}
                        style={{ padding: 4 }}
                      >
                        {expanded ? (
                          <ChevronUp size={14} color={colors.muted} />
                        ) : (
                          <ChevronDown size={14} color={colors.muted} />
                        )}
                      </TouchableOpacity>
                    </View>

                    {expanded && (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingBottom: 10,
                          gap: 4
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: colors.muted,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginBottom: 4
                          }}
                        >
                          Options
                        </Text>
                        {modifier.options.map((option: any) => (
                          <View
                            key={option.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: colors.card,
                              borderWidth: 1,
                              borderColor: colors.border,
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 5
                            }}
                          >
                            <Text style={{ fontSize: 11, color: colors.label }}>
                              {option.name}
                              {option.isDefault ? (
                                <Text style={{ color: colors.muted }}>
                                  {' '}
                                  (Default)
                                </Text>
                              ) : (
                                ''
                              )}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color:
                                  option.price > 0
                                    ? colors.success
                                    : colors.muted
                              }}
                            >
                              {option.price > 0
                                ? `+$${option.price.toFixed(2)}`
                                : '$0.00'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>

            {selectedModifierGroups.length > 0 && (
              <View style={{ marginTop: 10, gap: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}
                  >
                    Assigned Order
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    Drag selected groups
                  </Text>
                </View>
                <DraggableFlatList
                  data={selectedModifierGroups}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  activationDistance={10}
                  onDragEnd={({ data }) =>
                    setFormData(prev => ({
                      ...prev,
                      modifiers: data.map(modifier => modifier.id)
                    }))
                  }
                  renderItem={({
                    item,
                    drag,
                    isActive,
                    getIndex
                  }: RenderItemParams<(typeof selectedModifierGroups)[number]>) => (
                    <ScaleDecorator>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          backgroundColor: isActive
                            ? colors.teal + '10'
                            : colors.card,
                          borderWidth: 1,
                          borderColor: isActive
                            ? colors.teal + '45'
                            : colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 9
                        }}
                      >
                        <TouchableOpacity
                          onLongPress={drag}
                          delayLongPress={120}
                          style={{
                            padding: 4,
                            borderRadius: 6,
                            backgroundColor: colors.panel
                          }}
                        >
                          <GripVertical size={14} color={colors.muted} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '600',
                              color: colors.heading
                            }}
                          >
                            {(getIndex() ?? 0) + 1}. {item.name}
                          </Text>
                          <Text
                            style={{ fontSize: 10, color: colors.muted }}
                          >
                            {item.type === 'required' ? 'Required' : 'Optional'}
                            {' • '}
                            {item.selectionType === 'single'
                              ? 'Single choice'
                              : 'Multiple choice'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => toggleModifier(item.id)}
                          style={{
                            padding: 5,
                            borderRadius: 6,
                            backgroundColor: colors.danger + '12'
                          }}
                        >
                          <X size={12} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </ScaleDecorator>
                  )}
                />
              </View>
            )}

            {/* Per-location 86 for this item's modifier options. Single-location
                merchants edit via this full form (not the price sheet), so the
                modifier out-of-stock controls must live here too. */}
            <ItemModifierStockSection groups={selectedModifierGroups} />
          </View>

          {/* Recipe */}
          <View style={card}>
            <Text style={sectionLabel}>Recipe / Components</Text>

            {formData.recipe.length === 0 ? (
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderRadius: 8,
                  padding: 16,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    marginBottom: 10
                  }}
                >
                  No recipe items defined
                </Text>
                <TouchableOpacity
                  onPress={openInventorySelection}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1,
                    borderColor: colors.teal + '50'
                  }}
                >
                  <Plus size={12} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.teal,
                      fontWeight: '600'
                    }}
                  >
                    Add Recipe Item
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                {formData.recipe.map((recipeItem, index) => (
                  <View
                    key={index}
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        setEditingRecipeItemIndex(index)
                        openInventorySelection()
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.heading
                        }}
                      >
                        {getInventoryItemName(recipeItem.inventoryItemId)}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.muted }}>
                        {getInventoryItemUnit(recipeItem.inventoryItemId)} · tap
                        to change
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      value={
                        recipeQuantities[recipeItem.inventoryItemId] ??
                        recipeItem.quantity.toString()
                      }
                      onChangeText={text =>
                        updateRecipeItemQuantity(index, text)
                      }
                      keyboardType='numeric'
                      style={{
                        width: 60,
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 6,
                        padding: 5,
                        fontSize: 12,
                        color: colors.heading,
                        textAlign: 'center'
                      }}
                      placeholder='0'
                      placeholderTextColor={colors.muted}
                    />
                    <TouchableOpacity
                      onPress={() => removeRecipeItem(index)}
                      style={{
                        padding: 5,
                        backgroundColor: colors.danger + '15',
                        borderRadius: 6
                      }}
                    >
                      <X size={12} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={openInventorySelection}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingVertical: 8
                  }}
                >
                  <Plus size={13} color={colors.muted} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Add Recipe Item
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Right: Preview */}
        <View
          style={{
            width: 300,
            borderLeftWidth: 1,
            borderLeftColor: colors.border,
            backgroundColor: colors.card,
            padding: 16
          }}
        >
          <Text style={[sectionLabel, { marginBottom: 12 }]}>Preview</Text>

          {/* Item card preview */}
          <View
            style={{
              backgroundColor: colors.screen,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
              marginBottom: 12
            }}
          >
            <View
              style={{
                width: '100%',
                aspectRatio: 1,
                backgroundColor: colors.panel,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {getImageSource() ? (
                <Image
                  source={getImageSource()}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode='cover'
                />
              ) : (
                <SelectedPlaceholderIcon
                  size={30}
                  color={colors.muted}
                  strokeWidth={2}
                />
              )}
            </View>
            <View style={{ padding: 10 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading,
                  marginBottom: 2
                }}
                numberOfLines={1}
              >
                {formData.name || 'Item Name'}
              </Text>
              <Text
                style={{ fontSize: 14, fontWeight: '800', color: colors.teal }}
              >
                $
                {formData.price
                  ? parseFloat(formData.price).toFixed(2)
                  : '0.00'}
              </Text>
              {formData.cashPrice && (
                <Text
                  style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}
                >
                  Cash: ${parseFloat(formData.cashPrice).toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Meta */}
          <View style={{ gap: 8 }}>
            <View
              style={{
                backgroundColor: colors.screen,
                borderRadius: 8,
                padding: 8
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: colors.muted,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 5
                }}
              >
                Categories
              </Text>
              {formData.categories.length > 0 ? (
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
                >
                  {formData.categories.map((cat, i) => (
                    <View
                      key={i}
                      style={{
                        backgroundColor: colors.teal + '15',
                        borderWidth: 1,
                        borderColor: colors.teal + '40',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 20
                      }}
                    >
                      <Text style={{ fontSize: 10, color: colors.teal }}>
                        {cat}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  None selected
                </Text>
              )}
            </View>

            <View
              style={{
                backgroundColor: colors.screen,
                borderRadius: 8,
                padding: 8
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: colors.muted,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 5
                }}
              >
                Meal Times
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {formData.meal.map((m, i) => (
                  <View
                    key={i}
                    style={{
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 20
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.teal }}>
                      {m}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                backgroundColor: colors.screen,
                borderRadius: 8,
                padding: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: colors.muted,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Status
              </Text>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor: formData.availability
                    ? colors.teal + '20'
                    : colors.danger + '15',
                  borderWidth: 1,
                  borderColor: formData.availability
                    ? colors.teal + '50'
                    : colors.danger + '40'
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: formData.availability ? colors.teal : colors.danger
                  }}
                >
                  {formData.availability ? 'Available' : 'Unavailable'}
                </Text>
              </View>
            </View>

            {formData.modifiers.length > 0 && (
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderRadius: 8,
                  padding: 8
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 5
                  }}
                >
                  Modifiers
                </Text>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
                >
                  {formData.modifiers.map(id => {
                    const mod = modifierGroups.find(m => m.id === id)
                    return (
                      <View
                        key={id}
                        style={{
                          backgroundColor: colors.teal + '15',
                          borderWidth: 1,
                          borderColor: colors.teal + '40',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 20
                        }}
                      >
                        <Text style={{ fontSize: 10, color: colors.teal }}>
                          {mod?.name}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )}

            {formData.description.trim() !== '' && (
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderRadius: 8,
                  padding: 8
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4
                  }}
                >
                  Description
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.label }}
                  numberOfLines={4}
                >
                  {formData.description}
                </Text>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Confirm Modal */}
      <Modal
        visible={showConfirmation}
        transparent
        animationType='fade'
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 20,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 10
            }}
          >
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  backgroundColor: colors.teal + '20',
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14
                }}
              >
                <Save size={26} color={colors.teal} strokeWidth={2} />
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: colors.heading,
                  marginBottom: 6
                }}
              >
                {title.includes('Edit') ? 'Save Changes?' : 'Add Menu Item?'}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.label,
                  textAlign: 'center',
                  lineHeight: 19
                }}
              >
                {title.includes('Edit')
                  ? `Update "${formData.name}"`
                  : `Add "${formData.name || 'this item'}"`}{' '}
                {title.includes('Edit') ? 'with your changes' : 'to the menu'}
              </Text>
            </View>

            {/* Item Preview */}
            <View
              style={{
                backgroundColor: colors.screen,
                borderRadius: 12,
                padding: 12,
                marginBottom: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12
              }}
            >
              {getImageSource() ? (
                <Image
                  source={getImageSource()}
                  style={{ width: 52, height: 52, borderRadius: 10 }}
                  resizeMode='cover'
                />
              ) : (
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 10,
                    backgroundColor: colors.card,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <SelectedPlaceholderIcon
                    size={20}
                    color={colors.muted}
                    strokeWidth={2}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  {formData.name || 'Item Name'}
                </Text>
                <Text
                  style={{ fontSize: 12, color: colors.label, marginTop: 4 }}
                >
                  {formData.categories.length > 0
                    ? formData.categories.join(', ')
                    : 'No categories'}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.teal,
                    marginTop: 4
                  }}
                >
                  ${formData.price || '0.00'}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'column', gap: 10 }}>
              <TouchableOpacity
                onPress={confirmSave}
                disabled={isSaving}
                style={{
                  width: '100%',
                  backgroundColor: colors.teal,
                  borderRadius: 12,
                  paddingVertical: 13,
                  alignItems: 'center',
                  shadowColor: colors.teal,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 4,
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.onSolid,
                    fontWeight: '700'
                  }}
                >
                  {isSaving ? 'Saving...' : submitButtonLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowConfirmation(false)}
                style={{
                  width: '100%',
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 13,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.label,
                    fontWeight: '700'
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AddIngredientModal
        isOpen={isRecipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        onAddIngredient={handleAddIngredient}
      />
      <RecipeIngredientSheet
        ref={recipeSheetRef}
        existingIds={formData.recipe.map(r => r.inventoryItemId)}
        currentId={null}
        onSelect={inventoryItemId => {
          if (formData.recipe.some(r => r.inventoryItemId === inventoryItemId))
            return
          setFormData(prev => ({
            ...prev,
            recipe: [...prev.recipe, { inventoryItemId, quantity: 1 }]
          }))
        }}
      />

      <BottomSheet
        ref={inventorySelectionSheetRef}
        index={-1}
        snapPoints={inventorySnapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={renderInventoryBackdrop}
      >
        <View style={{ flex: 1, backgroundColor: colors.screen }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                {editingRecipeItemIndex !== null
                  ? 'Replace Item'
                  : 'Add Recipe Item'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                Select an inventory item
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingRecipeItemIndex(null)
                inventorySelectionSheetRef.current?.close()
              }}
              style={{
                padding: 6,
                borderRadius: 8,
                backgroundColor: colors.panel
              }}
            >
              <X size={18} color={colors.label} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                gap: 8
              }}
            >
              <Search size={16} color={colors.label} />
              <TextInput
                value={inventorySearchQuery}
                onChangeText={text => setInventorySearchQuery(text.trim())}
                placeholder='Search by name...'
                placeholderTextColor={colors.label}
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: colors.heading,
                  paddingVertical: 2
                }}
              />
              {inventorySearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setInventorySearchQuery('')}>
                  <X size={14} color={colors.label} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {filteredInventoryItems.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 20
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: colors.label,
                  textAlign: 'center'
                }}
              >
                {inventorySearchQuery
                  ? 'No items found'
                  : 'No inventory items available'}
              </Text>
            </View>
          ) : (
            <BottomSheetSectionList
              sections={groupedInventoryItems}
              keyExtractor={item => item.id}
              contentContainerStyle={{
                paddingHorizontal: 12,
                paddingBottom: 40
              }}
              renderSectionHeader={({ section }) => (
                <View
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 4,
                    marginBottom: 4,
                    marginTop: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border
                  }}
                >
                  <Text
                    style={{
                      color: colors.teal,
                      fontSize: 11,
                      fontWeight: '700',
                      letterSpacing: 1
                    }}
                  >
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({ item: inventoryItem }) => {
                const isAlreadyInRecipe = formData.recipe.some(
                  r => r.inventoryItemId === inventoryItem.id
                )
                const isCurrentlyEditing =
                  editingRecipeItemIndex !== null &&
                  formData.recipe[editingRecipeItemIndex]?.inventoryItemId ===
                    inventoryItem.id
                return (
                  <TouchableOpacity
                    onPress={() => selectInventoryItem(inventoryItem.id)}
                    disabled={isAlreadyInRecipe && !isCurrentlyEditing}
                    style={{
                      marginBottom: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isCurrentlyEditing
                        ? colors.teal + '10'
                        : colors.card,
                      borderColor: isCurrentlyEditing
                        ? colors.teal
                        : colors.border,
                      opacity:
                        isAlreadyInRecipe && !isCurrentlyEditing ? 0.6 : 1
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.heading
                        }}
                      >
                        {inventoryItem.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.label,
                          marginTop: 2
                        }}
                      >
                        {inventoryItem.stockQuantity} {inventoryItem.unit} · $
                        {inventoryItem.cost.toFixed(2)}
                      </Text>
                    </View>
                    {isCurrentlyEditing && (
                      <View
                        style={{
                          backgroundColor: colors.teal + '20',
                          borderWidth: 1,
                          borderColor: colors.teal + '50',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          marginLeft: 8
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.teal,
                            fontWeight: '600'
                          }}
                        >
                          Current
                        </Text>
                      </View>
                    )}
                    {isAlreadyInRecipe && !isCurrentlyEditing && (
                      <View
                        style={{
                          backgroundColor: colors.warning + '20',
                          borderWidth: 1,
                          borderColor: colors.warning + '40',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          marginLeft: 8
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.warning,
                            fontWeight: '600'
                          }}
                        >
                          Added
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </View>
      </BottomSheet>

      <UnsavedChangesDialog
        isOpen={isDialogVisible}
        onCancel={handleCancel}
        onDiscard={handleDiscard}
      />

      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        title='Delete Item'
        message='Are you sure you want to delete this item? This action cannot be undone.'
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          setShowDeleteDialog(false)
          onDelete?.()
        }}
      />
    </View>
  )
}

export default ItemForm
