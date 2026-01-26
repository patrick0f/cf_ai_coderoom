import { useMemo } from "react";
import { parseMessageContent } from "./parseMessageContent";
import { CodeBlock } from "./CodeBlock";

type MessageContentProps = {
  content: string;
};

export function MessageContent({ content }: MessageContentProps) {
  const segments = useMemo(() => parseMessageContent(content), [content]);

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "code" ? (
          <CodeBlock
            key={index}
            code={segment.content}
            language={segment.language}
          />
        ) : (
          <span key={index}>{segment.content}</span>
        ),
      )}
    </>
  );
}
