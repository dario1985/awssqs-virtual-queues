import { CreateQueueCommandInput, CreateQueueCommandOutput, SendMessageCommandInput, SendMessageCommandOutput, ChangeMessageVisibilityCommandInput, ChangeMessageVisibilityCommandOutput, DeleteQueueCommandOutput, DeleteQueueCommandInput, DeleteMessageCommandOutput, DeleteMessageCommandInput, Message, ReceiveMessageCommandInput, ReceiveMessageCommandOutput } from '@aws-sdk/client-sqs';
import { SQSClientAdapter } from './SQSClientAdapter';
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
export declare class SQSVirtualQueuesClient extends SQSClientAdapter {
    private readonly hostQueues;
    private readonly virtualQueues;
    private readonly debug;
    getVirtualQueueByUrl(queueUrl: string): VirtualQueue | null;
    getVirtualQueue(queueName: string): VirtualQueue | null;
    createQueue(input: CreateQueueCommandInput): Promise<CreateQueueCommandOutput>;
    deleteQueue(input: DeleteQueueCommandInput): Promise<DeleteQueueCommandOutput>;
    sendMessage(input: SendMessageCommandInput): Promise<SendMessageCommandOutput>;
    receiveMessage(input: ReceiveMessageCommandInput): Promise<ReceiveMessageCommandOutput>;
    deleteMessage(input: DeleteMessageCommandInput): Promise<DeleteMessageCommandOutput>;
    changeMessageVisibility(input: ChangeMessageVisibilityCommandInput): Promise<ChangeMessageVisibilityCommandOutput>;
    close(): Promise<void>;
}
declare class HostQueue {
    private readonly sqs;
    readonly queueUrl: string;
    private readonly consumer;
    private readonly debug;
    constructor(sqs: SQSVirtualQueuesClient, queueUrl: string);
    private dispatchMessage;
    shutdown(): void;
}
declare class VirtualQueue {
    readonly id: VirtualQueueID;
    readonly buffer: ReceiveQueueBuffer;
    constructor(hostQueue: HostQueue, queueName: string);
    get name(): string;
    receiveMessage(input: ReceiveMessageCommandInput): Promise<ReceiveMessageCommandOutput>;
    shutdown(): void;
}
declare class VirtualQueueID {
    readonly hostQueueUrl: string;
    readonly virtualQueueName: string;
    constructor(hostQueueUrl: string, virtualQueueName: string);
    getQueueUrl(): string;
    static fromQueueUrl(queueUrl: string): VirtualQueueID | null;
}
export declare class ReceiveQueueBuffer {
    private readonly defaultWaitTimeMs;
    private messages;
    private closed;
    constructor(defaultWaitTimeMs?: number);
    deliver(message: Message): void;
    receiveMessage(maxMessages: number, waitTimeMs: number): Promise<Message[]>;
    close(): void;
}
export {};
