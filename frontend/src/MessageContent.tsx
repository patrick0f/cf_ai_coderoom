import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { CodeBlock } from "./CodeBlock";

type MessageContentProps = {
  content: string;
};

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = String(children).replace(/\n$/, "");

    // Block code has className with language, inline code doesn't
    if (match) {
      return <CodeBlock code={codeString} language={match[1]} />;
    }

    // Inline code
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  },
  // Override pre to avoid double-wrapping block code
  pre({ children }) {
    return <>{children}</>;
  },
};

export function MessageContent({ content }: MessageContentProps) {
  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
}
