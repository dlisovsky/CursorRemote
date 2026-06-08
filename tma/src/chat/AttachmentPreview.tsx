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
            size="sm"
            radius="xl"
            variant="filled"
            color="dark"
            pos="absolute"
            top={4}
            right={4}
            onClick={() => onRemove(item.id)}
            aria-label="Remove attachment"
          >
            <IconX size={14} />
          </ActionIcon>
          <Text size="xs" c="dimmed" lineClamp={1} maw={72} mt={4}>
            {item.name}
          </Text>
        </Paper>
      ))}
    </Group>
  );
}
