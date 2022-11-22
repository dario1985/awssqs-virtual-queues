import { Message, SQSClient } from '@aws-sdk/client-sqs';
import { randomInt } from 'crypto';
import { SQSVirtualQueuesClient } from '../SQSVirtualQueuesClientAdapter';
import { SQSRequesterClient } from '../SQSRequesterClient';
import { AmazonSQSResponderClient } from '../SQSResponderClient';
import { SQSMessageConsumer } from '../SQSMessageConsumer';
import { VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE } from '../constants';
import { wait } from '../utils';
import assert from 'assert';

const endpointUrl = 'http://localhost:4100';
const sqs = new SQSClient({
  endpoint: endpointUrl,
  region: 'local',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
});
const adapter = new SQSVirtualQueuesClient(sqs);

// aws --endpoint-url http://localhost:4100 sqs create-queue --queue-name virtual-requests
// aws --endpoint-url http://localhost:4100 sqs create-queue --queue-name virtual-responses

async function createQueues() {
  console.log('Creating queues...');
  await Promise.all(['virtual-requests', 'virtual-responses'].map((name) => adapter.createQueue({ QueueName: name })));
}

async function deleteQueues() {
  await wait(3_000);
  console.log('Deleting queues...');
  await Promise.all(
    ['virtual-requests', 'virtual-responses'].map((name) =>
      adapter
        .deleteQueue({ QueueUrl: `${endpointUrl}/queue/${name}` })
        .catch((e) => console.error(`[${name}] ${e.stack}`)),
    ),
  );
}

async function main() {
  await createQueues();
  const requester = new SQSRequesterClient(adapter, 'req_', {
    [VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE]: 'virtual-responses',
  });
  const responder = new AmazonSQSResponderClient(adapter);

  // This should work on a external lambda
  const requestsQueueUrl = `${endpointUrl}/queue/virtual-requests`;
  const requestHandler = async (m: Message) => {
    console.log(`*** Received Request -> ${JSON.stringify(m.Body)} #${m.ReceiptHandle}`);
    if (responder.isResponseMessageRequested(m)) {
      await responder.sendResponseMessage(m, { Body: 'PONG ' + m.Body?.split(' ')[1] });
    } else console.log('Not Response Message Requested');
  };
  const requestsConsumer = new SQSMessageConsumer(adapter, requestsQueueUrl, requestHandler);
  requestsConsumer.start();

  for (let i = 0; i < 30; i++) {
    // Requester logic
    const rnd = `${randomInt(1000)}`;
    console.log(`>>> Sending Request #${rnd}`);
    const response = await requester.sendMessageAndGetResponse(
      {
        QueueUrl: requestsQueueUrl,
        MessageBody: `PING ${rnd}`,
      },
      5_000,
    );
    console.log(`<<< Received Response <- ${JSON.stringify(response.Body)} #${response.ReceiptHandle}`);
    assert.equal(rnd, response.Body?.split(' ')[1]);
  }

  await requestsConsumer.terminate();
  await adapter.close();
  await deleteQueues();
}

main().then(
  () => {},
  (e: any) => {
    console.error(e);
    process.exit(1);
  },
);
