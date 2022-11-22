"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueError = void 0;
class QueueError extends Error {
    constructor(message, queueUrl) {
        super(message);
        this.queueUrl = queueUrl;
    }
}
exports.QueueError = QueueError;
