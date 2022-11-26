import { Message, SQSClient } from '@aws-sdk/client-sqs';
import { randomInt } from 'crypto';
import { SQSVirtualQueuesClient } from '../src/SQSVirtualQueuesClientAdapter';
import { SQSRequesterClient } from '../src/SQSRequesterClient';
import { SQSResponderClient } from '../src/SQSResponderClient';
import { SQSMessageConsumer } from '../src/SQSMessageConsumer';
import { VIRTUAL_QUEUE_HOST_QUEUE_ATTRIBUTE } from '../src/constants';
import { wait } from '../src/utils';
import assert from 'assert';

const endpointUrl = 'http://localhost:4100';
const sqs = new SQSClient({
  endpoint: endpointUrl,
  region: 'local',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
});
const adapter = new SQSVirtualQueuesClient(sqs);

const pid = randomInt(46655).toString(36); // just random prefix
const requestsQueueUrl = `${endpointUrl}/queue/virtual-requests`;
const responsesQueueUrl = `${endpointUrl}/queue/virtual-responses`;

async function createQueues() {
  console.log(`[${pid}] Creating queues...`);
  await Promise.all(['virtual-requests', 'virtual-responses'].map((name) => adapter.createQueue({ QueueName: name })));
}

async function deleteQueues() {
  await wait(3_000);
  console.log(`[${pid}] Deleting queues...`);
  await Promise.all(
    ['virtual-requests', 'virtual-responses'].map((name) =>
      adapter
        .deleteQueue({ QueueUrl: `${endpointUrl}/queue/${name}` })
        .catch((e) => console.error(`[${name}] ${e.stack}`)),
    ),
  );
}

// This should work on a external lambda
async function responderWorker(timeout: number) {
  const responder = new SQSResponderClient(adapter);
  const requestHandler = async (m: Message) => {
    console.log(`[${pid}] *** Received Request -> ${JSON.stringify(m.Body)} #${m.ReceiptHandle}`);
    if (responder.isResponseMessageRequested(m)) {
      await responder.sendResponseMessage(m, { Body: 'PONG ' + m.Body?.split(' ')[1] });
    } else console.log(`[${pid}] Not Response Message Requested`);
  };
  const requestsConsumer = new SQSMessageConsumer(adapter, requestsQueueUrl, requestHandler);
  requestsConsumer.runFor(timeout);
}

async function requesterWorker() {
  const requester = new SQSRequesterClient(adapter, `${pid}-`).setVirtualQueueOnHostQueue(responsesQueueUrl);

  for (let i = 0; i < 30; i++) {
    // Requester logic
    const rnd = `${randomInt(1000)}`;
    console.log(`[${pid}] >>> Sending Request #${rnd}`);
    const response = await requester.sendMessageAndGetResponse(
      {
        QueueUrl: requestsQueueUrl,
        MessageBody: `PING ${rnd}`,
      },
      5_000,
    );
    console.log(`[${pid}] <<< Received Response <- ${JSON.stringify(response.Body)} #${response.ReceiptHandle}`);
    assert.equal(rnd, response.Body?.split(' ')[1]);
  }
}

async function main() {
  console.log('args:', process.argv);
  const isResponder = process.argv.some((x) => x === '--worker');
  const timeout = (Number(process.argv.find((x) => x.startsWith('--timeout='))?.split('=')[1]) || 5 * 60) * 1_000;

  console.log(`[${pid}] Starting new ${isResponder ? 'responder' : 'requester'}`);
  !isResponder && (await createQueues());
  if (isResponder) {
    await responderWorker(timeout);
  } else {
    await requesterWorker();
  }
  !isResponder && (await deleteQueues());
  await adapter.close();
}

main().then(
  () => {},
  (e: any) => {
    console.error(e);
    process.exit(1);
  },
);
