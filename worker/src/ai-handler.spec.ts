import { describe, test, expect, vi } from "vitest";
import { generateAssistantResponse } from "./ai-handler";
import type { AiMessage } from "./ai-context";

const createMockAi = (returnValue: unknown) =>
  ({
    run: vi.fn().mockResolvedValue(returnValue),
  }) as unknown as Ai;

const testMessages: AiMessage[] = [{ role: "user", content: "Hello" }];

describe("generateAssistantResponse", () => {
  test("returns response string from AI", async () => {
    const mockAi = createMockAi({ response: "Hello there!" });

    const result = await generateAssistantResponse(mockAi, testMessages);

    expect(result).toBe("Hello there!");
  });

  test("throws when AI returns null", async () => {
    const mockAi = createMockAi(null);

    await expect(
      generateAssistantResponse(mockAi, testMessages),
    ).rejects.toThrow("Invalid AI response format");
  });

  test("throws when AI returns object without response field", async () => {
    const mockAi = createMockAi({ content: "wrong field" });

    await expect(
      generateAssistantResponse(mockAi, testMessages),
    ).rejects.toThrow("Invalid AI response format");
  });

  test("throws when response field is null", async () => {
    const mockAi = createMockAi({ response: null });

    await expect(
      generateAssistantResponse(mockAi, testMessages),
    ).rejects.toThrow("AI response content is not a string or object");
  });

  test("throws when response field is undefined", async () => {
    const mockAi = createMockAi({ response: undefined });

    await expect(
      generateAssistantResponse(mockAi, testMessages),
    ).rejects.toThrow("AI response content is not a string or object");
  });

  test("stringifies response when AI returns object directly", async () => {
    const mockAi = createMockAi({
      response: { summary: "Test review", issues: [] },
    });

    const result = await generateAssistantResponse(mockAi, testMessages);

    expect(result).toBe('{"summary":"Test review","issues":[]}');
  });

  test("returns empty string when response field is empty string", async () => {
    const mockAi = createMockAi({ response: "" });

    const result = await generateAssistantResponse(mockAi, testMessages);

    expect(result).toBe("");
  });

  test("truncates response exceeding max output chars", async () => {
    const longResponse = "a".repeat(10000);
    const mockAi = createMockAi({ response: longResponse });

    const result = await generateAssistantResponse(mockAi, testMessages);

    expect(result.length).toBe(8000);
  });
});
