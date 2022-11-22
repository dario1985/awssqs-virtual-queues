export abstract class QueueError extends Error {
  constructor(message: string, readonly queueUrl: string) {
    super(message);
  }
}
