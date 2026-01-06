import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * ModifierScreenSkeleton - Fast placeholder UI for ModifierScreen
 *
 * PERFORMANCE CRITICAL:
 * - Renders in <16ms (single frame) for instant visual feedback
 * - No subscriptions, no effects, no heavy computation
 * - Pure static layout matching ModifierScreen structure
 * - Shows while rich content hydrates in background
 *
 * This skeleton matches the visual structure of ModifierScreen:
 * - Header with item name placeholder and action buttons
 * - Quantity section placeholder
 * - Modifier category tabs placeholder
 * - Modifier options grid placeholder
 */
const ModifierScreenSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        {/* Item name placeholder */}
        <View style={styles.itemNamePlaceholder} />

        {/* Action buttons placeholder */}
        <View style={styles.headerActions}>
          <View style={styles.cancelButton} />
          <View style={styles.addButton} />
        </View>
      </View>

      {/* Quantity Section */}
      <View style={styles.quantitySection}>
        <View style={styles.quantityButton} />
        <View style={styles.quantityText} />
        <View style={styles.quantityButton} />
      </View>

      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        <View style={styles.categoryTab} />
        <View style={styles.categoryTabShort} />
        <View style={styles.categoryTab} />
      </View>

      {/* Modifier Options Grid */}
      <View style={styles.optionsGrid}>
        <View style={styles.optionRow}>
          <View style={styles.optionItem} />
          <View style={styles.optionItem} />
          <View style={styles.optionItem} />
        </View>
        <View style={styles.optionRow}>
          <View style={styles.optionItem} />
          <View style={styles.optionItem} />
          <View style={styles.optionItemShort} />
        </View>
        <View style={styles.optionRow}>
          <View style={styles.optionItem} />
          <View style={styles.optionItem} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#212121",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  itemNamePlaceholder: {
    width: 180,
    height: 32,
    backgroundColor: "#303030",
    borderRadius: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    width: 80,
    height: 44,
    backgroundColor: "rgba(239, 68, 68, 0.3)", // red-500/30
    borderRadius: 10,
  },
  addButton: {
    width: 120,
    height: 44,
    backgroundColor: "rgba(34, 197, 94, 0.3)", // green-500/30
    borderRadius: 10,
  },
  quantitySection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  quantityButton: {
    width: 48,
    height: 48,
    backgroundColor: "#303030",
    borderRadius: 24,
  },
  quantityText: {
    width: 48,
    height: 32,
    backgroundColor: "#303030",
    borderRadius: 8,
  },
  categoryTabs: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  categoryTab: {
    width: 110,
    height: 48,
    backgroundColor: "#303030",
    borderRadius: 12,
  },
  categoryTabShort: {
    width: 80,
    height: 48,
    backgroundColor: "#303030",
    borderRadius: 12,
  },
  optionsGrid: {
    flex: 1,
    paddingTop: 16,
    gap: 12,
  },
  optionRow: {
    flexDirection: "row",
    gap: 12,
  },
  optionItem: {
    flex: 1,
    height: 56,
    backgroundColor: "#303030",
    borderRadius: 12,
  },
  optionItemShort: {
    flex: 0.7,
    height: 56,
    backgroundColor: "#303030",
    borderRadius: 12,
  },
});

export default React.memo(ModifierScreenSkeleton);
