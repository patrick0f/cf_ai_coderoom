export type SSEMetaEvent = { type: "meta"; seq: number };
export type SSEDeltaEvent = { type: "delta"; content: string };
export type SSEDoneEvent = { type: "done"; totalChars: number };
export type SSEErrorEvent = {
  type: "error";
  code: string;
  message: string;
  partial?: string;
};
export type SSEEvent =
  | SSEMetaEvent
  | SSEDeltaEvent
  | SSEDoneEvent
  | SSEErrorEvent;
