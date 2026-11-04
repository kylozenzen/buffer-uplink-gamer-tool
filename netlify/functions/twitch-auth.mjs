import auth from '../lib/twitch-auth-handler.js';
import { handle } from '../lib/modern-handler.mjs';

export default request => handle(request, auth.handler);
