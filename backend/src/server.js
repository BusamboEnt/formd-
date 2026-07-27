import { createApp } from './app.js';
import { Store } from './store.js';

const port = process.env.PORT || 8080;
const store = new Store();

createApp(store).listen(port, () => {
  console.log(`[formd] reference backend listening on :${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    store.close();
    process.exit(0);
  });
}
