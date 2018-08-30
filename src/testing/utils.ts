import { readFile } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';

export async function getFixture(name: string) {
  const path = resolve(__dirname, 'fixtures', name);
  const buffer = await promisify(readFile)(path);
  return buffer.toString()
}
