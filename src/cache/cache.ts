export interface Cache<T = any> {
  get(key: string): Promise<T>;

  put(key: string, value: T): Promise<void>;

  remove(key: string): Promise<void>;

  quit(): Promise<void>;
}
