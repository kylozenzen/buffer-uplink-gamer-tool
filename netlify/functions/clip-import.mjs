import importer from '../lib/clip-import-handler.js';
import { handle } from '../lib/modern-handler.mjs';

export default request => handle(request, importer.handler);
