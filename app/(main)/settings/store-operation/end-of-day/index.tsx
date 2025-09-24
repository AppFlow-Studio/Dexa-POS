import DatePicker from "@/components/date-picker";
import PaymentDetailsCard from "@/components/settings/end-of-day/PaymentDetailsCard";
import RevenueCentersCard from "@/components/settings/end-of-day/RevenueCentersCard";
import SalesTaxesSummaryCard from "@/components/settings/end-of-day/SalesTaxesSummaryCard";
import ServerTipoutsCard from "@/components/settings/end-of-day/ServerTipoutsCard";
import TotalVoidsCard from "@/components/settings/end-of-day/TotalVoidsCard";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { Href, Link, useRouter } from "expo-router";
import {
  Banknote,
  Check,
  CheckSquare,
  CreditCard,
  HardDrive,
  Printer,
  Receipt,
  Recycle,
  RefreshCcw,
  Store,
  Users,
  Utensils,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

// --- Reusable Components for this screen ---

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between items-center py-2">
    <Text className="text-2xl text-gray-300">{label}</Text>
    <Text className="text-2xl font-semibold text-white">{value}</Text>
  </View>
);

const StatusRow = ({ icon, title, description, action, actionText }: any) => (
  <View className="flex-row items-center p-6 bg-[#212121] rounded-2xl border border-gray-600">
    <View className="p-3 bg-gray-600 rounded-full">{icon}</View>
    <View className="flex-1 mx-4">
      <Text className="text-2xl font-bold text-white">{title}</Text>
      {description && (
        <Text className="text-xl text-gray-300">{description}</Text>
      )}
    </View>
    <TouchableOpacity
      onPress={action}
      className="py-3 px-6 rounded-lg bg-blue-500"
    >
      <Text className="text-xl font-bold text-white">{actionText}</Text>
    </TouchableOpacity>
  </View>
);

const SummaryCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View className="bg-[#212121] p-6 rounded-2xl border border-gray-600">
    <Text className="text-3xl font-bold text-white">{title}</Text>
    <View className="mt-4">{children}</View>
  </View>
);

// --- Main Screen Component ---

const EndOfDayReportScreen = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"statement" | "chart">(
    "statement"
  );
  const [isModalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const storeOperationSubsections = [
    {
      id: "end-of-day",
      title: "End of Day",
      subtitle: "Daily Operations",
      route: "/settings/store-operation/end-of-day",
      icon: <Store color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "receipt-rules",
      title: "Receipt Rules",
      subtitle: "Receipt Configuration",
      route: "/settings/store-operation/receipt-rules",
      icon: <Receipt color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "dining-options",
      title: "Dining Options",
      subtitle: "Table & Seating Rules",
      route: "/settings/store-operation/dining-options",
      icon: <Utensils color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "sync-status",
      title: "Sync Status",
      subtitle: "Data Synchronization",
      route: "/settings/store-operation/sync-status",
      icon: <RefreshCcw color="#3b82f6" size={24} />,
      isLocked: true,
    },
  ];

  // Mock data for the statement
  const summary = {
    netSales: 27.25,
    tax: 1.5,
    totalSales: 28.75,
    diningRoomQty: 1,
    diningRoomSales: 27.25,
    taxQty: 2,
    totalPayments: 0.0,
    cashTipouts: 27.25,
    voidAmount: 27.25,
    voidOrderCount: 1,
    voidItemCount: 5,
    voidPercentage: 1238.5,
  };

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Store Operation"
          subsections={storeOperationSubsections}
          currentRoute="/settings/store-operation/end-of-day"
        />

        {/* Main Content */}
        <View className="flex-1 flex-row justify-between">
          {/* Left Column: Report Details */}
          <View className="w-[40%]">
            <View className="bg-[#303030] p-2 rounded-xl flex-row self-start border border-gray-600 mb-6">
              <TouchableOpacity
                onPress={() => setActiveTab("statement")}
                className={`py-3 px-6 rounded-lg ${activeTab === "statement" ? "bg-[#212121]" : ""}`}
              >
                <Text
                  className={`text-xl font-semibold ${activeTab === "statement" ? "text-blue-400" : "text-gray-300"}`}
                >
                  Statement
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("chart")}
                className={`py-3 px-6 rounded-lg ${activeTab === "chart" ? "bg-[#212121]" : ""}`}
              >
                <Text
                  className={`text-xl font-semibold ${activeTab === "chart" ? "text-blue-400" : "text-gray-300"}`}
                >
                  Chart
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView className="w-full" showsVerticalScrollIndicator={false}>
              <View className="gap-y-4">
                <SummaryCard title="Sales & Taxes Summary">
                  {activeTab === "statement" ? (
                    <>
                      <SummaryRow
                        label="Total net sales"
                        value={`${summary.netSales.toFixed(2)}`}
                      />
                      <SummaryRow
                        label="Tax"
                        value={`${summary.tax.toFixed(2)}`}
                      />
                      <View className="border-t border-gray-600 my-2" />
                      <View className="flex-row justify-between items-center">
                        <Text className="font-bold text-2xl text-white">
                          Total Sales
                        </Text>
                        <Text className="font-bold text-2xl text-white">
                          ${summary.totalSales.toFixed(2)}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <SalesTaxesSummaryCard />
                  )}
                </SummaryCard>

                <SummaryCard title="Revenue Centers">
                  {activeTab === "statement" ? (
                    <>
                      <View className="flex-row justify-between mb-2">
                        <Text className="font-bold text-xl text-gray-300">
                          Revenue Centers
                        </Text>
                        <Text className="font-bold text-xl text-gray-300">
                          Qty
                        </Text>
                        <Text className="font-bold text-xl text-gray-300">
                          Net Sales
                        </Text>
                      </View>
                      <SummaryRow
                        label="Dinning Room"
                        value={`${summary.diningRoomQty}\t\t${summary.diningRoomSales.toFixed(2)}`}
                      />
                      <SummaryRow
                        label="Tax"
                        value={`${summary.taxQty}\t\t${summary.tax.toFixed(2)}`}
                      />
                    </>
                  ) : (
                    <RevenueCentersCard />
                  )}
                </SummaryCard>

                <SummaryCard title="Payment Details">
                  {activeTab === "statement" ? (
                    <>
                      <SummaryRow
                        label="Total"
                        value={`${summary.totalPayments.toFixed(2)}`}
                      />
                      <View className="border-t border-gray-600 my-2" />
                      <View className="flex-row justify-between items-center">
                        <Text className="font-bold text-2xl text-white">
                          Total Payments - Total Sales =
                        </Text>
                        <Text className="font-bold text-2xl text-white">
                          -$
                          {(summary.totalSales - summary.totalPayments).toFixed(
                            2
                          )}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <PaymentDetailsCard />
                  )}
                </SummaryCard>

                <SummaryCard title="Server Tipouts">
                  {activeTab === "statement" ? (
                    <>
                      <SummaryRow
                        label="Cash before tipouts"
                        value={`${summary.cashTipouts.toFixed(2)}`}
                      />
                      <Text className="text-xl text-gray-400">
                        ( Total Tips and fees Tipped out: $0.00 )
                      </Text>
                      <View className="border-t border-gray-600 my-2" />
                      <View className="flex-row justify-between items-center">
                        <Text className="font-bold text-2xl text-white">
                          Total Payments - Total Sales
                        </Text>
                        <Text className="font-bold text-2xl text-white">
                          -$
                          {(summary.totalSales - summary.totalPayments).toFixed(
                            2
                          )}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <ServerTipoutsCard />
                  )}
                </SummaryCard>

                <SummaryCard title="Total Voids">
                  {activeTab === "statement" ? (
                    <>
                      <SummaryRow
                        label="Void amount"
                        value={`${summary.voidAmount.toFixed(2)}`}
                      />
                      <SummaryRow
                        label="Void order count"
                        value={summary.voidOrderCount.toString()}
                      />
                      <SummaryRow
                        label="Voit item count"
                        value={summary.voidItemCount.toString()}
                      />
                      <SummaryRow
                        label="Void percentage"
                        value={`${summary.voidPercentage.toFixed(1)}%`}
                      />
                    </>
                  ) : (
                    <TotalVoidsCard />
                  )}
                </SummaryCard>
              </View>
            </ScrollView>
          </View>

          {/* Right Column: Actions & Status */}
          <View className="w-[58%] gap-y-4 bg-[#303030] p-6 rounded-2xl border border-gray-600">
            <TouchableOpacity className="flex-row items-center justify-end">
              <View className="flex-row items-center bg-[#212121] border border-gray-600 rounded-lg">
                <DatePicker
                  date={selectedDate}
                  onDateChange={setSelectedDate}
                />
              </View>
            </TouchableOpacity>
            <View className="flex-row gap-3 ">
              <TouchableOpacity className="flex-1 py-4 border border-gray-500 rounded-lg items-center">
                <Link
                  href="/(main)/settings/store-operation/end-of-day/sales-summary"
                  className="text-2xl font-bold text-gray-300"
                >
                  Run Sales Summary
                </Link>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModalOpen(true)}
                className="flex-1 py-4 border border-gray-500 rounded-lg items-center"
              >
                <Text className="text-2xl font-bold text-gray-300">
                  Close Credit Card Batch
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center p-6 bg-[#212121] rounded-2xl border border-gray-600">
              <View className="p-3 rounded-full">
                <CheckSquare color="#9CA3AF" size={24} />
              </View>
              <View className="flex-1 mx-4">
                <Text className="text-2xl font-bold text-white">
                  All Checks Closed
                </Text>

                <Text className="text-xl text-gray-300">
                  Make sure non-cash tips are added. Non-cash tips cannot be
                  adjusted after 24 hours
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/(main)/settings/store-operation/end-of-day/checks" as Href
                  )
                }
                className="py-3 px-6"
              >
                <Text className="font-bold text-blue-400 text-xl">
                  View Checks
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center p-6 bg-[#212121] rounded-2xl border border-gray-600">
              <View className="p-3 rounded-full">
                <HardDrive color="#9CA3AF" size={24} />
              </View>
              <View className="flex-1 mx-4">
                <Text className="text-2xl font-bold text-white">
                  All drawers are closed
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/(main)/settings/store-operation/end-of-day/drawers" as Href
                  )
                }
                className="py-3 px-6"
              >
                <Text className="font-bold text-blue-400 text-xl">
                  View Drawers
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center p-6 bg-[#212121] rounded-2xl border border-gray-600">
              <View className="p-3 rounded-full">
                <Users color="#9CA3AF" size={24} />
              </View>
              <View className="flex-1 mx-4">
                <Text className="text-2xl font-bold text-white">
                  1 Employee Clocked in
                </Text>

                <Text className="text-xl text-gray-300">
                  2 Employees clocked out
                </Text>
              </View>
              <TouchableOpacity className="py-3 px-6 border border-gray-500 rounded-xl mr-2">
                <Text className="text-xl text-gray-300 font-medium">
                  Clock out all
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/(main)/settings/store-operation/end-of-day/employees" as Href
                  )
                }
                className="py-3 px-6 bg-blue-500 rounded-xl"
              >
                <Text className="font-bold text-white text-xl">
                  View Employees
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center p-6 bg-[#212121] rounded-2xl border border-gray-600">
              <View className="p-3 rounded-full">
                <Banknote color="#9CA3AF" size={24} />
              </View>
              <View className="flex-1 mx-4">
                <Text className="text-2xl font-bold text-white">
                  0 Deposits
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/(main)/settings/store-operation/end-of-day/add-cash-to-register" as Href
                  )
                }
                className="py-3 px-6 bg-blue-500 rounded-xl"
              >
                <Text className="font-bold text-white text-xl">
                  Create Deposit
                </Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center p-6 bg-[#212121] rounded-2xl border border-gray-600">
              <View className="p-3 rounded-full">
                <CreditCard color="#9CA3AF" size={24} />
              </View>
              <View className="flex-1 mx-4">
                <Text className="text-2xl font-bold text-white">
                  All payments captured
                </Text>
              </View>
            </View>

            <View className="mt-auto pt-4 gap-y-3 border-t border-gray-600">
              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-row justify-center flex-1 gap-2 py-4 border border-gray-500 rounded-lg items-center">
                  <Printer size={24} color="#9CA3AF" />
                  <Text className="text-2xl font-bold text-gray-300">
                    Print Receipt
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-row justify-center flex-1 gap-2 py-4 border border-gray-500 rounded-lg items-center">
                  <Recycle size={24} color="#9CA3AF" />
                  <Text className="text-2xl font-bold text-gray-300">
                    Auto-resolve
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-row justify-center flex-1 gap-2 py-4 bg-blue-500 rounded-lg items-center">
                  <Check size={24} color="white" />
                  <Text className="text-2xl font-bold text-white">End Day</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={() => {
          setModalOpen(false);
        }}
        title="Card sales to the bank"
        description="Are you sure you want to close the batch?"
        confirmText="Yes"
      />
    </View>
  );
};

export default EndOfDayReportScreen;
