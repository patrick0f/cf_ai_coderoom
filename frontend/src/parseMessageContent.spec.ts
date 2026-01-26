import { describe, expect, test } from "vitest";
import { parseMessageContent } from "./parseMessageContent";

describe("parseMessageContent", () => {
  test("returns single text segment for plain text", () => {
    const result = parseMessageContent("Hello, world!");
    expect(result).toEqual([{ type: "text", content: "Hello, world!" }]);
  });

  test("returns empty array for empty content", () => {
    const result = parseMessageContent("");
    expect(result).toEqual([]);
  });

  test("extracts code block with language", () => {
    const input = "Here is some code:\n```javascript\nconst x = 1;\n```";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "text", content: "Here is some code:\n" },
      { type: "code", content: "const x = 1;", language: "javascript" },
    ]);
  });

  test("extracts code block without language", () => {
    const input = "Example:\n```\nsome code\n```";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "text", content: "Example:\n" },
      { type: "code", content: "some code", language: "" },
    ]);
  });

  test("handles multiple code blocks", () => {
    const input =
      "First:\n```js\nconst a = 1;\n```\nSecond:\n```python\nx = 2\n```";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "text", content: "First:\n" },
      { type: "code", content: "const a = 1;", language: "js" },
      { type: "text", content: "\nSecond:\n" },
      { type: "code", content: "x = 2", language: "python" },
    ]);
  });

  test("preserves whitespace in code blocks", () => {
    const input = "```\n  indented\n    more\n```";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "code", content: "  indented\n    more", language: "" },
    ]);
  });

  test("handles text after code block", () => {
    const input = "Before:\n```ts\ncode\n```\nAfter text";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "text", content: "Before:\n" },
      { type: "code", content: "code", language: "ts" },
      { type: "text", content: "\nAfter text" },
    ]);
  });

  test("handles code block at start of content", () => {
    const input = '```json\n{"key": "value"}\n```\nExplanation';
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "code", content: '{"key": "value"}', language: "json" },
      { type: "text", content: "\nExplanation" },
    ]);
  });

  test("handles only code block content", () => {
    const input = "```bash\necho hello\n```";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      { type: "code", content: "echo hello", language: "bash" },
    ]);
  });

  test("handles multiline code blocks", () => {
    const input = "```typescript\nfunction foo() {\n  return 1;\n}\n```";
    const result = parseMessageContent(input);
    expect(result).toEqual([
      {
        type: "code",
        content: "function foo() {\n  return 1;\n}",
        language: "typescript",
      },
    ]);
  });
});
