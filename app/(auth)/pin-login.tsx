import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Link, useRouter } from "expo-router";
import { Clock } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Button, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
const MockEmployees = [
  {
    address: "1388 West Ave, Chelsea",
    country: "Canada",
    dob: "2/5/1967",
    fullName: "Philippe Ennis",
    gender: "male",
    id: "emp_1759078476073_0",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/men/33.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "7860 Pecan Acres Ln, Hobart",
    country: "Australia",
    dob: "12/12/1969",
    fullName: "Richard Holland",
    gender: "male",
    id: "emp_1759078476073_1",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/men/40.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "298 Grand Marais Ave, St. George",
    country: "Canada",
    dob: "10/22/1981",
    fullName: "Zackary Young",
    gender: "male",
    id: "emp_1759078476073_2",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/men/28.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "6730 Avondale Ave, Tweed",
    country: "Australia",
    dob: "1/12/1949",
    fullName: "Rafael Boyd",
    gender: "male",
    id: "emp_1759078476073_3",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/men/8.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "4625 20th Ave, Beaumont",
    country: "Canada",
    dob: "1/9/1955",
    fullName: "Alice Gagné",
    gender: "female",
    id: "emp_1759078476073_4",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/women/48.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "4431 Regent Ave, Cochrane",
    country: "Canada",
    dob: "3/6/1976",
    fullName: "Vincent Macdonald",
    gender: "male",
    id: "emp_1759078476073_5",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/men/1.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "4291 St. Catherine St, Bath",
    country: "Canada",
    dob: "12/22/1951",
    fullName: "Hannah Mitchell",
    gender: "female",
    id: "emp_1759078476073_6",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/women/90.jpg",
    shiftStatus: "clocked_out",
  },
  {
    address: "9794 Frederick Ave, Inverness",
    country: "Canada",
    dob: "4/13/1950",
    fullName: "Alicia Côté",
    gender: "female",
    id: "emp_1759078476073_7",
    pin: "1234",
    profilePictureUrl: "https://randomuser.me/api/portraits/women/15.jpg",
    shiftStatus: "clocked_out",
  },
];
const MAX_PIN_LENGTH = 4;

const PinLoginScreen = () => {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const {
    isPinClockedIn,
    clockInWithPin,
    clockIn: tcClockIn,
    clockOut: tcClockOut,
  } = useTimeclockStore();
  const { employees, loadMockEmployees, clockIn, clockOut, signIn } =
    useEmployeeStore();
  const canSubmit = useMemo(() => pin.length > 0, [pin]);

  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    variant: "success" | "warning" | "error";
  }>({ visible: false, title: "", message: "", variant: "success" });
  const showDialog = (
    title: string,
    message: string,
    variant: "success" | "warning" | "error"
  ) => setDialog({ visible: true, title, message, variant });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  React.useEffect(() => {
    loadMockEmployees(8);
  }, [employees]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );

  const handleKeyPress = (input: NumpadInput) => {
    if (typeof input === "number") {
      // Append number if PIN is not full
      if (pin.length < MAX_PIN_LENGTH) {
        setPin((prevPin) => prevPin + input.toString());
      }
    } else {
      // Handle actions
      switch (input) {
        case "backspace":
          setPin((prevPin) => prevPin.slice(0, -1));
          break;
        case "clear":
          setPin("");
          break;
      }
    }
  };

  const handleLogin = () => {
    if (!canSubmit) {
      showDialog(
        "Invalid PIN",
        "Please enter a valid PIN to sign in.",
        "error"
      );
      return;
    }
    if (!selectedEmployeeId) {
      showDialog(
        "Select Employee",
        "Please select your profile first.",
        "error"
      );
      return;
    }

    // Auto clock-in before signing in, so terminal session + shift state are aligned
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (emp && emp.shiftStatus !== "clocked_in") {
      clockIn(selectedEmployeeId);
      tcClockIn();
    }

    const res = signIn(selectedEmployeeId, pin);
    if (!res.ok) {
      if (res.reason === "not_clocked_in") {
        showDialog(
          "Not Clocked In",
          "Please clock in before signing into the terminal.",
          "warning"
        );
      } else {
        showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      }
      return;
    }

    setPin("");
    router.replace("/home");
  };

  const handleClockIn = () => {
    if (!selectedEmployeeId) {
      showDialog(
        "Select Employee",
        "Tap your profile first, then Clock In.",
        "warning"
      );
      return;
    }
    // Mark shift status only; do not navigate
    clockIn(selectedEmployeeId);
    // Also update timeclock store status so MenuItem & others see clockedIn state
    tcClockIn();
    setPin("");
    showDialog(
      "Clocked In",
      "You're now on the clock. Enter your PIN to sign into the terminal.",
      "success"
    );
  };

  const handleClockOut = () => {
    if (!selectedEmployeeId) {
      showDialog(
        "Select Employee",
        "Tap your profile first, then enter PIN to clock out.",
        "warning"
      );
      return;
    }
    if (!canSubmit) {
      showDialog(
        "Enter PIN",
        "Please enter your 4-digit PIN to clock out.",
        "error"
      );
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;
    if (emp.pin !== pin) {
      showDialog("Invalid PIN", "The PIN you entered is incorrect.", "error");
      return;
    }
    if (emp.shiftStatus !== "clocked_in") {
      showDialog(
        "Not Clocked In",
        "You are not currently clocked in.",
        "warning"
      );
      return;
    }
    clockOut(selectedEmployeeId);
    tcClockOut();
    showDialog(
      "Clocked Out Successfully",
      `Goodbye ${emp.fullName}!`,
      "success"
    );
    setPin("");
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      className="w-full m-auto"
    >
      {/* <Text className="text-3xl font-medium text-white text-center mb-6">
        Get Started
      </Text> */}

      <View className=" justify-between items-center w-full mb-2">
        <Text className="text-lg font-semibold text-white mb-2">
          Select Your Profile
        </Text>
      </View>
      <ScrollView
        horizontal
        className="mb-4"
        showsHorizontalScrollIndicator={false}
      >
        {employees?.map((e) => (
          <TouchableOpacity
            key={e.id}
            onPress={() => setSelectedEmployeeId(e.id)}
            className={`mr-3 items-center ${selectedEmployeeId === e.id ? "opacity-100" : "opacity-50"}`}
          >
            <Image
              source={
                e.profilePictureUrl
                  ? { uri: e.profilePictureUrl }
                  : require("@/assets/images/tom_hardy.jpg")
              }
              className="w-16 h-16 rounded-full"
            />
            <Text className="text-white text-sm mt-2">{e.fullName}</Text>
            <Text
              className={`text-xs mt-1 ${e.shiftStatus === "clocked_in" ? "text-green-400" : "text-gray-400"}`}
            >
              {e.shiftStatus === "clocked_in" ? "Clocked In" : "Clocked Out"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text className="text-lg font-semibold text-white mb-2">
        ENTER YOUR PASSCODE
      </Text>
      <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

      <View className="mt-4">
        <PinNumpad onKeyPress={handleKeyPress} />
      </View>

      <View className="flex-row gap-4 mt-6">
        <TouchableOpacity
          onPress={handleLogin}
          className="flex-1 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center"
        >
          <Text className="text-primary-300 text-lg font-bold">SIGN IN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClockIn}
          className="flex-1 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center"
        >
          <Text className="text-orange-400 text-lg font-bold">CLOCK IN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClockOut}
          className="flex-1 p-4 bg-[#2D2D2D] border border-gray-700 rounded-xl items-center"
        >
          <Text className="text-green-400 text-lg font-bold">CLOCK OUT</Text>
        </TouchableOpacity>
      </View>

      <Link href="/timeclock" asChild>
        <TouchableOpacity className="self-center bg-[#2D2D2D] border border-gray-700 rounded-xl p-4 mt-6 flex-row items-center gap-2">
          <Text className="text-lg font-semibold text-white">
            Open Timeclock
          </Text>
          <Clock color="white" size={20} />
        </TouchableOpacity>
      </Link>

      <Dialog open={dialog.visible} onOpenChange={hideDialog}>
        <DialogContent>
          <View
            className="w-120 max-w-lg rounded-2xl p-6"
            style={{
              backgroundColor: "#2b2b2b",
              borderWidth: 1,
              borderColor:
                dialog.variant === "success"
                  ? "#059669"
                  : dialog.variant === "warning"
                    ? "#F59E0B"
                    : "#EF4444",
            }}
          >
            <Text
              className={`text-2xl font-semibold mb-2 ${dialog.variant === "success" ? "text-green-400" : dialog.variant === "warning" ? "text-yellow-400" : "text-red-400"}`}
            >
              {dialog.title}
            </Text>
            <Text className="text-xl text-gray-200 mb-4">{dialog.message}</Text>
            <TouchableOpacity
              onPress={hideDialog}
              className="self-end px-5 py-2.5 rounded-lg"
              style={{
                backgroundColor:
                  dialog.variant === "success"
                    ? "#065F46"
                    : dialog.variant === "warning"
                      ? "#92400E"
                      : "#7F1D1D",
              }}
            >
              <Text className="text-white text-lg font-medium">OK</Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </ScrollView>
  );
};

export default PinLoginScreen;
