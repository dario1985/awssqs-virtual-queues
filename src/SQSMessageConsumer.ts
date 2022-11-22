import { Message, QueueDoesNotExist } from '@aws-sdk/client-sqs';
import { Deferred } from './deferred';
import { SQSClientAdapter } from './SQSClientAdapter';
import debug from 'debug';
import { wait } from './utils';
import { QueueError } from './errors';

export type ConsumerFn<T> = (message: T) => void | Promise<void>;

export interface SQSMessageConsumerOptions {
  onShutdown: ConsumerFn<void>;
  onException: ConsumerFn<Error>;
  maxWaitMs: number;
  heartBeatMs: number;
  disableDeleteMessage: boolean;
}

export class SQSMessageConsumer {
  private deadlineMs: number = 0;
  private shuttingDown: boolean = false;
  private terminated = new Deferred<boolean>();

  protected readonly options: SQSMessageConsumerOptions;
  protected debug: debug.Debugger;

  constructor(
    protected readonly sqs: SQSClientAdapter,
    protected readonly queueUrl: string,
    protected readonly onMessage: ConsumerFn<Message>,
    options?: Partial<SQSMessageConsumerOptions>,
  ) {
    this.options = {
      onShutdown: () => {},
      onException: console.error,
      maxWaitMs: 2_000,
      heartBeatMs: 5_000,
      disableDeleteMessage: false,
      ...options,
    };
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

  private async handleException(e: any) {
    return this.options.onException(e);
  }

  shutdown() {
    if (!this.shuttingDown) {
      this.debug('Shutting down...');
      this.shuttingDown = true;
      try {
        const ret = this.options.onShutdown();
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
      let waitMs = this.options.maxWaitMs;
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
          await Promise.allSettled(messages.map((m) => this.handleMessage(m)));
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
      await this.deleteCompletedMessage(message);
    } catch (e: any) {
      await this.handleException(
        e instanceof QueueError
          ? e
          : new SQSMessageConsumerError(`Error processing message #${message.MessageId}: ${e.message}`, e),
      );
      await this.turnMessageVisible(message);
    }
  }

  protected async deleteCompletedMessage(message: Message) {
    if (this.options.disableDeleteMessage) {
      return;
    }

    try {
      await this.deleteMessage(message);
    } catch (e: any) {
      if (e instanceof QueueDoesNotExist) {
        return; // Ignore
      }
      await this.handleException(
        new SQSMessageConsumerError(`Error deleting message #${message.MessageId}: ${e.message}`, e),
      );
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
