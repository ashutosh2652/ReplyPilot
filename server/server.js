import app from "./src/app.js";
import { connectdb, disconnectdb } from "./src/config/db.js";
import { env } from "./src/config/env.js";

import startSyncCronJob from "./src/jobs/syncComments.job.js";

let server;
connectdb()
    .then(() => {
        // Initialize BullMQ workers at startup from the new tasks directory
        import("../worker/tasks/index.js");

        startSyncCronJob();
        app.on("error", (error) => {
            console.log("Error!!", error);
            throw error;
        });
        server = app.listen(env.PORT, () => {
            console.log(
                `Mongodb is connected successfully to port:${env.PORT}`
            );
        });
    })
    .catch((error) => {
        console.log("MONGODB failed to connect!!!", error);
        process.exit(1);
    });

["SIGTERM", "SIGINT"].forEach((sig) =>
    process.on(sig, async () => {
        console.info(`Caught ${sig}, draining...`);

        // 1. Await the dynamic import so we hold a reference to the workers array
        try {
            const { default: workers } = await import("../worker/tasks/index.js");
            await Promise.all(workers.map((w) => w.close()));
            console.info("BullMQ workers closed.");
        } catch (err) {
            console.error("Error closing BullMQ workers:", err);
        }

        // 2. Only after workers are shut down, disconnect the database
        try {
            await disconnectdb();
            console.info("Database disconnected.");
        } catch (err) {
            console.error("Error disconnecting database:", err);
        }

        // 3. Close the HTTP server (promisified so we can await it)
        await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        }).catch((err) => console.error("Error closing HTTP server:", err));

        process.exit(0);
    })
);