import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconPlayerPlay } from "@tabler/icons-react";
import type { IdeTranscriptLine } from "../../../shared/types.js";
import { fetchIdeSession, resumeIdeSession } from "../api.js";
import { MarkdownText } from "../chat/MarkdownText.js";
import { ToolBatchCard } from "../chat/ToolBatchCard.js";
import { RefreshIconButton } from "../components/RefreshIconButton.js";
import { usePullToRefresh } from "../hooks/usePullToRefresh.js";
import { isTelegramLayout, isTelegramWebApp, useTelegramBackButton } from "../useTelegramApp.js";

export function IdeSessionPage({
  projectId,
  sessionId,
  title: initialTitle,
  subtitle: initialSubtitle,
  canResume: initialCanResume,
  onBack,
  onResumed,
}: {
  projectId: string;
  sessionId: string;
  title: string;
  subtitle: string;
  canResume: boolean;
  onBack: () => void;
  onResumed: (agentId: string) => void;
}) {
  const tgLayout = isTelegramLayout();
  const inTelegram = isTelegramWebApp();
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [canResume, setCanResume] = useState(initialCanResume);
  const [lines, setLines] = useState<IdeTranscriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useTelegramBackButton(onBack);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIdeSession(projectId, sessionId);
      setTitle(data.title);
      setSubtitle(data.subtitle);
      setCanResume(data.canResume);
      setLines(data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { pullDistance } = usePullToRefresh(load, inTelegram || tgLayout, viewportRef);

  useEffect(() => {
    if (loading || lines.length === 0) return;
    requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    });
  }, [loading, lines]);

  async function onResume() {
    if (!canResume) return;
    setResuming(true);
    try {
      const agent = await resumeIdeSession(projectId, sessionId);
      onResumed(agent.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResuming(false);
    }
  }

  return (
    <AppShell
      header={{ height: tgLayout ? 52 : 56 }}
      footer={{ height: "auto" }}
      padding={0}
      styles={{
        root: { height: "100dvh", overflow: "hidden" },
        main: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
        footer: {
          paddingBottom: tgLayout
            ? "calc(var(--mantine-spacing-md) + max(env(safe-area-inset-bottom, 0px), var(--tg-safe-bottom), 16px))"
            : undefined,
          borderTop: "1px solid var(--mantine-color-default-border)",
        },
      }}
    >
      <AppShell.Header
        px="md"
        style={{
          borderBottom: "1px solid var(--mantine-color-default-border)",
          paddingTop: tgLayout ? "var(--tg-safe-top)" : undefined,
        }}
      >
        <Group h="100%" wrap="nowrap" gap="sm">
          {!tgLayout && (
            <ActionIcon variant="subtle" color="gray" onClick={onBack} aria-label="Back">
              <IconArrowLeft size={18} />
            </ActionIcon>
          )}
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Title order={5} lineClamp={1}>
              {title}
            </Title>
            {subtitle && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {subtitle}
              </Text>
            )}
          </Stack>
          <RefreshIconButton onRefresh={() => void load()} loading={loading} />
        </Group>
      </AppShell.Header>

      <AppShell.Main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {pullDistance > 0 && (
          <Text size="xs" c="dimmed" ta="center" py={4}>
            {pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}
          </Text>
        )}
        <ScrollArea style={{ flex: 1 }} px="md" py="sm" type="auto" viewportRef={viewportRef}>
          {loading && (
            <Text c="dimmed" size="sm">
              Loading transcript…
            </Text>
          )}
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          {!loading && !error && lines.length === 0 && (
            <Text c="dimmed" size="sm">
              Empty transcript.
            </Text>
          )}
          <Stack gap="sm" pb="md">
            {lines.map((line, i) => (
              <TranscriptRow key={`${line.role}-${i}`} line={line} />
            ))}
          </Stack>
        </ScrollArea>
      </AppShell.Main>

      <AppShell.Footer px="md" py="sm">
        {canResume ? (
          <Button
            fullWidth
            size="md"
            variant="light"
            color="teal"
            leftSection={<IconPlayerPlay size={16} />}
            loading={resuming}
            onClick={() => void onResume()}
            styles={{ root: { minHeight: 44 } }}
          >
            Resume — chat from phone
          </Button>
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            View only — this Cursor chat has no SDK agent ID. Continue in Cursor IDE.
          </Text>
        )}
      </AppShell.Footer>
    </AppShell>
  );
}

function TranscriptRow({ line }: { line: IdeTranscriptLine }) {
  if (line.role === "user") {
    return (
      <Paper p="sm" radius="md" bg="teal.9" ml="auto" maw="92%">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {line.text}
        </Text>
      </Paper>
    );
  }

  const tools =
    line.tools?.map((t) => ({
      name: t.name,
      detail: t.summary,
      status: "completed" as const,
    })) ?? [];

  return (
    <Stack gap="xs" maw="100%">
      {line.text ? (
        <Paper p="sm" radius="md" bg="dark.6">
          <MarkdownText text={line.text} />
        </Paper>
      ) : null}
      {tools.length > 0 ? <ToolBatchCard tools={tools} /> : null}
    </Stack>
  );
}
