export interface Ingestor {
  start(): void | Promise<void>;
  stop(): void;
}
