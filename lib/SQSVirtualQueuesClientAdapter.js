"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiveQueueBuffer = exports.SQSVirtualQueuesClient = void 0;
const constants_1 = require("./constants");
const SQSClientAdapter_1 = require("./SQSClientAdapter");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const SQSMessageConsumer_1 = require("./SQSMessageConsumer");
const utils_1 = require("./utils");
const debug_1 = __importDefault(require("debug"));
const MAXIMUM_VIRTUAL_QUEUES_COUNT = 1000000;
const VIRTUAL_QUEUE_NAME_ATTRIBUTE = '__AmazonSQSVirtualQueuesClient.QueueName';
/**
 * An AmazonSQS wrapper that adds support for "virtual" queues, which are logical
 * queues hosted by an actual "physical" SQS queue.
 * <p>
 * Virtual queues are created by invoking {@link #createQueue(CreateQueueRequest)} with the
 * "HostQueueUrl" queue attribute set to the URL of an existing physical queue. This will create
 * in-memory buffers but will not cause any outgoing calls to SQS. The returned queue
 * URL will include both the host URL and the requested queue name, separated by a '#'. For example:
 *
 * <pre>
 * https://sqs.us-west-2.amazonaws.com/1234566789012/MyHostQueue#MyVirtualQueue
 * </pre>
 *
 * When a message is sent to a virtual queue URL, this client will send the message to the host queue,
 * but with an additional message attribute set to the name of the virtual queue.
 * <p>
 * On the consuming side,
 * receives to virtual queues are multiplexed into long-poll receives on the host queue. As messages are
 * received from the host queue, a background thread will dispatch them to waiting virtual queue receives
 * according to the message attribute.
 * <p>
 * Virtual queues are also automatically deleted after a configurable period with no API calls, to avoid exhausting
 * memory if client code is failing to delete them explicitly. The "IdleQueueRetentionPeriodSeconds" queue
 * attribute configures the length of this period. See the {@link AmazonSQSIdleQueueDeletingClient} class,
 * which implements this concept for physical SQS queues, for more details.
 */
class SQSVirtualQueuesClient extends SQSClientAdapter_1.SQSClientAdapter {
    constructor() {
        super(...arguments);
        this.hostQueues = new Map();
        this.virtualQueues = new Map();
        this.debug = (0, debug_1.default)('SQSVirtualQueuesClient');
    }
    getVirtualQueueByUrl(queueUrl) {
        const optionalVirtualQueueId = VirtualQueueID.fromQueueUrl(queueUrl);
        if (optionalVirtualQueueId) {
            return this.getVirtualQueue(optionalVirtualQueueId.virtualQueueName);
        }
        else {
            return null;
        }
    }
    getVirtualQueue(queueName) {
        const virtualQueue = this.virtualQueues.get(queueName);
        if (!virtualQueue) {
            throw new client_sqs_1.QueueDoesNotExist({
                message: 'The specified queue does not exist',
                $metadata: {},
            });
        }
        return virtualQueue;
    }
    async createQueue(input) {
        var _a, _b;
        const hostQueueUrl = (_a = input.Attributes) === null || _a === void 0 ? void 0 : _a[constants_1.VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE];
        if (!hostQueueUrl) {
            this.debug('Creating host queue: %j', input);
            return super.createQueue(input);
        }
        const { [constants_1.VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE]: _, ...attributes } = (_b = input === null || input === void 0 ? void 0 : input.Attributes) !== null && _b !== void 0 ? _b : {};
        const attributesKeys = Object.keys(attributes);
        if (attributesKeys.length) {
            throw new TypeError('Virtual queues do not support setting these queue attributes independently of their host queues: ' +
                attributesKeys.join(','));
        }
        if (!this.hostQueues.has(hostQueueUrl)) {
            this.hostQueues.set(hostQueueUrl, new HostQueue(this, hostQueueUrl));
        }
        const hostQueue = this.hostQueues.get(hostQueueUrl);
        const virtualQueue = new VirtualQueue(hostQueue, input.QueueName);
        // There is clearly a race condition here between checking the size and
        // adding to the map, but that's fine since this is just a loose upper bound
        // and it avoids synchronizing all calls on something like an AtomicInteger.
        // The worse case scenario is that the map has X entries more than the maximum
        // where X is the number of threads concurrently creating queues.
        if (this.virtualQueues.size > MAXIMUM_VIRTUAL_QUEUES_COUNT) {
            throw new Error('Cannot create virtual queue: the number of virtual queues would exceed the maximum of ' +
                MAXIMUM_VIRTUAL_QUEUES_COUNT);
        }
        this.virtualQueues.set(virtualQueue.id.virtualQueueName, virtualQueue);
        this.debug('Created virtual queue: %s', virtualQueue.id.getQueueUrl());
        return {
            QueueUrl: virtualQueue.id.getQueueUrl(),
            $metadata: {},
        };
    }
    async deleteQueue(input) {
        const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl);
        if (virtualQueue) {
            virtualQueue.shutdown();
            this.virtualQueues.delete(virtualQueue.id.virtualQueueName);
            return { $metadata: {} };
        }
        return super.deleteQueue(input);
    }
    sendMessage(input) {
        const virtualQueueID = VirtualQueueID.fromQueueUrl(input.QueueUrl);
        this.debug('Sending message to: %s using virtual queue %o', input.QueueUrl, virtualQueueID);
        if (virtualQueueID) {
            input.MessageAttributes = {
                ...input.MessageAttributes,
                [VIRTUAL_QUEUE_NAME_ATTRIBUTE]: {
                    DataType: 'String',
                    StringValue: virtualQueueID.virtualQueueName,
                },
            };
            input.QueueUrl = virtualQueueID.hostQueueUrl;
            return super.sendMessage(input);
        }
        return super.sendMessage(input);
    }
    receiveMessage(input) {
        const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl);
        if (virtualQueue) {
            return virtualQueue.receiveMessage(input);
        }
        return super.receiveMessage(input);
    }
    deleteMessage(input) {
        const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl);
        if (virtualQueue) {
            input = { ...input, QueueUrl: virtualQueue.id.hostQueueUrl };
        }
        return super.deleteMessage(input);
    }
    changeMessageVisibility(input) {
        const virtualQueue = this.getVirtualQueueByUrl(input.QueueUrl);
        if (virtualQueue) {
            input = { ...input, QueueUrl: virtualQueue.id.hostQueueUrl };
        }
        return super.changeMessageVisibility(input);
    }
    async close() {
        await Promise.all([...this.hostQueues.values(), ...this.virtualQueues.values()].map((hq) => hq.shutdown()));
    }
}
exports.SQSVirtualQueuesClient = SQSVirtualQueuesClient;
class HostQueue {
    constructor(sqs, queueUrl) {
        this.sqs = sqs;
        this.queueUrl = queueUrl;
        this.debug = (0, debug_1.default)(`HostQueue:${queueUrl.slice(-3)}`);
        this.consumer = new SQSMessageConsumer_1.SQSMessageConsumer(this.sqs, queueUrl, (m) => this.dispatchMessage(m));
        this.consumer.start();
    }
    dispatchMessage(m) {
        var _a, _b;
        const virtualQueueName = (_b = (_a = m.MessageAttributes) === null || _a === void 0 ? void 0 : _a[VIRTUAL_QUEUE_NAME_ATTRIBUTE]) === null || _b === void 0 ? void 0 : _b.StringValue;
        this.debug('Dispatching message %s to virtual queue %s', m.ReceiptHandle, virtualQueueName);
        if (!virtualQueueName) {
            // Orphan message
            this.debug('Cannot dispatch orphan message: %o', m);
            return;
        }
        const virtualQueue = this.sqs.getVirtualQueue(virtualQueueName);
        if (virtualQueue) {
            this.debug(`Dispatched message ${m.ReceiptHandle} on virtual queue "${virtualQueue.name}"`);
            virtualQueue.buffer.deliver(m);
        }
        else {
            this.debug(`Virtual queue "${virtualQueueName}" not handled here.`);
        }
    }
    shutdown() {
        return this.consumer.shutdown();
    }
}
class VirtualQueue {
    constructor(hostQueue, queueName) {
        this.buffer = new ReceiveQueueBuffer();
        this.id = new VirtualQueueID(hostQueue.queueUrl, queueName);
    }
    get name() {
        return this.id.virtualQueueName;
    }
    async receiveMessage(input) {
        var _a, _b;
        const waitTimeMs = ((_a = input.WaitTimeSeconds) !== null && _a !== void 0 ? _a : 0) * 1000;
        const maxMessages = Math.max(0, Math.min(1, (_b = input.MaxNumberOfMessages) !== null && _b !== void 0 ? _b : 1));
        return {
            Messages: await this.buffer.receiveMessage(maxMessages, waitTimeMs),
            $metadata: {},
        };
    }
    shutdown() {
        this.buffer.close();
    }
}
class VirtualQueueID {
    constructor(hostQueueUrl, virtualQueueName) {
        this.hostQueueUrl = hostQueueUrl;
        this.virtualQueueName = virtualQueueName;
    }
    getQueueUrl() {
        return `${this.hostQueueUrl}#${this.virtualQueueName}`;
    }
    static fromQueueUrl(queueUrl) {
        const index = queueUrl.indexOf('#');
        if (index > -1) {
            return new VirtualQueueID(queueUrl.slice(0, index), queueUrl.slice(index + 1));
        }
        else {
            return null;
        }
    }
}
class ReceiveQueueBuffer {
    constructor(defaultWaitTimeMs = 10000) {
        this.defaultWaitTimeMs = defaultWaitTimeMs;
        this.messages = [];
        this.closed = false;
    }
    deliver(message) {
        if (this.closed) {
            throw new Error('Buffer closed');
        }
        this.messages.push(message);
    }
    async receiveMessage(maxMessages, waitTimeMs) {
        const deadlineWaitMs = Date.now() + waitTimeMs;
        const result = [];
        waitTimeMs = waitTimeMs || this.defaultWaitTimeMs;
        while (!this.closed && Date.now() < deadlineWaitMs && result.length < maxMessages) {
            result.push(...this.messages.splice(0, Math.min(maxMessages, maxMessages - result.length)));
            if (result.length < maxMessages) {
                await (0, utils_1.wait)(Math.min(waitTimeMs, Math.max(0, deadlineWaitMs - Date.now())));
            }
        }
        return result;
    }
    close() {
        this.closed = true;
    }
}
exports.ReceiveQueueBuffer = ReceiveQueueBuffer;
