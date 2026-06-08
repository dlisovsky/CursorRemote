import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./tma.css";
import { App } from "./App";

const theme = createTheme({
  primaryColor: "teal",
  defaultRadius: "md",
  fontFamily: "Geist Sans, system-ui, sans-serif",
  headings: { fontFamily: "Geist Sans, system-ui, sans-serif" },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ModalsProvider>
        <Notifications position="top-center" limit={2} zIndex={1000} />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
