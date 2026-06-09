import { Text } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownText({ text, size = "sm" }: { text: string; size?: string }) {
  return (
    <Text component="div" size={size} style={{ wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 0.5em" }}>{children}</p>,
          pre: ({ children }) => (
            <pre
              style={{
                margin: "0.5em 0",
                padding: "8px",
                borderRadius: 6,
                overflow: "auto",
                fontSize: "0.85em",
                background: "var(--mantine-color-dark-8)",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const inline = !className;
            if (inline) {
              return (
                <code
                  style={{
                    padding: "1px 4px",
                    borderRadius: 4,
                    fontSize: "0.9em",
                    background: "var(--mantine-color-dark-8)",
                  }}
                >
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          ul: ({ children }) => <ul style={{ margin: "0.25em 0", paddingLeft: "1.25em" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0.25em 0", paddingLeft: "1.25em" }}>{children}</ol>,
        }}
      >
        {text}
      </ReactMarkdown>
    </Text>
  );
}
