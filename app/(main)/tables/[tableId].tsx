import TableOrderView from "@/components/tables/TableOrderView";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function TableScreen() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const router = useRouter();
  return (
    <TableOrderView
      tableId={typeof tableId === "string" ? tableId : ""}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/tables")
      }
    />
  );
}
