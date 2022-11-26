import { Message, QueueDoesNotExist } from '@aws-sdk/client-sqs';
import { RESPONSE_QUEUE_URL_ATTRIBUTE_NAME } from './constants';
import { SQSClientAdapter } from './SQSClientAdapter';

export class SQSResponderClient {
  constructor(private readonly sqs: SQSClientAdapter) {}
  async sendResponseMessage(request: Message, response: Message) {
    const replyQueueUrl = this.getMessageResponseQueueUrl(request);

    if (replyQueueUrl) {
      try {
        await this.sqs.sendMessage({
          QueueUrl: replyQueueUrl,
          MessageBody: response.Body,
          MessageAttributes: response.MessageAttributes,
        });
      } catch (e: any) {
        if (e instanceof QueueDoesNotExist) {
          // Stale request, ignore
          // TODO-RS: CW metric
          console.warn('Ignoring response to deleted response queue: ' + replyQueueUrl);
        }
        throw e;
      }
    } else {
      // TODO-RS: CW metric
      console.warn('Attempted to send response when none was requested');
    }
  }

  isResponseMessageRequested(requestMessage: Message) {
    return Boolean(this.getMessageResponseQueueUrl(requestMessage));
  }

  getMessageResponseQueueUrl(requestMessage: Message) {
    return requestMessage.MessageAttributes?.[RESPONSE_QUEUE_URL_ATTRIBUTE_NAME]?.StringValue;
  }
}
