import { Skeleton } from "@/components/ui/skeleton";
import React from "react";
import { View } from "react-native";

const OrderDetailSkeleton = () => {
  return (
    <View className="flex-1 bg-screen">
      {/* Header skeleton */}
      <View className="px-4 py-3 border-b border-border flex-row items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full bg-card" />
        <Skeleton className="w-48 h-7 rounded-md bg-card" />
        <View className="flex-row gap-2 ml-auto">
          <Skeleton className="w-16 h-6 rounded-full bg-card" />
          <Skeleton className="w-16 h-6 rounded-full bg-card" />
        </View>
      </View>

      <View className="flex-1 flex-row">
        {/* Left Pane */}
        <View className="flex-[3] border-r border-border p-4">
          {/* Tab bar skeleton */}
          <View className="flex-row gap-4 mb-4 border-b border-border pb-3">
            <Skeleton className="w-16 h-8 rounded-md bg-card" />
            <Skeleton className="w-20 h-8 rounded-md bg-card" />
            <Skeleton className="w-18 h-8 rounded-md bg-card" />
            <Skeleton className="w-20 h-8 rounded-md bg-card" />
          </View>

          {/* Item rows skeleton */}
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              className="bg-panel rounded-xl p-4 mb-3 flex-row items-center"
            >
              <View className="flex-1">
                <Skeleton className="w-40 h-5 rounded-md bg-card mb-2" />
                <Skeleton className="w-24 h-4 rounded-md bg-card" />
              </View>
              <Skeleton className="w-16 h-5 rounded-md bg-card" />
            </View>
          ))}

          {/* Totals skeleton */}
          <View className="mt-4 pt-4 border-t border-border">
            {[1, 2, 3].map((i) => (
              <View key={i} className="flex-row justify-between mb-2">
                <Skeleton className="w-20 h-4 rounded-md bg-card" />
                <Skeleton className="w-16 h-4 rounded-md bg-card" />
              </View>
            ))}
            <View className="flex-row justify-between mt-2 pt-2 border-t border-border">
              <Skeleton className="w-16 h-6 rounded-md bg-card" />
              <Skeleton className="w-20 h-6 rounded-md bg-card" />
            </View>
          </View>
        </View>

        {/* Right Pane */}
        <View className="flex-[2] p-4">
          {/* Summary cards skeleton */}
          <View className="flex-row flex-wrap gap-3 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <View key={i} className="w-[48%]">
                <Skeleton className="h-20 rounded-xl bg-card" />
              </View>
            ))}
            <Skeleton className="w-full h-20 rounded-xl bg-card" />
          </View>

          {/* Metadata skeleton */}
          <View className="bg-panel rounded-xl p-4 mb-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} className="flex-row justify-between mb-3">
                <Skeleton className="w-24 h-4 rounded-md bg-card" />
                <Skeleton className="w-28 h-4 rounded-md bg-card" />
              </View>
            ))}
          </View>

          {/* Action buttons skeleton */}
          <View className="gap-3">
            <Skeleton className="h-12 rounded-xl bg-card" />
            <Skeleton className="h-12 rounded-xl bg-card" />
            <Skeleton className="h-12 rounded-xl bg-card" />
          </View>
        </View>
      </View>
    </View>
  );
};

export default React.memo(OrderDetailSkeleton);
