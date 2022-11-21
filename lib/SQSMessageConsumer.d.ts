import { Message } from '@aws-sdk/client-sqs';
import { SQSClientAdapter } from './SQSClientAdapter';
import debug from 'debug';
export type ConsumerFn<T> = (message: T) => void | Promise<void>;
export declare class SQSMessageConsumer {
    protected readonly sqs: SQSClientAdapter;
    protected readonly queueUrl: string;
    protected readonly onMessage: ConsumerFn<Message>;
    protected readonly onShutdown: ConsumerFn<void>;
    protected readonly onException: ConsumerFn<Error>;
    protected readonly maxWaitMs: number;
    private deadlineMs;
    private shuttingDown;
    private terminated;
    protected debug: debug.Debugger;
    constructor(sqs: SQSClientAdapter, queueUrl: string, onMessage: ConsumerFn<Message>, onShutdown?: ConsumerFn<void>, onException?: ConsumerFn<Error>, maxWaitMs?: number);
    runFor(timeoutMs: number): void;
    start(): void;
    private handleException;
    shutdown(): void;
    terminate(): Promise<void>;
    private poll;
    handleMessage(message: Message): Promise<void>;
    private turnMessageVisible;
    private deleteMessage;
}
export declare class SQSMessageConsumerError extends Error {
    readonly internalError: Error;
    constructor(message: string, internalError: Error);
}
