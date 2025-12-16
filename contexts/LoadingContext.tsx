import { Dialog, DialogContent } from "@/components/ui/dialog";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";

interface LoadingContextType {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  isLoading: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const showLoading = useCallback((msg?: string) => {
    setMessage(msg);
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
    setMessage(undefined);
  }, []);

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading, isLoading }}>
      {children}

      {/* Global Loading Dialog */}
      <Dialog open={isLoading}>
        <DialogContent className="w-fit min-w-[120px] max-w-[280px]">
          <View className="rounded-2xl p-6 items-center bg-[#1a1a1a] border border-gray-800">
            {/* Glowing spinner container */}
            <View className="relative mb-4">
              {/* Outer glow ring */}
              <View
                className="absolute -inset-2 rounded-full opacity-30"
                style={{
                  backgroundColor: "#3B82F6",
                  shadowColor: "#3B82F6",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 20,
                }}
              />
              {/* Spinner background */}
              <View className="w-16 h-16 rounded-full bg-gray-800/50 items-center justify-center border border-gray-700">
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            </View>

            {/* Message (only if provided) */}
            {message && (
              <Text className="text-gray-200 text-base font-medium text-center">
                {message}
              </Text>
            )}

            {/* Decorative dots animation placeholder */}
            <View className="flex-row gap-1.5 mt-3">
              <View className="w-2 h-2 rounded-full bg-blue-500 opacity-80" />
              <View className="w-2 h-2 rounded-full bg-blue-500 opacity-50" />
              <View className="w-2 h-2 rounded-full bg-blue-500 opacity-30" />
            </View>
          </View>
        </DialogContent>
      </Dialog>
    </LoadingContext.Provider>
  );
};
