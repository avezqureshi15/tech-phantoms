import "./load-env";
import { createApp } from "./app";
import { sweepExpiredSessions } from "./auth/sessions";

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`Diya API listening on http://localhost:${port}`);
});

const sweep = setInterval(() => {
  void sweepExpiredSessions().catch(() => undefined);
}, 60 * 60 * 1000);
sweep.unref();
