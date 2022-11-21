import { Message, QueueDoesNotExist } from '@aws-sdk/client-sqs';
import { RESPONSE_QUEUE_URL_ATTRIBUTE_NAME } from './constants';
import { SQSClientAdapter } from './SQSClientAdapter';

export class AmazonSQSResponderClient {
  constructor(private readonly sqs: SQSClientAdapter) {}
  async sendResponseMessage(request: Message, response: Message) {
    const replyQueueUrl = request.MessageAttributes?.[RESPONSE_QUEUE_URL_ATTRIBUTE_NAME]?.StringValue;

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
      }
    } else {
      // TODO-RS: CW metric
      console.warn('Attempted to send response when none was requested');
    }
  }

  isResponseMessageRequested(requestMessage: Message) {
    return requestMessage.MessageAttributes && RESPONSE_QUEUE_URL_ATTRIBUTE_NAME in requestMessage.MessageAttributes;
  }
}
