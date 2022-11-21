import { ReceiveMessageCommandInput, ReceiveMessageCommandOutput } from '@aws-sdk/client-sqs';
import { SQSClient, CreateQueueCommandInput, CreateQueueCommandOutput, SendMessageCommandInput, SendMessageCommandOutput, ChangeMessageVisibilityCommandInput, ChangeMessageVisibilityCommandOutput, DeleteQueueCommandOutput, DeleteQueueCommandInput, DeleteMessageCommandOutput, DeleteMessageCommandInput } from '@aws-sdk/client-sqs';
export declare class SQSClientAdapter {
    private readonly sqs;
    constructor(sqs: SQSClient);
    createQueue(input: CreateQueueCommandInput): Promise<CreateQueueCommandOutput>;
    deleteQueue(input: DeleteQueueCommandInput): Promise<DeleteQueueCommandOutput>;
    receiveMessage(input: ReceiveMessageCommandInput): Promise<ReceiveMessageCommandOutput>;
    sendMessage(input: SendMessageCommandInput): Promise<SendMessageCommandOutput>;
    changeMessageVisibility(input: ChangeMessageVisibilityCommandInput): Promise<ChangeMessageVisibilityCommandOutput>;
    deleteMessage(input: DeleteMessageCommandInput): Promise<DeleteMessageCommandOutput>;
}
