import { colors } from "@/lib/theme";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, ListChecks, Receipt, Split, Users } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screen },
  header: {
    flexDirection: "row", alignItems: "center",
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.heading },
  headerSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  grid: { flexDirection: "row", gap: 12 },
  card: {
    flex: 1, backgroundColor: colors.panel,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: "space-between", minHeight: 160,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 4 },
  cardDesc: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});

const SplitOptionsView: React.FC = () => {
  const setView = usePaymentStore((state) => state.setView);

  const options = [
    { title: "Split by Item", desc: "Assign specific items to specific guests.", icon: ListChecks, color: colors.info, bg: `${colors.info}15`, view: "split-by-item" as const },
    { title: "Split Evenly", desc: "Divide the total equally among guests.", icon: Users, color: colors.success, bg: `${colors.success}15`, view: "split-evenly" as const },
    { title: "Custom Amount", desc: "Type exactly how much each person pays.", icon: Split, color: colors.warning, bg: `${colors.warning}15`, view: "split-custom-amount" as const },
    { title: "Pay for Items", desc: "Select items to pay now, leave rest for later.", icon: Receipt, color: "#F97316", bg: "rgba(249,115,22,0.12)", view: "pay-for-items" as const },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView("payment-method-selection")}>
          <ArrowLeft size={18} color={colors.label} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Split Bill</Text>
          <Text style={styles.headerSub}>Choose how to divide the payment.</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {options.slice(0, 2).map((opt) => {
            const Icon = opt.icon;
            return (
              <TouchableOpacity key={opt.title} style={styles.card} onPress={() => setView(opt.view)} activeOpacity={0.8}>
                <View style={[styles.iconBox, { backgroundColor: opt.bg }]}>
                  <Icon size={22} color={opt.color} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>{opt.title}</Text>
                  <Text style={styles.cardDesc}>{opt.desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.grid}>
          {options.slice(2, 4).map((opt) => {
            const Icon = opt.icon;
            return (
              <TouchableOpacity key={opt.title} style={styles.card} onPress={() => setView(opt.view)} activeOpacity={0.8}>
                <View style={[styles.iconBox, { backgroundColor: opt.bg }]}>
                  <Icon size={22} color={opt.color} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>{opt.title}</Text>
                  <Text style={styles.cardDesc}>{opt.desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export default SplitOptionsView;
