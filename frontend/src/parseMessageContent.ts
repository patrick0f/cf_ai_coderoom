export type ContentSegment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language: string };

const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

export function parseMessageContent(content: string): ContentSegment[] {
  if (!content) {
    return [];
  }

  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(CODE_BLOCK_REGEX)) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (matchStart > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, matchStart),
      });
    }

    segments.push({
      type: "code",
      content: match[2].replace(/\n$/, ""),
      language: match[1],
    });

    lastIndex = matchEnd;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return segments;
}
