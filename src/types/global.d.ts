/// <reference lib="dom" />

interface ReadableStream<R = Uint8Array> extends globalThis.ReadableStream<R> {}

type ReadableStreamDefaultReadResult<T> =
  | {
      done: false;
      value: T;
    }
  | {
      done: true;
      value?: T;
    };

interface ReadableStreamDefaultReader<R = Uint8Array> {
  read(): Promise<ReadableStreamDefaultReadResult<R>>;
  releaseLock(): void;
  closed: Promise<void>;
  cancel(reason?: any): Promise<void>;
}

interface ReadableStreamReadResult<T> {
  done: boolean;
  value: T | undefined;
}

interface Response {
  body: ReadableStream<Uint8Array> | null;
}
