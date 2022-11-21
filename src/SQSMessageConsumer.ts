import { Message, QueueDoesNotExist } from '@aws-sdk/client-sqs';
import { Deferred } from './deferred';
import { SQSClientAdapter } from './SQSClientAdapter';
import debug from 'debug';
import { wait } from './utils';

export type ConsumerFn<T> = (message: T) => void | Promise<void>;

export class SQSMessageConsumer {
  private deadlineMs: number = 0;
  private shuttingDown: boolean = false;
  private terminated = new Deferred<boolean>();
  protected debug: debug.Debugger;

  constructor(
    protected readonly sqs: SQSClientAdapter,
    protected readonly queueUrl: string,
    protected readonly onMessage: ConsumerFn<Message>,
    protected readonly onShutdown: ConsumerFn<void> = () => {},
    protected readonly onException: ConsumerFn<Error> = console.error,
    protected readonly maxWaitMs: number = 2000,
  ) {
    this.debug = debug(`SQSMessageConsumer:${queueUrl.slice(-3)}`);
  }

  runFor(timeoutMs: number) {
    this.deadlineMs = Date.now() + timeoutMs;
    this.start();
  }

  start() {
    this.debug('Start polling messages...');
    setImmediate(async () => {
      try {
        await this.poll();
      } catch (e: any) {
        this.shutdown();
        await this.handleException(e);
      } finally {
        this.terminated.resolve(true);
      }
    });
  }

  private handleException(e: any) {
    return this.onException(e);
  }

  shutdown() {
    if (!this.shuttingDown) {
      this.debug('Shutting down...');
      this.shuttingDown = true;
      try {
        const ret = this.onShutdown();
        if (ret instanceof Promise) {
          ret.catch((e) => this.handleException(e));
        }
      } catch (e: any) {
        this.handleException(e);
      }
    }
  }

  async terminate() {
    this.shutdown();
    let timeout = setTimeout(() => this.terminated.resolve(true), 30_000);
    try {
      await this.terminated.toPromise();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async poll() {
    while (!this.shuttingDown) {
      const currentMs = Date.now();
      let waitMs = this.maxWaitMs;
      if (this.deadlineMs > 0) {
        if (currentMs >= this.deadlineMs) {
          this.shutdown();
          break;
        } else {
          waitMs = Math.max(0, Math.min(waitMs, this.deadlineMs - currentMs));
        }
      }

      try {
        this.debug('Checking messages...');
        const { Messages: messages } = await this.sqs.receiveMessage({
          QueueUrl: this.queueUrl,
          WaitTimeSeconds: Math.round(waitMs / 1000),
          MaxNumberOfMessages: 10,
          MessageAttributeNames: ['All'],
        });
        this.debug('Received %d messages', messages?.length ?? 0);
        if (messages?.length) {
          await Promise.all(messages.map((m) => this.handleMessage(m)));
        }
      } catch (e: any) {
        if (e instanceof QueueDoesNotExist) {
          // Ignore, it may be recreated!
          // Slow down on the polling though, to avoid tight looping.
          // This can be treated similar to an empty queue.
          await wait(1000);
        } else {
          await this.handleException(e);
        }
      }
    }
  }

  async handleMessage(message: Message) {
    // If shutting down make message visible
    if (this.shuttingDown) {
      return this.turnMessageVisible(message);
    }

    // Handle message
    try {
      await this.onMessage(message);
      await this.deleteMessage(message);
    } catch (e: any) {
      if (e instanceof QueueDoesNotExist) {
        return; // Ignore
      }
      await this.handleException(
        new SQSMessageConsumerError(`Error processing message #${message.MessageId}: ${e.message}`, e),
      );
      await this.turnMessageVisible(message);
    }
  }

  private async turnMessageVisible(message: Message) {
    try {
      await this.sqs.changeMessageVisibility({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: 0,
      });
    } catch (e: any) {
      if (e instanceof QueueDoesNotExist) {
        return; // Ignore
      }
      this.handleException(
        new SQSMessageConsumerError(`Error changing message visibility #${message.MessageId}: ${e.message}`, e),
      );
    }
  }

  private async deleteMessage(message: Message) {
    try {
      this.debug('Deleting message %s', message.ReceiptHandle);
      await this.sqs.deleteMessage({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      });
    } catch (e: any) {
      if (e instanceof QueueDoesNotExist) {
        return; // Ignore
      }
      this.handleException(
        new SQSMessageConsumerError(`Error deleting message #${message.MessageId}: ${e.message}`, e),
      );
    }
  }
}

export class SQSMessageConsumerError extends Error {
  constructor(message: string, readonly internalError: Error) {
    super(message);
  }
}
