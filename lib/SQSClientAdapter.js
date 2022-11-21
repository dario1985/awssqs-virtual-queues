"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQSClientAdapter = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_sqs_2 = require("@aws-sdk/client-sqs");
class SQSClientAdapter {
    constructor(sqs) {
        this.sqs = sqs;
    }
    createQueue(input) {
        return this.sqs.send(new client_sqs_2.CreateQueueCommand(input));
    }
    deleteQueue(input) {
        return this.sqs.send(new client_sqs_2.DeleteQueueCommand(input));
    }
    receiveMessage(input) {
        return this.sqs.send(new client_sqs_1.ReceiveMessageCommand(input));
    }
    sendMessage(input) {
        return this.sqs.send(new client_sqs_2.SendMessageCommand(input));
    }
    changeMessageVisibility(input) {
        return this.sqs.send(new client_sqs_2.ChangeMessageVisibilityCommand(input));
    }
    deleteMessage(input) {
        return this.sqs.send(new client_sqs_2.DeleteMessageCommand(input));
    }
}
exports.SQSClientAdapter = SQSClientAdapter;
