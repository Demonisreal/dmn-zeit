import { afterAll, beforeAll } from 'vitest';
import { closeDatabase, openDatabase } from './pg';

// every test file works on its own clone of the migrated template
beforeAll(openDatabase);
afterAll(closeDatabase);
