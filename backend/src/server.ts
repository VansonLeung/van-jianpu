import { createApplication } from './application.js';
import { configuration } from './configuration.js';

createApplication().listen(configuration.port, configuration.host, () => {
  console.log(`Van Jianpu: http://${configuration.host}:${configuration.port}`);
});
