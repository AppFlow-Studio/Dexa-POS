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
        <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-2xl font-bold text-white">
              PO Details: {po.poNumber}
            </Text>
            <View
              className={`px-3 py-1 rounded-full ${statusColors[po.status]}`}
            >
              <Text className="text-white font-semibold">{po.status}</Text>
            </View>
          </View>

          <View className="flex-row justify-between mb-4">
            <View>
              <Text className="text-lg text-gray-400">Vendor</Text>
              <Text className="text-xl font-semibold text-white">
                {vendor?.name || "Unknown"}
              </Text>
            </View>
            <View>
              <Text className="text-lg text-gray-400">Created</Text>
              <Text className="text-xl font-semibold text-white">
                {new Date(po.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View>
              <Text className="text-lg text-gray-400">Total Cost</Text>
              <Text className="text-xl font-semibold text-white">
                ${totalCost.toFixed(2)}
              </Text>
            </View>
          </View>

          <Text className="text-xl font-semibold text-white mb-3">Items</Text>
          <FlatList
            data={po.items}
            className="max-h-200"
            keyExtractor={(item) => item.inventoryItemId}
            renderItem={({ item }) => {
              const invItem = inventoryItems.find(
                (i) => i.id === item.inventoryItemId
              );
              return (
                <View className="flex-row justify-between p-3 border-b border-gray-600">
                  <Text className="text-lg text-white flex-1">
                    {invItem?.name}
                  </Text>
                  <Text className="text-base text-gray-300 w-32">
                    {item.quantity} {invItem?.unit}
                  </Text>
                  <Text className="text-base text-gray-300 w-32">
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                </View>
              );
            }}
          />
        </View>

        {/* Draft Actions */}
        {po.status === "Draft" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
            <Text className="text-xl font-bold text-white mb-3">
              Draft Actions
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleSubmitDraft}
                className="flex-1 bg-blue-600 rounded-lg p-4 items-center"
              >
                <Text className="text-white font-bold">
                  Submit to Pending Delivery
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeleteDraftDialog(true)}
                className="flex-1 bg-red-600 rounded-lg p-4 items-center"
              >
                <Text className="text-white font-bold">Delete Draft</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Section B: Log Delivery & Goods Receipt */}
        {po.status === "Pending Delivery" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
            <View className="flex-row items-center mb-4 gap-x-2">
              <Calendar className="mr-2" size={24} color="#9CA3AF" />
              <Text className="text-xl font-bold text-white">
                Log Delivery & Goods Receipt
              </Text>
            </View>

            {!showDeliveryForm ? (
              <TouchableOpacity
                onPress={() => setShowDeliveryForm(true)}
                className="bg-blue-600 rounded-lg p-4 items-center"
              >
                <Text className="text-white font-bold text-lg">
                  Log Goods Received
                </Text>
              </TouchableOpacity>
            ) : (
              <View>
                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">
                    Date & Time of Delivery
                  </Text>
                  <TextInput
                    value={new Date(deliveryDate).toLocaleString()}
                    editable={false}
                    className="bg-[#212121] border border-gray-600 rounded-lg p-3 text-white h-20"
                  />
                </View>

                {/* Editable Received Items */}
                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">
                    Received Items (edit quantities or remove)
                  </Text>
                  {po.items.map((li) => {
                    const invItem = inventoryItems.find(
                      (i) => i.id === li.inventoryItemId
                    );
                    return (
                      <View
                        key={li.inventoryItemId}
                        className="flex-row items-center gap-2 py-2 border-b border-gray-700"
                      >
                        <Text className="flex-1 text-white">
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
                          className="w-8 h-8 rounded-lg bg-[#212121] border border-gray-600 items-center justify-center"
                        >
                          <Text className="text-white">-</Text>
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
                          className="w-16 text-center bg-[#212121] border border-gray-600 rounded-lg p-2 text-white h-20"
                        />
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(
                              li.inventoryItemId,
                              (receivedDraft[li.inventoryItemId] ??
                                li.quantity) + 1
                            )
                          }
                          className="w-8 h-8 rounded-lg bg-[#212121] border border-gray-600 items-center justify-center"
                        >
                          <Text className="text-white">+</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            adjustReceivedQty(li.inventoryItemId, 0)
                          }
                          className="ml-2 px-2 py-1 rounded-lg bg-red-600"
                        >
                          <Text className="text-white text-xs">Remove</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">
                    Upload Photos of Condition
                  </Text>
                  <TouchableOpacity
                    onPress={handleAddPhoto}
                    className="bg-[#212121] border border-gray-600 rounded-lg gap-x-2 p-4 items-center flex-row"
                  >
                    <Camera className="mr-2" size={20} color="#9CA3AF" />
                    <Text className="text-gray-400">Add Photos</Text>
                  </TouchableOpacity>

                  {deliveryPhotos.length > 0 && (
                    <View className="mt-3">
                      <Text className="text-gray-400 text-sm mb-2">
                        {deliveryPhotos.length} photo(s) uploaded
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {deliveryPhotos.map((photo, index) => (
                          <View key={index} className="relative">
                            <Image
                              source={{ uri: photo }}
                              className="w-20 h-20 rounded-lg"
                              resizeMode="cover"
                            />
                            <TouchableOpacity
                              onPress={() => removePhoto(index)}
                              className="absolute -top-2 -right-2 bg-red-500 rounded-full w-6 h-6 items-center justify-center"
                            >
                              <X size={14} color="white" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">
                    Notes (Optional)
                  </Text>
                  <TextInput
                    value={deliveryNotes}
                    onChangeText={setDeliveryNotes}
                    placeholder="e.g., Box was damaged, 3 items missing"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    className="bg-[#212121] border border-gray-600 rounded-lg p-3 text-white min-h-[80px]"
                  />
                </View>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setShowDeliveryForm(false)}
                    className="flex-1 bg-gray-600 rounded-lg p-3 items-center"
                  >
                    <Text className="text-white font-semibold">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmitDelivery}
                    className="flex-1 bg-green-600 rounded-lg p-3 items-center"
                  >
                    <Text className="text-white font-semibold">
                      Submit Delivery Log
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Section C: Log Payment */}
        {po.status === "Awaiting Payment" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
            <View className="flex-row items-center mb-4">
              <DollarSign className="mr-2" size={24} color="#9CA3AF" />
              <Text className="text-xl font-bold text-white">Log Payment</Text>
            </View>

            {!showPaymentForm ? (
              <TouchableOpacity
                onPress={() => setShowPaymentForm(true)}
                className="bg-green-600 rounded-lg p-4 items-center"
              >
                <Text className="text-white font-bold text-lg">
                  Log Payment
                </Text>
              </TouchableOpacity>
            ) : (
              <View>
                <View className="mb-4">
                  <Text className="text-white font-semibold mb-3">
                    Payment Method
                  </Text>
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => setPaymentMethod("Card")}
                      className={`flex-1 p-3 rounded-lg border ${
                        paymentMethod === "Card"
                          ? "border-blue-500 bg-blue-500/20"
                          : "border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center justify-center">
                        <CreditCard
                          className="mr-2"
                          size={20}
                          color={
                            paymentMethod === "Card" ? "#3B82F6" : "#9CA3AF"
                          }
                        />
                        <Text
                          className={`font-semibold ${paymentMethod === "Card" ? "text-blue-400" : "text-gray-400"}`}
                        >
                          Card
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPaymentMethod("Cash")}
                      className={`flex-1 p-3 rounded-lg border ${
                        paymentMethod === "Cash"
                          ? "border-green-500 bg-green-500/20"
                          : "border-gray-600"
                      }`}
                    >
                      <View className="flex-row items-center justify-center">
                        <DollarSign
                          className="mr-2"
                          size={20}
                          color={
                            paymentMethod === "Cash" ? "#10B981" : "#9CA3AF"
                          }
                        />
                        <Text
                          className={`font-semibold ${paymentMethod === "Cash" ? "text-green-400" : "text-gray-400"}`}
                        >
                          Cash
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {paymentMethod === "Card" && (
                  <View className="mb-4">
                    <Text className="text-white font-semibold mb-2">
                      Card Last 4 Digits
                    </Text>
                    <TextInput
                      value={cardLast4}
                      onChangeText={setCardLast4}
                      placeholder="1234"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      maxLength={4}
                      className="bg-[#212121] border border-gray-600 rounded-lg p-3 text-white h-20"
                    />
                  </View>
                )}

                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">
                    Amount {paymentMethod === "Card" ? "Charged" : "Paid"}
                  </Text>
                  <TextInput
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg p-3 text-white h-20"
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">Vendor</Text>
                  <TextInput
                    value={vendor?.name || ""}
                    editable={false}
                    className="bg-[#404040] border border-gray-600 rounded-lg p-3 text-gray-300 h-20"
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-white font-semibold mb-2">
                    Paid To Employee
                  </Text>
                  <TextInput
                    value={paidToEmployee}
                    onChangeText={setPaidToEmployee}
                    placeholder="Employee name at vendor"
                    placeholderTextColor="#9CA3AF"
                    className="bg-[#212121] border border-gray-600 rounded-lg p-3 text-white h-20"
                  />
                </View>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setShowPaymentForm(false)}
                    className="flex-1 bg-gray-600 rounded-lg p-3 items-center"
                  >
                    <Text className="text-white font-semibold">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleLogPayment}
                    className="flex-1 bg-green-600 rounded-lg p-3 items-center"
                  >
                    <Text className="text-white font-semibold">
                      Confirm Payment
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
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
              <Text className="text-xl font-bold text-white mb-3">
                Discrepancy Report
              </Text>
              <View className="bg-[#212121] border border-gray-600 rounded-lg">
                <View className="flex-row px-4 py-3 border-b border-gray-700">
                  <Text className="text-gray-400 flex-1">Item</Text>
                  <Text className="text-gray-400 w-20 text-right">
                    Requested
                  </Text>
                  <Text className="text-gray-400 w-20 text-right">
                    Received
                  </Text>
                  <Text className="text-gray-400 w-24 text-right">Status</Text>
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
                      className="flex-row items-center px-4 py-3 border-b border-gray-800"
                    >
                      <Text className="text-white flex-1">
                        {invItem?.name || r.id}
                      </Text>
                      <Text className="text-gray-300 w-20 text-right">
                        {r.reqQty}
                      </Text>
                      <Text className="text-gray-300 w-20 text-right">
                        {r.recQty}
                      </Text>
                      <View className="w-24 items-end">
                        <Text
                          className={`px-2 py-1 rounded text-xs font-semibold ${badge}`}
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

        {/* Payment History */}
        {po.payment && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
            <Text className="text-xl font-bold text-white mb-3">
              Payment History
            </Text>
            <View className="bg-[#212121] border border-gray-600 rounded-lg p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-white font-semibold">Method</Text>
                <Text className="text-white">{po.payment.method}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-white font-semibold">Amount</Text>
                <Text className="text-white">
                  ${po.payment.amount.toFixed(2)}
                </Text>
              </View>
              {po.payment.cardLast4 && (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-white font-semibold">Card Last 4</Text>
                  <Text className="text-white">****{po.payment.cardLast4}</Text>
                </View>
              )}
              {po.payment.paidToEmployee && (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-white font-semibold">
                    Paid To Employee
                  </Text>
                  <Text className="text-white">
                    {po.payment.paidToEmployee}
                  </Text>
                </View>
              )}
              <View className="flex-row justify-between">
                <Text className="text-white font-semibold">Paid At</Text>
                <Text className="text-white">
                  {new Date(po.payment.paidAt).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Cancel PO Button */}
        {po.status !== "Cancelled" && po.status !== "Paid" && (
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 w-fit">
            <TouchableOpacity
              onPress={() => setShowCancelDialog(true)}
              className="bg-red-600 rounded-lg p-4 items-center w-fit"
            >
              <Text className="text-white font-bold text-lg">
                Cancel Purchase Order
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel Confirmation Dialog */}
        {showCancelDialog && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center">
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mx-6 w-11/12">
              <Text className="text-xl font-bold text-white mb-4">
                Cancel Purchase Order
              </Text>
              <Text className="text-gray-300 mb-6">
                Are you sure you want to cancel PO #{po.poNumber}? This action
                cannot be undone.
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setShowCancelDialog(false)}
                  className="flex-1 bg-gray-600 rounded-lg p-3 items-center"
                >
                  <Text className="text-white font-semibold">Keep PO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelPO}
                  className="flex-1 bg-red-600 rounded-lg p-3 items-center"
                >
                  <Text className="text-white font-semibold">Cancel PO</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Delete Draft Confirmation Dialog */}
        {showDeleteDraftDialog && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center">
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mx-6 w-11/12">
              <Text className="text-xl font-bold text-white mb-4">
                Delete Draft
              </Text>
              <Text className="text-gray-300 mb-6">
                Are you sure you want to delete draft {po.poNumber}? This action
                cannot be undone.
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setShowDeleteDraftDialog(false)}
                  className="flex-1 bg-gray-600 rounded-lg p-3 items-center"
                >
                  <Text className="text-white font-semibold">Keep Draft</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteDraft}
                  className="flex-1 bg-red-600 rounded-lg p-3 items-center"
                >
                  <Text className="text-white font-semibold">Delete</Text>
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
          <DialogContent className="w-[100%] h-[100%] self-center aspect-video  p-6 rounded-2xl items-center">
            <View className="flex-1 items-center w-full h-full justify-center">
              {/* <TouchableOpacity
                className="absolute top-10 right-6 bg-white/10 border border-white/20 rounded-full px-3 py-1"
                onPress={() => setShowImageModal(false)}
              >
                <Text className="text-white font-semibold">Close</Text>
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
