import { Message } from '@aws-sdk/client-sqs';
import { SQSClientAdapter } from './SQSClientAdapter';
export declare class AmazonSQSResponderClient {
    private readonly sqs;
    constructor(sqs: SQSClientAdapter);
    sendResponseMessage(request: Message, response: Message): Promise<void>;
    isResponseMessageRequested(requestMessage: Message): boolean | undefined;
}
