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
 * TableLayoutSkeleton - Fast placeholder UI for TableLayoutView
 *
 * PERFORMANCE CRITICAL:
 * - Renders in <16ms (single frame) for instant visual feedback
 * - No subscriptions, no effects beyond animation setup
 * - Pure static layout matching TableLayoutView structure
 * - Shows while table data hydrates in background
 *
 * This skeleton matches the visual structure of TableLayoutView:
 * - Zoom controls (top-left)
 * - Table placeholders in grid pattern
 * - Status indicators (bottom-left)
 * - Action buttons placeholder (top-right)
 */

interface TableLayoutSkeletonProps {
  tableCount?: number;
  showControls?: boolean;
}

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

// Pre-defined table positions to simulate a realistic floor plan
const TABLE_POSITIONS = [
  { x: 80, y: 60 },
  { x: 220, y: 60 },
  { x: 360, y: 60 },
  { x: 80, y: 200 },
  { x: 220, y: 200 },
  { x: 360, y: 200 },
  { x: 150, y: 340 },
  { x: 290, y: 340 },
  { x: 500, y: 130 },
  { x: 500, y: 270 },
];

const TableLayoutSkeleton: React.FC<TableLayoutSkeletonProps> = ({
  tableCount = 8,
  showControls = true,
}) => {
  const positions = TABLE_POSITIONS.slice(0, tableCount);

  return (
    <View style={styles.container}>
      {/* Zoom Controls (top-left) */}
      {showControls && (
        <View style={styles.zoomControls}>
          <AnimatedPulse style={styles.zoomButton} />
          <AnimatedPulse style={styles.zoomButton} />
        </View>
      )}

      {/* Action Buttons (top-right) */}
      {showControls && (
        <View style={styles.actionButtons}>
          <AnimatedPulse style={styles.mergeButton} />
          <AnimatedPulse style={styles.editButton} />
        </View>
      )}

      {/* Table Placeholders */}
      <View style={styles.canvasArea}>
        {positions.map((pos, index) => (
          <AnimatedPulse
            key={index}
            style={[
              styles.tablePlaceholder,
              { left: pos.x, top: pos.y },
              // Vary some tables for visual interest
              index % 3 === 0 && styles.tableRound,
              index % 5 === 0 && styles.tableLarge,
            ]}
          />
        ))}
      </View>

      {/* Status Indicators (bottom-left) */}
      {showControls && (
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: "#10B981" }]} />
            <AnimatedPulse style={styles.statusText} />
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: "#3B82F6" }]} />
            <AnimatedPulse style={styles.statusText} />
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: "#EF4444" }]} />
            <AnimatedPulse style={styles.statusText} />
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: "#F59E0B" }]} />
            <AnimatedPulse style={styles.statusText} />
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#212121",
    position: "relative",
  },
  zoomControls: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 20,
    gap: 8,
  },
  zoomButton: {
    width: 52,
    height: 48,
    backgroundColor: "#303030",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  actionButtons: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    gap: 8,
  },
  mergeButton: {
    width: 140,
    height: 44,
    backgroundColor: "#303030",
    borderRadius: 8,
  },
  editButton: {
    width: 110,
    height: 44,
    backgroundColor: "#303030",
    borderRadius: 8,
  },
  canvasArea: {
    flex: 1,
    position: "relative",
  },
  tablePlaceholder: {
    position: "absolute",
    width: 100,
    height: 100,
    backgroundColor: "#303030",
    borderRadius: 16,
  },
  tableRound: {
    borderRadius: 50,
  },
  tableLarge: {
    width: 120,
    height: 80,
  },
  statusBar: {
    position: "absolute",
    bottom: 12,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(28, 28, 28, 0.9)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    width: 60,
    height: 16,
    backgroundColor: "#303030",
    borderRadius: 4,
  },
});

export default React.memo(TableLayoutSkeleton);
