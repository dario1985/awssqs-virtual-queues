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
const errors_1 = require("./errors");
class SQSRequesterClient {
    constructor(sqs, queuePrefix, queueAttributes = {}) {
        this.sqs = sqs;
        this.queuePrefix = queuePrefix;
        this.queueAttributes = queueAttributes;
        this.consumers = new Set();
        this.debug = (0, debug_1.default)(`SQSRequesterClient`);
    }
    setVirtualQueueOnHostQueue(hostQueueUrl) {
        if (!hostQueueUrl.startsWith('http'))
            throw TypeError('Expected valid QueueUrl');
        this.queueAttributes[constants_1.VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE] = hostQueueUrl;
        return this;
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
        const listener = new ResponseListener(this.sqs, queueUrl, async () => {
            this.debug(`Removing listener`);
            this.consumers.delete(listener);
            await this.sqs.deleteQueue({ QueueUrl: queueUrl });
        });
        this.consumers.add(listener);
        listener.runFor(timeoutMs);
        return listener.toPromise();
    }
}
exports.SQSRequesterClient = SQSRequesterClient;
class ResponseListener extends SQSMessageConsumer_1.SQSMessageConsumer {
    constructor(sqs, queueUrl, shutdownHook, exceptionHandler = console.error, maxWaitMs = 2000) {
        super(sqs, queueUrl, (m) => this.setMessage(m), {
            onShutdown: () => {
                this.message.reject(new TimeoutError(queueUrl));
                return shutdownHook();
            },
            onException: exceptionHandler,
            maxWaitMs,
        });
        this.message = new deferred_1.Deferred();
        this.debug = (0, debug_1.default)(`SQSRequesterClient:ResponseListener:${queueUrl.slice(-3)}`);
    }
    setMessage(m) {
        this.message.resolve(m);
        this.shutdown();
    }
    toPromise() {
        return this.message.toPromise();
    }
}
class TimeoutError extends errors_1.QueueError {
    constructor(queueUrl) {
        super('Timeout waiting for response', queueUrl);
    }
}
exports.TimeoutError = TimeoutError;
