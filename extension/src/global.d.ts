/// <reference types="chrome" />

// React JSX runtime fallback (when @types/react is not resolved)
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare namespace JSX {
  type Element = any;
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}


// Fallback declaration when @types/chrome is not installed
// This will be superseded by @types/chrome when available
declare namespace chrome {
  namespace storage {
    interface StorageChange {
      oldValue?: any;
      newValue?: any;
    }

    interface StorageArea {
      get(keys: string | string[] | Record<string, any>): Promise<Record<string, any>>;
      get(keys: string | string[] | Record<string, any>, callback: (items: Record<string, any>) => void): void;
      set(items: Record<string, any>): Promise<void>;
      set(items: Record<string, any>, callback?: () => void): void;
      remove(keys: string | string[]): Promise<void>;
    }

    const sync: StorageArea;
    const local: StorageArea;

    const onChanged: {
      addListener(callback: (changes: Record<string, StorageChange>, areaName: string) => void): void;
      removeListener(callback: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    };
  }

  namespace runtime {
    const lastError: { message?: string } | undefined;
    function sendMessage(message: any, callback?: (response: any) => void): void;
    function sendMessage(extensionId: string, message: any, callback?: (response: any) => void): void;

    const onMessage: {
      addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => void): void;
    };
  }

  namespace scripting {
    function executeScript(injection: any): Promise<any[]>;
  }

  namespace tabs {
    function query(queryInfo: any): Promise<any[]>;
    function sendMessage(tabId: number, message: any): Promise<any>;
  }
}
