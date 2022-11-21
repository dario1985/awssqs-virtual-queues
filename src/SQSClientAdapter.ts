import { ReceiveMessageCommand, ReceiveMessageCommandInput, ReceiveMessageCommandOutput } from '@aws-sdk/client-sqs';
import {
  SQSClient,
  CreateQueueCommand,
  CreateQueueCommandInput,
  CreateQueueCommandOutput,
  SendMessageCommand,
  SendMessageCommandInput,
  SendMessageCommandOutput,
  ChangeMessageVisibilityCommand,
  ChangeMessageVisibilityCommandInput,
  ChangeMessageVisibilityCommandOutput,
  DeleteQueueCommand,
  DeleteQueueCommandOutput,
  DeleteQueueCommandInput,
  DeleteMessageCommand,
  DeleteMessageCommandOutput,
  DeleteMessageCommandInput,
} from '@aws-sdk/client-sqs';
export class SQSClientAdapter {
  constructor(private readonly sqs: SQSClient) {}

  createQueue(input: CreateQueueCommandInput): Promise<CreateQueueCommandOutput> {
    return this.sqs.send(new CreateQueueCommand(input));
  }

  deleteQueue(input: DeleteQueueCommandInput): Promise<DeleteQueueCommandOutput> {
    return this.sqs.send(new DeleteQueueCommand(input));
  }

  receiveMessage(input: ReceiveMessageCommandInput): Promise<ReceiveMessageCommandOutput> {
    return this.sqs.send(new ReceiveMessageCommand(input));
  }

  sendMessage(input: SendMessageCommandInput): Promise<SendMessageCommandOutput> {
    return this.sqs.send(new SendMessageCommand(input));
  }

  changeMessageVisibility(input: ChangeMessageVisibilityCommandInput): Promise<ChangeMessageVisibilityCommandOutput> {
    return this.sqs.send(new ChangeMessageVisibilityCommand(input));
  }

  deleteMessage(input: DeleteMessageCommandInput): Promise<DeleteMessageCommandOutput> {
    return this.sqs.send(new DeleteMessageCommand(input));
  }
}
