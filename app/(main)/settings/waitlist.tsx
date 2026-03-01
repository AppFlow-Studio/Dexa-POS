import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWaitlistStore } from "@/stores/useWaitlistStore";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  MessageSquare,
  Users,
  X,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WaitlistScreen = () => {
  const insets = useSafeAreaInsets();
  const { waitlist, removeWaitlistEntry } = useWaitlistStore();

  // Waitlist Configuration
  const [enableWaitlist, setEnableWaitlist] = useState(true);
  const [autoSmsEnabled, setAutoSmsEnabled] = useState(true);
  const [smsTemplate, setSmsTemplate] = useState(
    "Hi {name}, your table for {party_size} at Dexa Bistro is ready! Please check in with the host within 5 minutes."
  );

  // Reservation Configuration
  const [enableReservations, setEnableReservations] = useState(true);
  const [daysAhead, setDaysAhead] = useState("30");
  const [maxGuestsPerSlot, setMaxGuestsPerSlot] = useState("6");
  const [slotDuration, setSlotDuration] = useState("90");
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("20");
  const [cancellationPolicy, setCancellationPolicy] = useState(
    "Cancellations must be made 24 hours in advance to receive a full refund."
  );

  // Mock Reservation Data for Timeline
  const mockReservations = [
    { time: "6:00 PM", name: "Johnson", party: 4 },
    { time: "6:30 PM", name: "Williams", party: 2 },
    { time: "7:00 PM", name: "Davis", party: 6 },
    { time: "7:15 PM", name: "Miller", party: 3 },
  ];

  const avgWaitTime =
    waitlist.length > 0
      ? Math.round(
          waitlist.reduce((acc, curr) => acc + curr.quotedTime, 0) /
            waitlist.length
        )
      : 0;

  return (
    <View className="flex-1 bg-screen p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">
          Waitlist & Reservations
        </Text>
        <Text className="text-gray-400 mt-2">
          Manage digital waitlist and reservation settings.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="gap-6">
          {/* Digital Waitlist Section */}
          <Card className="bg-panel border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Users color={colors.info} size={24} />
                <CardTitle className="text-white">Digital Waitlist</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Enable Waitlist */}
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">
                  Enable Digital Waitlist
                </Label>
                <Switch
                  checked={enableWaitlist}
                  onCheckedChange={setEnableWaitlist}
                />
              </View>

              {enableWaitlist && (
                <>
                  <View className="h-[1px] bg-gray-700" />

                  {/* Operational Dashboard (Live Sync) */}
                  <View className="gap-4">
                    <Text className="text-gray-300 font-semibold text-sm uppercase tracking-wider">
                      Live Dashboard
                    </Text>
                    <View className="flex-row gap-4">
                      <View className="flex-1 bg-screen p-4 rounded-lg border border-gray-700">
                        <Text className="text-gray-400 text-xs">Waiting</Text>
                        <Text className="text-2xl font-bold text-white">
                          {waitlist.length}
                        </Text>
                      </View>
                      <View className="flex-1 bg-screen p-4 rounded-lg border border-gray-700">
                        <Text className="text-gray-400 text-xs">Avg Wait</Text>
                        <Text className="text-2xl font-bold text-blue-400">
                          {avgWaitTime}m
                        </Text>
                      </View>
                    </View>

                    {/* Active Waitlist Items */}
                    <View className="bg-screen rounded-lg border border-gray-700 overflow-hidden">
                      <View className="p-3 border-b border-gray-700 bg-gray-800/50">
                        <Text className="text-gray-300 font-medium">
                          Active Parties
                        </Text>
                      </View>
                      {waitlist.length === 0 ? (
                        <View className="p-6 items-center">
                          <Text className="text-gray-500">
                            Waitlist is empty
                          </Text>
                        </View>
                      ) : (
                        waitlist.slice(0, 3).map((entry) => (
                          <View
                            key={entry.id}
                            className="p-3 border-b border-gray-700 flex-row items-center justify-between last:border-0"
                          >
                            <View>
                              <Text className="text-white font-medium">
                                {entry.name}
                              </Text>
                              <Text className="text-gray-400 text-xs">
                                Party of {entry.partySize} • {entry.quotedTime}m
                                quote
                              </Text>
                            </View>
                            <View className="flex-row gap-2">
                              <TouchableOpacity className="p-2 bg-blue-600/20 rounded-md border border-blue-600/50">
                                <MessageSquare size={14} color={colors.info} />
                              </TouchableOpacity>
                              <TouchableOpacity className="p-2 bg-green-600/20 rounded-md border border-green-600/50">
                                <Check size={14} color={colors.success} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => removeWaitlistEntry(entry.id)}
                                className="p-2 bg-red-600/20 rounded-md border border-red-600/50"
                              >
                                <X size={14} color={colors.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )}
                      {waitlist.length > 3 && (
                        <View className="p-2 items-center border-t border-gray-700">
                          <Text className="text-gray-500 text-xs">
                            +{waitlist.length - 3} more
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="h-[1px] bg-gray-700" />

                  {/* SMS Configuration */}
                  <View className="gap-4">
                    <View className="flex-row items-center justify-between">
                      <Label className="text-white">Auto-SMS When Ready</Label>
                      <Switch
                        checked={autoSmsEnabled}
                        onCheckedChange={setAutoSmsEnabled}
                      />
                    </View>
                    {autoSmsEnabled && (
                      <View>
                        <Label className="text-gray-400 text-sm mb-2">
                          SMS Template
                        </Label>
                        <TextInput
                          multiline
                          numberOfLines={3}
                          className="bg-screen border border-gray-600 rounded-md p-3 text-white text-sm h-24"
                          value={smsTemplate}
                          onChangeText={setSmsTemplate}
                          textAlignVertical="top"
                        />
                        <Text className="text-gray-500 text-xs mt-1">
                          Available variables: {"{name}"}, {"{party_size}"}
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </CardContent>
          </Card>

          {/* Reservation System Section */}
          <Card className="bg-panel border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <CalendarDays color={colors.warning} size={24} />
                <CardTitle className="text-white">Reservation System</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Enable Reservations */}
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">
                  Enable Reservations
                </Label>
                <Switch
                  checked={enableReservations}
                  onCheckedChange={setEnableReservations}
                />
              </View>

              {enableReservations && (
                <>
                  <View className="h-[1px] bg-gray-700" />

                  {/* Booking Settings */}
                  <View className="gap-4">
                    <Text className="text-gray-300 font-semibold text-sm uppercase tracking-wider">
                      Booking Rules
                    </Text>
                    <View className="flex-row gap-4">
                      <View className="flex-1 gap-1.5">
                        <Label className="text-gray-400 text-xs">
                          Days Ahead
                        </Label>
                        <Input
                          className="bg-screen border-gray-600 text-white h-10"
                          value={daysAhead}
                          onChangeText={setDaysAhead}
                          keyboardType="numeric"
                        />
                      </View>
                      <View className="flex-1 gap-1.5">
                        <Label className="text-gray-400 text-xs">
                          Max Guests
                        </Label>
                        <Input
                          className="bg-screen border-gray-600 text-white h-10"
                          value={maxGuestsPerSlot}
                          onChangeText={setMaxGuestsPerSlot}
                          keyboardType="numeric"
                        />
                      </View>
                      <View className="flex-1 gap-1.5">
                        <Label className="text-gray-400 text-xs">
                          Slot (min)
                        </Label>
                        <Input
                          className="bg-screen border-gray-600 text-white h-10"
                          value={slotDuration}
                          onChangeText={setSlotDuration}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Deposits */}
                  <View className="gap-4">
                    <View className="flex-row items-center justify-between">
                      <Label className="text-white">Require Deposit</Label>
                      <Switch
                        checked={requireDeposit}
                        onCheckedChange={setRequireDeposit}
                      />
                    </View>
                    {requireDeposit && (
                      <View className="gap-4">
                        <View>
                          <Label className="text-gray-400 text-sm mb-1.5">
                            Amount per Person ($)
                          </Label>
                          <Input
                            className="bg-screen border-gray-600 text-white h-10"
                            value={depositAmount}
                            onChangeText={setDepositAmount}
                            keyboardType="numeric"
                          />
                        </View>
                        <View>
                          <Label className="text-gray-400 text-sm mb-1.5">
                            Cancellation Policy
                          </Label>
                          <TextInput
                            multiline
                            className="bg-screen border border-gray-600 rounded-md p-3 text-white text-sm h-20"
                            value={cancellationPolicy}
                            onChangeText={setCancellationPolicy}
                            textAlignVertical="top"
                          />
                        </View>
                      </View>
                    )}
                  </View>

                  <View className="h-[1px] bg-gray-700" />

                  {/* External Integration */}
                  <TouchableOpacity className="flex-row items-center justify-center bg-blue-600 p-4 rounded-lg">
                    <Text className="text-white font-bold text-base mr-2">
                      Connect Google Reserve
                    </Text>
                    <ChevronRight color="white" size={18} />
                  </TouchableOpacity>

                  {/* Today's Timeline Preview */}
                  <View className="mt-2 text-white">
                    <Label className="text-gray-300 font-semibold mb-3">
                      Today's Upcoming
                    </Label>
                    <View className="gap-2">
                      {mockReservations.map((res, index) => (
                        <View
                          key={index}
                          className="flex-row items-center bg-screen p-3 rounded-md border border-gray-700"
                        >
                          <Clock size={16} color={colors.label} className="mr-3" />
                          <Text className="text-blue-400 font-bold w-20">
                            {res.time}
                          </Text>
                          <Text className="text-white font-medium flex-1">
                            {res.name}
                          </Text>
                          <View className="flex-row items-center gap-1">
                            <Users size={14} color={colors.label} />
                            <Text className="text-gray-400 text-sm">
                              {res.party}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
};

export default WaitlistScreen;
