import { Injectable, Autowired } from '@ali/common-di';
import { URI, Emitter, Event, Schemas, WithEventBus, IEditorDocumentChange, IEditorDocumentModelSaveResult, localize, AppConfig, CommandService, CorePreferences, isWindows } from '@ali/ide-core-browser';
import * as path from '@ali/ide-core-common/lib/path';

import { IResourceProvider, WorkbenchEditorService } from '../common';
import { IEditorDocumentModelService, IEditorDocumentModelContentProvider } from './doc-model/types';

@Injectable()
export class UntitledSchemeDocumentProvider implements IEditorDocumentModelContentProvider {
  @Autowired(IEditorDocumentModelService)
  editorDocumentModelService: IEditorDocumentModelService;

  @Autowired(WorkbenchEditorService)
  workbenchEditorService: WorkbenchEditorService;

  @Autowired(CommandService)
  private readonly commandService: CommandService;

  @Autowired(AppConfig)
  appConfig: AppConfig;

  private _onDidChangeContent: Emitter<URI> = new Emitter();

  public onDidChangeContent: Event<URI> = this._onDidChangeContent.event;

  @Autowired(CorePreferences)
  protected readonly corePreferences: CorePreferences;

  handlesScheme(scheme: string): boolean {
    return scheme === Schemas.untitled;
  }

  async provideEncoding() {
    const encoding = this.corePreferences['files.encoding'];
    return encoding || 'utf8';
  }

  provideEOL() {
    const eol = this.corePreferences['files.eol'];

    if (eol !== 'auto') {
      return eol;
    }
    return isWindows ? '\r\n' : '\n';
  }

  async provideEditorDocumentModelContent(uri: URI, encoding?: string | undefined): Promise<string> {
    return '';
  }

  isReadonly(uri: URI): boolean {
    return false;
  }

  isAlwaysDirty(uri: URI): boolean {
    // untitled 文件允许新建后就可以保存
    return true;
  }

  closeAutoSave(uri: URI): boolean {
    return true;
  }

  async saveDocumentModel(uri: URI, content: string, baseContent: string, changes: IEditorDocumentChange[], encoding: string, ignoreDiff: boolean = false): Promise<IEditorDocumentModelSaveResult> {
    const { name } = uri.getParsedQuery();
    const defaultPath = uri.path.toString() ? path.dirname(uri.path.toString()) : this.appConfig.workspaceDir;
    const saveUri = await this.commandService.tryExecuteCommand<URI>('file.save', {
      showNameInput: true,
      defaultFileName: name || uri.displayName,
      defaultUri: URI.file(defaultPath),
    });
    if (saveUri) {
      await this.editorDocumentModelService.saveEditorDocumentModel(saveUri, content, baseContent, changes, encoding, ignoreDiff);
      // TODO: 不依赖 workspaceEditor，先关闭再打开，等 fileSystemProvider 迁移到前端再做改造
      await this.workbenchEditorService.close(uri);
      await this.workbenchEditorService.open(saveUri, {
        preview: false,
        focus: true,
      });
      return {
        state: 'success',
      };
    } else {
      return {
        state: 'error',
        errorMessage: localize('editor.cannotSaveWithoutDirectory'),
      };
    }
  }
  onDidDisposeModel() {

  }
}

@Injectable()
export class UntitledSchemeResourceProvider extends WithEventBus implements IResourceProvider {
  readonly scheme: string = Schemas.untitled;

  provideResource(uri: URI) {
    const { name } = uri.getParsedQuery();
    return {
      name: name || uri.displayName,
      uri,
      icon: '',
      metadata: null,
    };
  }
}
