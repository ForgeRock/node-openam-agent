import { readFile } from 'fs';
import { resolve } from 'path';
import * as promisify from 'util.promisify';

export async function getFixture(name: string) {
  const path = resolve(__dirname, 'fixtures', name);
  const buffer = await promisify(readFile)(path);
  return buffer.toString();
}
