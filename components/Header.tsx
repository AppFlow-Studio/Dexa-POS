import { usePathname, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const generateTitleFromPath = (pathname: string): string => {
  if (pathname === "/" || pathname === "/home") return "Home";

  // Handle dynamic online order route
  if (
    pathname.startsWith("/online-orders/") &&
    pathname.split("/").length > 2
  ) {
    return "Online Order Details";
  } else if (
    pathname.startsWith("/previous-orders/") &&
    pathname.split("/").length > 2
  ) {
    return "Previous Order Details";
  } else if (
    pathname.startsWith("/tables/") &&
    pathname.split("/").length === 3
  ) {
    const tableId = pathname.split("/")[2];
    return `Tables/Table${tableId}`;
  } else if (
    pathname.startsWith("/tables/clean/") &&
    pathname.split("/").length === 4
  ) {
    const tableId = pathname.split("/")[3];
    return `Tables/Table ${tableId}`;
  }

  const pathParts = pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];

  if (!lastPart) return "Order Line"; // Default for safety

  const title = lastPart
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return title;
};

const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const title = generateTitleFromPath(pathname);

  const showBackButton =
    (pathname.startsWith("/online-orders/") &&
      pathname.split("/").length > 2) ||
    (pathname.startsWith("/previous-orders/") &&
      pathname.split("/").length > 2) ||
    (pathname.startsWith("/tables/") && pathname.split("/").length === 3) ||
    (pathname.startsWith("/tables/clean-table/") &&
      pathname.split("/").length === 4);

  return (
    <View className="flex-row justify-between items-center">
      <View className="flex-row items-center">
        {showBackButton && (
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-2 mr-4 bg-gray-100 rounded-lg"
          >
            <ArrowLeft color="#1f2937" size={24} />
          </TouchableOpacity>
        )}
        <Text className="text-2xl font-bold text-gray-800">{title}</Text>
      </View>
      <View className="flex-row items-center">
        <Image
          source={require("@/assets/images/tom_hardy.jpg")}
          className="w-10 h-10 rounded-full"
        />
        <View className="ml-3">
          <Text className="font-semibold">Jessica</Text>
          <Text className="text-gray-500">New York</Text>
        </View>
      </View>
    </View>
  );
};

export default Header;
