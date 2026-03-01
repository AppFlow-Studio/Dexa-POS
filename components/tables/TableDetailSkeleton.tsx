import { colors } from "@/lib/theme";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * TableDetailSkeleton - Fast placeholder UI for [tableId].tsx
 *
 * PERFORMANCE CRITICAL:
 * - Renders in <16ms (single frame) for instant visual feedback
 * - No subscriptions, no effects beyond animation setup
 * - Pure static layout matching table detail structure
 * - Shows while order data hydrates in background
 *
 * This skeleton matches the visual structure of [tableId].tsx:
 * - OrderInfoHeader (top bar with table/guest info)
 * - Left: Bill section with course items and action bar
 * - Right: Menu section with category tabs and items
 */

const AnimatedPulse: React.FC<{ style: any }> = ({ style }) => {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[style, animatedStyle]} />;
};

const TableDetailSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* OrderInfoHeader - Collapsed state skeleton */}
      <View style={styles.headerSection}>
        <View style={styles.headerBar}>
          <AnimatedPulse style={styles.headerItem} />
          <View style={styles.headerDivider} />
          <AnimatedPulse style={styles.headerItemShort} />
          <View style={styles.headerDivider} />
          <AnimatedPulse style={styles.headerItem} />
          <View style={styles.headerDivider} />
          <AnimatedPulse style={styles.headerItemShort} />
          <View style={styles.headerChevron} />
        </View>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Left: Bill Section */}
        <View style={styles.billSection}>
          {/* Course Header */}
          <View style={styles.courseHeader}>
            <AnimatedPulse style={styles.courseTab} />
            <AnimatedPulse style={styles.courseTabActive} />
            <AnimatedPulse style={styles.courseTab} />
          </View>

          {/* Order Items */}
          <View style={styles.orderItems}>
            {[1, 2, 3, 4].map((_, index) => (
              <View key={index} style={styles.orderItem}>
                <View style={styles.orderItemLeft}>
                  <AnimatedPulse style={styles.itemQuantity} />
                  <View style={styles.itemDetails}>
                    <AnimatedPulse style={styles.itemName} />
                    <AnimatedPulse style={styles.itemModifier} />
                  </View>
                </View>
                <AnimatedPulse style={styles.itemPrice} />
              </View>
            ))}
          </View>

          {/* Bottom Action Bar */}
          <View style={styles.actionBar}>
            <AnimatedPulse style={styles.moreButton} />
            <AnimatedPulse style={styles.totalButton} />
          </View>
        </View>

        {/* Right: Menu Section */}
        <View style={styles.menuSection}>
          {/* Category Tabs */}
          <View style={styles.categoryTabs}>
            <AnimatedPulse style={styles.categoryTabActive} />
            <AnimatedPulse style={styles.categoryTab} />
            <AnimatedPulse style={styles.categoryTab} />
            <AnimatedPulse style={styles.categoryTabShort} />
          </View>

          {/* Menu Items Grid */}
          <View style={styles.menuGrid}>
            {[0, 1, 2].map((rowIndex) => (
              <View key={rowIndex} style={styles.menuRow}>
                {[0, 1, 2, 3].map((colIndex) => (
                  <AnimatedPulse
                    key={colIndex}
                    style={styles.menuItem}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
  },
  headerSection: {
    paddingHorizontal: 8,
    marginTop: 8,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.skeleton,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerItem: {
    width: 80,
    height: 16,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  headerItemShort: {
    width: 50,
    height: 16,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  headerDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.muted,
    marginHorizontal: 8,
  },
  headerChevron: {
    width: 20,
    height: 20,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
    marginLeft: "auto",
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    padding: 8,
  },
  billSection: {
    width: 420,
    maxWidth: 420,
    flexDirection: "column",
  },
  courseHeader: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  courseTab: {
    width: 80,
    height: 40,
    backgroundColor: colors.skeleton,
    borderRadius: 8,
  },
  courseTabActive: {
    width: 100,
    height: 40,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.info,
  },
  orderItems: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  orderItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.skeleton,
    borderRadius: 12,
  },
  orderItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemQuantity: {
    width: 32,
    height: 32,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 8,
  },
  itemDetails: {
    gap: 4,
  },
  itemName: {
    width: 140,
    height: 18,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  itemModifier: {
    width: 80,
    height: 14,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  itemPrice: {
    width: 60,
    height: 20,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  actionBar: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  moreButton: {
    width: 80,
    height: 48,
    backgroundColor: colors.skeleton,
    borderRadius: 12,
  },
  totalButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.info,
    borderRadius: 12,
  },
  menuSection: {
    flex: 1,
    paddingLeft: 12,
  },
  categoryTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  categoryTabActive: {
    width: 100,
    height: 44,
    backgroundColor: colors.info,
    borderRadius: 10,
  },
  categoryTab: {
    width: 90,
    height: 44,
    backgroundColor: colors.skeleton,
    borderRadius: 10,
  },
  categoryTabShort: {
    width: 70,
    height: 44,
    backgroundColor: colors.skeleton,
    borderRadius: 10,
  },
  menuGrid: {
    flex: 1,
    gap: 12,
  },
  menuRow: {
    flexDirection: "row",
    gap: 12,
  },
  menuItem: {
    flex: 1,
    height: 100,
    backgroundColor: colors.skeleton,
    borderRadius: 12,
  },
});

export default React.memo(TableDetailSkeleton);
