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
class SQSMessageConsumer {
    constructor(sqs, queueUrl, onMessage, onShutdown = () => { }, onException = console.error, maxWaitMs = 2000) {
        this.sqs = sqs;
        this.queueUrl = queueUrl;
        this.onMessage = onMessage;
        this.onShutdown = onShutdown;
        this.onException = onException;
        this.maxWaitMs = maxWaitMs;
        this.deadlineMs = 0;
        this.shuttingDown = false;
        this.terminated = new deferred_1.Deferred();
        this.debug = (0, debug_1.default)(`SQSMessageConsumer:${queueUrl.slice(-3)}`);
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
    handleException(e) {
        return this.onException(e);
    }
    shutdown() {
        if (!this.shuttingDown) {
            this.debug('Shutting down...');
            this.shuttingDown = true;
            try {
                const ret = this.onShutdown();
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
            let waitMs = this.maxWaitMs;
            if (this.deadlineMs > 0) {
                if (currentMs >= this.deadlineMs) {
                    this.shutdown();
                    break;
                }
                else {
                    waitMs = Math.max(0, Math.min(waitMs, this.deadlineMs - currentMs));
                }
            }
            try {
                this.debug('Checking messages...');
                const { Messages: messages } = await this.sqs.receiveMessage({
                    QueueUrl: this.queueUrl,
                    WaitTimeSeconds: Math.round(waitMs / 1000),
                    MaxNumberOfMessages: 10,
                    MessageAttributeNames: ['All'],
                });
                this.debug('Received %d messages', (_a = messages === null || messages === void 0 ? void 0 : messages.length) !== null && _a !== void 0 ? _a : 0);
                if (messages === null || messages === void 0 ? void 0 : messages.length) {
                    await Promise.all(messages.map((m) => this.handleMessage(m)));
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
            await this.deleteMessage(message);
        }
        catch (e) {
            if (e instanceof client_sqs_1.QueueDoesNotExist) {
                return; // Ignore
            }
            await this.handleException(new SQSMessageConsumerError(`Error processing message #${message.MessageId}: ${e.message}`, e));
            await this.turnMessageVisible(message);
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
            this.handleException(new SQSMessageConsumerError(`Error deleting message #${message.MessageId}: ${e.message}`, e));
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
