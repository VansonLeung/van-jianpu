import { createApplication } from './application.js';
import { configuration } from './configuration.js';

createApplication().listen(configuration.port, configuration.host, () => {
  console.log(`Jianpu Scanner: http://${configuration.host}:${configuration.port}`);
});
