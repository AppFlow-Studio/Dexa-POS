import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MOCK_FOUND_TERMINALS } from "@/lib/mockData";
import { XCircle } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

type ConnectView = "searching" | "found" | "notFound";

const ConnectTerminalModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [view, setView] = useState<ConnectView>("searching");
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);

  // Simulate the searching process when the modal opens
  useEffect(() => {
    if (isOpen) {
      setView("searching");
      const searchTimer = setTimeout(() => {
        // Simulate a 50/50 chance of finding terminals
        if (Math.random() > 0.5) {
          setView("found");
          setSelectedTerminal(MOCK_FOUND_TERMINALS[0].id); // Pre-select the first one
        } else {
          setView("notFound");
        }
      }, 3000); // 3-second search
      return () => clearTimeout(searchTimer);
    }
  }, [isOpen]);

  const renderContent = () => {
    switch (view) {
      case "searching":
        return (
          <View className="items-center text-center p-6">
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text className="text-lg font-bold mt-3">Please wait</Text>
            <Text className="text-gray-500 mt-1 text-sm">
              Searching for available terminals...
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-full mt-4 py-2 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700 text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        );
      case "found":
        return (
          <View>
            <Text className="text-lg font-bold">Terminal Found</Text>
            <Text className="text-gray-500 mt-1 text-sm">
              Select a terminal to connect.
            </Text>
            <View className="my-3 space-y-1.5">
              {MOCK_FOUND_TERMINALS.map((terminal) => (
                <TouchableOpacity
                  key={terminal.id}
                  onPress={() => setSelectedTerminal(terminal.id)}
                  className="flex-row items-center p-2 border border-gray-200 rounded-lg"
                >
                  <View
                    className={`w-4 h-4 rounded-full border-2 items-center justify-center ${
                      selectedTerminal === terminal.id
                        ? "border-primary-400"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedTerminal === terminal.id && (
                      <View className="w-2 h-2 bg-primary-400 rounded-full" />
                    )}
                  </View>
                  <Text className="ml-2 font-semibold text-gray-800 text-sm">
                    {terminal.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row gap-1.5">
              <TouchableOpacity
                onPress={() => setView("searching")}
                className="flex-1 py-2 border border-gray-300 rounded-lg items-center"
              >
                <Text className="font-bold text-gray-700 text-base">
                  Search Again
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-2 bg-primary-400 rounded-lg items-center"
              >
                <Text className="font-bold text-white text-base">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "notFound":
        return (
          <View className="items-center text-center p-6">
            <XCircle color="#ef4444" size={40} />
            <Text className="text-lg font-bold mt-3">No Terminal Found</Text>
            <Text className="text-gray-500 mt-1 text-sm">
              Please recheck your terminal.
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-full mt-4 py-2 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700 text-base">Close</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-3xl overflow-hidden bg-[#11111A] w-[480px]">
        {/* Dark Header */}
        <View className="p-3 pb-0 rounded-t-3xl">
          <DialogTitle className="text-[#F1F1F1] text-xl font-bold text-center">
            Connect New Terminal
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-4 rounded-3xl bg-background-100">
          {renderContent()}
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectTerminalModal;
