import { useEffect, useState } from "react";
import { Alert, Center, Container, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { login } from "./api.js";
import { ProjectsPage } from "./pages/Projects.js";
import { AgentChatPage } from "./pages/AgentChat.js";
import { IdeSessionPage } from "./pages/IdeSession.js";
import { isTelegramWebApp, useTelegramApp } from "./useTelegramApp.js";
import { useAppRoute } from "./router.js";

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, navigate] = useAppRoute();
  const [ideMeta, setIdeMeta] = useState<{ title: string; subtitle: string; canResume: boolean } | null>(
    null,
  );

  useTelegramApp();

  useEffect(() => {
    login()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const goProjects = () => navigate({ page: "projects" });
  const goAgent = (agentId: string) => navigate({ page: "agent", agentId });
  const goIde = (projectId: string, sessionId: string, meta?: { title: string; subtitle: string; canResume: boolean }) => {
    if (meta) setIdeMeta(meta);
    navigate({ page: "ide", projectId, sessionId });
  };

  if (error) {
    return (
      <Container py="xl" size="sm">
        <Alert icon={<IconAlertCircle size={16} />} title="Authentication failed" color="red">
          {error}
        </Alert>
      </Container>
    );
  }

  if (!ready) {
    return (
      <Center h="100dvh">
        <Stack align="center" gap="sm">
          <Loader color="teal" type="dots" />
          <Text c="dimmed" size="sm">
            Connecting…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (route.page === "agent") {
    return <AgentChatPage agentId={route.agentId} onBack={goProjects} />;
  }

  if (route.page === "ide") {
    return (
      <IdeSessionPage
        projectId={route.projectId}
        sessionId={route.sessionId}
        title={ideMeta?.title ?? "Cursor IDE chat"}
        subtitle={ideMeta?.subtitle ?? ""}
        canResume={ideMeta?.canResume ?? true}
        onBack={goProjects}
        onResumed={goAgent}
      />
    );
  }

  const inTelegram = isTelegramWebApp();

  return (
    <Container
      py="md"
      px="md"
      size="sm"
      pt={inTelegram ? "calc(var(--mantine-spacing-md) + var(--tg-safe-top))" : "md"}
      pb="calc(var(--mantine-spacing-md) + var(--tg-safe-bottom))"
    >
      <Stack gap="lg">
        <Title order={inTelegram ? 4 : 3} fw={500}>
          {inTelegram ? "Projects" : "Your projects"}
        </Title>
        <ProjectsPage onOpenAgent={goAgent} onOpenIdeSession={goIde} />
      </Stack>
    </Container>
  );
}
