import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Center,
  Chip,
  Group,
  Image,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBrain,
  IconCamera,
  IconMicrophone,
  IconPaperclip,
  IconPhoto,
  IconPlayerStop,
  IconSend,
} from "@tabler/icons-react";
import {
  DEFAULT_CURSOR_MODEL,
  type AgentStatus,
  type QueueItem,
  type WireMessage,
} from "../../../shared/types.js";
import { ActivityStrip } from "../chat/ActivityStrip.js";
import { QueuePanel } from "../chat/QueuePanel.js";
import { ToolCallCard } from "../chat/ToolCallCard.js";
import { ToolBatchCard, groupConsecutiveTools } from "../chat/ToolBatchCard.js";
import type { ChatItem } from "../chat/types.js";
import { toolDetail } from "../chat/types.js";
import {
  attachmentUrl,
  cancelQueuedItem,
  cancelRun,
  fetchAgent,
  fetchAgentHistory,
  fetchProjects,
  forceSendQueued,
  sendPrompt,
  transcribeVoice,
  type AgentDetail,
  type OutgoingAttachment,
} from "../api.js";
import { AttachmentPreview, type PendingAttachment } from "../chat/AttachmentPreview.js";
import { AuthImage } from "../chat/AuthImage.js";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder.js";
import { chatItemsFromHistory } from "../chat/history.js";
import { MarkdownText } from "../chat/MarkdownText.js";
import { agentStatusColor, runStatusLabel } from "../status.js";
import { connectAgentStream } from "../stream.js";
import {
  isTelegramLayout,
  isTelegramWebApp,
  telegramHaptic,
  useTelegramBackButton,
} from "../useTelegramApp.js";

function formatRecordingMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function imageOnlyLabel(count: number): string {
  return count === 1 ? "1 image" : `${count} images`;
}

const SUGGESTED_PROMPTS = [
  "Fix the latest bug",
  "Explain this codebase",
  "Review my changes",
];

type DisplayItem = ChatItem | { kind: "tool_batch"; id: string; tools: { name: string; detail?: string; status: "running" | "completed" | "error" }[] };

function messageTopMargin(item: DisplayItem, prev: DisplayItem | undefined): number {
  if (!prev) return 0;
  const itemKind = item.kind === "tool_batch" ? "tool" : item.kind;
  const prevKind = prev.kind === "tool_batch" ? "tool" : prev.kind;
  if (prevKind === "user" && itemKind === "assistant") return 4;
  if (prevKind === "assistant" && itemKind === "thinking") return 4;
  if (prevKind === "thinking" && itemKind === "assistant") return 4;
  if (prevKind === "tool" && (itemKind === "assistant" || itemKind === "tool")) return 4;
  if (prevKind === "assistant" && itemKind === "user") return 14;
  if (prevKind === "user" && itemKind === "user") return 14;
  return 8;
}

export function AgentChatPage({ agentId, onBack }: { agentId: string; onBack: () => void }) {
  const inTelegram = isTelegramWebApp();
  const tgLayout = isTelegramLayout();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { recording, elapsedMs, toggle: toggleRecording, stop: stopRecording } = useVoiceRecorder();
  const [status, setStatus] = useState<AgentStatus | "finished" | "cancelled">("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState(false);
  const [thinkingActive, setThinkingActive] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const assistantBuf = useRef("");
  const toolSeq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  useTelegramBackButton(inTelegram ? onBack : null);

  const refreshAgent = useCallback(() => {
    void fetchAgent(agentId)
      .then((a) => {
        setAgent(a);
        if (a.activeRunId) {
          setRunId(a.activeRunId);
          setStatus("running");
        }
      })
      .catch(() => setAgent(null));
  }, [agentId]);

  useEffect(() => {
    refreshAgent();
  }, [refreshAgent]);

  useEffect(() => {
    if (!agent?.projectId) return;
    void fetchProjects().then((projects) => {
      const project = projects.find((p) => p.id === agent.projectId);
      setProjectName(project?.name ?? null);
    });
  }, [agent?.projectId]);

  useEffect(() => {
    initialScrollDone.current = false;
    void fetchAgentHistory(agentId).then(({ events }) => {
      const historical = chatItemsFromHistory(events, (fileId) => attachmentUrl(agentId, fileId));
      if (historical.length > 0) setItems(historical);
    });
  }, [agentId]);

  const handleWireEvent = useCallback((event: WireMessage) => {
    if (event.type === "user_message") {
      setItems((prev) => {
        if (prev.some((x) => x.kind === "user" && x.text === event.text)) return prev;
        return [
          ...prev,
          {
            kind: "user",
            id: `u-${event.runId}`,
            text: event.text,
            queued: event.queued,
            images: event.images?.map((img) => ({
              id: img.id,
              name: img.name,
              url: attachmentUrl(agentId, img.id),
            })),
          },
        ];
      });
    }

    if (event.type === "assistant_delta") {
      setThinkingActive(false);
      setActiveToolName(null);
      assistantBuf.current += event.text;
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "assistant" && last.streaming) {
          return [...prev.slice(0, -1), { ...last, text: assistantBuf.current }];
        }
        return [...prev, { kind: "assistant", id: "streaming", text: assistantBuf.current, streaming: true }];
      });
    }

    if (event.type === "assistant_complete") {
      assistantBuf.current = "";
      setThinkingActive(false);
      setActiveToolName(null);
      setItems((prev) =>
        prev
          .filter((x) => !(x.kind === "assistant" && x.streaming))
          .concat({ kind: "assistant", id: event.runId, text: event.text }),
      );
    }

    if (event.type === "tool_call") {
      const detail = toolDetail(event.args);
      if (event.status === "running") {
        toolSeq.current += 1;
        setActiveToolName(event.name);
        setItems((prev) => [
          ...prev,
          {
            kind: "tool",
            id: `tool-${event.runId}-${toolSeq.current}`,
            runId: event.runId,
            name: event.name,
            status: "running",
            detail,
          },
        ]);
      } else {
        setActiveToolName(null);
        setItems((prev) => {
          const idx = [...prev]
            .reverse()
            .findIndex(
              (x) =>
                x.kind === "tool" &&
                x.runId === event.runId &&
                x.name === event.name &&
                x.status === "running",
            );
          if (idx < 0) {
            return [
              ...prev,
              {
                kind: "tool",
                id: `tool-${event.runId}-done-${toolSeq.current}`,
                runId: event.runId,
                name: event.name,
                status: event.status,
                detail,
              },
            ];
          }
          const realIdx = prev.length - 1 - idx;
          return prev.map((x, i) =>
            i === realIdx && x.kind === "tool"
              ? { ...x, status: event.status, detail: detail ?? x.detail }
              : x,
          );
        });
      }
    }

    if (event.type === "thinking") {
      if (event.duration != null) {
        setThinkingActive(false);
        setItems((prev) => [
          ...prev,
          {
            kind: "thinking",
            id: `think-${event.runId}-${event.duration}`,
            label: `Thought for ${(event.duration / 1000).toFixed(1)}s`,
          },
        ]);
      } else {
        setThinkingActive(true);
      }
    }

    if (event.type === "run_status") {
      setStatus(event.status);
      if (event.status === "running") setRunId(event.runId);
      if (event.status === "cancelled") {
        setItems((prev) =>
          prev.map((x) =>
            x.kind === "assistant" && x.streaming ? { ...x, streaming: false, cancelled: true } : x,
          ),
        );
        assistantBuf.current = "";
        setThinkingActive(false);
        setActiveToolName(null);
      }
      if (event.status !== "running") {
        setRunId(null);
        setThinkingActive(false);
        setActiveToolName(null);
      }
    }

    if (event.type === "queue_update") {
      setQueue(event.items);
      const queuedTexts = new Set(event.items.map((i) => i.text));
      setItems((prev) =>
        prev.map((x) =>
          x.kind === "user" && x.queued && !queuedTexts.has(x.text) ? { ...x, queued: false } : x,
        ),
      );
    }

    if (event.type === "error") {
      setItems((prev) => [
        ...prev,
        { kind: "system", id: `err-${Date.now()}`, text: event.message },
      ]);
      notifications.show({ title: "Agent error", message: event.message, color: "red" });
    }
  }, [agentId]);

  useEffect(() => {
    const disconnect = connectAgentStream(agentId, handleWireEvent);
    return disconnect;
  }, [agentId, handleWireEvent]);

  const displayItems = useMemo(() => groupConsecutiveTools(items), [items]);

  useEffect(() => {
    const scrollToBottom = (behavior: ScrollBehavior) => {
      const el = viewportRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior });
        return;
      }
      bottomRef.current?.scrollIntoView({ behavior });
    };

    if (!initialScrollDone.current && items.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom("instant");
        initialScrollDone.current = true;
      });
      return;
    }
    if (initialScrollDone.current) {
      scrollToBottom("smooth");
    }
  }, [items, queue]);

  const isRunning = status === "running";
  const isStreaming = items.some((x) => x.kind === "assistant" && x.streaming);

  const activityLabel = useMemo(() => {
    if (!isRunning) return null;
    if (activeToolName) return `Using ${activeToolName}…`;
    if (thinkingActive) return "Thinking…";
    if (isStreaming) return "Writing response…";
    return "Working…";
  }, [isRunning, activeToolName, thinkingActive, isStreaming]);

  const canSend = Boolean(text.trim()) || attachments.length > 0;

  const onSend = useCallback(async () => {
    const prompt = text.trim();
    if ((!prompt && attachments.length === 0) || sending) return;

    const userId = `u-${Date.now()}`;
    const displayText = prompt || imageOnlyLabel(attachments.length);
    const outgoing: OutgoingAttachment[] = attachments.map((a) => ({
      name: a.name,
      mime: a.mime,
      data: a.data,
    }));
    const previewImages = attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.previewUrl,
    }));

    setText("");
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    setItems((prev) => [
      ...prev,
      { kind: "user", id: userId, text: displayText, images: previewImages },
    ]);
    assistantBuf.current = "";
    setSending(true);
    telegramHaptic("light");

    try {
      const res = await sendPrompt(agentId, prompt, outgoing);
      if (res.queued) {
        setItems((prev) =>
          prev.map((x) => (x.id === userId && x.kind === "user" ? { ...x, queued: true } : x)),
        );
        notifications.show({
          title: "Added to queue",
          message: "Your prompt will run when the current task finishes.",
          color: "blue",
        });
      } else {
        setStatus("running");
        setRunId(res.runId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifications.show({ title: "Send failed", message, color: "red" });
    } finally {
      setSending(false);
    }
  }, [agentId, attachments, sending, text]);

  const onVoice = useCallback(async () => {
    if (transcribing) return;
    if (!recording) {
      try {
        await toggleRecording();
      } catch {
        notifications.show({
          title: "Microphone blocked",
          message: "Allow microphone access to dictate prompts.",
          color: "red",
        });
      }
      return;
    }

    const blob = await stopRecording();
    if (!blob) return;

    setTranscribing(true);
    try {
      const base64 = await blobToBase64(blob);
      const result = await transcribeVoice(agentId, base64, blob.type || "audio/webm");
      setText((prev) => (prev ? `${prev} ${result.text}` : result.text));
      notifications.show({
        title: "Transcribed",
        message: result.text.slice(0, 120),
        color: "teal",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifications.show({ title: "Transcription failed", message, color: "red" });
    } finally {
      setTranscribing(false);
    }
  }, [agentId, recording, stopRecording, toggleRecording, transcribing]);

  const MAX_ATTACHMENTS = 4;

  const addAttachment = useCallback((file: File) => {
    setAttachments((prev) => {
      if (prev.length >= MAX_ATTACHMENTS) {
        notifications.show({
          title: "Attachment limit",
          message: `Maximum ${MAX_ATTACHMENTS} images per message.`,
          color: "orange",
        });
        return prev;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result ?? "");
        const data = raw.includes(",") ? raw.split(",")[1]! : raw;
        const previewUrl = URL.createObjectURL(file);
        const name = file.name || `pasted-${Date.now()}.jpg`;
        setAttachments((current) => {
          if (current.length >= MAX_ATTACHMENTS) return current;
          return [
            ...current,
            {
              id: crypto.randomUUID(),
              name,
              mime: file.type || "image/jpeg",
              previewUrl,
              data,
            },
          ];
        });
      };
      reader.readAsDataURL(file);
      return prev;
    });
  }, []);

  const onPhotoSelected = useCallback(
    (file: File | null) => {
      if (file) addAttachment(file);
    },
    [addAttachment],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const images: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length === 0) return;

      e.preventDefault();
      for (const file of images) addAttachment(file);
    },
    [addAttachment],
  );

  const onStop = useCallback(async () => {
    const id = runId ?? agent?.activeRunId;
    if (!id) return;
    try {
      telegramHaptic("medium");
      await cancelRun(agentId, id);
      notifications.show({ title: "Stopping…", message: "Cancelling the current run.", color: "orange" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifications.show({ title: "Stop failed", message, color: "red" });
    }
  }, [agent?.activeRunId, agentId, runId]);

  function confirmForceSend(queueId: string) {
    modals.openConfirmModal({
      title: "Send this prompt now?",
      children: (
        <Text size="sm">
          This stops the current run and starts the queued prompt immediately.
        </Text>
      ),
      labels: { confirm: "Send now", cancel: "Keep waiting" },
      confirmProps: { color: "orange" },
      onConfirm: () => {
        void forceSendQueued(agentId, queueId)
          .then(() => {
            notifications.show({ title: "Sent", message: "Queued prompt is now running.", color: "teal" });
            refreshAgent();
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            notifications.show({ title: "Force send failed", message, color: "red" });
          });
      },
    });
  }

  function onCancelQueued(queueId: string) {
    void cancelQueuedItem(agentId, queueId).then(() => {
      notifications.show({ title: "Removed", message: "Prompt removed from queue.", color: "gray" });
    });
  }

  const composerPlaceholder = isRunning
    ? "Add to queue while the agent is working…"
    : "Prompt the agent…";

  return (
    <AppShell
      mode="static"
      header={{ height: tgLayout ? "auto" : 56 }}
      footer={{ height: "auto" }}
      padding={0}
      styles={{
        root: { height: "100dvh", overflow: "hidden" },
        main: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        },
        header: inTelegram
          ? {
              paddingTop: "var(--tg-safe-top)",
              minHeight: tgLayout ? 40 : 48,
              background: "var(--mantine-color-body)",
            }
          : undefined,
        footer: {
          height: "auto",
          paddingBottom: tgLayout
            ? "calc(var(--mantine-spacing-lg) + max(env(safe-area-inset-bottom, 0px), var(--tg-safe-bottom), 16px))"
            : "calc(var(--mantine-spacing-md) + max(env(safe-area-inset-bottom, 0px), var(--tg-safe-bottom)))",
          background: tgLayout ? "var(--mantine-color-dark-7)" : "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
        },
      }}
    >
      <AppShell.Header px={tgLayout ? "sm" : "md"} py={tgLayout ? 6 : undefined}>
        <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {!tgLayout && (
              <ActionIcon size={44} variant="subtle" color="gray" onClick={onBack} aria-label="Back">
                <IconArrowLeft size={20} />
              </ActionIcon>
            )}
            <div style={{ minWidth: 0 }}>
              {tgLayout ? (
                <Title order={5} lineClamp={1}>
                  {projectName ?? (agent ? "Loading…" : "Agent")}
                </Title>
              ) : (
                <>
                  <Title order={5} lineClamp={1}>
                    {agent?.title ?? "Agent"}
                  </Title>
                  <Text c="dimmed" size="xs" lineClamp={1}>
                    {agent ? DEFAULT_CURSOR_MODEL : "Loading…"}
                  </Text>
                </>
              )}
            </div>
          </Group>
          <StatusBadge
            status={isRunning ? "running" : (agent?.status ?? status)}
            size={tgLayout ? "md" : "sm"}
          />
        </Group>
      </AppShell.Header>

      <AppShell.Main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {!tgLayout && <ActivityStrip label={activityLabel} />}
        <ScrollArea
          style={{ flex: 1, minHeight: 0 }}
          type="auto"
          offsetScrollbars
          viewportRef={viewportRef}
        >
          <Stack
            gap={0}
            p={tgLayout ? "sm" : "md"}
            pb={tgLayout ? 20 : 16}
            style={{ alignItems: "stretch" }}
          >
            {items.length === 0 && !isRunning && (
              <Stack gap="md" py="xl" px="xs" align="center">
                <Text c="dimmed" size="sm" ta="center">
                  {tgLayout ? "Send a prompt to start." : "Send a prompt to start the agent."}
                </Text>
                <Group gap="xs" justify="center">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <Chip
                      key={prompt}
                      variant="light"
                      size="sm"
                      onClick={() => setText(prompt)}
                    >
                      {prompt}
                    </Chip>
                  ))}
                </Group>
              </Stack>
            )}
            {displayItems.map((item, i) => (
              <ChatItemView
                key={item.kind === "tool_batch" ? item.id : item.id}
                item={item}
                mt={messageTopMargin(item, displayItems[i - 1])}
              />
            ))}
            <div ref={bottomRef} />
          </Stack>
        </ScrollArea>
      </AppShell.Main>

      <AppShell.Footer px={tgLayout ? "sm" : "md"} pt={tgLayout ? "sm" : "xs"} withBorder>
        <Stack gap="sm" pb={tgLayout ? "xs" : 0}>
          {tgLayout && activityLabel && <ActivityStrip label={activityLabel} compact />}
          {isRunning && (
            <Button
              fullWidth
              color="red"
              variant="filled"
              size="md"
              leftSection={<IconPlayerStop size={18} />}
              onClick={() => void onStop()}
              styles={{ root: { minHeight: 44 } }}
            >
              Stop generating
            </Button>
          )}
          {(recording || transcribing) && (
            <Text size="xs" c={recording ? "red" : "dimmed"} ta="center">
              {transcribing
                ? "Transcribing…"
                : `Recording ${formatRecordingMs(elapsedMs)} — tap mic again to transcribe`}
            </Text>
          )}
          <QueuePanel items={queue} onForceSend={confirmForceSend} onCancel={onCancelQueued} />
          <AttachmentPreview
            items={attachments}
            onRemove={(id) =>
              setAttachments((prev) => {
                const item = prev.find((x) => x.id === id);
                if (item) URL.revokeObjectURL(item.previewUrl);
                return prev.filter((x) => x.id !== id);
              })
            }
          />
          <ComposerInput
            tgLayout={tgLayout}
            text={text}
            setText={setText}
            placeholder={composerPlaceholder}
            onPaste={onPaste}
            onSend={onSend}
            canSend={canSend}
            sending={sending}
            isRunning={isRunning}
            recording={recording}
            transcribing={transcribing}
            onVoice={() => void onVoice()}
            libraryInputRef={libraryInputRef}
            cameraInputRef={cameraInputRef}
            onPhotoSelected={onPhotoSelected}
          />
        </Stack>
      </AppShell.Footer>
    </AppShell>
  );
}

function StatusBadge({
  status,
  size,
}: {
  status: AgentStatus | "finished" | "cancelled";
  size: "sm" | "md";
}) {
  const running = status === "running";
  return (
    <Badge
      color={agentStatusColor(running ? "running" : status)}
      variant={running ? "filled" : "light"}
      size={size}
      leftSection={running ? <span className="status-pulse-dot" /> : undefined}
    >
      {runStatusLabel(status)}
    </Badge>
  );
}

function ChatItemView({ item, mt = 0 }: { item: DisplayItem; mt?: number }) {
  if (item.kind === "tool_batch") {
    return (
      <Box mt={mt} style={{ alignSelf: "flex-start", maxWidth: "92%" }}>
        <ToolBatchCard tools={item.tools} />
      </Box>
    );
  }
  if (item.kind === "tool") return <Box mt={mt}><ToolCallCard item={item} /></Box>;

  if (item.kind === "thinking") {
    return (
      <Group gap={6} px="xs" style={{ alignSelf: "flex-start" }}>
        <IconBrain size={14} style={{ opacity: 0.5 }} />
        <Text size="xs" c="dimmed" fs="italic">
          {item.label}
        </Text>
      </Group>
    );
  }

  if (item.kind === "system") {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md" p="xs">
        <Text size="sm">{item.text}</Text>
      </Alert>
    );
  }

  const isUser = item.kind === "user";

  return (
    <Box
      mt={mt}
      style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "92%" }}
    >
      <Paper
        p="sm"
        radius="md"
        bg={isUser ? "teal.9" : "dark.5"}
        withBorder={!isUser}
        style={
          !isUser
            ? { borderLeft: "3px solid var(--mantine-color-teal-6)" }
            : undefined
        }
        opacity={item.kind === "assistant" && item.cancelled ? 0.65 : 1}
      >
        {isUser && item.queued && (
          <Badge size="xs" variant="light" color="blue" mb={6}>
            Queued
          </Badge>
        )}
        {isUser && item.kind === "user" && item.images && item.images.length > 0 && (
          <Group gap="xs" mb={item.text ? 6 : 0}>
            {item.images.map((img) => (
              <ChatMessageImage key={img.id} src={img.url} alt={img.name} />
            ))}
          </Group>
        )}
        {item.kind === "assistant" && !item.streaming ? (
          <MarkdownText text={item.text} />
        ) : (
          <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {item.text}
            {item.kind === "assistant" && item.streaming && (
              <Text span c="teal.4" inherit>
                ▍
              </Text>
            )}
          </Text>
        )}
        {item.kind === "assistant" && item.cancelled && (
          <Text span c="dimmed" size="xs" mt={4} display="block">
            (stopped)
          </Text>
        )}
      </Paper>
    </Box>
  );
}

function ChatMessageImage({ src, alt }: { src: string; alt: string }) {
  const openPreview = () => {
    modals.open({
      title: alt,
      centered: true,
      size: "lg",
      children: (
        <Center>
          {src.startsWith("blob:") ? (
            <Image src={src} alt={alt} maw="100%" mah="70vh" fit="contain" radius="sm" />
          ) : (
            <AuthImage src={src} alt={alt} w={320} h={320} />
          )}
        </Center>
      ),
    });
  };

  if (src.startsWith("blob:")) {
    return (
      <UnstyledButton onClick={openPreview} aria-label={`View ${alt}`} style={{ cursor: "pointer" }}>
        <Image src={src} alt={alt} w={96} h={96} fit="cover" radius="sm" />
      </UnstyledButton>
    );
  }

  return <AuthImage src={src} alt={alt} w={96} h={96} onClick={openPreview} />;
}

function ComposerAttachButton({
  libraryInputRef,
  cameraInputRef,
  size = 44,
}: {
  libraryInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  size?: number;
}) {
  const iconSize = size >= 44 ? 20 : 18;
  return (
    <Menu position="top-end" withinPortal>
      <Menu.Target>
        <ActionIcon size={size} radius="xl" variant="light" color="gray" aria-label="Attach">
          <IconPaperclip size={iconSize} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPhoto size={16} />} onClick={() => libraryInputRef.current?.click()}>
          Photo library
        </Menu.Item>
        <Menu.Item leftSection={<IconCamera size={16} />} onClick={() => cameraInputRef.current?.click()}>
          Take photo
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function ComposerInput({
  tgLayout,
  text,
  setText,
  placeholder,
  onPaste,
  onSend,
  canSend,
  sending,
  isRunning,
  recording,
  transcribing,
  onVoice,
  libraryInputRef,
  cameraInputRef,
  onPhotoSelected,
}: {
  tgLayout: boolean;
  text: string;
  setText: (v: string) => void;
  placeholder: string;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  canSend: boolean;
  sending: boolean;
  isRunning: boolean;
  recording: boolean;
  transcribing: boolean;
  onVoice: () => void;
  libraryInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  onPhotoSelected: (file: File | null) => void;
}) {
  const actionSize = tgLayout ? 40 : 44;
  const iconSize = tgLayout ? 18 : 20;

  const textarea = (
    <Textarea
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      onPaste={onPaste}
      autosize
      minRows={1}
      maxRows={tgLayout ? 4 : 6}
      styles={{ input: { minHeight: tgLayout ? 40 : 44, fontSize: 16 } }}
      style={{ flex: 1, minWidth: 0, width: "100%" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !tgLayout) {
          e.preventDefault();
          void onSend();
        }
      }}
    />
  );

  const sendButton = (
    <ActionIcon
      size={actionSize}
      radius="xl"
      variant="filled"
      color="teal"
      loading={sending}
      disabled={!canSend || transcribing || recording}
      onClick={() => void onSend()}
      aria-label={isRunning ? "Add to queue" : "Send"}
    >
      <IconSend size={iconSize} />
    </ActionIcon>
  );

  const fileInputs = (
    <>
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onPhotoSelected(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onPhotoSelected(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
    </>
  );

  const voiceButton = (
    <ActionIcon
      size={actionSize}
      radius="xl"
      variant={recording ? "filled" : "light"}
      color={recording ? "red" : "gray"}
      loading={transcribing}
      onClick={onVoice}
      aria-label={recording ? "Stop recording" : "Voice input"}
    >
      <IconMicrophone size={iconSize} />
    </ActionIcon>
  );

  const attachButton = (
    <ComposerAttachButton
      libraryInputRef={libraryInputRef}
      cameraInputRef={cameraInputRef}
      size={actionSize}
    />
  );

  if (tgLayout) {
    return (
      <Stack gap={6} style={{ width: "100%" }}>
        {fileInputs}
        {textarea}
        <Group justify="flex-end" gap={6} wrap="nowrap">
          {attachButton}
          {voiceButton}
          {sendButton}
        </Group>
      </Stack>
    );
  }

  return (
    <Group align="flex-end" gap="xs" wrap="nowrap" style={{ width: "100%" }}>
      {fileInputs}
      {textarea}
      {attachButton}
      {voiceButton}
      {sendButton}
    </Group>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      resolve(raw.includes(",") ? raw.split(",")[1]! : raw);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
