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
          <View className="items-center text-center p-8">
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text className="text-xl font-bold mt-4">Please wait</Text>
            <Text className="text-gray-500 mt-1">
              We're currently looking for available terminals
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-full mt-6 py-3 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700">Cancel</Text>
            </TouchableOpacity>
          </View>
        );
      case "found":
        return (
          <View>
            <Text className="text-xl font-bold">Terminal Found</Text>
            <Text className="text-gray-500 mt-1">
              8 terminal found and ready to used
            </Text>
            <View className="my-4 space-y-2">
              {MOCK_FOUND_TERMINALS.map((terminal) => (
                <TouchableOpacity
                  key={terminal.id}
                  onPress={() => setSelectedTerminal(terminal.id)}
                  className="flex-row items-center p-3 border border-gray-200 rounded-lg"
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center ${selectedTerminal === terminal.id ? "border-primary-400" : "border-gray-300"}`}
                  >
                    {selectedTerminal === terminal.id && (
                      <View className="w-2.5 h-2.5 bg-primary-400 rounded-full" />
                    )}
                  </View>
                  <Text className="ml-3 font-semibold text-gray-800">
                    {terminal.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setView("searching")}
                className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
              >
                <Text className="font-bold text-gray-700">Search Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
              >
                <Text className="font-bold text-white">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case "notFound":
        return (
          <View className="items-center text-center p-8">
            <XCircle color="#ef4444" size={48} />
            <Text className="text-xl font-bold mt-4">No Terminal Found</Text>
            <Text className="text-gray-500 mt-1">
              Please choose another model or recheck your terminal
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-full mt-6 py-3 border border-gray-300 rounded-lg items-center"
            >
              <Text className="font-bold text-gray-700">Close</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] w-[550px]">
        {/* Dark Header */}
        <View className="p-4 pb-0 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
            Connect New Terminal
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100">
          {renderContent()}
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectTerminalModal;
