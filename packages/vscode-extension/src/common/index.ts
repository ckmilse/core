import { createMainContextProxyIdentifier, createExtHostContextProxyIdentifier} from '@ali/ide-connection';
import { VSCodeExtensionService } from '../browser/types';
import { SerializedDocumentFilter } from './model.api';
import { IMainThreadDocumentsShape, ExtensionDocumentDataManager } from './doc';
import { Disposable } from './ext-types';

export const MainThreadAPIIdentifier = {
  MainThreadCommands: createMainContextProxyIdentifier<IMainThreadCommands>('MainThreadCommands'),
  MainThreadLanguages: createMainContextProxyIdentifier<IMainThreadLanguages>('MainThreadLanguages'),
  MainThreadExtensionServie: createMainContextProxyIdentifier<VSCodeExtensionService>('MainThreadExtensionServie'),
  MainThreadDocuments: createExtHostContextProxyIdentifier<IMainThreadDocumentsShape>('MainThreadDocuments'),
};
export const ExtHostAPIIdentifier = {
  ExtHostLanguages: createExtHostContextProxyIdentifier<IExtHostLanguages>('ExtHostLanguages'),
  ExtHostCommandsRegistry: createExtHostContextProxyIdentifier<IExtHostCommandsRegistry>('ExtHostCommandsRegistry'),
  ExtHostExtensionService: createExtHostContextProxyIdentifier<IExtensionProcessService>('ExtHostExtensionService'),
  ExtHostDocuments: createExtHostContextProxyIdentifier<ExtensionDocumentDataManager>('ExtHostDocuments'),
};

export abstract class VSCodeExtensionNodeService {
  abstract async getExtHostPath(): Promise<string>;
}

export const VSCodeExtensionNodeServiceServerPath = 'VSCodeExtensionNodeServiceServerPath';

export interface IExtensionProcessService {
  $activateExtension(modulePath: string): Promise<void>;

}

export interface IMainThreadCommands {
  $registerCommand(id: string): void;
  $unregisterCommand(id: string): void;
  $getCommands(): Promise<string[]>;
  $executeCommand<T>(id: string, ...args: any[]): Promise<T | undefined>;
}

export interface IMainThreadLanguages {
  $registerHoverProvider(handle: number, selector: SerializedDocumentFilter[]): void;
}

export type Handler = <T>(...args: any[]) => T | Promise<T>;

export interface ArgumentProcessor {
  processArgument(arg: any): any;
}

export interface IExtHostCommandsRegistry {
  registerCommand(global: boolean, id: string, handler: Handler, thisArg?: any, description?: string): Disposable;
  executeCommand<T>(id: string, ...args: any[]): Promise<T | undefined>;
  $executeContributedCommand<T>(id: string, ...args: any[]): Promise<T>;
  getCommands(filterUnderscoreCommands: boolean): Promise<string[]>;
  registerArgumentProcessor(processor: ArgumentProcessor): void;
}

export interface IExtHostLanguages {
  getLanguages(): Promise<string[]>;

  registerHoverProvider(selector, provider): any;
  $provideHover(handle: number, resource: any, position: any, token: any): Promise<any>;
}

export * from './doc';
