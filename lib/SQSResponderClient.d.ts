import { Message } from '@aws-sdk/client-sqs';
import { SQSClientAdapter } from './SQSClientAdapter';
export declare class SQSResponderClient {
    private readonly sqs;
    constructor(sqs: SQSClientAdapter);
    sendResponseMessage(request: Message, response: Message): Promise<void>;
    isResponseMessageRequested(requestMessage: Message): boolean;
    getMessageResponseQueueUrl(requestMessage: Message): string | undefined;
}
