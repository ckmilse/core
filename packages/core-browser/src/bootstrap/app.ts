import { Injector, ConstructorOf, Domain } from '@ali/common-di';
import { BrowserModule, IClientApp } from '../browser-module';
import { AppConfig } from '../react-providers';
import { injectInnerProviders } from './inner-providers';
import { KeybindingRegistry, KeybindingService } from '../keybinding';
import {
  CommandRegistry,
  MenuModelRegistry,
  isOSX, ContributionProvider,
  getLogger,
  ILogger,
  MaybePromise,
  createContributionProvider,
  DefaultResourceProvider,
  ResourceProvider,
  ResourceResolverContribution,
  InMemoryResourceResolver,
} from '@ali/ide-core-common';
import { ClientAppStateService } from '../application';
import { ClientAppContribution } from '../common';
import { createClientConnection2 } from './connection';

import {
  PreferenceProviderProvider, injectPreferenceSchemaProvider, injectPreferenceConfigurations, PreferenceScope, preferenceScopeProviderTokenMap, PreferenceService,
  PreferenceSchemaProvider, PreferenceServiceImpl,
} from '../preferences';
import { injectCorePreferences } from '../core-preferences';
import { ClientAppConfigProvider } from '../application';

export type ModuleConstructor = ConstructorOf<BrowserModule>;
export type ContributionConstructor = ConstructorOf<ClientAppContribution>;

export interface IClientAppOpts extends Partial<AppConfig> {
  modules: ModuleConstructor[];
  layoutConfig?: LayoutConfig;
  contributions?: ContributionConstructor[];
  modulesInstances?: BrowserModule[];
  connectionPath?: string;
}
export interface LayoutConfig {
  [area: string]: {
    modules: Array<string | ModuleConstructor>;
  };
}

// 设置全局应用信息
ClientAppConfigProvider.set({
  applicationName: 'KAITIAN',
});

export class ClientApp implements IClientApp {

  browserModules: BrowserModule[] = [];

  modules: ModuleConstructor[];

  injector: Injector;

  logger: ILogger = getLogger();

  connectionPath: string;

  keybindingRegistry: KeybindingRegistry;

  keybindingService: KeybindingService;

  config: AppConfig;

  contributionsProvider: ContributionProvider<ClientAppContribution>;

  commandRegistry: CommandRegistry;

  menuRegistry: MenuModelRegistry;

  stateService: ClientAppStateService;

  constructor(opts: IClientAppOpts) {
    this.injector = opts.injector || new Injector();
    this.modules = opts.modules;

    // moduleInstance必须第一个是layout模块
    this.browserModules = opts.modulesInstances || [];
    this.config = {
      workspaceDir: opts.workspaceDir || '',
      coreExtensionDir: opts.coreExtensionDir,
      injector: this.injector,
      wsPath: opts.wsPath || 'ws://127.0.0.1:8000',
      layoutConfig: opts.layoutConfig as LayoutConfig,
    };

    this.connectionPath = opts.connectionPath || `${this.config.wsPath}/service`;
    this.initBaseProvider(opts);
    this.initFields();
    this.createBrowserModules();

  }

  public async start() {
    // await createClientConnection(this.injector, this.modules, this.connectionPath);
    await createClientConnection2(this.injector, this.modules, this.connectionPath);
    this.stateService.state = 'client_connected';
    await this.startContributions();
    this.stateService.state = 'started_contributions';
    this.registerEventListeners();
    this.stateService.state = 'ready';
  }

  /**
   * 给 injector 初始化默认的 Providers
   */
  private initBaseProvider(opts: IClientAppOpts) {
    this.injector.addProviders({ token: IClientApp, useValue: this });
    this.injector.addProviders({ token: AppConfig, useValue: this.config });
    injectInnerProviders(this.injector);

  }

  /**
   * 从 injector 里获得实例
   */
  private initFields() {
    this.contributionsProvider = this.injector.get(ClientAppContribution);
    this.commandRegistry = this.injector.get(CommandRegistry);
    this.keybindingRegistry = this.injector.get(KeybindingRegistry);
    this.keybindingService = this.injector.get(KeybindingService);
    this.menuRegistry = this.injector.get(MenuModelRegistry);
    this.stateService = this.injector.get(ClientAppStateService);
  }

  private createBrowserModules() {
    const injector = this.injector;

    for (const Constructor of this.modules) {
      const instance = injector.get(Constructor);
      this.browserModules.push(instance);

      if (instance.providers) {
        this.injector.addProviders(...instance.providers);
      }

      if (instance.preferences) {
        instance.preferences(this.injector);
      }
    }

    injectCorePreferences(this.injector);

    // 注册PreferenceService
    this.injectPreferenceService(this.injector);

    // 注册资源处理服务
    this.injectResourceProvider(this.injector);

    for (const instance of this.browserModules) {

      if (instance.contributionProvider) {
        if (Array.isArray(instance.contributionProvider)) {
          for (const contributionProvider of instance.contributionProvider) {
            createContributionProvider(this.injector, contributionProvider);
          }
        } else {
          createContributionProvider(this.injector, instance.contributionProvider);
        }
      }
    }
  }

  get contributions(): ClientAppContribution[] {
    return this.contributionsProvider.getContributions();
  }

  protected async startContributions() {
    for (const contribution of this.contributions) {
      if (contribution.initialize) {
        try {
          await this.measure(contribution.constructor.name + '.initialize',
            () => contribution.initialize!(this),
          );
        } catch (error) {
          this.logger.error('Could not initialize contribution', error);
        }
      }
    }

    this.commandRegistry.onStart();
    this.keybindingRegistry.onStart();
    this.menuRegistry.onStart();

    for (const contribution of this.contributions) {
      if (contribution.onStart) {
        try {
          await this.measure(contribution.constructor.name + '.onStart',
            () => contribution.onStart!(this),
          );
        } catch (error) {
          this.logger.error('Could not start contribution', error);
        }
      }
    }
  }

  protected async measure<T>(name: string, fn: () => MaybePromise<T>): Promise<T> {
    const startMark = name + '-start';
    const endMark = name + '-end';
    performance.mark(startMark);
    const result = await fn();
    performance.mark(endMark);
    performance.measure(name, startMark, endMark);
    for (const item of performance.getEntriesByName(name)) {
      if (item.duration > 100) {
        console.warn(item.name + ' is slow, took: ' + item.duration + ' ms');
      } else {
        console.debug(item.name + ' took ' + item.duration + ' ms');
      }
    }
    performance.clearMeasures(name);
    return result;
  }

  /**
   * `beforeunload` listener implementation
   */
  protected preventStop(): boolean {
    for (const contribution of this.contributions) {
      if (contribution.onWillStop) {
        if (!!contribution.onWillStop(this)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Stop the frontend application contributions. This is called when the window is unloaded.
   */
  protected stopContributions(): void {
    for (const contribution of this.contributions) {
      if (contribution.onStop) {
        try {
          contribution.onStop(this);
        } catch (error) {
          this.logger.error('Could not stop contribution', error);
        }
      }
    }
  }

  /**
   * 注册全局事件监听
   */
  protected registerEventListeners(): void {
    window.addEventListener('beforeunload', (event) => {
      // 浏览器关闭事件前
      if (this.preventStop()) {
        event.returnValue = '';
        event.preventDefault();
        return '';
      }
    });
    window.addEventListener('unload', () => {
      // 浏览器关闭事件
      this.stateService.state = 'closing_window';
      this.stopContributions();
    });
    window.addEventListener('resize', () => {
      // 浏览器resize事件
    });
    document.addEventListener('keydown', (event) => {
      this.keybindingService.run(event);
    }, true);

    if (isOSX) {
      document.body.addEventListener('wheel', (event) => {
        // 屏蔽在OSX系统浏览器中由于滚动导致的前进后退事件
      }, { passive: false });
    }
  }

  injectPreferenceService(injector: Injector): void {
    const preferencesProviderFactory = () => {
      return (scope: any) => {
        if (scope === PreferenceScope.Default) {
          return injector.get(PreferenceSchemaProvider);
        }
        return injector.get(preferenceScopeProviderTokenMap[scope]);
      };
    };
    injectPreferenceConfigurations(this.injector);

    injectPreferenceSchemaProvider(injector);

    // 用于获取不同scope下的PreferenceProvider
    injector.addProviders({
      token: PreferenceProviderProvider,
      useFactory: preferencesProviderFactory,
    });

    injector.addProviders({
      token: PreferenceService,
      useClass: PreferenceServiceImpl,
    });
  }

  injectResourceProvider(injector: Injector) {
    injector.addProviders({
      token: DefaultResourceProvider,
      useClass: DefaultResourceProvider,
    });
    injector.addProviders({
      token: ResourceProvider,
      useFactory: () => {
        return (uri) => {
          return injector.get(DefaultResourceProvider).get(uri);
        };
      },
    });
    createContributionProvider(injector, ResourceResolverContribution);
    // 添加默认的内存资源处理contribution
    injector.addProviders(InMemoryResourceResolver);
  }
}
