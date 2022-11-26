import { Message, SendMessageRequest } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import debug from 'debug';
import { RESPONSE_QUEUE_URL_ATTRIBUTE_NAME, VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE } from './constants';
import { Deferred } from './deferred';
import { ConsumerFn, SQSMessageConsumer } from './SQSMessageConsumer';
import { SQSClientAdapter } from './SQSClientAdapter';
import { QueueError } from './errors';

export class SQSRequesterClient {
  private readonly consumers = new Set<SQSMessageConsumer>();
  private debug = debug(`SQSRequesterClient`);

  constructor(
    private readonly sqs: SQSClientAdapter,
    private readonly queuePrefix: string,
    private readonly queueAttributes: Record<string, string> = {},
  ) {}

  setVirtualQueueOnHostQueue(hostQueueUrl: string): this {
    if (!hostQueueUrl.startsWith('http')) throw TypeError('Expected valid QueueUrl');
    this.queueAttributes[VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE] = hostQueueUrl;
    return this;
  }

  async sendMessageAndGetResponse(request: SendMessageRequest, timeoutMs: number) {
    const queueName = this.queuePrefix + randomUUID();

    const { QueueUrl: queueUrl } = await this.sqs.createQueue({
      QueueName: queueName,
      Attributes: this.queueAttributes,
    });

    if (!queueUrl) throw new Error('Cannot get QueueUrl');

    request.MessageAttributes = {
      ...request.MessageAttributes,
      [RESPONSE_QUEUE_URL_ATTRIBUTE_NAME]: {
        DataType: 'String',
        StringValue: queueUrl,
      },
    };
    this.debug('Sending request: %s', request.MessageBody);
    await this.sqs.sendMessage(request);

    const listener = new ResponseListener(this.sqs, queueUrl, async () => {
      this.debug(`Removing listener`);
      this.consumers.delete(listener);
      await this.sqs.deleteQueue({ QueueUrl: queueUrl });
    });
    this.consumers.add(listener);
    listener.runFor(timeoutMs);
    return listener.toPromise();
  }
}

class ResponseListener extends SQSMessageConsumer {
  private message = new Deferred<Message>();

  constructor(
    sqs: SQSClientAdapter,
    queueUrl: string,
    shutdownHook: ConsumerFn<void>,
    exceptionHandler: ConsumerFn<Error> = console.error,
    maxWaitMs: number = 2000,
  ) {
    super(sqs, queueUrl, (m: Message) => this.setMessage(m), {
      onShutdown: () => {
        this.message.reject(new TimeoutError(queueUrl));
        return shutdownHook();
      },
      onException: exceptionHandler,
      maxWaitMs,
    });
    this.debug = debug(`SQSRequesterClient:ResponseListener:${queueUrl.slice(-3)}`);
  }

  setMessage(m: Message) {
    this.message.resolve(m);
    this.shutdown();
  }

  toPromise() {
    return this.message.toPromise();
  }
}

export class TimeoutError extends QueueError {
  constructor(queueUrl: string) {
    super('Timeout waiting for response', queueUrl);
  }
}
