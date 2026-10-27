import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";

const features = [
  { icon: "▤", title: "PDF Reader", subtitle: "Read your documents" },
  { icon: "✎", title: "Create PDF", subtitle: "Turn text into PDF" },
  { icon: "⇄", title: "Merge PDFs", subtitle: "Combine documents" },
  { icon: "▣", title: "Scan Document", subtitle: "Scan with your camera" },
];

export default function HomeScreen({ navigation }) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>YOUR DOCUMENT WORKSPACE</Text>
          <Text style={styles.heading}>PDF Toolkit</Text>
        </View>

        <View style={styles.logo}>
          <Text style={styles.logoText}>PDF</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>ALL YOUR DOCUMENT TOOLS</Text>
        <Text style={styles.heroTitle}>Your PDFs.{"\n"}Your control.</Text>
        <Text style={styles.heroDescription}>
          Manage and work with your documents, even when you're offline.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate("Library")}
        >
          <Text style={styles.primaryButtonText}>Open My Library →</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Text style={styles.sectionSubtitle}>Tools for everyday work</Text>
      </View>

      <View style={styles.grid}>
        {features.map((feature) => (
          <Pressable
            key={feature.title}
            style={({ pressed }) => [
              styles.featureCard,
              pressed && styles.pressed,
            ]}
            onPress={() => navigation.navigate("Tools")}
          >
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>{feature.icon}</Text>
            </View>

            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Designed for offline use</Text>
        <Text style={styles.infoText}>
          Your local document library will remain available on your device.
          Account and cloud-sync features can be added separately.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
  },
  content: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greeting: {
    color: "#777D91",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  heading: {
    color: "#171A2B",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 5,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#6C63FF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  hero: {
    backgroundColor: "#29264F",
    borderRadius: 24,
    padding: 23,
    marginBottom: 28,
  },
  heroLabel: {
    color: "#C5C1FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 32,
    lineHeight: 39,
    fontWeight: "800",
    marginTop: 13,
  },
  heroDescription: {
    color: "#D6D4EB",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#8178FF",
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  sectionHeader: {
    marginBottom: 15,
  },
  sectionTitle: {
    color: "#171A2B",
    fontSize: 20,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: "#85899A",
    fontSize: 12,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  featureCard: {
    width: "48%",
    minHeight: 150,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ECECF4",
    marginBottom: 13,
  },
  pressed: {
    opacity: 0.75,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EFEEFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  featureIconText: {
    color: "#6C63FF",
    fontSize: 22,
    fontWeight: "700",
  },
  featureTitle: {
    color: "#24263A",
    fontSize: 14,
    fontWeight: "700",
  },
  featureSubtitle: {
    color: "#85899A",
    fontSize: 11,
    marginTop: 5,
    lineHeight: 16,
  },
  infoCard: {
    backgroundColor: "#EDECFD",
    padding: 17,
    borderRadius: 17,
    marginTop: 7,
  },
  infoTitle: {
    color: "#38336E",
    fontSize: 14,
    fontWeight: "800",
  },
  infoText: {
    color: "#615D86",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
});
