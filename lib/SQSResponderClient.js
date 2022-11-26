"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQSResponderClient = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const constants_1 = require("./constants");
class SQSResponderClient {
    constructor(sqs) {
        this.sqs = sqs;
    }
    async sendResponseMessage(request, response) {
        const replyQueueUrl = this.getMessageResponseQueueUrl(request);
        if (replyQueueUrl) {
            try {
                await this.sqs.sendMessage({
                    QueueUrl: replyQueueUrl,
                    MessageBody: response.Body,
                    MessageAttributes: response.MessageAttributes,
                });
            }
            catch (e) {
                if (e instanceof client_sqs_1.QueueDoesNotExist) {
                    // Stale request, ignore
                    // TODO-RS: CW metric
                    console.warn('Ignoring response to deleted response queue: ' + replyQueueUrl);
                }
                throw e;
            }
        }
        else {
            // TODO-RS: CW metric
            console.warn('Attempted to send response when none was requested');
        }
    }
    isResponseMessageRequested(requestMessage) {
        return Boolean(this.getMessageResponseQueueUrl(requestMessage));
    }
    getMessageResponseQueueUrl(requestMessage) {
        var _a, _b;
        return (_b = (_a = requestMessage.MessageAttributes) === null || _a === void 0 ? void 0 : _a[constants_1.RESPONSE_QUEUE_URL_ATTRIBUTE_NAME]) === null || _b === void 0 ? void 0 : _b.StringValue;
    }
}
exports.SQSResponderClient = SQSResponderClient;
