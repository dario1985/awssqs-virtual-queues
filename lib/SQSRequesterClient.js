"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeoutError = exports.SQSRequesterClient = void 0;
const crypto_1 = require("crypto");
const debug_1 = __importDefault(require("debug"));
const constants_1 = require("./constants");
const deferred_1 = require("./deferred");
const SQSMessageConsumer_1 = require("./SQSMessageConsumer");
class SQSRequesterClient {
    constructor(sqs, queuePrefix, queueAttributes = {}) {
        this.sqs = sqs;
        this.queuePrefix = queuePrefix;
        this.queueAttributes = queueAttributes;
        this.consumers = new Set();
        this.debug = (0, debug_1.default)(`SQSRequesterClient`);
    }
    async sendMessageAndGetResponse(request, timeoutMs) {
        const queueName = this.queuePrefix + (0, crypto_1.randomUUID)();
        const { QueueUrl: queueUrl } = await this.sqs.createQueue({
            QueueName: queueName,
            Attributes: this.queueAttributes,
        });
        if (!queueUrl)
            throw new Error('Cannot get QueueUrl');
        request.MessageAttributes = {
            ...request.MessageAttributes,
            [constants_1.RESPONSE_QUEUE_URL_ATTRIBUTE_NAME]: {
                DataType: 'String',
                StringValue: queueUrl,
            },
        };
        this.debug('Sending request: %s', request.MessageBody);
        await this.sqs.sendMessage(request);
        const listener = new ResponseListener(this.sqs, queueUrl, () => {
            this.consumers.delete(listener);
            this.sqs.deleteQueue({ QueueUrl: queueUrl });
        });
        this.consumers.add(listener);
        listener.runFor(timeoutMs);
        return listener.toPromise();
    }
}
exports.SQSRequesterClient = SQSRequesterClient;
class ResponseListener extends SQSMessageConsumer_1.SQSMessageConsumer {
    constructor(sqs, queueUrl, shutdownHook, exceptionHandler = console.error, maxWaitMs = 2000) {
        super(sqs, queueUrl, (m) => this.setMessage(m), () => {
            this.message.reject(new TimeoutError('Timeout'));
            return shutdownHook();
        }, exceptionHandler, maxWaitMs);
        this.message = new deferred_1.Deferred();
        this.debug = (0, debug_1.default)(`ResponseListener:${queueUrl.slice(-3)}`);
    }
    setMessage(m) {
        this.message.resolve(m);
        this.shutdown();
    }
    toPromise() {
        return this.message.toPromise();
    }
}
class TimeoutError extends Error {
}
exports.TimeoutError = TimeoutError;
