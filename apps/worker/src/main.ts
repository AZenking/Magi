import { Worker } from "bullmq";
import { createLogger } from "@magi/utils";

const logger = createLogger({ context: "worker" });

async function bootstrap() {
  const connection = {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  };

  const xmltvWorker = new Worker(
    "xmltv",
    async (job) => {
      logger.info(`Processing job ${job.id}`, { name: job.name, data: job.data });
      // TODO: implement XMLTV processing
    },
    { connection, concurrency: 1 },
  );

  xmltvWorker.on("completed", (job) => {
    logger.info(`Job ${job.id} completed`);
  });

  xmltvWorker.on("failed", (job, err) => {
    logger.error(`Job ${job?.id} failed`, { error: err.message });
  });

  logger.info("Worker started");

  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await xmltvWorker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err) => {
  logger.error("Worker failed to start", { error: err.message });
  process.exit(1);
});
