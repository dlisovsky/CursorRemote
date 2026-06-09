import { ActionIcon, Group, Image, Paper, Text } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

export interface PendingAttachment {
  id: string;
  name: string;
  mime: string;
  previewUrl: string;
  data: string;
}

export function AttachmentPreview({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Group gap="xs">
      {items.map((item) => (
        <Paper key={item.id} withBorder radius="md" p={4} pos="relative">
          <Image src={item.previewUrl} alt={item.name} w={72} h={72} fit="cover" radius="sm" />
          <ActionIcon
            size={44}
            radius="xl"
            variant="filled"
            color="dark"
            pos="absolute"
            top={-6}
            right={-6}
            onClick={() => onRemove(item.id)}
            aria-label="Remove attachment"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <IconX size={16} />
          </ActionIcon>
          <Text size="xs" c="dimmed" lineClamp={1} maw={72} mt={4}>
            {item.name}
          </Text>
        </Paper>
      ))}
    </Group>
  );
}
