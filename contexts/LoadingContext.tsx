import { Dialog, DialogContent } from "@/components/ui/dialog";
import { colors, spinnerColor } from "@/lib/theme";
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
    console.log("[hideLoading] isLoading", isLoading);
  }, []);

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading, isLoading }}>
      {children}

      {/* Global Loading Dialog */}
      <Dialog open={isLoading}>
        <DialogContent className="w-fit min-w-[120px] max-w-[280px]">
          <View
            style={{
              borderRadius: 14,
              paddingVertical: 24,
              paddingHorizontal: 28,
              alignItems: "center",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Spinner */}
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                backgroundColor: colors.teal + "15",
                borderWidth: 1,
                borderColor: colors.teal + "40",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <ActivityIndicator size="small" color={spinnerColor} />
            </View>

            {/* Message */}
            {message && (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.heading,
                  textAlign: "center",
                }}
              >
                {message}
              </Text>
            )}

            {/* Dots */}
            <View style={{ flexDirection: "row", gap: 5, marginTop: 10 }}>
              <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: colors.teal, opacity: 0.9 }} />
              <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: colors.teal, opacity: 0.5 }} />
              <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: colors.teal, opacity: 0.25 }} />
            </View>
          </View>
        </DialogContent>
      </Dialog>
    </LoadingContext.Provider>
  );
};
