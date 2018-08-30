import * as promisify from 'util.promisify';
import { Parser } from 'xml2js';

export function parseXml(doc: string): Promise<any> {
  const parser = new Parser();
  const parseString = promisify(parser.parseString);
  return parseString(doc);
}
