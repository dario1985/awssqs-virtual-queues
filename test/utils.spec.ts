import { Message } from '@aws-sdk/client-sqs';
import { createMessageFromLambdaSQSEventRecord } from '../src/utils';

describe('utils', () => {
  describe('createMessageFromLambdaSQSEventRecord', () => {
    it('should create a proper message', () =>
      expect(
        createMessageFromLambdaSQSEventRecord({
          messageId: 'id',
          body: 'payload',
          md5OfBody: 'bodymd5',
          receiptHandle: 'ReceiptHandle',
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1234567890',
            SenderId: 'sender-id',
            ApproximateFirstReceiveTimestamp: '1234567891',
          },
          messageAttributes: {
            attributeName: {
              dataType: 'String',
              stringValue: 'Some text',
            },
          },
          awsRegion: 'local',
          eventSource: 'somewhere',
          eventSourceARN: 'arn:aws:::somewhere',
        }),
      ).toMatchObject({
        MessageId: 'id',
        Body: 'payload',
        MD5OfBody: 'bodymd5',
        ReceiptHandle: 'ReceiptHandle',
        Attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1234567890',
          SenderId: 'sender-id',
          ApproximateFirstReceiveTimestamp: '1234567891',
        },
        MessageAttributes: {
          attributeName: {
            DataType: 'String',
            StringValue: 'Some text',
          },
        },
      } as Message));
  });
});
