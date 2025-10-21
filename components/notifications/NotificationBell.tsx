import { useNotificationStore } from "@/stores/useNotificationStore";
import { Bell } from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import NotificationPanel from "./NotificationPanel";

const NotificationBell = () => {
  const { unreadCount } = useNotificationStore();
  const [isModalVisible, setModalVisible] = useState(false);

  const toggleModal = () => {
    setModalVisible(!isModalVisible);
  };

  return (
    <>
      <TouchableOpacity
        onPress={toggleModal}
        className="ml-2 p-2 bg-[#303030] rounded-full border border-gray-700 relative"
      >
        <Bell size={28} color="#9CA3AF" />
        {unreadCount > 0 && (
          <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full items-center justify-center border-2 border-[#303030]">
            <Text className="text-white text-xs font-bold">{unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        transparent={true}
        animationType="fade"
        visible={isModalVisible}
        onRequestClose={toggleModal}
      >
        <TouchableWithoutFeedback onPress={toggleModal}>
          <View className="flex-1 justify-center items-center bg-black/50">
            <TouchableWithoutFeedback>
              <View className="w-96">
                <NotificationPanel onClose={toggleModal} />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

export default NotificationBell;
