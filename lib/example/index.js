"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const SQSVirtualQueuesClientAdapter_1 = require("../SQSVirtualQueuesClientAdapter");
const SQSRequesterClient_1 = require("../SQSRequesterClient");
const SQSResponderClient_1 = require("../SQSResponderClient");
const SQSMessageConsumer_1 = require("../SQSMessageConsumer");
const constants_1 = require("../constants");
const utils_1 = require("../utils");
const endpointUrl = 'http://localhost:4100';
const sqs = new client_sqs_1.SQSClient({
    endpoint: endpointUrl,
    region: 'local',
    credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
});
const adapter = new SQSVirtualQueuesClientAdapter_1.SQSVirtualQueuesClient(sqs);
// aws --endpoint-url http://localhost:4100 sqs create-queue --queue-name virtual-requests
// aws --endpoint-url http://localhost:4100 sqs create-queue --queue-name virtual-responses
async function createQueues() {
    console.log('Creating queues...');
    await Promise.all(['virtual-requests', 'virtual-responses'].map((name) => adapter.createQueue({ QueueName: name })));
}
async function deleteQueues() {
    await (0, utils_1.wait)(3000);
    console.log('Deleting queues...');
    await Promise.all(['virtual-requests', 'virtual-responses'].map((name) => adapter
        .deleteQueue({ QueueUrl: `${endpointUrl}/queue/${name}` })
        .catch((e) => console.error(`[${name}] ${e.stack}`))));
}
async function main() {
    await createQueues();
    const requester = new SQSRequesterClient_1.SQSRequesterClient(adapter, 'req_', {
        [constants_1.VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE]: 'virtual-responses',
    });
    const responder = new SQSResponderClient_1.AmazonSQSResponderClient(adapter);
    // This should work on a external lambda
    const requestsQueueUrl = `${endpointUrl}/queue/virtual-requests`;
    const requestHandler = async (m) => {
        console.log(`Received Request -> ${JSON.stringify(m.Body)} #${m.ReceiptHandle}`);
        if (responder.isResponseMessageRequested(m)) {
            await responder.sendResponseMessage(m, { Body: 'pong' });
        }
        else
            console.log('Not Response Message Requested');
    };
    const requestsConsumer = new SQSMessageConsumer_1.SQSMessageConsumer(adapter, requestsQueueUrl, requestHandler);
    requestsConsumer.runFor(1000);
    // Requester logic
    const response = await requester.sendMessageAndGetResponse({
        QueueUrl: requestsQueueUrl,
        MessageBody: 'ping',
    }, 5000);
    console.log(`Received Response <- ${JSON.stringify(response.Body)} #${response.ReceiptHandle}`);
    await requestsConsumer.terminate();
    await adapter.close();
    await deleteQueues();
}
main().then(() => { }, (e) => {
    console.error(e);
    process.exit(1);
});
