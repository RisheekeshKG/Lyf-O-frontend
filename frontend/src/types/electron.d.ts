export interface IElectronAPI {
  ipcRenderer: {
    invoke(channel: 'readFile', filename: string): Promise<any>;
    invoke(channel: 'readDir', dirPath: string): Promise<string[]>;
    invoke(channel: 'writeFile', filename: string, content: string): Promise<boolean>;
    on(channel: string, func: (...args: any[]) => void): void;
    once(channel: string, func: (...args: any[]) => void): void;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}