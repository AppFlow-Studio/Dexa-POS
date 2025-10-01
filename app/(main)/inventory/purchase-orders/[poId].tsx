import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  Camera,
  CreditCard,
  DollarSign,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PurchaseOrderDetailScreen = () => {
  const router = useRouter();
  const { poId } = useLocalSearchParams();
  const {
    purchaseOrders,
    vendors,
    inventoryItems,
    logDeliveryForPO,
    logPaymentForPO,
    cancelPurchaseOrder,
    submitPurchaseOrder,
    deletePurchaseOrder,
  } = useInventoryStore();

  const po = purchaseOrders.find((p) => p.id === poId);
  const vendor = po ? vendors.find((v) => v.id === po.vendorId) : null;

  // Delivery logging state
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString());
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveryPhotos, setDeliveryPhotos] = useState<string[]>([]);
  // receivedDraft holds per-inventoryItemId quantities the manager confirms
  const [receivedDraft, setReceivedDraft] = useState<Record<string, number>>(
    {}
  );

  // Payment logging state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Card" | "Cash">("Card");
  const [cardLast4, setCardLast4] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paidToEmployee, setPaidToEmployee] = useState("");

  // Cancel PO state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  // Delete Draft state
  const [showDeleteDraftDialog, setShowDeleteDraftDialog] = useState(false);
  // Image Viewer state
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageUri, setModalImageUri] = useState<string | null>(null);

  if (!po) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center">
        <Text className="text-2xl text-white">Purchase Order not found.</Text>
      </View>
    );
  }

  const totalCost = po.items.reduce(
    (acc, item) => acc + item.cost * item.quantity,
    0
  );

  const statusColors = {
    Draft: "bg-gray-600",
    "Pending Delivery": "bg-yellow-600",
    "Awaiting Payment": "bg-blue-600",
    Paid: "bg-green-600",
    Cancelled: "bg-red-600",
  };

  const handleLogDelivery = () => {
    if (!poId) return;
    // Build received items payload from draft (fallback to original quantities)
    const receivedItems = po.items
      .map((li) => ({
        inventoryItemId: li.inventoryItemId,
        quantity: receivedDraft[li.inventoryItemId] ?? li.quantity,
        cost: li.cost,
      }))
      .filter((li) => li.quantity > 0);

    logDeliveryForPO(poId as string, {
      photos: deliveryPhotos,
      deliveredAt: deliveryDate,
      notes: deliveryNotes,
      receivedItems,
    });
    setShowDeliveryForm(false);
    toast.success(`Delivery logged for PO #${po.poNumber}`, {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleSubmitDelivery = () => handleLogDelivery();

  const adjustReceivedQty = (inventoryItemId: string, qty: number) => {
    setReceivedDraft((prev) => ({
      ...prev,
      [inventoryItemId]: Math.max(0, qty),
    }));
  };

  const handleLogPayment = () => {
    if (!poId || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount)) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }
    logPaymentForPO(poId as string, {
      method: paymentMethod,
      amount,
      paidAt: new Date().toISOString(),
      cardLast4: paymentMethod === "Card" ? cardLast4 : undefined,
      paidToEmployee,
    });
    setShowPaymentForm(false);
    toast.success(`Payment logged for PO #${po.poNumber}`, {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleCancelPO = () => {
    if (!poId) return;
    cancelPurchaseOrder(poId as string);
    setShowCancelDialog(false);
    toast.success(`PO #${po.poNumber} has been cancelled`, {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleSubmitDraft = () => {
    if (!poId) return;
    submitPurchaseOrder(poId as string);
    toast.success(`PO #${po.poNumber} submitted to Pending Delivery`, {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleDeleteDraft = () => {
    if (!poId) return;
    deletePurchaseOrder(poId as string);
    setShowDeleteDraftDialog(false);
    toast.success(`Draft ${po.poNumber} deleted`, {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
    router.back();
  };

  const handleAddPhoto = async () => {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions to add photos."
        );
        return;
      }

      // Show action sheet for camera or gallery
      Alert.alert("Add Photos", "Choose how you want to add photos", [
        {
          text: "Camera",
          onPress: () => openCamera(),
        },
        {
          text: "Photo Library",
          onPress: () => openImagePicker(),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]);
    } catch (error) {
      console.error("Error requesting permissions:", error);
      Alert.alert("Error", "Failed to request permissions.");
    }
  };

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera permissions to take photos."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setDeliveryPhotos((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo.");
    }
  };

  const openImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10, // Limit to 10 photos
      });

      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map((asset) => asset.uri);
        setDeliveryPhotos((prev) => [...prev, ...newPhotos]);
      }
    } catch (error) {
      console.error("Error picking images:", error);
      Alert.alert("Error", "Failed to pick images.");
    }
  };

  const removePhoto = (index: number) => {
    setDeliveryPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <ScrollView className="flex-1 bg-[#212121]">
      <View className="p-6">
        {/* Section A: Order Summary */}
        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xl font-bold text-white">
              PO Details: {po.poNumber}
            </Text>
            <View
              className={`px-2 py-0.5 rounded-full ${statusColors[po.status]}`}
            >
              <Text className="text-white font-semibold text-sm">
                {po.status}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between mb-3">
            <View>
              <Text className="text-base text-gray-400">Vendor</Text>
              <Text className="text-lg font-semibold text-white">
                {vendor?.name || "Unknown"}
              </Text>
            </View>
            <View>
              <Text className="text-base text-gray-400">Created</Text>
              <Text className="text-lg font-semibold text-white">
                {new Date(po.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View>
              <Text className="text-base text-gray-400">Total Cost</Text>
              <Text className="text-lg font-semibold text-white">
                ${totalCost.toFixed(2)}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between mb-3">
            <View>
              <Text className="text-base text-gray-400">Created By</Text>
              <Text className="text-lg font-semibold text-white">
                {po.createdByEmployeeName || "Unknown Employee"}
              </Text>
            </View>
            <View>
              <Text className="text-base text-gray-400">PO Number</Text>
              <Text className="text-lg font-semibold text-white">
                {po.poNumber}
              </Text>
            </View>
            <View>
              <Text className="text-base text-gray-400">Items Count</Text>
              <Text className="text-lg font-semibold text-white">
                {po.items.length}
              </Text>
            </View>
          </View>

          <Text className="text-lg font-semibold text-white mb-2">Items</Text>
          <FlatList
            data={po.items}
            className="max-h-150"
            keyExtractor={(item) => item.inventoryItemId}
            renderItem={({ item }) => {
              const invItem = inventoryItems.find(
                (i) => i.id === item.inventoryItemId
              );
              return (
                <View className="flex-row justify-between p-2 border-b border-gray-600">
                  <Text className="text-base text-white flex-1">
                    {invItem?.name}
                  </Text>
                  <Text className="text-sm text-gray-300 w-28">
                    {item.quantity} {invItem?.unit}
                  </Text>
                  <Text className="text-sm text-gray-300 w-28">
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                </View>
              );
            }}
          />
        </View>

        {/* Draft Actions */}
        {po.status === "Draft" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
            <Text className="text-lg font-bold text-white mb-2">
              Draft Actions
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleSubmitDraft}
                className="flex-1 bg-blue-600 rounded-lg p-3 items-center"
              >
                <Text className="text-white font-semibold text-base">
                  Submit to Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeleteDraftDialog(true)}
                className="flex-1 bg-red-600 rounded-lg p-3 items-center"
              >
                <Text className="text-white font-semibold text-base">
                  Delete Draft
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {po.status === "Pending Delivery" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
            <View className="flex-row items-center mb-3 gap-x-1.5">
              <Calendar size={20} color="#9CA3AF" />
              <Text className="text-lg font-bold text-white">Log Delivery</Text>
            </View>

            {!showDeliveryForm ? (
              <TouchableOpacity
                onPress={() => setShowDeliveryForm(true)}
                className="bg-blue-600 rounded-lg p-3 items-center"
              >
                <Text className="text-white font-semibold text-base">
                  Log Goods Received
                </Text>
              </TouchableOpacity>
            ) : (
              <View>
                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Date & Time of Delivery
                  </Text>
                  <TextInput
                    value={new Date(deliveryDate).toLocaleString()}
                    editable={false}
                    className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white h-16 text-sm"
                  />
                </View>

                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Received Items
                  </Text>
                  {po.items.map((li) => {
                    const invItem = inventoryItems.find(
                      (i) => i.id === li.inventoryItemId
                    );
                    return (
                      <View
                        key={li.inventoryItemId}
                        className="flex-row items-center gap-1.5 py-1.5 border-b border-gray-700"
                      >
                        <Text className="flex-1 text-white text-sm">
                          {invItem?.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              Math.max(
                                0,
                                (receivedDraft[li.inventoryItemId] ??
                                  li.quantity) - 1
                              )
                            )
                          }
                          className="w-7 h-7 rounded-lg bg-[#212121] border border-gray-600 items-center justify-center"
                        >
                          <Text className="text-white text-lg">-</Text>
                        </TouchableOpacity>
                        <TextInput
                          value={String(
                            receivedDraft[li.inventoryItemId] ?? li.quantity
                          )}
                          onChangeText={(t) =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              Number(t) || 0
                            )
                          }
                          keyboardType="numeric"
                          className="w-14 text-center bg-[#212121] border border-gray-600 rounded-lg p-1.5 text-white h-16 text-sm"
                        />
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              (receivedDraft[li.inventoryItemId] ??
                                li.quantity) + 1
                            )
                          }
                          className="w-7 h-7 rounded-lg bg-[#212121] border border-gray-600 items-center justify-center"
                        >
                          <Text className="text-white text-lg">+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(li.inventoryItemId, 0)
                          }
                          className="ml-1 px-1.5 py-0.5 rounded-lg bg-red-600"
                        >
                          <Text className="text-white text-[10px]">Remove</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Photos
                  </Text>
                  <TouchableOpacity
                    onPress={handleAddPhoto}
                    className="bg-[#212121] border border-gray-600 rounded-lg gap-x-1.5 p-3 items-center flex-row"
                  >
                    <Camera size={18} color="#9CA3AF" />
                    <Text className="text-gray-400 text-sm">Add Photos</Text>
                  </TouchableOpacity>
                  {deliveryPhotos.length > 0 && (
                    <View className="mt-2">
                      <Text className="text-gray-400 text-xs mb-1.5">
                        {deliveryPhotos.length} photo(s)
                      </Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {deliveryPhotos.map((photo, index) => (
                          <View key={index} className="relative">
                            <Image
                              source={{ uri: photo }}
                              className="w-16 h-16 rounded-lg"
                              resizeMode="cover"
                            />
                            <TouchableOpacity
                              onPress={() => removePhoto(index)}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full w-5 h-5 items-center justify-center"
                            >
                              <X size={12} color="white" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Notes
                  </Text>
                  <TextInput
                    value={deliveryNotes}
                    onChangeText={setDeliveryNotes}
                    placeholder="e.g., Box damaged"
                    multiline
                    className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white min-h-[60px] text-sm"
                  />
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setShowDeliveryForm(false)}
                    className="flex-1 bg-gray-600 rounded-lg p-2.5 items-center"
                  >
                    <Text className="text-white font-semibold text-sm">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmitDelivery}
                    className="flex-1 bg-green-600 rounded-lg p-2.5 items-center"
                  >
                    <Text className="text-white font-semibold text-sm">
                      Submit Log
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {po.status === "Awaiting Payment" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
            <View className="flex-row items-center mb-3">
              <DollarSign size={20} color="#9CA3AF" className="mr-1.5" />
              <Text className="text-lg font-bold text-white">Log Payment</Text>
            </View>

            {!showPaymentForm ? (
              <TouchableOpacity
                onPress={() => setShowPaymentForm(true)}
                className="bg-green-600 rounded-lg p-3 items-center"
              >
                <Text className="text-white font-semibold text-base">
                  Log Payment
                </Text>
              </TouchableOpacity>
            ) : (
              <View>
                <View className="mb-3">
                  <Text className="text-white font-semibold mb-2 text-sm">
                    Method
                  </Text>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => setPaymentMethod("Card")}
                      className={`flex-1 p-2.5 rounded-lg border ${
                        paymentMethod === "Card"
                          ? "border-blue-500 bg-blue-500/20"
                          : "border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center justify-center">
                        <CreditCard
                          size={18}
                          color={
                            paymentMethod === "Card" ? "#3B82F6" : "#9CA3AF"
                          }
                          className="mr-1.5"
                        />
                        <Text
                          className={`font-semibold text-sm ${
                            paymentMethod === "Card"
                              ? "text-blue-400"
                              : "text-gray-400"
                          }`}
                        >
                          Card
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPaymentMethod("Cash")}
                      className={`flex-1 p-2.5 rounded-lg border ${
                        paymentMethod === "Cash"
                          ? "border-green-500 bg-green-500/20"
                          : "border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center justify-center">
                        <DollarSign
                          size={18}
                          color={
                            paymentMethod === "Cash" ? "#10B981" : "#9CA3AF"
                          }
                          className="mr-1.5"
                        />
                        <Text
                          className={`font-semibold text-sm ${
                            paymentMethod === "Cash"
                              ? "text-green-400"
                              : "text-gray-400"
                          }`}
                        >
                          Cash
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {paymentMethod === "Card" && (
                  <View className="mb-3">
                    <Text className="text-white font-semibold mb-1.5 text-sm">
                      Card Last 4
                    </Text>
                    <TextInput
                      value={cardLast4}
                      onChangeText={setCardLast4}
                      placeholder="1234"
                      keyboardType="numeric"
                      maxLength={4}
                      className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white h-16 text-sm"
                    />
                  </View>
                )}

                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Amount
                  </Text>
                  <TextInput
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    placeholder="0.00"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white h-16 text-sm"
                  />
                </View>
                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Vendor
                  </Text>
                  <TextInput
                    value={vendor?.name || ""}
                    editable={false}
                    className="bg-[#404040] border border-gray-600 rounded-lg p-2 text-gray-300 h-16 text-sm"
                  />
                </View>
                <View className="mb-3">
                  <Text className="text-white font-semibold mb-1.5 text-sm">
                    Paid To
                  </Text>
                  <TextInput
                    value={paidToEmployee}
                    onChangeText={setPaidToEmployee}
                    placeholder="Employee name"
                    className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white h-16 text-sm"
                  />
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setShowPaymentForm(false)}
                    className="flex-1 bg-gray-600 rounded-lg p-2.5 items-center"
                  >
                    <Text className="text-white font-semibold text-sm">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleLogPayment}
                    className="flex-1 bg-green-600 rounded-lg p-2.5 items-center"
                  >
                    <Text className="text-white font-semibold text-sm">
                      Confirm
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Delivery History */}
        {po.deliveryLoggedAt && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
            <Text className="text-xl font-bold text-white mb-3">
              Delivery History
            </Text>
            <View className="bg-[#212121] border border-gray-600 rounded-lg p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-white font-semibold">Delivered At</Text>
                <Text className="text-white">
                  {new Date(po.deliveryLoggedAt).toLocaleString()}
                </Text>
              </View>
              {po.discrepancyNotes && (
                <View className="mb-2">
                  <Text className="text-white font-semibold mb-1">Notes</Text>
                  <Text className="text-gray-300">{po.discrepancyNotes}</Text>
                </View>
              )}
              {po.deliveryPhotos && po.deliveryPhotos.length > 0 && (
                <View>
                  <Text className="text-white font-semibold mb-2">
                    Photos ({po.deliveryPhotos.length})
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {po.deliveryPhotos.map((photo, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => {
                          setModalImageUri(photo);
                          setShowImageModal(true);
                        }}
                      >
                        <Image
                          source={{ uri: photo }}
                          className="w-16 h-16 rounded-lg"
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Discrepancy Report */}
        {(() => {
          const requested =
            po.originalItems && po.originalItems.length > 0
              ? po.originalItems
              : po.items;
          const received = po.receivedItems || [];
          const ids = Array.from(
            new Set([
              ...requested.map((i) => i.inventoryItemId),
              ...received.map((i) => i.inventoryItemId),
            ])
          );
          const rows = ids.map((id) => {
            const req = requested.find((x) => x.inventoryItemId === id);
            const rec = received.find((x) => x.inventoryItemId === id);
            const reqQty = req?.quantity ?? 0;
            const recQty = rec?.quantity ?? 0;
            return { id, reqQty, recQty, cost: req?.cost ?? rec?.cost ?? 0 };
          });
          const hasDiscrepancy = rows.some((r) => r.reqQty !== r.recQty);
          if (!hasDiscrepancy) return null;
          return (
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
              <Text className="text-lg font-bold text-white mb-2">
                Discrepancy Report
              </Text>
              <View className="bg-[#212121] border border-gray-600 rounded-lg">
                <View className="flex-row px-3 py-2 border-b border-gray-700">
                  <Text className="text-gray-400 flex-1 text-sm">Item</Text>
                  <Text className="text-gray-400 w-16 text-right text-sm">
                    Req
                  </Text>
                  <Text className="text-gray-400 w-16 text-right text-sm">
                    Rec
                  </Text>
                  <Text className="text-gray-400 w-20 text-right text-sm">
                    Status
                  </Text>
                </View>
                {rows.map((r) => {
                  if (r.reqQty === r.recQty) return null;
                  const invItem = inventoryItems.find((i) => i.id === r.id);
                  let status = "Modified";
                  let badge = "bg-yellow-600 text-yellow-50";
                  if (r.recQty === 0 && r.reqQty > 0) {
                    status = "Missing";
                    badge = "bg-red-600 text-red-50";
                  } else if (r.recQty > r.reqQty) {
                    status = "+ Added";
                    badge = "bg-green-600 text-green-50";
                  }
                  return (
                    <View
                      key={r.id}
                      className="flex-row items-center px-3 py-2 border-b border-gray-800 last:border-b-0"
                    >
                      <Text className="text-white flex-1 text-sm">
                        {invItem?.name || r.id}
                      </Text>
                      <Text className="text-gray-300 w-16 text-right text-sm">
                        {r.reqQty}
                      </Text>
                      <Text className="text-gray-300 w-16 text-right text-sm">
                        {r.recQty}
                      </Text>
                      <View className="w-20 items-end">
                        <Text
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge}`}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {po.payment && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
            <Text className="text-lg font-bold text-white mb-2">
              Payment History
            </Text>
            <View className="bg-[#212121] border border-gray-600 rounded-lg p-3">
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-white font-semibold text-sm">Method</Text>
                <Text className="text-white text-sm">{po.payment.method}</Text>
              </View>
              <View className="flex-row justify-between mb-1.5">
                <Text className="text-white font-semibold text-sm">Amount</Text>
                <Text className="text-white text-sm">
                  ${po.payment.amount.toFixed(2)}
                </Text>
              </View>
              {po.payment.cardLast4 && (
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-white font-semibold text-sm">
                    Card Last 4
                  </Text>
                  <Text className="text-white text-sm">
                    ****{po.payment.cardLast4}
                  </Text>
                </View>
              )}
              {po.payment.paidToEmployee && (
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-white font-semibold text-sm">
                    Paid To
                  </Text>
                  <Text className="text-white text-sm">
                    {po.payment.paidToEmployee}
                  </Text>
                </View>
              )}
              <View className="flex-row justify-between">
                <Text className="text-white font-semibold text-sm">
                  Paid At
                </Text>
                <Text className="text-white text-sm">
                  {new Date(po.payment.paidAt).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {po.status !== "Cancelled" && po.status !== "Paid" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 w-fit">
            <TouchableOpacity
              onPress={() => setShowCancelDialog(true)}
              className="bg-red-600 rounded-lg p-3 items-center w-fit"
            >
              <Text className="text-white font-semibold text-base">
                Cancel Purchase Order
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showCancelDialog && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center">
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mx-4 w-full max-w-sm">
              <Text className="text-lg font-bold text-white mb-2">
                Cancel PO
              </Text>
              <Text className="text-gray-300 mb-4 text-sm">
                Cancel PO #{po.poNumber}? This cannot be undone.
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowCancelDialog(false)}
                  className="flex-1 bg-gray-600 rounded-lg p-2.5 items-center"
                >
                  <Text className="text-white font-semibold text-sm">
                    Keep PO
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelPO}
                  className="flex-1 bg-red-600 rounded-lg p-2.5 items-center"
                >
                  <Text className="text-white font-semibold text-sm">
                    Cancel PO
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {showDeleteDraftDialog && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center">
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mx-4 w-full max-w-sm">
              <Text className="text-lg font-bold text-white mb-2">
                Delete Draft
              </Text>
              <Text className="text-gray-300 mb-4 text-sm">
                Delete draft {po.poNumber}? This cannot be undone.
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowDeleteDraftDialog(false)}
                  className="flex-1 bg-gray-600 rounded-lg p-2.5 items-center"
                >
                  <Text className="text-white font-semibold text-sm">
                    Keep Draft
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteDraft}
                  className="flex-1 bg-red-600 rounded-lg p-2.5 items-center"
                >
                  <Text className="text-white font-semibold text-sm">
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Image Viewer Modal */}
        <Dialog
          open={showImageModal}
          onOpenChange={() => setShowImageModal(false)}
          className="w-full h-full items-center justify-center flex"
        >
          <DialogContent className="w-full h-full bg-transparent border-none p-0">
            <View className="flex-1 items-center w-full h-full justify-center">
              {/* <TouchableOpacity
                className="absolute top-10 right-6 z-10 bg-black/50 rounded-full px-4 py-2"
                onPress={() => setShowImageModal(false)}
              >
                <Text className="text-white font-semibold text-lg">Close</Text>
              </TouchableOpacity> */}
              {modalImageUri && (
                <Image
                  source={{ uri: modalImageUri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              )}
            </View>
          </DialogContent>
        </Dialog>
      </View>
    </ScrollView>
  );
};

export default PurchaseOrderDetailScreen;
