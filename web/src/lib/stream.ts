/** Read a newline-delimited JSON stream, calling `onLine` for each parsed line as it arrives. */
export async function readNdjson<T>(body: ReadableStream<Uint8Array>, onLine: (value: T) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (line: string) => {
    const trimmed = line.trim();
    if (trimmed) onLine(JSON.parse(trimmed) as T);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      flush(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  flush(buffer);
}
