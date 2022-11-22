import { Message } from '@aws-sdk/client-sqs';
import { SQSClientAdapter } from './SQSClientAdapter';
import debug from 'debug';
export type ConsumerFn<T> = (message: T) => void | Promise<void>;
export interface SQSMessageConsumerOptions {
    onShutdown: ConsumerFn<void>;
    onException: ConsumerFn<Error>;
    maxWaitMs: number;
    heartBeatMs: number;
    disableDeleteMessage: boolean;
}
export declare class SQSMessageConsumer {
    protected readonly sqs: SQSClientAdapter;
    protected readonly queueUrl: string;
    protected readonly onMessage: ConsumerFn<Message>;
    private deadlineMs;
    private shuttingDown;
    private terminated;
    protected readonly options: SQSMessageConsumerOptions;
    protected debug: debug.Debugger;
    constructor(sqs: SQSClientAdapter, queueUrl: string, onMessage: ConsumerFn<Message>, options?: Partial<SQSMessageConsumerOptions>);
    runFor(timeoutMs: number): void;
    start(): void;
    private handleException;
    shutdown(): void;
    terminate(): Promise<void>;
    private poll;
    handleMessage(message: Message): Promise<void>;
    protected deleteCompletedMessage(message: Message): Promise<void>;
    private turnMessageVisible;
    private deleteMessage;
}
export declare class SQSMessageConsumerError extends Error {
    readonly internalError: Error;
    constructor(message: string, internalError: Error);
}
