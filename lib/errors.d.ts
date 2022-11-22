export declare abstract class QueueError extends Error {
    readonly queueUrl: string;
    constructor(message: string, queueUrl: string);
}
