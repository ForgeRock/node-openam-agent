import { Parser } from 'xml2js';
import { promisify } from 'util';

export function parseXml(doc: string): Promise<any> {
  const parser = new Parser();
  const parseString = promisify<string, any>(parser.parseString);
  return parseString(doc);
}
