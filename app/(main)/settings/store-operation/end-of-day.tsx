import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { Href, useRouter } from "expo-router";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckSquare,
  CreditCard,
  HardDrive,
  Users,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

// --- Reusable Components for this screen ---

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between items-center py-1.5">
    <Text className="text-base text-gray-600">{label}</Text>
    <Text className="text-base font-semibold text-gray-800">{value}</Text>
  </View>
);

const StatusRow = ({ icon, title, description, action, actionText }: any) => (
  <View className="flex-row items-center p-4 bg-white rounded-2xl border border-gray-200">
    <View className="p-2 bg-gray-100 rounded-full">{icon}</View>
    <View className="flex-1 mx-4">
      <Text className="font-bold text-gray-800">{title}</Text>
      {description && (
        <Text className="text-sm text-gray-500">{description}</Text>
      )}
    </View>
    <TouchableOpacity
      onPress={action}
      className="py-2 px-4 rounded-lg bg-primary-400"
    >
      <Text className="font-bold text-white text-sm">{actionText}</Text>
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
  <View className="bg-white p-6 rounded-2xl border border-gray-200">
    <Text className="text-xl font-bold text-gray-800">{title}</Text>
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
    <View className="flex-1 bg-gray-50 p-6">
      {/* Page Header */}
      <View className="flex-row items-center my-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-2 mr-4 bg-white rounded-lg border border-gray-200"
        >
          <ArrowLeft color="#1f2937" size={24} />
        </TouchableOpacity>
        <Text className="text-3xl font-bold text-gray-800">
          Settings / Store Operation / End of Day Report
        </Text>
      </View>

      {/* Top Toolbar */}
      <View className="flex-row justify-between items-center mb-6">
        <View className="bg-white p-1 rounded-xl flex-row self-start border border-gray-200">
          <TouchableOpacity
            onPress={() => setActiveTab("statement")}
            className={`py-2 px-4 rounded-lg ${activeTab === "statement" ? "bg-primary-100" : ""}`}
          >
            <Text
              className={`font-semibold ${activeTab === "statement" ? "text-primary-400" : "text-gray-500"}`}
            >
              Statement
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("chart")}
            className={`py-2 px-4 rounded-lg ${activeTab === "chart" ? "bg-primary-100" : ""}`}
          >
            <Text
              className={`font-semibold ${activeTab === "chart" ? "text-primary-400" : "text-gray-500"}`}
            >
              Chart
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity className="flex-row items-center p-3 bg-white border border-gray-200 rounded-lg">
          <Calendar color="#6b7280" size={20} />
          <Text className="font-semibold text-gray-600 ml-2">
            Wed, 02/03/25
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View className="flex-1 flex-row space-x-6">
        {/* Left Column: Report Details */}
        <ScrollView className="flex-[2]" showsVerticalScrollIndicator={false}>
          <View className="space-y-4">
            <SummaryCard title="Sales & Taxes Summary">
              <SummaryRow
                label="Total net sales"
                value={`$${summary.netSales.toFixed(2)}`}
              />
              <SummaryRow label="Tax" value={`$${summary.tax.toFixed(2)}`} />
              <View className="border-t border-dashed my-2" />
              <View className="flex-row justify-between items-center">
                <Text className="font-bold text-lg">Total Sales</Text>
                <Text className="font-bold text-lg">
                  ${summary.totalSales.toFixed(2)}
                </Text>
              </View>
            </SummaryCard>

            <SummaryCard title="Revenue Centers">
              <View className="flex-row justify-between mb-2">
                <Text className="font-bold text-gray-500">Revenue Centers</Text>
                <Text className="font-bold text-gray-500">Qty</Text>
                <Text className="font-bold text-gray-500">Net Sales</Text>
              </View>
              <SummaryRow
                label="Dinning Room"
                value={`${summary.diningRoomQty}\t\t$${summary.diningRoomSales.toFixed(2)}`}
              />
              <SummaryRow
                label="Tax"
                value={`${summary.taxQty}\t\t$${summary.tax.toFixed(2)}`}
              />
            </SummaryCard>

            <SummaryCard title="Payment Details">
              <SummaryRow
                label="Total"
                value={`$${summary.totalPayments.toFixed(2)}`}
              />
              <View className="border-t border-dashed my-2" />
              <View className="flex-row justify-between items-center">
                <Text className="font-bold text-lg">
                  Total Payments - Total Sales =
                </Text>
                <Text className="font-bold text-lg">
                  -${(summary.totalSales - summary.totalPayments).toFixed(2)}
                </Text>
              </View>
            </SummaryCard>

            <SummaryCard title="Server Tipouts">
              <SummaryRow
                label="Cash before tipouts"
                value={`$${summary.cashTipouts.toFixed(2)}`}
              />
              <Text className="text-sm text-gray-400">
                ( Total Tips and fees Tipped out: $0.00 )
              </Text>
              <View className="border-t border-dashed my-2" />
              <View className="flex-row justify-between items-center">
                <Text className="font-bold text-lg">
                  Total Payments - Total Sales
                </Text>
                <Text className="font-bold text-lg">
                  -${(summary.totalSales - summary.totalPayments).toFixed(2)}
                </Text>
              </View>
            </SummaryCard>

            <SummaryCard title="Total Voids">
              <SummaryRow
                label="Void amount"
                value={`$${summary.voidAmount.toFixed(2)}`}
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
            </SummaryCard>
          </View>
        </ScrollView>

        {/* Right Column: Actions & Status */}
        <View className="flex-1 space-y-4">
          <View className="flex-row space-x-2">
            <TouchableOpacity className="flex-1 py-3 border border-gray-300 rounded-lg items-center bg-white">
              <Text className="font-bold text-gray-700">Run Sales Summary</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setModalOpen(true)}
              className="flex-1 py-3 border border-gray-300 rounded-lg items-center bg-white"
            >
              <Text className="font-bold text-gray-700">
                Close Credit Card Batch
              </Text>
            </TouchableOpacity>
          </View>

          <StatusRow
            icon={<CheckSquare color="#4b5563" size={24} />}
            title="All Checks Closed"
            description="Make sure non-cash tips are added..."
            action={() => router.push("/checks" as Href)}
            actionText="View Checks"
          />
          <StatusRow
            icon={<HardDrive color="#4b5563" size={24} />}
            title="All drawers are closed"
            action={() => {}}
            actionText="View Drawers"
          />
          <StatusRow
            icon={<Users color="#4b5563" size={24} />}
            title="1 Employee Clocked in"
            description="2 Employees clocked out"
            action={() => {}}
            actionText="View Employees"
          />
          <StatusRow
            icon={<Banknote color="#4b5563" size={24} />}
            title="0 Deposits"
            action={() => {}}
            actionText="Create Deposit"
          />
          <StatusRow
            icon={<CreditCard color="#4b5563" size={24} />}
            title="All payments captured"
          />

          <View className="mt-auto pt-4 space-y-2 border-t border-gray-200">
            <View className="flex-row space-x-2">
              <TouchableOpacity className="flex-1 py-3 border border-gray-300 rounded-lg items-center bg-white">
                <Text className="font-bold text-gray-700">Print Receipt</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 py-3 border border-gray-300 rounded-lg items-center bg-white">
                <Text className="font-bold text-gray-700">Auto-resolve</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity className="py-3 bg-primary-400 rounded-lg items-center">
              <Text className="font-bold text-white">End Day</Text>
            </TouchableOpacity>
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
