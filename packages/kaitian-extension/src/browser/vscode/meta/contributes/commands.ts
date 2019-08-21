import { VSCodeContributePoint, Contributes, ExtensionService } from '../../../../common';
import { Injectable, Autowired } from '@ali/common-di';
import { CommandRegistry, CommandService, ILogger } from '@ali/ide-core-browser';
import { ExtHostAPIIdentifier } from '../../../../common/vscode';
// import { VSCodeExtensionService } from '../types';

export interface CommandFormat {

  command: string;

  title: string;

  category: string;

}

export type CommandsSchema = Array<CommandFormat>;

@Injectable()
@Contributes('commands')
export class CommandsContributionPoint extends VSCodeContributePoint<CommandsSchema> {

  @Autowired(CommandRegistry)
  commandRegistry: CommandRegistry;

  @Autowired(CommandService)
  commandService: CommandService;

  @Autowired(ExtensionService)
  extensionService: ExtensionService;

  @Autowired(ILogger)
  logger: ILogger;

  contribute() {
    this.json.forEach((command) => {
      this.addDispose(this.commandRegistry.registerCommand({
        category: command.category,
        label: command.title,
        id: command.command,
      }, {
        execute: async (...args) => {
          this.logger.log(command.command);
          // 获取扩展的 command 实例
          const proxy = await this.extensionService.getProxy(ExtHostAPIIdentifier.ExtHostCommands);
          // 实际执行的为在扩展进展中注册的处理函数
          return proxy.$executeContributedCommand(command.command, ...args);
        },
      }));
    });
  }

}
