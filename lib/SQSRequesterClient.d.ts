import { Message, SendMessageRequest } from '@aws-sdk/client-sqs';
import { SQSClientAdapter } from './SQSClientAdapter';
export declare class SQSRequesterClient {
    private readonly sqs;
    private readonly queuePrefix;
    private readonly queueAttributes;
    private readonly consumers;
    private debug;
    constructor(sqs: SQSClientAdapter, queuePrefix: string, queueAttributes?: Record<string, string>);
    sendMessageAndGetResponse(request: SendMessageRequest, timeoutMs: number): Promise<Message>;
}
export declare class TimeoutError extends Error {
}
