import {
  CreateQueueCommandInput,
  CreateQueueCommandOutput,
  SendMessageCommandInput,
  SendMessageCommandOutput,
  ChangeMessageVisibilityCommandInput,
  ChangeMessageVisibilityCommandOutput,
  DeleteQueueCommandOutput,
  DeleteQueueCommandInput,
  DeleteMessageCommandOutput,
  DeleteMessageCommandInput,
  Message,
  ReceiveMessageCommandInput,
  ReceiveMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE } from './constants';
import { SQSClientAdapter } from './SQSClientAdapter';
import { QueueDoesNotExist } from '@aws-sdk/client-sqs';
import { SQSMessageConsumer } from './SQSMessageConsumer';
import { wait } from './utils';
import debug from 'debug';
import { QueueError } from './errors';

const MAXIMUM_VIRTUAL_QUEUES_COUNT = 1_000_000;
const VIRTUAL_QUEUE_NAME_ATTRIBUTE = '__AmazonSQSVirtualQueuesClient.QueueName';

/**
 * An AmazonSQS wrapper that adds support for "virtual" queues, which are logical
 * queues hosted by an actual "physical" SQS queue.
 * <p>
 * Virtual queues are created by invoking {@link #createQueue(CreateQueueRequest)} with the
 * "HostQueueUrl" queue attribute set to the URL of an existing physical queue. This will create
 * in-memory buffers but will not cause any outgoing calls to SQS. The returned queue
 * URL will include both the host URL and the requested queue name, separated by a '#'. For example:
 *
 * <pre>
 * https://sqs.us-west-2.amazonaws.com/1234566789012/MyHostQueue#MyVirtualQueue
 * </pre>
 *
 * When a message is sent to a virtual queue URL, this client will send the message to the host queue,
 * but with an additional message attribute set to the name of the virtual queue.
 * <p>
 * On the consuming side,
 * receives to virtual queues are multiplexed into long-poll receives on the host queue. As messages are
 * received from the host queue, a background thread will dispatch them to waiting virtual queue receives
 * according to the message attribute.
 * <p>
 * Virtual queues are also automatically deleted after a configurable period with no API calls, to avoid exhausting
 * memory if client code is failing to delete them explicitly. The "IdleQueueRetentionPeriodSeconds" queue
 * attribute configures the length of this period. See the {@link AmazonSQSIdleQueueDeletingClient} class,
 * which implements this concept for physical SQS queues, for more details.
 */
export class SQSVirtualQueuesClient extends SQSClientAdapter {
  private readonly hostQueues = new Map<string, HostQueue>();
  private readonly virtualQueues = new Map<string, VirtualQueue>();
  private readonly debug = debug('SQSVirtualQueuesClient');

  getVirtualQueueByUrl(queueUrl: string): VirtualQueue | null {
    const optionalVirtualQueueId = VirtualQueueID.fromQueueUrl(queueUrl);
    if (optionalVirtualQueueId) {
      const virtualQueue = this.getVirtualQueue(optionalVirtualQueueId.virtualQueueName);
      if (!virtualQueue) {
        throw new QueueDoesNotExist({
          message: 'The specified queue does not exist',
          $metadata: {},
        });
      }
      return virtualQueue;
    } else {
      return null;
    }
  }

  getVirtualQueue(queueName: string): VirtualQueue | null {
    return this.virtualQueues.get(queueName) ?? null;
  }

  async createQueue(input: CreateQueueCommandInput): Promise<CreateQueueCommandOutput> {
    const hostQueueUrl = input.Attributes?.[VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE];
    if (!hostQueueUrl) {
      this.debug('Creating host queue: %j', input);
      return super.createQueue(input);
    }

    const { [VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE]: _, ...attributes } = input?.Attributes ?? {};

    const attributesKeys = Object.keys(attributes);
    if (attributesKeys.length) {
      throw new TypeError(
        'Virtual queues do not support setting these queue attributes independently of their host queues: ' +
          attributesKeys.join(','),
      );
    }

    if (!this.hostQueues.has(hostQueueUrl)) {
      this.hostQueues.set(hostQueueUrl, new HostQueue(this, hostQueueUrl));
    }
    const hostQueue = this.hostQueues.get(hostQueueUrl) as HostQueue;

    const virtualQueue = new VirtualQueue(hostQueue, input.QueueName as string);

    // There is clearly a race condition here between checking the size and
    // adding to the map, but that's fine since this is just a loose upper bound
    // and it avoids synchronizing all calls on something like an AtomicInteger.
    // The worse case scenario is that the map has X entries more than the maximum
    // where X is the number of threads concurrently creating queues.
    if (this.virtualQueues.size > MAXIMUM_VIRTUAL_QUEUES_COUNT) {
      throw new Error(
        'Cannot create virtual queue: the number of virtual queues would exceed the maximum of ' +
          MAXIMUM_VIRTUAL_QUEUES_COUNT,
      );
    }
    this.virtualQueues.set(virtualQueue.id.virtualQueueName, virtualQueue);

    this.debug('Created virtual queue: %s', virtualQueue.id.getQueueUrl());
    return {
      QueueUrl: virtualQueue.id.getQueueUrl(),
      $metadata: {},
    };
  }

  async deleteQueue(input: DeleteQueueCommandInput): Promise<DeleteQueueCommandOutput> {
    const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl as string);
    if (virtualQueue) {
      virtualQueue.shutdown();
      this.virtualQueues.delete(virtualQueue.id.virtualQueueName);
      return { $metadata: {} };
    }
    return super.deleteQueue(input);
  }

  sendMessage(input: SendMessageCommandInput): Promise<SendMessageCommandOutput> {
    const virtualQueueID = VirtualQueueID.fromQueueUrl(input.QueueUrl as string);
    this.debug('Sending message to: %s using virtual queue %o', input.QueueUrl, virtualQueueID);
    if (virtualQueueID) {
      input.MessageAttributes = {
        ...input.MessageAttributes,
        [VIRTUAL_QUEUE_NAME_ATTRIBUTE]: {
          DataType: 'String',
          StringValue: virtualQueueID.virtualQueueName,
        },
      };
      input.QueueUrl = virtualQueueID.hostQueueUrl;
      return super.sendMessage(input);
    }
    return super.sendMessage(input);
  }

  receiveMessage(input: ReceiveMessageCommandInput): Promise<ReceiveMessageCommandOutput> {
    const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl as string);
    if (virtualQueue) {
      return virtualQueue.receiveMessage(input);
    }
    return super.receiveMessage(input);
  }

  deleteMessage(input: DeleteMessageCommandInput): Promise<DeleteMessageCommandOutput> {
    const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl as string);
    if (virtualQueue) {
      input = { ...input, QueueUrl: virtualQueue.id.hostQueueUrl };
    }
    return super.deleteMessage(input);
  }

  changeMessageVisibility(input: ChangeMessageVisibilityCommandInput): Promise<ChangeMessageVisibilityCommandOutput> {
    const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl as string);
    if (virtualQueue) {
      input = { ...input, QueueUrl: virtualQueue.id.hostQueueUrl };
    }
    return super.changeMessageVisibility(input);
  }

  async close() {
    await Promise.all([...this.hostQueues.values(), ...this.virtualQueues.values()].map((hq) => hq.shutdown()));
  }
}

class HostQueue {
  private readonly consumer: SQSMessageConsumer;
  private readonly debug: debug.Debugger;
  constructor(private readonly sqs: SQSVirtualQueuesClient, readonly queueUrl: string) {
    this.debug = debug(`HostQueue:${queueUrl.slice(-3)}`);
    this.consumer = new SQSMessageConsumer(this.sqs, queueUrl, (m) => this.dispatchMessage(m), {
      onException: (e: any) => {
        if (!(e instanceof UnhandledVirtualQueueError)) {
          console.error(e);
        }
      },
      disableDeleteMessage: true,
    });
    this.consumer.start();
  }

  private async dispatchMessage(m: Message) {
    const virtualQueueName = m.MessageAttributes?.[VIRTUAL_QUEUE_NAME_ATTRIBUTE]?.StringValue;
    if (!virtualQueueName) {
      // Orphan message
      this.debug('Cannot dispatch orphan message: %o', m);
      return;
    }

    const virtualQueue = this.sqs.getVirtualQueue(virtualQueueName);
    if (virtualQueue) {
      this.debug(`Dispatched message ${m.ReceiptHandle} on virtual queue "${virtualQueue.name}"`);
      virtualQueue.buffer.deliver(m);
    } else {
      this.debug(`Virtual queue "${virtualQueueName}" not handled here.`);
      throw new UnhandledVirtualQueueError(virtualQueueName);
    }
  }

  shutdown() {
    return this.consumer.shutdown();
  }
}

class VirtualQueue {
  readonly id: VirtualQueueID;
  readonly buffer = new ReceiveQueueBuffer();

  constructor(hostQueue: HostQueue, queueName: string) {
    this.id = new VirtualQueueID(hostQueue.queueUrl, queueName);
  }

  get name() {
    return this.id.virtualQueueName;
  }

  async receiveMessage(input: ReceiveMessageCommandInput): Promise<ReceiveMessageCommandOutput> {
    const waitTimeMs = (input.WaitTimeSeconds ?? 0) * 1000;
    const maxMessages = Math.max(0, Math.min(1, input.MaxNumberOfMessages ?? 1));
    return {
      Messages: await this.buffer.receiveMessage(maxMessages, waitTimeMs),
      $metadata: {},
    };
  }

  shutdown() {
    this.buffer.close();
  }
}

class VirtualQueueID {
  constructor(readonly hostQueueUrl: string, readonly virtualQueueName: string) {}

  getQueueUrl() {
    return `${this.hostQueueUrl}#${this.virtualQueueName}`;
  }

  static fromQueueUrl(queueUrl: string): VirtualQueueID | null {
    const index = queueUrl.indexOf('#');
    if (index > -1) {
      return new VirtualQueueID(queueUrl.slice(0, index), queueUrl.slice(index + 1));
    } else {
      return null;
    }
  }
}

export class ReceiveQueueBuffer {
  private messages: Message[] = [];
  private closed = false;

  constructor(private readonly defaultWaitTimeMs: number = 10_000) {}

  deliver(message: Message) {
    if (this.closed) {
      throw new Error('Buffer closed');
    }
    this.messages.push(message);
  }

  async receiveMessage(maxMessages: number, waitTimeMs: number): Promise<Message[]> {
    const deadlineWaitMs = Date.now() + waitTimeMs;
    const result: Message[] = [];
    waitTimeMs = waitTimeMs || this.defaultWaitTimeMs;
    while (!this.closed && Date.now() < deadlineWaitMs && result.length < maxMessages) {
      result.push(...this.messages.splice(0, Math.min(maxMessages, maxMessages - result.length)));
      if (result.length < maxMessages) {
        await wait(Math.min(waitTimeMs, Math.max(0, deadlineWaitMs - Date.now())));
      }
    }
    return result;
  }

  close() {
    this.closed = true;
  }
}

class UnhandledVirtualQueueError extends QueueError {
  constructor(queueName: string) {
    super(`Virtual queue "${queueName}" not handled here.`, queueName);
  }
}
