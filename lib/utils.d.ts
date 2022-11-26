import { SQSRecord } from 'aws-lambda';
import { Message } from '@aws-sdk/client-sqs';
export declare const wait: (ms: number) => Promise<unknown>;
/**
 * Restricts a number to be within a range.
 */
export declare const clamp: (x: number, min: number, max: number) => number;
/**
 * Create a SQS Message from a lambda event SQSRecord
 * @param record {SQSRecord}
 * @returns {Message}
 */
export declare const createMessageFromLambdaSQSEventRecord: (record: SQSRecord) => Message;
