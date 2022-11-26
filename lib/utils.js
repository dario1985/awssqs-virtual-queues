"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessageFromLambdaSQSEventRecord = exports.clamp = exports.wait = void 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.wait = wait;
/**
 * Restricts a number to be within a range.
 */
const clamp = (x, min, max) => {
    if (min > max)
        throw TypeError('Invalid argument: "min" should be minor than "max"');
    return Math.max(min, Math.min(max, x));
};
exports.clamp = clamp;
/**
 * Create a SQS Message from a lambda event SQSRecord
 * @param record {SQSRecord}
 * @returns {Message}
 */
const createMessageFromLambdaSQSEventRecord = (record) => ({
    MessageId: record.messageId,
    ReceiptHandle: record.receiptHandle,
    MD5OfBody: record.md5OfBody,
    Body: record.body,
    Attributes: record.attributes && record.attributes,
    MessageAttributes: record.messageAttributes &&
        Object.keys(record.messageAttributes).reduce((acc, key) => {
            const { dataType, stringValue, binaryValue, stringListValues, binaryListValues } = record.messageAttributes[key];
            return {
                ...acc,
                [key]: {
                    DataType: dataType,
                    StringValue: stringValue,
                    BinaryValue: binaryValue !== null && binaryValue !== undefined ? Buffer.from(binaryValue) : undefined,
                    StringListValues: stringListValues,
                    BinaryListValues: binaryListValues === null || binaryListValues === void 0 ? void 0 : binaryListValues.map((buf) => Buffer.from(buf)),
                },
            };
        }, {}),
});
exports.createMessageFromLambdaSQSEventRecord = createMessageFromLambdaSQSEventRecord;
