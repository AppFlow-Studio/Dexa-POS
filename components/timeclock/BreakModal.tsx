import { Clock } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";

interface BreakModalProps {
  isOpen: boolean;
  onEndBreak: () => void;
}

const BreakModal: React.FC<BreakModalProps> = ({ isOpen, onEndBreak }) => {
  // Timer logic would go here
  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-md p-8 rounded-2xl items-center text-center bg-white w-[550px]">
        <View className="w-20 h-20 items-center justify-center bg-blue-100 rounded-full border-4 border-blue-200">
          <Clock color="#3b82f6" size={40} />
        </View>
        <Text className="text-3xl font-bold text-gray-800 mt-4">
          Break Initiated
        </Text>
        <Text className="text-5xl font-bold text-gray-800 my-2">05m : 06s</Text>
        <Text className="text-gray-500">Started break: 11:00 AM</Text>
        <TouchableOpacity
          onPress={onEndBreak}
          className="w-full mt-6 py-3 bg-primary-400 rounded-lg items-center"
        >
          <Text className="font-bold text-white text-lg">End Break</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default BreakModal;
