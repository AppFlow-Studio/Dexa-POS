import { colors } from "@/lib/theme";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const AnimatedPulse: React.FC<{ style: any }> = ({ style }) => {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 900 }),
        withTiming(0.9, { duration: 900 })
      ),
      -1
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, animatedStyle]} />;
};

const TableDetailSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* OrderInfoHeader — collapsed breadcrumb row */}
      <View style={styles.headerSection}>
        <View style={styles.headerBar}>
          <AnimatedPulse style={styles.pill} />
          <View style={styles.dot} />
          <AnimatedPulse style={styles.pillShort} />
          <View style={styles.dot} />
          <AnimatedPulse style={styles.pillShort} />
          <AnimatedPulse style={styles.pillTeal} />
          <View style={{ marginLeft: 'auto' }}>
            <AnimatedPulse style={styles.chevron} />
          </View>
        </View>
      </View>

      {/* Main two-column layout */}
      <View style={styles.mainContent}>
        {/* Left: Bill / CourseAccordion */}
        <View style={styles.billSection}>
          {/* CourseAccordion header row */}
          <View style={styles.accordionHeader}>
            <AnimatedPulse style={styles.orderTitle} />
            <AnimatedPulse style={styles.newCourseBtn} />
          </View>

          {/* Course group rows */}
          {[1, 2].map((course) => (
            <View key={course} style={styles.courseGroup}>
              <View style={styles.courseRow}>
                <View style={styles.courseDot} />
                <AnimatedPulse style={styles.courseLabel} />
                <AnimatedPulse style={styles.courseBadge} />
                <AnimatedPulse style={styles.sendBtn} />
                <AnimatedPulse style={styles.chevron} />
              </View>
              {course === 1 && (
                <View style={styles.courseItems}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={styles.billItem}>
                      <AnimatedPulse style={styles.itemQty} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <AnimatedPulse style={styles.itemName} />
                        <AnimatedPulse style={styles.itemMod} />
                      </View>
                      <AnimatedPulse style={styles.itemPrice} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}

          {/* Bottom action bar */}
          <View style={styles.actionBar}>
            <AnimatedPulse style={styles.moreBtn} />
            <AnimatedPulse style={styles.totalBtn} />
          </View>
        </View>

        {/* Right: Menu section */}
        <View style={styles.menuSection}>
          {/* Category tab row */}
          <View style={styles.categoryRow}>
            <AnimatedPulse style={styles.categoryActive} />
            {[0, 1, 2, 3].map((i) => (
              <AnimatedPulse key={i} style={styles.categoryTab} />
            ))}
          </View>

          {/* Menu item grid */}
          <View style={styles.menuGrid}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.menuRow}>
                {[0, 1, 2, 3].map((col) => (
                  <AnimatedPulse key={col} style={styles.menuItem} />
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

  // Header
  headerSection: {
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pill: {
    width: 72,
    height: 12,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 6,
  },
  pillShort: {
    width: 48,
    height: 12,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 6,
  },
  pillTeal: {
    width: 90,
    height: 12,
    backgroundColor: colors.teal + '30',
    borderRadius: 6,
    marginLeft: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  chevron: {
    width: 14,
    height: 14,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 3,
  },

  // Two-column
  mainContent: {
    flex: 1,
    flexDirection: "row",
    padding: 8,
    gap: 8,
  },

  // Bill column
  billSection: {
    width: 340,
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderTitle: {
    width: 80,
    height: 16,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  newCourseBtn: {
    width: 100,
    height: 28,
    backgroundColor: colors.teal + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.teal + '40',
  },
  courseGroup: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '60',
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  courseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.teal + '60',
  },
  courseLabel: {
    width: 70,
    height: 14,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  courseBadge: {
    width: 44,
    height: 18,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 10,
  },
  sendBtn: {
    width: 110,
    height: 28,
    backgroundColor: colors.teal + '15',
    borderRadius: 8,
    marginLeft: 'auto' as any,
  },
  courseItems: {
    paddingLeft: 24,
    paddingRight: 12,
    paddingBottom: 8,
    gap: 6,
  },
  billItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  itemQty: {
    width: 24,
    height: 24,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 6,
  },
  itemName: {
    width: 120,
    height: 12,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
  },
  itemMod: {
    width: 70,
    height: 10,
    backgroundColor: colors.skeleton,
    borderRadius: 4,
  },
  itemPrice: {
    width: 44,
    height: 12,
    backgroundColor: colors.skeletonHighlight,
    borderRadius: 4,
    marginLeft: 'auto' as any,
  },
  actionBar: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    marginTop: 'auto' as any,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  moreBtn: {
    width: 72,
    height: 44,
    backgroundColor: colors.skeleton,
    borderRadius: 10,
  },
  totalBtn: {
    flex: 1,
    height: 44,
    backgroundColor: colors.teal + '25',
    borderRadius: 10,
  },

  // Menu column
  menuSection: {
    flex: 1,
    gap: 12,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryActive: {
    width: 90,
    height: 36,
    backgroundColor: colors.teal + '30',
    borderRadius: 20,
  },
  categoryTab: {
    width: 80,
    height: 36,
    backgroundColor: colors.skeleton,
    borderRadius: 20,
  },
  menuGrid: {
    flex: 1,
    gap: 10,
  },
  menuRow: {
    flexDirection: "row",
    gap: 10,
  },
  menuItem: {
    flex: 1,
    height: 90,
    backgroundColor: colors.skeleton,
    borderRadius: 12,
  },
});

export default React.memo(TableDetailSkeleton);
