import { Buffer } from 'node:buffer';
import { parentPort, workerData } from 'node:worker_threads';

while (workerData.kind === 'spin');

if (workerData.kind === 'hoard') {
	const hoard = [];
	for (;;) hoard.push(new Array(10_000).fill(hoard.length));
}

if (workerData.kind === 'pages') {
	const error = new Error('Document runs past 50 pages');
	error.name = 'PageLimitError';
	throw error;
}

parentPort.postMessage([{ format: 'pdf', content: Buffer.from('%PDF-') }]);
