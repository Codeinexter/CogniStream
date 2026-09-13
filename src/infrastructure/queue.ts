import { Queue } from 'bullmq';
import { config } from './config.js';

// Create the job queue using the shared Redis configuration
export const ingestionQueue = new Queue(config.queue.name, {
  connection: {
    host: config.redis.host,
    port: config.redis.port,
  },
  defaultJobOptions: config.queue.defaultJobOptions,
});
