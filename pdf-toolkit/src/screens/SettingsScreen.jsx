import { StyleSheet, Text, View } from "react-native";

const settings = [
  ["Storage", "Manage local documents"],
  ["Account & Sync", "Cloud sync will be added later"],
  ["Privacy", "Your local files stay on your device"],
  ["About", "PDF Toolkit"],
];

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>PREFERENCES</Text>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        {settings.map(([title, description], index) => (
          <View
            key={title}
            style={[
              styles.row,
              index !== settings.length - 1 && styles.divider,
            ]}
          >
            <View style={styles.textContainer}>
              <Text style={styles.rowTitle}>{title}</Text>
              <Text style={styles.rowDescription}>{description}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </View>
        ))}
      </View>

      <Text style={styles.version}>PDF Toolkit · Initial Development</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FC",
    padding: 22,
    paddingTop: 35,
  },
  eyebrow: {
    color: "#777D91",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "#171A2B",
    fontSize: 29,
    fontWeight: "800",
    marginTop: 7,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: "#ECECF4",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F6",
  },
  textContainer: {
    flex: 1,
  },
  rowTitle: {
    color: "#24263A",
    fontSize: 14,
    fontWeight: "700",
  },
  rowDescription: {
    color: "#85899A",
    fontSize: 11,
    marginTop: 5,
  },
  arrow: {
    color: "#999DB0",
    fontSize: 25,
    marginLeft: 10,
  },
  version: {
    color: "#85899A",
    fontSize: 12,
    textAlign: "center",
    marginTop: 25,
  },
});
