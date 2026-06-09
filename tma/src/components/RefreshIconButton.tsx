import { ActionIcon, Loader } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

/** Desktop-only manual refresh (hidden on TG / narrow mobile). */
export function RefreshIconButton({
  onRefresh,
  loading,
}: {
  onRefresh: () => void;
  loading?: boolean;
}) {
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size={44}
      aria-label="Refresh"
      onClick={() => onRefresh()}
      disabled={loading}
      visibleFrom="md"
    >
      {loading ? <Loader size={18} /> : <IconRefresh size={20} />}
    </ActionIcon>
  );
}
