import { SQSRecord } from 'aws-lambda';
import { Message, MessageAttributeValue } from '@aws-sdk/client-sqs';

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Restricts a number to be within a range.
 */
export const clamp = (x: number, min: number, max: number) => {
  if (min > max) throw TypeError('Invalid argument: "min" should be minor than "max"');
  return Math.max(min, Math.min(max, x));
};

/**
 * Create a SQS Message from a lambda event SQSRecord
 * @param record {SQSRecord}
 * @returns {Message}
 */
export const createMessageFromLambdaSQSEventRecord = (record: SQSRecord): Message => ({
  MessageId: record.messageId,
  ReceiptHandle: record.receiptHandle,
  MD5OfBody: record.md5OfBody,
  Body: record.body,
  Attributes: record.attributes && (record.attributes as unknown as Record<string, string>),
  MessageAttributes:
    record.messageAttributes &&
    Object.keys(record.messageAttributes).reduce((acc, key) => {
      const { dataType, stringValue, binaryValue, stringListValues, binaryListValues } = record.messageAttributes[key];
      return {
        ...acc,
        [key]: {
          DataType: dataType,
          StringValue: stringValue,
          BinaryValue: binaryValue !== null && binaryValue !== undefined ? Buffer.from(binaryValue) : undefined,
          StringListValues: stringListValues,
          BinaryListValues: binaryListValues?.map((buf) => Buffer.from(buf)),
        },
      };
    }, {} as Record<string, MessageAttributeValue>),
});
