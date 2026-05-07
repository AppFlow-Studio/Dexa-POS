import { colors } from "@/lib/theme";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path as SvgPath, Rect as SvgRect } from "react-native-svg";

/**
 * TableLayoutSkeleton - simple loading placeholder for TableLayoutView.
 */

interface TableLayoutSkeletonProps {
  tableCount?: number;
  showControls?: boolean;
}

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1600;
const GRID_MINOR = 20;
const GRID_MAJOR = 100;

const buildGridPaths = (width: number, height: number) => {
  let minor = "";
  let major = "";

  for (let x = GRID_MINOR; x < width; x += GRID_MINOR) {
    minor += `M${x},0 L${x},${height} `;
  }
  for (let y = GRID_MINOR; y < height; y += GRID_MINOR) {
    minor += `M0,${y} L${width},${y} `;
  }

  for (let x = 0; x <= width; x += GRID_MAJOR) {
    major += `M${x},0 L${x},${height} `;
  }
  for (let y = 0; y <= height; y += GRID_MAJOR) {
    major += `M0,${y} L${width},${y} `;
  }

  return { minor, major };
};

const AnimatedPulse: React.FC<{
  style: any;
  children?: React.ReactNode;
}> = ({ style, children }) => {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

const TABLES = [
  { x: 160, y: 140, w: 120, h: 120, radius: 60 },
  { x: 340, y: 140, w: 160, h: 90, radius: 18 },
  { x: 560, y: 135, w: 110, h: 110, radius: 55 },
  { x: 820, y: 150, w: 150, h: 86, radius: 18 },
  { x: 1060, y: 140, w: 120, h: 120, radius: 60 },
  { x: 1280, y: 150, w: 160, h: 90, radius: 18 },
];

const TableLayoutSkeleton: React.FC<TableLayoutSkeletonProps> = ({
  tableCount = 8,
  showControls = true,
}) => {
  const positions = TABLES.slice(0, tableCount);
  const gridPaths = useMemo(() => buildGridPaths(WORLD_WIDTH, WORLD_HEIGHT), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.screen,
          position: "relative",
          overflow: "hidden",
        },
        canvasFrame: {
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
        },
        canvasGlow: {
          position: "absolute",
          top: -100,
          left: -40,
          width: 260,
          height: 260,
          borderRadius: 999,
          backgroundColor: `${colors.teal}08`,
        },
        tableBase: {
          position: "absolute",
          backgroundColor: colors.skeleton,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        tableInnerLine: {
          width: "68%",
          height: 2,
          borderRadius: 999,
          backgroundColor: `${colors.border}CC`,
          opacity: 0.55,
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
          backgroundColor: `${colors.card}E6`,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
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
          backgroundColor: colors.skeleton,
          borderRadius: 4,
        },
        lockButton: {
          position: "absolute",
          top: 10,
          right: 56,
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
        },
        zoomStack: {
          position: "absolute",
          right: 12,
          bottom: 12,
          gap: 4,
        },
        zoomButton: {
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
        },
      }),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.canvasFrame}>
        <View style={styles.canvasGlow} />

        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgRect
            x={0}
            y={0}
            width={WORLD_WIDTH}
            height={WORLD_HEIGHT}
            fill="none"
            stroke={colors.border}
            strokeWidth={2}
            opacity={0.75}
          />
          <SvgPath
            d={gridPaths.minor}
            stroke={colors.border}
            strokeWidth={0.5}
            strokeLinecap="square"
            opacity={0.42}
            fill="none"
          />
          <SvgPath
            d={gridPaths.major}
            stroke={colors.border}
            strokeWidth={1}
            strokeLinecap="square"
            opacity={0.82}
            fill="none"
          />
        </Svg>

        {positions.map((table, index) => {
          return (
            <AnimatedPulse
              key={`${table.section ?? "table"}-${index}`}
              style={[
                styles.tableBase,
                {
                  left: table.x,
                  top: table.y,
                  width: table.w,
                  height: table.h,
                  borderRadius: table.radius,
                  opacity: 0.92,
                },
              ]}
            >
              <View style={styles.tableInnerLine} />
            </AnimatedPulse>
          );
        })}
      </View>

      {showControls && (
        <>
          <View style={styles.lockButton} />

          <View style={styles.zoomStack}>
            <View style={styles.zoomButton} />
            <View style={styles.zoomButton} />
          </View>

          <View style={styles.statusBar}>
            <View style={styles.statusItem}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: `${colors.success}AA` },
                ]}
              />
              <AnimatedPulse style={styles.statusText} />
            </View>
            <View style={styles.statusItem}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: `${colors.warning}AA` },
                ]}
              />
              <AnimatedPulse style={styles.statusText} />
            </View>
            <View style={styles.statusItem}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: `${colors.danger}AA` },
                ]}
              />
              <AnimatedPulse style={styles.statusText} />
            </View>
          </View>
        </>
      )}
    </View>
  );
};

export default React.memo(TableLayoutSkeleton);
