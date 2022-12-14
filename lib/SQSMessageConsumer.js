"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQSMessageConsumerError = exports.SQSMessageConsumer = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const deferred_1 = require("./deferred");
const debug_1 = __importDefault(require("debug"));
const utils_1 = require("./utils");
const errors_1 = require("./errors");
class SQSMessageConsumer {
    constructor(sqs, queueUrl, onMessage, options) {
        this.sqs = sqs;
        this.queueUrl = queueUrl;
        this.onMessage = onMessage;
        this.deadlineMs = 0;
        this.shuttingDown = false;
        this.terminated = new deferred_1.Deferred();
        this.options = {
            onShutdown: () => { },
            onException: console.error,
            maxWaitMs: 2000,
            heartBeatMs: 5000,
            disableDeleteMessage: false,
            ...options,
        };
        this.debug = (0, debug_1.default)(`SQSMessageConsumer[*${queueUrl.slice(-5)}]`);
    }
    runFor(timeoutMs) {
        this.deadlineMs = Date.now() + timeoutMs;
        this.start();
    }
    start() {
        this.debug('Start polling messages...');
        setImmediate(async () => {
            try {
                await this.poll();
            }
            catch (e) {
                this.shutdown();
                await this.handleException(e);
            }
            finally {
                this.terminated.resolve(true);
            }
        });
    }
    async handleException(e) {
        return this.options.onException(e);
    }
    shutdown() {
        if (!this.shuttingDown) {
            this.debug('Shutting down...');
            this.shuttingDown = true;
            try {
                const ret = this.options.onShutdown();
                if (ret instanceof Promise) {
                    ret.catch((e) => this.handleException(e));
                }
            }
            catch (e) {
                this.handleException(e);
            }
        }
    }
    async terminate() {
        this.shutdown();
        let timeout = setTimeout(() => this.terminated.resolve(true), 30000);
        try {
            await this.terminated.toPromise();
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async poll() {
        var _a;
        while (!this.shuttingDown) {
            const currentMs = Date.now();
            let waitMs = this.options.maxWaitMs;
            if (this.deadlineMs > 0) {
                if (currentMs >= this.deadlineMs) {
                    this.shutdown();
                    break;
                }
                else {
                    waitMs = (0, utils_1.clamp)(this.deadlineMs - currentMs, 0, waitMs);
                }
            }
            try {
                const options = {
                    WaitTimeSeconds: Math.round(waitMs / 1000),
                    MaxNumberOfMessages: 10,
                    MessageAttributeNames: ['All'],
                };
                this.debug('Checking messages... %o', options);
                const { Messages: messages } = await this.sqs.receiveMessage({
                    QueueUrl: this.queueUrl,
                    ...options,
                });
                this.debug('Received %d messages.', (_a = messages === null || messages === void 0 ? void 0 : messages.length) !== null && _a !== void 0 ? _a : 0);
                if (messages === null || messages === void 0 ? void 0 : messages.length) {
                    await Promise.allSettled(messages.map((m) => this.handleMessage(m)));
                }
            }
            catch (e) {
                if (e instanceof client_sqs_1.QueueDoesNotExist) {
                    // Ignore, it may be recreated!
                    // Slow down on the polling though, to avoid tight looping.
                    // This can be treated similar to an empty queue.
                    await (0, utils_1.wait)(1000);
                }
                else {
                    await this.handleException(e);
                }
            }
            finally {
                // Slow down if WaitTimeSeconds is not respected
                const waitDiff = (0, utils_1.clamp)(Math.round(waitMs / 2 - (Date.now() - currentMs)), 0, waitMs);
                if (waitDiff > 500)
                    await (0, utils_1.wait)(waitDiff);
            }
        }
    }
    async handleMessage(message) {
        // If shutting down make message visible
        if (this.shuttingDown) {
            return this.turnMessageVisible(message);
        }
        // Handle message
        try {
            await this.onMessage(message);
            await this.deleteCompletedMessage(message);
        }
        catch (e) {
            await this.handleException(e instanceof errors_1.QueueError
                ? e
                : new SQSMessageConsumerError(`Error processing message #${message.MessageId}: ${e.message}`, e));
            await this.turnMessageVisible(message);
        }
    }
    async deleteCompletedMessage(message) {
        if (this.options.disableDeleteMessage) {
            return;
        }
        try {
            await this.deleteMessage(message);
        }
        catch (e) {
            if (e instanceof client_sqs_1.QueueDoesNotExist) {
                return; // Ignore
            }
            await this.handleException(new SQSMessageConsumerError(`Error deleting message #${message.MessageId}: ${e.message}`, e));
        }
    }
    async turnMessageVisible(message) {
        try {
            await this.sqs.changeMessageVisibility({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
                VisibilityTimeout: 0,
            });
        }
        catch (e) {
            if (e instanceof client_sqs_1.QueueDoesNotExist) {
                return; // Ignore
            }
            this.handleException(new SQSMessageConsumerError(`Error changing message visibility #${message.MessageId}: ${e.message}`, e));
        }
    }
    async deleteMessage(message) {
        try {
            this.debug('Deleting message %s', message.ReceiptHandle);
            await this.sqs.deleteMessage({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
            });
        }
        catch (e) {
            if (e instanceof client_sqs_1.QueueDoesNotExist) {
                return; // Ignore
            }
            await this.handleException(new SQSMessageConsumerError(`Error deleting message #${message.MessageId}: ${e.message}`, e));
        }
    }
}
exports.SQSMessageConsumer = SQSMessageConsumer;
class SQSMessageConsumerError extends Error {
    constructor(message, internalError) {
        super(message);
        this.internalError = internalError;
    }
}
exports.SQSMessageConsumerError = SQSMessageConsumerError;
