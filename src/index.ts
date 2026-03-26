import 'dotenv/config';
import { startServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8007;
startServer(PORT).catch(console.error);
